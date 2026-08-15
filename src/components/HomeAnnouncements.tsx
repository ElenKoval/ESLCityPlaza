import Link from "next/link";
import { RoleBadge } from "@/components/RoleBadge";
import type { AnnouncementRow, Role } from "@/lib/types";

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

function AnnouncementMeta({
  name,
  role,
  createdAt,
}: {
  name: string;
  role?: Role;
  createdAt: string;
}) {
  return (
    <p className="home-announcement__meta">
      <span>{firstName(name)}</span>
      {role && (
        <>
          <span aria-hidden="true">·</span>
          <RoleBadge role={role} />
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>{postedOn(createdAt)}</span>
    </p>
  );
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
          <AnnouncementMeta
            name={item.author_name || "Member"}
            role={item.author_role}
            createdAt={item.created_at}
          />
        </li>
      ))}
    </ul>
  );
}

export function HomeAnnouncements({ items }: { items: AnnouncementRow[] }) {
  if (items.length === 0) return null;

  return (
    <section className="home-announcements panel" aria-label="Announcements">
      <div className="home-announcements__head">
        <h2 className="home-announcements__title">Announcements</h2>
        <Link href="/announcements" className="home-announcements__all" prefetch>
          Read all
        </Link>
      </div>
      <ul className="home-announcements__digest">
        {items.map((item) => (
          <li
            key={item.id}
            className={item.is_important ? "is-important" : undefined}
          >
            <h3 className="home-announcement__title">{item.title}</h3>
            <p className="home-announcement__body">{item.body}</p>
            <AnnouncementMeta
              name={item.author_name || "Member"}
              role={item.author_role}
              createdAt={item.created_at}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
