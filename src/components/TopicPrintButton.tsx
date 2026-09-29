"use client";

import Link from "next/link";

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

function TextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h10v2H4v-2z"
      />
    </svg>
  );
}

function openPrintDialog() {
  window.print();
}

export function TopicActions({ topicId }: { topicId: string }) {
  return (
    <div className="topic-actions">
      <button
        type="button"
        className="topic-action-btn"
        onClick={openPrintDialog}
      >
        <PrintIcon />
        Print / Save as PDF
      </button>
      <Link href={`/topics/${topicId}/text`} className="topic-action-btn">
        <TextIcon />
        Text version
      </Link>
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
      onClick={openPrintDialog}
    >
      <PrintIcon />
      Print / Save as PDF
    </button>
  );
}
