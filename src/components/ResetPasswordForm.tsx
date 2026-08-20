"use client";

import { useActionState } from "react";
import { resetPasswordFromRecovery, type ActionState } from "@/app/actions";
import { PasswordField } from "@/components/PasswordField";
import { MIN_PASSWORD_LENGTH } from "@/lib/email";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    resetPasswordFromRecovery,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
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
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
