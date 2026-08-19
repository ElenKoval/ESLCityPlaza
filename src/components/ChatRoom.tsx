"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareChatImage, isHeicType, isAllowedChatImageType } from "@/lib/chat-image";
import { prepareChatFile, isChatTextFile } from "@/lib/chat-file";
import {
  getPublicProfile,
  postChatMessage,
  deleteChatMessage,
  setChatAnnouncement,
  signChatImagePaths,
  signChatFilePaths,
  checkChatAccess,
} from "@/app/actions";
import { markChatRead } from "@/app/chat-actions";
import { dispatchChatUnreadRefresh } from "@/lib/chat-unread";
import { canAnnounce, canDeleteChatMessage } from "@/lib/roles";
import { SITE_NAME } from "@/lib/site-name";
import { RoleBadge } from "@/components/RoleBadge";
import { ChatUnavailable } from "@/components/ChatUnavailable";
import {
  ChatOnlineMobileBar,
  ChatOnlineSheet,
  ChatOnlineSidebar,
} from "@/components/ChatOnlinePanel";
import {
  collectOnlineUsers,
  displayChatName,
  chatInitial,
  chatInitialColor,
  type ChatPresenceMeta,
} from "@/lib/chat-presence";
import { ProfileDialog } from "@/components/MemberProfileDialog";
import { chatTimeLabel, type ChatMessage } from "@/lib/chat";
import type { MessageRow, Role } from "@/lib/types";

const DEMO_CHAT_KEY = "esl-demo-chat";
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

const NEAR_BOTTOM_PX = 96;

function isInnerScroller(el: HTMLElement) {
  return el.scrollHeight > el.clientHeight + 4;
}

function isWindowNearBottom() {
  const doc = document.documentElement;
  return (
    window.innerHeight + window.scrollY >= doc.scrollHeight - NEAR_BOTTOM_PX
  );
}

function applyAnnouncementPin(
  messages: ChatMessage[],
  id: string,
  pinned: boolean,
): ChatMessage[] {
  return messages.map((msg) => ({
    ...msg,
    is_announcement: pinned
      ? msg.id === id
      : msg.id === id
        ? false
        : Boolean(msg.is_announcement),
  }));
}

function withNewChatMessage(messages: ChatMessage[], incoming: ChatMessage) {
  const base = incoming.is_announcement
    ? messages.map((msg) => ({ ...msg, is_announcement: false }))
    : messages;
  return [...base, incoming];
}

function pinnedAnnouncementPreview(msg: ChatMessage) {
  const text = msg.body.trim();
  if (text) return { text, fallback: false };
  if (msg.imageUrl || msg.image_path) {
    return { text: "Photo announcement", fallback: true };
  }
  if (msg.fileUrl || msg.file_path) {
    return { text: "File announcement", fallback: true };
  }
  return { text: "Photo announcement", fallback: true };
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

function CloseX() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M5 5l14 14M19 5L5 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
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
        <button
          type="button"
          className="chat-x-btn chat-lightbox__close"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseX />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="chat-lightbox__img" />
      </div>
    </div>
  );
}

function ChatTextFileModal({
  name,
  src,
  onClose,
}: {
  name: string;
  src: string;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setLoadError(null);
    void fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("Could not open that file.");
        return res.text();
      })
      .then((value) => {
        if (!cancelled) setText(value);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not open that file.");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div className="chat-lightbox" role="presentation" onClick={onClose}>
      <div
        className="chat-file-modal"
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-file-modal__top">
          <p className="chat-file-modal__name">{name}</p>
          <button
            type="button"
            className="chat-x-btn chat-file-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseX />
          </button>
        </div>
        {loadError && <p className="error">{loadError}</p>}
        {!loadError && text === null && <p>Opening file…</p>}
        {text !== null && <pre className="chat-file-modal__body">{text}</pre>}
      </div>
    </div>
  );
}

function MessageMenu({
  onDelete,
  onPin,
  onUnpin,
}: {
  onDelete?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
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

  if (!onDelete && !onPin && !onUnpin) return null;

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
          {onPin && (
            <button
              type="button"
              className="chat-msg-menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPin();
              }}
            >
              Pin as announcement
            </button>
          )}
          {onUnpin && (
            <button
              type="button"
              className="chat-msg-menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onUnpin();
              }}
            >
              Unpin announcement
            </button>
          )}
          {onDelete && (
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
          )}
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
  canPin,
  onDelete,
  onPin,
  onUnpin,
  onOpenProfile,
  onOpenPhoto,
  onOpenFile,
}: {
  msg: ChatMessage;
  continued: boolean;
  mine: boolean;
  canDelete: boolean;
  canPin: boolean;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onOpenProfile: (userId: string) => void;
  onOpenPhoto: (src: string, alt: string) => void;
  onOpenFile: (src: string, name: string) => void;
}) {
  const name = displayChatName(msg.display_name);
  const canOpen = msg.user_id !== "system";
  const alt = msg.body.trim()
    ? msg.body.trim()
    : `Photo shared by ${name}`;
  const photo = msg.imageUrl;
  const fileUrl = msg.fileUrl;
  const fileName = msg.file_name || "note.txt";
  const menu =
    (canDelete || canPin) && (
      <MessageMenu
        onDelete={canDelete ? () => onDelete(msg.id) : undefined}
        onPin={canPin && !msg.is_announcement ? () => onPin(msg.id) : undefined}
        onUnpin={canPin && msg.is_announcement ? () => onUnpin(msg.id) : undefined}
      />
    );

  return (
    <article
      className={`chat-msg${msg.is_announcement ? " is-announce" : ""}${mine ? " is-mine" : ""}${continued ? " is-continued" : ""}`}
    >
      {!mine &&
        (continued ? (
          <span className="chat-avatar chat-avatar--spacer" aria-hidden="true" />
        ) : canOpen ? (
          <button
            type="button"
            className="chat-avatar"
            style={{ background: chatInitialColor(msg.avatar_color) }}
            onClick={() => onOpenProfile(msg.user_id)}
            aria-label={`View ${name}'s profile`}
          >
            {chatInitial(name)}
          </button>
        ) : (
          <span
            className="chat-avatar"
            style={{ background: chatInitialColor(msg.avatar_color) }}
            aria-hidden="true"
          >
            {chatInitial(name)}
          </span>
        ))}
      <div className="chat-msg__main">
        {mine ? (
          <p className="chat-msg__meta">
            <span className="chat-msg__time">{chatTimeLabel(msg.created_at)}</span>
            {menu}
          </p>
        ) : (
          <>
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
                {menu}
              </p>
            )}
            {continued && menu && (
              <div className="chat-msg__continued-actions">
                <span className="chat-msg__time">{chatTimeLabel(msg.created_at)}</span>
                {menu}
              </div>
            )}
          </>
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
        {fileUrl && (
          <button
            type="button"
            className="chat-file"
            onClick={() => onOpenFile(fileUrl, fileName)}
          >
            <span className="chat-file__badge">TXT</span>
            <span className="chat-file__name">{fileName}</span>
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
  avatarColor,
  chatAllowed = true,
}: {
  initialMessages: ChatMessage[];
  userId: string;
  displayName?: string;
  role?: Role;
  avatarColor?: string | null;
  chatAllowed?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [allowed, setAllowed] = useState(chatAllowed);
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
  const [fileView, setFileView] = useState<{ src: string; name: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<
    | {
        kind: "photo";
        url: string;
        blob: Blob;
        width: number;
        height: number;
        ext: "webp" | "jpg";
        mime: "image/webp" | "image/jpeg";
      }
    | { kind: "file"; name: string; blob: Blob }
    | null
  >(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<ChatPresenceMeta[]>([]);
  const [presenceReady, setPresenceReady] = useState(false);
  const [onlineSheetOpen, setOnlineSheetOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const didInit = useRef(false);
  const sendingRef = useRef(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const canPin = canAnnounce(role);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const { allowed: ok } = await checkChatAccess();
      if (cancelled) return;
      if (!ok) {
        setAllowed(false);
        setMessages([]);
        setOnlineUsers([]);
        setPresenceReady(false);
        setOnlineSheetOpen(false);
        setPreview((current) => {
          if (current?.kind === "photo") URL.revokeObjectURL(current.url);
          return null;
        });
        setError(null);
      }
    }

    void verify();
    const onVisible = () => {
      if (document.visibilityState === "visible") void verify();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void verify(), 15000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    if (!isLocalDemo) return;
    const existing = readDemoMessages();
    if (existing.length === 0) {
      const welcome: ChatMessage = {
        id: "welcome",
        user_id: "system",
        body: `Welcome to ${SITE_NAME} chat! Practice English, ask questions, and say hi.`,
        created_at: new Date().toISOString(),
        display_name: "Plaza Bot",
        role: "teacher",
      };
      writeDemoMessages([welcome]);
      setMessages([welcome]);
    } else {
      setMessages(existing);
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void markChatRead().then(() => {
      dispatchChatUnreadRefresh();
    });
  }, [allowed]);

  function scrollChatToLatest(smooth = false) {
    const el = logRef.current;
    if (el && isInnerScroller(el)) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "end",
    });
  }

  useEffect(() => {
    if (!didInit.current) {
      scrollChatToLatest(false);
      didInit.current = true;
      return;
    }
    if (stickRef.current) {
      scrollChatToLatest(true);
    }
  }, [messages]);

  useEffect(() => {
    const onWindowScroll = () => {
      const el = logRef.current;
      if (el && isInnerScroller(el)) return;
      stickRef.current = isWindowNearBottom();
    };
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const update = () => {
      if (!vv) {
        root.style.setProperty("--chat-keyboard-inset", "0px");
        return;
      }
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--chat-keyboard-inset", `${Math.round(inset)}px`);
    };
    update();
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      root.style.removeProperty("--chat-keyboard-inset");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.kind === "photo") URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    if (!allowed) return;

    if (isLocalDemo) {
      setOnlineUsers([
        { user_id: userId, display_name: displayName, role, avatar_color: avatarColor },
      ]);
      setPresenceReady(true);

      const onStorage = (e: StorageEvent) => {
        if (e.key === DEMO_CHAT_KEY) setMessages(readDemoMessages());
      };
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("storage", onStorage);
        setOnlineUsers([]);
        setPresenceReady(false);
      };
    }

    const supabase = createClient();
    const channel = supabase.channel("plaza-chat", {
      config: { presence: { key: userId } },
    });

    const syncOnline = () => {
      const state = channel.presenceState<ChatPresenceMeta>();
      setOnlineUsers(collectOnlineUsers(state));
      setPresenceReady(true);
    };

    channel
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const row = payload.new as MessageRow;
          const withColor = await supabase
            .from("profiles")
            .select("display_name, role, avatar_color")
            .eq("id", row.user_id)
            .maybeSingle();
          const { data: profile } = withColor.error
            ? await supabase
                .from("profiles")
                .select("display_name, role")
                .eq("id", row.user_id)
                .maybeSingle()
            : withColor;
          let imageUrl: string | null = null;
          if (row.image_path) {
            const urls = await signChatImagePaths([row.image_path]);
            imageUrl = urls[row.image_path] ?? null;
          }
          let fileUrl: string | null = null;
          if (row.file_path) {
            const urls = await signChatFilePaths([row.file_path]);
            fileUrl = urls[row.file_path] ?? null;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const incoming: ChatMessage = {
                id: row.id,
                user_id: row.user_id,
                body: row.body,
                created_at: row.created_at,
                display_name: profile?.display_name ?? "Member",
                role: (profile?.role as Role) ?? "student",
                avatar_color:
                  (profile as { avatar_color?: string | null } | null)
                    ?.avatar_color ?? null,
                is_announcement: Boolean(row.is_announcement),
                image_path: row.image_path ?? null,
                image_width: row.image_width ?? null,
                image_height: row.image_height ?? null,
                imageUrl,
                file_path: row.file_path ?? null,
                file_name: row.file_name ?? null,
                fileUrl,
            };
            const base = incoming.is_announcement
              ? prev.map((m) => ({ ...m, is_announcement: false }))
              : prev;
            return [...base, incoming];
          });
          void markChatRead().then(() => {
            dispatchChatUnreadRefresh();
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row.id) return;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === row.id) {
                return {
                  ...m,
                  body: row.body ?? m.body,
                  is_announcement: Boolean(row.is_announcement),
                };
              }
              if (row.is_announcement) {
                return { ...m, is_announcement: false };
              }
              return m;
            }),
          );
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            display_name: displayName,
            role,
            avatar_color: avatarColor,
          });
          syncOnline();
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      setOnlineUsers([]);
      setPresenceReady(false);
    };
  }, [allowed, userId, displayName, role, avatarColor]);

  function clearPreview() {
    setPreview((current) => {
      if (current?.kind === "photo") URL.revokeObjectURL(current.url);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickAttachment(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreparingPhoto(true);
    try {
      if (isChatTextFile(file)) {
        const prepared = await prepareChatFile(file);
        setPreview((current) => {
          if (current?.kind === "photo") URL.revokeObjectURL(current.url);
          return { kind: "file", name: prepared.name, blob: prepared.blob };
        });
        return;
      }
      const looksImage =
        isHeicType(file) ||
        isAllowedChatImageType(file.type) ||
        /\.(jpe?g|png|webp)$/i.test(file.name);
      if (!looksImage) {
        throw new Error("Please choose a photo or a .txt file.");
      }
      const prepared = await prepareChatImage(file);
      const url = URL.createObjectURL(prepared.blob);
      setPreview((current) => {
        if (current?.kind === "photo") URL.revokeObjectURL(current.url);
        return {
          kind: "photo",
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
      setError(err instanceof Error ? err.message : "Could not use that file.");
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
    const photo = preview?.kind === "photo" ? preview : null;
    const textFile = preview?.kind === "file" ? preview : null;
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
            file_path: textFile ? `demo/${crypto.randomUUID()}.txt` : null,
            file_name: textFile?.name ?? null,
            fileUrl: textFile ? URL.createObjectURL(textFile.blob) : null,
          };
          const next = withNewChatMessage(readDemoMessages(), msg);
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
        if (textFile) {
          form.set(
            "text_file",
            new File([textFile.blob], textFile.name, { type: "text/plain" }),
          );
          form.set("file_name", textFile.name);
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
            return withNewChatMessage(prev, {
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
                file_path: sent.file_path ?? null,
                file_name: sent.file_name ?? null,
                fileUrl: sent.fileUrl ?? null,
            });
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

  function setPinned(id: string, pinned: boolean) {
    startTransition(async () => {
      if (isLocalDemo) {
        const next = applyAnnouncementPin(readDemoMessages(), id, pinned);
        writeDemoMessages(next);
        setMessages(next);
        return;
      }
      const form = new FormData();
      form.set("message_id", id);
      form.set("pinned", pinned ? "true" : "false");
      const result = await setChatAnnouncement(null, form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessages((prev) => applyAnnouncementPin(prev, id, pinned));
    });
  }

  function jumpToMessage(id: string) {
    stickRef.current = false;
    setFlashId(id);
    const reveal = () => {
      document.getElementById(`chat-msg-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    };
    requestAnimationFrame(reveal);
    window.setTimeout(() => {
      setFlashId((current) => (current === id ? null : current));
    }, 1600);
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

  function openOnlineProfile(id: string) {
    setOnlineSheetOpen(false);
    openProfile(id);
  }

  if (!allowed) {
    return <ChatUnavailable />;
  }

  const pin = [...messages].reverse().find((m) => m.is_announcement);
  const pinPreview = pin ? pinnedAnnouncementPreview(pin) : null;
  let lastDay = "";
  const canSend = !pending && !preparingPhoto && Boolean(body.trim() || preview);

  return (
    <div className="chat-layout">
      <div className="chat-layout__main">
        <div className="chat-app">
      {viewing && (
        <ProfileDialog
          profile={viewing}
          viewerId={userId}
          onClose={() => setViewing(null)}
        />
      )}
      {lightbox && (
        <ChatLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
      {fileView && (
        <ChatTextFileModal
          src={fileView.src}
          name={fileView.name}
          onClose={() => setFileView(null)}
        />
      )}
      <header className="chat-app__header">
        <h1 className="chat-app__title">Community Chat</h1>
        <p className="chat-app__sub">
          Talk, ask questions, and stay in touch with the group.
        </p>
      </header>

      <ChatOnlineMobileBar
        users={onlineUsers}
        ready={presenceReady}
        onOpen={() => setOnlineSheetOpen(true)}
      />

      {pin && pinPreview && (
        <aside className="chat-pin">
          <p className="chat-pin__meta">
            Announcement from {displayChatName(pin.display_name)}
          </p>
          <p
            className={`chat-pin__excerpt${pinPreview.fallback ? " is-fallback" : ""}`}
          >
            {pinPreview.text}
          </p>
          <button
            type="button"
            className="chat-pin__jump"
            onClick={() => jumpToMessage(pin.id)}
          >
            View message
          </button>
        </aside>
      )}

      {error && <p className="error chat-app__error">{error}</p>}

      <div
        className="chat-log"
        ref={logRef}
        onScroll={() => {
          const el = logRef.current;
          if (!el || !isInnerScroller(el)) return;
          stickRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
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
            <div
              key={msg.id}
              id={`chat-msg-${msg.id}`}
              className={`chat-log__row${flashId === msg.id ? " is-flash" : ""}`}
            >
              {showDay && <div className="chat-day">{day}</div>}
              <MessageRowView
                msg={msg}
                continued={continued}
                mine={msg.user_id === userId}
                canDelete={canDeleteChatMessage(
                  { id: userId, role },
                  { user_id: msg.user_id, role: msg.role },
                )}
                canPin={canPin}
                onDelete={remove}
                onPin={(id) => setPinned(id, true)}
                onUnpin={(id) => setPinned(id, false)}
                onOpenProfile={openProfile}
                onOpenPhoto={(src, alt) => setLightbox({ src, alt })}
                onOpenFile={(src, name) => setFileView({ src, name })}
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
        {preview?.kind === "photo" && (
          <div className="chat-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="Selected photo preview" />
            <button
              type="button"
              className="chat-x-btn chat-preview__remove"
              aria-label="Remove photo"
              onClick={clearPreview}
            >
              <CloseX />
            </button>
          </div>
        )}
        {preview?.kind === "file" && (
          <div className="chat-preview chat-preview--file">
            <span className="chat-file__badge">TXT</span>
            <span className="chat-file__name">{preview.name}</span>
            <button
              type="button"
              className="chat-x-btn chat-preview__remove"
              aria-label="Remove file"
              onClick={clearPreview}
            >
              <CloseX />
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.txt,text/plain"
          hidden
          onChange={(e) => {
            void onPickAttachment(e.target.files?.[0]);
          }}
        />
        <button
          type="button"
          className="chat-photo-btn"
          aria-label="Add photo or text file"
          onClick={() => fileRef.current?.click()}
          disabled={pending || preparingPhoto}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 4v16M4 12h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <textarea
          ref={inputRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message..."
          maxLength={2000}
          rows={1}
          onFocus={() => {
            stickRef.current = true;
            const reveal = () => {
              inputRef.current?.scrollIntoView({
                block: "center",
                behavior: "auto",
              });
            };
            requestAnimationFrame(reveal);
            window.setTimeout(reveal, 350);
          }}
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
            <span>Announcement</span>
          </label>
        )}
      </form>
        </div>
      </div>
      <ChatOnlineSidebar
        users={onlineUsers}
        ready={presenceReady}
        onOpenProfile={openOnlineProfile}
      />
      <ChatOnlineSheet
        users={onlineUsers}
        ready={presenceReady}
        open={onlineSheetOpen}
        onClose={() => setOnlineSheetOpen(false)}
        onOpenProfile={openOnlineProfile}
      />
    </div>
  );
}
