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

export function estimateSponsorSupport(params: {
  passengerCount: unknown;
  price: unknown;
}): {
  estimated_support_amount: number;
  supportAmount: number;
  discountedPrice: number;
} {
  const passengerCount = safePassengerCount(params.passengerCount);
  const price = safePrice(params.price);
  const supportAmount = Math.min(
    passengerCount * SUPPORT_AMOUNT_PER_PASSENGER,
    MAX_SUPPORT_AMOUNT,
  );
  return {
    estimated_support_amount: supportAmount,
    supportAmount,
    discountedPrice: Math.max(price - supportAmount, 0),
  };
}
