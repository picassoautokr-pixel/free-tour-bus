/**
 * 고객 매칭 견적가 선택 — 대시보드 공통 분기 (UTF-8)
 */

import {
  normalizeSelectedPriceType,
  type NormalizedSelectedPriceType,
} from "@/lib/status-normalizer";

export type SelectedPriceType = "normal" | "support_planned" | "support_confirmed";

/** status-normalizer의 NormalizedSelectedPriceType → SelectedPriceType 변환 (unknown 제외) */
function fromNormalized(
  n: NormalizedSelectedPriceType,
): SelectedPriceType | null {
  if (n === "unknown") return null;
  return n;
}

export type SelectedPriceSource = {
  selected_price_type?: string | null;
  selected_price_label?: string | null;
  selected_price?: number | null;
  client_price_selection_kind?: string | null;
  final_price_selection_kind?: string | null;
  final_selected_quote_id?: string | null;
};

export const NORMAL_MATCH_SPONSOR_REASON = "고객이 일반견적가로 매칭완료";

const LABEL_BY_TYPE: Record<SelectedPriceType, string> = {
  normal: "일반견적가",
  support_planned: "지원금 할인 예상가",
  support_confirmed: "지원금 할인 적용가",
};

function labelForSelectedPriceType(type: SelectedPriceType): string {
  return LABEL_BY_TYPE[type];
}

const LABEL_ALIASES: Record<SelectedPriceType, readonly string[]> = {
  normal: ["일반견적가"],
  support_planned: ["지원금 할인 예상가", "지원금 할인 예정가"],
  support_confirmed: ["지원금 할인 적용가", "지원금 할인 확정가"],
};

function labelToSelectedPriceType(label: string): SelectedPriceType | null {
  const trimmed = label.trim();
  if (LABEL_ALIASES.normal.includes(trimmed)) return "normal";
  if (LABEL_ALIASES.support_planned.includes(trimmed)) return "support_planned";
  if (LABEL_ALIASES.support_confirmed.includes(trimmed)) return "support_confirmed";
  return null;
}

function resolveLegacySelectedPriceType(
  source?: SelectedPriceSource | null,
): SelectedPriceType | null {
  const legacy = source?.client_price_selection_kind ?? source?.final_price_selection_kind;
  if (!legacy) return null;
  return fromNormalized(normalizeSelectedPriceType(legacy));
}

/** 금액 조합으로 매칭 전 추론 (저장된 type이 있으면 이 함수를 사용하지 않음) */
export function inferSelectedPriceTypeFromAmounts(
  selected: number | null,
  normal: number | null,
  supportPlanned: number | null,
  supportApplied: number | null,
  supportConfirmed = false,
): SelectedPriceType | null {
  if (selected == null) return null;
  if (supportPlanned != null && selected === supportPlanned) return "support_planned";
  if (supportApplied != null && selected === supportApplied) return "support_confirmed";
  if (normal != null && selected === normal) return "normal";
  if (normal != null && selected < normal) {
    return supportConfirmed ? "support_confirmed" : "support_planned";
  }
  return null;
}

export type SelectedPriceDisplayOptions = {
  normalPrice?: number | null;
  supportPlannedPrice?: number | null;
  supportAppliedPrice?: number | null;
  supportConfirmed?: boolean;
};

/**
 * 화면·분기용 selected_price_type 해석.
 *
 * 정책 (source of truth: applications.selected_price_*):
 *   1. selected_price_type (text)
 *   2. client_price_selection_kind (legacy)
 *   3. selected_price_label (저장 라벨)
 *   4. (매칭 전 등) 금액 추론 fallback
 *
 * 저장된 type이 있으면 절대 금액 비교로 덮어쓰지 않는다.
 */
export function resolveEffectiveSelectedPriceType(
  source?: SelectedPriceSource | null,
  options?: SelectedPriceDisplayOptions,
): SelectedPriceType | null {
  const storedType = resolveSelectedPriceType(source);
  if (storedType) return storedType;

  const storedLabel = source?.selected_price_label?.trim() ?? "";
  if (storedLabel) {
    const fromLabel = labelToSelectedPriceType(storedLabel);
    if (fromLabel) return fromLabel;
  }

  const selected =
    source?.selected_price != null && Number.isFinite(source.selected_price)
      ? Math.trunc(source.selected_price)
      : null;
  const normal = options?.normalPrice ?? null;
  const supportPlanned = options?.supportPlannedPrice ?? null;
  const supportApplied = options?.supportAppliedPrice ?? null;
  const supportConfirmed = options?.supportConfirmed === true;

  return inferSelectedPriceTypeFromAmounts(
    selected,
    normal,
    supportPlanned,
    supportApplied,
    supportConfirmed,
  );
}

export function resolveSelectedPriceType(
  source?: SelectedPriceSource | null,
): SelectedPriceType | null {
  if (!source) return null;
  const typeRaw = (source.selected_price_type ?? "").trim();
  if (typeRaw !== "") {
    const normalized = fromNormalized(normalizeSelectedPriceType(typeRaw));
    if (normalized) return normalized;
  }
  return resolveLegacySelectedPriceType(source);
}

export function isNormalPriceSelection(
  source?: SelectedPriceSource | null,
  options?: SelectedPriceDisplayOptions,
): boolean {
  return resolveEffectiveSelectedPriceType(source, options) === "normal";
}

export function isSupportPriceSelection(
  source?: SelectedPriceSource | null,
  options?: SelectedPriceDisplayOptions,
): boolean {
  const type = resolveEffectiveSelectedPriceType(source, options);
  return type === "support_planned" || type === "support_confirmed";
}

export function resolveSelectedPriceLabel(
  source?: SelectedPriceSource | null,
  options?: SelectedPriceDisplayOptions,
): string {
  const storedType = resolveSelectedPriceType(source);
  if (storedType) {
    const storedLabel = source?.selected_price_label?.trim() ?? "";
    if (storedLabel && labelToSelectedPriceType(storedLabel) === storedType) {
      return storedLabel;
    }
    return labelForSelectedPriceType(storedType);
  }
  const storedLabel = source?.selected_price_label?.trim() ?? "";
  if (storedLabel) return storedLabel;
  const type = resolveEffectiveSelectedPriceType(source, options);
  if (type) return labelForSelectedPriceType(type);
  return "";
}

/** 최종 결제가격 — selected_price 우선 */
export function resolveFinalPaymentPrice(
  source?: SelectedPriceSource | null,
  options?: {
    normalPrice?: number | null;
    supportPlannedPrice?: number | null;
    supportAppliedPrice?: number | null;
  },
): number | null {
  if (
    source?.selected_price != null &&
    Number.isFinite(source.selected_price) &&
    source.selected_price >= 0
  ) {
    return Math.trunc(source.selected_price);
  }
  const type = resolveSelectedPriceType(source);
  if (type === "normal") return options?.normalPrice ?? null;
  if (type === "support_planned") {
    return options?.supportPlannedPrice ?? options?.supportAppliedPrice ?? null;
  }
  if (type === "support_confirmed") {
    return options?.supportAppliedPrice ?? options?.supportPlannedPrice ?? null;
  }
  return (
    options?.supportAppliedPrice ??
    options?.supportPlannedPrice ??
    options?.normalPrice ??
    null
  );
}

export function isApplicationMatched(source: {
  final_selected_quote_id?: string | null;
  quote_status?: string | null;
}): boolean {
  const id = (source.final_selected_quote_id ?? "").trim();
  if (id === "") return false;
  const status = (source.quote_status ?? "").trim();
  return ["final_selected", "contract_pending", "completed"].includes(status);
}

export type MatchedPriceCompare = {
  quoteNormalPrice: number | null;
  quoteSupportPlannedPrice?: number | null;
  quoteSupportAppliedPrice?: number | null;
};

export type QuoteMatchedPriceFallback = {
  price?: number | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  confirmed_discount_price?: number | null;
  support_breakdown?: {
    isConfirmed?: boolean;
    is_confirmed?: boolean;
    supportDiscountPlannedPrice?: number | null;
    supportDiscountAppliedPrice?: number | null;
    finalDiscountAppliedPrice?: number | null;
  } | null;
};

function parseStoredAmount(source?: SelectedPriceSource | null): number | null {
  if (
    source?.selected_price != null &&
    Number.isFinite(source.selected_price) &&
    source.selected_price >= 0
  ) {
    return Math.trunc(source.selected_price);
  }
  return null;
}

function resolveAppliedPriceFromQuoteFallback(
  quote?: QuoteMatchedPriceFallback | null,
): number | null {
  if (!quote) return null;
  const breakdown = quote.support_breakdown;
  const fromBreakdown =
    breakdown?.finalDiscountAppliedPrice ??
    breakdown?.supportDiscountAppliedPrice ??
    null;
  if (fromBreakdown != null && Number.isFinite(fromBreakdown)) {
    return Math.trunc(fromBreakdown);
  }
  const raw =
    quote.final_discount_applied_price ??
    quote.support_discount_applied_price ??
    quote.confirmed_discount_price;
  if (raw != null && Number.isFinite(raw)) return Math.trunc(raw);
  return null;
}

function resolvePlannedPriceFromQuoteFallback(
  quote?: QuoteMatchedPriceFallback | null,
): number | null {
  if (!quote) return null;
  const breakdown = quote.support_breakdown;
  const fromBreakdown = breakdown?.supportDiscountPlannedPrice;
  if (fromBreakdown != null && Number.isFinite(fromBreakdown)) {
    return Math.trunc(fromBreakdown);
  }
  const raw = quote.support_discount_planned_price;
  if (raw != null && Number.isFinite(raw)) return Math.trunc(raw);
  return null;
}

function isQuoteSupportConfirmedFallback(quote?: QuoteMatchedPriceFallback | null): boolean {
  if (!quote?.support_breakdown) return false;
  const b = quote.support_breakdown;
  return b.isConfirmed === true || b.is_confirmed === true;
}

/**
 * 매칭완료 선택 견적 표시.
 *
 * fallback 우선순위 (명세):
 *   1. applications.selected_price_type + selected_price_label + selected_price
 *   2. quote.support_breakdown 계산값
 *   3. quote.price
 *   4. 미확정 (label="", amount=null)
 */
export function resolveApplicationMatchedPriceDisplay(
  application: SelectedPriceSource | null | undefined,
  compare?: MatchedPriceCompare,
  quoteFallback?: QuoteMatchedPriceFallback | null,
): { label: string; amount: number | null } {
  const normal = compare?.quoteNormalPrice ?? null;
  const planned = compare?.quoteSupportPlannedPrice ?? null;
  const applied = compare?.quoteSupportAppliedPrice ?? null;

  const storedAmount = parseStoredAmount(application);
  const storedType = resolveSelectedPriceType(application);
  const storedLabel = (application?.selected_price_label ?? "").trim();

  if (storedType) {
    const label =
      storedLabel && labelToSelectedPriceType(storedLabel) === storedType
        ? storedLabel
        : labelForSelectedPriceType(storedType);
    const amount =
      storedAmount ??
      (storedType === "normal"
        ? normal
        : storedType === "support_planned"
          ? planned ?? resolvePlannedPriceFromQuoteFallback(quoteFallback)
          : applied ?? resolveAppliedPriceFromQuoteFallback(quoteFallback));
    return { label, amount };
  }

  if (storedLabel) {
    const fromLabel = labelToSelectedPriceType(storedLabel);
    if (fromLabel) {
      const amount =
        storedAmount ??
        (fromLabel === "normal"
          ? normal
          : fromLabel === "support_planned"
            ? planned ?? resolvePlannedPriceFromQuoteFallback(quoteFallback)
            : applied ?? resolveAppliedPriceFromQuoteFallback(quoteFallback));
      return { label: labelForSelectedPriceType(fromLabel), amount };
    }
    if (storedAmount != null) return { label: storedLabel, amount: storedAmount };
  }

  const matchedQuoteId = (
    application as SelectedPriceSource & { final_selected_quote_id?: string | null }
  )?.final_selected_quote_id;
  const isMatched = (matchedQuoteId ?? "").trim() !== "";
  if (isMatched && quoteFallback) {
    if (isQuoteSupportConfirmedFallback(quoteFallback)) {
      const appliedAmount = applied ?? resolveAppliedPriceFromQuoteFallback(quoteFallback);
      if (appliedAmount != null) {
        return { label: LABEL_BY_TYPE.support_confirmed, amount: appliedAmount };
      }
    }
    const plannedAmount = planned ?? resolvePlannedPriceFromQuoteFallback(quoteFallback);
    if (plannedAmount != null) {
      return { label: LABEL_BY_TYPE.support_planned, amount: plannedAmount };
    }
    const normalAmount =
      normal ??
      (quoteFallback.price != null && Number.isFinite(quoteFallback.price)
        ? Math.trunc(quoteFallback.price)
        : null);
    if (normalAmount != null) {
      return { label: LABEL_BY_TYPE.normal, amount: normalAmount };
    }
  }

  return { label: "", amount: storedAmount };
}

/** 매칭 완료 후 일반견적가 선택 → 후원/지원 UI 숨김 */
/** 클라이언트·파트너 매칭완료 — 매칭견적가 한 줄 (종류 + 금액) */
export function resolveClientMatchedQuoteLine(
  source: SelectedPriceSource | null | undefined,
  options?: SelectedPriceDisplayOptions,
): { kindLabel: string; amount: number | null } {
  const line = resolveApplicationMatchedPriceDisplay(source, {
    quoteNormalPrice: options?.normalPrice ?? null,
    quoteSupportPlannedPrice: options?.supportPlannedPrice,
    quoteSupportAppliedPrice: options?.supportAppliedPrice,
  });
  return { kindLabel: line.label, amount: line.amount };
}

export function shouldHideSponsorSupportUiForMatch(
  source?: SelectedPriceSource | null,
  matched = true,
  options?: SelectedPriceDisplayOptions,
): boolean {
  if (!matched) return false;
  return isNormalPriceSelection(source, options);
}

export function isSponsorSupportUnusedByNormalMatch(
  call: SelectedPriceSource & {
    final_selected_quote_id?: string | null;
    matched_reason?: string | null;
  },
): boolean {
  const matched = (call.final_selected_quote_id ?? "").trim() !== "";
  if (!matched) return false;
  if (isNormalPriceSelection(call)) return true;
  const reason = (call.matched_reason ?? "").trim();
  return reason.includes("일반견적가");
}
