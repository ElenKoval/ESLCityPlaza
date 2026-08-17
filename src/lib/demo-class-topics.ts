import { cookies } from "next/headers";
import type { ClassTopicRow } from "./types";

const DEMO_TOPICS_COOKIE = "esl_demo_class_topics";

export async function getDemoClassTopics(): Promise<ClassTopicRow[]> {
  const jar = await cookies();
  const raw = jar.get(DEMO_TOPICS_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ClassTopicRow[];
    return Array.isArray(parsed) ? parsed : [];
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
