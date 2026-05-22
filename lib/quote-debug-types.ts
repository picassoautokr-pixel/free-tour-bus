/**
 * 견적 디버그 패널 타입 (UTF-8)
 */

export type QuoteDebugRole = "client" | "partner" | "sponsor";

export type DebugTraceEntry = {
  id: string;
  title: string;
  value: string;
  fields: string[];
  formula?: string;
  result: string;
  calculator?: string;
  priority?: string;
  fallback?: string;
  notes?: string;
};

export type DebugSection = {
  id: string;
  title: string;
  entries: DebugTraceEntry[];
};

export type QuoteDebugError = {
  code: string;
  message: string;
  severity: "error" | "warn";
};

export type QuoteDebugReport = {
  role: QuoteDebugRole;
  generatedAt: string;
  sections: DebugSection[];
  errors: QuoteDebugError[];
  raw: {
    application: Record<string, unknown>;
    quote: Record<string, unknown> | null;
    matched_driver?: Record<string, unknown> | null;
    sponsor_support: Record<string, unknown> | null;
    support_breakdown: Record<string, unknown> | null;
    sponsor_rule: Record<string, unknown> | null;
    debug_contact_lookup?: Record<string, unknown> | null;
    final_selected_quote_id?: string | null;
    fetched_driver_quote?: Record<string, unknown> | null;
    fetched_partner_driver?: Record<string, unknown> | null;
    fetched_profile?: Record<string, unknown> | null;
    popup_customer_name?: string | null;
    popup_customer_phone?: string | null;
    popup_driver_company?: string | null;
    popup_driver_name?: string | null;
    popup_driver_phone?: string | null;
  };
};

export type QuoteDebugContext = {
  role: QuoteDebugRole;
  application: Record<string, unknown>;
  quote?: Record<string, unknown> | null;
  matched_driver?: Record<string, unknown> | null;
  debug_contact_lookup?: Record<string, unknown> | null;
  sponsorPreapproval?: Record<string, unknown> | null;
  sponsorRule?: Record<string, unknown> | null;
  sponsorCompany?: Record<string, unknown> | null;
};
