"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Layout can stay cached after the Auth/profile row is gone.
 * If this header still thinks someone is logged in, reload as a guest.
 */
export function HeaderSessionGuard({ hasProfile }: { hasProfile: boolean }) {
  useEffect(() => {
    if (!hasProfile || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let cancelled = false;

    async function verify() {
      const supabase = createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) return;

      if (!user) {
        window.location.reload();
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) window.location.reload();
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [hasProfile]);

  return null;
}
