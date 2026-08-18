"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVITY_HEARTBEAT_MS,
  sectionFromPath,
  type ActivitySection,
} from "@/lib/site-activity";

let lastSection: ActivitySection | null = null;
let lastSentAt = 0;
let inFlight = false;
let queued: { section: ActivitySection; force: boolean } | null = null;

async function pingActivity(section: ActivitySection, force: boolean) {
  queued = { section, force: force || Boolean(queued?.force) };
  if (inFlight) return;
  inFlight = true;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      queued = null;
      return;
    }

    while (queued) {
      const job = queued;
      queued = null;
      const now = Date.now();
      if (
        !job.force &&
        lastSection === job.section &&
        now - lastSentAt < ACTIVITY_HEARTBEAT_MS
      ) {
        continue;
      }

      const { error } = await supabase.from("site_activity").upsert(
        {
          user_id: user.id,
          last_seen_at: new Date().toISOString(),
          last_section: job.section,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        if (!/site_activity|schema cache|does not exist/i.test(error.message)) {
          console.error("[activity]", error.message);
        }
        return;
      }
      lastSection = job.section;
      lastSentAt = Date.now();
    }
  } finally {
    inFlight = false;
  }
}

export function SiteActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const section = sectionFromPath(pathname);
    if (!section) return;
    const current = section;

    function send(force: boolean) {
      if (document.visibilityState !== "visible") return;
      void pingActivity(current, force);
    }

    send(true);
    const timer = window.setInterval(() => send(false), ACTIVITY_HEARTBEAT_MS);
    function onVisibility() {
      send(true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  return null;
}
