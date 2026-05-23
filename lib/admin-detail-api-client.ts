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
import { sanitizeOperationalError } from "@/lib/operational-error-message";
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
  const json = (await res.json()) as Record<string, unknown> & {
    error?: string;
    error_detail?: string;
    debug_error?: string;
    auth_debug?: Record<string, unknown>;
    denied_reason?: string;
    which_check_failed?: string;
  };
  if (!res.ok) {
    const raw =
      typeof json.error_detail === "string"
        ? json.error_detail
        : typeof json.debug_error === "string"
          ? json.debug_error
          : typeof json.error === "string"
            ? json.error
            : "상세 조회에 실패했습니다.";
    const debugBits: string[] = [];
    if (isQuoteDebugEnabled() && json.auth_debug) {
      debugBits.push(JSON.stringify(json.auth_debug, null, 2));
    }
    if (isQuoteDebugEnabled() && typeof json.denied_reason === "string") {
      debugBits.push(`denied_reason: ${json.denied_reason}`);
    }
    if (isQuoteDebugEnabled() && typeof json.which_check_failed === "string") {
      debugBits.push(`which_check_failed: ${json.which_check_failed}`);
    }
    const base = sanitizeOperationalError(raw, "견적 데이터를 불러오는 중 문제가 발생했습니다.");
    throw new Error(debugBits.length > 0 ? `${base}\n${debugBits.join("\n")}` : base);
  }
  return parse(json);
}

const QUOTES_LOAD_MESSAGE = "견적 데이터를 불러오는 중 문제가 발생했습니다.";

export async function loadAdminDetailBasic(
  applicationId: string,
  options?: { force?: boolean },
): Promise<AdminApplicationDetailBasicPayload> {
  const cached = getAdminDetailCache(applicationId)?.basic;
  if (cached && !options?.force) return cached;

  const basic = await fetchSection(applicationId, "basic", (json) => {
    const payload = json.basic as AdminApplicationDetailBasicPayload | undefined;
    if (!payload) throw new Error("basic 응답이 없습니다.");
    if (isQuoteDebugEnabled() && json.auth_debug) {
      return {
        ...payload,
        warnings: [
          ...(payload.warnings ?? []),
          `auth_debug: ${JSON.stringify(json.auth_debug)}`,
        ],
      };
    }
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
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter((w): w is string => typeof w === "string" && w.trim() !== "")
        : [];
      if (warnings.length > 0) {
        return { ...payload, warnings: [QUOTES_LOAD_MESSAGE] };
      }
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

  try {
    const debug = await fetchSection(applicationId, "debug", (json) => ({
      debug: json.debug ?? null,
      warnings: json.warnings,
      debug_denied: json.debug_denied,
      auth_debug: json.auth_debug,
    }));
    patchAdminDetailCache(applicationId, { debug });
    return debug;
  } catch {
    return null;
  }
}

export function refreshAdminDetailCache(applicationId: string): void {
  invalidateAdminDetailCache(applicationId);
}

export function refreshAdminDetailQuotesCache(applicationId: string): void {
  invalidateAdminDetailQuotes(applicationId);
}
