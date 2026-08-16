"use client";

import { useEffect, useRef } from "react";

export function ConfirmEmailClient({
  tokenHash,
  type,
  code,
}: {
  tokenHash: string;
  type: string;
  code: string;
}) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams();
    if (tokenHash) params.set("token_hash", tokenHash);
    if (type) params.set("type", type);
    if (code) params.set("code", code);
    window.location.replace(`/auth/confirm/complete?${params.toString()}`);
  }, [tokenHash, type, code]);

  return (
    <div className="auth-shell">
      <h1>Confirming your email…</h1>
      <p className="sub">Please wait a moment.</p>
    </div>
  );
}
