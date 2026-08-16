import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Link did not work — ESL on the Plaza",
};

export default function AuthErrorPage() {
  return (
    <div className="auth-shell">
      <h1>Link did not work</h1>
      <p className="sub">
        This confirmation link is invalid, expired, or was already used.
      </p>
      <div className="panel stack">
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
