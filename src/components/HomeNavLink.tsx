"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function HomeNavLink() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <Link href="/" prefetch>
      Home
    </Link>
  );
}

export function ChatNavLink() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;

  return (
    <Link href="/chat" prefetch>
      Chat
    </Link>
  );
}

export function AnnouncementsNavLink() {
  const pathname = usePathname();
  if (pathname === "/announcements") return null;

  return (
    <Link href="/announcements" prefetch>
      Announcements
    </Link>
  );
}

export function ScheduleNavLink() {
  const pathname = usePathname();
  if (pathname === "/admin") return null;

  return (
    <Link href="/admin" prefetch>
      Schedule
    </Link>
  );
}

export function ApprovalsNavLink() {
  const pathname = usePathname();
  if (pathname === "/tech") return null;

  return (
    <Link href="/tech" prefetch>
      Approvals
    </Link>
  );
}
