import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { sendNewApplicationNotice } from "@/lib/mail";
import { createAdminClient } from "@/lib/auth-admin";
import { publicSiteUrl } from "@/lib/site-url";

const JOIN_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
]);

function redirectTo(pathname: string) {
  return new URL(pathname, `${publicSiteUrl()}/`);
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const code = request.nextUrl.searchParams.get("code");
  const rawType = request.nextUrl.searchParams.get("type");
  const type = (rawType || "signup") as EmailOtpType;

  const errorUrl = redirectTo("/auth/error");

  if (!tokenHash && !code) {
    return NextResponse.redirect(errorUrl);
  }
  if (tokenHash && rawType && !JOIN_TYPES.has(type)) {
    return NextResponse.redirect(errorUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(errorUrl);
  }

  const pendingCookies: Array<{
    name: string;
    value: string;
    options?: object;
  }> = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pendingCookies.push({ name, value, options });
        });
      },
    },
  });

  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({
        type: JOIN_TYPES.has(type) ? type : "signup",
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    console.error("[auth/confirm]", error.message);
    return NextResponse.redirect(errorUrl);
  }

  const user = data.user ?? data.session?.user ?? null;
  try {
    if (!user?.email) {
      console.error("[auth/confirm] confirmed, but no user on the session");
    } else {
      const reader = createAdminClient() ?? supabase;
      const { data: profile } = await reader
        .from("profiles")
        .select("display_name, status, requested_role, hometown, heard_from")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile) {
        console.error("[auth/confirm] no profile for", user.id);
      } else if (profile.status !== "pending") {
        console.info("[auth/confirm] skip notice, status is", profile.status);
      } else {
        const mail = await sendNewApplicationNotice({
          name: profile.display_name,
          email: user.email,
          requestedRole: profile.requested_role || "student",
          hometown: profile.hometown,
          heardFrom: profile.heard_from,
        });
        if (!mail.sent) {
          console.error("[auth/confirm] application notice not sent", mail.error);
        }
      }
    }
  } catch (noticeError) {
    console.error("[auth/confirm] application notice", noticeError);
  }

  const response = NextResponse.redirect(
    redirectTo("/register/confirmed"),
  );
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
