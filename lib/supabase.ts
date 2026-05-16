import { createBrowserClient } from "@supabase/ssr";

import {
  SUPABASE_AUTH_STORAGE_KEYS,
  type SupabaseAuthRole,
} from "@/lib/supabase-auth";

/**
 * Supabase 브라우저/서버 공용 클라이언트를 만듭니다.
 *
 * - Client Component에서 Supabase Auth(session)까지 함께 쓰는 용도입니다.
 * - `NEXT_PUBLIC_` 접두사로 브라우저에 노출되므로, 반드시 Supabase RLS(행 수준 보안)를 설정하세요.
 * - 실제 비밀키(service_role)는 절대 넣지 마세요.
 */
export function createSupabaseClient() {
  return createRoleSupabaseClient("client", { persistSession: false });
}

export function createRoleSupabaseClient(
  role: SupabaseAuthRole,
  options?: { persistSession?: boolean; detectSessionInUrl?: boolean },
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    throw new Error(
      "Supabase 환경변수가 비어 있습니다. 프로젝트 루트의 .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 입력한 뒤 서버를 재시작하세요.",
    );
  }

  const storageKey = SUPABASE_AUTH_STORAGE_KEYS[role];

  return createBrowserClient(url, anonKey, {
    isSingleton: false,
    cookieOptions: {
      name: storageKey,
    },
    auth: {
      storageKey,
      persistSession: options?.persistSession ?? true,
      detectSessionInUrl: options?.detectSessionInUrl ?? false,
    },
  });
}

export function createAdminBrowserClient() {
  return createRoleSupabaseClient("admin");
}

export function createPartnerBrowserClient() {
  return createRoleSupabaseClient("partner");
}

export function createClientBrowserClient() {
  return createRoleSupabaseClient("client");
}

export function createTransientBrowserClient() {
  return createRoleSupabaseClient("transient", {
    persistSession: false,
    detectSessionInUrl: false,
  });
}
