import type { Metadata } from "next";
import { sitePageTitle } from "@/lib/site-name";
import { RegisterConfirmedView } from "@/components/RegisterConfirmedView";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: sitePageTitle("Email confirmed"),
};

export default async function RegisterConfirmedPage() {
  const { profile } = await getProfile();

  return (
    <div className="page">
      <RegisterConfirmedView status={profile?.status ?? null} />
    </div>
  );
}
