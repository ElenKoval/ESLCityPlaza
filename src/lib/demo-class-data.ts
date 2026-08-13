import type { ClassRow } from "@/lib/types";

const DEMO_TECH_ID = "00000000-0000-4000-8000-000000000001";

export function buildDemoClasses(now = new Date()): ClassRow[] {
  return [
    {
      id: "demo-mon",
      title: "Monday Session",
      description: "1:00 PM – 3:00 PM practice with the group",
      starts_at: nextWeekday(now, 1, 13, 0).toISOString(),
      capacity: 15,
      created_by: DEMO_TECH_ID,
      created_at: now.toISOString(),
      enrollment_count: 3,
      enrolled: false,
    },
    {
      id: "demo-fri",
      title: "Friday Session",
      description: "1:00 PM – 3:00 PM practice with the group",
      starts_at: nextWeekday(now, 5, 13, 0).toISOString(),
      capacity: 15,
      created_by: DEMO_TECH_ID,
      created_at: now.toISOString(),
      enrollment_count: 2,
      enrolled: false,
    },
  ];
}

function nextWeekday(from: Date, weekday: number, hour = 18, minute = 0) {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  if (d.getTime() < from.getTime() - 60 * 60 * 1000) {
    d.setDate(d.getDate() + 7);
  }
  return d;
}
