import Link from "next/link";

export default async function CheckEmailPage({
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
            We sent a confirmation link to <strong>{email}</strong>.
          </>
        ) : (
          <>We sent a confirmation link to your email.</>
        )}
      </p>
      <div className="panel stack">
        <p style={{ margin: 0 }}>
          Open the message and tap Confirm email. You will come back here to
          ESL on the Plaza. Your account stays pending until we approve it.
        </p>
        <p className="sub" style={{ margin: 0 }}>
          Do not see it? Check spam or promotions. The link expires after a
          while — you can{" "}
          <Link href="/register">apply again</Link> if you need a new email.
        </p>
      </div>
    </div>
  );
}
