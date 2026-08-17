import type { Metadata } from "next";
import { RegisterConfirmedView } from "@/components/RegisterConfirmedView";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email confirmed — ESL on the Plaza",
};

export default async function RegisterConfirmedPage() {
  const { profile } = await getProfile();

  return (
    <div className="page">
      <RegisterConfirmedView status={profile?.status ?? null} />
    </div>
  );
}
