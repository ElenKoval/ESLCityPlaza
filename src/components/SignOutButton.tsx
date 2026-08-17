"use client";

import { useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { exitDemo } from "@/app/demo-actions";

export function SignOutButton({ demo = false }: { demo?: boolean }) {
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      try {
        if (demo) {
          await exitDemo();
          return;
        }
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.assign("/");
      } catch {
        // redirect() from server actions throws; also fall back if cookie clear failed
        window.location.assign("/");
      }
    });
  }

  return (
    <button
      type="button"
      className="site-header__logout"
      onClick={signOut}
      disabled={pending}
    >
      {pending ? "…" : "Log out"}
    </button>
  );
}
