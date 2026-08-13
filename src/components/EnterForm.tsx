"use client";

import { useActionState } from "react";
import { enterDemo, type DemoState } from "@/app/demo-actions";

export function EnterForm() {
  const [state, action, pending] = useActionState<DemoState, FormData>(
    enterDemo,
    null,
  );

  return (
    <form action={action} className="panel form-grid">
      <label>
        Access key
        <input
          name="key"
          type="password"
          autoComplete="off"
          required
          placeholder="Your private key"
        />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Enter as Tech"}
      </button>
    </form>
  );
}
