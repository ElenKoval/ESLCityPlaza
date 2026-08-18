import { requireApproved } from "@/lib/auth";
import { AccountProfileView } from "@/components/AccountProfileView";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
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
        <AccountProfileView profile={profile} />
        <ChangePasswordForm />
      </section>
    </div>
  );
}
