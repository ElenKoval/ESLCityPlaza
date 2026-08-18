"use client";

import { useEffect, useId, useRef } from "react";
import type { ChatPresenceMeta } from "@/lib/chat-presence";
import {
  chatInitial,
  chatInitialColor,
  displayChatName,
  showOnlineRoleBadge,
} from "@/lib/chat-presence";
import { RoleBadge } from "@/components/RoleBadge";

function OnlineUserRow({ user }: { user: ChatPresenceMeta }) {
  const name = displayChatName(user.display_name);
  return (
    <li className="chat-online__user">
      <span
        className="chat-online__avatar"
        style={{ background: chatInitialColor(name) }}
        aria-hidden="true"
      >
        {chatInitial(name)}
      </span>
      <span className="chat-online__dot" aria-hidden="true" />
      <span className="chat-online__name">{name}</span>
      {showOnlineRoleBadge(user.role) && (
        <RoleBadge role={user.role} />
      )}
    </li>
  );
}

function OnlineHeading({
  count,
  ready,
}: {
  count: number;
  ready: boolean;
}) {
  return (
    <p className="chat-online__heading">
      Online now
      {ready && <> · {count}</>}
    </p>
  );
}

function OnlineUserList({
  users,
  ready,
}: {
  users: ChatPresenceMeta[];
  ready: boolean;
}) {
  if (!ready) return null;
  if (users.length === 0) return null;

  return (
    <ul className="chat-online__list">
      {users.map((user) => (
        <OnlineUserRow key={user.user_id} user={user} />
      ))}
    </ul>
  );
}

export function ChatOnlineSidebar({
  users,
  ready,
}: {
  users: ChatPresenceMeta[];
  ready: boolean;
}) {
  return (
    <aside className="chat-online chat-online--sidebar" aria-label="Online now">
      <OnlineHeading count={users.length} ready={ready} />
      <OnlineUserList users={users} ready={ready} />
    </aside>
  );
}

export function ChatOnlineMobileBar({
  users,
  ready,
  onOpen,
}: {
  users: ChatPresenceMeta[];
  ready: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="chat-online-mobile">
      <button
        type="button"
        className="chat-online-mobile__trigger"
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <OnlineHeading count={users.length} ready={ready} />
      </button>
    </div>
  );
}

export function ChatOnlineSheet({
  users,
  ready,
  open,
  onClose,
}: {
  users: ChatPresenceMeta[];
  ready: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="chat-online-sheet" role="presentation">
      <button
        type="button"
        className="chat-online-sheet__backdrop"
        aria-label="Close online list"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="chat-online-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="chat-online-sheet__head">
          <p id={titleId} className="chat-online__heading">
            Online now
            {ready && <> · {users.length}</>}
          </p>
          <button
            type="button"
            className="chat-online-sheet__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {ready && users.length > 0 ? (
          <ul className="chat-online__list chat-online__list--sheet">
            {users.map((user) => (
              <OnlineUserRow key={user.user_id} user={user} />
            ))}
          </ul>
        ) : (
          <p className="chat-online-sheet__empty">
            {ready ? "No one else is here right now." : "Loading…"}
          </p>
        )}
      </div>
    </div>
  );
}
