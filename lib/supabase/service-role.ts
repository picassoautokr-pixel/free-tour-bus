import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 — `SUPABASE_SERVICE_ROLE_KEY` 로 RLS를 우회합니다.
 * Route Handler / Server Action 에서만 사용하세요.
 */
export function createServiceRoleSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
