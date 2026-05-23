/**
 * 어드민 신청 상세 — 클라이언트 API 호출 (UTF-8)
 */

import type {
  AdminApplicationDetailBasicPayload,
  AdminApplicationDetailQuotesPayload,
  AdminSponsorDetail,
  AdminSmsLog,
} from "@/lib/admin-application-detail-build";
import {
  getAdminDetailCache,
  invalidateAdminDetailCache,
  invalidateAdminDetailQuotes,
  patchAdminDetailCache,
} from "@/lib/admin-detail-client-cache";
import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";

async function fetchSection<T>(
  applicationId: string,
  section: string,
  parse: (json: Record<string, unknown>) => T,
  extraQuery?: Record<string, string>,
): Promise<T> {
  const params = new URLSearchParams({
    application_id: applicationId,
    section,
    ...extraQuery,
  });
  const res = await fetch(`/api/admin/application-detail?${params.toString()}`, {
    credentials: "same-origin",
  });
  const json = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? "상세 조회에 실패했습니다.");
  }
  return parse(json);
}

export async function loadAdminDetailBasic(
  applicationId: string,
  options?: { force?: boolean },
): Promise<AdminApplicationDetailBasicPayload> {
  const cached = getAdminDetailCache(applicationId)?.basic;
  if (cached && !options?.force) return cached;

  const basic = await fetchSection(applicationId, "basic", (json) => {
    const payload = json.basic as AdminApplicationDetailBasicPayload | undefined;
    if (!payload) throw new Error("basic 응답이 없습니다.");
    return payload;
  });
  patchAdminDetailCache(applicationId, { basic });
  return basic;
}

export async function loadAdminDetailQuotes(
  applicationId: string,
  options?: { force?: boolean },
): Promise<AdminApplicationDetailQuotesPayload> {
  const cached = getAdminDetailCache(applicationId)?.quotes;
  if (cached && !options?.force) return cached;

  const extraQuery =
    isQuoteDebugEnabled() ? { debug: "true" } : undefined;
  const quotes = await fetchSection(
    applicationId,
    "quotes",
    (json) => {
      const payload = json.quotes as AdminApplicationDetailQuotesPayload | undefined;
      if (!payload) throw new Error("quotes 응답이 없습니다.");
      return payload;
    },
    extraQuery,
  );
  patchAdminDetailCache(applicationId, { quotes });
  return quotes;
}

export async function loadAdminDetailSponsor(
  applicationId: string,
  options?: { force?: boolean },
): Promise<AdminSponsorDetail | null> {
  const cached = getAdminDetailCache(applicationId);
  if (cached?.sponsor !== undefined && !options?.force) return cached.sponsor ?? null;

  const sponsor = await fetchSection(applicationId, "sponsor", (json) => {
    return (json.sponsor as AdminSponsorDetail | null | undefined) ?? null;
  });
  patchAdminDetailCache(applicationId, { sponsor });
  return sponsor;
}

export async function loadAdminDetailSms(
  applicationId: string,
  options?: { force?: boolean },
): Promise<AdminSmsLog[]> {
  const cached = getAdminDetailCache(applicationId)?.sms;
  if (cached && !options?.force) return cached;

  const sms = await fetchSection(applicationId, "sms", (json) => {
    return Array.isArray(json.sms_logs) ? (json.sms_logs as AdminSmsLog[]) : [];
  });
  patchAdminDetailCache(applicationId, { sms });
  return sms;
}

export async function loadAdminDetailDebug(
  applicationId: string,
  options?: { force?: boolean },
): Promise<unknown> {
  if (!isQuoteDebugEnabled()) return null;
  const cached = getAdminDetailCache(applicationId)?.debug;
  if (cached !== undefined && !options?.force) return cached;

  const debug = await fetchSection(applicationId, "debug", (json) => json.debug ?? null);
  patchAdminDetailCache(applicationId, { debug });
  return debug;
}

export function refreshAdminDetailCache(applicationId: string): void {
  invalidateAdminDetailCache(applicationId);
}

export function refreshAdminDetailQuotesCache(applicationId: string): void {
  invalidateAdminDetailQuotes(applicationId);
}
