"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMemberManually,
  deleteMember,
  reviewApplication,
  setMemberMuted,
  setMemberRole,
  setMemberSuspended,
  type ActionState,
} from "@/app/actions";
import { RoleBadge } from "@/components/RoleBadge";
import { ProfileDialog } from "@/components/MemberProfileDialog";
import {
  assignableRoles,
  canDeleteMember,
  canManageRoles,
  canModerateAccount,
  canModerateMembers,
  canSeeModerationStatus,
  ROLE_LABELS,
} from "@/lib/roles";
import type { Profile } from "@/lib/types";

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

function AddMemberForm({ viewer }: { viewer: Profile }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addMemberManually,
    null,
  );
  useRefreshOnSuccess(state);
  const pickRole = canManageRoles(viewer.role);

  return (
    <form action={action} className="panel form-grid">
      <h3 className="announce-form__heading">Add member manually</h3>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Creates an approved account right away — no Apply form and no email
        confirmation. You will get a password to give them. They can keep using
        it; they do not have to change it.
      </p>
      <label>
        Name
        <input name="display_name" required maxLength={60} autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {pickRole ? (
        <label>
          Role
          <select name="role" defaultValue="student">
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="role" value="student" />
      )}
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
      {state?.tempPassword && (
        <p className="temp-password">
          <span>Password</span>
          <strong>{state.tempPassword}</strong>
        </p>
      )}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add member"}
      </button>
    </form>
  );
}

function ReviewForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    reviewApplication,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="user_id" value={profile.id} />
      <div className="class-actions">
        <button
          className="btn-primary"
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
        >
          {pending ? "Saving…" : "Approve"}
        </button>
        <button
          className="btn-danger"
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
        >
          Decline
        </button>
      </div>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function DeleteForm({ userId, label }: { userId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    deleteMember,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete account “${label}”? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button className="btn-danger" type="submit" disabled={pending}>
        {pending ? "Deleting…" : "Delete account"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function MuteForm({ profile }: { profile: Profile }) {
  const muted = Boolean(profile.muted);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setMemberMuted,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (muted) {
          if (!confirm(`Allow ${profile.display_name} to post in Community Chat again?`)) {
            e.preventDefault();
          }
          return;
        }
        if (
          !confirm(
            `Mute ${profile.display_name} in Community Chat?\n\nThis person will still be able to use the website and read the chat, but they won't be able to post new messages.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={profile.id} />
      <input type="hidden" name="muted" value={muted ? "false" : "true"} />
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : muted ? "Unmute" : "Mute"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function SuspendForm({ profile }: { profile: Profile }) {
  const suspended = profile.status === "suspended";
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setMemberSuspended,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (suspended) {
          if (!confirm(`Restore access for ${profile.display_name}?`)) {
            e.preventDefault();
          }
          return;
        }
        if (
          !confirm(
            `Suspend ${profile.display_name}?\n\nThis person will temporarily lose access to the members-only website.\nTheir account and data will not be deleted.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={profile.id} />
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : suspended ? "Restore" : "Suspend"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function RoleForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setMemberRole,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="user_id" value={profile.id} />
      <label>
        Role
        <select name="role" defaultValue={profile.role}>
          {assignableRoles().map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save role"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function ModerationFlags({ profile, viewer }: { profile: Profile; viewer: Profile }) {
  if (!canSeeModerationStatus(viewer.role)) return null;
  return (
    <>
      {profile.muted && <span className="moderation-flag moderation-flag--muted">Muted</span>}
      {profile.status === "suspended" && (
        <span className="moderation-flag moderation-flag--suspended">Suspended</span>
      )}
    </>
  );
}

export function TechPanel({
  applications,
  members,
  viewer,
}: {
  applications: Profile[];
  members: Profile[];
  viewer: Profile;
}) {
  const [viewing, setViewing] = useState<Profile | null>(null);
  const showEmail = viewer.role === "admin" || viewer.role === "tech";

  return (
    <div className="stack">
      {viewing && (
        <ProfileDialog
          profile={viewing}
          showEmail={showEmail}
          onClose={() => setViewing(null)}
        />
      )}
      <AddMemberForm viewer={viewer} />
      <section className="panel stack">
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
          Pending applications
        </h3>
        <p className="lead" style={{ margin: 0 }}>
          New people apply on the site. After they confirm their email, you
          see their name, email, and date here. They stay locked out of chat
          and lessons until you approve them. Approve always creates a student.
        </p>
        {applications.length === 0 ? (
          <p style={{ margin: 0 }}>No new applications.</p>
        ) : (
          <div className="table-like">
            {applications.map((app) => (
              <div key={app.id} className="app-row">
                <div>
                  <strong>{app.display_name}</strong>
                  {app.email && (
                    <div className="class-meta">
                      <span>{app.email}</span>
                    </div>
                  )}
                  {app.hometown?.trim() && (
                    <div className="class-meta">
                      From {app.hometown.trim()}
                    </div>
                  )}
                  {app.heard_from?.trim() && (
                    <div className="class-meta">
                      Heard about us: {app.heard_from.trim()}
                    </div>
                  )}
                </div>
                <div className="class-meta">
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(app.created_at))}
                  </span>
                </div>
                <div className="stack">
                  <ReviewForm profile={app} />
                  {canDeleteMember(viewer, app) && (
                    <DeleteForm userId={app.id} label={app.display_name} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
          Members
        </h3>
        <p className="lead" style={{ margin: 0 }}>
          Approved people in the group. Suspended accounts stay in the list
          until restored.
        </p>
        <div className="table-like">
          {members.map((m) => (
            <div key={m.id} className="app-row">
              <div>
                <strong>
                  <button
                    type="button"
                    className="profile-link"
                    onClick={() => setViewing(m)}
                  >
                    {m.display_name}
                  </button>
                </strong>
                <div className="class-meta">
                  <RoleBadge role={m.role} />
                  {m.status !== "approved" && m.status !== "suspended" && (
                    <span>{m.status}</span>
                  )}
                  <ModerationFlags profile={m} viewer={viewer} />
                </div>
              </div>
              <div className="class-meta">
                <span>
                  Joined{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                  }).format(new Date(m.created_at))}
                </span>
              </div>
              <div className="stack">
                {m.id === viewer.id ? (
                  <span className="class-meta">You</span>
                ) : m.role === "tech" ? (
                  <span className="class-meta">TECH</span>
                ) : (
                  <>
                    {canModerateMembers(viewer.role) &&
                      canModerateAccount(viewer.role, m.role) && (
                        <>
                          <MuteForm profile={m} />
                          <SuspendForm profile={m} />
                        </>
                      )}
                    {canManageRoles(viewer.role) && (
                      <RoleForm profile={m} />
                    )}
                    {canDeleteMember(viewer, m) && (
                      <DeleteForm userId={m.id} label={m.display_name} />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
