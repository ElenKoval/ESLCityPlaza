"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listApprovedMembersForDm,
  openDirectConversation,
  type DmMemberOption,
} from "@/app/dm-actions";
import {
  chatInitial,
  chatInitialColor,
  showOnlineRoleBadge,
} from "@/lib/chat-presence";
import { RoleBadge } from "@/components/RoleBadge";

export function DmMemberPicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<DmMemberOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listApprovedMembersForDm().then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = members ?? [];
    if (!needle) return rows;
    return rows.filter((row) =>
      row.display_name.toLowerCase().includes(needle),
    );
  }, [members, query]);

  function choose(member: DmMemberOption) {
    if (pending) return;
    startTransition(async () => {
      const result = await openDirectConversation(member.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (result?.conversationId) {
        onClose();
        router.push(`/messages/${result.conversationId}`);
      }
    });
  }

  return (
    <div className="profile-dialog" role="presentation" onClick={onClose}>
      <div
        className="profile-dialog__panel panel dm-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-dialog__top">
          <h2 id="dm-picker-title" className="profile-dialog__title">
            New message
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <label className="dm-picker__search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            autoComplete="off"
            aria-label="Search people"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <ul className="dm-picker__list">
          {members === null && <li className="dm-picker__note">Loading…</li>}
          {members && visible.length === 0 && (
            <li className="dm-picker__note">
              {query.trim()
                ? "No members match that name."
                : "No members to message yet."}
            </li>
          )}
          {visible.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="dm-picker__person"
                disabled={pending}
                onClick={() => choose(member)}
              >
                <span
                  className="chat-avatar"
                  style={{ background: chatInitialColor(member.avatar_color) }}
                  aria-hidden="true"
                >
                  {chatInitial(member.display_name)}
                </span>
                <span className="dm-picker__name">{member.display_name}</span>
                {showOnlineRoleBadge(member.role) && (
                  <RoleBadge role={member.role} />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
