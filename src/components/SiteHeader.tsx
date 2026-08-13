import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { RoleBadge } from "./RoleBadge";
import { SignOutButton } from "./SignOutButton";

export async function SiteHeader() {
  const { profile } = await getProfile();

  if (!profile) return null;

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand-mark" prefetch>
          ESL Citi Plaza
        </Link>
        <nav className="site-nav" aria-label="Main">
          {profile.status === "approved" ? (
            <>
              <Link href="/my" prefetch>
                My lessons
              </Link>
              <Link href="/chat" prefetch>
                Chat
              </Link>
              {profile.role === "tech" && (
                <Link href="/tech" prefetch>
                  Approvals
                </Link>
              )}
            </>
          ) : (
            <Link href="/pending" prefetch>
              Application status
            </Link>
          )}
        </nav>
        <div className="site-header__user">
          <span className="site-header__name">{profile.display_name}</span>
          <RoleBadge role={profile.role} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
