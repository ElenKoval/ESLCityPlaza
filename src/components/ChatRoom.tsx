"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { RoleBadge } from "@/components/RoleBadge";
import type { ChatMessage } from "@/lib/chat";
import type { MessageRow, Role } from "@/lib/types";

const DEMO_CHAT_KEY = "esl-demo-chat";
const DEMO_ONLINE_CHANNEL = "esl-demo-online";
const isLocalDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL;

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
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(d);
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ChatRoom({
  initialMessages,
  userId,
  displayName = "Elena (Tech)",
  role = "tech" as Role,
}: {
  initialMessages: ChatMessage[];
  userId: string;
  displayName?: string;
  role?: Role;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(1);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Online count
  useEffect(() => {
    if (isLocalDemo) {
      const bc = new BroadcastChannel(DEMO_ONLINE_CHANNEL);
      const tabId = crypto.randomUUID();
      const alive = new Map<string, number>();

      const publish = () => {
        bc.postMessage({ type: "ping", tabId, at: Date.now() });
      };

      const recount = () => {
        const now = Date.now();
        for (const [id, at] of alive) {
          if (now - at > 8000) alive.delete(id);
        }
        alive.set(tabId, now);
        setOnline(alive.size);
      };

      bc.onmessage = (ev) => {
        const data = ev.data as { type: string; tabId: string; at: number };
        if (data?.type === "ping" || data?.type === "hello") {
          alive.set(data.tabId, data.at || Date.now());
          recount();
        }
      };

      bc.postMessage({ type: "hello", tabId, at: Date.now() });
      publish();
      const ping = window.setInterval(publish, 3000);
      const sweep = window.setInterval(recount, 2000);
      recount();

      return () => {
        window.clearInterval(ping);
        window.clearInterval(sweep);
        bc.close();
      };
    }

    const supabase = createClient();
    const channel = supabase.channel("plaza-presence", {
      config: { presence: { key: userId } },
    });
    const sync = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      setOnline(Object.keys(state).length || 1);
    };
    channel.on("presence", { event: "sync" }, sync);
    void channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({
        member: true,
        user_id: userId,
        name: displayName,
        at: Date.now(),
      });
      sync();
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [displayName, userId]);

  // Messages sync
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
              },
            ];
          });
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
    startTransition(async () => {
      if (isLocalDemo) {
        const msg: ChatMessage = {
          id: crypto.randomUUID(),
          user_id: userId,
          body: text,
          created_at: new Date().toISOString(),
          display_name: displayName,
          role,
        };
        const next = [...readDemoMessages(), msg];
        writeDemoMessages(next);
        setMessages(next);
        setBody("");
        inputRef.current?.focus();
        return;
      }

      const supabase = createClient();
      const { error: insertError } = await supabase.from("messages").insert({
        user_id: userId,
        body: text,
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setBody("");
      inputRef.current?.focus();
    });
  }

  let lastDay = "";

  return (
    <div className="chat-app panel">
      <header className="chat-app__header">
        <div>
          <h2 className="chat-app__title">Community chat</h2>
          <p className="chat-app__sub">
            Talk with the group, ask questions, and share news.
          </p>
        </div>
        <div className="chat-app__online" title="People currently in chat">
          <span className="home-chat__dot" aria-hidden="true" />
          <strong>{online}</strong> online
        </div>
      </header>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="chat-empty">It is quiet here — send the first message.</p>
        )}
        {messages.map((msg) => {
          const day = dayLabel(msg.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = msg.user_id === userId;
          return (
            <div key={msg.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <article
                className={`chat-msg ${mine ? "is-mine" : "is-theirs"}`}
              >
                <div className="chat-msg__head">
                  {!mine && (
                    <>
                      <span className="chat-msg__name">{msg.display_name}</span>
                      <RoleBadge role={msg.role} />
                    </>
                  )}
                  {mine && <span className="chat-msg__name">You</span>}
                  <span className="chat-msg__time">{timeLabel(msg.created_at)}</span>
                </div>
                <p className="chat-msg__body">{msg.body}</p>
              </article>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-compose">
        <textarea
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write in English… Enter to send, Shift+Enter for a new line"
          maxLength={2000}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="chat-compose__bar">
          <span className="chat-compose__count">{body.length}/2000</span>
          <button
            className="btn-primary"
            type="button"
            onClick={send}
            disabled={pending || !body.trim()}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
      {error && <p className="error chat-app__error">{error}</p>}
    </div>
  );
}
