import Link from "next/link";
import { HomeCalendar } from "@/components/HomeCalendar";
import { HomeChatCard } from "@/components/HomeChatCard";
import { MeetSpot } from "@/components/MeetSpot";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import type { ClassRow } from "@/lib/types";

function welcomeFirstName(displayName: string | null | undefined) {
  if (!displayName) return "there";
  const cleaned = displayName.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned.split(/\s+/)[0] || "there";
}

function nextEnrolledClassLabel(classes: ClassRow[]) {
  const now = Date.now();
  const pick = classes
    .filter(
      (c) => c.enrolled && new Date(c.starts_at).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    )[0];
  if (!pick) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(pick.starts_at));
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

export default async function HomePage() {
  const { profile, userId } = await getProfile();
  const demoMode = useLocalDemo();

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
  const firstName = welcomeFirstName(profile?.display_name);
  const nextClassWhen = nextEnrolledClassLabel(classes);

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
              {nextClassWhen && (
                <p className="hero-stage__lead">
                  Your next class is {nextClassWhen}.
                </p>
              )}
              <div className="hero-stage__actions">
                <Link href="/my" className="btn-primary" prefetch>
                  My lessons
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="hero-stage__brand">ESL on Plaza</h1>
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
        <HomeChatCard
          access={access}
          userId={userId}
          displayName={profile?.display_name ?? null}
        />
      </section>
      <MeetSpot />
    </div>
  );
}
