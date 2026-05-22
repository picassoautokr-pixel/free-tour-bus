/**
 * 고객 매칭 견적가 선택 — 대시보드 공통 분기 (UTF-8)
 */

export type SelectedPriceType = "normal" | "support_planned" | "support_confirmed";

export type SelectedPriceSource = {
  selected_price_type?: string | null;
  selected_price_label?: string | null;
  selected_price?: number | null;
  client_price_selection_kind?: string | null;
  final_price_selection_kind?: string | null;
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

function labelToSelectedPriceType(label: string): SelectedPriceType | null {
  const trimmed = label.trim();
  if (trimmed === LABEL_BY_TYPE.normal) return "normal";
  if (trimmed === LABEL_BY_TYPE.support_planned) return "support_planned";
  if (trimmed === LABEL_BY_TYPE.support_confirmed) return "support_confirmed";
  return null;
}

function resolveLegacySelectedPriceType(
  source?: SelectedPriceSource | null,
): SelectedPriceType | null {
  const legacy = source?.client_price_selection_kind ?? source?.final_price_selection_kind;
  if (legacy === "support_planned_selected") return "support_planned";
  if (legacy === "support_confirmed_selected" || legacy === "support_price_selected") {
    return "support_confirmed";
  }
  if (legacy === "normal_selected" || legacy === "normal_price_selected") return "normal";
  return null;
}

function isStoredNormalLabelInconsistent(
  label: string,
  selected: number | null,
  normal: number | null,
  supportPlanned?: number | null,
  supportApplied?: number | null,
): boolean {
  if (label !== LABEL_BY_TYPE.normal || selected == null) return false;
  if (normal != null && selected < normal) return true;
  if (supportPlanned != null && selected === supportPlanned) return true;
  if (supportApplied != null && selected === supportApplied) return true;
  return false;
}

/** 금액 조합으로 저장 오류(일반 타입 + 할인가) 보정 — 할인가·지원가를 일반가보다 먼저 비교 */
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

/** 화면·분기용 — DB 타입이 잘못되어도 금액·라벨로 보정 */
export function resolveEffectiveSelectedPriceType(
  source?: SelectedPriceSource | null,
  options?: SelectedPriceDisplayOptions,
): SelectedPriceType | null {
  const storedLabel = source?.selected_price_label?.trim() ?? "";
  const storedType = resolveSelectedPriceType(source);
  const selected =
    source?.selected_price != null && Number.isFinite(source.selected_price)
      ? Math.trunc(source.selected_price)
      : null;
  const normal = options?.normalPrice ?? null;
  const supportPlanned = options?.supportPlannedPrice ?? null;
  const supportApplied = options?.supportAppliedPrice ?? null;
  const supportConfirmed = options?.supportConfirmed === true;

  const legacyType = resolveLegacySelectedPriceType(source);
  const fromLabel = storedLabel ? labelToSelectedPriceType(storedLabel) : null;
  if (
    fromLabel &&
    fromLabel !== "normal" &&
    !isStoredNormalLabelInconsistent(
      storedLabel,
      selected,
      normal,
      supportPlanned,
      supportApplied,
    )
  ) {
    return fromLabel;
  }

  const inferred = inferSelectedPriceTypeFromAmounts(
    selected,
    normal,
    supportPlanned,
    supportApplied,
    supportConfirmed,
  );

  if (
    legacyType === "support_planned" ||
    legacyType === "support_confirmed"
  ) {
    if (storedType === "normal" || storedLabel === LABEL_BY_TYPE.normal) {
      return legacyType;
    }
  }

  if (
    storedType === "normal" ||
    isStoredNormalLabelInconsistent(
      storedLabel,
      selected,
      normal,
      supportPlanned,
      supportApplied,
    )
  ) {
    if (inferred && inferred !== "normal") return inferred;
  }

  if (storedType) return storedType;
  if (legacyType) return legacyType;
  if (
    fromLabel &&
    !isStoredNormalLabelInconsistent(
      storedLabel,
      selected,
      normal,
      supportPlanned,
      supportApplied,
    )
  ) {
    return fromLabel;
  }
  return inferred;
}

export function resolveSelectedPriceType(
  source?: SelectedPriceSource | null,
): SelectedPriceType | null {
  if (!source) return null;
  const raw = (source.selected_price_type ?? "").trim().toLowerCase();
  if (raw === "normal" || raw === "support_planned" || raw === "support_confirmed") {
    return raw;
  }
  const legacy = source.client_price_selection_kind ?? source.final_price_selection_kind;
  if (legacy === "normal_selected" || legacy === "normal_price_selected") return "normal";
  if (legacy === "support_planned_selected") return "support_planned";
  if (legacy === "support_confirmed_selected" || legacy === "support_price_selected") {
    return "support_confirmed";
  }
  return null;
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
  const storedLabel = source?.selected_price_label?.trim() ?? "";
  const selected =
    source?.selected_price != null && Number.isFinite(source.selected_price)
      ? Math.trunc(source.selected_price)
      : null;
  const normal = options?.normalPrice ?? null;

  if (
    storedLabel &&
    !isStoredNormalLabelInconsistent(
      storedLabel,
      selected,
      normal,
      options?.supportPlannedPrice,
      options?.supportAppliedPrice,
    )
  ) {
    return storedLabel;
  }

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

/** 매칭완료 선택 견적 — application.selected_* 우선, 없으면 quote/breakdown fallback */
export function resolveApplicationMatchedPriceDisplay(
  application: SelectedPriceSource | null | undefined,
  compare?: MatchedPriceCompare,
  quoteFallback?: QuoteMatchedPriceFallback | null,
): { label: string; amount: number | null } {
  const normal = compare?.quoteNormalPrice ?? null;
  const planned = compare?.quoteSupportPlannedPrice ?? null;
  const applied = compare?.quoteSupportAppliedPrice ?? null;

  const storedAmount = parseStoredAmount(application);
  const storedLabel = (application?.selected_price_label ?? "").trim();

  if (storedAmount != null) {
    let label = storedLabel;
    const storedType = resolveSelectedPriceType(application);
    if (
      normal != null &&
      storedAmount !== normal &&
      (storedType === "normal" || label === LABEL_BY_TYPE.normal)
    ) {
      if (planned != null && storedAmount === planned) {
        label = LABEL_BY_TYPE.support_planned;
      } else if (applied != null && storedAmount === applied) {
        label = LABEL_BY_TYPE.support_confirmed;
      } else if (storedAmount < normal) {
        label = LABEL_BY_TYPE.support_planned;
      }
    }
    if (!label) {
      const effective = resolveEffectiveSelectedPriceType(application, {
        normalPrice: normal,
        supportPlannedPrice: planned ?? null,
        supportAppliedPrice: applied ?? null,
      });
      if (effective) label = labelForSelectedPriceType(effective);
    }
    return { label: label || LABEL_BY_TYPE.normal, amount: storedAmount };
  }

  const matchedQuoteId = (
    application as SelectedPriceSource & { final_selected_quote_id?: string | null }
  )?.final_selected_quote_id;
  const isMatched = (matchedQuoteId ?? "").trim() !== "";

  if (isMatched && quoteFallback) {
    if (isQuoteSupportConfirmedFallback(quoteFallback)) {
      const appliedAmount =
        applied ?? resolveAppliedPriceFromQuoteFallback(quoteFallback);
      if (appliedAmount != null) {
        return { label: LABEL_BY_TYPE.support_confirmed, amount: appliedAmount };
      }
    }
    const plannedAmount =
      planned ?? resolvePlannedPriceFromQuoteFallback(quoteFallback);
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

  if (storedLabel) {
    return { label: storedLabel, amount: storedAmount };
  }

  const effective = resolveEffectiveSelectedPriceType(application, {
    normalPrice: normal,
    supportPlannedPrice: planned ?? null,
    supportAppliedPrice: applied ?? null,
  });
  if (effective) {
    const label = labelForSelectedPriceType(effective);
    const amount =
      effective === "normal"
        ? normal
        : effective === "support_planned"
          ? planned
          : applied;
    return { label, amount: amount ?? storedAmount };
  }

  return { label: "", amount: null };
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
