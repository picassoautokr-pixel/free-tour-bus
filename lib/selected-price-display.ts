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

export function resolveSelectedPriceType(
  source?: SelectedPriceSource | null,
): SelectedPriceType | null {
  if (!source) return null;
  const raw = (source.selected_price_type ?? "").trim().toLowerCase();
  if (raw === "normal" || raw === "support_planned" || raw === "support_confirmed") {
    return raw;
  }
  const legacy = source.client_price_selection_kind ?? source.final_price_selection_kind;
  if (legacy === "normal_price_selected") return "normal";
  if (legacy === "support_planned_selected") return "support_planned";
  if (legacy === "support_price_selected") return "support_confirmed";
  return null;
}

export function isNormalPriceSelection(source?: SelectedPriceSource | null): boolean {
  return resolveSelectedPriceType(source) === "normal";
}

export function isSupportPriceSelection(source?: SelectedPriceSource | null): boolean {
  const type = resolveSelectedPriceType(source);
  return type === "support_planned" || type === "support_confirmed";
}

export function resolveSelectedPriceLabel(source?: SelectedPriceSource | null): string {
  if (source?.selected_price_label?.trim()) return source.selected_price_label.trim();
  const type = resolveSelectedPriceType(source);
  if (type === "normal") return "일반견적가";
  if (type === "support_planned") return "지원금 할인 예정가";
  if (type === "support_confirmed") return "지원금 할인 적용가";
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

/** 매칭 완료 후 일반견적가 선택 → 후원/지원 UI 숨김 */
/** 클라이언트 매칭완료 — 매칭견적가 한 줄 (종류 + 금액) */
export function resolveClientMatchedQuoteLine(
  source: SelectedPriceSource | null | undefined,
  options?: {
    normalPrice?: number | null;
    supportPlannedPrice?: number | null;
    supportAppliedPrice?: number | null;
    supportConfirmed?: boolean;
  },
): { kindLabel: string; amount: number | null } {
  let kindLabel = resolveSelectedPriceLabel(source);
  let type = resolveSelectedPriceType(source);

  const normal = options?.normalPrice ?? null;
  const supportPlanned = options?.supportPlannedPrice ?? null;
  const supportApplied = options?.supportAppliedPrice ?? null;
  const supportConfirmed = options?.supportConfirmed === true;

  if (!type) {
    if (source?.client_price_selection_kind === "normal_price_selected") {
      type = "normal";
    } else if (source?.client_price_selection_kind === "support_planned_selected") {
      type = "support_planned";
    } else if (source?.client_price_selection_kind === "support_price_selected") {
      type = "support_confirmed";
    } else if (
      supportApplied != null &&
      normal != null &&
      supportApplied < normal
    ) {
      type = supportConfirmed ? "support_confirmed" : "support_planned";
    } else if (normal != null) {
      type = "normal";
    }
    if (!kindLabel && type) {
      if (type === "normal") kindLabel = "일반견적가";
      else if (type === "support_planned") kindLabel = "지원금 할인 예정가";
      else if (type === "support_confirmed") kindLabel = "지원금 할인 적용가";
    }
  }

  let amount =
    source?.selected_price != null && Number.isFinite(source.selected_price)
      ? Math.trunc(source.selected_price)
      : null;

  if (amount == null) {
    amount = resolveFinalPaymentPrice(source, {
      normalPrice: normal,
      supportPlannedPrice: supportPlanned,
      supportAppliedPrice: supportApplied,
    });
  }
  if (amount == null && type === "normal") amount = normal;
  if (amount == null && type === "support_planned") amount = supportPlanned ?? supportApplied;
  if (amount == null && type === "support_confirmed") amount = supportApplied ?? supportPlanned;
  if (amount == null) amount = supportApplied ?? supportPlanned ?? normal;

  return { kindLabel: kindLabel || "일반견적가", amount };
}

export function shouldHideSponsorSupportUiForMatch(
  source?: SelectedPriceSource | null,
  matched = true,
): boolean {
  if (!matched) return false;
  return isNormalPriceSelection(source);
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
