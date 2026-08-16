import { redirect } from "next/navigation";
import { ConfirmEmailForm } from "@/components/ConfirmEmailForm";

export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = (params.token_hash || "").trim();
  const code = (params.code || "").trim();
  const type = (params.type || "signup").trim();

  if (!tokenHash && !code) {
    redirect("/auth/error");
  }

  return (
    <div className="auth-shell">
      <h1>Confirm your email</h1>
      <p className="sub">One last tap — this keeps the confirmation link safe.</p>
      <ConfirmEmailForm tokenHash={tokenHash} type={type} code={code} />
    </div>
  );
}
