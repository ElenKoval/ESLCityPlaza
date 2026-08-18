export const DM_IMAGE_BUCKET = "direct-message-images";
export const DM_IMAGE_PATH_RE =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;
export const DM_IMAGE_SIGNED_TTL_SEC = 60 * 60;
export const DM_PREVIEW_MAX = 80;
export const DM_BODY_MAX = 2000;

export const DM_BLOCKED_SEND =
  "You can't send messages in this conversation right now.";

export const DM_SETUP_MESSAGE =
  "Run supabase/direct-messages-upgrade.sql in the Supabase SQL Editor, then try again.";

export const DM_UNREAD_REFRESH_EVENT = "plaza-dm-unread-refresh";

export function dispatchDmUnreadRefresh() {
  window.dispatchEvent(new Event(DM_UNREAD_REFRESH_EVENT));
}

export function dmSortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function dmOtherId(
  me: string,
  userLow: string,
  userHigh: string,
) {
  return userLow === me ? userHigh : userLow;
}

export function dmPreviewText(body: string, hasImage: boolean) {
  const text = body.trim();
  if (text) return text.slice(0, DM_PREVIEW_MAX);
  if (hasImage) return "Photo";
  return "";
}

export function dmListTimeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }
  if (dayDiff === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(d);
}

export function dmTableMissing(message: string) {
  return /direct_conversations|direct_messages|direct_blocks|direct_reads|schema cache|does not exist/i.test(
    message,
  );
}
