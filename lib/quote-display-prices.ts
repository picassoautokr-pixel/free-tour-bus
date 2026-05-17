export type QuoteDisplayPriceInput = {
  price?: unknown;
  final_member_price?: unknown;
  member_price?: unknown;
  sponsor_discounted_price?: unknown;
  final_customer_support_amount?: unknown;
  customer_support_amount?: unknown;
  support_discount_amount?: unknown;
};

export type QuoteDisplayPrices = {
  normalPrice: number | null;
  supportCustomerAmount: number;
  supportPrice: number | null;
};

export function parseDisplayInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getQuoteDisplayPrices(quote: QuoteDisplayPriceInput): QuoteDisplayPrices {
  const normalPrice = parseDisplayInteger(quote.price);
  const finalCustomerSupportAmount = parseDisplayInteger(quote.final_customer_support_amount);
  const customerSupportAmount = parseDisplayInteger(quote.customer_support_amount);
  const supportDiscountAmount = parseDisplayInteger(quote.support_discount_amount);
  const storedSupportPrice =
    parseDisplayInteger(quote.final_member_price) ??
    parseDisplayInteger(quote.member_price) ??
    parseDisplayInteger(quote.sponsor_discounted_price);
  const supportCustomerAmount =
    (finalCustomerSupportAmount ?? 0) > 0
      ? finalCustomerSupportAmount ?? 0
      : (customerSupportAmount ?? 0) > 0
        ? customerSupportAmount ?? 0
        : (supportDiscountAmount ?? 0) > 0
          ? supportDiscountAmount ?? 0
          : normalPrice != null && storedSupportPrice != null && storedSupportPrice < normalPrice
            ? normalPrice - storedSupportPrice
            : 0;
  const supportPrice =
    storedSupportPrice ??
    (normalPrice != null && supportCustomerAmount > 0
      ? Math.max(normalPrice - supportCustomerAmount, 0)
      : null);

  return {
    normalPrice,
    supportCustomerAmount,
    supportPrice,
  };
}
