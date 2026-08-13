"use client";

import { useMemo, useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { enrollClass, unenrollClass } from "@/app/actions";
import { enrollStatus, isClassDate } from "@/lib/enrollment";
import {
  addLocalEnrollment,
  readLocalEnrollments,
  removeLocalEnrollment,
} from "@/lib/demo-enroll-client";
import type { ClassRow } from "@/lib/types";

type Access = "guest" | "pending" | "rejected" | "approved";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nearestClassDay(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const next = new Date(d);
    next.setDate(d.getDate() + i);
    if (isClassDate(next)) return next;
  }
  return d;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function HomeCalendar({
  classes: initialClasses,
  access,
  demoMode = false,
}: {
  classes: ClassRow[];
  access: Access;
  demoMode?: boolean;
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
      const d = new Date(c.starts_at);
      const key = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
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

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(cursor);

  function signUp(classId: string) {
    setError(null);
    setMessage(null);
    setPendingId(classId);
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
        setMessage("You are signed up! Open My lessons to see it.");
        // Best-effort sync to cookie for /my SSR
        const fd = new FormData();
        fd.set("class_id", classId);
        void enrollClass(null, fd);
        setPendingId(null);
        return;
      }

      const fd = new FormData();
      fd.set("class_id", classId);
      const result = await enrollClass(null, fd);
      setPendingId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessage(result?.success ?? "You are signed up!");
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId ? { ...c, enrolled: true } : c,
        ),
      );
    });
  }

  function cancel(classId: string) {
    setError(null);
    setMessage(null);
    setPendingId(classId);
    startTransition(async () => {
      if (demoMode) {
        removeLocalEnrollment(classId);
        setClasses((prev) =>
          prev.map((c) =>
            c.id === classId ? { ...c, enrolled: false } : c,
          ),
        );
        const fd = new FormData();
        fd.set("class_id", classId);
        void unenrollClass(null, fd);
        setPendingId(null);
        return;
      }
      const fd = new FormData();
      fd.set("class_id", classId);
      const result = await unenrollClass(null, fd);
      setPendingId(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId ? { ...c, enrolled: false } : c,
        ),
      );
    });
  }

  return (
    <div className="home-cal panel">
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
          const active = isClassDate(date);
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
        Classes meet Mondays and Fridays, 1:00–3:00 PM · max 15 people.
      </p>

      <div className="home-cal__detail">
        <p className="home-cal__detail-label">
          {new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          }).format(selected)}
        </p>

        {access !== "approved" && (
          <p className="home-cal__lock">
            {access === "guest" && (
              <>
                Class sign-up is for members only.{" "}
                <Link href="/login">Log in</Link> or{" "}
                <Link href="/register">apply to join</Link>.
              </>
            )}
            {access === "pending" && (
              <>Your application is under review — sign-up unlocks after approval.</>
            )}
            {access === "rejected" && (
              <>Your application was declined. Contact the organizers for help.</>
            )}
          </p>
        )}

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
        {access === "approved" && (
          <p className="home-cal__lock">
            <Link href="/my">My lessons →</Link>
          </p>
        )}

        {access === "approved" && dayClasses.length > 0 && (
          <ul className="home-cal__list">
            {dayClasses.map((c) => {
              const count = c.enrollment_count ?? 0;
              const full = count >= c.capacity;
              const rawStatus = enrollStatus(c.starts_at);
              const status =
                demoMode && rawStatus === "too_early" ? "open" : rawStatus;
              const time = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(c.starts_at));
              const busy = pendingId === c.id;
              return (
                <li key={c.id} className="home-cal__item">
                  <div>
                    <strong>{c.title}</strong>
                    <div className="class-meta">
                      <span>{time}</span>
                      {access === "approved" && (
                        <span>
                          {count}/{c.capacity} spots
                        </span>
                      )}
                    </div>
                    {c.description && <p>{c.description}</p>}
                  </div>
                  {access === "approved" &&
                    (c.enrolled ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => cancel(c.id)}
                      >
                        {busy ? "…" : "Cancel"}
                      </button>
                    ) : status === "past" ? (
                      <button type="button" className="btn-primary" disabled>
                        Past
                      </button>
                    ) : status === "too_early" ? (
                      <button type="button" className="btn-primary" disabled>
                        Not open yet
                      </button>
                    ) : full ? (
                      <button type="button" className="btn-primary" disabled>
                        Full
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        onClick={() => signUp(c.id)}
                      >
                        {busy ? "Signing up…" : "Sign up"}
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
