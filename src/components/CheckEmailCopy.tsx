"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resendConfirmationEmail, type ActionState } from "@/app/actions";

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resendConfirmationEmail,
    null,
  );

  if (!email) return null;

  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <button className="btn-secondary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send another email"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
    </form>
  );
}

export function CheckEmailCopy({ email }: { email: string }) {
  return (
    <div className="auth-shell">
      <h1>Check your email</h1>
      <p className="sub">
        {email ? (
          <>
            We sent a confirmation link to:
            <br />
            <strong>{email}</strong>
          </>
        ) : (
          <>We sent a confirmation link to your email.</>
        )}
      </p>
      <div className="panel stack">
        <p style={{ margin: 0 }}>
          Didn&apos;t receive it? Check your spam folder.
        </p>
        <ResendConfirmationForm email={email} />
        <p className="sub" style={{ margin: 0 }}>
          The link expires after a while — you can{" "}
          <Link href="/register">apply again</Link> if you need a new email.
        </p>
      </div>
    </div>
  );
}
