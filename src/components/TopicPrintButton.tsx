"use client";

import { useState } from "react";

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3h12v4H6V3zm-2 7h16v6h-4v4H8v-4H4v-6zm2 0v2h12v-2H6zm2 8h8v-2H8v2z"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"
      />
    </svg>
  );
}

async function copyPlainText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(area);
    }
  }
}

export function TopicActions({ copyText }: { copyText: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyPlainText(copyText);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="topic-actions">
      <button
        type="button"
        className="topic-action-btn"
        onClick={() => window.print()}
      >
        <PrintIcon />
        Print / Save as PDF
      </button>
      <button type="button" className="topic-action-btn" onClick={onCopy}>
        <CopyIcon />
        {copied ? "Copied!" : "Copy text"}
      </button>
      <p className="topic-actions__hint topic-no-print">
        You can save a PDF from the print dialog.
      </p>
    </div>
  );
}

/** @deprecated Use TopicActions */
export function TopicPrintButton() {
  return (
    <button
      type="button"
      className="topic-action-btn"
      onClick={() => window.print()}
    >
      <PrintIcon />
      Print / Save as PDF
    </button>
  );
}
