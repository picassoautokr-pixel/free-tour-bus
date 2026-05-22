import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { safeText } from "@/lib/sponsor";

export type DebugContactLookupError = {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
} | null;

export type DebugContactLookup = {
  final_selected_quote_id: string;
  sponsor_preapproval_id: string;
  lookup_map_key: string;
  application_id_from_preapproval: string;
  application_row_id: string;
  tried_driver_quotes_by_id: boolean;
  driver_quote_select_used: string | null;
  fetched_driver_quote: Record<string, unknown> | null;
  driver_quote_error: DebugContactLookupError;
  driver_quote_count: number;
  tried_driver_quotes_by_application_id: boolean;
  application_id_candidates: Array<{ label: string; value: string }>;
  fetched_driver_quote_by_application_id: Record<string, unknown> | null;
  driver_quote_by_application_id_error: DebugContactLookupError;
  driver_quote_by_application_id_matched_via: string | null;
  driver_quote_by_application_id_count: number;
  resolved_driver_quote_source: string | null;
  tried_partner_driver_id: string | null;
  tried_auth_user_id: string | null;
  fetched_partner_driver: Record<string, unknown> | null;
  partner_driver_error: DebugContactLookupError;
  fetched_profile: Record<string, unknown> | null;
  profile_error: DebugContactLookupError;
};

export type SponsorMatchedContactDebug = {
  debug_contact_lookup: DebugContactLookup;
  final_selected_quote_id: string;
  fetched_driver_quote: Record<string, unknown> | null;
  fetched_partner_driver: Record<string, unknown> | null;
  fetched_profile: Record<string, unknown> | null;
  fetched_guest_quote: Record<string, unknown> | null;
  application: Record<string, unknown>;
  driver_quote: Record<string, unknown> | null;
  guest_driver_quote: Record<string, unknown> | null;
  partner_driver: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  popup_customer_name: string;
  popup_customer_phone: string;
  popup_driver_company: string;
  popup_driver_name: string;
  popup_driver_phone: string;
  data_source: string;
};

export type SponsorCustomerInfoPopup = {
  customer_name: string;
  customer_phone: string;
  driver_company: string;
  driver_name: string;
  driver_phone: string;
  data_source: string;
};

export type SponsorMatchedContactBundle = {
  debug: SponsorMatchedContactDebug;
  popup: SponsorCustomerInfoPopup;
  quote: Record<string, unknown> | null;
  matched_driver: Record<string, unknown> | null;
  debug_contact_lookup: DebugContactLookup;
};

export type SponsorContactLookupInput = {
  mapKey: string;
  applicationRow: Record<string, unknown>;
  applicationId: string;
  sponsorPreapprovalId: string;
  finalSelectedQuoteId: string;
};

const DRIVER_QUOTE_SELECT_CANDIDATES = [
  "id, application_id, partner_driver_id, auth_user_id, price, phone, driver_name, company_name, vehicle_type, available_time, message, status",
  "id, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status",
  "id, application_id, partner_driver_id, auth_user_id, price, status",
];

const PARTNER_DRIVER_SELECT_CANDIDATES = [
  "id, auth_user_id, company_name, manager_name, driver_name, name, phone, mobile, contact_phone, email",
  "id, auth_user_id, company_name, manager_name, phone, email",
];

const PROFILE_SELECT = "user_id, name, phone, email, role, partner_driver_id";

function pickText(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      const v = safeText(src[key]);
      if (v) return v;
    }
  }
  return "";
}

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|42703|column/i.test(error?.message ?? "")
  );
}

function formatLookupError(error: PostgrestError | null): DebugContactLookupError {
  if (!error) return null;
  return {
    message: error.message ?? "unknown error",
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

function rowArray(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
}

function uniqueCandidates(
  items: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];
  for (const item of items) {
    const v = item.value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push({ label: item.label, value: v });
  }
  return out;
}

async function queryDriverQuotesById(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{
  rows: Record<string, unknown>[];
  error: DebugContactLookupError;
  selectUsed: string | null;
}> {
  let lastError: DebugContactLookupError = null;
  for (const select of DRIVER_QUOTE_SELECT_CANDIDATES) {
    const r = await admin.from("driver_quotes").select(select).eq("id", quoteId).limit(1);
    if (!r.error) {
      return { rows: rowArray(r.data), error: null, selectUsed: select };
    }
    lastError = formatLookupError(r.error);
    if (!isMissingColumnError(r.error)) {
      return { rows: [], error: lastError, selectUsed: select };
    }
  }
  return { rows: [], error: lastError, selectUsed: null };
}

async function queryDriverQuotesByApplicationId(
  admin: SupabaseClient,
  applicationId: string,
): Promise<{
  rows: Record<string, unknown>[];
  error: DebugContactLookupError;
  selectUsed: string | null;
}> {
  let lastError: DebugContactLookupError = null;
  for (const select of DRIVER_QUOTE_SELECT_CANDIDATES) {
    const r = await admin
      .from("driver_quotes")
      .select(select)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!r.error) {
      return { rows: rowArray(r.data), error: null, selectUsed: select };
    }
    lastError = formatLookupError(r.error);
    if (!isMissingColumnError(r.error)) {
      return { rows: [], error: lastError, selectUsed: select };
    }
  }
  return { rows: [], error: lastError, selectUsed: null };
}

async function lookupDriverQuoteById(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{
  quote: Record<string, unknown> | null;
  lookup: Pick<
    DebugContactLookup,
    | "tried_driver_quotes_by_id"
    | "fetched_driver_quote"
    | "driver_quote_error"
    | "driver_quote_count"
    | "driver_quote_select_used"
  >;
}> {
  const id = quoteId.trim();
  if (!id) {
    return {
      quote: null,
      lookup: {
        tried_driver_quotes_by_id: false,
        fetched_driver_quote: null,
        driver_quote_error: { message: "final_selected_quote_id empty", code: null, details: null, hint: null },
        driver_quote_count: 0,
        driver_quote_select_used: null,
      },
    };
  }

  const { rows, error, selectUsed } = await queryDriverQuotesById(admin, id);
  const quote = rows[0] ?? null;
  return {
    quote,
    lookup: {
      tried_driver_quotes_by_id: true,
      fetched_driver_quote: quote,
      driver_quote_error: quote ? null : error,
      driver_quote_count: rows.length,
      driver_quote_select_used: selectUsed,
    },
  };
}

async function lookupDriverQuoteByApplicationIds(
  admin: SupabaseClient,
  candidates: Array<{ label: string; value: string }>,
): Promise<{
  quote: Record<string, unknown> | null;
  lookup: Pick<
    DebugContactLookup,
    | "tried_driver_quotes_by_application_id"
    | "application_id_candidates"
    | "fetched_driver_quote_by_application_id"
    | "driver_quote_by_application_id_error"
    | "driver_quote_by_application_id_matched_via"
    | "driver_quote_by_application_id_count"
  >;
}> {
  const list = uniqueCandidates(candidates);
  if (list.length === 0) {
    return {
      quote: null,
      lookup: {
        tried_driver_quotes_by_application_id: false,
        application_id_candidates: [],
        fetched_driver_quote_by_application_id: null,
        driver_quote_by_application_id_error: {
          message: "no application_id candidates",
          code: null,
          details: null,
          hint: null,
        },
        driver_quote_by_application_id_matched_via: null,
        driver_quote_by_application_id_count: 0,
      },
    };
  }

  let lastError: DebugContactLookupError = null;
  for (const candidate of list) {
    const { rows, error } = await queryDriverQuotesByApplicationId(
      admin,
      candidate.value,
    );
    if (rows[0]) {
      return {
        quote: rows[0],
        lookup: {
          tried_driver_quotes_by_application_id: true,
          application_id_candidates: list,
          fetched_driver_quote_by_application_id: rows[0],
          driver_quote_by_application_id_error: null,
          driver_quote_by_application_id_matched_via: candidate.label,
          driver_quote_by_application_id_count: rows.length,
        },
      };
    }
    if (error) lastError = error;
  }

  return {
    quote: null,
    lookup: {
      tried_driver_quotes_by_application_id: true,
      application_id_candidates: list,
      fetched_driver_quote_by_application_id: null,
      driver_quote_by_application_id_error: lastError ?? {
        message: "no driver_quotes row for any application_id candidate",
        code: null,
        details: null,
        hint: null,
      },
      driver_quote_by_application_id_matched_via: null,
      driver_quote_by_application_id_count: 0,
    },
  };
}

async function lookupPartnerDriver(
  admin: SupabaseClient,
  driverQuote: Record<string, unknown> | null,
): Promise<{
  partner: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  lookup: Pick<
    DebugContactLookup,
    | "tried_partner_driver_id"
    | "tried_auth_user_id"
    | "fetched_partner_driver"
    | "partner_driver_error"
    | "fetched_profile"
    | "profile_error"
  >;
}> {
  const partnerId = safeText(driverQuote?.partner_driver_id);
  const authUserId = safeText(driverQuote?.auth_user_id);

  if (!partnerId && !authUserId) {
    return {
      partner: null,
      profile: null,
      lookup: {
        tried_partner_driver_id: null,
        tried_auth_user_id: null,
        fetched_partner_driver: null,
        partner_driver_error: {
          message: "driver_quote has no partner_driver_id or auth_user_id",
          code: null,
          details: null,
          hint: null,
        },
        fetched_profile: null,
        profile_error: null,
      },
    };
  }

  let partner: Record<string, unknown> | null = null;
  let partnerError: DebugContactLookupError = null;

  if (partnerId) {
    let lastErr: DebugContactLookupError = null;
    for (const select of PARTNER_DRIVER_SELECT_CANDIDATES) {
      const r = await admin
        .from("partner_drivers")
        .select(select)
        .eq("id", partnerId)
        .maybeSingle();
      if (!r.error && r.data) {
        partner = r.data as unknown as Record<string, unknown>;
        partnerError = null;
        break;
      }
      lastErr = formatLookupError(r.error);
      if (!isMissingColumnError(r.error)) break;
    }
    if (!partner) partnerError = lastErr;
  }

  if (!partner && authUserId) {
    let lastErr: DebugContactLookupError = null;
    for (const select of PARTNER_DRIVER_SELECT_CANDIDATES) {
      const r = await admin
        .from("partner_drivers")
        .select(select)
        .eq("auth_user_id", authUserId)
        .limit(1)
        .maybeSingle();
      if (!r.error && r.data) {
        partner = r.data as unknown as Record<string, unknown>;
        partnerError = null;
        break;
      }
      lastErr = formatLookupError(r.error);
      if (!isMissingColumnError(r.error)) break;
    }
    if (!partner && !partnerError) partnerError = lastErr;
  }

  let profile: Record<string, unknown> | null = null;
  let profileError: DebugContactLookupError = null;
  if (authUserId) {
    const r = await admin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", authUserId)
      .maybeSingle();
    if (r.error) {
      profileError = formatLookupError(r.error);
    } else if (r.data) {
      profile = r.data as unknown as Record<string, unknown>;
    }
  }

  return {
    partner,
    profile,
    lookup: {
      tried_partner_driver_id: partnerId || null,
      tried_auth_user_id: authUserId || null,
      fetched_partner_driver: partner,
      partner_driver_error: partner ? null : partnerError,
      fetched_profile: profile
        ? {
            name: safeText(profile.name),
            phone: safeText(profile.phone),
            company_name: safeText(profile.company_name),
            role: safeText(profile.role),
            user_id: safeText(profile.user_id),
          }
        : null,
      profile_error: profileError,
    },
  };
}

export function buildApplicationDebugFields(
  application: Record<string, unknown>,
  applicationId: string,
  sponsorPreapprovalId: string,
): Record<string, unknown> {
  const finalId = safeText(application.final_selected_quote_id);
  const guestQuoteId = safeText(application.final_selected_guest_quote_id);
  const source = safeText(application.final_selected_quote_source);

  return {
    id: safeText(application.id),
    application_id: applicationId,
    sponsor_preapproval_id: sponsorPreapprovalId,
    receipt_number: safeText(application.receipt_number),
    customer_name:
      safeText(application.customer_name) ||
      safeText(application.name) ||
      safeText(application.applicant_name),
    customer_phone: pickText([application], [
      "customer_phone",
      "phone",
      "contact_phone",
      "user_phone",
      "applicant_phone",
      "mobile",
    ]),
    phone: safeText(application.phone),
    customer_phone_raw: safeText(application.customer_phone),
    contact_phone: safeText(application.contact_phone),
    user_phone: safeText(application.user_phone),
    applicant_phone: safeText(application.applicant_phone),
    mobile: safeText(application.mobile),
    applicant_name: safeText(application.applicant_name),
    name: safeText(application.name),
    organization_name: safeText(application.organization_name),
    group_name: safeText(application.group_name),
    driver_name: safeText(application.driver_name),
    driver_phone: safeText(application.driver_phone),
    driver_company_name: safeText(application.driver_company_name),
    final_selected_quote_id: finalId,
    final_selected_guest_quote_id:
      guestQuoteId || (source === "guest" ? finalId : ""),
    final_selected_quote_source: source,
    selected_price_type: safeText(application.selected_price_type),
    selected_price_label: safeText(application.selected_price_label),
    selected_price: application.selected_price ?? null,
    quote_status: safeText(application.quote_status),
    contact_revealed_at: safeText(application.contact_revealed_at),
  };
}

function buildMatchedDriverRecord(
  partner: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!partner && !profile) return null;
  const p = partner ?? {};
  const pr = profile ?? {};
  return {
    id: safeText(p.id),
    auth_user_id: safeText(p.auth_user_id) || safeText(pr.user_id),
    company_name: safeText(p.company_name),
    manager_name: safeText(p.manager_name),
    driver_name: safeText(p.driver_name) || safeText(p.manager_name),
    name: safeText(p.name) || safeText(p.manager_name) || safeText(pr.name),
    phone: safeText(p.phone) || safeText(pr.phone),
    mobile: safeText(p.mobile),
    contact_phone: safeText(p.contact_phone),
    email: safeText(p.email) || safeText(pr.email),
    role: safeText(pr.role),
    profiles_name: safeText(pr.name),
    profiles_phone: safeText(pr.phone),
    profiles_company_name: safeText(pr.company_name),
  };
}

export function resolveSponsorCustomerInfoPopup(params: {
  application: Record<string, unknown>;
  driverQuote: Record<string, unknown> | null;
  guestQuote: Record<string, unknown> | null;
  matchedDriver: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  isGuestQuote: boolean;
}): SponsorCustomerInfoPopup {
  const app = params.application;
  const md = params.matchedDriver;
  const profile = params.profile;
  const dq = params.driverQuote;
  const gq = params.guestQuote;

  const customerName =
    pickText([app], [
      "customer_name",
      "name",
      "applicant_name",
      "organization_name",
      "group_name",
    ]) || "고객명 미등록";

  const customerPhone =
    pickText([app], [
      "customer_phone",
      "phone",
      "contact_phone",
      "user_phone",
      "applicant_phone",
      "mobile",
    ]) || "전화번호 미등록";

  if (params.isGuestQuote && gq) {
    return {
      customer_name: customerName,
      customer_phone: customerPhone,
      driver_company:
        pickText([gq], ["company_name", "guest_company_name"]) || "일반기사",
      driver_name:
        pickText([gq], ["driver_name", "name", "guest_driver_name"]) || "일반기사",
      driver_phone:
        pickText([gq], ["phone", "guest_phone"]) || "전화번호 미등록",
      data_source: "guest_driver_quotes",
    };
  }

  const driverCompany =
    pickText([md, dq, profile], ["company_name", "profiles_company_name"]) ||
    "업체명 미등록";

  const driverName =
    pickText(
      [md, profile, dq],
      ["driver_name", "manager_name", "name", "profiles_name"],
    ) || "기사명 미등록";

  const driverPhone =
    pickText(
      [md, profile, dq],
      ["phone", "mobile", "contact_phone", "profiles_phone"],
    ) || "전화번호 미등록";

  return {
    customer_name: customerName,
    customer_phone: customerPhone,
    driver_company: driverCompany,
    driver_name: driverName,
    driver_phone: driverPhone,
    data_source: md
      ? "partner_drivers"
      : profile
        ? "profiles"
        : dq
          ? "driver_quotes"
          : "none",
  };
}

async function resolveGuestQuoteIfNeeded(
  admin: SupabaseClient,
  finalQuoteId: string,
  driverQuote: Record<string, unknown> | null,
  explicitGuestId: string,
  source: string,
): Promise<{ guestQuote: Record<string, unknown> | null; isGuestQuote: boolean }> {
  if (driverQuote) {
    return { guestQuote: null, isGuestQuote: false };
  }
  const guestId = explicitGuestId || (source === "guest" ? finalQuoteId : "");
  if (!guestId) return { guestQuote: null, isGuestQuote: false };

  const r = await admin
    .from("guest_driver_quotes")
    .select(
      "id, application_id, guest_phone, guest_driver_name, guest_company_name, price, status",
    )
    .eq("id", guestId)
    .maybeSingle();
  const guestQuote = r.data ? (r.data as Record<string, unknown>) : null;
  return { guestQuote, isGuestQuote: Boolean(guestQuote) };
}

/** 스폰서 콜별 연락처 조회 — debug_contact_lookup에 실제 DB 오류 포함 */
export async function loadMatchedContactsForSponsorCalls(
  admin: SupabaseClient,
  inputs: SponsorContactLookupInput[],
): Promise<Map<string, SponsorMatchedContactBundle>> {
  const out = new Map<string, SponsorMatchedContactBundle>();

  for (const input of inputs) {
    const finalQuoteId = safeText(input.finalSelectedQuoteId);
    if (!finalQuoteId) continue;

    const app = input.applicationRow;
    const applicationId = safeText(input.applicationId);
    const mapKey = safeText(input.mapKey) || applicationId;
    const sponsorPreapprovalId = safeText(input.sponsorPreapprovalId);

    const byId = await lookupDriverQuoteById(admin, finalQuoteId);

    let driverQuote = byId.quote;
    let resolvedSource = driverQuote ? "driver_quotes.by_id" : null;

    const appIdCandidates = uniqueCandidates([
      { label: "preapproval.application_id", value: applicationId },
      { label: "application.id", value: safeText(app.id) },
      { label: "sponsor_preapproval.id", value: sponsorPreapprovalId },
    ]);

    const byApp = await lookupDriverQuoteByApplicationIds(admin, appIdCandidates);
    if (!driverQuote && byApp.quote) {
      driverQuote = byApp.quote;
      resolvedSource = `driver_quotes.by_application_id:${byApp.lookup.driver_quote_by_application_id_matched_via}`;
    }

    const source = safeText(app.final_selected_quote_source);
    const explicitGuestId = safeText(app.final_selected_guest_quote_id);
    const { guestQuote, isGuestQuote } = await resolveGuestQuoteIfNeeded(
      admin,
      finalQuoteId,
      driverQuote,
      explicitGuestId,
      source,
    );

    const effectiveQuote = isGuestQuote ? guestQuote : driverQuote;

    const { partner, profile, lookup: partnerLookup } = await lookupPartnerDriver(
      admin,
      isGuestQuote ? null : driverQuote,
    );

    const debugContactLookup: DebugContactLookup = {
      final_selected_quote_id: finalQuoteId,
      sponsor_preapproval_id: sponsorPreapprovalId,
      lookup_map_key: mapKey,
      application_id_from_preapproval: applicationId,
      application_row_id: safeText(app.id),
      ...byId.lookup,
      ...byApp.lookup,
      resolved_driver_quote_source: resolvedSource,
      ...partnerLookup,
    };

    const matchedDriver = buildMatchedDriverRecord(partner, profile);
    const applicationDebug = buildApplicationDebugFields(
      app,
      applicationId,
      sponsorPreapprovalId,
    );

    const popup = resolveSponsorCustomerInfoPopup({
      application: { ...app, ...applicationDebug },
      driverQuote: isGuestQuote ? null : driverQuote,
      guestQuote,
      matchedDriver,
      profile,
      isGuestQuote,
    });

    const enrichedApplication = {
      ...applicationDebug,
      customer_name: popup.customer_name,
      customer_phone: popup.customer_phone,
      driver_name: popup.driver_name,
      driver_phone: popup.driver_phone,
      driver_company_name: popup.driver_company,
    };

    const debug: SponsorMatchedContactDebug = {
      debug_contact_lookup: debugContactLookup,
      final_selected_quote_id: finalQuoteId,
      fetched_driver_quote: driverQuote,
      fetched_partner_driver: partner,
      fetched_profile: partnerLookup.fetched_profile,
      fetched_guest_quote: guestQuote,
      application: enrichedApplication,
      driver_quote: isGuestQuote ? null : driverQuote,
      guest_driver_quote: guestQuote,
      partner_driver: partner,
      profile: partnerLookup.fetched_profile,
      popup_customer_name: popup.customer_name,
      popup_customer_phone: popup.customer_phone,
      popup_driver_company: popup.driver_company,
      popup_driver_name: popup.driver_name,
      popup_driver_phone: popup.driver_phone,
      data_source: popup.data_source,
    };

    out.set(mapKey, {
      debug,
      popup,
      quote: effectiveQuote,
      matched_driver: matchedDriver,
      debug_contact_lookup: debugContactLookup,
    });
  }

  return out;
}

/** @deprecated loadMatchedContactsForSponsorCalls 사용 */
export async function loadMatchedContactsByApplication(
  admin: SupabaseClient,
  applicationRows: Record<string, unknown>[],
): Promise<Map<string, SponsorMatchedContactBundle>> {
  const inputs: SponsorContactLookupInput[] = applicationRows
    .filter((app) => safeText(app.final_selected_quote_id))
    .map((app) => {
      const applicationId = safeText(app.id);
      return {
        mapKey: applicationId,
        applicationRow: app,
        applicationId,
        sponsorPreapprovalId: "",
        finalSelectedQuoteId: safeText(app.final_selected_quote_id),
      };
    });
  return loadMatchedContactsForSponsorCalls(admin, inputs);
}
