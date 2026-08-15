"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/app/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signUp,
    null,
  );
  const [mismatch, setMismatch] = useState(false);

  return (
    <form
      action={action}
      className="panel form-grid"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const password = String(new FormData(form).get("password") || "");
        const confirm = String(new FormData(form).get("confirm_password") || "");
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
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
      </label>
      <label>
        Confirm password
        <input
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
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
      {state?.error && <p className="error">{state.error}</p>}
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
