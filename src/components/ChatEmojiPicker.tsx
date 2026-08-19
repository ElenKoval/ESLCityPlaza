"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_EMOJI_GROUPS } from "@/lib/chat-emojis";

export function ChatEmojiPicker({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (emoji: string) => void;
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
    <div className="chat-emoji-picker" ref={wrapRef}>
      <button
        type="button"
        className="chat-photo-btn chat-emoji-btn"
        aria-label="Add emoji"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8.5 10.2h.01M15.5 10.2h.01M8.4 14.4c.9 1.1 2.2 1.7 3.6 1.7s2.7-.6 3.6-1.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className="chat-emoji-picker__panel"
          role="dialog"
          aria-label="Choose an emoji"
        >
          {CHAT_EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="chat-emoji-picker__group">
              <p className="chat-emoji-picker__label">{group.label}</p>
              <div className="chat-emoji-picker__grid">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="chat-emoji-picker__item"
                    aria-label={emoji}
                    onClick={() => {
                      onPick(emoji);
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
