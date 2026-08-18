import type { Metadata } from "next";
import { requireTech } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RoleBadge } from "@/components/RoleBadge";
import { useLocalDemo } from "@/lib/demo";
import {
  ACTIVITY_RECENT_MS,
  formatActivityAgo,
  isOnlineNow,
  isRecentlyActive,
} from "@/lib/site-activity";
import { sitePageTitle } from "@/lib/site-name";
import type { Role } from "@/lib/types";

export const metadata: Metadata = {
  title: sitePageTitle("Activity"),
};

type ActivityRow = {
  user_id: string;
  last_seen_at: string;
  last_section: string;
  display_name: string;
  role: Role;
};

function tableMissing(message: string) {
  return /site_activity|schema cache|does not exist/i.test(message);
}

export default async function ActivityPage() {
  await requireTech();
  const demo = useLocalDemo();

  let rows: ActivityRow[] = [];
  let setupNeeded = false;

  if (!demo) {
    const supabase = await createClient();
    const since = new Date(Date.now() - ACTIVITY_RECENT_MS).toISOString();
    const { data, error } = await supabase
      .from("site_activity")
      .select("user_id, last_seen_at, last_section")
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false });

    if (error) {
      if (tableMissing(error.message)) setupNeeded = true;
      else console.error("[activity] load", error.message);
    } else {
      const ids = (data ?? []).map((row) => row.user_id);
      const names = new Map<string, { display_name: string; role: Role }>();
      if (ids.length) {
        const { data: people } = await supabase
          .from("profiles")
          .select("id, display_name, role")
          .in("id", ids);
        for (const person of people ?? []) {
          names.set(person.id, {
            display_name: person.display_name,
            role: person.role as Role,
          });
        }
      }
      rows = (data ?? []).map((row) => ({
        user_id: row.user_id,
        last_seen_at: row.last_seen_at,
        last_section: row.last_section,
        display_name: names.get(row.user_id)?.display_name ?? "Member",
        role: names.get(row.user_id)?.role ?? "student",
      }));
    }
  }

  const online = rows.filter((row) => isOnlineNow(row.last_seen_at));
  const recent = rows.filter((row) => isRecentlyActive(row.last_seen_at));

  return (
    <div className="page activity-page">
      <section className="section">
        <h1>Site Activity</h1>
        <p className="lead">
          Approximate recent activity — not a live presence feed, and not a
          click history.
        </p>

        {demo && (
          <p className="activity-note">
            Demo mode does not record live site activity.
          </p>
        )}
        {setupNeeded && (
          <p className="activity-note">
            Run <code>supabase/site-activity-upgrade.sql</code> in the Supabase
            SQL Editor to turn this on.
          </p>
        )}

        <section className="activity-block">
          <h2 className="activity-block__title">Online now</h2>
          {online.length === 0 ? (
            <p className="activity-empty">Nobody in the last 5 minutes.</p>
          ) : (
            <ul className="activity-list">
              {online.map((row) => (
                <li key={row.user_id} className="activity-row activity-row--online">
                  <span className="activity-dot" aria-hidden="true" />
                  <div className="activity-row__who">
                    <strong>{row.display_name}</strong>
                    <RoleBadge role={row.role} />
                  </div>
                  <p className="activity-row__meta">
                    {row.last_section}
                    <span aria-hidden="true"> · </span>
                    {formatActivityAgo(row.last_seen_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="activity-block">
          <h2 className="activity-block__title">Recently active</h2>
          {recent.length === 0 ? (
            <p className="activity-empty">Nobody else in the last 30 minutes.</p>
          ) : (
            <ul className="activity-list">
              {recent.map((row) => (
                <li key={row.user_id} className="activity-row">
                  <div className="activity-row__who">
                    <strong>{row.display_name}</strong>
                    <RoleBadge role={row.role} />
                  </div>
                  <p className="activity-row__meta">
                    {row.last_section}
                    <span aria-hidden="true"> · </span>
                    {formatActivityAgo(row.last_seen_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </div>
  );
}
