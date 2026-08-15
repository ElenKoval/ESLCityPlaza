"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

      if (params.get("error_description") || params.get("error")) {
        setError(
          params.get("error_description") ||
            params.get("error") ||
            "This confirmation link did not work.",
        );
        return;
      }

      let message: string | null = null;

      if (code) {
        const { error: codeError } =
          await supabase.auth.exchangeCodeForSession(code);
        message = codeError?.message ?? null;
      } else if (tokenHash) {
        for (const otpType of otpTypes(type)) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash: tokenHash,
          });
          if (!otpError) {
            message = null;
            break;
          }
          message = otpError.message;
        }
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        message = sessionError?.message ?? null;
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          message = "This confirmation link is missing or has expired.";
        }
      }

      if (cancelled) return;
      if (message) {
        setError(message);
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
          This confirmation link is invalid or has expired.
        </p>
        <div className="panel stack">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
          <p style={{ margin: 0 }}>
            You can <Link href="/register">apply again</Link> to get a new
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
