import { calculateTotalPlannedSupport } from "@/lib/support-calculation";

export const SUPPORT_AMOUNT_PER_PASSENGER = 20_000;
export const MAX_SUPPORT_AMOUNT = 800_000;

function safePassengerCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

function safePrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

/** 인원 기준 총 예정 지원금 (후원 규칙 미매칭 시 기본값) */
export function estimateSponsorSupport(params: {
  passengerCount: unknown;
  price: unknown;
  maxPassengerCount?: number;
  dailyBudgetRemaining?: number | null;
}): {
  estimated_support_amount: number;
  supportAmount: number;
  discountedPrice: number;
} {
  const passengerCount = safePassengerCount(params.passengerCount);
  const price = safePrice(params.price);
  const supportAmount = calculateTotalPlannedSupport({
    passengerCount,
    supportPerPerson: SUPPORT_AMOUNT_PER_PASSENGER,
    supportPerCase: 0,
    maxSupportAmount: MAX_SUPPORT_AMOUNT,
    maxPassengerCount: params.maxPassengerCount ?? 0,
    dailyBudgetRemaining: params.dailyBudgetRemaining ?? null,
  });
  return {
    estimated_support_amount: supportAmount,
    supportAmount,
    discountedPrice: Math.max(price - supportAmount, 0),
  };
}
