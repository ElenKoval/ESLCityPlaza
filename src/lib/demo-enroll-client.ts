"use client";

const KEY = "esl-demo-enrollments";

export function readLocalEnrollments(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalEnrollments(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify([...new Set(ids)]));
  window.dispatchEvent(new Event("esl-demo-enroll"));
}

export function addLocalEnrollment(classId: string) {
  const ids = readLocalEnrollments();
  if (!ids.includes(classId)) {
    writeLocalEnrollments([...ids, classId]);
  }
}

export function removeLocalEnrollment(classId: string) {
  writeLocalEnrollments(readLocalEnrollments().filter((id) => id !== classId));
}
