import { requireApproved } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { RoleBadge } from "@/components/RoleBadge";

export default async function AccountPage() {
  const { profile } = await requireApproved();

  return (
    <div className="page">
      <section className="section stack">
        <div>
          <h1>
            Your profile <RoleBadge role={profile.role} />
          </h1>
          <p className="lead">
            This is the information you shared. You can change it anytime.
          </p>
        </div>
        <ProfileSetupForm profile={profile} mode="edit" />
        <ChangePasswordForm />
      </section>
    </div>
  );
}
