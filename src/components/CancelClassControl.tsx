"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { unenrollClass, type ActionState } from "@/app/actions";
import { removeLocalEnrollment } from "@/lib/demo-enroll-client";

export function CancelClassControl({
  classId,
  onCanceled,
}: {
  classId: string;
  onCanceled?: () => void;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unenrollClass,
    null,
  );

  useEffect(() => {
    if (!state?.success) return;
    setAsking(false);
    removeLocalEnrollment(classId);
    onCanceled?.();
    router.refresh();
  }, [state, onCanceled, router]);

  if (asking) {
    return (
      <div className="cancel-confirm">
        <p className="cancel-confirm__q">Cancel this class?</p>
        <div className="cancel-confirm__actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => setAsking(false)}
          >
            Keep class
          </button>
          <form action={action}>
            <input type="hidden" name="class_id" value={classId} />
            <button className="btn-danger" type="submit" disabled={pending}>
              {pending ? "Canceling…" : "Yes, cancel"}
            </button>
          </form>
        </div>
        {state?.error && <p className="error">{state.error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="cancel-link"
      onClick={() => setAsking(true)}
    >
      Cancel
    </button>
  );
}
