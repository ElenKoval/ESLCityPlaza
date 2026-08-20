export const MIN_PASSWORD_LENGTH = 8;

export const EXISTING_ACCOUNT_MESSAGE =
  "An account with this email already exists. Log in or reset your password.";

export const DISPLAY_NAME_TAKEN_MESSAGE =
  "That name is already taken. Please choose another.";

const EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const POPULAR_DOMAINS: Array<[string, string]> = [
  ["gmail", "com"],
  ["googlemail", "com"],
  ["yahoo", "com"],
  ["hotmail", "com"],
  ["outlook", "com"],
  ["live", "com"],
  ["msn", "com"],
  ["icloud", "com"],
  ["me", "com"],
  ["aol", "com"],
  ["protonmail", "com"],
  ["proton", "me"],
  ["mail", "com"],
  ["email", "com"],
  ["gmx", "com"],
  ["yandex", "com"],
  ["qq", "com"],
];

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur = row[j + 1];
      row[j + 1] =
        a[i] === b[j] ? prev : 1 + Math.min(prev, row[j], row[j + 1]);
      prev = cur;
    }
  }
  return row[b.length];
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function emailFormatError(email: string): string | null {
  if (!email) return "Please enter your email";
  if (email.length > 254) return "Please enter a valid email address";
  if (email.includes("..") || email.startsWith(".") || email.includes("@.")) {
    return "Please enter a valid email address";
  }
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) {
    return "Please enter a valid email address";
  }
  const local = email.slice(0, at);
  if (local.length > 64) return "Please enter a valid email address";
  if (!EMAIL_RE.test(email)) return "Please enter a valid email address";
  return null;
}

export function suggestedEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.indexOf(".");
  if (dot < 1) return null;
  const name = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);

  for (const [goodName, goodTld] of POPULAR_DOMAINS) {
    const good = `${goodName}.${goodTld}`;
    if (domain === good) return null;
  }

  for (const [goodName, goodTld] of POPULAR_DOMAINS) {
    const good = `${goodName}.${goodTld}`;
    const nameDist = levenshtein(name, goodName);
    const tldDist = levenshtein(tld, goodTld);
    if (name === goodName && tldDist === 1) return `${local}@${good}`;
    if (tld === goodTld && nameDist === 1) return `${local}@${good}`;
  }
  return null;
}

export function registrationEmailError(email: string): string | null {
  const format = emailFormatError(email);
  if (format) return format;
  const suggestion = suggestedEmail(email);
  if (suggestion) return `Did you mean ${suggestion}?`;
  return null;
}

export function isExistingAccountError(message: string) {
  const raw = message.toLowerCase();
  return (
    raw.includes("already registered") ||
    raw.includes("already exists") ||
    raw.includes("user already") ||
    raw.includes("email address is already")
  );
}
