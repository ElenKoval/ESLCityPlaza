"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { unenrollClass, type ActionState } from "@/app/actions";
import type { ClassRow } from "@/lib/types";

function formatClassDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function CancelLessonButton({ classId }: { classId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unenrollClass,
    null,
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={classId} />
      <button className="btn-ghost welcome-lessons__cancel" type="submit" disabled={pending}>
        {pending ? "…" : "Cancel"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function WelcomeLessons({ classes }: { classes: ClassRow[] }) {
  const mine = classes
    .filter((c) => c.enrolled && new Date(c.starts_at).getTime() > Date.now())
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )
    .slice(0, 4);

  if (mine.length === 0) return null;

  return (
    <ul className="welcome-lessons">
      {mine.map((c) => (
        <li key={c.id} className="welcome-lessons__row">
          <p className="welcome-lessons__when">{formatClassDay(c.starts_at)}</p>
          <CancelLessonButton classId={c.id} />
        </li>
      ))}
    </ul>
  );
}
