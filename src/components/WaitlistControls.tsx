"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  joinWaitlist,
  leaveWaitlist,
  type ActionState,
} from "@/app/actions";
import {
  WAITLIST_MAX,
  waitlistCountLabel,
  waitlistPositionLabel,
} from "@/lib/waitlist";

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

export function WaitlistControls({
  classId,
  waitlisted,
  waitlistCount,
  waitlistPosition,
  compact = false,
}: {
  classId: string;
  waitlisted?: boolean;
  waitlistCount?: number;
  waitlistPosition?: number | null;
  compact?: boolean;
}) {
  const [joinState, joinAction, joining] = useActionState<ActionState, FormData>(
    joinWaitlist,
    null,
  );
  const [leaveState, leaveAction, leaving] = useActionState<
    ActionState,
    FormData
  >(leaveWaitlist, null);
  useRefreshOnSuccess(joinState);
  useRefreshOnSuccess(leaveState);

  const count = waitlistCount ?? 0;
  const full = count >= WAITLIST_MAX;
  const error = joinState?.error || leaveState?.error;

  if (waitlisted) {
    return (
      <div className={compact ? "waitlist-box waitlist-box--compact" : "waitlist-box"}>
        <p className="home-cal__spots">
          {waitlistPositionLabel(waitlistPosition ?? 0)}
        </p>
        <form action={leaveAction}>
          <input type="hidden" name="class_id" value={classId} />
          <button
            type="submit"
            className="btn-secondary"
            disabled={leaving}
          >
            {leaving ? "Leaving…" : "Leave waitlist"}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className={compact ? "waitlist-box waitlist-box--compact" : "waitlist-box"}>
      <p className="home-cal__spots">
        Class full
        {count > 0 ? ` · ${waitlistCountLabel(count)}` : ""}
        {full ? " · waitlist full" : ""}
      </p>
      {full ? (
        <button type="button" className="btn-primary" disabled>
          Waitlist full
        </button>
      ) : (
        <form action={joinAction}>
          <input type="hidden" name="class_id" value={classId} />
          <button type="submit" className="btn-primary" disabled={joining}>
            {joining ? "Joining…" : "Join waitlist"}
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
