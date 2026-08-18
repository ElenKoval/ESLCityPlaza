import { createClient } from "@/lib/supabase/server";
import { avatarColumnMissing, normalizeAvatarColor } from "@/lib/avatar-color";
import { dmOtherId, dmTableMissing } from "@/lib/direct-messages";
import type {
  DirectConversationListItem,
  DirectConversationRow,
  DirectMessageRow,
  DirectThreadMessage,
  Role,
} from "@/lib/types";

export type DirectThread = {
  conversation: DirectConversationRow;
  otherId: string;
  otherName: string;
  otherRole: Role;
  otherAvatarColor?: string | null;
  blockedByMe: boolean;
  blockedEitherWay: boolean;
  messages: DirectThreadMessage[];
};

function uuidList(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (typeof row === "string") return [row];
    if (row && typeof row === "object") {
      const value = Object.values(row as Record<string, unknown>)[0];
      if (typeof value === "string") return [value];
    }
    return [];
  });
}

function setupOrNull(message: string) {
  if (dmTableMissing(message)) return true;
  console.error("[dm]", message);
  return false;
}

async function loadProfileBasics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (ids.length === 0) return [];
  const withColor = await supabase
    .from("profiles")
    .select("id, display_name, role, status, avatar_color")
    .in("id", ids);
  if (!withColor.error) return withColor.data ?? [];
  if (!avatarColumnMissing(withColor.error.message)) {
    console.error("[dm]", withColor.error.message);
    return [];
  }
  const fallback = await supabase
    .from("profiles")
    .select("id, display_name, role, status")
    .in("id", ids);
  return fallback.data ?? [];
}

export async function persistDirectConversationRead(
  userId: string,
  conversationId: string,
) {
  if (!userId || !conversationId) return;
  const supabase = await createClient();
  const { error } = await supabase.from("direct_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  if (error && !dmTableMissing(error.message)) {
    console.error("[dm]", error.message);
  }
}

export async function loadDirectConversationList(
  userId: string,
): Promise<{ items: DirectConversationListItem[]; setupNeeded: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("direct_conversations")
    .select(
      "id, user_low, user_high, created_by, created_at, last_message_at, last_sender_id, last_preview",
    )
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    return { items: [], setupNeeded: setupOrNull(error.message) };
  }

  const rows = ((data ?? []) as DirectConversationRow[]).filter(
    (row) => row.last_message_at || row.created_by === userId,
  );
  if (rows.length === 0) return { items: [], setupNeeded: false };

  const otherIds = rows.map((row) => dmOtherId(userId, row.user_low, row.user_high));
  const convIds = rows.map((row) => row.id);

  const [{ data: peopleRows }, { data: reads }, { data: myBlocks }, { data: blockedIds }] =
    await Promise.all([
      loadProfileBasics(supabase, otherIds).then((data) => ({ data })),
      supabase
        .from("direct_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", userId)
        .in("conversation_id", convIds),
      supabase
        .from("direct_blocks")
        .select("blocked_id")
        .eq("blocker_id", userId)
        .in("blocked_id", otherIds),
      supabase.rpc("dm_blocked_conversation_ids"),
    ]);
  const people = peopleRows;

  const nameById = new Map(
    (people ?? []).map((p) => [
      p.id,
      {
        name: p.display_name as string,
        role: p.role as Role,
        status: p.status as string,
        avatarColor: normalizeAvatarColor(
          (p as { avatar_color?: string | null }).avatar_color,
        ),
      },
    ]),
  );
  const readByConv = new Map(
    (reads ?? []).map((r) => [r.conversation_id as string, r.last_read_at as string]),
  );
  const blockedByMe = new Set((myBlocks ?? []).map((r) => r.blocked_id as string));
  const blockedEither = new Set(uuidList(blockedIds));

  const items: DirectConversationListItem[] = rows.map((row) => {
    const otherId = dmOtherId(userId, row.user_low, row.user_high);
    const person = nameById.get(otherId);
    const lastRead = readByConv.get(row.id);
    const fromOther = Boolean(row.last_sender_id && row.last_sender_id !== userId);
    const unread = Boolean(
      row.last_message_at &&
        fromOther &&
        (!lastRead || new Date(row.last_message_at) > new Date(lastRead)),
    );
    return {
      id: row.id,
      otherId,
      otherName: person?.name ?? "Member",
      otherRole: person?.role ?? "student",
      otherAvatarColor: person?.avatarColor,
      lastPreview: row.last_preview || "",
      lastMessageAt: row.last_message_at,
      unread,
      blockedByMe: blockedByMe.has(otherId),
      blockedEitherWay: blockedEither.has(row.id),
    };
  });

  items.sort((a, b) => {
    const at = a.lastMessageAt || "";
    const bt = b.lastMessageAt || "";
    return bt.localeCompare(at);
  });

  return { items, setupNeeded: false };
}

export async function loadDirectThread(
  conversationId: string,
  userId: string,
): Promise<{ thread: DirectThread | null; setupNeeded: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: conv, error } = await supabase
    .from("direct_conversations")
    .select(
      "id, user_low, user_high, created_by, created_at, last_message_at, last_sender_id, last_preview",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    return { thread: null, setupNeeded: setupOrNull(error.message) };
  }
  if (!conv) return { thread: null, setupNeeded: false, error: "Conversation not found" };

  const row = conv as DirectConversationRow;
  if (row.user_low !== userId && row.user_high !== userId) {
    return { thread: null, setupNeeded: false, error: "Conversation not found" };
  }

  if (!row.last_message_at && row.created_by !== userId) {
    return { thread: null, setupNeeded: false, error: "Conversation not found" };
  }

  const otherId = dmOtherId(userId, row.user_low, row.user_high);
  const [{ data: personRows }, { data: myBlock }, { data: pairBlocked }, { data: messages }] =
    await Promise.all([
      loadProfileBasics(supabase, [otherId]).then((data) => ({ data })),
      supabase
        .from("direct_blocks")
        .select("blocked_id")
        .eq("blocker_id", userId)
        .eq("blocked_id", otherId)
        .maybeSingle(),
      supabase.rpc("dm_conversation_blocked", { conv_id: conversationId }),
      supabase
        .from("direct_messages")
        .select("id, conversation_id, sender_id, body, created_at, image_path, image_width, image_height")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
  const person = personRows[0];

  const blockedByMe = Boolean(myBlock);
  const blockedEitherWay = Boolean(pairBlocked) || blockedByMe;

  return {
    thread: {
      conversation: row,
      otherId,
      otherName: person?.display_name ?? "Member",
      otherRole: (person?.role as Role) ?? "student",
      otherAvatarColor: normalizeAvatarColor(
        (person as { avatar_color?: string | null } | undefined)?.avatar_color,
      ),
      blockedByMe,
      blockedEitherWay,
      messages: ((messages ?? []) as DirectMessageRow[]).map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        image_path: m.image_path,
        image_width: m.image_width,
        image_height: m.image_height,
      })),
    },
    setupNeeded: false,
  };
}

export async function countUnreadDirectConversations(userId: string) {
  const { items, setupNeeded } = await loadDirectConversationList(userId);
  if (setupNeeded) return 0;
  return items.filter((item) => item.unread).length;
}

