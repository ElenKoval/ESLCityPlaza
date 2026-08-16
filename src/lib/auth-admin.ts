import { createClient as createServiceClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function emailForUserId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function authContactsForUserIds(
  ids: string[],
): Promise<Map<string, { email: string; confirmed: boolean }>> {
  const map = new Map<string, { email: string; confirmed: boolean }>();
  const admin = createAdminClient();
  if (!admin || ids.length === 0) return map;

  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) {
        console.error("[auth-admin] getUserById", id, error.message);
        return;
      }
      if (data.user?.email) {
        map.set(id, {
          email: data.user.email,
          confirmed: Boolean(data.user.email_confirmed_at),
        });
      }
    }),
  );
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

  if (typeof adminApi.getUserByEmail === "function") {
    const { data, error } = await adminApi.getUserByEmail(normalized);
    if (data?.user) return true;
    if (!error) return false;
    const msg = error.message.toLowerCase();
    if (msg.includes("not found") || msg.includes("user not found")) {
      return false;
    }
  }

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users) return null;
    if (data.users.some((user) => user.email?.toLowerCase() === normalized)) {
      return true;
    }
    if (data.users.length < perPage) return false;
    page += 1;
    if (page > 20) return null;
  }
}
