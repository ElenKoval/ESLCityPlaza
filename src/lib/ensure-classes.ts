import { createClient as createServiceClient } from "@supabase/supabase-js";
import { CLASS_DURATION_MS } from "@/lib/enrollment";
import {
  sameLaCalendarDay,
  scheduleClassPayload,
  sessionStartsAtIso,
  upcomingSessionStarts,
} from "@/lib/class-schedule";

const ENSURE_TIMEOUT_MS = 8_000;

let ensureInFlight: Promise<void> | null = null;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function ensureUpcomingClassesOnce() {
  const admin = adminClient();
  if (!admin) return;

  const wanted = upcomingSessionStarts();
  const { data: existing, error: listError } = await admin
    .from("classes")
    .select("id, starts_at")
    .gte("starts_at", new Date(Date.now() - CLASS_DURATION_MS).toISOString());

  if (listError) {
    console.error("[ensure-classes] list", listError.message);
    return;
  }

  const have = existing ?? [];
  const missing = wanted.filter(
    (iso) => !have.some((row) => sameLaCalendarDay(row.starts_at, iso)),
  );
  if (!missing.length) return;

  const { error: insertError } = await admin
    .from("classes")
    .insert(missing.map((iso) => scheduleClassPayload(iso)));

  // Concurrent requests may insert the same days; ignore duplicate races.
  if (insertError && !/duplicate|unique/i.test(insertError.message)) {
    console.error("[ensure-classes] insert", insertError.message);
  }
}

/** Creates missing Mon/Fri class rows. Safe to call often; never throw to callers. */
export async function ensureUpcomingClasses() {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = withTimeout(
    ensureUpcomingClassesOnce(),
    ENSURE_TIMEOUT_MS,
    "ensureUpcomingClasses",
  )
    .catch((error) => {
      console.error(
        "[ensure-classes]",
        error instanceof Error ? error.message : error,
      );
    })
    .finally(() => {
      ensureInFlight = null;
    });

  return ensureInFlight;
}

export async function findOrCreateClassId(sessionDate: string) {
  const [year, month, day] = sessionDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const startsAt = sessionStartsAtIso(year, month - 1, day);

  const admin = adminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!admin || !supabaseUrl) return null;

  const wantedAt = new Date(startsAt).getTime();
  const { data: rows } = await admin
    .from("classes")
    .select("id, starts_at")
    .gte("starts_at", new Date(wantedAt - 18 * 60 * 60 * 1000).toISOString())
    .lt("starts_at", new Date(wantedAt + 18 * 60 * 60 * 1000).toISOString());

  const match = (rows ?? []).find((row) =>
    sameLaCalendarDay(row.starts_at, startsAt),
  );
  if (match) return match.id as string;

  const { data: created, error } = await admin
    .from("classes")
    .insert(scheduleClassPayload(startsAt))
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id as string;
}
