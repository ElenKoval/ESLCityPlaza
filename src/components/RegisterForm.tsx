"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/app/actions";
import { PasswordField } from "@/components/PasswordField";
import { MIN_PASSWORD_LENGTH, normalizeEmail, registrationEmailError } from "@/lib/email";

export function RegisterForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signUp,
    null,
  );
  const [mismatch, setMismatch] = useState(false);
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
            setMismatch(false);
            return;
          }
        }
        setEmailError(null);

        const password = String(new FormData(form).get("password") || "");
        const confirm = String(new FormData(form).get("confirm_password") || "");
        if (password.length < MIN_PASSWORD_LENGTH) {
          e.preventDefault();
          setMismatch(false);
          setEmailError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
          return;
        }
        if (password !== confirm) {
          e.preventDefault();
          setMismatch(true);
        } else {
          setMismatch(false);
        }
      }}
    >
      <label>
        Name
        <input name="display_name" required maxLength={60} autoComplete="name" />
      </label>
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
      <label>
        Password
        <PasswordField
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>
      <label>
        Confirm password
        <PasswordField
          name="confirm_password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>
      <label>
        I want to join as
        <select name="requested_role" defaultValue="student">
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
      </label>
      {mismatch && <p className="error">Passwords do not match</p>}
      {emailError && <p className="error">{emailError}</p>}
      {!emailError && state?.error && <p className="error">{state.error}</p>}
      <p className="legal-note">
        By creating an account, you acknowledge our{" "}
        <Link href="/privacy">Privacy Policy</Link> and agree to our{" "}
        <Link href="/terms">Terms</Link>.
      </p>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="sub" style={{ margin: 0 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
