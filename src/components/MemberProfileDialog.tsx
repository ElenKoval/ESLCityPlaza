"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RoleBadge } from "@/components/RoleBadge";
import { OTHER_INTEREST } from "@/lib/profile";
import { openDirectConversation } from "@/app/dm-actions";
import { chatInitial, chatInitialColor } from "@/lib/chat-presence";
import type { Profile } from "@/lib/types";

export type MemberPreview = Pick<
  Profile,
  | "id"
  | "display_name"
  | "role"
  | "hometown"
  | "languages"
  | "interests"
  | "bio"
  | "email"
  | "avatar_color"
>;

export function MemberProfileCard({
  profile,
  showEmail = false,
  self = false,
}: {
  profile: MemberPreview;
  showEmail?: boolean;
  self?: boolean;
}) {
  const languages = (profile.languages ?? []).filter(Boolean);
  const interests = (profile.interests ?? []).filter(
    (chip) => chip && chip !== OTHER_INTEREST,
  );
  const hometown = profile.hometown?.trim() ?? "";
  const bio = profile.bio?.trim() ?? "";
  const extra =
    hometown || languages.length > 0 || interests.length > 0 || bio;

  return (
    <div className="member-card">
      <p className="member-card__name">
        <span
          className="chat-avatar"
          style={{ background: chatInitialColor(profile.avatar_color) }}
          aria-hidden="true"
        >
          {chatInitial(profile.display_name)}
        </span>
        {profile.display_name} <RoleBadge role={profile.role} />
      </p>
      {showEmail && profile.email && (
        <p className="member-card__email">{profile.email}</p>
      )}
      {extra ? (
        <dl className="member-card__facts">
          {hometown ? (
            <>
              <dt>From</dt>
              <dd>{hometown}</dd>
            </>
          ) : null}
          {languages.length > 0 ? (
            <>
              <dt>Languages</dt>
              <dd>{languages.join(", ")}</dd>
            </>
          ) : null}
          {interests.length > 0 ? (
            <>
              <dt>Likes to talk about</dt>
              <dd>
                <span className="interest-chips">
                  {interests.map((chip) => (
                    <span key={chip} className="interest-chip is-on">
                      {chip}
                    </span>
                  ))}
                </span>
              </dd>
            </>
          ) : null}
          {bio ? (
            <>
              <dt>About</dt>
              <dd className="member-card__bio">{bio}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="sub">
          {self
            ? "You have not shared extra details yet."
            : "They have not shared extra details yet."}
        </p>
      )}
    </div>
  );
}

export function ProfileDialog({
  profile,
  showEmail = false,
  viewerId,
  onClose,
}: {
  profile: MemberPreview;
  showEmail?: boolean;
  viewerId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canMessage = Boolean(viewerId && viewerId !== profile.id);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="profile-dialog" role="presentation" onClick={onClose}>
      <div
        className="profile-dialog__panel panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-dialog__top">
          <h2 id="profile-dialog-title" className="profile-dialog__title">
            Profile
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <MemberProfileCard profile={profile} showEmail={showEmail} />
        {canMessage && (
          <div className="profile-dialog__message">
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await openDirectConversation(profile.id);
                  if (result?.error) {
                    setError(result.error);
                    return;
                  }
                  if (result?.conversationId) {
                    onClose();
                    router.push(`/messages/${result.conversationId}`);
                  }
                });
              }}
            >
              {pending ? "Opening…" : "Message"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
