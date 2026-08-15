import Link from "next/link";
import { HomeCalendar } from "@/components/HomeCalendar";
import { HomeChatCard } from "@/components/HomeChatCard";
import { MeetSpot } from "@/components/MeetSpot";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { needsProfileSetup } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import { ensureUpcomingClasses } from "@/lib/ensure-classes";
import { WelcomeLessons } from "@/components/WelcomeLessons";
import { HomeAnnouncements } from "@/components/HomeAnnouncements";
import { isAnnouncementCurrent, sortAnnouncements, toPublicAnnouncement } from "@/lib/announcements";
import { getDemoCurrentAnnouncements } from "@/lib/demo-announcements";
import type { AnnouncementRow, ClassRow, Role } from "@/lib/types";

function welcomeFirstName(displayName: string | null | undefined) {
  if (!displayName) return "there";
  const cleaned = displayName.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned.split(/\s+/)[0] || "there";
}

async function loadClasses(userId: string | null, canEnroll: boolean) {
  // Pure local demo (no Supabase env)
  if (useLocalDemo()) {
    return getDemoClassesWithEnrollments();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return [] as ClassRow[];
  }

  try {
    await ensureUpcomingClasses();
    const supabase = await createClient();
    const { data: classes } = await supabase
      .from("classes")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true });

    if (!classes?.length) return [] as ClassRow[];

    if (!canEnroll || !userId) {
      return classes.map((c) => ({
        ...c,
        enrollment_count: 0,
        enrolled: false,
      })) as ClassRow[];
    }

    const ids = classes.map((c) => c.id);
    const counts = new Map<string, number>();
    const mine = new Set<string>();

    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id, user_id")
      .in("class_id", ids);

    for (const row of enrollments ?? []) {
      counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
      if (row.user_id === userId) mine.add(row.class_id);
    }

    return classes.map((c) => ({
      ...c,
      enrollment_count: counts.get(c.id) ?? 0,
      enrolled: mine.has(c.id),
    })) as ClassRow[];
  } catch {
    return [] as ClassRow[];
  }
}

async function loadAnnouncements(approved: boolean): Promise<AnnouncementRow[]> {
  if (!approved) return [];
  if (useLocalDemo()) {
    return getDemoCurrentAnnouncements(3);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, title, body, created_by, created_at, updated_at, expires_at, is_important, is_active, profiles!created_by(display_name, role)",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(12);

    const mapped = (data ?? []).map((row) => {
      const profiles = row.profiles as unknown as
        | { display_name: string; role: Role }
        | { display_name: string; role: Role }[]
        | null;
      const author = Array.isArray(profiles) ? profiles[0] : profiles;
      return toPublicAnnouncement(row as AnnouncementRow, author);
    });

    return sortAnnouncements(mapped.filter(isAnnouncementCurrent)).slice(0, 3);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const { profile, userId } = await getProfile();
  const demoMode = useLocalDemo();

  if (needsProfileSetup(profile)) {
    redirect("/profile");
  }

  const access =
    !profile
      ? "guest"
      : profile.status === "approved"
        ? "approved"
        : profile.status === "rejected"
          ? "rejected"
          : "pending";

  const canEnroll = access === "approved";
  const classes = await loadClasses(userId, canEnroll);
  const announcements = await loadAnnouncements(canEnroll);
  const firstName = welcomeFirstName(profile?.display_name);

  return (
    <div className="home">
      <section className="hero-stage">
        <div
          className={
            access === "approved"
              ? "hero-stage__copy hero-stage__copy--member"
              : "hero-stage__copy"
          }
        >
          {access === "approved" ? (
            <>
              <h1 className="hero-stage__brand">Welcome, {firstName}!</h1>
              <WelcomeLessons classes={classes} />
              <HomeAnnouncements items={announcements} />
            </>
          ) : (
            <>
              <h1 className="hero-stage__brand">ESL on the Plaza</h1>
              <p className="hero-stage__lead">
                Practice English, meet new people, and enjoy the conversation.
              </p>
              {access === "guest" && (
                <div className="hero-stage__actions">
                  <Link href="/register" className="btn-primary" prefetch>
                    Apply to join
                  </Link>
                  <Link href="/login" className="btn-secondary" prefetch>
                    Log in
                  </Link>
                </div>
              )}
              {access === "pending" && (
                <div className="hero-stage__actions">
                  <Link href="/pending" className="btn-secondary" prefetch>
                    Application status
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        <HomeCalendar
          classes={classes}
          access={access}
          demoMode={demoMode}
        />
        <HomeChatCard access={access} />
      </section>
      <MeetSpot />
    </div>
  );
}
