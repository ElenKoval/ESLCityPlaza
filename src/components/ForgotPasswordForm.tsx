"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/app/actions";
import { normalizeEmail, registrationEmailError } from "@/lib/email";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    null,
  );
  const [emailError, setEmailError] = useState<string | null>(null);

  return (
    <form
      action={action}
      className="panel form-grid"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const emailInput = form.elements.namedItem("email");
        if (emailInput instanceof HTMLInputElement) {
          emailInput.value = normalizeEmail(emailInput.value);
          const problem = registrationEmailError(emailInput.value);
          if (problem) {
            e.preventDefault();
            setEmailError(problem);
            return;
          }
        }
        setEmailError(null);
      }}
    >
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          onInput={(e) => {
            e.currentTarget.value = e.currentTarget.value.replace(/\s/g, "");
          }}
          onBlur={(e) => {
            e.currentTarget.value = normalizeEmail(e.currentTarget.value);
          }}
        />
      </label>
      {emailError && <p className="error">{emailError}</p>}
      {!emailError && state?.error && <p className="error">{state.error}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <p className="sub" style={{ margin: 0 }}>
        Remember your password? <Link href="/login">Back to log in</Link>
      </p>
    </form>
  );
}
