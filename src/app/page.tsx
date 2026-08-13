import Link from "next/link";
import { HomeCalendar } from "@/components/HomeCalendar";
import { HomeChatCard } from "@/components/HomeChatCard";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoModeEnabled, useLocalDemo } from "@/lib/demo";
import { getDemoClassesWithEnrollments } from "@/lib/demo-classes";
import type { ClassRow } from "@/lib/types";

const HERO_PHOTOS = ["/hero-1.jpeg", "/hero-2.jpeg"] as const;

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
  const showPrivateEnter = isDemoModeEnabled() && useLocalDemo();

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

  return (
    <div className="home">
      <section className="hero-stage">
        <div className="hero-stage__copy">
          <h1 className="hero-stage__brand">ESL Citi Plaza</h1>
          <p className="hero-stage__lead">
            Practice English together — join a class, meet volunteers, and stay
            connected in our shared chat.
          </p>
          {access === "guest" && (
            <div className="hero-stage__actions">
              <Link href="/register" className="btn-primary" prefetch>
                Apply to join
              </Link>
              <Link href="/login" className="btn-secondary" prefetch>
                Log in
              </Link>
              {showPrivateEnter && (
                <Link href="/enter" className="btn-secondary" prefetch>
                  Enter (private)
                </Link>
              )}
            </div>
          )}
          {access === "pending" && (
            <div className="hero-stage__actions">
              <Link href="/pending" className="btn-secondary" prefetch>
                Application status
              </Link>
            </div>
          )}
          {access === "approved" && (
            <div className="hero-stage__actions">
              <Link href="/my" className="btn-secondary" prefetch>
                My lessons
              </Link>
            </div>
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

      <section className="hero-photos" aria-label="Plaza photos">
        {HERO_PHOTOS.map((src) => (
          <div key={src} className="hero-photos__cell">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="ESL Citi Plaza"
              className="hero-photos__img hero-photos__img--static"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </section>
    </div>
  );
}
