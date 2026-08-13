"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exitDemo } from "@/app/demo-actions";

export function SignOutButton({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
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
        router.push("/");
        router.refresh();
      } catch {
        // redirect() from server actions throws; also fall back if cookie clear failed
        router.push("/");
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={signOut}
      disabled={pending}
    >
      {pending ? "…" : "Log out"}
    </button>
  );
}
