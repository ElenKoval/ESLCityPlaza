"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/app/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    signUp,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <label>
        Display name
        <input name="display_name" required maxLength={60} />
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
        I want to join as
        <select name="requested_role" defaultValue="student">
          <option value="student">Student</option>
          <option value="volunteer">Volunteer</option>
        </select>
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit application"}
      </button>
      <p className="sub" style={{ margin: 0 }}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
