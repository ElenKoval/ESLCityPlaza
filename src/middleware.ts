import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DEMO_COOKIE, DEMO_MEMBERS_COOKIE, DEMO_TECH_ID } from "@/lib/demo";

const PUBLIC = new Set([
  "/",
  "/login",
  "/register",
  "/enter",
  "/privacy",
  "/terms",
  "/announcements",
]);

function isPublicPath(path: string) {
  return PUBLIC.has(path) || path.startsWith("/register/");
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
): "pending" | "approved" | "rejected" | null {
  if (userId === DEMO_TECH_ID) return "approved";
  const raw = request.cookies.get(DEMO_MEMBERS_COOKIE)?.value;
  if (!raw) {
    // Seed defaults: sample pending/approved ids
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
      match.status === "rejected"
    ) {
      return match.status;
    }
    return null;
  } catch {
    return null;
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
    if (isPublicPath(path) || path.startsWith("/auth")) {
      if (hasDemo && (path === "/login" || path === "/register" || path === "/enter")) {
        const status = demoMemberStatus(request, demoUserId!);
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname =
          status === "approved" ? "/" : "/pending";
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
    if (status !== "approved" && path !== "/pending" && !isPublicPath(path)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/pending";
      return NextResponse.redirect(redirectUrl);
    }

    if (status === "approved" && path.startsWith("/tech")) {
      // Role check happens on the page; allow through
    }

    return NextResponse.next();
  }

  const { user, supabase, supabaseResponse } = await updateSession(request);

  if (path.startsWith("/auth") || path.startsWith("/enter")) {
    return supabaseResponse;
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
      redirectUrl.pathname = status === "approved" ? "/" : "/pending";
      return NextResponse.redirect(redirectUrl);
    }
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();
      redirectUrl.pathname =
        profile?.status === "approved" ? "/" : "/pending";
      return NextResponse.redirect(redirectUrl);
    }
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  if (hasDemo && !user) {
    return supabaseResponse;
  }

  if (user && !isPublicPath(path) && path !== "/pending") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.status !== "approved") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/pending";
      return NextResponse.redirect(redirectUrl);
    }

    if (
      path.startsWith("/tech") &&
      profile.role !== "tech" &&
      profile.role !== "teacher"
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return NextResponse.redirect(redirectUrl);
    }

    if (
      path.startsWith("/admin") &&
      profile.role !== "teacher" &&
      profile.role !== "tech"
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
