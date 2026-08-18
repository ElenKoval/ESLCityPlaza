import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SITE_NAME, sitePageTitle } from "@/lib/site-name";

export const metadata: Metadata = {
  title: sitePageTitle("Account suspended"),
};

export default async function SuspendedPage() {
  const { profile } = await requireUser();
  if (profile?.status === "approved") redirect("/");
  if (profile?.status !== "suspended") redirect("/pending");

  return (
    <div className="page">
      <section className="section panel stack">
        <h2>Account suspended</h2>
        <p className="lead">
          Your access to {SITE_NAME} has been temporarily suspended.
        </p>
        <p>
          Please contact the group administrator if you have questions.
        </p>
      </section>
    </div>
  );
}
