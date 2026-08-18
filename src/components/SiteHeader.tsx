import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import {
  ActivityNavLink,
  AnnouncementsNavLink,
  ChatNavLink,
  ClassTopicsNavLink,
  HomeNavLink,
  ManageMembersNavLink,
  ScheduleNavLink,
} from "./HomeNavLink";
import { HeaderSessionGuard } from "./HeaderSessionGuard";
import { SiteActivityTracker } from "./SiteActivityTracker";
import { RoleBadge } from "./RoleBadge";
import { SignOutButton } from "./SignOutButton";
import { canManageClasses, canReviewApplications } from "@/lib/roles";

export async function SiteHeader() {
  const { profile } = await getProfile();
  const demo = Boolean(profile) && (useLocalDemo() || (await hasDemoSession()));

  return (
    <header className="site-header">
      <HeaderSessionGuard hasProfile={Boolean(profile)} />
      {profile?.status === "approved" && <SiteActivityTracker />}
      <div className="site-header__inner">
        <nav className="site-nav" aria-label="Main">
          <HomeNavLink />
          {profile?.status === "approved" && <ChatNavLink />}
          {profile?.status === "approved" && <ClassTopicsNavLink />}
          {profile?.status === "approved" && <AnnouncementsNavLink />}
          {profile?.status === "approved" &&
            canReviewApplications(profile.role) && <ManageMembersNavLink />}
          {profile?.status === "approved" &&
            canManageClasses(profile.role) && <ScheduleNavLink />}
          {profile?.status === "approved" && profile.role === "tech" && (
            <ActivityNavLink />
          )}
        </nav>
        {profile && (
          <div className="site-header__user">
            {profile.status === "approved" ? (
              <Link
                href="/account"
                className="site-header__profile-link"
                prefetch
                aria-label={`Open your profile (${profile.display_name})`}
              >
                <span className="site-header__name">{profile.display_name}</span>
                <span className="site-header__dot" aria-hidden="true">
                  ·
                </span>
                <RoleBadge role={profile.role} />
              </Link>
            ) : (
              <div className="site-header__identity">
                <span className="site-header__name">{profile.display_name}</span>
                <span className="site-header__dot" aria-hidden="true">
                  ·
                </span>
                <RoleBadge role={profile.role} />
              </div>
            )}
            <SignOutButton demo={demo} />
          </div>
        )}
      </div>
    </header>
  );
}
