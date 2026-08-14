"use client";

import Link from "next/link";

type Access = "guest" | "pending" | "rejected" | "approved";

export function HomeChatCard({
  access,
}: {
  access: Access;
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
