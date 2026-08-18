"use client";

import { useMemo, useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enrollClass } from "@/app/actions";
import { CancelClassControl } from "@/components/CancelClassControl";
import {
  enrollStatus,
  signedUpCountLabel,
  spotsAvailableLabel,
} from "@/lib/enrollment";
import {
  classLocation,
  DEFAULT_CLASS_HOURS,
  formatClassHours,
  formatClassWhen,
  isUpcomingClassDate,
  laDateParts,
  sessionStartsAtIso,
} from "@/lib/class-schedule";
import {
  addLocalEnrollment,
  readLocalEnrollments,
} from "@/lib/demo-enroll-client";
import { ClassTopicChip } from "@/components/ClassTopicChip";
import type { ClassRow } from "@/lib/types";

type Access = "guest" | "pending" | "rejected" | "approved";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nearestClassDay(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const next = new Date(d);
    next.setDate(d.getDate() + i);
    if (isUpcomingClassDate(next)) return next;
  }
  return d;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function ymd(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function HomeCalendar({
  classes: initialClasses,
  access,
  demoMode = false,
  topics,
}: {
  classes: ClassRow[];
  access: Access;
  demoMode?: boolean;
  topics?: Record<string, { id: string; title: string }>;
}) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => nearestClassDay(today));
  const [classes, setClasses] = useState(initialClasses);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setClasses(initialClasses);
  }, [initialClasses]);

  useEffect(() => {
    if (!demoMode) return;
    const sync = () => {
      const enrolled = new Set(readLocalEnrollments());
      setClasses((prev) =>
        prev.map((c) => ({
          ...c,
          enrolled: enrolled.has(c.id) || Boolean(c.enrolled),
        })),
      );
    };
    sync();
    window.addEventListener("esl-demo-enroll", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("esl-demo-enroll", sync);
      window.removeEventListener("storage", sync);
    };
  }, [demoMode]);

  const byDay = useMemo(() => {
    const map = new Map<string, ClassRow[]>();
    for (const c of classes) {
      const la = laDateParts(c.starts_at);
      const key = `${la.year}-${la.monthIndex}-${la.day}`;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [classes]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < firstDow; i++) {
      out.push({ date: null, key: `e-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      out.push({ date, key: dayKey(date) });
    }
    return out;
  }, [cursor]);

  const selectedKey = dayKey(selected);
  const dayClasses = byDay.get(selectedKey) ?? [];
  const selectedHours = dayClasses[0]
    ? formatClassHours(dayClasses[0].starts_at)
    : DEFAULT_CLASS_HOURS;
  const selectedPlace = classLocation(dayClasses[0]?.location);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(cursor);

  function signUp(classId: string, sessionDate?: string) {
    setError(null);
    setMessage(null);
    setPendingId(classId || sessionDate || "new");
    startTransition(async () => {
      if (demoMode) {
        addLocalEnrollment(classId);
        setClasses((prev) =>
          prev.map((c) =>
            c.id === classId
              ? {
                  ...c,
                  enrolled: true,
                  enrollment_count: (c.enrollment_count ?? 0) + (c.enrolled ? 0 : 1),
                }
              : c,
          ),
        );
        setMessage(null);
        const fd = new FormData();
        fd.set("class_id", classId);
        if (sessionDate) fd.set("session_date", sessionDate);
        void enrollClass(null, fd);
        setPendingId(null);
        router.refresh();
        return;
      }

      const fd = new FormData();
      if (classId) fd.set("class_id", classId);
      if (sessionDate) fd.set("session_date", sessionDate);
      const result = await enrollClass(null, fd);
      setPendingId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessage(null);
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId
            ? {
                ...c,
                enrolled: true,
                enrollment_count: (c.enrollment_count ?? 0) + (c.enrolled ? 0 : 1),
              }
            : c,
        ),
      );
      router.refresh();
    });
  }

  return (
    <div id="home-cal" className="home-cal panel">
      <div className="home-cal__head">
        <button
          type="button"
          className="btn-ghost"
          aria-label="Previous month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
        >
          ‹
        </button>
        <h2 className="home-cal__title">{monthLabel}</h2>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Next month"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
        >
          ›
        </button>
      </div>

      <div className="home-cal__weekdays">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="home-cal__grid">
        {cells.map(({ date, key }) => {
          if (!date) return <span key={key} className="home-cal__cell is-empty" />;
          const k = dayKey(date);
          const active = isUpcomingClassDate(date);
          const has = active && (byDay.get(k)?.length ?? 0) > 0;
          const isSelected = active && k === selectedKey;
          const isToday = k === dayKey(today);
          return (
            <button
              key={key}
              type="button"
              disabled={!active}
              aria-disabled={!active}
              className={[
                "home-cal__cell",
                active ? "is-active-day" : "is-inactive-day",
                has ? "has-class" : "",
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (active) setSelected(date);
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <p className="home-cal__note">
        Classes usually meet Mondays and Fridays, {DEFAULT_CLASS_HOURS}.
        {access === "approved"
          ? " Check the calendar for each meeting’s location."
          : null}
      </p>

      <div className="home-cal__detail">
        <p className="home-cal__detail-label">
          {formatClassWhen(
            sessionStartsAtIso(
              selected.getFullYear(),
              selected.getMonth(),
              selected.getDate(),
            ),
          )}
        </p>

        {isUpcomingClassDate(selected) && (
          <>
            <p className="home-cal__when">{selectedHours}</p>
            {access === "approved" && (
              <p className="home-cal__where">{selectedPlace}</p>
            )}
            {access === "approved" &&
              dayClasses.map((c) => (
                <ClassTopicChip key={c.id} topic={topics?.[c.id]} />
              ))}
          </>
        )}

        {access === "guest" && (
          <div className="home-cal__cta">
            <p className="home-cal__lock">
              <Link href="/login">Log in to sign up</Link>
            </p>
            <p className="home-cal__hint">
              Not a member? <Link href="/register">Apply to join</Link>.
            </p>
          </div>
        )}
        {access === "pending" && (
          <p className="home-cal__lock">
            Your application is under review — sign-up unlocks after approval.
          </p>
        )}
        {access === "rejected" && (
          <p className="home-cal__lock">
            Your application was declined. Contact the organizers for help.
          </p>
        )}

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        {access === "approved" && isUpcomingClassDate(selected) && (
          <div className="home-cal__signup">
            {dayClasses.length === 0 ? (
              <div className="home-cal__signup-row">
                <p className="home-cal__spots">15 spots available</p>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pendingId === ymd(selected)}
                  onClick={() => signUp("", ymd(selected))}
                >
                  {pendingId === ymd(selected) ? "Signing up…" : "Sign up"}
                </button>
              </div>
            ) : (
              dayClasses.map((c) => {
                const count = c.enrollment_count ?? 0;
                const full = count >= c.capacity;
                const rawStatus = enrollStatus(c.starts_at);
                const status =
                  demoMode && rawStatus === "too_early" ? "open" : rawStatus;
                const busy = pendingId === c.id;
                return (
                  <div key={c.id} className="home-cal__signup-row">
                    {c.enrolled ? (
                      <div className="home-cal__signed">
                        <p className="home-cal__signed-ok">✓ You&apos;re signed up</p>
                        <p className="home-cal__spots">
                          {signedUpCountLabel(count, c.capacity)}
                        </p>
                        <CancelClassControl classId={c.id} />
                      </div>
                    ) : (
                      <>
                        <p className="home-cal__spots">
                          {spotsAvailableLabel(count, c.capacity)}
                        </p>
                        {status === "past" ? (
                          <button type="button" className="btn-primary" disabled>
                            Past
                          </button>
                        ) : status === "too_early" ? (
                          <button type="button" className="btn-primary" disabled>
                            Not open yet
                          </button>
                        ) : full ? (
                          <button type="button" className="btn-primary" disabled>
                            Class full
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busy}
                            onClick={() => signUp(c.id, ymd(selected))}
                          >
                            {busy ? "Signing up…" : "Sign up"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
