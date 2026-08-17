"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/app/actions";
import { PasswordField } from "@/components/PasswordField";

export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signIn,
    null,
  );

  useEffect(() => {
    if (!state?.success) return;
    const dest =
      state.success.startsWith("/") && !state.success.startsWith("//")
        ? state.success
        : "/";
    window.location.assign(dest);
  }, [state]);

  const leaving = Boolean(state?.success);

  return (
    <form action={action} className="panel form-grid" noValidate>
      <input type="hidden" name="next" value={next} />
      <label>
        Email or nickname
        <input
          name="login"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </label>
      <label>
        Password
        <PasswordField
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn-primary" type="submit" disabled={pending || leaving}>
        {pending || leaving ? "Signing in…" : "Log in"}
      </button>
      <p className="sub" style={{ margin: 0 }}>
        No account yet? <Link href="/register">Apply to join</Link>
      </p>
    </form>
  );
}
