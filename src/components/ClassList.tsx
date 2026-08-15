"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  enrollClass,
  unenrollClass,
  type ActionState,
} from "@/app/actions";
import { enrollStatus, spotsAvailableLabel } from "@/lib/enrollment";
import { classLocation, formatClassHours } from "@/lib/class-schedule";
import type { ClassRow } from "@/lib/types";

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

function EnrollButton({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    enrollClass,
    null,
  );
  useRefreshOnSuccess(state);
  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={classId} />
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

function UnenrollButton({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unenrollClass,
    null,
  );
  useRefreshOnSuccess(state);
  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={classId} />
      <button className="btn-ghost" type="submit" disabled={pending}>
        {pending ? "Canceling…" : "Cancel"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function ClassList({
  items,
  emptyText = "No lessons yet. Sign up from the calendar on the home page.",
}: {
  items: ClassRow[];
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="panel">
        <p className="lead" style={{ margin: 0 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="panel class-list">
      {items.map((item) => {
        const count = item.enrollment_count ?? 0;
        const full = count >= item.capacity;
        const status = enrollStatus(item.starts_at);
        return (
          <article key={item.id} className="class-item">
            <h3>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date(item.starts_at))}
            </h3>
            <p>{formatClassHours(item.starts_at)}</p>
            <p className="class-place">{classLocation(item.location)}</p>
            <div className="class-meta">
              <span>{spotsAvailableLabel(count, item.capacity)}</span>
            </div>
            <div className="class-actions">
              {item.enrolled ? (
                <UnenrollButton classId={item.id} />
              ) : status === "too_early" ? (
                <button className="btn-primary" type="button" disabled>
                  Opens 2 weeks before
                </button>
              ) : status === "past" ? (
                <button className="btn-primary" type="button" disabled>
                  Past
                </button>
              ) : full ? (
                <button className="btn-primary" type="button" disabled>
                  Class full
                </button>
              ) : (
                <EnrollButton classId={item.id} />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
