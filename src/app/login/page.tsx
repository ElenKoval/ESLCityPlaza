import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="auth-shell">
      <h1>Log in</h1>
      <p className="sub">Email or display name + password</p>
      {params.reset === "1" && (
        <p className="success">Your password was updated. Log in with your new password.</p>
      )}
      <LoginForm next={params.next || "/"} />
    </div>
  );
}
