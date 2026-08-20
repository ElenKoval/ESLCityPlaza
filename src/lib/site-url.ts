const FALLBACK_LOCAL = "http://localhost:3000";

function isLocalHost(value: string) {
  return /localhost|127\.0\.0\.1/i.test(value);
}

function withHttps(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Public site URL for emails and auth redirects. Never use the request Origin. */
export function publicSiteUrl() {
  const fromEnv = withHttps(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (fromEnv && !isLocalHost(fromEnv)) return fromEnv;

  const vercelProd = withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL || "");
  if (vercelProd && !isLocalHost(vercelProd)) return vercelProd;

  const vercel = withHttps(process.env.VERCEL_URL || "");
  if (vercel) return vercel;

  return fromEnv || FALLBACK_LOCAL;
}

export function authConfirmUrl() {
  return `${publicSiteUrl()}/auth/confirm`;
}

export function authResetUrl() {
  return `${publicSiteUrl()}/reset-password`;
}
