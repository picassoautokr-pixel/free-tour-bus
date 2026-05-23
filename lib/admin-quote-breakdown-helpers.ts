/**
 * support_breakdown jsonb 필드 읽기 (UTF-8)
 */

export function breakdownRecord(
  quote: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = quote.support_breakdown;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export function breakdownField(
  breakdown: Record<string, unknown> | null,
  snake: string,
  camel: string,
): number | null {
  if (!breakdown) return null;
  const raw = breakdown[snake] ?? breakdown[camel];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
