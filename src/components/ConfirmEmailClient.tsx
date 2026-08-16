"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { confirmEmailFromLink, type ActionState } from "@/app/actions";

export function ConfirmEmailClient({
  tokenHash,
  type,
  code,
}: {
  tokenHash: string;
  type: string;
  code: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    confirmEmailFromLink,
    null,
  );
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const formData = new FormData();
    formData.set("token_hash", tokenHash);
    formData.set("type", type);
    formData.set("code", code);
    action(formData);
  }, [action, tokenHash, type, code]);

  useEffect(() => {
    if (state?.success) {
      window.location.replace("/register/confirmed");
    }
  }, [state]);

  if (state?.error) {
    return (
      <div className="auth-shell">
        <h1>Link did not work</h1>
        <p className="sub">
          This confirmation link is invalid, expired, or was already used.
        </p>
        <div className="panel stack">
          <p className="error" style={{ margin: 0 }}>
            {state.error}
          </p>
          <p style={{ margin: 0 }}>
            If you already confirmed your email, you can{" "}
            <Link href="/login">log in</Link> and wait for approval.
          </p>
          <p style={{ margin: 0 }}>
            Otherwise, <Link href="/register">apply again</Link> to get a new
            email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <h1>Confirming your email…</h1>
      <p className="sub">Please wait a moment.</p>
    </div>
  );
}
