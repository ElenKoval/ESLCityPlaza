"use client";

import { useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const PRESENCE_CHANNEL = "plaza-presence";

type Access = "guest" | "pending" | "rejected" | "approved";

export function HomeChatCard({
  access,
}: {
  access: Access;
  userId: string | null;
  displayName: string | null;
}) {
  const canOpenChat = access === "approved";

  return (
    <div className="home-chat panel">
      <h2 className="home-chat__title">Community chat</h2>
      <p className="home-chat__text">
        Talk with the group, ask questions, and share news.
      </p>

      {canOpenChat ? (
        <Link href="/chat" className="btn-primary home-chat__cta">
          Open chat
        </Link>
      ) : access === "pending" ? (
        <p className="home-chat__lock">
          Chat unlocks after your application is approved.
        </p>
      ) : access === "rejected" ? (
        <p className="home-chat__lock">Chat is not available for this account.</p>
      ) : (
        <p className="home-chat__lock">
          Members only. <Link href="/login">Log in</Link> or{" "}
          <Link href="/register">apply to join</Link>.
        </p>
      )}
    </div>
  );
}

/** Keep presence while an approved member is in the chat page */
export function ChatPresence({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });

    void channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        member: true,
        user_id: userId,
        name: displayName,
        at: Date.now(),
      });
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [displayName, userId]);

  return null;
}
