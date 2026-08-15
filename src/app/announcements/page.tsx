import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import { useLocalDemo } from "@/lib/demo";
import { getDemoAnnouncements } from "@/lib/demo-announcements";
import { toPublicAnnouncement } from "@/lib/announcements";
import type { AnnouncementRow, Role } from "@/lib/types";

export default async function AnnouncementsAdminPage() {
  await requireStaff();

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

    items = (data ?? []).map((row) => {
      const profiles = row.profiles as unknown as
        | { display_name: string; role: Role }
        | { display_name: string; role: Role }[]
        | null;
      const author = Array.isArray(profiles) ? profiles[0] : profiles;
      return toPublicAnnouncement(row as AnnouncementRow, author);
    });
  }

  return (
    <div className="page">
      <section className="section">
        <h2>Announcements</h2>
        <p className="lead">
          Post notes for the group. They appear on the home page for approved
          members.
        </p>
        <AnnouncementManager items={items} />
      </section>
    </div>
  );
}
