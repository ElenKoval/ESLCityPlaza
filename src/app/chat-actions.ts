"use server";

import { createClient } from "@/lib/supabase/server";
import { chatReadsTableMissing } from "@/lib/chat-unread";

async function approvedChatUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: true as const };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, status, muted")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") return { error: true as const };
  return { supabase, userId: user.id, muted: Boolean(me.muted) };
}

export async function markChatRead() {
  const auth = await approvedChatUser();
  if ("error" in auth) return;
  const { error } = await auth.supabase.from("chat_reads").upsert(
    {
      user_id: auth.userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error && !chatReadsTableMissing(error.message)) {
    console.error("[chat-unread]", error.message);
  }
}

export async function getChatHasUnread(): Promise<{
  unread: boolean;
  fallback?: boolean;
}> {
  const auth = await approvedChatUser();
  if ("error" in auth) return { unread: false };
  if (auth.muted) return { unread: false };

  const { data: read, error: readError } = await auth.supabase
    .from("chat_reads")
    .select("last_read_at")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (readError && chatReadsTableMissing(readError.message)) {
    return { unread: false, fallback: true };
  }

  let lastRead = read?.last_read_at as string | undefined;
  if (!lastRead) {
    const now = new Date().toISOString();
    const { error } = await auth.supabase.from("chat_reads").upsert(
      {
        user_id: auth.userId,
        last_read_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error && chatReadsTableMissing(error.message)) {
      return { unread: false, fallback: true };
    }
    return { unread: false };
  }

  const { data: latest } = await auth.supabase
    .from("messages")
    .select("created_at")
    .neq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    unread: Boolean(latest?.created_at && latest.created_at > lastRead),
  };
}
