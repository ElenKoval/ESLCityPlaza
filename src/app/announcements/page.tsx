import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import { AnnouncementBoard } from "@/components/HomeAnnouncements";
import {
  loadAllAnnouncements,
  loadCurrentAnnouncements,
} from "@/lib/load-announcements";
import { canManageAnnouncements } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Announcements — ESL on the Plaza",
};

export default async function AnnouncementsPage() {
  const { profile } = await getProfile();
  const staff =
    profile?.status === "approved" && canManageAnnouncements(profile.role);

  const current = await loadCurrentAnnouncements(50);
  const items = staff ? await loadAllAnnouncements() : current;

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
