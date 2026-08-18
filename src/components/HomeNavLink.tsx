"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_NAME } from "@/lib/site-name";

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

export function HomeNavLink() {
  return (
    <NavLink href="/" className="site-nav__brand">
      {SITE_NAME}
    </NavLink>
  );
}

export function ClassTopicsNavLink() {
  return <NavLink href="/topics">Topics</NavLink>;
}

export function AnnouncementsNavLink() {
  return <NavLink href="/announcements">Announcements</NavLink>;
}

export function ScheduleNavLink() {
  return <NavLink href="/admin">Schedule</NavLink>;
}

export function ManageMembersNavLink() {
  return <NavLink href="/members">Manage Members</NavLink>;
}

export function ActivityNavLink() {
  return <NavLink href="/activity">Activity</NavLink>;
}
