import { getProfile } from "@/lib/auth";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { ApprovalsNavLink, AnnouncementsNavLink, ChatNavLink, HomeNavLink, ScheduleNavLink } from "./HomeNavLink";
import { RoleBadge } from "./RoleBadge";
import { SignOutButton } from "./SignOutButton";

export async function SiteHeader() {
  const { profile } = await getProfile();
  const demo = Boolean(profile) && (useLocalDemo() || (await hasDemoSession()));

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <nav className="site-nav" aria-label="Main">
          <HomeNavLink />
          {profile?.status === "approved" && <ChatNavLink />}
          {profile?.status === "approved" &&
            (profile.role === "teacher" || profile.role === "tech") && (
              <>
                <ApprovalsNavLink />
                <AnnouncementsNavLink />
                <ScheduleNavLink />
              </>
            )}
        </nav>
        {profile && (
          <div className="site-header__user">
            <span className="site-header__name">{profile.display_name}</span>
            <RoleBadge role={profile.role} />
            <SignOutButton demo={demo} />
          </div>
        )}
      </div>
    </header>
  );
}
