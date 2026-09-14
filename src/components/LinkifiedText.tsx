import type { ReactNode } from "react";

const URL_SPLIT = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const URL_MATCH = /^(https?:\/\/|www\.)/i;

/** Render plain text with http(s)/www URLs as safe external links. */
export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  const parts = text.split(URL_SPLIT);
  const nodes: ReactNode[] = parts.map((part, i) => {
    if (!URL_MATCH.test(part)) return <span key={i}>{part}</span>;

    const trimmed = part.replace(/[.,;:!?)+\]}>]+$/g, "");
    const trailing = part.slice(trimmed.length);
    const href = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {trimmed}
        </a>
        {trailing}
      </span>
    );
  });

  return <p className={className}>{nodes}</p>;
}
