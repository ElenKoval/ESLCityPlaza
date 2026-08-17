import type { Metadata } from "next";
import Link from "next/link";
import { requireApproved } from "@/lib/auth";
import { canManageClassTopics } from "@/lib/roles";
import { classTopicWhenLabel, splitClassTopics } from "@/lib/class-topics";
import { loadClassTopics } from "@/lib/load-class-topics";
import type { ClassTopicRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Class Topics — ESL on the Plaza",
};

function TopicList({
  items,
  staff,
}: {
  items: ClassTopicRow[];
  staff: boolean;
}) {
  return (
    <div className="table-like">
      {items.map((topic) => (
        <article key={topic.id} className="app-row">
          <div>
            <strong>{topic.title}</strong>
            {topic.class_starts_at && (
              <p className="class-meta" style={{ margin: "0.2rem 0 0" }}>
                {classTopicWhenLabel(topic.class_starts_at)}
              </p>
            )}
            {staff && (
              <p className="class-meta" style={{ margin: "0.2rem 0 0" }}>
                {topic.is_published ? "Published" : "Draft"}
              </p>
            )}
          </div>
          <div className="class-actions">
            <Link href={`/topics/${topic.id}`} className="btn-secondary" prefetch>
              View topic
            </Link>
            {staff && (
              <Link
                href={`/topics/${topic.id}/edit`}
                className="btn-secondary"
                prefetch
              >
                Edit
              </Link>
            )}
          </div>
        </article>
      ))}
    </div>
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
    <div className="page">
      <section className="section">
        <h1>Class Topics</h1>
        <p className="lead">
          Discussion questions for a class, when the teacher prepares a theme.
        </p>
        {staff && (
          <p>
            <Link href="/topics/new" className="btn-primary" prefetch>
              Add class topic
            </Link>
          </p>
        )}

        <div className="stack">
          <section className="panel stack">
            <h2 className="announce-manage__title">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p style={{ margin: 0 }}>No upcoming class topics.</p>
            ) : (
              <TopicList items={upcoming} staff={staff} />
            )}
          </section>

          {drafts.length > 0 && (
            <section className="panel stack">
              <h2 className="announce-manage__title">Drafts</h2>
              <TopicList items={drafts} staff={staff} />
            </section>
          )}

          <section className="panel stack">
            <h2 className="announce-manage__title">Past topics</h2>
            {past.length === 0 ? (
              <p style={{ margin: 0 }}>No past class topics yet.</p>
            ) : (
              <TopicList items={past} staff={staff} />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
