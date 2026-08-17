import { RoleBadge } from "@/components/RoleBadge";
import { requireApproved } from "@/lib/auth";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { redirect } from "next/navigation";
import { needsProfileSetup } from "@/lib/profile";

export default async function ProfileSetupPage() {
  const { profile } = await requireApproved();
  if (!needsProfileSetup(profile)) {
    redirect("/account");
  }

  return (
    <div className="page profile-page">
      <section className="section">
        <h1 className="profile-page__title">
          Complete your profile{" "}
          <RoleBadge role={profile.role} />
        </h1>
        <p className="lead">
          Only your name is required. Everything else is optional — share what
          you like, or skip and use the site.
        </p>
        <ProfileSetupForm profile={profile} />
      </section>
    </div>
  );
}
