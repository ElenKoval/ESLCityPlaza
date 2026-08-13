import { requireTech } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TechPanel } from "@/components/TechPanel";
import {
  DEMO_TECH_ID,
  getDemoMembers,
  resetDemoMembers,
  useLocalDemo,
} from "@/lib/demo";
import type { Profile } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function resetDemoAction() {
  "use server";
  await resetDemoMembers();
  revalidatePath("/tech");
}

export default async function TechPage() {
  const { userId } = await requireTech();
  const isDemo = useLocalDemo() || userId === DEMO_TECH_ID;

  let applications: Profile[] = [];
  let members: Profile[] = [];

  if (isDemo) {
    const all = await getDemoMembers();
    applications = all.filter((p) => p.status === "pending");
    members = all.filter((p) => p.status !== "pending");
  } else {
    const supabase = await createClient();
    const { data: pending } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const { data: rest } = await supabase
      .from("profiles")
      .select("*")
      .neq("status", "pending")
      .order("created_at", { ascending: false });

    applications = (pending as Profile[]) ?? [];
    members = (rest as Profile[]) ?? [];
  }

  return (
    <div className="page">
      <section className="section">
        <h2>Approvals</h2>
        <p className="lead">
          How it works: anyone can submit a Join application → they wait on
          “pending” → only you (Tech) approve or reject → approved members get
          chat + lesson sign-up. You can also delete leftover accounts.
        </p>
        {isDemo && (
          <form action={resetDemoAction} style={{ marginBottom: "1rem" }}>
            <button type="submit" className="btn-secondary">
              Load sample applications
            </button>
          </form>
        )}
        <TechPanel
          applications={applications}
          members={members}
          techId={userId}
        />
      </section>
    </div>
  );
}
