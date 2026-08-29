import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DEMO_COOKIE, DEMO_MEMBERS_COOKIE, DEMO_TECH_ID } from "@/lib/demo";
import { withTimeout } from "@/lib/with-timeout";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROFILE_TIMEOUT_MS = 4_000;

const PUBLIC = new Set([
  "/",
  "/login",
  "/register",
  "/enter",
  "/privacy",
  "/terms",
  "/announcements",
  "/suspended",
  "/forgot-password",
  "/reset-password",
]);

function isPublicPath(path: string) {
  return (
    PUBLIC.has(path) ||
    path.startsWith("/register/") ||
    path.startsWith("/forgot-password")
  );
}

function isSuspendedAllowedPath(path: string) {
  return (
    path === "/suspended" ||
    path === "/privacy" ||
    path === "/terms" ||
    path.startsWith("/auth")
  );
}

function demoSessionUserId(request: NextRequest): string | null {
  const raw = request.cookies.get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  if (raw === "1") return DEMO_TECH_ID;
  return raw;
}

function demoMemberStatus(
  request: NextRequest,
  userId: string,
): "pending" | "approved" | "rejected" | "suspended" | null {
  if (userId === DEMO_TECH_ID) return "approved";
  const raw = request.cookies.get(DEMO_MEMBERS_COOKIE)?.value;
  if (!raw) {
    if (userId.startsWith("demo-pending")) return "pending";
    if (userId.startsWith("demo-member")) return "approved";
    return "pending";
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Array<{
      id: string;
      status?: string;
    }>;
    const match = parsed.find((m) => m.id === userId);
    if (!match?.status) return null;
    if (
      match.status === "pending" ||
      match.status === "approved" ||
      match.status === "rejected" ||
      match.status === "suspended"
    ) {
      return match.status;
    }
    return null;
  } catch {
    return null;
  }
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

function isMemberManagementPath(path: string) {
  return path.startsWith("/members") || path.startsWith("/tech");
}

function statusHomePath(status: string | null | undefined) {
  if (status === "approved") return "/";
  if (status === "suspended") return "/suspended";
  return "/pending";
}

async function loadProfileFields<T extends string>(
  supabase: SupabaseClient,
  userId: string,
  columns: T,
): Promise<Record<string, unknown> | null | undefined> {
  try {
    const { data, error } = await withTimeout(
      Promise.resolve(
        supabase.from("profiles").select(columns).eq("id", userId).maybeSingle(),
      ),
      PROFILE_TIMEOUT_MS,
      `middleware profiles ${columns}`,
    );
    if (error) {
      console.error("[middleware] profiles", error.message);
      return undefined;
    }
    return data as Record<string, unknown> | null;
  } catch (error) {
    console.error(
      "[middleware] profiles",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const demoUserId = demoSessionUserId(request);
  const hasDemo = Boolean(demoUserId);

  // Local demo (no Supabase yet)
  if (!url || !key) {
    if (hasDemo && demoUserId) {
      const status = demoMemberStatus(request, demoUserId);
      if (status === "suspended" && !isSuspendedAllowedPath(path)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/suspended";
        return NextResponse.redirect(redirectUrl);
      }
    }

    if (isPublicPath(path) || path.startsWith("/auth")) {
      if (hasDemo && (path === "/login" || path === "/register" || path === "/enter")) {
        const status = demoMemberStatus(request, demoUserId!);
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = statusHomePath(status);
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.next();
    }

    if (!hasDemo) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    const status = demoMemberStatus(request, demoUserId!);
    if (status === "suspended" && !isSuspendedAllowedPath(path)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/suspended";
      return NextResponse.redirect(redirectUrl);
    }
    if (status !== "approved" && path !== "/pending" && !isPublicPath(path)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/pending";
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }

  const { user, supabase, supabaseResponse } = await updateSession(request);

  if (path.startsWith("/auth") || path.startsWith("/enter")) {
    return supabaseResponse;
  }

  if (user) {
    const existing = await loadProfileFields(supabase, user.id, "id");
    // undefined = timed out / error — do not block the whole site
    if (existing === null) {
      try {
        await withTimeout(
          supabase.auth.signOut(),
          PROFILE_TIMEOUT_MS,
          "middleware signOut",
        );
      } catch (error) {
        console.error(
          "[middleware] signOut",
          error instanceof Error ? error.message : error,
        );
      }
      if (!isPublicPath(path)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }
      return supabaseResponse;
    }
  }

  if (!user && !hasDemo && !isPublicPath(path)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if ((user || hasDemo) && (path === "/login" || path === "/register")) {
    const redirectUrl = request.nextUrl.clone();
    if (hasDemo && demoUserId) {
      const status = demoMemberStatus(request, demoUserId);
      redirectUrl.pathname = statusHomePath(status);
      return NextResponse.redirect(redirectUrl);
    }
    if (user) {
      const profile = await loadProfileFields(supabase, user.id, "status");
      redirectUrl.pathname = statusHomePath(
        typeof profile?.status === "string" ? profile.status : undefined,
      );
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  if (hasDemo && !user) {
    return supabaseResponse;
  }

  if (user) {
    const profile = await loadProfileFields(supabase, user.id, "status, role");
    // If profile lookup failed, skip gates — pages still enforce access.
    if (profile === undefined) {
      return supabaseResponse;
    }

    const status = typeof profile?.status === "string" ? profile.status : null;
    const role = typeof profile?.role === "string" ? profile.role : null;

    if (status === "suspended") {
      if (!isSuspendedAllowedPath(path)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/suspended";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }
      return supabaseResponse;
    }

    if (!isPublicPath(path) && path !== "/pending") {
      if (!profile || status !== "approved") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/pending";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }

      if (
        isMemberManagementPath(path) &&
        role !== "tech" &&
        role !== "teacher" &&
        role !== "admin"
      ) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }

      if (path.startsWith("/admin") && role !== "teacher" && role !== "tech") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }

      if (path.startsWith("/activity") && role !== "tech") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
