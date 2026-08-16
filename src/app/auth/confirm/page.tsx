import { redirect } from "next/navigation";
import { ConfirmEmailClient } from "@/components/ConfirmEmailClient";

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
    <ConfirmEmailClient tokenHash={tokenHash} type={type} code={code} />
  );
}
