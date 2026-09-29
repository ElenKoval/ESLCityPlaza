"use client";

import { useState } from "react";

export function TopicCopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / insecure contexts
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(area);
      }
    }
  }

  return (
    <div className="topic-text__copy">
      <button type="button" className="btn-primary topic-text__copy-btn" onClick={copy}>
        {copied ? "Copied!" : "Copy text"}
      </button>
    </div>
  );
}
