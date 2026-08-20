"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

function friendlyResetError(raw: string) {
  const text = raw.toLowerCase();
  if (
    text.includes("expired") ||
    text.includes("otp_expired") ||
    text.includes("already used") ||
    text.includes("invalid") ||
    text.includes("token") ||
    text.includes("code") ||
    text.includes("missing")
  ) {
    return "This reset link has expired or was already used. Request a new one.";
  }
  return "This reset link did not work. Request a new one.";
}

export function ResetPasswordGate() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const supabase = createClient();
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setError("This site is not connected to accounts yet.");
        setReady(true);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const tokenHash = params.get("token_hash") || hash.get("token_hash");
      const type = (params.get("type") || hash.get("type") || "recovery") as EmailOtpType;
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (params.get("error_description") || params.get("error")) {
        setError(
          friendlyResetError(
            params.get("error_description") ||
              params.get("error") ||
              "This reset link did not work.",
          ),
        );
        setReady(true);
        return;
      }

      let message: string | null = null;

      if (code) {
        const { error: codeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (codeError) message = codeError.message;
      } else if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: type === "recovery" ? "recovery" : "recovery",
          token_hash: tokenHash,
        });
        if (otpError) message = otpError.message;
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) message = sessionError.message;
      }

      if (cancelled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setHasSession(true);
        setError(null);
        if (window.location.hash || window.location.search) {
          window.history.replaceState({}, "", "/reset-password");
        }
      } else if (message) {
        setError(friendlyResetError(message));
      } else {
        setError("This reset link has expired. Request a new one.");
      }

      setReady(true);
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="auth-shell">
        <h1>Opening reset link…</h1>
        <p className="sub">Please wait a moment.</p>
      </div>
    );
  }

  if (error || !hasSession) {
    return (
      <div className="auth-shell">
        <h1>Reset link did not work</h1>
        <p className="sub">We could not open this password reset link.</p>
        <div className="panel stack">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
          <p style={{ margin: 0 }}>
            <Link href="/forgot-password">Request a new reset link</Link> or{" "}
            <Link href="/login">log in</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <h1>Choose a new password</h1>
      <p className="sub">Enter a new password for your account.</p>
      <ResetPasswordForm />
    </div>
  );
}
