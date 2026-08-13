"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exitDemo } from "@/app/demo-actions";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (hasSupabase) {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
      return;
    }
    await exitDemo();
  }

  return (
    <button type="button" className="btn-ghost" onClick={signOut}>
      Log out
    </button>
  );
}
