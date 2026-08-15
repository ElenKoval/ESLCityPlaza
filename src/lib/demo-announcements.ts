import { cookies } from "next/headers";
import type { AnnouncementRow } from "./types";
import { DEMO_TECH_ID } from "./demo";
import { isAnnouncementCurrent, sortAnnouncements } from "./announcements";

const DEMO_ANNOUNCEMENTS_COOKIE = "esl_demo_announcements";

function seed(): AnnouncementRow[] {
  return [
    {
      id: "demo-ann-1",
      title: "Next class: Friday",
      body: "It will be very hot. Please bring water.",
      created_by: DEMO_TECH_ID,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: null,
      is_important: true,
      is_active: true,
      author_name: "Elena",
      author_role: "tech",
    },
  ];
}

export async function getDemoAnnouncements(): Promise<AnnouncementRow[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_ANNOUNCEMENTS_COOKIE)?.value;
  if (!raw) return seed();
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as AnnouncementRow[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

export async function saveDemoAnnouncements(rows: AnnouncementRow[]) {
  const jar = await cookies();
  jar.set(
    DEMO_ANNOUNCEMENTS_COOKIE,
    encodeURIComponent(JSON.stringify(rows.slice(0, 50))),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}

export async function getDemoCurrentAnnouncements(limit = 3) {
  const rows = await getDemoAnnouncements();
  return sortAnnouncements(rows.filter(isAnnouncementCurrent)).slice(0, limit);
}
