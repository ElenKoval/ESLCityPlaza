"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      ESL on Plaza
    </NavLink>
  );
}

export function ChatNavLink() {
  return <NavLink href="/chat">Chat</NavLink>;
}

export function AnnouncementsNavLink() {
  return <NavLink href="/announcements">Announcements</NavLink>;
}

export function ScheduleNavLink() {
  return <NavLink href="/admin">Schedule</NavLink>;
}

export function ApprovalsNavLink() {
  return <NavLink href="/tech">Approvals</NavLink>;
}
