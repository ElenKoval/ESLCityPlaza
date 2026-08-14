import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { hasDemoSession, useLocalDemo } from "@/lib/demo";
import { RoleBadge } from "./RoleBadge";
import { SignOutButton } from "./SignOutButton";

export async function SiteHeader() {
  const { profile } = await getProfile();
  const demo = Boolean(profile) && (useLocalDemo() || (await hasDemoSession()));

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <nav className="site-nav" aria-label="Main">
          <Link href="/" prefetch>
            Home
          </Link>
          {profile?.role === "tech" && profile.status === "approved" && (
            <Link href="/tech" prefetch>
              Approvals
            </Link>
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
