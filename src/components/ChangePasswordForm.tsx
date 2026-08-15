"use client";

import { useActionState } from "react";
import { changePassword, type ActionState } from "@/app/actions";
import { PasswordField } from "@/components/PasswordField";
import { MIN_PASSWORD_LENGTH } from "@/lib/email";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    changePassword,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <h2 className="announce-form__heading">Change password</h2>
      <label>
        Current password
        <PasswordField
          name="current_password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <PasswordField
          name="new_password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>
      <label>
        Confirm new password
        <PasswordField
          name="confirm_password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.success && <p className="success">{state.success}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
