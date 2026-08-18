export const ACTIVITY_ONLINE_MS = 5 * 60 * 1000;
export const ACTIVITY_RECENT_MS = 30 * 60 * 1000;
export const ACTIVITY_HEARTBEAT_MS = 2 * 60 * 1000;

export const ACTIVITY_SECTIONS = [
  "Home",
  "Chat",
  "Topics",
  "Manage Members",
  "Schedule",
  "Profile",
  "Announcements",
  "Activity",
] as const;

export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

export function sectionFromPath(pathname: string): ActivitySection | null {
  if (pathname === "/") return "Home";
  if (pathname.startsWith("/chat")) return "Chat";
  if (pathname.startsWith("/topics")) return "Topics";
  if (pathname.startsWith("/members") || pathname.startsWith("/tech")) {
    return "Manage Members";
  }
  if (pathname.startsWith("/admin")) return "Schedule";
  if (pathname.startsWith("/account") || pathname.startsWith("/profile")) {
    return "Profile";
  }
  if (pathname.startsWith("/announcements")) return "Announcements";
  if (pathname.startsWith("/activity")) return "Activity";
  return null;
}

export function isOnlineNow(lastSeenAt: string, now = Date.now()) {
  return now - new Date(lastSeenAt).getTime() <= ACTIVITY_ONLINE_MS;
}

export function isRecentlyActive(lastSeenAt: string, now = Date.now()) {
  const age = now - new Date(lastSeenAt).getTime();
  return age > ACTIVITY_ONLINE_MS && age <= ACTIVITY_RECENT_MS;
}

export function formatActivityAgo(lastSeenAt: string, now = Date.now()) {
  const age = Math.max(0, now - new Date(lastSeenAt).getTime());
  const minutes = Math.round(age / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}
