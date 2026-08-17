import { requireApprover } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TechPanel } from "@/components/TechPanel";
import { ClassRosterPanel } from "@/components/ClassRoster";
import {
  DEMO_TECH_ID,
  getDemoMembers,
  resetDemoMembers,
  useLocalDemo,
} from "@/lib/demo";
import { authContactsForUserIds } from "@/lib/auth-admin";
import { getApplicationNoticeStatus } from "@/lib/mail";
import { SendTestMailButton } from "@/components/SendTestMailButton";
import { canViewClassRoster } from "@/lib/roles";
import type { ClassRoster, Profile } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function resetDemoAction() {
  "use server";
  await resetDemoMembers();
  revalidatePath("/tech");
}

export default async function TechPage() {
  const { userId, profile } = await requireApprover();
  const isDemo = useLocalDemo() || userId === DEMO_TECH_ID;

  let applications: Profile[] = [];
  let members: Profile[] = [];
  let rosters: ClassRoster[] = [];

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
    const contacts = await authContactsForUserIds([
      ...applications.map((p) => p.id),
      ...members.map((p) => p.id),
    ]);
    const canCheckConfirm = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    );
    applications = applications
      .map((p) => ({
        ...p,
        email: contacts.get(p.id)?.email ?? p.email,
      }))
      .filter((p) => !canCheckConfirm || contacts.get(p.id)?.confirmed);
    members = members.map((p) => ({
      ...p,
      email: contacts.get(p.id)?.email ?? p.email,
    }));
    if (profile.role === "teacher") {
      members = members.map((p) => ({ ...p, email: undefined }));
    }

    if (canViewClassRoster(profile.role)) {
      const { data: classes } = await supabase
        .from("classes")
        .select("id, title, starts_at, location")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      const classRows = classes ?? [];
      if (classRows.length) {
        const classIds = classRows.map((c) => c.id);
        const { data: enrolled } = await supabase
          .from("enrollments")
          .select("class_id, user_id")
          .in("class_id", classIds);
        const userIds = [...new Set((enrolled ?? []).map((row) => row.user_id))];
        const nameById = new Map<string, { displayName: string; role: Profile["role"] }>();
        if (userIds.length) {
          const { data: people } = await supabase
            .from("profiles")
            .select("id, display_name, role")
            .in("id", userIds);
          for (const person of people ?? []) {
            nameById.set(person.id, {
              displayName: person.display_name,
              role: person.role,
            });
          }
        }
        rosters = classRows.map((item) => ({
          classId: item.id,
          title: item.title,
          startsAt: item.starts_at,
          location: item.location,
          people: (enrolled ?? [])
            .filter((row) => row.class_id === item.id)
            .map((row) => ({
              userId: row.user_id,
              displayName: nameById.get(row.user_id)?.displayName ?? "Member",
              role: nameById.get(row.user_id)?.role ?? "student",
            })),
        }));
      }
    }
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
        ? `Confirmed applications are emailed to ${notice.recipients.join(", ")} via Gmail. Approval emails use the same Gmail inbox.`
        : !notice?.hasSmtp && !notice?.hasKey
          ? "Application emails are off: add SMTP_HOST, SMTP_USER, and SMTP_PASS on Render."
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
        {canViewClassRoster(profile.role) && (
          <div style={{ marginTop: "1.25rem" }}>
            <ClassRosterPanel rosters={rosters} actorRole={profile.role} />
          </div>
        )}
      </section>
    </div>
  );
}
