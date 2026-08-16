const FALLBACK_LOCAL = "http://localhost:3000";
const LIVE_SITE = "https://esl-citi-plaza.onrender.com";

function isLocalHost(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

/** Public site URL for emails and auth redirects. Never use the request Origin. */
export function publicSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv && !isLocalHost(fromEnv)) return fromEnv;
  if (process.env.NODE_ENV === "production") return LIVE_SITE;
  return fromEnv || FALLBACK_LOCAL;
}

export function authConfirmUrl() {
  return `${publicSiteUrl()}/auth/confirm`;
}
