"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/app/actions";

export function LoginForm({ next = "/classes" }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </button>
      <p className="sub" style={{ margin: 0 }}>
        No account yet? <Link href="/register">Apply to join</Link>
      </p>
    </form>
  );
}
