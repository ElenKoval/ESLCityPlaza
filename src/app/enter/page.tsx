import { EnterForm } from "@/components/EnterForm";
import { isDemoModeEnabled } from "@/lib/demo";
import { redirect } from "next/navigation";

export default function EnterPage() {
  if (!isDemoModeEnabled()) {
    redirect("/login");
  }

  return (
    <div className="auth-shell">
      <h1>Private enter</h1>
      <p className="sub">
        Temporary access for you only — skips registration while we set up
        Supabase.
      </p>
      <EnterForm />
    </div>
  );
}
