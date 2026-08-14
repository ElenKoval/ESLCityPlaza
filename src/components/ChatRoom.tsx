"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { canAnnounce, ROLE_LABELS } from "@/lib/roles";
import type { ChatMessage } from "@/lib/chat";
import type { MessageRow, Role } from "@/lib/types";

const DEMO_CHAT_KEY = "esl-demo-chat";
const isLocalDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const LETTER_COLORS = [
  "#c4510c",
  "#2f6f4e",
  "#3d5a80",
  "#9a3412",
  "#6b3fa0",
  "#0f766e",
];

function readDemoMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(DEMO_CHAT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function writeDemoMessages(msgs: ChatMessage[]) {
  localStorage.setItem(DEMO_CHAT_KEY, JSON.stringify(msgs.slice(-300)));
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(d);
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function chatName(name: string) {
  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return cleaned.split(/\s+/)[0] || "Member";
}

function firstLetter(name: string) {
  return (chatName(name)[0] || "?").toUpperCase();
}

function letterColor(name: string) {
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % LETTER_COLORS.length;
  return LETTER_COLORS[n];
}

function staffLabel(role: Role) {
  if (role === "student") return null;
  return ROLE_LABELS[role].toUpperCase();
}

function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi);
  return (
    <p className="chat-msg__body">
      {parts.map((part, i) => {
        const url = /^https?:\/\//i.test(part) || /^www\./i.test(part);
        if (!url) return <span key={i}>{part}</span>;
        const trimmed = part.replace(/[.,;:!?]+$/g, "");
        const trailing = part.slice(trimmed.length);
        const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {trimmed}
            </a>
            {trailing}
          </span>
        );
      })}
    </p>
  );
}

function MessageRowView({
  msg,
  mine,
  onDelete,
}: {
  msg: ChatMessage;
  mine: boolean;
  onDelete: (id: string) => void;
}) {
  const name = chatName(msg.display_name);
  const badge = staffLabel(msg.role);
  return (
    <article
      className={`chat-msg ${msg.is_announcement ? "is-announce" : ""} ${mine ? "is-mine" : ""}`}
    >
      <span
        className="chat-avatar"
        style={{ background: letterColor(name) }}
        aria-hidden="true"
      >
        {firstLetter(name)}
      </span>
      <div className="chat-msg__main">
        <p className="chat-msg__meta">
          <span className="chat-msg__name">{name}</span>
          {badge && <span className="chat-msg__role">{badge}</span>}
          <span className="chat-msg__dot">·</span>
          <span className="chat-msg__time">{timeLabel(msg.created_at)}</span>
        </p>
        {msg.is_announcement && (
          <p className="chat-msg__pin-label">Announcement</p>
        )}
        <MessageBody text={msg.body} />
        {mine && (
          <button
            type="button"
            className="chat-msg__delete"
            onClick={() => onDelete(msg.id)}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

export function ChatRoom({
  initialMessages,
  userId,
  displayName = "Member",
  role = "student" as Role,
}: {
  initialMessages: ChatMessage[];
  userId: string;
  displayName?: string;
  role?: Role;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canPin = canAnnounce(role);

  useEffect(() => {
    if (!isLocalDemo) return;
    const existing = readDemoMessages();
    if (existing.length === 0) {
      const welcome: ChatMessage = {
        id: "welcome",
        user_id: "system",
        body: "Welcome to ESL on Plaza chat! Practice English, ask questions, and say hi.",
        created_at: new Date().toISOString(),
        display_name: "Plaza Bot",
        role: "volunteer",
      };
      writeDemoMessages([welcome]);
      setMessages([welcome]);
    } else {
      setMessages(existing);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (isLocalDemo) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === DEMO_CHAT_KEY) setMessages(readDemoMessages());
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }

    const supabase = createClient();
    const channel = supabase
      .channel("plaza-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const row = payload.new as MessageRow;
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, role")
            .eq("id", row.user_id)
            .maybeSingle();

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                user_id: row.user_id,
                body: row.body,
                created_at: row.created_at,
                display_name: profile?.display_name ?? "Member",
                role: (profile?.role as Role) ?? "student",
                is_announcement: Boolean(row.is_announcement),
              },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  function send() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    const asAnnounce = canPin && announce;
    startTransition(async () => {
      if (isLocalDemo) {
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          user_id: userId,
          body: text,
          created_at: new Date().toISOString(),
          display_name: displayName,
          role,
          is_announcement: asAnnounce,
        };
        const next = [...readDemoMessages(), msg];
        writeDemoMessages(next);
        setMessages(next);
        setBody("");
        setAnnounce(false);
        inputRef.current?.focus();
        return;
      }

      const supabase = createClient();
      const payload: Record<string, unknown> = {
        user_id: userId,
        body: text,
        is_announcement: asAnnounce,
      };
      const { data, error: insertError } = await supabase
        .from("messages")
        .insert(payload)
        .select("id, user_id, body, created_at, is_announcement")
        .single();
      if (insertError) {
        setError(insertError.message);
        return;
      }
      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [
            ...prev,
            {
              id: data.id,
              user_id: data.user_id,
              body: data.body,
              created_at: data.created_at,
              display_name: displayName,
              role,
              is_announcement: Boolean(data.is_announcement),
            },
          ];
        });
      }
      setBody("");
      setAnnounce(false);
      inputRef.current?.focus();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      if (isLocalDemo) {
        const next = readDemoMessages().filter((m) => m.id !== id);
        writeDemoMessages(next);
        setMessages(next);
        return;
      }
      const supabase = createClient();
      const { error: delError } = await supabase.from("messages").delete().eq("id", id);
      if (delError) {
        setError(delError.message);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  }

  const pin = [...messages]
    .reverse()
    .find((m) => m.is_announcement);
  let lastDay = "";

  return (
    <div className="chat-app">
      <header className="chat-app__header">
        <h1 className="chat-app__title">Community chat</h1>
        <p className="chat-app__sub">
          Talk with the group, ask questions, and share news.
        </p>
      </header>

      {pin && (
        <aside className="chat-pin">
          <p className="chat-pin__meta">
            📌 {chatName(pin.display_name)} · Announcement
          </p>
          <MessageBody text={pin.body} />
        </aside>
      )}

      {error && <p className="error chat-app__error">{error}</p>}

      <div className="chat-log">
        {messages.length === 0 && (
          <p className="chat-empty">It is quiet here — send the first message.</p>
        )}
        {messages.map((msg) => {
          const day = dayLabel(msg.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={msg.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <MessageRowView
                msg={msg}
                mine={msg.user_id === userId}
                onDelete={remove}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message..."
          maxLength={2000}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="btn-primary"
          type="submit"
          disabled={pending || !body.trim()}
        >
          Send
        </button>
        {canPin && (
          <label className="chat-compose__announce">
            <input
              type="checkbox"
              checked={announce}
              onChange={(e) => setAnnounce(e.target.checked)}
            />
            Announcement
          </label>
        )}
      </form>
    </div>
  );
}
