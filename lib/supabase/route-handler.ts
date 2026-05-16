import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import {
  SUPABASE_AUTH_STORAGE_KEYS,
  type SupabaseAuthRole,
} from "@/lib/supabase-auth";

/** App Router Route Handler에서 Supabase Auth 세션(쿠키)을 읽습니다. */
export async function createSupabaseRouteHandlerClient(role: SupabaseAuthRole = "client") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim() || !anonKey?.trim()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: {
      name: SUPABASE_AUTH_STORAGE_KEYS[role],
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* Server Component / 일부 런타임에서 set 불가할 수 있음 */
        }
      },
    },
  });
}
