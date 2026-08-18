"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDirectUnreadCount } from "@/app/dm-actions";

export function DirectMessagesNavLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const active = pathname === "/messages" || pathname.startsWith("/messages/");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const count = await getDirectUnreadCount();
      if (!cancelled) setUnread(count);
    }
    void load();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return () => {
        cancelled = true;
      };
    }
    const supabase = createClient();
    const channel = supabase
      .channel("dm-nav-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_conversations" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [pathname]);

  return (
    <Link
      href="/messages"
      prefetch
      className="dm-nav"
      aria-current={active ? "page" : undefined}
    >
      Direct Messages
      {unread > 0 && (
        <span className="dm-nav__badge" aria-label={`${unread} unread`}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
