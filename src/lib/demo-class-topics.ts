import { cookies } from "next/headers";
import type { ClassTopicRow, ClassTopicStatus } from "./types";

const DEMO_TOPICS_COOKIE = "esl_demo_class_topics";

function normalizeDemoTopic(raw: ClassTopicRow & { is_published?: boolean }): ClassTopicRow {
  const status: ClassTopicStatus =
    raw.status === "draft" || raw.status === "current" || raw.status === "past"
      ? raw.status
      : raw.is_published
        ? "past"
        : "draft";
  const { is_published: _legacy, ...rest } = raw as ClassTopicRow & {
    is_published?: boolean;
  };
  return { ...rest, status };
}

export async function getDemoClassTopics(): Promise<ClassTopicRow[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_TOPICS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Array<
      ClassTopicRow & { is_published?: boolean }
    >;
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.map(normalizeDemoTopic);
    return rows;
  } catch {
    return [];
  }
}

export async function saveDemoClassTopics(rows: ClassTopicRow[]) {
  const jar = await cookies();
  jar.set(
    DEMO_TOPICS_COOKIE,
    encodeURIComponent(JSON.stringify(rows.slice(0, 50))),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
}
