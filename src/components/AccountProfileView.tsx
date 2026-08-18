"use client";

import { useState } from "react";
import { MemberProfileCard } from "@/components/MemberProfileDialog";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import type { Profile } from "@/lib/types";

export function AccountProfileView({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="panel">
        <MemberProfileCard profile={profile} self />
        {!editing && (
          <div className="profile-page__card-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div>
          <h2 className="announce-form__heading">Edit profile</h2>
          <ProfileSetupForm
            profile={profile}
            mode="edit"
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </>
  );
}
