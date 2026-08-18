"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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

function useRefreshOnSuccess(state: ActionState, onSuccess?: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!state?.success) return;
    onSuccess?.();
    router.refresh();
  }, [state, router, onSuccess]);
}

function ManageDialog({
  title,
  onClose,
  closeOnBackdrop = true,
  children,
}: {
  title: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnBackdrop) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, closeOnBackdrop]);

  return (
    <div
      className="profile-dialog"
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className="profile-dialog__panel panel manage-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-dialog__top">
          <h2 id="manage-dialog-title" className="profile-dialog__title">
            {title}
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddMemberDialog({
  viewer,
  onClose,
}: {
  viewer: Profile;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addMemberManually,
    null,
  );
  const [password, setPassword] = useState<string | null>(null);
  const pickRole = canManageRoles(viewer.role);
  const done = Boolean(password || state?.success);

  useEffect(() => {
    if (!state?.success) return;
    if (state.tempPassword) setPassword(state.tempPassword);
    router.refresh();
  }, [state, router]);

  return (
    <ManageDialog
      title={done ? "Member added" : "Add member"}
      onClose={onClose}
      closeOnBackdrop={!done}
    >
      {done ? (
        <div className="form-grid">
          {state?.success && <p className="success">{state.success}</p>}
          {password && (
            <p className="temp-password">
              <span>Password</span>
              <strong>{password}</strong>
            </p>
          )}
          <p className="field-hint" style={{ marginTop: 0 }}>
            Copy this password now. You will not see it again after you close
            this window.
          </p>
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form action={action} className="form-grid">
          <p className="field-hint" style={{ marginTop: 0 }}>
            Creates an approved account right away — no Apply form and no email
            confirmation. You will get a password to give them. They can keep
            using it; they do not have to change it.
          </p>
          <label>
            Name
            <input
              name="display_name"
              required
              maxLength={60}
              autoComplete="name"
            />
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
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : (
            <input type="hidden" name="role" value="student" />
          )}
          {state?.error && <p className="error">{state.error}</p>}
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add member"}
          </button>
        </form>
      )}
    </ManageDialog>
  );
}

function ReviewForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    reviewApplication,
    null,
  );
  useRefreshOnSuccess(state);

  return (
    <form action={action} className="manage-app__actions">
      <input type="hidden" name="user_id" value={profile.id} />
      <button
        className="btn-primary manage-approve"
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
      >
        {pending ? "Saving…" : "Approve"}
      </button>
      <button
        className="manage-text-btn"
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
      >
        Decline
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

function RoleDialog({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setMemberRole,
    null,
  );
  useRefreshOnSuccess(state, onClose);

  return (
    <ManageDialog title={`Change role for ${profile.display_name}`} onClose={onClose}>
      <form action={action} className="form-grid">
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
        {state?.error && <p className="error">{state.error}</p>}
        <div className="manage-dialog__actions">
          <button type="button" className="manage-text-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary manage-approve" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ManageDialog>
  );
}

function MemberMenu({
  member,
  viewer,
  onView,
  onChangeRole,
}: {
  member: Profile;
  viewer: Profile;
  onView: () => void;
  onChangeRole: () => void;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const muted = Boolean(member.muted);
  const suspended = member.status === "suspended";
  const canModerate =
    canModerateMembers(viewer.role) &&
    canModerateAccount(viewer.role, member.role);
  const canRole = canManageRoles(viewer.role) && member.role !== "tech";
  const canDelete = canDeleteMember(viewer, member);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(
    confirmText: string,
    action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
    fields: Record<string, string>,
  ) {
    if (!confirm(confirmText)) return;
    setOpen(false);
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    startTransition(async () => {
      const result = await action(null, formData);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="manage-menu" ref={wrapRef}>
      <button
        type="button"
        className="manage-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${member.display_name}`}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
      >
        •••
      </button>
      {open && (
        <div className="manage-menu__list" role="menu">
          <button
            type="button"
            className="manage-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onView();
            }}
          >
            View profile
          </button>
          {canModerate && (
            <button
              type="button"
              className="manage-menu__item"
              role="menuitem"
              onClick={() =>
                run(
                  muted
                    ? `Restore Community Chat access for ${member.display_name}?`
                    : `Block ${member.display_name} from Community Chat?\n\nThey will still have access to classes, topics, announcements, and their profile.`,
                  setMemberMuted,
                  { user_id: member.id, muted: muted ? "false" : "true" },
                )
              }
            >
              {muted ? "Unmute" : "Mute in chat"}
            </button>
          )}
          {canModerate && (
            <button
              type="button"
              className="manage-menu__item"
              role="menuitem"
              onClick={() =>
                run(
                  suspended
                    ? `Restore access for ${member.display_name}?`
                    : `Suspend ${member.display_name}?\n\nThis person will temporarily lose access to the members-only website.\nTheir account and data will not be deleted.`,
                  setMemberSuspended,
                  { user_id: member.id, suspend: suspended ? "false" : "true" },
                )
              }
            >
              {suspended ? "Restore access" : "Suspend account"}
            </button>
          )}
          {canRole && (
            <button
              type="button"
              className="manage-menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChangeRole();
              }}
            >
              Change role
            </button>
          )}
          {canDelete && (
            <>
              <div className="manage-menu__rule" />
              <button
                type="button"
                className="manage-menu__item manage-menu__item--danger"
                role="menuitem"
                onClick={() =>
                  run(
                    `Delete account “${member.display_name}”? This cannot be undone.`,
                    deleteMember,
                    { user_id: member.id },
                  )
                }
              >
                Delete account
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="error manage-menu__error">{error}</p>}
    </div>
  );
}

function ModerationFlags({ profile, viewer }: { profile: Profile; viewer: Profile }) {
  if (!canSeeModerationStatus(viewer.role)) return null;
  return (
    <>
      {profile.muted && (
        <span className="moderation-flag moderation-flag--muted">Muted</span>
      )}
      {profile.status === "suspended" && (
        <span className="moderation-flag moderation-flag--suspended">Suspended</span>
      )}
    </>
  );
}

function isStaffRole(role: Profile["role"]) {
  return role === "teacher" || role === "admin" || role === "tech";
}

function joinedLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

function useStudentPreviewLimit() {
  const [limit, setLimit] = useState(10);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setLimit(mq.matches ? 5 : 10);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return limit;
}

function MemberRow({
  member,
  viewer,
  compact,
  onView,
  onChangeRole,
}: {
  member: Profile;
  viewer: Profile;
  compact?: boolean;
  onView: () => void;
  onChangeRole: () => void;
}) {
  const showMenu = member.id !== viewer.id;
  return (
    <article
      className={`manage-member${compact ? " manage-member--compact" : ""}`}
    >
      <div className="manage-member__who">
        <button
          type="button"
          className="profile-link manage-member__name"
          onClick={onView}
        >
          {member.display_name}
        </button>
        <RoleBadge role={member.role} />
        {member.status !== "approved" && member.status !== "suspended" && (
          <span className="manage-member__status">{member.status}</span>
        )}
        <ModerationFlags profile={member} viewer={viewer} />
      </div>
      {member.created_at && (
        <p className="manage-member__joined">Joined {joinedLabel(member.created_at)}</p>
      )}
      <div className="manage-member__aside">
        {member.id === viewer.id ? (
          <span className="manage-you">You</span>
        ) : showMenu ? (
          <MemberMenu
            member={member}
            viewer={viewer}
            onView={onView}
            onChangeRole={onChangeRole}
          />
        ) : null}
      </div>
    </article>
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
  const [adding, setAdding] = useState(false);
  const [roleFor, setRoleFor] = useState<Profile | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentsOpen, setStudentsOpen] = useState(false);
  const previewLimit = useStudentPreviewLimit();
  const showEmail = viewer.role === "admin" || viewer.role === "tech";
  const staffRank: Record<Profile["role"], number> = {
    teacher: 0,
    admin: 1,
    tech: 2,
    student: 3,
  };
  const staff = members
    .filter((m) => isStaffRole(m.role))
    .slice()
    .sort((a, b) => staffRank[a.role] - staffRank[b.role]);
  const students = members.filter((m) => m.role === "student");
  const needle = studentQuery.trim().toLowerCase();
  const matchingStudents = needle
    ? students.filter((m) => m.display_name.toLowerCase().includes(needle))
    : students;
  const showStudentSearch = students.length > 10;
  const collapsed =
    !needle && !studentsOpen && matchingStudents.length > previewLimit;
  const visibleStudents = collapsed
    ? matchingStudents.slice(0, previewLimit)
    : matchingStudents;

  return (
    <div className="manage-stack">
      {viewing && (
        <ProfileDialog
          profile={viewing}
          showEmail={showEmail}
          viewerId={viewer.id}
          onClose={() => setViewing(null)}
        />
      )}
      {adding && (
        <AddMemberDialog viewer={viewer} onClose={() => setAdding(false)} />
      )}
      {roleFor && (
        <RoleDialog profile={roleFor} onClose={() => setRoleFor(null)} />
      )}

      <section className="manage-block">
        <h3 className="manage-block__title">Pending applications</h3>
        {applications.length === 0 ? (
          <p className="manage-empty">
            <span aria-hidden="true">✓</span> No applications waiting
          </p>
        ) : (
          <div className="panel manage-panel">
            {applications.map((app) => (
              <article key={app.id} className="manage-app">
                <div className="manage-app__who">
                  <strong>{app.display_name}</strong>
                  {app.email && <span>{app.email}</span>}
                  {app.hometown?.trim() && <span>From {app.hometown.trim()}</span>}
                  {app.heard_from?.trim() && (
                    <span>Heard about us: {app.heard_from.trim()}</span>
                  )}
                </div>
                <p className="manage-app__when">
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(app.created_at))}
                </p>
                <div className="manage-app__side">
                  <ReviewForm profile={app} />
                  {canDeleteMember(viewer, app) && (
                    <PendingDelete userId={app.id} label={app.display_name} />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="manage-block manage-block--staff">
        <div className="manage-block__head">
          <div>
            <h3 className="manage-block__title">Staff</h3>
            <p className="manage-block__sub">
              People who help manage the group
            </p>
          </div>
        </div>
        <div className="panel manage-panel manage-panel--staff">
          {staff.length === 0 ? (
            <p className="manage-empty">No staff yet.</p>
          ) : (
            staff.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                viewer={viewer}
                onView={() => setViewing(m)}
                onChangeRole={() => setRoleFor(m)}
              />
            ))
          )}
        </div>
      </section>

      <section className="manage-block manage-block--students">
        <div className="manage-block__head">
          <h3 className="manage-block__title">
            Students · {students.length}
          </h3>
          <button
            type="button"
            className="manage-add"
            onClick={() => setAdding(true)}
          >
            + Add member
          </button>
        </div>
        {showStudentSearch && (
          <label className="manage-student-search">
            <input
              type="search"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search students..."
              autoComplete="off"
              aria-label="Search students"
            />
          </label>
        )}
        <div className="panel manage-panel manage-panel--students">
          {visibleStudents.length === 0 ? (
            <p className="manage-empty">
              {needle ? "No students match that name." : "No students yet."}
            </p>
          ) : (
            visibleStudents.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                viewer={viewer}
                compact
                onView={() => setViewing(m)}
                onChangeRole={() => setRoleFor(m)}
              />
            ))
          )}
        </div>
        {!needle && matchingStudents.length > previewLimit && (
          <button
            type="button"
            className="manage-more"
            onClick={() => setStudentsOpen((open) => !open)}
          >
            {studentsOpen ? "Show less" : "Show all students"}
          </button>
        )}
      </section>
    </div>
  );
}

function PendingDelete({ userId, label }: { userId: string; label: string }) {
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
      <button className="manage-text-btn manage-text-btn--danger" type="submit" disabled={pending}>
        {pending ? "Deleting…" : "Delete account"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
