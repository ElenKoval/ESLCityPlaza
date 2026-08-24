"use client";

import { useEffect, useId, useRef, useState } from "react";

const HELP_EMAIL = "sunnychimeraworld@gmail.com";
const GMAIL_COMPOSE = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(HELP_EMAIL)}`;

export function FooterWebsiteHelp() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(HELP_EMAIL);
    } catch {
      window.prompt("Copy this email", HELP_EMAIL);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="site-footer__help" ref={rootRef}>
      <button
        type="button"
        className="site-footer__contact"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Website Help
      </button>
      {open && (
        <div className="site-footer__help-panel" id={panelId} role="dialog">
          <p className="site-footer__help-email">{HELP_EMAIL}</p>
          <div className="site-footer__help-actions">
            <button type="button" className="btn-primary" onClick={copyEmail}>
              {copied ? "Copied" : "Copy email"}
            </button>
            <a
              className="btn-secondary"
              href={GMAIL_COMPOSE}
              target="_blank"
              rel="noreferrer"
            >
              Open Gmail
            </a>
            <a className="btn-ghost" href={`mailto:${HELP_EMAIL}`}>
              Email app
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
