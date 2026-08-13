import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DEMO_COOKIE } from "@/lib/demo";

const PUBLIC = new Set(["/", "/login", "/register", "/enter"]);

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const hasDemo = request.cookies.get(DEMO_COOKIE)?.value === "1";

  // Local demo (no Supabase yet)
  if (!url || !key) {
    if (path.startsWith("/enter")) {
      return NextResponse.next();
    }
    if (!hasDemo && !PUBLIC.has(path) && !path.startsWith("/auth")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/enter";
      return NextResponse.redirect(redirectUrl);
    }
    if (hasDemo && (path === "/login" || path === "/register" || path === "/enter")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/chat";
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  const { user, supabase, supabaseResponse } = await updateSession(request);

  if (path.startsWith("/auth") || path.startsWith("/enter")) {
    return supabaseResponse;
  }

  if (!user && !hasDemo && !PUBLIC.has(path)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if ((user || hasDemo) && (path === "/login" || path === "/register")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/classes";
    return NextResponse.redirect(redirectUrl);
  }

  if (hasDemo && !user) {
    return supabaseResponse;
  }

  if (user && !PUBLIC.has(path) && path !== "/pending") {
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

    if (path.startsWith("/tech") && profile.role !== "tech") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/classes";
      return NextResponse.redirect(redirectUrl);
    }

    if (
      path.startsWith("/admin") &&
      profile.role !== "teacher" &&
      profile.role !== "tech"
    ) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/classes";
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
