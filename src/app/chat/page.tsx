import type { Metadata } from "next";
import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/ChatRoom";
import { toChatMessages } from "@/lib/chat";
import { useLocalDemo } from "@/lib/demo";
import { signChatImagePaths } from "@/app/actions";
import type { MessageRow, Role } from "@/lib/types";

export const metadata: Metadata = {
  title: "Community chat — ESL on the Plaza",
};

export default async function ChatPage() {
  const { userId, profile } = await requireApproved();

  let rows: Array<
    MessageRow & { profiles?: { display_name: string; role: Role } | null }
  > = [];

  if (!useLocalDemo()) {
    const supabase = await createClient();
    const withPhotos = await supabase
      .from("messages")
      .select("id, user_id, body, created_at, is_announcement, image_path, image_width, image_height, profiles(display_name, role)")
      .order("created_at", { ascending: true })
      .limit(200);
    const fallback = withPhotos.error
      ? await supabase
          .from("messages")
          .select("id, user_id, body, created_at, is_announcement, profiles(display_name, role)")
          .order("created_at", { ascending: true })
          .limit(200)
      : withPhotos;
    const data = fallback.data;

    rows = (data ?? []).map((row) => {
      const profiles = row.profiles as unknown as
        | { display_name: string; role: Role }
        | { display_name: string; role: Role }[]
        | null;
      const profileRow = Array.isArray(profiles) ? profiles[0] : profiles;
      return {
        id: row.id,
        user_id: row.user_id,
        body: row.body,
        created_at: row.created_at,
        is_announcement: Boolean(
          (row as { is_announcement?: boolean }).is_announcement,
        ),
        image_path: (row as { image_path?: string | null }).image_path ?? null,
        image_width: (row as { image_width?: number | null }).image_width ?? null,
        image_height: (row as { image_height?: number | null }).image_height ?? null,
        profiles: profileRow,
      };
    });
  }

  const imageUrls = await signChatImagePaths(
    rows
      .map((row) => row.image_path)
      .filter((path): path is string => Boolean(path)),
  );

  return (
    <div className="chat-page">
      <ChatRoom
        initialMessages={toChatMessages(rows, imageUrls)}
        userId={userId}
        displayName={profile.display_name}
        role={profile.role}
      />
    </div>
  );
}
