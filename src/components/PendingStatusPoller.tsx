"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ProfileStatus } from "@/lib/types";

const POLL_MS = 7000;

export function PendingStatusPoller({
  status,
}: {
  status: ProfileStatus | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "pending") return;
    const id = window.setInterval(() => {
      router.refresh();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [status, router]);

  return null;
}
