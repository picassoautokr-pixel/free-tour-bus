import type { SupabaseClient } from "@supabase/supabase-js";

import { safeText } from "@/lib/sponsor";

export type SponsorMatchedContactDebug = {
  application: Record<string, unknown>;
  driver_quote: Record<string, unknown> | null;
  guest_driver_quote: Record<string, unknown> | null;
  partner_driver: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
};

export type SponsorCustomerInfoPopup = {
  customer_name: string;
  customer_phone: string;
  driver_company: string;
  driver_name: string;
  driver_phone: string;
  data_source: string;
};

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

export function buildApplicationDebugFields(
  application: Record<string, unknown>,
): Record<string, unknown> {
  const finalId = safeText(application.final_selected_quote_id);
  const source = safeText(application.final_selected_quote_source);
  return {
    id: safeText(application.id),
    receipt_number: safeText(application.receipt_number),
    customer_name: safeText(application.customer_name) || safeText(application.applicant_name),
    customer_phone: pickText([application], ["customer_phone", "phone", "contact_phone", "user_phone"]),
    phone: safeText(application.phone),
    contact_phone: safeText(application.contact_phone),
    applicant_name: safeText(application.applicant_name),
    name: safeText(application.name),
    group_name:
      safeText(application.group_name) ||
      safeText(application.organization_name),
    final_selected_quote_id: finalId,
    final_selected_guest_quote_id:
      source === "guest" ? finalId : safeText(application.final_selected_guest_quote_id),
    final_selected_quote_source: source,
    selected_price_type: safeText(application.selected_price_type),
    selected_price_label: safeText(application.selected_price_label),
    selected_price: application.selected_price ?? null,
    quote_status: safeText(application.quote_status),
    contact_revealed_at: safeText(application.contact_revealed_at),
  };
}

export function buildPartnerDriverDebugFields(
  partner: Record<string, unknown> | null,
  profile: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!partner && !profile) return null;
  const p = partner ?? {};
  const pr = profile ?? {};
  return {
    id: safeText(p.id),
    company_name: safeText(p.company_name),
    manager_name: safeText(p.manager_name),
    driver_name: safeText(p.driver_name) || safeText(p.manager_name),
    name: safeText(p.name) || safeText(p.manager_name),
    phone: safeText(p.phone),
    mobile: safeText(p.mobile),
    contact_phone: safeText(p.contact_phone),
    auth_user_id: safeText(p.auth_user_id),
    profiles_name: safeText(pr.name),
    profiles_phone: safeText(pr.phone),
    profiles_company_name: safeText(pr.company_name),
  };
}

export function buildGuestQuoteDebugFields(
  guest: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!guest) return null;
  return {
    id: safeText(guest.id),
    driver_name: safeText(guest.driver_name) || safeText(guest.guest_driver_name),
    name: safeText(guest.name) || safeText(guest.guest_driver_name),
    phone: safeText(guest.phone) || safeText(guest.guest_phone),
    company_name: safeText(guest.company_name) || safeText(guest.guest_company_name),
    guest_driver_name: safeText(guest.guest_driver_name),
    guest_phone: safeText(guest.guest_phone),
    guest_company_name: safeText(guest.guest_company_name),
    price: guest.price ?? null,
    status: safeText(guest.status),
  };
}

export function buildDriverQuoteDebugFields(
  quote: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!quote) return null;
  return {
    id: safeText(quote.id),
    partner_driver_id: safeText(quote.partner_driver_id),
    auth_user_id: safeText(quote.auth_user_id),
    price: quote.price ?? null,
    status: safeText(quote.status),
    company_name: safeText(quote.company_name),
    phone: safeText(quote.phone),
  };
}

export function resolveSponsorCustomerInfoPopup(
  debug: SponsorMatchedContactDebug,
): SponsorCustomerInfoPopup {
  const app = debug.application;
  const source = safeText(app.final_selected_quote_source) === "guest" ? "guest" : "member";
  const dq = debug.driver_quote;
  const gq = debug.guest_driver_quote;
  const pd = debug.partner_driver;
  const profile = debug.profile;

  const customerName =
    pickText([app], [
      "customer_name",
      "applicant_name",
      "name",
      "group_name",
    ]) || "고객명 미등록";

  const customerPhone =
    pickText([app], ["customer_phone", "phone", "contact_phone", "user_phone"]) ||
    "전화번호 미등록";

  if (source === "guest") {
    const driverName =
      pickText([gq], ["driver_name", "name", "guest_driver_name"]) || "일반기사";
    const driverPhone = pickText([gq], ["phone", "guest_phone"]) || "전화번호 미등록";
    return {
      customer_name: customerName,
      customer_phone: customerPhone,
      driver_company:
        pickText([gq], ["company_name", "guest_company_name"]) || "일반기사",
      driver_name: driverName,
      driver_phone: driverPhone,
      data_source: "guest_driver_quotes",
    };
  }

  const driverCompany =
    pickText([pd, dq, profile], ["company_name", "profiles_company_name"]) ||
    "업체명 미등록";

  const driverName =
    pickText(
      [pd, profile, dq],
      ["driver_name", "manager_name", "name", "profiles_name"],
    ) || "기사명 미등록";

  const driverPhone =
    pickText(
      [pd, profile, dq],
      ["phone", "mobile", "contact_phone", "profiles_phone"],
    ) || "전화번호 미등록";

  return {
    customer_name: customerName,
    customer_phone: customerPhone,
    driver_company: driverCompany,
    driver_name: driverName,
    driver_phone: driverPhone,
    data_source: pd
      ? "partner_drivers"
      : profile
        ? "profiles"
        : dq
          ? "driver_quotes"
          : "none",
  };
}

const DRIVER_QUOTE_MATCH_SELECT =
  "id, application_id, partner_driver_id, auth_user_id, price, status, vehicle_type, available_time, message";

const GUEST_QUOTE_MATCH_SELECT =
  "id, application_id, guest_phone, guest_driver_name, guest_company_name, price, status, match_result, vehicle_type, available_time, message";

const PARTNER_DRIVER_MATCH_SELECT =
  "id, auth_user_id, company_name, manager_name, phone";

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    /does not exist|42703|column/i.test(error?.message ?? "")
  );
}

/** 매칭완료 application 일괄 조회 — driver_quotes / guest / partner / profiles */
export async function loadMatchedContactsByApplication(
  admin: SupabaseClient,
  applicationRows: Record<string, unknown>[],
): Promise<
  Map<
    string,
    { debug: SponsorMatchedContactDebug; popup: SponsorCustomerInfoPopup }
  >
> {
  const out = new Map<
    string,
    { debug: SponsorMatchedContactDebug; popup: SponsorCustomerInfoPopup }
  >();

  const matched = applicationRows.filter((app) =>
    safeText(app.final_selected_quote_id),
  );
  if (matched.length === 0) return out;

  const memberQuoteIds: string[] = [];
  const guestQuoteIds: string[] = [];

  for (const app of matched) {
    const quoteId = safeText(app.final_selected_quote_id);
    if (!quoteId) continue;
    if (safeText(app.final_selected_quote_source) === "guest") {
      guestQuoteIds.push(quoteId);
    } else {
      memberQuoteIds.push(quoteId);
    }
  }

  const driverQuoteById = new Map<string, Record<string, unknown>>();
  const guestQuoteById = new Map<string, Record<string, unknown>>();

  if (memberQuoteIds.length > 0) {
    const { data, error } = await admin
      .from("driver_quotes")
      .select(DRIVER_QUOTE_MATCH_SELECT)
      .in("id", memberQuoteIds);
    if (!error) {
      for (const raw of Array.isArray(data) ? data : []) {
        const row = raw as Record<string, unknown>;
        driverQuoteById.set(safeText(row.id), row);
      }
    }
  }

  if (guestQuoteIds.length > 0) {
    const guestResult = await admin
      .from("guest_driver_quotes")
      .select(GUEST_QUOTE_MATCH_SELECT)
      .in("id", guestQuoteIds);
    if (!guestResult.error) {
      for (const raw of Array.isArray(guestResult.data) ? guestResult.data : []) {
        const row = raw as Record<string, unknown>;
        guestQuoteById.set(safeText(row.id), row);
      }
    } else if (isMissingColumnError(guestResult.error)) {
      const guestFallback = await admin
        .from("guest_driver_quotes")
        .select(
          "id, application_id, guest_phone, guest_driver_name, guest_company_name, price, status, match_result",
        )
        .in("id", guestQuoteIds);
      if (!guestFallback.error) {
        for (const raw of Array.isArray(guestFallback.data) ? guestFallback.data : []) {
          const row = raw as Record<string, unknown>;
          guestQuoteById.set(safeText(row.id), row);
        }
      }
    }
  }

  const partnerIds = new Set<string>();
  const authUserIds = new Set<string>();
  for (const q of driverQuoteById.values()) {
    const pid = safeText(q.partner_driver_id);
    const aid = safeText(q.auth_user_id);
    if (pid) partnerIds.add(pid);
    if (aid) authUserIds.add(aid);
  }

  const partnerById = new Map<string, Record<string, unknown>>();
  const partnerByAuthId = new Map<string, Record<string, unknown>>();
  const profileByAuthId = new Map<string, Record<string, unknown>>();

  if (partnerIds.size > 0) {
    const { data } = await admin
      .from("partner_drivers")
      .select(PARTNER_DRIVER_MATCH_SELECT)
      .in("id", [...partnerIds]);
    for (const raw of Array.isArray(data) ? data : []) {
      const row = raw as Record<string, unknown>;
      partnerById.set(safeText(row.id), row);
      const aid = safeText(row.auth_user_id);
      if (aid) partnerByAuthId.set(aid, row);
    }
  }

  if (authUserIds.size > 0) {
    const [{ data: profileRows, error: profileErr }, { data: partnerByAuth }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("user_id, name, phone, email, role, partner_driver_id")
          .in("user_id", [...authUserIds]),
        admin
          .from("partner_drivers")
          .select(PARTNER_DRIVER_MATCH_SELECT)
          .in("auth_user_id", [...authUserIds]),
      ]);
    if (!profileErr) {
      for (const raw of Array.isArray(profileRows) ? profileRows : []) {
        const row = raw as Record<string, unknown>;
        profileByAuthId.set(safeText(row.user_id), row);
        const linkedPid = safeText(row.partner_driver_id);
        if (linkedPid && partnerById.has(linkedPid)) {
          partnerByAuthId.set(safeText(row.user_id), partnerById.get(linkedPid)!);
        }
      }
    }
    for (const raw of Array.isArray(partnerByAuth) ? partnerByAuth : []) {
      const row = raw as Record<string, unknown>;
      const id = safeText(row.id);
      if (id) partnerById.set(id, row);
      const aid = safeText(row.auth_user_id);
      if (aid) partnerByAuthId.set(aid, row);
    }
  }

  for (const app of matched) {
    const applicationId = safeText(app.id);
    const quoteId = safeText(app.final_selected_quote_id);
    const isGuest = safeText(app.final_selected_quote_source) === "guest";

    const applicationDebug = buildApplicationDebugFields(app);
    const driverQuote = isGuest ? null : driverQuoteById.get(quoteId) ?? null;
    const guestQuote = isGuest ? guestQuoteById.get(quoteId) ?? null : null;

    let partnerDriver: Record<string, unknown> | null = null;
    let profile: Record<string, unknown> | null = null;
    if (driverQuote) {
      const pid = safeText(driverQuote.partner_driver_id);
      const aid = safeText(driverQuote.auth_user_id);
      partnerDriver =
        (pid ? partnerById.get(pid) : null) ??
        (aid ? partnerByAuthId.get(aid) : null) ??
        null;
      profile = aid ? profileByAuthId.get(aid) ?? null : null;
    }

    const debug: SponsorMatchedContactDebug = {
      application: applicationDebug,
      driver_quote: buildDriverQuoteDebugFields(driverQuote),
      guest_driver_quote: buildGuestQuoteDebugFields(guestQuote),
      partner_driver: buildPartnerDriverDebugFields(partnerDriver, profile),
      profile: profile
        ? {
            name: safeText(profile.name),
            phone: safeText(profile.phone),
            company_name: safeText(profile.company_name),
            user_id: safeText(profile.user_id),
          }
        : null,
    };

    const popup = resolveSponsorCustomerInfoPopup(debug);
    out.set(applicationId, { debug, popup });
  }

  return out;
}
