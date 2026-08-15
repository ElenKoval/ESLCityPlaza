"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMember,
  reviewApplication,
  type ActionState,
} from "@/app/actions";
import { RoleBadge } from "@/components/RoleBadge";
import { canDeleteMember } from "@/lib/roles";
import type { Profile } from "@/lib/types";

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
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
      <label>
        Final role
        <select name="role" defaultValue={profile.requested_role || "student"}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
      </label>
      <div className="class-actions">
        <button
          className="btn-primary"
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
        >
          Approve
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

export function TechPanel({
  applications,
  members,
  viewer,
}: {
  applications: Profile[];
  members: Profile[];
  viewer: Profile;
}) {
  return (
    <div className="stack">
      <section className="panel stack">
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
          Pending applications
        </h3>
        <p className="lead" style={{ margin: 0 }}>
          New people apply on the site. They stay locked out of chat and
          lessons until you approve them here.
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
                  {app.requested_role && (
                    <div className="class-meta">
                      Applied as <RoleBadge role={app.requested_role} />
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
          Remove spam or unwanted accounts. Rejected users also cannot use chat
          or lessons.
        </p>
        <div className="table-like">
          {members.map((m) => (
            <div key={m.id} className="app-row">
              <div>
                <strong>{m.display_name}</strong>
                <div className="class-meta">
                  <RoleBadge role={m.role} />
                  <span>{m.status}</span>
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
              {canDeleteMember(viewer, m) ? (
                <DeleteForm userId={m.id} label={m.display_name} />
              ) : m.role === "tech" ? (
                <span className="class-meta">TECH</span>
              ) : m.id === viewer.id ? (
                <span className="class-meta">You</span>
              ) : (
                <span className="class-meta">{m.status}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
