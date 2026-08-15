import Link from "next/link";
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
          {profile?.status === "approved" && <AnnouncementsNavLink />}
          {profile?.status === "approved" &&
            (profile.role === "teacher" || profile.role === "tech") && (
              <>
                <ApprovalsNavLink />
                <ScheduleNavLink />
              </>
            )}
        </nav>
        {profile && (
          <div className="site-header__user">
            <div className="site-header__identity">
              {profile.status === "approved" ? (
                <Link href="/account" className="site-header__name" prefetch>
                  {profile.display_name}
                </Link>
              ) : (
                <span className="site-header__name">{profile.display_name}</span>
              )}
              <span className="site-header__dot" aria-hidden="true">
                ·
              </span>
              <RoleBadge role={profile.role} />
            </div>
            <SignOutButton demo={demo} />
          </div>
        )}
      </div>
    </header>
  );
}
