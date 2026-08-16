import { CheckEmailCopy } from "@/components/CheckEmailCopy";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = (params.email || "").trim();

  return <CheckEmailCopy email={email} />;
}
