import { requireApproved } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { MemberProfileCard } from "@/components/MemberProfileDialog";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { RoleBadge } from "@/components/RoleBadge";

export default async function AccountPage() {
  const { profile } = await requireApproved();

  return (
    <div className="page profile-page">
      <section className="section stack">
        <div>
          <h1 className="profile-page__title">
            Your profile <RoleBadge role={profile.role} />
          </h1>
          <p className="lead">This is how other members see you.</p>
        </div>
        <div className="panel">
          <MemberProfileCard profile={profile} self />
        </div>
        <div>
          <h2 className="announce-form__heading">Edit profile</h2>
          <ProfileSetupForm profile={profile} mode="edit" />
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
