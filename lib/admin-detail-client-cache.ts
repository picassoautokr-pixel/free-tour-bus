/**
 * 어드민 신청 상세 — 클라이언트 캐시 (UTF-8)
 */

import type {
  AdminApplicationDetailBasicPayload,
  AdminApplicationDetailQuotesPayload,
  AdminSponsorDetail,
  AdminSmsLog,
} from "@/lib/admin-application-detail-build";

export type AdminDetailCacheEntry = {
  basic?: AdminApplicationDetailBasicPayload;
  quotes?: AdminApplicationDetailQuotesPayload;
  sponsor?: AdminSponsorDetail | null;
  sms?: AdminSmsLog[];
  debug?: unknown;
  updatedAt: number;
};

const cache = new Map<string, AdminDetailCacheEntry>();

export function getAdminDetailCache(applicationId: string): AdminDetailCacheEntry | undefined {
  return cache.get(applicationId);
}

export function patchAdminDetailCache(
  applicationId: string,
  patch: Partial<Omit<AdminDetailCacheEntry, "updatedAt">>,
): AdminDetailCacheEntry {
  const prev = cache.get(applicationId) ?? { updatedAt: 0 };
  const next: AdminDetailCacheEntry = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  cache.set(applicationId, next);
  return next;
}

export function invalidateAdminDetailCache(applicationId: string): void {
  cache.delete(applicationId);
}

export function invalidateAdminDetailQuotes(applicationId: string): void {
  const entry = cache.get(applicationId);
  if (!entry) return;
  cache.set(applicationId, {
    ...entry,
    quotes: undefined,
    debug: undefined,
    updatedAt: Date.now(),
  });
}
