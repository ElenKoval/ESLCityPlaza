"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  enrollClass,
  unenrollClass,
  type ActionState,
} from "@/app/actions";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { enrollStatus, isClassDate } from "@/lib/enrollment";
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

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function EnrollBtn({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    enrollClass,
    null,
  );
  useRefreshOnSuccess(state);
  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={classId} />
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

function UnenrollBtn({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unenrollClass,
    null,
  );
  useRefreshOnSuccess(state);
  return (
    <form action={action}>
      <input type="hidden" name="class_id" value={classId} />
      <button className="btn-ghost" type="submit" disabled={pending}>
        {pending ? "…" : "Cancel"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function HomeCalendar({
  classes,
  access,
}: {
  classes: ClassRow[];
  access: Access;
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
        Classes meet on Mondays and Fridays (Fri 1:00–3:00 PM). Sign-up opens 2
        weeks before · max 15 people.
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

        {dayClasses.length === 0 ? (
          <p className="home-cal__empty">No classes on this day.</p>
        ) : (
          <ul className="home-cal__list">
            {dayClasses.map((c) => {
              const count = c.enrollment_count ?? 0;
              const full = count >= c.capacity;
              const status = enrollStatus(c.starts_at);
              const time = new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(c.starts_at));
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
                    {access === "approved" && status === "too_early" && (
                      <p>Sign-up opens 2 weeks before this class.</p>
                    )}
                  </div>
                  {access === "approved" &&
                    (c.enrolled ? (
                      <UnenrollBtn classId={c.id} />
                    ) : status === "too_early" || status === "past" ? (
                      <button type="button" className="btn-primary" disabled>
                        {status === "past" ? "Past" : "Not open yet"}
                      </button>
                    ) : full ? (
                      <button type="button" className="btn-primary" disabled>
                        Full
                      </button>
                    ) : (
                      <EnrollBtn classId={c.id} />
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
