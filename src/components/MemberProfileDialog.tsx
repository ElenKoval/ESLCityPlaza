"use client";

import { useEffect } from "react";
import { RoleBadge } from "@/components/RoleBadge";
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
>;

export function MemberProfileCard({
  profile,
  showEmail = false,
}: {
  profile: MemberPreview;
  showEmail?: boolean;
}) {
  const languages = (profile.languages ?? []).filter(Boolean);
  const interests = profile.interests ?? [];
  const hometown = profile.hometown?.trim() ?? "";
  const bio = profile.bio?.trim() ?? "";
  const extra =
    hometown || languages.length > 0 || interests.length > 0 || bio;

  return (
    <div className="member-card">
      <p className="member-card__name">
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
        <p className="sub">They have not shared extra details yet.</p>
      )}
    </div>
  );
}

export function ProfileDialog({
  profile,
  showEmail = false,
  onClose,
}: {
  profile: MemberPreview;
  showEmail?: boolean;
  onClose: () => void;
}) {
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
      </div>
    </div>
  );
}
