import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="auth-shell">
      <h1>Log in</h1>
      <p className="sub">Email or display name + password</p>
      <LoginForm next={params.next || "/"} />
    </div>
  );
}
