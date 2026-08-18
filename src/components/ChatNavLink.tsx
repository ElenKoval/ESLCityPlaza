"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getChatHasUnread, markChatRead } from "@/app/chat-actions";
import {
  CHAT_UNREAD_REFRESH_EVENT,
  chatLastReadStorageKey,
} from "@/lib/chat-unread";

function readLocal(userId: string) {
  try {
    return window.localStorage.getItem(chatLastReadStorageKey(userId));
  } catch {
    return null;
  }
}

function writeLocal(userId: string) {
  try {
    window.localStorage.setItem(
      chatLastReadStorageKey(userId),
      new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

export function ChatNavLink() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(false);
  const viewingChat = pathname === "/chat" || pathname.startsWith("/chat/");

  useEffect(() => {
    let cancelled = false;
    let useFallback = false;
    let userId: string | null = null;

    async function loadLocal() {
      if (!userId) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
      }
      if (!userId || cancelled) return;
      if (viewingChat) {
        writeLocal(userId);
        setUnread(false);
        return;
      }
      let lastRead = readLocal(userId);
      if (!lastRead) {
        writeLocal(userId);
        setUnread(false);
        return;
      }
      const supabase = createClient();
      const { data: latest } = await supabase
        .from("messages")
        .select("created_at")
        .neq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setUnread(Boolean(latest?.created_at && latest.created_at > lastRead));
      }
    }

    async function load() {
      if (viewingChat) {
        setUnread(false);
        void markChatRead();
        if (useFallback) void loadLocal();
        return;
      }
      if (useFallback) {
        await loadLocal();
        return;
      }
      const result = await getChatHasUnread();
      if (cancelled) return;
      if (result.fallback) {
        useFallback = true;
        await loadLocal();
        return;
      }
      setUnread(result.unread);
    }

    void load();

    function onRefresh() {
      void load();
    }
    window.addEventListener(CHAT_UNREAD_REFRESH_EVENT, onRefresh);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return () => {
        cancelled = true;
        window.removeEventListener(CHAT_UNREAD_REFRESH_EVENT, onRefresh);
      };
    }

    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) userId = data.user?.id ?? null;
    });
    const channel = supabase
      .channel("chat-nav-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as { user_id?: string };
          if (viewingChat) {
            void markChatRead();
            setUnread(false);
            return;
          }
          if (userId && row.user_id && row.user_id !== userId) {
            setUnread(true);
          }
          void load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener(CHAT_UNREAD_REFRESH_EVENT, onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [pathname, viewingChat]);

  return (
    <Link
      href="/chat"
      prefetch={false}
      className="dm-nav"
      aria-current={viewingChat ? "page" : undefined}
    >
      Chat
      {unread && !viewingChat && (
        <span className="site-nav__dot" aria-label="New chat messages" />
      )}
    </Link>
  );
}
