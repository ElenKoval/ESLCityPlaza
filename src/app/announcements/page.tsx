import type { Metadata } from "next";
import { requireApproved } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import { AnnouncementBoard } from "@/components/HomeAnnouncements";
import { useLocalDemo } from "@/lib/demo";
import { getDemoAnnouncements } from "@/lib/demo-announcements";
import {
  isAnnouncementCurrent,
  sortAnnouncements,
  toPublicAnnouncement,
} from "@/lib/announcements";
import { canManageAnnouncements } from "@/lib/roles";
import type { AnnouncementRow, Role } from "@/lib/types";

export const metadata: Metadata = {
  title: "Announcements — ESL on the Plaza",
};

function mapRows(
  data: Array<
    AnnouncementRow & {
      profiles?:
        | { display_name: string; role: Role }
        | { display_name: string; role: Role }[]
        | null;
    }
  >,
) {
  return data.map((row) => {
    const profiles = row.profiles as unknown as
      | { display_name: string; role: Role }
      | { display_name: string; role: Role }[]
      | null;
    const author = Array.isArray(profiles) ? profiles[0] : profiles;
    return toPublicAnnouncement(row as AnnouncementRow, author);
  });
}

export default async function AnnouncementsPage() {
  const { profile } = await requireApproved();
  const staff = canManageAnnouncements(profile.role);

  let items: AnnouncementRow[] = [];

  if (useLocalDemo()) {
    items = await getDemoAnnouncements();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, title, body, created_by, created_at, updated_at, expires_at, is_important, is_active, profiles!created_by(display_name, role)",
      )
      .order("created_at", { ascending: false });

    items = mapRows(data ?? []);
  }

  const current = sortAnnouncements(items.filter(isAnnouncementCurrent));

  return (
    <div className="page">
      <section className="section">
        <h1>Announcements</h1>
        <p className="lead">
          Notes from teachers for the ESL on the Plaza group.
        </p>
        <AnnouncementBoard items={current} className="announce-board" />
        {staff && (
          <div className="announce-manage">
            <h2 className="announce-manage__title">Post or edit</h2>
            <AnnouncementManager items={items} />
          </div>
        )}
      </section>
    </div>
  );
}
