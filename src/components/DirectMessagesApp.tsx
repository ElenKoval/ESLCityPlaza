"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareChatImage, isHeicType, isAllowedChatImageType } from "@/lib/chat-image";
import {
  blockDirectMember,
  deleteDirectMessage,
  getDirectConversationList,
  markDirectConversationRead,
  sendDirectMessage,
  signDirectImagePaths,
  unblockDirectMember,
} from "@/app/dm-actions";
import {
  DM_BLOCKED_SEND,
  dispatchDmUnreadRefresh,
  dmListTimeLabel,
} from "@/lib/direct-messages";
import {
  chatInitial,
  chatInitialColor,
  displayChatName,
  showOnlineRoleBadge,
} from "@/lib/chat-presence";
import { chatTimeLabel } from "@/lib/chat";
import { insertIntoTextarea } from "@/lib/chat-emojis";
import { ChatEmojiPicker } from "@/components/ChatEmojiPicker";
import { RoleBadge } from "@/components/RoleBadge";
import { ProfileDialog } from "@/components/MemberProfileDialog";
import { DmMemberPicker } from "@/components/DmMemberPicker";
import { getPublicProfile } from "@/app/actions";
import type {
  DirectConversationListItem,
  DirectThreadMessage,
  Role,
} from "@/lib/types";

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
  return <p className="chat-msg__body">{text}</p>;
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

const DM_MULTI_PHOTOS_MAX = 10;

type DmPhotoPreview = {
  id: string;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  mime: "image/webp" | "image/jpeg";
};

function DmLightbox({
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
    <div className="profile-dialog" role="presentation" onClick={onClose}>
      <div
        className="chat-lightbox"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} />
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function DirectMessagesApp({
  userId,
  conversations: initialConversations,
  activeId,
  otherName,
  otherId,
  otherRole,
  otherAvatarColor,
  blockedByMe: initialBlockedByMe,
  blockedEitherWay: initialBlocked,
  messages: initialMessages,
  setupNeeded,
}: {
  userId: string;
  conversations: DirectConversationListItem[];
  activeId?: string;
  otherName?: string;
  otherId?: string;
  otherRole?: Role;
  otherAvatarColor?: string | null;
  blockedByMe?: boolean;
  blockedEitherWay?: boolean;
  messages?: DirectThreadMessage[];
  setupNeeded?: boolean;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages ?? []);
  const [blockedByMe, setBlockedByMe] = useState(Boolean(initialBlockedByMe));
  const [blockedEitherWay, setBlockedEitherWay] = useState(
    Boolean(initialBlocked),
  );
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startMenu] = useTransition();
  const [viewing, setViewing] = useState<Awaited<
    ReturnType<typeof getPublicProfile>
  >>(null);
  const [picking, setPicking] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [previews, setPreviews] = useState<DmPhotoPreview[]>([]);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);

  function applyConversationList(items: DirectConversationListItem[]) {
    setConversations(
      items.map((item) =>
        item.id === activeId ? { ...item, unread: false } : item,
      ),
    );
  }

  useEffect(() => {
    setMessages(initialMessages ?? []);
    setBlockedByMe(Boolean(initialBlockedByMe));
    setBlockedEitherWay(Boolean(initialBlocked));
  }, [initialMessages, initialBlockedByMe, initialBlocked, activeId]);

  useEffect(() => {
    if (!activeId) return;
    setConversations((prev) =>
      prev.map((item) =>
        item.id === activeId ? { ...item, unread: false } : item,
      ),
    );
    void markDirectConversationRead(activeId).then(() => {
      dispatchDmUnreadRefresh();
    });
  }, [activeId]);

  useEffect(() => {
    if (!stickRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeId]);

  useEffect(() => {
    let cancelled = false;
    async function loadList() {
      const items = await getDirectConversationList();
      if (!cancelled && items) applyConversationList(items);
    }
    void loadList();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return () => {
        cancelled = true;
      };
    }
    const supabase = createClient();
    const channel = supabase.channel(`dm-${userId}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "direct_conversations" },
      () => {
        void loadList();
        router.refresh();
      },
    );

    if (activeId) {
      channel
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "direct_messages",
            filter: `conversation_id=eq.${activeId}`,
          },
          async (payload) => {
            const row = payload.new as DirectThreadMessage;
            let imageUrl: string | null = null;
            if (row.image_path) {
              const urls = await signDirectImagePaths([row.image_path]);
              imageUrl = urls[row.image_path] ?? null;
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [
                ...prev,
                {
                  id: row.id,
                  sender_id: row.sender_id,
                  body: row.body,
                  created_at: row.created_at,
                  image_path: row.image_path,
                  image_width: row.image_width,
                  image_height: row.image_height,
                  imageUrl,
                },
              ];
            });
            void markDirectConversationRead(activeId).then(() => {
              dispatchDmUnreadRefresh();
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "direct_messages",
            filter: `conversation_id=eq.${activeId}`,
          },
          (payload) => {
            const row = payload.old as { id?: string };
            if (row.id) {
              setMessages((prev) => prev.filter((m) => m.id !== row.id));
            }
            router.refresh();
          },
        );
    }

    channel.subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId, activeId, router]);

  async function onPickPhotos(fileList: FileList | null) {
    const files = fileList ? [...fileList] : [];
    if (!files.length) return;
    setError(null);
    setPreparingPhoto(true);
    try {
      const imageFiles = files.filter(
        (file) =>
          isHeicType(file) ||
          isAllowedChatImageType(file.type) ||
          /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name),
      );
      if (!imageFiles.length || imageFiles.length !== files.length) {
        setError("Please choose JPEG, PNG, WebP, or HEIC photos.");
        return;
      }
      const roomLeft = DM_MULTI_PHOTOS_MAX - previews.length;
      if (roomLeft <= 0) {
        setError(`You can attach up to ${DM_MULTI_PHOTOS_MAX} photos.`);
        return;
      }
      const toPrepare = imageFiles.slice(0, roomLeft);
      const preparedItems: DmPhotoPreview[] = [];
      for (const file of toPrepare) {
        const prepared = await prepareChatImage(file);
        preparedItems.push({
          id: crypto.randomUUID(),
          url: URL.createObjectURL(prepared.blob),
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          mime: prepared.mime,
        });
      }
      setPreviews((current) =>
        [...current, ...preparedItems].slice(0, DM_MULTI_PHOTOS_MAX),
      );
      if (imageFiles.length > toPrepare.length) {
        setError(`Only the first ${DM_MULTI_PHOTOS_MAX} photos were added.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare that photo.");
    } finally {
      setPreparingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearPreviews() {
    setPreviews((current) => {
      for (const item of current) URL.revokeObjectURL(item.url);
      return [];
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePreview(id: string) {
    setPreviews((current) =>
      current.filter((item) => {
        if (item.id !== id) return true;
        URL.revokeObjectURL(item.url);
        return false;
      }),
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  function insertEmoji(emoji: string) {
    const next = insertIntoTextarea(body, emoji, inputRef.current);
    if (next !== null) setBody(next);
  }

  function send() {
    if (!activeId || blockedEitherWay) return;
    if (!body.trim() && !previews.length) return;
    const caption = body.trim();
    const photos = [...previews];
    startTransition(async () => {
      for (let i = 0; i < Math.max(photos.length, 1); i++) {
        const photo = photos[i];
        if (!photo && !caption) break;
        const fd = new FormData();
        fd.set("conversation_id", activeId);
        fd.set("body", i === 0 ? caption : "");
        if (photo) {
          fd.set(
            "image",
            new File(
              [photo.blob],
              `photo.${photo.mime === "image/webp" ? "webp" : "jpg"}`,
              { type: photo.mime },
            ),
          );
          fd.set("image_width", String(photo.width));
          fd.set("image_height", String(photo.height));
        }
        const result = await sendDirectMessage(null, fd);
        if (result?.error) {
          setError(result.error);
          return;
        }
        if (result?.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === result.message!.id)
              ? prev
              : [...prev, result.message!],
          );
        }
        if (!photos.length) break;
      }
      setBody("");
      clearPreviews();
      dispatchDmUnreadRefresh();
      router.refresh();
    });
  }

  const canSend =
    !pending &&
    !preparingPhoto &&
    !blockedEitherWay &&
    Boolean(body.trim() || previews.length);

  return (
    <div className={`dm-shell${activeId ? " dm-shell--thread" : " dm-shell--list"}`}>
      {viewing && (
        <ProfileDialog
          profile={viewing}
          viewerId={userId}
          onClose={() => setViewing(null)}
        />
      )}
      {picking && <DmMemberPicker onClose={() => setPicking(false)} />}
      {lightbox && (
        <DmLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

      <aside className="dm-list">
        <div className="dm-list__head">
          <h1 className="dm-list__title">Direct Messages</h1>
          <button
            type="button"
            className="dm-new-btn"
            onClick={() => setPicking(true)}
          >
            + New message
          </button>
        </div>
        {setupNeeded && (
          <p className="activity-note">
            Run <code>supabase/direct-messages-upgrade.sql</code> in the
            Supabase SQL Editor to turn this on.
          </p>
        )}
        {conversations.length === 0 && !setupNeeded ? (
          <div className="dm-empty">
            <p>No conversations yet.</p>
            <p>Start a private conversation with another member.</p>
          </div>
        ) : (
          <ul className="dm-convos">
            {conversations.map((item) => {
              const name = displayChatName(item.otherName);
              const unread = item.unread && item.id !== activeId;
              return (
                <li key={item.id}>
                  <Link
                    href={`/messages/${item.id}`}
                    className={`dm-convo${item.id === activeId ? " is-active" : ""}${unread ? " is-unread" : ""}`}
                    prefetch={false}
                  >
                    <span
                      className="chat-avatar"
                      style={{ background: chatInitialColor(item.otherAvatarColor) }}
                      aria-hidden="true"
                    >
                      {chatInitial(name)}
                    </span>
                    <span className="dm-convo__text">
                      <span className="dm-convo__top">
                        <strong>{name}</strong>
                        {showOnlineRoleBadge(item.otherRole) && (
                          <RoleBadge role={item.otherRole} />
                        )}
                        <span className="dm-convo__time">
                          {dmListTimeLabel(item.lastMessageAt)}
                        </span>
                      </span>
                      <span className="dm-convo__preview">
                        {item.lastPreview || "No messages yet"}
                      </span>
                    </span>
                    {unread && (
                      <span className="dm-unread" aria-label="Unread" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="dm-thread">
        {!activeId ? (
          <p className="dm-pick">Select a conversation to start messaging.</p>
        ) : (
          <>
            <header className="dm-thread__head">
              <Link href="/messages" className="dm-back">
                ← Direct Messages
                {otherName ? (
                  <span className="dm-back__name">
                    {" "}
                    · {displayChatName(otherName)}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                className="dm-thread__who"
                onClick={async () => {
                  if (!otherId) return;
                  const profile = await getPublicProfile(otherId);
                  if (profile) setViewing(profile);
                }}
              >
                {displayChatName(otherName || "Member")}
                {otherRole && showOnlineRoleBadge(otherRole) && (
                  <RoleBadge role={otherRole} />
                )}
              </button>
              {blockedByMe ? (
                <button
                  type="button"
                  className="manage-text-btn"
                  onClick={() => {
                    if (!otherId) return;
                    startMenu(async () => {
                      const result = await unblockDirectMember(otherId);
                      if (result?.error) setError(result.error);
                      else {
                        setBlockedByMe(false);
                        router.refresh();
                      }
                    });
                  }}
                >
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  className="manage-text-btn"
                  onClick={() => {
                    if (!otherId) return;
                    if (!confirm("Block messages from this person?")) return;
                    startMenu(async () => {
                      const result = await blockDirectMember(otherId);
                      if (result?.error) setError(result.error);
                      else {
                        setBlockedByMe(true);
                        setBlockedEitherWay(true);
                        router.refresh();
                      }
                    });
                  }}
                >
                  Block messages from this person
                </button>
              )}
            </header>

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
                  <p>No messages yet.</p>
                  <p>Start the conversation!</p>
                </div>
              )}
              {messages.map((msg, index) => {
                const day = dayLabel(msg.created_at);
                const prev = messages[index - 1];
                const showDay =
                  index === 0 || dayLabel(prev.created_at) !== day;
                const mine = msg.sender_id === userId;
                const continued =
                  !showDay && prev?.sender_id === msg.sender_id;
                const name = displayChatName(otherName || "Member");
                const alt = msg.body.trim() || `Photo shared by ${name}`;
                return (
                  <div key={msg.id}>
                    {showDay && <div className="chat-day">{day}</div>}
                    <article
                      className={`chat-msg${mine ? " is-mine" : ""}${continued ? " is-continued" : ""}`}
                    >
                      {!mine &&
                        (continued ? (
                          <span
                            className="chat-avatar chat-avatar--spacer"
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className="chat-avatar"
                            style={{ background: chatInitialColor(otherAvatarColor) }}
                            aria-hidden="true"
                          >
                            {chatInitial(name)}
                          </span>
                        ))}
                      <div className="chat-msg__main">
                        {mine ? (
                          <p className="chat-msg__meta">
                            <span className="chat-msg__time">
                              {chatTimeLabel(msg.created_at)}
                            </span>
                            <button
                              type="button"
                              className="chat-msg__delete"
                              onClick={() => {
                                const fd = new FormData();
                                fd.set("message_id", msg.id);
                                startTransition(async () => {
                                  const result = await deleteDirectMessage(null, fd);
                                  if (result?.error) setError(result.error);
                                  else {
                                    setMessages((prevMsgs) =>
                                      prevMsgs.filter((m) => m.id !== msg.id),
                                    );
                                    router.refresh();
                                  }
                                });
                              }}
                            >
                              Delete
                            </button>
                          </p>
                        ) : (
                          !continued && (
                            <p className="chat-msg__meta">
                              <span className="chat-msg__name">{name}</span>
                              <span className="chat-msg__dot">·</span>
                              <span className="chat-msg__time">
                                {chatTimeLabel(msg.created_at)}
                              </span>
                            </p>
                          )
                        )}
                        {msg.imageUrl && (
                          <button
                            type="button"
                            className="chat-photo"
                            onClick={() =>
                              setLightbox({ src: msg.imageUrl!, alt })
                            }
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.imageUrl}
                              alt={alt}
                              width={msg.image_width || undefined}
                              height={msg.image_height || undefined}
                            />
                          </button>
                        )}
                        <MessageBody text={msg.body} />
                      </div>
                    </article>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {blockedEitherWay ? (
              <p className="dm-blocked">{DM_BLOCKED_SEND}</p>
            ) : (
              <form
                className="chat-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                {previews.length > 0 && (
                  <div className="chat-preview-strip" aria-label="Selected photos">
                    {previews.map((item, index) => (
                      <div key={item.id} className="chat-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.url}
                          alt={`Selected photo ${index + 1}`}
                        />
                        <button
                          type="button"
                          className="chat-x-btn chat-preview__remove"
                          aria-label={`Remove photo ${index + 1}`}
                          onClick={() => removePreview(item.id)}
                        >
                          <CloseX />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  multiple
                  hidden
                  onChange={(e) => void onPickPhotos(e.target.files)}
                />
                <div className="chat-compose__actions">
                  <button
                    type="button"
                    className="chat-photo-btn"
                    aria-label="Add photos"
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
                  <ChatEmojiPicker
                    disabled={pending || preparingPhoto}
                    onPick={insertEmoji}
                  />
                </div>
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
                <button className="btn-primary" type="submit" disabled={!canSend}>
                  {pending ? "Sending…" : preparingPhoto ? "Preparing…" : "Send"}
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
