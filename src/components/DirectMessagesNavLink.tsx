"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDirectUnreadCount } from "@/app/dm-actions";
import { DM_UNREAD_REFRESH_EVENT } from "@/lib/direct-messages";

function openedConversationId(pathname: string) {
  const prefix = "/messages/";
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length).split("/")[0];
  return id || null;
}

export function DirectMessagesNavLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const active = pathname === "/messages" || pathname.startsWith("/messages/");
  const openedId = openedConversationId(pathname);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const count = await getDirectUnreadCount(openedId);
      if (!cancelled) setUnread(count);
    }
    void load();

    function onRefresh() {
      void load();
    }
    window.addEventListener(DM_UNREAD_REFRESH_EVENT, onRefresh);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return () => {
        cancelled = true;
        window.removeEventListener(DM_UNREAD_REFRESH_EVENT, onRefresh);
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
      window.removeEventListener(DM_UNREAD_REFRESH_EVENT, onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [pathname, openedId]);

  return (
    <Link
      href="/messages"
      prefetch={false}
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
