export const SUPABASE_AUTH_STORAGE_KEYS = {
  admin: "freebus-admin-auth",
  partner: "freebus-partner-auth",
  sponsor: "freebus-sponsor-auth",
  client: "freebus-client-auth",
  transient: "freebus-transient-auth",
} as const;

export type SupabaseAuthRole = keyof typeof SUPABASE_AUTH_STORAGE_KEYS;
