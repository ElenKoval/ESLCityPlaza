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

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm1 7V3.5L18.5 9H15zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h5v1.5H8V10z"
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

function topicPdfFilename(title: string) {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
  return `${base || "topic"}.pdf`;
}

function wrapPdfLines(
  doc: { getTextWidth: (t: string) => number; splitTextToSize: (t: string, w: number) => string[] },
  text: string,
  maxWidth: number,
) {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...doc.splitTextToSize(paragraph, maxWidth));
  }
  return lines;
}

async function downloadTopicPdf(title: string, body: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(title.trim() || "Topic", maxWidth);
  for (const line of titleLines) {
    if (y > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(line, marginX, y);
    y += 24;
  }

  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const bodyText = body.trim();
  if (bodyText) {
    const bodyLines = wrapPdfLines(doc, bodyText, maxWidth);
    for (const line of bodyLines) {
      if (y > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
      if (line === "") {
        y += 10;
        continue;
      }
      doc.text(line, marginX, y);
      y += 18;
    }
  }

  doc.save(topicPdfFilename(title));
}

export function TopicActions({
  title,
  bodyText,
  copyText,
}: {
  title: string;
  bodyText: string;
  copyText: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function onCopy() {
    const ok = await copyPlainText(copyText);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function onSavePdf() {
    setPdfError(null);
    setPdfBusy(true);
    try {
      await downloadTopicPdf(title, bodyText);
    } catch {
      setPdfError("Could not create PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="topic-actions">
      <button
        type="button"
        className="topic-action-btn"
        onClick={() => window.print()}
      >
        <PrintIcon />
        Print
      </button>
      <button
        type="button"
        className="topic-action-btn"
        onClick={onSavePdf}
        disabled={pdfBusy}
      >
        <PdfIcon />
        {pdfBusy ? "Saving…" : "Save PDF"}
      </button>
      <button type="button" className="topic-action-btn" onClick={onCopy}>
        <CopyIcon />
        {copied ? "Copied!" : "Copy text"}
      </button>
      {pdfError ? <p className="topic-actions__hint error">{pdfError}</p> : null}
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
      Print
    </button>
  );
}
