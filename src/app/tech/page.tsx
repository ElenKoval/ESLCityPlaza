import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TechPanel } from "@/components/TechPanel";
import {
  DEMO_TECH_ID,
  getDemoMembers,
  resetDemoMembers,
  useLocalDemo,
} from "@/lib/demo";
import { emailsForUserIds } from "@/lib/auth-admin";
import { getApplicationNoticeStatus } from "@/lib/mail";
import { SendTestMailButton } from "@/components/SendTestMailButton";
import type { Profile } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function resetDemoAction() {
  "use server";
  await resetDemoMembers();
  revalidatePath("/tech");
}

export default async function TechPage() {
  const { userId, profile } = await requireStaff();
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
    const emailMap = await emailsForUserIds([
      ...applications.map((p) => p.id),
      ...members.map((p) => p.id),
    ]);
    applications = applications.map((p) => ({
      ...p,
      email: emailMap.get(p.id) ?? p.email,
    }));
    members = members.map((p) => ({
      ...p,
      email: emailMap.get(p.id) ?? p.email,
    }));
  }

  let notice: Awaited<ReturnType<typeof getApplicationNoticeStatus>> | null =
    null;
  let noticeError: string | null = null;
  if (!isDemo && profile.role === "tech") {
    try {
      notice = await getApplicationNoticeStatus();
    } catch (error) {
      noticeError =
        error instanceof Error ? error.message : "Could not check email status";
    }
  }

  const noticeText = isDemo
    ? "Application emails are off in demo mode."
    : noticeError
      ? `Application emails: ${noticeError}`
      : notice?.ready
        ? `New applications are emailed to ${notice.recipients.join(", ")}. Sent from ${notice.from}.`
        : !notice?.hasKey
          ? "Application emails are off: add RESEND_API_KEY on Render."
          : !notice?.hasServiceRole
            ? "Application emails are off: add SUPABASE_SERVICE_ROLE_KEY on Render so the site can find the Tech email."
            : "Application emails are off: no Tech email found. Check that your Tech account has an email in Auth.";
  const noticeOk = Boolean(notice?.ready);

  return (
    <div className="page">
      <section className="section">
        <h2>Approvals</h2>
        <p className="lead">
          How it works: someone applies → confirms email → you see their name,
          email, and date here → Approve or Decline. Approved members get a
          welcome email, then they can use chat and class sign-up.
        </p>
        {profile.role === "tech" && (
          <div className={`mail-status ${noticeOk ? "is-ok" : "is-off"}`}>
            <p>{noticeText}</p>
            {noticeOk && <SendTestMailButton />}
          </div>
        )}
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
          viewer={profile}
        />
      </section>
    </div>
  );
}
