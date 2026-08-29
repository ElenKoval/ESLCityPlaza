import { createClient as createServiceClient } from "@supabase/supabase-js";

const AUTH_ADMIN_TIMEOUT_MS = 8_000;
const LIST_USERS_PER_PAGE = 200;
const LIST_USERS_MAX_PAGES = 20;

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function emailForUserId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const { data, error } = await withTimeout(
      admin.auth.admin.getUserById(userId),
      AUTH_ADMIN_TIMEOUT_MS,
      "getUserById",
    );
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch (error) {
    console.error(
      "[auth-admin] getUserById",
      userId,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Resolve emails/confirm flags for many users via paginated listUsers.
 * Avoids N parallel getUserById calls that can hang the Manage Members page.
 */
export async function authContactsForUserIds(
  ids: string[],
): Promise<Map<string, { email: string; confirmed: boolean }>> {
  const map = new Map<string, { email: string; confirmed: boolean }>();
  const admin = createAdminClient();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!admin || unique.length === 0) return map;

  const wanted = new Set(unique);

  try {
    await withTimeout(
      (async () => {
        let page = 1;
        for (;;) {
          const { data, error } = await admin.auth.admin.listUsers({
            page,
            perPage: LIST_USERS_PER_PAGE,
          });
          if (error || !data?.users) {
            if (error) {
              console.error("[auth-admin] listUsers", error.message);
            }
            break;
          }

          for (const user of data.users) {
            if (!wanted.has(user.id) || !user.email) continue;
            map.set(user.id, {
              email: user.email,
              confirmed: Boolean(user.email_confirmed_at),
            });
            wanted.delete(user.id);
          }

          if (wanted.size === 0) break;
          if (data.users.length < LIST_USERS_PER_PAGE) break;
          page += 1;
          if (page > LIST_USERS_MAX_PAGES) break;
        }
      })(),
      AUTH_ADMIN_TIMEOUT_MS,
      "authContactsForUserIds",
    );
  } catch (error) {
    console.error(
      "[auth-admin] authContactsForUserIds",
      error instanceof Error ? error.message : error,
    );
  }

  return map;
}

export async function emailsForUserIds(
  ids: string[],
): Promise<Map<string, string>> {
  const contacts = await authContactsForUserIds(ids);
  const map = new Map<string, string>();
  for (const [id, contact] of contacts) map.set(id, contact.email);
  return map;
}

export async function displayNameTaken(
  displayName: string,
  excludeUserId?: string,
): Promise<boolean | null> {
  const trimmed = displayName.trim();
  if (!trimmed) return false;

  const admin = createAdminClient();
  if (!admin) return null;

  let query = admin
    .from("profiles")
    .select("id")
    .ilike("display_name", trimmed)
    .limit(1);

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  try {
    const { data, error } = await withTimeout(
      Promise.resolve(query),
      AUTH_ADMIN_TIMEOUT_MS,
      "displayNameTaken",
    );
    if (error) {
      console.error("[auth-admin] displayNameTaken", error.message);
      return null;
    }
    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error(
      "[auth-admin] displayNameTaken",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function authEmailExists(email: string): Promise<boolean | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const normalized = email.trim().toLowerCase();
  const adminApi = admin.auth.admin as typeof admin.auth.admin & {
    getUserByEmail?: (value: string) => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };

  try {
    if (typeof adminApi.getUserByEmail === "function") {
      const { data, error } = await withTimeout(
        adminApi.getUserByEmail(normalized),
        AUTH_ADMIN_TIMEOUT_MS,
        "getUserByEmail",
      );
      if (data?.user) return true;
      if (!error) return false;
      const msg = error.message.toLowerCase();
      if (msg.includes("not found") || msg.includes("user not found")) {
        return false;
      }
    }

    let page = 1;
    const perPage = LIST_USERS_PER_PAGE;
    for (;;) {
      const { data, error } = await withTimeout(
        admin.auth.admin.listUsers({ page, perPage }),
        AUTH_ADMIN_TIMEOUT_MS,
        "listUsers",
      );
      if (error || !data?.users) return null;
      if (data.users.some((user) => user.email?.toLowerCase() === normalized)) {
        return true;
      }
      if (data.users.length < perPage) return false;
      page += 1;
      if (page > LIST_USERS_MAX_PAGES) return null;
    }
  } catch (error) {
    console.error(
      "[auth-admin] authEmailExists",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
