"use client";

import { useEffect, useState } from "react";
import { ClassList } from "@/components/ClassList";
import { buildDemoClasses } from "@/lib/demo-class-data";
import { readLocalEnrollments } from "@/lib/demo-enroll-client";
import type { ClassRow } from "@/lib/types";

export function DemoMyLessons({ initial }: { initial: ClassRow[] }) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    const sync = () => {
      const enrolled = new Set(readLocalEnrollments());
      const fromServer = initial.filter((c) => c.enrolled || enrolled.has(c.id));
      const fromLocal = buildDemoClasses()
        .filter((c) => enrolled.has(c.id))
        .map((c) => ({ ...c, enrolled: true }));
      const map = new Map<string, ClassRow>();
      for (const c of [...fromServer, ...fromLocal]) map.set(c.id, c);
      setItems(
        [...map.values()].sort(
          (a, b) =>
            new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
        ),
      );
    };
    sync();
    window.addEventListener("esl-demo-enroll", sync);
    return () => window.removeEventListener("esl-demo-enroll", sync);
  }, [initial]);

  return (
    <ClassList
      items={items}
      emptyText="You have no lessons yet. Pick a Monday or Friday on the home calendar."
    />
  );
}
