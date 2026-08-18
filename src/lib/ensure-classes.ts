import { createClient as createServiceClient } from "@supabase/supabase-js";
import { CLASS_DURATION_MS } from "@/lib/enrollment";
import {
  sameLaCalendarDay,
  scheduleClassPayload,
  sessionStartsAtIso,
  upcomingSessionStarts,
} from "@/lib/class-schedule";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function ensureUpcomingClasses() {
  const admin = adminClient();
  if (!admin) return;

  const wanted = upcomingSessionStarts();
  const { data: existing } = await admin
    .from("classes")
    .select("id, starts_at")
    .gte("starts_at", new Date(Date.now() - CLASS_DURATION_MS).toISOString());

  const have = existing ?? [];
  const missing = wanted.filter(
    (iso) => !have.some((row) => sameLaCalendarDay(row.starts_at, iso)),
  );
  if (!missing.length) return;

  await admin.from("classes").insert(missing.map((iso) => scheduleClassPayload(iso)));
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
