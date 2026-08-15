"use client";

import { useActionState } from "react";
import {
  sendTestApplicationNotice,
  type ActionState,
} from "@/app/actions";

export function SendTestMailButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    sendTestApplicationNotice,
    null,
  );

  return (
    <form action={action} className="mail-status__test">
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send test email"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}
