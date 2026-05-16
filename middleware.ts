import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { roleFromHost, type RoleSubdomain } from "@/lib/role-hosts";
import { SUPABASE_AUTH_STORAGE_KEYS } from "@/lib/supabase-auth";

function internalPathForSubdomain(role: RoleSubdomain | null, pathname: string): string {
  if (role === "partner") {
    if (pathname === "/") return "/partner/dashboard";
    if (pathname === "/login") return "/partner/login";
    if (pathname === "/dashboard") return "/partner/dashboard";
    if (pathname === "/register") return "/partner/register";
    if (pathname === "/change-password") return "/partner/change-password";
    if (pathname === "/set-password") return "/partner/set-password";
  }
  if (role === "sponsor") {
    if (pathname === "/") return "/sponsor/dashboard";
    if (pathname === "/login") return "/sponsor/login";
    if (pathname === "/dashboard") return "/sponsor/dashboard";
    if (pathname === "/register") return "/sponsor/register";
  }
  if (role === "admin") {
    if (pathname === "/" || pathname === "/dashboard") return "/admin";
    if (pathname === "/login") return "/admin/login";
  }
  return pathname;
}

function roleFromPath(pathname: string): RoleSubdomain | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/partner/")) return "partner";
  if (pathname.startsWith("/sponsor/")) return "sponsor";
  return null;
}

function isPublicRolePath(pathname: string): boolean {
  return [
    "/admin/login",
    "/partner/login",
    "/partner/register",
    "/partner/register/status",
    "/partner/set-password",
    "/sponsor/login",
    "/sponsor/register",
  ].includes(pathname);
}

function isProtectedRolePath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/partner/dashboard") ||
    pathname === "/partner/change-password" ||
    pathname.startsWith("/sponsor/dashboard")
  );
}

function loginPathFor(role: RoleSubdomain, usingRoleHost: boolean): string {
  if (usingRoleHost) return "/login";
  return role === "admin" ? "/admin/login" : `/${role}/login`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostRole = roleFromHost(request.headers.get("host"));
  const internalPath = internalPathForSubdomain(hostRole, pathname);
  const requestUrl = request.nextUrl.clone();
  requestUrl.pathname = internalPath;
  const response =
    internalPath === pathname ? NextResponse.next() : NextResponse.rewrite(requestUrl);

  if (isPublicRolePath(internalPath)) return response;

  if (!isProtectedRolePath(internalPath)) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    return response;
  }

  const role = roleFromPath(internalPath);
  if (!role) return response;
  const authStorageKey = SUPABASE_AUTH_STORAGE_KEYS[role];

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
    redirectUrl.pathname = loginPathFor(role, hostRole === role);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
