"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getPublicProfile,
  postChatMessage,
  deleteChatMessage,
  signChatImagePaths,
} from "@/app/actions";
import { canAnnounce, canDeleteChatMessage } from "@/lib/roles";
import { RoleBadge } from "@/components/RoleBadge";
import { ProfileDialog } from "@/components/MemberProfileDialog";
import { chatTimeLabel, type ChatMessage } from "@/lib/chat";
import { prepareChatImage } from "@/lib/chat-image";
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
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(d);
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

function MessageBody({ text }: { text: string }) {
  if (!text) return null;
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

function ChatLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="chat-lightbox" role="presentation" onClick={onClose}>
      <div
        className="chat-lightbox__panel"
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn-ghost chat-lightbox__close" onClick={onClose}>
          Close
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="chat-lightbox__img" />
      </div>
    </div>
  );
}

function MessageMenu({
  onDelete,
}: {
  onDelete: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="chat-msg-menu" ref={wrapRef}>
      <button
        type="button"
        className="chat-msg-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Message actions"
        onClick={() => setOpen((v) => !v)}
      >
        •••
      </button>
      {open && (
        <div className="chat-msg-menu__list" role="menu">
          <button
            type="button"
            className="chat-msg-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete message
          </button>
        </div>
      )}
    </div>
  );
}

function MessageRowView({
  msg,
  continued,
  mine,
  canDelete,
  onDelete,
  onOpenProfile,
  onOpenPhoto,
}: {
  msg: ChatMessage;
  continued: boolean;
  mine: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onOpenProfile: (userId: string) => void;
  onOpenPhoto: (src: string, alt: string) => void;
}) {
  const name = chatName(msg.display_name);
  const canOpen = msg.user_id !== "system";
  const alt = msg.body.trim()
    ? msg.body.trim()
    : `Photo shared by ${name}`;
  const photo = msg.imageUrl;

  return (
    <article
      className={`chat-msg${msg.is_announcement ? " is-announce" : ""}${mine ? " is-mine" : ""}${continued ? " is-continued" : ""}`}
    >
      {continued ? (
        <span className="chat-avatar chat-avatar--spacer" aria-hidden="true" />
      ) : canOpen ? (
        <button
          type="button"
          className="chat-avatar"
          style={{ background: letterColor(name) }}
          onClick={() => onOpenProfile(msg.user_id)}
          aria-label={`View ${name}'s profile`}
        >
          {firstLetter(name)}
        </button>
      ) : (
        <span
          className="chat-avatar"
          style={{ background: letterColor(name) }}
          aria-hidden="true"
        >
          {firstLetter(name)}
        </span>
      )}
      <div className="chat-msg__main">
        {!continued && (
          <p className="chat-msg__meta">
            {canOpen ? (
              <button
                type="button"
                className="chat-msg__name profile-link"
                onClick={() => onOpenProfile(msg.user_id)}
              >
                {name}
              </button>
            ) : (
              <span className="chat-msg__name">{name}</span>
            )}
            <RoleBadge role={msg.role} />
            <span className="chat-msg__dot">·</span>
            <span className="chat-msg__time">{chatTimeLabel(msg.created_at)}</span>
            {canDelete && <MessageMenu onDelete={() => onDelete(msg.id)} />}
          </p>
        )}
        {continued && canDelete && (
          <div className="chat-msg__continued-actions">
            <span className="chat-msg__time">{chatTimeLabel(msg.created_at)}</span>
            <MessageMenu onDelete={() => onDelete(msg.id)} />
          </div>
        )}
        {msg.is_announcement && (
          <p className="chat-msg__pin-label">Announcement</p>
        )}
        {photo && (
          <button
            type="button"
            className="chat-photo"
            onClick={() => onOpenPhoto(photo, alt)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={alt}
              width={msg.image_width || undefined}
              height={msg.image_height || undefined}
              loading="lazy"
            />
          </button>
        )}
        <MessageBody text={msg.body} />
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
  const [, startProfile] = useTransition();
  const [viewing, setViewing] = useState<Awaited<
    ReturnType<typeof getPublicProfile>
  >>(null);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    url: string;
    blob: Blob;
    width: number;
    height: number;
    ext: "webp" | "jpg";
    mime: "image/webp" | "image/jpeg";
  } | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const didInit = useRef(false);
  const sendingRef = useRef(false);
  const canPin = canAnnounce(role);

  useEffect(() => {
    if (!isLocalDemo) return;
    const existing = readDemoMessages();
    if (existing.length === 0) {
      const welcome: ChatMessage = {
        id: "welcome",
        user_id: "system",
        body: "Welcome to ESL on the Plaza chat! Practice English, ask questions, and say hi.",
        created_at: new Date().toISOString(),
        display_name: "Plaza Bot",
        role: "teacher",
      };
      writeDemoMessages([welcome]);
      setMessages([welcome]);
    } else {
      setMessages(existing);
    }
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (!didInit.current) {
      el.scrollTop = el.scrollHeight;
      didInit.current = true;
      return;
    }
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

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
          let imageUrl: string | null = null;
          if (row.image_path) {
            const urls = await signChatImagePaths([row.image_path]);
            imageUrl = urls[row.image_path] ?? null;
          }

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
                image_path: row.image_path ?? null,
                image_width: row.image_width ?? null,
                image_height: row.image_height ?? null,
                imageUrl,
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

  function clearPreview() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparingPhoto(true);
    try {
      const prepared = await prepareChatImage(file);
      const url = URL.createObjectURL(prepared.blob);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          url,
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          ext: prepared.ext,
          mime: prepared.mime,
        };
      });
    } catch (err) {
      clearPreview();
      setError(err instanceof Error ? err.message : "Could not use that photo.");
    } finally {
      setPreparingPhoto(false);
    }
  }

  function send() {
    const text = body.trim();
    if (!text && !preview) return;
    if (sendingRef.current || pending) return;
    sendingRef.current = true;
    setError(null);
    const asAnnounce = canPin && announce;
    const photo = preview;
    stickRef.current = true;
    startTransition(async () => {
      try {
        if (isLocalDemo) {
          const form = new FormData();
          form.set("body", text);
          form.set("announce", asAnnounce ? "true" : "false");
          const result = await postChatMessage(null, form);
          if (result?.error) {
            setError(result.error);
            return;
          }
          const msg: ChatMessage = {
            id: crypto.randomUUID(),
            user_id: userId,
            body: text,
            created_at: new Date().toISOString(),
            display_name: displayName,
            role,
            is_announcement: asAnnounce,
            image_path: photo ? `demo/${crypto.randomUUID()}.${photo.ext}` : null,
            image_width: photo?.width ?? null,
            image_height: photo?.height ?? null,
            imageUrl: photo?.url ?? null,
          };
          const next = [...readDemoMessages(), msg];
          writeDemoMessages(next);
          setMessages(next);
          setBody("");
          setAnnounce(false);
          if (photo) setPreview(null);
          inputRef.current?.focus();
          return;
        }

        const form = new FormData();
        form.set("body", text);
        form.set("announce", asAnnounce ? "true" : "false");
        if (photo) {
          form.set(
            "image",
            new File([photo.blob], `photo.${photo.ext}`, { type: photo.mime }),
          );
          form.set("image_width", String(photo.width));
          form.set("image_height", String(photo.height));
        }
        const result = await postChatMessage(null, form);
        if (result?.error) {
          setError(result.error);
          return;
        }
        const sent = result?.message;
        if (sent) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === sent.id)) return prev;
            return [
              ...prev,
              {
                id: sent.id,
                user_id: sent.user_id,
                body: sent.body,
                created_at: sent.created_at,
                display_name: displayName,
                role,
                is_announcement: Boolean(sent.is_announcement),
                image_path: sent.image_path ?? null,
                image_width: sent.image_width ?? null,
                image_height: sent.image_height ?? null,
                imageUrl: sent.imageUrl ?? photo?.url ?? null,
              },
            ];
          });
        }
        setBody("");
        setAnnounce(false);
        clearPreview();
        inputRef.current?.focus();
      } finally {
        sendingRef.current = false;
      }
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
      const form = new FormData();
      form.set("message_id", id);
      const result = await deleteChatMessage(null, form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  }

  function openProfile(id: string) {
    if (id === "system") return;
    startProfile(async () => {
      const profile = await getPublicProfile(id);
      if (!profile) {
        setError("Could not open this profile.");
        return;
      }
      setViewing(profile);
    });
  }

  const pin = [...messages].reverse().find((m) => m.is_announcement);
  let lastDay = "";
  const canSend = !pending && !preparingPhoto && Boolean(body.trim() || preview);

  return (
    <div className="chat-app">
      {viewing && (
        <ProfileDialog profile={viewing} onClose={() => setViewing(null)} />
      )}
      {lightbox && (
        <ChatLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
      <header className="chat-app__header">
        <h1 className="chat-app__title">Community Chat</h1>
        <p className="chat-app__sub">
          Talk, ask questions, and stay in touch with the group.
        </p>
      </header>

      {pin && (
        <aside className="chat-pin">
          <p className="chat-pin__meta">
            {chatName(pin.display_name)} · Announcement
          </p>
          {pin.imageUrl && (
            <button
              type="button"
              className="chat-photo"
              onClick={() =>
                setLightbox({
                  src: pin.imageUrl!,
                  alt: pin.body.trim() || `Photo shared by ${chatName(pin.display_name)}`,
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pin.imageUrl} alt="" />
            </button>
          )}
          <MessageBody text={pin.body} />
        </aside>
      )}

      {error && <p className="error chat-app__error">{error}</p>}

      <div
        className="chat-log"
        ref={logRef}
        onScroll={() => {
          const el = logRef.current;
          if (!el) return;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 96;
        }}
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            <svg
              className="chat-empty__art"
              viewBox="0 0 72 48"
              aria-hidden="true"
            >
              <rect x="4" y="8" width="42" height="26" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M16 34v8l10-8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <rect x="28" y="2" width="40" height="22" rx="10" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
            </svg>
            <p>No messages yet.</p>
            <p>Start the conversation!</p>
          </div>
        )}
        {messages.map((msg, index) => {
          const day = dayLabel(msg.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = messages[index - 1];
          const continued =
            !showDay &&
            !msg.is_announcement &&
            !prev?.is_announcement &&
            prev?.user_id === msg.user_id;
          return (
            <div key={msg.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <MessageRowView
                msg={msg}
                continued={continued}
                mine={msg.user_id === userId}
                canDelete={canDeleteChatMessage(
                  { id: userId, role },
                  { user_id: msg.user_id, role: msg.role },
                )}
                onDelete={remove}
                onOpenProfile={openProfile}
                onOpenPhoto={(src, alt) => setLightbox({ src, alt })}
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
        {preview && (
          <div className="chat-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="Selected photo preview" />
            <button type="button" className="manage-text-btn" onClick={clearPreview}>
              Remove
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          hidden
          onChange={(e) => {
            void onPickPhoto(e.target.files?.[0]);
          }}
        />
        <button
          type="button"
          className="chat-photo-btn"
          aria-label="Add photo"
          onClick={() => fileRef.current?.click()}
          disabled={pending || preparingPhoto}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 6l1.2-2h5.6L16 6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </button>
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
          disabled={!canSend}
        >
          {pending ? "Sending…" : preparingPhoto ? "Preparing…" : "Send"}
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
