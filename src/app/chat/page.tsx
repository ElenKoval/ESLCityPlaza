import type { Metadata } from "next";
import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "@/components/ChatRoom";
import { toChatMessages } from "@/lib/chat";
import { useLocalDemo } from "@/lib/demo";
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
    const { data } = await supabase
      .from("messages")
      .select("id, user_id, body, created_at, is_announcement, profiles(display_name, role)")
      .order("created_at", { ascending: true })
      .limit(200);

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
        profiles: profileRow,
      };
    });
  }

  return (
    <div className="chat-page">
      <ChatRoom
        initialMessages={toChatMessages(rows)}
        userId={userId}
        displayName={profile.display_name}
        role={profile.role}
      />
    </div>
  );
}
