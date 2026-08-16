"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notifyConfirmedApplication } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

const JOIN_TYPES = new Set(["signup", "email", "invite", "magiclink"]);

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

function otpTypes(raw: string | null): EmailOtpType[] {
  const first = OTP_TYPES.find((item) => item === raw);
  return [...new Set(first ? [first, "signup", "email"] : ["signup", "email"])];
}

function friendlyConfirmError(raw: string) {
  const text = raw.toLowerCase();
  if (text.includes("already") && text.includes("confirm")) {
    return "This email is already confirmed. You can log in and wait for approval.";
  }
  if (
    text.includes("expired") ||
    text.includes("otp_expired") ||
    text.includes("already used") ||
    text.includes("invalid") ||
    text.includes("token") ||
    text.includes("code") ||
    text.includes("missing")
  ) {
    return "This confirmation link has expired or was already used. Apply again to get a new email.";
  }
  return "This confirmation link did not work. Apply again to get a new email.";
}

export function AuthConfirmClient() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function confirmEmail() {
      const supabase = createClient();
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setError("This site is not connected to accounts yet.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const tokenHash = params.get("token_hash") || hash.get("token_hash");
      const type = params.get("type") || hash.get("type");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const hasConfirmToken = Boolean(
        code || tokenHash || (accessToken && refreshToken),
      );

      if (params.get("error_description") || params.get("error")) {
        setError(
          friendlyConfirmError(
            params.get("error_description") ||
              params.get("error") ||
              "This confirmation link did not work.",
          ),
        );
        return;
      }

      if (!hasConfirmToken) {
        setError(
          "This confirmation link is missing or incomplete. Open the newest email we sent you.",
        );
        return;
      }

      let message: string | null = null;
      let confirmedNow = false;

      if (code) {
        const { error: codeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!codeError) confirmedNow = true;
        else message = codeError.message;
      } else if (tokenHash) {
        for (const otpType of otpTypes(type)) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });
          if (!otpError) {
            message = null;
            confirmedNow = true;
            break;
          }
          message = otpError.message;
        }
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!sessionError) confirmedNow = true;
        else message = sessionError.message;
      }

      if (cancelled) return;

      if (!confirmedNow) {
        setError(friendlyConfirmError(message || "This confirmation link did not work."));
        return;
      }

      if (type === "recovery") {
        router.replace("/login");
        return;
      }
      if (type && !JOIN_TYPES.has(type) && type !== "email_change") {
        router.replace("/pending");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        try {
          await notifyConfirmedApplication();
        } catch (notifyError) {
          console.error("[confirm] notice", notifyError);
        }
      }

      router.replace("/register/confirmed");
      router.refresh();
    }

    void confirmEmail();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="auth-shell">
        <h1>Link did not work</h1>
        <p className="sub">
          This confirmation link is invalid, expired, or was already used.
        </p>
        <div className="panel stack">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
          <p style={{ margin: 0 }}>
            You can <Link href="/register">apply again</Link> to get a new
            email, or <Link href="/login">log in</Link> if you already
            confirmed.
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
