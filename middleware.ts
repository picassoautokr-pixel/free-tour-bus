import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_AUTH_STORAGE_KEYS } from "@/lib/supabase-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 로그인 화면은 인증 없이 접근
  if (
    pathname === "/admin/login" ||
    pathname === "/partner/login" ||
    pathname === "/partner/set-password"
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    return response;
  }

  const authStorageKey = pathname.startsWith("/partner/")
    ? SUPABASE_AUTH_STORAGE_KEYS.partner
    : SUPABASE_AUTH_STORAGE_KEYS.admin;

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      name: authStorageKey,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    if (pathname.startsWith("/partner/")) {
      redirectUrl.pathname = "/partner/login";
    } else {
      redirectUrl.pathname = "/admin/login";
    }
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/partner/dashboard/:path*", "/partner/change-password"],
};
