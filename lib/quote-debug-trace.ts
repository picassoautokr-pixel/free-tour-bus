/**
 * 견적 계산 디버그 트레이스 — 원본/필드/식/결과 (UTF-8)
 */

import {
  quoteSubmitPriceLines,
  resolveQuoteNormalPrice,
  resolveQuoteSupportAppliedPrice,
  resolveQuoteSupportPlannedPrice,
} from "@/app/client/dashboard/page-quote-screen";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { buildClientMemberQuoteSupport } from "@/lib/client-member-quote-payload";
import type { PartnerCallLike } from "@/lib/partner-call-view-model";
import {
  resolveApplicationMatchedPriceDisplay,
  resolveEffectiveSelectedPriceType,
  resolveSelectedPriceType,
  type MatchedPriceCompare,
} from "@/lib/selected-price-display";
import type { SponsorCallRow } from "@/lib/sponsor-call-view-model";
import {
  buildQuoteSupportBreakdown,
  calculateTotalPlannedSupport,
  DEFAULT_MAX_SUPPORT_AMOUNT,
  DEFAULT_SUPPORT_PER_PERSON,
  parseSupportInteger,
  resolveConfirmedTotalSupport,
  resolvePlannedSupportSnapshot,
  SETTLEMENT_TYPE_LABELS,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import type {
  DebugSection,
  DebugTraceEntry,
  QuoteDebugContext,
  QuoteDebugError,
  QuoteDebugReport,
} from "@/lib/quote-debug-types";

function fmtNum(value: unknown): string {
  if (value == null || value === "") return "null";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${Math.trunc(value).toLocaleString("ko-KR")}원`;
  }
  return String(value);
}

function pickFirst(
  sources: { path: string; value: unknown }[],
): { path: string; value: number | null; usedFallback: string | null } {
  for (const s of sources) {
    const n = parseSupportInteger(s.value);
    if (n != null) {
      return {
        path: s.path,
        value: n,
        usedFallback: sources[0].path === s.path ? null : sources[0].path,
      };
    }
  }
  return { path: "(없음)", value: null, usedFallback: null };
}

function entry(
  id: string,
  title: string,
  opts: {
    value: unknown;
    fields: string[];
    formula?: string;
    result: unknown;
    calculator: string;
    priority?: string;
    fallback?: string;
    notes?: string;
  },
): DebugTraceEntry {
  return {
    id,
    title,
    value: fmtNum(opts.value),
    fields: opts.fields,
    formula: opts.formula,
    result: fmtNum(opts.result),
    calculator: opts.calculator,
    priority: opts.priority,
    fallback: opts.fallback,
    notes: opts.notes,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function detectErrors(
  ctx: QuoteDebugContext,
  compare: MatchedPriceCompare,
  display: {
    matchedLabel: string;
    matchedAmount: number | null;
    normalLineAmount: number | null;
    supportPlanned: number | null;
    supportApplied: number | null;
    effectiveType: ReturnType<typeof resolveEffectiveSelectedPriceType>;
  },
): QuoteDebugError[] {
  const errors: QuoteDebugError[] = [];
  const storedType = resolveSelectedPriceType(ctx.application);
  const storedLabel = String(ctx.application.selected_price_label ?? "").trim();

  if (
    storedType === "support_planned" &&
    display.matchedLabel === "일반견적가"
  ) {
    errors.push({
      code: "label_type_mismatch",
      message: "지원금 할인 예정가 선택인데 화면 라벨이 일반견적가로 렌더링됨",
      severity: "error",
    });
  }

  if (
    storedType === "support_confirmed" &&
    display.matchedLabel === "일반견적가"
  ) {
    errors.push({
      code: "label_type_mismatch_confirmed",
      message: "지원금 할인 적용가 선택인데 화면 라벨이 일반견적가로 렌더링됨",
      severity: "error",
    });
  }

  if (
    display.matchedAmount != null &&
    display.normalLineAmount != null &&
    display.matchedAmount === display.normalLineAmount &&
    display.effectiveType !== "normal" &&
    display.supportPlanned != null &&
    display.matchedAmount === display.supportPlanned
  ) {
    errors.push({
      code: "same_amount_different_kind",
      message:
        "매칭금액과 일반견적가 표시값이 같지만 선택 종류는 지원가입니다. 일반견적가 필드(quote.price) 확인 필요",
      severity: "warn",
    });
  }

  if (
    storedLabel === "일반견적가" &&
    display.effectiveType === "support_planned"
  ) {
    errors.push({
      code: "legacy_normal_label",
      message: "DB 라벨은 일반견적가이나 금액 비교로 지원금 할인 예정가로 보정 표시 중",
      severity: "warn",
    });
  }

  if (
    display.matchedAmount != null &&
    compare.quoteNormalPrice != null &&
    display.matchedAmount === compare.quoteNormalPrice &&
    storedType !== "normal"
  ) {
    errors.push({
      code: "selected_equals_normal_not_normal_type",
      message: "선택 금액이 일반견적가와 동일한데 selected_price_type이 normal이 아님",
      severity: "warn",
    });
  }

  return errors;
}

function buildSupportSections(
  ctx: QuoteDebugContext,
  quote: Record<string, unknown>,
  breakdown: ReturnType<typeof buildQuoteSupportBreakdown>,
  buildOptions: Parameters<typeof buildQuoteSupportBreakdown>[1],
): DebugSection[] {
  const app = ctx.application;
  const rule = ctx.sponsorRule ?? {};
  const pre = ctx.sponsorPreapproval ?? {};
  const passengers = parseSupportInteger(app.passenger_count) ?? 0;
  const perPerson =
    parseSupportInteger(rule.support_per_person) ?? DEFAULT_SUPPORT_PER_PERSON;
  const perCase = parseSupportInteger(rule.support_per_case) ?? 0;
  const maxCase = parseSupportInteger(rule.max_support_amount) ?? DEFAULT_MAX_SUPPORT_AMOUNT;
  const maxPassengers = parseSupportInteger(rule.max_passenger_count) ?? 0;
  const dailyBudget = parseSupportInteger(rule.daily_budget);
  const eligiblePassengers =
    maxPassengers > 0 ? Math.min(passengers, maxPassengers) : passengers;
  const rawPlanned = eligiblePassengers * perPerson + perCase;
  const cappedPlanned = calculateTotalPlannedSupport({
    passengerCount: passengers,
    supportPerPerson: perPerson,
    supportPerCase: perCase,
    maxSupportAmount: maxCase,
    maxPassengerCount: maxPassengers,
    dailyBudgetRemaining: dailyBudget,
  });

  const quoteInput = quote as QuoteSupportInput;
  const normalResolved = resolveQuoteNormalPrice(quote as ClientQuote);
  const plannedSnap = resolvePlannedSupportSnapshot(quoteInput, normalResolved, {
    applicationTotalPlannedSupport: parseSupportInteger(app.planned_total_support),
    sponsorEstimatedSupportAmount:
      parseSupportInteger(pre.estimated_support_amount) ??
      parseSupportInteger(app.sponsor_estimated_support_amount),
    sponsorApprovedSupportAmount:
      parseSupportInteger(pre.approved_support_amount) ??
      parseSupportInteger(app.sponsor_approved_support_amount),
  });

  const serviceRegions = Array.isArray(rule.service_regions)
    ? (rule.service_regions as unknown[]).map(String)
    : [];
  const depRegion = String(app.departure_region ?? "").trim();
  const regionMatch =
    serviceRegions.length === 0 || serviceRegions.includes(depRegion);

  const basic: DebugTraceEntry[] = [
    entry("normal_price", "1. 일반견적가", {
      value: normalResolved,
      fields: [
        "quote.price",
        "quote.normal_price",
        "quote.member_price",
        "support_breakdown.normalPrice",
      ],
      calculator: "resolveQuoteNormalPrice()",
      priority: pickFirst([
        { path: "quote.price", value: quote.price },
        { path: "quote.normal_price", value: quote.normal_price },
        { path: "quote.member_price", value: quote.member_price },
        {
          path: "support_breakdown.normalPrice",
          value: breakdown.normalPrice,
        },
      ]).path,
      fallback: pickFirst([
        { path: "quote.price", value: quote.price },
        { path: "quote.normal_price", value: quote.normal_price },
        { path: "quote.member_price", value: quote.member_price },
        {
          path: "support_breakdown.normalPrice",
          value: breakdown.normalPrice,
        },
      ]).usedFallback ?? undefined,
      result: normalResolved,
    }),
    entry("support_kind", "2. 지원종류", {
      value: pre.support_kind ?? rule.support_type ?? app.support_kind,
      fields: ["sponsor_preapproval.support_kind", "sponsor_rule.support_type"],
      calculator: "(원본 필드)",
      result: pre.support_kind ?? rule.support_type ?? "—",
    }),
    entry("per_person", "3. 인당지원금", {
      value: perPerson,
      fields: ["sponsor_rule.support_per_person"],
      calculator: "parseSupportInteger(rule.support_per_person) ?? DEFAULT(20000)",
      result: perPerson,
    }),
    entry("per_case", "4. 건당지원금", {
      value: perCase,
      fields: ["sponsor_rule.support_per_case"],
      calculator: "parseSupportInteger(rule.support_per_case)",
      result: perCase,
    }),
    entry("max_case", "5. 건당 최대지원금", {
      value: maxCase,
      fields: ["sponsor_rule.max_support_amount"],
      calculator: "parseSupportInteger(rule.max_support_amount) ?? DEFAULT(800000)",
      result: maxCase,
    }),
  ];

  const limits: DebugTraceEntry[] = [
    entry("daily_budget", "6. 출발일 최대 지원금 한도", {
      value: dailyBudget,
      fields: ["sponsor_rule.daily_budget"],
      formula: "후원 규칙 일일 예산 (출발일 기준 서버 집계와 연동)",
      calculator: "parseSupportInteger(rule.daily_budget)",
      result: dailyBudget,
      notes: dailyBudget == null ? "규칙에 daily_budget 없음 — 한도 미적용" : undefined,
    }),
    entry("daily_planned_sum", "7. 출발일 누적 예상 지원금", {
      value: pre.estimated_support_amount,
      fields: ["sponsor_preapproval.estimated_support_amount"],
      calculator: "(API/DB 집계값)",
      result: pre.estimated_support_amount,
      notes: "클라이언트는 당일 전체 합계 미포함 — 후원 대시보드·서버 집계 참고",
    }),
    entry("daily_confirmed_sum", "8. 출발일 누적 확정 지원금", {
      value: pre.approved_support_amount,
      fields: ["sponsor_preapproval.approved_support_amount"],
      calculator: "(API/DB 집계값)",
      result: pre.approved_support_amount,
      notes: "승인된 건만 합산 — 서버 todayApprovedTotal()",
    }),
  ];

  const conditions: DebugTraceEntry[] = [
    entry("support_stage", "9. 지원단계", {
      value: app.sponsor_support_status ?? quote.sponsor_support_status,
      fields: [
        "application.sponsor_support_status",
        "quote.sponsor_support_status",
        "sponsor_preapproval.status",
      ],
      calculator: "safeText(status fields)",
      result: app.sponsor_support_status ?? quote.sponsor_support_status ?? pre.status,
    }),
    entry("org", "10. 지원단체", {
      value: app.organization_name,
      fields: ["application.organization_name"],
      calculator: "(원본)",
      result: app.organization_name,
    }),
    entry("group_type", "11. 단체유형", {
      value: app.group_type ?? app.organization_type,
      fields: ["application.group_type", "application.organization_type"],
      calculator: "(원본)",
      result: app.group_type ?? app.organization_type,
    }),
    entry("region_match", "12. 출발지역 일치 여부", {
      value: regionMatch,
      fields: ["application.departure_region", "sponsor_rule.service_regions"],
      formula: `departure_region ∈ service_regions ? (${depRegion} in [${serviceRegions.join(", ")}])`,
      calculator: "regionMatchCheck()",
      result: regionMatch,
    }),
    entry("support_eligible", "13. 지원가능 여부", {
      value: breakdown.sponsorQuoteEnabled,
      fields: ["quote.sponsor_quote_enabled", "planned_total_support", "breakdown"],
      formula: "sponsor_quote_enabled && normalPrice != null",
      calculator: "buildQuoteSupportBreakdown()",
      result: breakdown.sponsorQuoteEnabled,
    }),
  ];

  const plannedEntries: DebugTraceEntry[] = [
    entry("total_planned", "14. 예상 지원금", {
      value: breakdown.totalPlannedSupport ?? cappedPlanned,
      fields: [
        "quote.planned_total_support",
        "sponsor_preapproval.estimated_support_amount",
        "calculateTotalPlannedSupport()",
      ],
      formula: `min(인당×인원+건당, 건당최대, 일예산잔액)\n= min(${eligiblePassengers}×${perPerson}+${perCase}, ${maxCase}${dailyBudget != null ? `, ${dailyBudget}` : ""})`,
      calculator: "calculateTotalPlannedSupport() / resolvePlannedTotalSupport()",
      result: breakdown.totalPlannedSupport ?? cappedPlanned,
      notes: `raw=${rawPlanned}, capped=${cappedPlanned}`,
    }),
    entry("customer_planned", "15. 고객 예상 지원금", {
      value: breakdown.customerPlannedSupport,
      fields: ["quote.planned_customer_support", "quote.customer_support_amount"],
      calculator: "resolvePlannedCustomerSupport()",
      result: breakdown.customerPlannedSupport,
    }),
    entry("partner_planned", "16. 기사 예상 지원금", {
      value: breakdown.partnerPlannedSupport,
      fields: ["quote.planned_driver_support", "calculatePlannedDriverSupport()"],
      formula: "총 예정 − 고객 예정 − 연장 예정",
      calculator: "calculatePlannedDriverSupport()",
      result: breakdown.partnerPlannedSupport,
    }),
    entry("total_customer_planned", "17. 총 고객 예상 지원금", {
      value: breakdown.customerPlannedSupport ?? 0,
      fields: ["customerPlannedSupport"],
      formula: "고객 예상 지원금",
      calculator: "(직접)",
      result: breakdown.customerPlannedSupport ?? 0,
    }),
    entry("discount_planned", "21. 지원금 할인 예정가", {
      value: breakdown.supportDiscountPlannedPrice,
      fields: [
        "breakdown.supportDiscountPlannedPrice",
        "quote.support_discount_planned_price",
        "quote.member_price",
      ],
      formula: "일반견적가 − 총 고객 예상 지원금\n(연장 포함 시 calculatePlannedDiscountPrice)",
      calculator: "calculatePlannedDiscountPrice() / buildQuoteSupportBreakdown()",
      priority: "breakdown.supportDiscountPlannedPrice",
      result: breakdown.supportDiscountPlannedPrice,
    }),
  ];

  const confirmedTotal = resolveConfirmedTotalSupport(quoteInput, buildOptions);
  const settlement = breakdown.settlementType;

  const confirmedEntries: DebugTraceEntry[] = [
    entry("settlement", "22. 지원금 정산모드", {
      value: settlement,
      fields: ["quote.support_settlement_type"],
      calculator: "resolveSettlementType()",
      result: SETTLEMENT_TYPE_LABELS[settlement] ?? settlement,
    }),
    entry("confirmed_total", "23. 확정 지원금", {
      value: confirmedTotal,
      fields: [
        "quote.confirmed_total_support",
        "quote.approved_support_amount",
        "sponsor_preapproval.approved_support_amount",
      ],
      calculator: "resolveConfirmedTotalSupport()",
      result: confirmedTotal,
    }),
    entry("ratio", "24. 지원금 정산비율", {
      value: app.support_client_reward_ratio ?? app.support_driver_ratio,
      fields: [
        "application.support_client_reward_ratio",
        "application.support_driver_ratio",
      ],
      formula:
        settlement === "ratio"
          ? "ratio: 확정 총액 × (고객예정/총예정)"
          : "client_priority: min(고객예정, 확정총액)",
      calculator: "calculateSupportDistribution()",
      result: settlement === "ratio" ? "비율 배분" : "고객 우선",
    }),
    entry("customer_confirmed", "25. 고객 확정 지원금", {
      value: breakdown.customerConfirmedSupport,
      fields: ["breakdown.customerConfirmedSupport", "quote.confirmed_customer_support"],
      calculator: "computeConfirmedFromPlanned() / readStoredConfirmedSupport()",
      result: breakdown.customerConfirmedSupport,
    }),
    entry("partner_confirmed", "26. 기사 확정 지원금", {
      value: breakdown.partnerConfirmedSupport,
      fields: ["breakdown.partnerConfirmedSupport", "quote.confirmed_driver_support"],
      calculator: "computeConfirmedFromPlanned()",
      result: breakdown.partnerConfirmedSupport,
    }),
    entry("total_customer_confirmed", "27. 총 고객 확정 지원금", {
      value: breakdown.customerConfirmedSupport ?? 0,
      fields: ["customerConfirmedSupport"],
      formula: "고객 확정 지원금",
      calculator: "(직접)",
      result: breakdown.customerConfirmedSupport ?? 0,
    }),
    entry("discount_applied", "29. 지원금 할인 적용가", {
      value: breakdown.supportDiscountAppliedPrice ?? breakdown.finalDiscountAppliedPrice,
      fields: [
        "breakdown.finalDiscountAppliedPrice",
        "breakdown.supportDiscountAppliedPrice",
        "quote.final_discount_applied_price",
      ],
      calculator: "computeConfirmedFromPlanned() / resolveQuoteSupportAppliedPrice()",
      priority: "breakdown.final_discount_applied_price",
      fallback: "quote.member_price (사용 금지 — breakdown 우선)",
      result: breakdown.finalDiscountAppliedPrice ?? breakdown.supportDiscountAppliedPrice,
    }),
    entry("final_partner", "30. 최종 기사 확정 지원금", {
      value: breakdown.partnerConfirmedSupport,
      fields: ["breakdown.partnerConfirmedSupport"],
      calculator: "확정 총액 − 고객 확정",
      result: breakdown.partnerConfirmedSupport,
    }),
  ];

  return [
    { id: "basic", title: "[기본 견적 정보]", entries: basic },
    { id: "limits", title: "[지원 한도 계산]", entries: limits },
    { id: "conditions", title: "[지원 조건]", entries: conditions },
    { id: "planned", title: "[예상 지원금 계산]", entries: plannedEntries },
    { id: "confirmed", title: "[확정 지원금 계산]", entries: confirmedEntries },
  ];
}

function buildSelectionSections(
  ctx: QuoteDebugContext,
  compare: MatchedPriceCompare,
  quote: Record<string, unknown> | null,
): DebugSection[] {
  const app = ctx.application;
  const lines =
    quote && ctx.role === "client"
      ? quoteSubmitPriceLines(quote as ClientQuote, app as ClientApplication)
      : null;

  const matched = resolveApplicationMatchedPriceDisplay(app, compare);
  const effectiveType = resolveEffectiveSelectedPriceType(app, {
    normalPrice: compare.quoteNormalPrice,
    supportPlannedPrice: compare.quoteSupportPlannedPrice ?? null,
    supportAppliedPrice: compare.quoteSupportAppliedPrice ?? null,
  });

  const normalDisplay =
    quote?.price != null && Number.isFinite(Number(quote.price))
      ? Math.trunc(Number(quote.price))
      : compare.quoteNormalPrice;

  const selectionEntries: DebugTraceEntry[] = [
    entry("sel_type", "31. 선택 견적 종류", {
      value: app.selected_price_type,
      fields: ["applications.selected_price_type"],
      calculator: "resolveSelectedPriceType()",
      result: app.selected_price_type ?? effectiveType,
      notes: effectiveType !== app.selected_price_type ? `화면 보정: ${effectiveType}` : undefined,
    }),
    entry("sel_label", "32. 선택 견적 라벨", {
      value: app.selected_price_label,
      fields: ["applications.selected_price_label"],
      calculator: "resolveApplicationMatchedPriceDisplay()",
      result: matched.label || app.selected_price_label,
    }),
    entry("sel_amount", "33. 선택 견적 금액", {
      value: app.selected_price,
      fields: ["applications.selected_price"],
      calculator: "(DB 저장값 — 고객 매칭 클릭 payload)",
      result: app.selected_price ?? matched.amount,
    }),
    entry("db_fields", "34. DB 저장 필드", {
      value: [
        app.selected_price_type,
        app.selected_price_label,
        app.selected_price,
        app.client_price_selection_kind,
      ].join(" / "),
      fields: [
        "applications.selected_price_type",
        "applications.selected_price_label",
        "applications.selected_price",
        "applications.client_price_selection_kind",
      ],
      calculator: "final_confirm API PATCH",
      result: `${app.selected_price_type} | ${app.selected_price_label} | ${fmtNum(app.selected_price)}`,
    }),
    entry("ui_display", "35. 화면 표시값", {
      value: matched,
      fields: ["resolveApplicationMatchedPriceDisplay", "resolveQuoteNormalPrice"],
      calculator: "ClientMatchedPricePanel / PartnerMatchedPricePanel",
      result: `매칭견적가: ${matched.label} ${fmtNum(matched.amount)} | 일반: ${fmtNum(normalDisplay)} | 예정: ${fmtNum(compare.quoteSupportPlannedPrice)} | 적용: ${fmtNum(compare.quoteSupportAppliedPrice)}`,
      notes: lines
        ? `quoteSubmitPriceLines: normal=${lines.normalPrice} support=${lines.supportPrice}`
        : undefined,
    }),
  ];

  return [
    { id: "selection", title: "[선택 견적 / 매칭]", entries: selectionEntries },
  ];
}

export function buildQuoteDebugReport(ctx: QuoteDebugContext): QuoteDebugReport {
  const app = ctx.application;
  const quote = ctx.quote ?? null;
  const breakdownRaw = quote?.support_breakdown ?? null;
  const breakdownRecord = toRecord(breakdownRaw);

  const buildOptions = {
    applicationApprovedSupportTotal: parseSupportInteger(app.sponsor_approved_support_amount),
    sponsorApprovedSupportAmount:
      parseSupportInteger(ctx.sponsorPreapproval?.approved_support_amount) ??
      parseSupportInteger(app.sponsor_approved_support_amount),
    applicationTotalPlannedSupport: parseSupportInteger(app.planned_total_support),
    sponsorEstimatedSupportAmount:
      parseSupportInteger(ctx.sponsorPreapproval?.estimated_support_amount) ??
      parseSupportInteger(app.sponsor_estimated_support_amount),
  };

  let breakdown = buildQuoteSupportBreakdown(
    (quote ?? { sponsor_quote_enabled: false }) as QuoteSupportInput,
    buildOptions,
  );

  if (ctx.role === "client" && quote) {
    try {
      const rebuilt = buildClientMemberQuoteSupport(quote as QuoteSupportInput, {
        applicationSponsorStatus: String(app.sponsor_support_status ?? ""),
        applicationTargetNormalPrice: parseSupportInteger(app.target_normal_price),
        applicationTargetMemberPrice: parseSupportInteger(app.target_member_price),
        sponsorApprovedSupportAmount: buildOptions.sponsorApprovedSupportAmount,
      });
      if (rebuilt.support_breakdown) {
        breakdown = rebuilt.support_breakdown;
      }
    } catch {
      /* keep buildQuoteSupportBreakdown result */
    }
  }

  const compare: MatchedPriceCompare = {
    quoteNormalPrice: quote ? resolveQuoteNormalPrice(quote as ClientQuote) : null,
    quoteSupportPlannedPrice: quote
      ? resolveQuoteSupportPlannedPrice(quote as ClientQuote)
      : parseSupportInteger(breakdown.supportDiscountPlannedPrice),
    quoteSupportAppliedPrice: quote
      ? resolveQuoteSupportAppliedPrice(quote as ClientQuote)
      : parseSupportInteger(breakdown.finalDiscountAppliedPrice),
  };

  const matched = resolveApplicationMatchedPriceDisplay(app, compare);
  const effectiveType = resolveEffectiveSelectedPriceType(app, {
    normalPrice: compare.quoteNormalPrice,
    supportPlannedPrice: compare.quoteSupportPlannedPrice ?? null,
    supportAppliedPrice: compare.quoteSupportAppliedPrice ?? null,
  });

  const normalLineAmount =
    quote?.price != null && Number.isFinite(Number(quote.price))
      ? Math.trunc(Number(quote.price))
      : compare.quoteNormalPrice;

  const errors = detectErrors(ctx, compare, {
    matchedLabel: matched.label,
    matchedAmount: matched.amount,
    normalLineAmount,
    supportPlanned: compare.quoteSupportPlannedPrice ?? null,
    supportApplied: compare.quoteSupportAppliedPrice ?? null,
    effectiveType,
  });

  const rawDb: DebugTraceEntry[] = Object.entries({
    "application.id": app.id,
    "application.receipt_number": app.receipt_number,
    "quote.id": quote?.id,
    "quote.price": quote?.price,
    "quote.member_price": quote?.member_price,
    "selected_price_type": app.selected_price_type,
    "selected_price": app.selected_price,
    "breakdown.calculationStatus": breakdown.calculationStatus,
  }).map(([k, v], i) =>
    entry(`raw_${i}`, k, {
      value: v,
      fields: [k],
      calculator: "(DB/API 원본)",
      result: v,
    }),
  );

  const selectionSection = buildSelectionSections(ctx, compare, quote);
  const supportSections = quote
    ? buildSupportSections(ctx, quote, breakdown, buildOptions)
    : [
        {
          id: "planned_sponsor_only",
          title: "[예상 지원금 — 후원 건만]",
          entries: [
            entry("est", "14. 예상 지원금", {
              value:
                ctx.sponsorPreapproval?.estimated_support_amount ??
                app.estimated_support_amount,
              fields: ["sponsor_preapproval.estimated_support_amount"],
              calculator: "matchSponsorPreapprovals() / estimateSupport()",
              result:
                ctx.sponsorPreapproval?.estimated_support_amount ??
                app.estimated_support_amount,
            }),
          ],
        },
      ];

  const sections: DebugSection[] = [
    { id: "raw_db", title: "1) 원본 DB 데이터", entries: rawDb },
    {
      id: "vars",
      title: "2) 계산 변수",
      entries: [
        entry("var_role", "대시보드 역할", {
          value: ctx.role,
          fields: ["QuoteDebugContext.role"],
          calculator: "buildQuoteDebugReport()",
          result: ctx.role,
        }),
        entry("var_status", "breakdown.status", {
          value: breakdown.calculationStatus,
          fields: ["support_breakdown.calculationStatus"],
          calculator: "buildQuoteSupportBreakdown()",
          result: breakdown.calculationStatus,
          notes: breakdown.calculationError,
        }),
      ],
    },
    {
      id: "support_flow",
      title: "3) 지원금 계산 과정",
      entries: [
        entry("flow_build", "breakdown 생성", {
          value: breakdown.normalPrice,
          fields: ["buildQuoteSupportBreakdown()"],
          formula: "resolvePlannedSupportSnapshot → 확정 시 computeConfirmedFromPlanned",
          calculator: "lib/support-calculation.ts :: buildQuoteSupportBreakdown()",
          result: breakdown.calculationStatus,
        }),
      ],
    },
    ...supportSections,
    {
      id: "final_selection",
      title: "4) 최종 선택 견적 계산",
      entries: selectionSection[0]?.entries ?? [],
    },
    {
      id: "persist",
      title: "5) 저장 상태",
      entries: [
        entry("persist_type", "selected_price_type", {
          value: app.selected_price_type,
          fields: ["applications.selected_price_type"],
          calculator: "final_confirm API",
          result: app.selected_price_type,
        }),
        entry("persist_label", "selected_price_label", {
          value: app.selected_price_label,
          fields: ["applications.selected_price_label"],
          calculator: "final_confirm API",
          result: app.selected_price_label,
        }),
        entry("persist_amount", "selected_price", {
          value: app.selected_price,
          fields: ["applications.selected_price"],
          calculator: "final_confirm API",
          result: app.selected_price,
        }),
        entry("persist_kind", "client_price_selection_kind", {
          value: app.client_price_selection_kind,
          fields: ["applications.client_price_selection_kind"],
          calculator: "final_confirm legacy mapping",
          result: app.client_price_selection_kind,
        }),
      ],
    },
    {
      id: "ui_state",
      title: "6) 화면 표시 상태",
      entries: [
        entry("ui_matched", "매칭견적가 (UI)", {
          value: matched.label,
          fields: ["resolveApplicationMatchedPriceDisplay()"],
          calculator: "ClientMatchedPricePanel",
          result: `${matched.label} ${matched.amount ?? "null"}`,
        }),
        entry("ui_normal", "일반견적가 (UI)", {
          value: normalLineAmount,
          fields: ["quote.price", "resolveQuoteNormalPrice()"],
          calculator: "ClientMatchedPricePanel — quote.price 우선",
          result: normalLineAmount,
        }),
        entry("ui_planned", "지원금 할인 예정가 (UI)", {
          value: compare.quoteSupportPlannedPrice,
          fields: ["resolveQuoteSupportPlannedPrice()"],
          calculator: "page-quote-screen.ts",
          result: compare.quoteSupportPlannedPrice,
        }),
        entry("ui_applied", "지원금 할인 적용가 (UI)", {
          value: compare.quoteSupportAppliedPrice,
          fields: ["resolveQuoteSupportAppliedPrice()"],
          calculator: "page-quote-screen.ts",
          result: compare.quoteSupportAppliedPrice,
        }),
      ],
    },
  ];

  if (errors.length > 0) {
    sections.push({
      id: "errors",
      title: "7) 계산 오류 감지",
      entries: errors.map((e, i) =>
        entry(`err_${i}`, e.code, {
          value: e.severity,
          fields: [],
          calculator: "detectQuoteDebugErrors()",
          result: e.message,
          notes: e.severity,
        }),
      ),
    });
  }

  return {
    role: ctx.role,
    generatedAt: new Date().toISOString(),
    sections,
    errors,
    raw:
      ctx.role === "sponsor"
        ? {
            debug_contact_lookup: ctx.debug_contact_lookup ?? null,
            quote,
            matched_driver: ctx.matched_driver ?? null,
            fetched_driver_quote: ctx.quote ?? null,
            fetched_partner_driver: ctx.matched_driver ?? null,
            popup_customer_name:
              String(app.popup_customer_name ?? app.customer_name ?? "").trim() || null,
            popup_customer_phone:
              String(app.popup_customer_phone ?? app.customer_phone ?? "").trim() || null,
            popup_driver_company:
              String(app.popup_driver_company ?? app.driver_company_name ?? "").trim() || null,
            popup_driver_name: String(app.popup_driver_name ?? app.driver_name ?? "").trim() || null,
            popup_driver_phone: String(app.popup_driver_phone ?? app.driver_phone ?? "").trim() || null,
            application: app,
            sponsor_support: ctx.sponsorPreapproval ?? null,
            support_breakdown: breakdownRecord,
            sponsor_rule: ctx.sponsorRule ?? null,
          }
        : {
            application: app,
            quote,
            matched_driver: ctx.matched_driver ?? null,
            sponsor_support: ctx.sponsorPreapproval ?? null,
            support_breakdown: breakdownRecord,
            sponsor_rule: ctx.sponsorRule ?? null,
          },
  };
}

export function clientQuoteDebugContext(
  application: ClientApplication,
  quote: ClientQuote,
): QuoteDebugContext {
  return {
    role: "client",
    application: toRecord(application),
    quote: toRecord(quote),
    sponsorPreapproval: {
      estimated_support_amount: application.sponsor_approved_support_amount,
      status: application.sponsor_support_status,
    },
  };
}

export function partnerQuoteDebugContext(call: PartnerCallLike): QuoteDebugContext {
  const sponsors = call.sponsors ?? [];
  const first = sponsors[0];
  return {
    role: "partner",
    application: toRecord(call),
    quote: call.my_quote ? toRecord(call.my_quote) : null,
    sponsorPreapproval: first
      ? {
          estimated_support_amount: first.estimated_support_amount,
          approved_support_amount: first.approved_support_amount,
          status: first.status,
        }
      : null,
  };
}

export function sponsorCallDebugContext(
  call: SponsorCallRow,
  sponsorRule?: Record<string, unknown> | null,
): QuoteDebugContext {
  const debug = call.matched_contact_debug;
  return {
    role: "sponsor",
    application: {
      ...toRecord(call),
      final_selected_quote_id:
        call.final_selected_quote_id ?? debug?.final_selected_quote_id,
      customer_name: call.popup_customer_name ?? call.customer_name,
      customer_phone: call.popup_customer_phone ?? call.customer_phone,
      driver_name: call.popup_driver_name ?? call.driver_name,
      driver_phone: call.popup_driver_phone ?? call.driver_phone,
      driver_company_name:
        call.popup_driver_company ?? call.driver_company ?? call.driver_company_name,
      fetched_profile: debug?.fetched_profile ?? null,
      popup_customer_name: call.popup_customer_name,
      popup_customer_phone: call.popup_customer_phone,
      popup_driver_company: call.popup_driver_company,
      popup_driver_name: call.popup_driver_name,
      popup_driver_phone: call.popup_driver_phone,
    },
    quote:
      call.quote ??
      call.debug_contact_lookup?.fetched_driver_quote ??
      call.debug_contact_lookup?.fetched_driver_quote_by_application_id ??
      debug?.fetched_driver_quote ??
      debug?.driver_quote ??
      null,
    matched_driver:
      call.matched_driver ??
      call.debug_contact_lookup?.fetched_partner_driver ??
      debug?.fetched_partner_driver ??
      null,
    debug_contact_lookup: call.debug_contact_lookup ?? debug?.debug_contact_lookup ?? null,
    sponsorPreapproval: {
      id: call.id,
      application_id: call.application_id,
      estimated_support_amount: call.estimated_support_amount,
      approved_support_amount: call.approved_support_amount,
      status: call.status,
      support_kind: call.support_kind,
    },
    sponsorRule: sponsorRule ?? null,
  };
}
