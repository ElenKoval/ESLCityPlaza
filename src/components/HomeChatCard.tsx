"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const PRESENCE_CHANNEL = "plaza-presence";

type Access = "guest" | "pending" | "rejected" | "approved";

export function HomeChatCard({
  access,
  userId,
  displayName,
}: {
  access: Access;
  userId: string | null;
  displayName: string | null;
}) {
  const [online, setOnline] = useState(0);
  const canOpenChat = access === "approved";

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const key = userId ?? `guest-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ member?: boolean }>
      >;
      // Count only tracked members (approved users)
      let count = 0;
      for (const metas of Object.values(state)) {
        if (metas.some((m) => m.member)) count += 1;
      }
      setOnline(count);
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);

    void channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      if (canOpenChat && userId) {
        await channel.track({
          member: true,
          user_id: userId,
          name: displayName ?? "Member",
          at: Date.now(),
        });
      }
      sync();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access, canOpenChat, displayName, userId]);

  return (
    <aside className="home-chat panel">
      <div className="home-chat__live">
        <span className="home-chat__dot" aria-hidden="true" />
        <span>
          <strong>{online}</strong> online
        </span>
      </div>
      <h2 className="home-chat__title">Community chat</h2>
      <p className="home-chat__text">
        Say hello, practice English, and catch up with the plaza.
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
    </aside>
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
