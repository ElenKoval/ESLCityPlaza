import type { ReactNode } from "react";

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const URL_SPLIT = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const URL_MATCH = /^(https?:\/\/|www\.)/i;

function safeHttpHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function linkifyPlainUrls(text: string, keyPrefix: string): ReactNode[] {
  return text.split(URL_SPLIT).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!URL_MATCH.test(part)) return <span key={key}>{part}</span>;

    const trimmed = part.replace(/[.,;:!?)+\]}>]+$/g, "");
    const trailing = part.slice(trimmed.length);
    const href = safeHttpHref(trimmed);
    if (!href) return <span key={key}>{part}</span>;

    return (
      <span key={key}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {trimmed}
        </a>
        {trailing}
      </span>
    );
  });
}

/**
 * Render plain text with:
 * - markdown links: [Google Maps](https://maps.google.com/...)
 * - bare http(s)/www URLs
 */
export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MARKDOWN_LINK.source, "gi");

  while ((match = re.exec(text)) !== null) {
    const [full, label, url] = match;
    if (match.index > lastIndex) {
      nodes.push(
        ...linkifyPlainUrls(text.slice(lastIndex, match.index), `t${lastIndex}`),
      );
    }
    const href = safeHttpHref(url);
    if (href) {
      nodes.push(
        <a key={`m${match.index}`} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    } else {
      nodes.push(<span key={`m${match.index}`}>{full}</span>);
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(...linkifyPlainUrls(text.slice(lastIndex), `t${lastIndex}`));
  }

  return <p className={className}>{nodes}</p>;
}
