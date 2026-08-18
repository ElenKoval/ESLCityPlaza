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
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import { loadUpcomingClassRosters } from "@/lib/load-class-rosters";
import { canViewClassRoster } from "@/lib/roles";
import type { ClassRoster, Profile } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function resetDemoAction() {
  "use server";
  await resetDemoMembers();
  revalidatePath("/members");
}

export default async function ManageMembersPage() {
  const { userId, profile } = await requireApprover();
  const isDemo = useLocalDemo() || userId === DEMO_TECH_ID;

  let applications: Profile[] = [];
  let members: Profile[] = [];
  let rosters: ClassRoster[] = [];

  if (isDemo) {
    const all = await getDemoMembers();
    applications = all.filter((p) => p.status === "pending");
    members = all.filter((p) => p.status !== "pending");
    if (canViewClassRoster(profile.role)) {
      const demoClasses = await getDemoClassesWithEnrollments();
      const now = Date.now();
      const me = all.find((p) => p.id === userId);
      rosters = demoClasses
        .filter((item) => new Date(item.starts_at).getTime() >= now)
        .map((item) => ({
          classId: item.id,
          title: item.title,
          startsAt: item.starts_at,
          location: item.location,
          capacity: item.capacity,
          people:
            item.enrolled && me
              ? [
                  {
                    userId: me.id,
                    displayName: me.display_name,
                    role: me.role,
                  },
                ]
              : [],
        }));
    }
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
      rosters = await loadUpcomingClassRosters(supabase);
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
          ? "Application emails are off: add SMTP_HOST, SMTP_USER, and SMTP_PASS in Vercel."
          : !notice?.hasServiceRole
            ? "Application emails are off: add SUPABASE_SERVICE_ROLE_KEY in Vercel so the site can find the Tech email."
            : "Application emails are off: no Tech email found. Check that your Tech account has an email in Auth.";
  const noticeOk = Boolean(notice?.ready);

  return (
    <div className="page manage-page">
      <section className="section">
        <h2>Manage Members</h2>
        <p className="lead">
          Review new requests, then keep the group in order.
        </p>
        {isDemo && (
          <form action={resetDemoAction} className="manage-demo">
            <button type="submit" className="manage-text-btn">
              Load sample applications
            </button>
          </form>
        )}
        {canViewClassRoster(profile.role) && (
          <ClassRosterPanel rosters={rosters} actorRole={profile.role} />
        )}
        <TechPanel
          applications={applications}
          members={members}
          viewer={profile}
        />
        {profile.role === "tech" && (
          <details className="manage-fold">
            <summary>
              <span className="manage-fold__title">Email diagnostics</span>
            </summary>
            <div className="manage-fold__body">
              <p className="manage-fold__copy">{noticeText}</p>
              {noticeOk && <SendTestMailButton />}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
