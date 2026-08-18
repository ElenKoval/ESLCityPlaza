"use client";

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

export function TopicPrintButton() {
  return (
    <button
      type="button"
      className="topic-print-btn"
      onClick={() => window.print()}
    >
      <PrintIcon />
      Print
    </button>
  );
}
