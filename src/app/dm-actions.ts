"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CHAT_IMAGE_MAX_OUT_BYTES,
} from "@/lib/chat-image";
import {
  DM_BLOCKED_SEND,
  DM_BODY_MAX,
  DM_IMAGE_BUCKET,
  DM_IMAGE_PATH_RE,
  DM_IMAGE_SIGNED_TTL_SEC,
  DM_SETUP_MESSAGE,
  dmSortedPair,
  dmTableMissing,
} from "@/lib/direct-messages";
import type { DirectThreadMessage, Role } from "@/lib/types";

export type DmActionState = {
  error?: string;
  success?: string;
  conversationId?: string;
  message?: DirectThreadMessage;
} | null;

function dmError(message: string) {
  if (dmTableMissing(message)) return DM_SETUP_MESSAGE;
  return message;
}

async function requireApprovedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" as const };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") {
    return { error: "Please log in" as const };
  }
  return { supabase, userId: user.id };
}

function looksLikeImage(bytes: Uint8Array, mime: string) {
  if (bytes.length < 12) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const webp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (mime === "image/jpeg") return jpeg;
  if (mime === "image/png") return png;
  if (mime === "image/webp") return webp;
  return jpeg || png || webp;
}

async function pairIsBlocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  a: string,
  b: string,
) {
  const { data, error } = await supabase.rpc("dm_pair_blocked", { a, b });
  if (error) return false;
  return Boolean(data);
}

export async function openDirectConversation(
  otherUserId: string,
): Promise<DmActionState> {
  if (!otherUserId) return { error: "Missing member" };
  const auth = await requireApprovedUser();
  if ("error" in auth) return auth;
  const { supabase, userId } = auth;
  if (otherUserId === userId) {
    return { error: "You cannot message yourself" };
  }

  const { data: other } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", otherUserId)
    .maybeSingle();
  if (!other || other.status !== "approved") {
    return { error: "That member is not available" };
  }

  const [userLow, userHigh] = dmSortedPair(userId, otherUserId);
  const { data: existing, error: findError } = await supabase
    .from("direct_conversations")
    .select("id")
    .eq("user_low", userLow)
    .eq("user_high", userHigh)
    .maybeSingle();
  if (findError) return { error: dmError(findError.message) };
  if (existing?.id) {
    revalidatePath("/messages");
    revalidatePath(`/messages/${existing.id}`);
    return { success: "opened", conversationId: existing.id };
  }

  const { data: created, error } = await supabase
    .from("direct_conversations")
    .insert({
      user_low: userLow,
      user_high: userHigh,
      created_by: userId,
      last_preview: "",
    })
    .select("id")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: again } = await supabase
        .from("direct_conversations")
        .select("id")
        .eq("user_low", userLow)
        .eq("user_high", userHigh)
        .maybeSingle();
      if (again?.id) return { success: "opened", conversationId: again.id };
    }
    return { error: dmError(error.message) };
  }
  revalidatePath("/messages");
  revalidatePath(`/messages/${created.id}`);
  return { success: "opened", conversationId: created.id };
}

export type DmMemberOption = {
  id: string;
  display_name: string;
  role: Role;
};

export async function listApprovedMembersForDm(): Promise<DmMemberOption[]> {
  const auth = await requireApprovedUser();
  if ("error" in auth) return [];
  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("status", "approved")
    .neq("id", userId)
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    display_name: row.display_name as string,
    role: row.role as Role,
  }));
}

export async function markDirectConversationRead(conversationId: string) {
  if (!conversationId) return;
  const auth = await requireApprovedUser();
  if ("error" in auth) return;
  const { supabase, userId } = auth;
  await supabase.from("direct_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
}

export async function getDirectUnreadCount(): Promise<number> {
  const auth = await requireApprovedUser();
  if ("error" in auth) return 0;
  const { loadDirectConversationList } = await import("@/lib/load-direct-messages");
  const { items } = await loadDirectConversationList(auth.userId);
  return items.filter((item) => item.unread).length;
}

export async function signDirectImagePaths(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((path) => DM_IMAGE_PATH_RE.test(path)))];
  if (unique.length === 0) return {};
  const auth = await requireApprovedUser();
  if ("error" in auth) return {};
  const { supabase } = auth;
  const { data, error } = await supabase.storage
    .from(DM_IMAGE_BUCKET)
    .createSignedUrls(unique, DM_IMAGE_SIGNED_TTL_SEC);
  if (error || !data) return {};
  const urls: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  return urls;
}

export async function sendDirectMessage(
  _prev: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const conversationId = String(formData.get("conversation_id") || "");
  const body = String(formData.get("body") || "").trim();
  const image = formData.get("image");
  const hasImage = image instanceof File && image.size > 0;
  const width = Number(formData.get("image_width") || 0);
  const height = Number(formData.get("image_height") || 0);

  if (!conversationId) return { error: "Missing conversation" };
  if (!body && !hasImage) return { error: "Write a message first" };
  if (body.length > DM_BODY_MAX) return { error: "Message is too long" };

  const auth = await requireApprovedUser();
  if ("error" in auth) return auth;
  const { supabase, userId } = auth;

  const { data: conv, error: convError } = await supabase
    .from("direct_conversations")
    .select("id, user_low, user_high")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError) return { error: dmError(convError.message) };
  if (!conv || (conv.user_low !== userId && conv.user_high !== userId)) {
    return { error: "Conversation not found" };
  }

  if (await pairIsBlocked(supabase, conv.user_low, conv.user_high)) {
    return { error: DM_BLOCKED_SEND };
  }

  let imagePath: string | null = null;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;

  if (hasImage && image instanceof File) {
    if (image.size > CHAT_IMAGE_MAX_OUT_BYTES) {
      return { error: "That photo is too large to send." };
    }
    const mime = image.type;
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
      return { error: "Please choose a JPEG, PNG, or WebP photo." };
    }
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!looksLikeImage(bytes, mime)) {
      return { error: "That file does not look like a photo." };
    }
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      width > 4000 ||
      height > 4000
    ) {
      return { error: "That photo could not be prepared." };
    }
    const ext = mime === "image/webp" ? "webp" : "jpg";
    imagePath = `${conversationId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(DM_IMAGE_BUCKET)
      .upload(imagePath, image, {
        contentType: mime,
        upsert: false,
      });
    if (uploadError) {
      if (await pairIsBlocked(supabase, conv.user_low, conv.user_high)) {
        return { error: DM_BLOCKED_SEND };
      }
      return { error: dmError(uploadError.message) };
    }
    imageWidth = Math.round(width);
    imageHeight = Math.round(height);
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      body,
      image_path: imagePath,
      image_width: imageWidth,
      image_height: imageHeight,
    })
    .select("id, sender_id, body, created_at, image_path, image_width, image_height")
    .single();

  if (error) {
    if (imagePath) {
      await supabase.storage.from(DM_IMAGE_BUCKET).remove([imagePath]);
    }
    if (await pairIsBlocked(supabase, conv.user_low, conv.user_high)) {
      return { error: DM_BLOCKED_SEND };
    }
    return { error: dmError(error.message) };
  }

  await supabase.from("direct_reads").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );

  let imageUrl: string | null = null;
  if (data.image_path) {
    const signed = await signDirectImagePaths([data.image_path]);
    imageUrl = signed[data.image_path] ?? null;
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  return {
    success: "sent",
    conversationId,
    message: {
      id: data.id,
      sender_id: data.sender_id,
      body: data.body,
      created_at: data.created_at,
      image_path: data.image_path,
      image_width: data.image_width,
      image_height: data.image_height,
      imageUrl,
    },
  };
}

export async function deleteDirectMessage(
  _prev: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const id = String(formData.get("message_id") || "");
  if (!id) return { error: "Missing message" };
  const auth = await requireApprovedUser();
  if ("error" in auth) return auth;
  const { supabase, userId } = auth;

  const { data: row } = await supabase
    .from("direct_messages")
    .select("id, sender_id, conversation_id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Message not found" };
  if (row.sender_id !== userId) {
    return { error: "You can only delete your own message" };
  }

  const imagePath =
    typeof row.image_path === "string" && DM_IMAGE_PATH_RE.test(row.image_path)
      ? row.image_path
      : null;
  if (imagePath) {
    const { error: storageError } = await supabase.storage
      .from(DM_IMAGE_BUCKET)
      .remove([imagePath]);
    if (storageError && !/not found|does not exist/i.test(storageError.message)) {
      return { error: "Could not delete that photo. Please try again." };
    }
  }

  const { error } = await supabase.from("direct_messages").delete().eq("id", id);
  if (error) return { error: dmError(error.message) };
  revalidatePath("/messages");
  revalidatePath(`/messages/${row.conversation_id}`);
  return { success: "deleted" };
}

export async function blockDirectMember(otherUserId: string): Promise<DmActionState> {
  const auth = await requireApprovedUser();
  if ("error" in auth) return auth;
  const { supabase, userId } = auth;
  if (!otherUserId || otherUserId === userId) {
    return { error: "You cannot block this person" };
  }
  const { error } = await supabase.from("direct_blocks").upsert(
    { blocker_id: userId, blocked_id: otherUserId },
    { onConflict: "blocker_id,blocked_id" },
  );
  if (error) return { error: dmError(error.message) };
  revalidatePath("/messages");
  revalidatePath("/messages", "layout");
  return { success: "blocked" };
}

export async function unblockDirectMember(otherUserId: string): Promise<DmActionState> {
  const auth = await requireApprovedUser();
  if ("error" in auth) return auth;
  const { supabase, userId } = auth;
  const { error } = await supabase
    .from("direct_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", otherUserId);
  if (error) return { error: dmError(error.message) };
  revalidatePath("/messages");
  revalidatePath("/messages", "layout");
  return { success: "unblocked" };
}
