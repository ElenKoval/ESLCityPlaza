import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { useLocalDemo } from "@/lib/demo";
import {
  getDemoAnnouncements,
  getDemoCurrentAnnouncements,
} from "@/lib/demo-announcements";
import {
  isAnnouncementCurrent,
  sortAnnouncements,
  toPublicAnnouncement,
} from "@/lib/announcements";
import type { AnnouncementRow, Role } from "@/lib/types";

const ANNOUNCEMENT_SELECT =
  "id, title, body, created_by, created_at, updated_at, expires_at, is_important, is_active, profiles!created_by(display_name, role)";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function mapRows(data: unknown[] | null): AnnouncementRow[] {
  return (data ?? []).map((raw) => {
    const row = raw as AnnouncementRow & {
      profiles?:
        | { display_name: string; role: Role }
        | { display_name: string; role: Role }[]
        | null;
    };
    const profiles = row.profiles;
    const author = Array.isArray(profiles) ? profiles[0] : profiles;
    return toPublicAnnouncement(row, author);
  });
}

export async function loadCurrentAnnouncements(limit = 3) {
  if (useLocalDemo()) {
    return getDemoCurrentAnnouncements(limit);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [] as AnnouncementRow[];

  try {
    const supabase = adminClient() ?? (await createClient());
    const { data } = await supabase
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(24);

    return sortAnnouncements(mapRows(data).filter(isAnnouncementCurrent)).slice(
      0,
      limit,
    );
  } catch {
    return [] as AnnouncementRow[];
  }
}

export async function loadAllAnnouncements() {
  if (useLocalDemo()) {
    return getDemoAnnouncements();
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [] as AnnouncementRow[];

  try {
    const supabase = adminClient() ?? (await createClient());
    const { data } = await supabase
      .from("announcements")
      .select(ANNOUNCEMENT_SELECT)
      .order("created_at", { ascending: false });

    return mapRows(data);
  } catch {
    return [] as AnnouncementRow[];
  }
}
