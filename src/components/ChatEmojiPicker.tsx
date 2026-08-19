"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CHAT_EMOJI_GROUPS } from "@/lib/chat-emojis";

type PanelStyle = {
  left: number;
  bottom: number;
  width: number;
};

function measurePanel(anchor: HTMLButtonElement): PanelStyle {
  const margin = 12;
  const width = Math.min(280, window.innerWidth - margin * 2);
  const rect = anchor.getBoundingClientRect();
  let left = rect.left;
  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - margin - width;
  }
  left = Math.max(margin, left);
  const bottom = window.innerHeight - rect.top + 8;
  return { left, bottom, width };
}

export function ChatEmojiPicker({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (emoji: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState<PanelStyle | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;

    function updatePosition() {
      if (!btnRef.current) return;
      setPanelStyle(measurePanel(btnRef.current));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !wrapRef.current?.contains(target) &&
        !(target instanceof Element && target.closest(".chat-emoji-picker__panel"))
      ) {
        setOpen(false);
      }
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

  const panel =
    open && panelStyle && mounted
      ? createPortal(
          <div
            className="chat-emoji-picker__panel"
            role="dialog"
            aria-label="Choose an emoji"
            style={{
              position: "fixed",
              left: panelStyle.left,
              bottom: panelStyle.bottom,
              width: panelStyle.width,
            }}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="chat-emoji-picker" ref={wrapRef}>
      <button
        ref={btnRef}
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
      {panel}
    </div>
  );
}
