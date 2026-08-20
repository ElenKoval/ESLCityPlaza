import Link from "next/link";

export default async function ForgotPasswordSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = (params.email || "").trim();

  return (
    <div className="auth-shell">
      <h1>Check your email</h1>
      <p className="sub">
        {email ? (
          <>
            If an account exists for:
            <br />
            <strong>{email}</strong>
            <br />
            we sent a password reset link.
          </>
        ) : (
          <>If an account exists, we sent a password reset link.</>
        )}
      </p>
      <div className="panel stack">
        <p style={{ margin: 0 }}>
          Didn&apos;t receive it? Check your spam folder, or try again in a few
          minutes.
        </p>
        <p className="sub" style={{ margin: 0 }}>
          <Link href="/forgot-password">Send another reset link</Link> ·{" "}
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
