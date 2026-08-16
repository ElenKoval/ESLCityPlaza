"use client";

import { useActionState } from "react";
import { confirmEmailFromLink, type ActionState } from "@/app/actions";

export function ConfirmEmailForm({
  tokenHash,
  type,
  code,
}: {
  tokenHash: string;
  type: string;
  code: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    confirmEmailFromLink,
    null,
  );

  return (
    <form action={action} className="panel stack">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="code" value={code} />
      <p style={{ margin: 0 }}>
        Tap the button below to confirm your email and send your request to
        join ESL on the Plaza.
      </p>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Confirming…" : "Confirm email address"}
      </button>
    </form>
  );
}
