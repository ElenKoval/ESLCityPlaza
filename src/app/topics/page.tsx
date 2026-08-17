import type { Metadata } from "next";
import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { canManageClassTopics } from "@/lib/roles";
import { splitClassTopics } from "@/lib/class-topics";
import { formatClassHours } from "@/lib/class-schedule";
import { loadClassTopics } from "@/lib/load-class-topics";
import type { ClassTopicRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Class Topics — ESL on the Plaza",
};

function topicDateShort(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  })
    .format(new Date(startsAt))
    .toUpperCase();
}

function topicWeekday(startsAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
  }).format(new Date(startsAt));
}

function topicPreview(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  return text || null;
}

function UpcomingCard({
  topic,
  staff,
}: {
  topic: ClassTopicRow;
  staff: boolean;
}) {
  const preview = topicPreview(topic.content);
  const when = topic.class_starts_at;
  return (
    <article className="topic-card">
      {when && (
        <p className="topic-card__date">{topicDateShort(when)}</p>
      )}
      <h3 className="topic-card__title">{topic.title}</h3>
      {preview && <p className="topic-card__preview">{preview}</p>}
      {when && (
        <p className="topic-card__when">
          {topicWeekday(when)} · {formatClassHours(when)}
        </p>
      )}
      {staff && (
        <p className="topic-card__status">
          {topic.is_published ? "Published" : "Draft"}
        </p>
      )}
      <p className="topic-card__actions">
        <Link href={`/topics/${topic.id}`} prefetch>
          View topic
        </Link>
        {staff && (
          <Link href={`/topics/${topic.id}/edit`} prefetch>
            Edit
          </Link>
        )}
      </p>
    </article>
  );
}

function PastRow({
  topic,
  staff,
}: {
  topic: ClassTopicRow;
  staff: boolean;
}) {
  const when = topic.class_starts_at;
  return (
    <li className="topics-archive__row">
      <span className="topics-archive__date">
        {when ? topicDateShort(when) : ""}
      </span>
      <span className="topics-archive__title">
        {topic.title}
        {staff && (
          <span className="topics-archive__status">
            {topic.is_published ? "Published" : "Draft"}
          </span>
        )}
      </span>
      <span className="topics-archive__actions">
        <Link href={`/topics/${topic.id}`} prefetch>
          View →
        </Link>
        {staff && (
          <Link href={`/topics/${topic.id}/edit`} prefetch>
            Edit
          </Link>
        )}
      </span>
    </li>
  );
}

export default async function ClassTopicsPage() {
  const { profile } = await requireApproved();
  const staff = canManageClassTopics(profile.role);
  const topics = await loadClassTopics({ includeDrafts: staff });
  const visible = staff ? topics : topics.filter((row) => row.is_published);
  const published = visible.filter((row) => row.is_published);
  const drafts = staff ? visible.filter((row) => !row.is_published) : [];
  const { upcoming, past } = splitClassTopics(published);

  return (
    <div className="page topics-index">
      <section className="section">
        <h1 className="topics-index__title">Class Topics</h1>
        <p className="lead">
          Discussion questions and topics for our classes.
        </p>
        {staff && (
          <p>
            <Link href="/topics/new" className="btn-primary" prefetch>
              Add class topic
            </Link>
          </p>
        )}

        <section className="topics-upcoming" aria-labelledby="topics-upcoming">
          <h2 id="topics-upcoming" className="topics-index__heading">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <p className="topics-index__empty">No upcoming class topics.</p>
          ) : (
            <div className="topics-card-grid">
              {upcoming.map((topic) => (
                <UpcomingCard key={topic.id} topic={topic} staff={staff} />
              ))}
            </div>
          )}
        </section>

        {drafts.length > 0 && (
          <section className="topics-archive" aria-labelledby="topics-drafts">
            <h2 id="topics-drafts" className="topics-index__heading">
              Drafts
            </h2>
            <ul className="topics-archive__list">
              {drafts.map((topic) => (
                <PastRow key={topic.id} topic={topic} staff={staff} />
              ))}
            </ul>
          </section>
        )}

        <section className="topics-archive" aria-labelledby="topics-past">
          <h2 id="topics-past" className="topics-index__heading">
            Past topics
          </h2>
          {past.length === 0 ? (
            <p className="topics-index__empty">No past class topics yet.</p>
          ) : (
            <ul className="topics-archive__list">
              {past.map((topic) => (
                <PastRow key={topic.id} topic={topic} staff={staff} />
              ))}
            </ul>
          )}
        </section>
      </section>
    </div>
  );
}
