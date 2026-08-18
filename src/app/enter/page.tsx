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
        Tech access with your private key. Use this after someone applies on
        Join — approve them in Manage Members. Tip: stay in the same browser so demo
        applications are shared.
      </p>
      <EnterForm />
    </div>
  );
}
