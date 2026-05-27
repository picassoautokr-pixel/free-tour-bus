import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildConfirmedDbPayload,
  computeConfirmedFromPlanned,
  type PlannedSupportSnapshot,
  type QuoteSupportRow,
} from "@/lib/quote-support-snapshot";
import {
  parseRuleTargetGroups,
  ruleSupportConditionLabel,
  ruleSupportFormLabel,
  type SponsorRuleRecord,
} from "@/lib/sponsor-rule-helpers";
import { parseInteger, safeText, sponsorSupportTypeLabel } from "@/lib/sponsor";
import {
  calculateSupportDiscountPrice,
  extensionPlannedFromPartnerSupport,
  resolveSettlementType,
  type QuoteSupportBreakdown,
  type SupportSettlementType,
} from "@/lib/support-calculation";
import { getApprovedSponsorSupport } from "@/lib/sponsor-support";
import { logSupportSnapshotDebug } from "@/lib/support-snapshot-debug-log";

export type SupportBreakdownCapturePhase =
  | "preapproved"
  | "quote_submit"
  | "sponsor_confirm";

/** DB jsonb — snake_case 고정 필드 */
export type SupportBreakdownSnapshot = {
  version: 1;
  captured_at: string;
  capture_phase: SupportBreakdownCapturePhase;

  sponsor_rule_id: string | null;
  sponsor_rule_name: string | null;
  per_person_support: number;
  per_booking_support: number;
  max_support: number;
  support_condition: string | null;
  support_type: string | null;
  support_mode: SupportSettlementType;
  target_groups: string[];

  normal_price: number | null;
  sponsor_quote_enabled: boolean;

  planned_total_support: number | null;
  planned_customer_support: number | null;
  planned_driver_support: number | null;
  planned_extension_support: number | null;
  planned_discount_price: number | null;

  confirmed_total_support: number | null;
  confirmed_customer_support: number | null;
  confirmed_driver_support: number | null;
  confirmed_extension_support: number | null;
  /** 지원금 할인 적용가 (normal_price - confirmed_customer_support) */
  confirmed_discount_price?: number | null;
  final_discount_price: number | null;

  calculation_status: "ok" | "failed" | "incomplete";
  calculation_error?: string | null;

  // 확정 메타데이터 (sponsor_confirm 단계에 저장)
  confirmed_at?: string | null;
  confirmed_source?: string | null;

  // camelCase aliases — 파싱 없이 raw JSON 직접 접근 시 사용
  totalConfirmedSupport?: number | null;
  customerConfirmedSupport?: number | null;
  partnerConfirmedSupport?: number | null;
  confirmedExtensionSupport?: number | null;
  supportDiscountAppliedPrice?: number | null;
  finalDiscountAppliedPrice?: number | null;
  isConfirmed?: boolean;
  confirmedAt?: string | null;
  confirmedSource?: string | null;
};

export function ruleToSnapshotMeta(rule: SponsorRuleRecord | null): Pick<
  SupportBreakdownSnapshot,
  | "sponsor_rule_id"
  | "sponsor_rule_name"
  | "per_person_support"
  | "per_booking_support"
  | "max_support"
  | "support_condition"
  | "support_type"
  | "target_groups"
> {
  if (!rule) {
    return {
      sponsor_rule_id: null,
      sponsor_rule_name: null,
      per_person_support: 0,
      per_booking_support: 0,
      max_support: 0,
      support_condition: null,
      support_type: null,
      target_groups: [],
    };
  }
  return {
    sponsor_rule_id: safeText(rule.id) || null,
    sponsor_rule_name: safeText(rule.title) || null,
    per_person_support: parseInteger(rule.support_per_person) ?? 0,
    per_booking_support: parseInteger(rule.support_per_case) ?? 0,
    max_support: parseInteger(rule.max_support_amount) ?? 0,
    support_condition: ruleSupportConditionLabel(rule),
    support_type: sponsorSupportTypeLabel(rule.support_type),
    target_groups: parseRuleTargetGroups(rule),
  };
}

export function buildPlannedSupportBreakdownSnapshot(params: {
  phase: SupportBreakdownCapturePhase;
  rule: SponsorRuleRecord | null;
  normalPrice: number | null;
  planned: PlannedSupportSnapshot;
  supportMode?: SupportSettlementType;
  sponsorQuoteEnabled?: boolean;
  extensionRound?: number;
}): SupportBreakdownSnapshot {
  const normal = params.normalPrice;
  const plannedExtension =
    params.extensionRound != null && params.extensionRound > 0
      ? extensionPlannedFromPartnerSupport(params.planned.driver, params.extensionRound)
      : 0;

  return {
    version: 1,
    captured_at: new Date().toISOString(),
    capture_phase: params.phase,
    ...ruleToSnapshotMeta(params.rule),
    support_mode: params.supportMode ?? "client_priority",
    normal_price: normal,
    sponsor_quote_enabled: params.sponsorQuoteEnabled !== false,
    planned_total_support: params.planned.total,
    planned_customer_support: params.planned.customer,
    planned_driver_support: params.planned.driver,
    planned_extension_support: plannedExtension,
    planned_discount_price: params.planned.discountPrice,
    confirmed_total_support: null,
    confirmed_customer_support: null,
    confirmed_driver_support: null,
    confirmed_extension_support: null,
    final_discount_price: null,
    calculation_status: normal != null && normal > 0 ? "ok" : "incomplete",
  };
}

export function applyConfirmedToSupportBreakdownSnapshot(
  snapshot: SupportBreakdownSnapshot,
  confirmed: {
    total: number;
    customer: number;
    driver: number;
    discountPrice: number;
    finalPrice: number;
    extensionSupport: number | null;
  },
): SupportBreakdownSnapshot {
  const now = new Date().toISOString();
  return {
    ...snapshot,
    captured_at: now,
    capture_phase: "sponsor_confirm",
    confirmed_total_support: confirmed.total,
    confirmed_customer_support: confirmed.customer,
    confirmed_driver_support: confirmed.driver,
    confirmed_extension_support: confirmed.extensionSupport,
    confirmed_discount_price: confirmed.discountPrice,
    final_discount_price: confirmed.finalPrice,
    planned_discount_price:
      snapshot.planned_discount_price ?? confirmed.discountPrice,
    calculation_status: "ok",
    calculation_error: null,
    // 확정 메타데이터
    confirmed_at: now,
    confirmed_source: "sponsor_confirm",
    // camelCase aliases — raw JSON 직접 접근 및 QuoteSupportBreakdown 호환
    totalConfirmedSupport: confirmed.total,
    customerConfirmedSupport: confirmed.customer,
    partnerConfirmedSupport: confirmed.driver,
    confirmedExtensionSupport: confirmed.extensionSupport ?? null,
    supportDiscountAppliedPrice: confirmed.discountPrice,
    finalDiscountAppliedPrice: confirmed.finalPrice,
    isConfirmed: true,
    confirmedAt: now,
    confirmedSource: "sponsor_confirm",
  };
}

export function parseSupportBreakdownSnapshot(
  raw: unknown,
): SupportBreakdownSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== 1) return null;
  const phase = safeText(row.capture_phase);
  if (
    phase !== "preapproved" &&
    phase !== "quote_submit" &&
    phase !== "sponsor_confirm"
  ) {
    return null;
  }
  return row as unknown as SupportBreakdownSnapshot;
}

/** UI·API — 저장된 스냅샷만 사용 (sponsor_rules 재조회 없음) */
export function snapshotToQuoteSupportBreakdown(
  snapshot: SupportBreakdownSnapshot,
): QuoteSupportBreakdown {
  const isConfirmed =
    snapshot.isConfirmed === true ||
    (snapshot.confirmed_total_support != null &&
      snapshot.confirmed_total_support > 0);

  // confirmed_discount_price가 저장돼 있으면 우선 사용, 없으면 계산
  const supportDiscountApplied =
    snapshot.confirmed_discount_price != null
      ? snapshot.confirmed_discount_price
      : isConfirmed &&
          snapshot.normal_price != null &&
          snapshot.confirmed_customer_support != null
        ? calculateSupportDiscountPrice(
            snapshot.normal_price,
            snapshot.confirmed_customer_support,
          )
        : null;

  return {
    calculationStatus: snapshot.calculation_status,
    calculationError: snapshot.calculation_error ?? undefined,
    settlementType: snapshot.support_mode,
    sponsorQuoteEnabled: snapshot.sponsor_quote_enabled,
    normalPrice: snapshot.normal_price,
    totalPlannedSupport: snapshot.planned_total_support,
    customerPlannedSupport: snapshot.planned_customer_support,
    partnerPlannedSupport: snapshot.planned_driver_support,
    supportDiscountPlannedPrice: snapshot.planned_discount_price,
    totalConfirmedSupport: snapshot.confirmed_total_support,
    customerConfirmedSupport: snapshot.confirmed_customer_support,
    partnerConfirmedSupport: snapshot.confirmed_driver_support,
    supportDiscountAppliedPrice: isConfirmed ? supportDiscountApplied : null,
    extensionSupport: isConfirmed
      ? snapshot.confirmed_extension_support
      : snapshot.planned_extension_support,
    finalDiscountAppliedPrice: snapshot.final_discount_price,
    isConfirmed,
  };
}

export function buildConfirmedSnapshotFromPlanned(
  snapshot: SupportBreakdownSnapshot,
  confirmedTotal: number,
  options?: { extensionApplied?: boolean; extensionSupportAmount?: number | null },
): SupportBreakdownSnapshot | null {
  const normal = snapshot.normal_price;
  if (normal == null || normal <= 0) return null;
  if (
    snapshot.planned_total_support == null ||
    snapshot.planned_customer_support == null ||
    snapshot.planned_driver_support == null
  ) {
    return null;
  }
  const planned: PlannedSupportSnapshot = {
    total: snapshot.planned_total_support,
    customer: snapshot.planned_customer_support,
    driver: snapshot.planned_driver_support,
    discountPrice:
      snapshot.planned_discount_price ??
      calculateSupportDiscountPrice(normal, snapshot.planned_customer_support) ??
      normal,
    finalPrice: snapshot.planned_discount_price ?? normal,
  };

  const computed = computeConfirmedFromPlanned({
    normalPrice: normal,
    settlementType: snapshot.support_mode,
    planned,
    confirmedTotal,
    extensionApplied: options?.extensionApplied,
    extensionSupportAmount: options?.extensionSupportAmount,
  });
  if ("error" in computed) {
    return {
      ...snapshot,
      calculation_status: "failed",
      calculation_error: computed.error,
    };
  }
  return applyConfirmedToSupportBreakdownSnapshot(snapshot, computed);
}

export function snapshotFromQuoteRow(
  row: QuoteSupportRow & { support_breakdown?: unknown },
): SupportBreakdownSnapshot | null {
  return parseSupportBreakdownSnapshot(row.support_breakdown);
}

export function breakdownFromQuoteRow(
  row: QuoteSupportRow & { support_breakdown?: unknown },
): QuoteSupportBreakdown | null {
  const stored = snapshotFromQuoteRow(row);
  if (stored) return snapshotToQuoteSupportBreakdown(stored);
  return null;
}

async function loadPrimaryPreapprovalRule(
  admin: SupabaseClient,
  applicationId: string,
): Promise<{
  rule: SponsorRuleRecord | null;
  preapproval: Record<string, unknown> | null;
  totalPlanned: number;
}> {
  const { data: preRows } = await admin
    .from("sponsor_preapprovals")
    .select(
      "id, status, sponsor_rule_id, estimated_support_amount, approved_support_amount, support_kind, support_settlement_mode",
    )
    .eq("application_id", applicationId)
    .in("status", ["preapproved", "pending", "reviewing", "approved"]);

  const rows = (Array.isArray(preRows) ? preRows : []) as Record<string, unknown>[];
  let best: Record<string, unknown> | null = null;
  let bestAmt = -1;
  let totalPlanned = 0;

  for (const row of rows) {
    const status = safeText(row.status);
    const amt =
      status === "approved"
        ? parseInteger(row.approved_support_amount) ??
          parseInteger(row.estimated_support_amount) ??
          0
        : parseInteger(row.estimated_support_amount) ?? 0;
    if (status !== "approved") totalPlanned += Math.max(0, amt);
    else totalPlanned += Math.max(0, amt);
    if (amt > bestAmt) {
      bestAmt = amt;
      best = row;
    }
  }

  const ruleId = safeText(best?.sponsor_rule_id);
  let rule: SponsorRuleRecord | null = null;
  if (ruleId) {
    const { data } = await admin.from("sponsor_rules").select("*").eq("id", ruleId).maybeSingle();
    rule = data ? (data as SponsorRuleRecord) : null;
  }

  return { rule, preapproval: best, totalPlanned: Math.max(0, totalPlanned) };
}

/** 신규 견적 매칭 직후 — applications.support_breakdown_snapshot */
export async function refreshApplicationSupportBreakdownSnapshot(
  admin: SupabaseClient,
  applicationId: string,
): Promise<SupportBreakdownSnapshot | null> {
  const id = applicationId.trim();
  if (!id) return null;

  const { data: application } = await admin
    .from("applications")
    .select(
      "id, passenger_count, target_normal_price, target_member_price, extension_round, support_client_reward_ratio",
    )
    .eq("id", id)
    .maybeSingle();
  if (!application) return null;

  const app = application as Record<string, unknown>;
  const normalPrice = parseInteger(app.target_normal_price);
  const targetMember = parseInteger(app.target_member_price);
  const extensionRound = parseInteger(app.extension_round) ?? 0;

  const { rule, totalPlanned } = await loadPrimaryPreapprovalRule(admin, id);
  if (totalPlanned <= 0 && !rule) return null;

  let customerPlanned = 0;
  if (
    normalPrice != null &&
    targetMember != null &&
    normalPrice > 0 &&
    targetMember > 0 &&
    normalPrice > targetMember
  ) {
    customerPlanned = normalPrice - targetMember;
  } else if (normalPrice != null && normalPrice > 0) {
    customerPlanned = Math.min(totalPlanned, normalPrice);
  } else {
    customerPlanned = totalPlanned;
  }
  const driverPlanned = Math.max(totalPlanned - customerPlanned, 0);
  const discountPrice =
    normalPrice != null && normalPrice > 0
      ? Math.max(normalPrice - customerPlanned, 0)
      : null;

  const planned: PlannedSupportSnapshot = {
    total: totalPlanned,
    customer: customerPlanned,
    driver: driverPlanned,
    discountPrice: discountPrice ?? 0,
    finalPrice: discountPrice ?? 0,
  };

  const snapshot = buildPlannedSupportBreakdownSnapshot({
    phase: "preapproved",
    rule,
    normalPrice,
    planned,
    supportMode: "client_priority",
    sponsorQuoteEnabled: totalPlanned > 0,
    extensionRound,
  });

  logSupportSnapshotDebug("refreshApplicationSupportBreakdownSnapshot", {
    application_id: id,
    input: { normalPrice, targetMember, totalPlanned, customerPlanned, driverPlanned, extensionRound },
    calculated_planned: planned,
    saved_snapshot: snapshot,
  });

  const { error } = await admin
    .from("applications")
    .update({ support_breakdown_snapshot: snapshot })
    .eq("id", id);
  if (error && !/support_breakdown_snapshot|does not exist|42703/i.test(error.message)) {
    throw new Error(error.message);
  }

  await refreshDriverQuotesSupportBreakdownForApplication(admin, id, {
    applicationSnapshot: snapshot,
  });

  return snapshot;
}

export async function persistQuoteSupportBreakdownSnapshot(
  admin: SupabaseClient,
  quoteId: string,
  snapshot: SupportBreakdownSnapshot,
): Promise<void> {
  const id = quoteId.trim();
  if (!id) return;
  const { error } = await admin
    .from("driver_quotes")
    .update({ support_breakdown: snapshot })
    .eq("id", id);
  if (error && !/support_breakdown|does not exist|42703/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/** 견적 제출 시 — 규칙·예상 금액 고정 */
export async function freezeQuotePlannedSupportBreakdown(
  admin: SupabaseClient,
  quoteId: string,
  params: {
    rule: SponsorRuleRecord | null;
    normalPrice: number;
    planned: PlannedSupportSnapshot;
    supportMode?: SupportSettlementType;
    extensionRound?: number;
  },
): Promise<SupportBreakdownSnapshot> {
  const snapshot = buildPlannedSupportBreakdownSnapshot({
    phase: "quote_submit",
    rule: params.rule,
    normalPrice: params.normalPrice,
    planned: params.planned,
    supportMode: params.supportMode,
    extensionRound: params.extensionRound,
  });
  logSupportSnapshotDebug("freezeQuotePlannedSupportBreakdown", {
    quote_id: quoteId,
    input: params,
    saved_snapshot: snapshot,
  });
  await persistQuoteSupportBreakdownSnapshot(admin, quoteId, snapshot);
  return snapshot;
}

async function refreshDriverQuotesSupportBreakdownForApplication(
  admin: SupabaseClient,
  applicationId: string,
  ctx: { applicationSnapshot: SupportBreakdownSnapshot },
): Promise<void> {
  const { data: quotes } = await admin
    .from("driver_quotes")
    .select("id, price, support_breakdown, planned_total_support, planned_customer_support, planned_driver_support, planned_discount_price, support_settlement_type, sponsor_quote_enabled, extension_support_amount")
    .eq("application_id", applicationId);

  for (const raw of Array.isArray(quotes) ? quotes : []) {
    const row = raw as Record<string, unknown>;
    const quoteId = safeText(row.id);
    if (!quoteId) continue;
    const existing = parseSupportBreakdownSnapshot(row.support_breakdown);
    if (existing?.capture_phase === "quote_submit" || existing?.capture_phase === "sponsor_confirm") {
      continue;
    }
    const price = parseInteger(row.price) ?? ctx.applicationSnapshot.normal_price;
    const plannedTotal =
      parseInteger(row.planned_total_support) ??
      ctx.applicationSnapshot.planned_total_support ??
      0;
    const customer =
      parseInteger(row.planned_customer_support) ??
      ctx.applicationSnapshot.planned_customer_support ??
      0;
    const driver =
      parseInteger(row.planned_driver_support) ??
      ctx.applicationSnapshot.planned_driver_support ??
      0;
    const discount =
      parseInteger(row.planned_discount_price) ??
      (price != null ? Math.max(price - customer, 0) : 0);

    const snapshot = buildPlannedSupportBreakdownSnapshot({
      phase: "preapproved",
      rule: {
        id: ctx.applicationSnapshot.sponsor_rule_id ?? "",
        title: ctx.applicationSnapshot.sponsor_rule_name ?? undefined,
        support_per_person: ctx.applicationSnapshot.per_person_support,
        support_per_case: ctx.applicationSnapshot.per_booking_support,
        max_support_amount: ctx.applicationSnapshot.max_support,
        support_condition: ctx.applicationSnapshot.support_condition ?? undefined,
        support_type: ctx.applicationSnapshot.support_type ?? undefined,
        target_groups: ctx.applicationSnapshot.target_groups,
      } as SponsorRuleRecord,
      normalPrice: price,
      planned: {
        total: plannedTotal,
        customer,
        driver,
        discountPrice: discount,
        finalPrice: discount,
      },
      supportMode: resolveSettlementType(row.support_settlement_type),
      sponsorQuoteEnabled: row.sponsor_quote_enabled !== false,
    });
    await persistQuoteSupportBreakdownSnapshot(admin, quoteId, snapshot);
  }
}

/**
 * old camelCase QuoteSupportBreakdown JSON에서 planned 값을 읽어
 * SupportBreakdownSnapshot을 복원한다.
 * parseSupportBreakdownSnapshot이 실패했을 때(버전 필드 없는 구형 포맷) fallback으로 사용.
 */
function snapshotFromOldCamelCaseBreakdown(
  raw: unknown,
  price: number | null,
  settlementType: string | null,
): SupportBreakdownSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const plannedTotal =
    parseInteger(obj.totalPlannedSupport ?? obj.planned_total_support);
  const plannedCustomer =
    parseInteger(obj.customerPlannedSupport ?? obj.planned_customer_support);
  const plannedDriver =
    parseInteger(obj.partnerPlannedSupport ?? obj.planned_driver_support);
  const plannedDiscount =
    parseInteger(obj.supportDiscountPlannedPrice ?? obj.planned_discount_price);
  const normalPrice = price ?? parseInteger(obj.normalPrice ?? obj.normal_price);

  if (normalPrice == null || plannedTotal == null || plannedCustomer == null) {
    return null;
  }
  const driver = plannedDriver ?? Math.max(plannedTotal - plannedCustomer, 0);
  const discount = plannedDiscount ?? Math.max(normalPrice - plannedCustomer, 0);

  return buildPlannedSupportBreakdownSnapshot({
    phase: "quote_submit",
    rule: null,
    normalPrice,
    planned: {
      total: plannedTotal,
      customer: plannedCustomer,
      driver,
      discountPrice: discount,
      finalPrice: discount,
    },
    supportMode: resolveSettlementType(
      settlementType ?? safeText(obj.settlementType ?? obj.support_mode),
    ),
  });
}

/** 스폰서 확정 후 — 기존 스냅샷에 확정 필드만 병합하고 DB에 저장 */
export async function refreshQuoteSnapshotsAfterSponsorConfirm(
  admin: SupabaseClient,
  applicationId: string,
): Promise<void> {
  const summary = await getApprovedSponsorSupport(admin, applicationId);
  const confirmedTotal = summary.approved_support_amount_total;
  if (confirmedTotal <= 0) return;

  logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.start", {
    application_id: applicationId,
    confirmed_total: confirmedTotal,
    summary,
  });

  const { data: quotes } = await admin
    .from("driver_quotes")
    .select(
      "id, price, support_breakdown, support_settlement_type, planned_total_support, planned_customer_support, planned_driver_support, planned_discount_price, extension_support_amount, extension_applied",
    )
    .eq("application_id", applicationId);

  for (const raw of Array.isArray(quotes) ? quotes : []) {
    const row = raw as QuoteSupportRow & {
      id?: string;
      support_breakdown?: unknown;
      extension_applied?: unknown;
    };
    const quoteId = safeText(row.id);
    if (!quoteId) continue;

    const rowPrice = parseInteger(row.price);
    const rowSettlement = safeText(row.support_settlement_type) || null;

    // --- Step 1: 신규 SupportBreakdownSnapshot 포맷 시도 ---
    let snapshot = parseSupportBreakdownSnapshot(row.support_breakdown) ?? null;

    // --- Step 2: planned_* 개별 컬럼으로 재건 시도 ---
    if (!snapshot) {
      const plannedTotal = parseInteger(row.planned_total_support);
      if (rowPrice != null && plannedTotal != null) {
        snapshot = buildPlannedSupportBreakdownSnapshot({
          phase: "quote_submit",
          rule: null,
          normalPrice: rowPrice,
          planned: {
            total: plannedTotal,
            customer: parseInteger(row.planned_customer_support) ?? 0,
            driver: parseInteger(row.planned_driver_support) ?? 0,
            discountPrice: parseInteger(row.planned_discount_price) ?? rowPrice,
            finalPrice: parseInteger(row.planned_discount_price) ?? rowPrice,
          },
          supportMode: resolveSettlementType(rowSettlement),
        });
        logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.rebuilt_from_columns", {
          quote_id: quoteId,
        });
      }
    }

    // --- Step 3: 구형 camelCase QuoteSupportBreakdown JSON으로 재건 시도 ---
    if (!snapshot) {
      snapshot = snapshotFromOldCamelCaseBreakdown(
        row.support_breakdown,
        rowPrice,
        rowSettlement,
      );
      if (snapshot) {
        logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.rebuilt_from_camel", {
          quote_id: quoteId,
        });
      }
    }

    // --- Step 4: 가격만 있으면 최소 synthetic 스냅샷 생성 ---
    if (!snapshot) {
      if (rowPrice == null) {
        logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.skip", {
          quote_id: quoteId,
          reason: "no_snapshot_and_no_price",
        });
        continue;
      }
      const customerPlanned = Math.min(confirmedTotal, rowPrice);
      snapshot = buildPlannedSupportBreakdownSnapshot({
        phase: "sponsor_confirm",
        rule: null,
        normalPrice: rowPrice,
        planned: {
          total: confirmedTotal,
          customer: customerPlanned,
          driver: Math.max(confirmedTotal - customerPlanned, 0),
          discountPrice: Math.max(rowPrice - customerPlanned, 0),
          finalPrice: Math.max(rowPrice - customerPlanned, 0),
        },
        supportMode: resolveSettlementType(rowSettlement),
      });
      logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.synthetic_planned", {
        quote_id: quoteId,
        confirmed_total: confirmedTotal,
      });
    }

    const extensionSupportAmount = parseInteger(row.extension_support_amount);

    // --- 확정 스냅샷 계산 ---
    const updated = buildConfirmedSnapshotFromPlanned(snapshot, confirmedTotal, {
      extensionApplied: row.extension_applied === true,
      extensionSupportAmount,
    });
    if (!updated) {
      logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.merge_failed", {
        quote_id: quoteId,
        snapshot_phase: snapshot.capture_phase,
        planned_total: snapshot.planned_total_support,
        confirmed_total: confirmedTotal,
      });
      continue;
    }

    logSupportSnapshotDebug("refreshQuoteSnapshotsAfterSponsorConfirm.saved", {
      quote_id: quoteId,
      confirmed_total: updated.confirmed_total_support,
      confirmed_customer: updated.confirmed_customer_support,
      confirmed_driver: updated.confirmed_driver_support,
      confirmed_discount: updated.confirmed_discount_price,
      final_discount: updated.final_discount_price,
      is_confirmed: updated.isConfirmed,
      confirmed_at: updated.confirmed_at,
    });

    // support_breakdown JSONB 저장 (camelCase aliases + snake_case 모두 포함)
    await persistQuoteSupportBreakdownSnapshot(admin, quoteId, updated);

    // 개별 confirmed_* 컬럼도 동시 갱신
    const confirmed = computeConfirmedFromPlanned({
      normalPrice: snapshot.normal_price ?? 0,
      settlementType: snapshot.support_mode,
      planned: {
        total: snapshot.planned_total_support ?? 0,
        customer: snapshot.planned_customer_support ?? 0,
        driver: snapshot.planned_driver_support ?? 0,
        discountPrice: snapshot.planned_discount_price ?? 0,
        finalPrice: snapshot.planned_discount_price ?? 0,
      },
      confirmedTotal,
      extensionApplied: row.extension_applied === true,
      extensionSupportAmount,
    });
    if (!("error" in confirmed)) {
      await admin
        .from("driver_quotes")
        .update(buildConfirmedDbPayload(confirmed))
        .eq("id", quoteId);
    }
  }
}
