import { createClient } from "@supabase/supabase-js";

/**
 * Supabase 브라우저/서버 공용 클라이언트를 만듭니다.
 *
 * - App Router의 Client Component, Server Component, Route Handler 어디서든 호출 가능합니다.
 * - `NEXT_PUBLIC_` 접두사로 브라우저에 노출되므로, 반드시 Supabase RLS(행 수준 보안)를 설정하세요.
 * - 실제 비밀키(service_role)는 절대 넣지 마세요.
 */
export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    throw new Error(
      "Supabase 환경변수가 비어 있습니다. 프로젝트 루트의 .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 입력한 뒤 서버를 재시작하세요.",
    );
  }

  return createClient(url, anonKey);
}
