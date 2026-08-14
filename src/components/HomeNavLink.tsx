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

export function ApprovalsNavLink() {
  const pathname = usePathname();
  if (pathname === "/tech") return null;

  return (
    <Link href="/tech" prefetch>
      Approvals
    </Link>
  );
}
