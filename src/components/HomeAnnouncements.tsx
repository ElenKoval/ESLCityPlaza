import Link from "next/link";
import { LinkifiedText } from "@/components/LinkifiedText";
import { RoleBadge } from "@/components/RoleBadge";
import type { AnnouncementRow, Role } from "@/lib/types";

/** ~2–3 lines on the home digest; full text stays on /announcements. */
const PREVIEW_MAX_CHARS = 160;
const PREVIEW_MAX_LINES = 3;

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

export function announcementAnchorId(id: string) {
  return `announcement-${id}`;
}

function announcementPreview(body: string) {
  const text = body.replace(/\r\n/g, "\n").trimEnd();
  if (!text) return { preview: "", truncated: false };

  const lines = text.split("\n");
  let preview = text;
  let truncated = false;

  if (lines.length > PREVIEW_MAX_LINES) {
    preview = lines.slice(0, PREVIEW_MAX_LINES).join("\n");
    truncated = true;
  }

  if (preview.length > PREVIEW_MAX_CHARS) {
    const cut = preview.slice(0, PREVIEW_MAX_CHARS);
    const soft = cut.replace(/\s+\S*$/, "").trimEnd() || cut.trimEnd();
    preview = soft;
    truncated = true;
  }

  if (truncated) {
    preview = preview.replace(/[.…\s]+$/u, "").trimEnd();
    preview = `${preview}…`;
  }

  return { preview, truncated };
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
          id={announcementAnchorId(item.id)}
          className={`home-announcement ${item.is_important ? "is-important" : ""}`}
        >
          <h3 className="home-announcement__title">{item.title}</h3>
          <LinkifiedText
            text={item.body}
            className="home-announcement__body"
          />
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
        {items.map((item) => {
          const { preview, truncated } = announcementPreview(item.body);
          const href = `/announcements#${announcementAnchorId(item.id)}`;
          return (
            <li
              key={item.id}
              className={item.is_important ? "is-important" : undefined}
            >
              <h3 className="home-announcement__title">{item.title}</h3>
              <AnnouncementMeta
                name={item.author_name || "Member"}
                role={item.author_role}
                createdAt={item.created_at}
              />
              {preview ? (
                <LinkifiedText
                  text={preview}
                  className="home-announcement__body"
                />
              ) : null}
              {truncated ? (
                <a href={href} className="home-announcement__more">
                  Read more
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
