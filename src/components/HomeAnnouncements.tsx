import Link from "next/link";
import { RoleBadge } from "@/components/RoleBadge";
import type { AnnouncementRow } from "@/lib/types";

function firstName(name: string) {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned.split(/\s+/)[0] || "Member";
}

function postedOn(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function AnnouncementBoard({
  items,
  className = "",
}: {
  items: AnnouncementRow[];
  className?: string;
}) {
  if (items.length === 0) {
    return <p className="sub">No announcements right now.</p>;
  }

  return (
    <ul className={`home-announcements__list ${className}`.trim()}>
      {items.map((item) => (
        <li
          key={item.id}
          className={`home-announcement ${item.is_important ? "is-important" : ""}`}
        >
          <h3 className="home-announcement__title">{item.title}</h3>
          <p className="home-announcement__body">{item.body}</p>
          <p className="home-announcement__meta">
            <span>{firstName(item.author_name || "Member")}</span>
            {item.author_role && <RoleBadge role={item.author_role} />}
            <span>{postedOn(item.created_at)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function HomeAnnouncements({ items }: { items: AnnouncementRow[] }) {
  return (
    <section className="home-announcements" aria-label="Announcements">
      <div className="home-announcements__head">
        <h2 className="home-announcements__title">Announcements</h2>
        <Link href="/announcements" className="home-announcements__all" prefetch>
          Read all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="home-announcements__empty">
          Notes from teachers appear here.
        </p>
      ) : (
        <AnnouncementBoard items={items} />
      )}
    </section>
  );
}
