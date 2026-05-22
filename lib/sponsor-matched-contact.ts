import type { SupabaseClient } from "@supabase/supabase-js";

import { safeText } from "@/lib/sponsor";

export type SponsorMatchedContactDebug = {
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

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|42703|column/i.test(error?.message ?? "")
  );
}

const DRIVER_QUOTE_SELECT_FULL =
  "id, application_id, partner_driver_id, auth_user_id, price, phone, driver_name, company_name, vehicle_type, available_time, message, status";

const DRIVER_QUOTE_SELECT_BASE =
  "id, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status";

const GUEST_QUOTE_SELECT_FULL =
  "id, application_id, guest_phone, guest_driver_name, guest_company_name, price, status, match_result, vehicle_type, available_time, message";

const GUEST_QUOTE_SELECT_BASE =
  "id, application_id, guest_phone, guest_driver_name, guest_company_name, price, status, match_result";

const PARTNER_DRIVER_SELECT_FULL =
  "id, auth_user_id, company_name, manager_name, driver_name, name, phone, mobile, contact_phone, email";

const PARTNER_DRIVER_SELECT_BASE =
  "id, auth_user_id, company_name, manager_name, phone, email";

const PROFILE_SELECT = "user_id, name, phone, email, role, partner_driver_id";

async function selectWithColumnFallback<T extends Record<string, unknown>>(
  run: (
    select: string,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message?: string; code?: string } | null;
  }>,
  candidates: string[],
): Promise<T[]> {
  for (const select of candidates) {
    const { data, error } = await run(select);
    if (!error && Array.isArray(data)) return data;
    if (!isMissingColumnError(error)) break;
  }
  return [];
}

async function fetchDriverQuoteById(
  admin: SupabaseClient,
  quoteId: string,
): Promise<Record<string, unknown> | null> {
  const id = quoteId.trim();
  if (!id) return null;

  const rows = await selectWithColumnFallback<Record<string, unknown>>(
    async (select) => {
      const r = await admin.from("driver_quotes").select(select).eq("id", id).limit(1);
      return {
        data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
        error: r.error,
      };
    },
    [DRIVER_QUOTE_SELECT_FULL, DRIVER_QUOTE_SELECT_BASE],
  );
  return rows[0] ?? null;
}

async function fetchGuestQuoteById(
  admin: SupabaseClient,
  quoteId: string,
): Promise<Record<string, unknown> | null> {
  const id = quoteId.trim();
  if (!id) return null;

  const rows = await selectWithColumnFallback<Record<string, unknown>>(
    async (select) => {
      const r = await admin
        .from("guest_driver_quotes")
        .select(select)
        .eq("id", id)
        .limit(1);
      return {
        data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
        error: r.error,
      };
    },
    [GUEST_QUOTE_SELECT_FULL, GUEST_QUOTE_SELECT_BASE],
  );
  return rows[0] ?? null;
}

async function fetchDriverQuotesByIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const rows = await selectWithColumnFallback<Record<string, unknown>>(
    async (select) => {
      const r = await admin.from("driver_quotes").select(select).in("id", ids);
      return {
        data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
        error: r.error,
      };
    },
    [DRIVER_QUOTE_SELECT_FULL, DRIVER_QUOTE_SELECT_BASE],
  );
  for (const row of rows) {
    const id = safeText(row.id);
    if (id) map.set(id, row);
  }

  for (const id of ids) {
    if (!map.has(id)) {
      const one = await fetchDriverQuoteById(admin, id);
      if (one) map.set(id, one);
    }
  }
  return map;
}

async function fetchGuestQuotesByIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const rows = await selectWithColumnFallback<Record<string, unknown>>(
    async (select) => {
      const r = await admin.from("guest_driver_quotes").select(select).in("id", ids);
      return {
        data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
        error: r.error,
      };
    },
    [GUEST_QUOTE_SELECT_FULL, GUEST_QUOTE_SELECT_BASE],
  );
  for (const row of rows) {
    const id = safeText(row.id);
    if (id) map.set(id, row);
  }

  for (const id of ids) {
    if (!map.has(id)) {
      const one = await fetchGuestQuoteById(admin, id);
      if (one) map.set(id, one);
    }
  }
  return map;
}

export function buildApplicationDebugFields(
  application: Record<string, unknown>,
): Record<string, unknown> {
  const finalId = safeText(application.final_selected_quote_id);
  const guestQuoteId = safeText(application.final_selected_guest_quote_id);
  const source = safeText(application.final_selected_quote_source);

  return {
    id: safeText(application.id),
    receipt_number: safeText(application.receipt_number),
    customer_name:
      safeText(application.customer_name) ||
      safeText(application.applicant_name) ||
      safeText(application.name),
    customer_phone: pickText([application], [
      "customer_phone",
      "phone",
      "contact_phone",
      "user_phone",
      "applicant_phone",
      "customer_tel",
      "mobile",
    ]),
    phone: safeText(application.phone),
    contact_phone: safeText(application.contact_phone),
    applicant_phone: safeText(application.applicant_phone),
    applicant_name: safeText(application.applicant_name),
    name: safeText(application.name),
    group_name:
      safeText(application.group_name) ||
      safeText(application.organization_name),
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
      "group_name",
      "organization_name",
    ]) || "고객명 미등록";

  const customerPhone =
    pickText([app], [
      "customer_phone",
      "phone",
      "contact_phone",
      "user_phone",
      "applicant_phone",
      "customer_tel",
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

function resolveMatchedQuotePair(
  finalQuoteId: string,
  explicitGuestQuoteId: string,
  driverQuoteById: Map<string, Record<string, unknown>>,
  guestQuoteById: Map<string, Record<string, unknown>>,
): {
  driverQuote: Record<string, unknown> | null;
  guestQuote: Record<string, unknown> | null;
  isGuestQuote: boolean;
} {
  const driverQuote = driverQuoteById.get(finalQuoteId) ?? null;
  if (driverQuote) {
    return { driverQuote, guestQuote: null, isGuestQuote: false };
  }

  const guestId = explicitGuestQuoteId || finalQuoteId;
  const guestQuote = guestQuoteById.get(guestId) ?? null;
  return {
    driverQuote: null,
    guestQuote,
    isGuestQuote: Boolean(guestQuote),
  };
}

/** 매칭완료 application — final_selected_quote_id 기준 driver_quotes 우선 조회 */
export async function loadMatchedContactsByApplication(
  admin: SupabaseClient,
  applicationRows: Record<string, unknown>[],
): Promise<Map<string, SponsorMatchedContactBundle>> {
  const out = new Map<string, SponsorMatchedContactBundle>();

  const matched = applicationRows.filter((app) =>
    safeText(app.final_selected_quote_id),
  );
  if (matched.length === 0) return out;

  const allFinalIds = [
    ...new Set(
      matched
        .map((app) => safeText(app.final_selected_quote_id))
        .filter(Boolean),
    ),
  ];

  const driverQuoteById = await fetchDriverQuotesByIds(admin, allFinalIds);

  const guestOnlyIds = allFinalIds.filter((id) => !driverQuoteById.has(id));
  const explicitGuestIds = matched
    .map((app) => safeText(app.final_selected_guest_quote_id))
    .filter(Boolean);
  const guestIds = [...new Set([...guestOnlyIds, ...explicitGuestIds])];
  const guestQuoteById = await fetchGuestQuotesByIds(admin, guestIds);

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

  if (partnerIds.size > 0) {
    const rows = await selectWithColumnFallback<Record<string, unknown>>(
      async (select) => {
        const r = await admin
          .from("partner_drivers")
          .select(select)
          .in("id", [...partnerIds]);
        return {
          data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
          error: r.error,
        };
      },
      [PARTNER_DRIVER_SELECT_FULL, PARTNER_DRIVER_SELECT_BASE],
    );
    for (const row of rows) {
      partnerById.set(safeText(row.id), row);
      const aid = safeText(row.auth_user_id);
      if (aid) partnerByAuthId.set(aid, row);
    }
  }

  const profileByAuthId = new Map<string, Record<string, unknown>>();
  if (authUserIds.size > 0) {
    const [{ data: profileRows, error: profileErr }, partnerByAuthRows] =
      await Promise.all([
        admin
          .from("profiles")
          .select(PROFILE_SELECT)
          .in("user_id", [...authUserIds]),
        selectWithColumnFallback<Record<string, unknown>>(
          async (select) => {
            const r = await admin
              .from("partner_drivers")
              .select(select)
              .in("auth_user_id", [...authUserIds]);
            return {
              data: Array.isArray(r.data) ? (r.data as unknown as Record<string, unknown>[]) : [],
              error: r.error,
            };
          },
          [PARTNER_DRIVER_SELECT_FULL, PARTNER_DRIVER_SELECT_BASE],
        ),
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
    for (const row of partnerByAuthRows) {
      const id = safeText(row.id);
      if (id) partnerById.set(id, row);
      const aid = safeText(row.auth_user_id);
      if (aid) partnerByAuthId.set(aid, row);
    }
  }

  for (const app of matched) {
    const applicationId = safeText(app.id);
    const finalQuoteId = safeText(app.final_selected_quote_id);
    const explicitGuestId = safeText(app.final_selected_guest_quote_id);

    const { driverQuote, guestQuote, isGuestQuote } = resolveMatchedQuotePair(
      finalQuoteId,
      explicitGuestId,
      driverQuoteById,
      guestQuoteById,
    );

    let partnerRow: Record<string, unknown> | null = null;
    let profileRow: Record<string, unknown> | null = null;
    if (driverQuote && !isGuestQuote) {
      const pid = safeText(driverQuote.partner_driver_id);
      const aid = safeText(driverQuote.auth_user_id);
      partnerRow =
        (pid ? partnerById.get(pid) : null) ??
        (aid ? partnerByAuthId.get(aid) : null) ??
        null;
      profileRow = aid ? profileByAuthId.get(aid) ?? null : null;
    }

    const applicationDebug = buildApplicationDebugFields(app);
    const matchedDriver = buildMatchedDriverRecord(partnerRow, profileRow);

    const popup = resolveSponsorCustomerInfoPopup({
      application: app,
      driverQuote,
      guestQuote,
      matchedDriver,
      profile: profileRow,
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
      final_selected_quote_id: finalQuoteId,
      fetched_driver_quote: driverQuote,
      fetched_partner_driver: partnerRow,
      fetched_profile: profileRow
        ? {
            name: safeText(profileRow.name),
            phone: safeText(profileRow.phone),
            company_name: safeText(profileRow.company_name),
            role: safeText(profileRow.role),
            user_id: safeText(profileRow.user_id),
          }
        : null,
      fetched_guest_quote: guestQuote,
      application: enrichedApplication,
      driver_quote: driverQuote,
      guest_driver_quote: guestQuote,
      partner_driver: partnerRow,
      profile: profileRow
        ? {
            name: safeText(profileRow.name),
            phone: safeText(profileRow.phone),
            company_name: safeText(profileRow.company_name),
            user_id: safeText(profileRow.user_id),
            role: safeText(profileRow.role),
          }
        : null,
      popup_customer_name: popup.customer_name,
      popup_customer_phone: popup.customer_phone,
      popup_driver_company: popup.driver_company,
      popup_driver_name: popup.driver_name,
      popup_driver_phone: popup.driver_phone,
      data_source: popup.data_source,
    };

    out.set(applicationId, {
      debug,
      popup,
      quote: isGuestQuote ? guestQuote : driverQuote,
      matched_driver: matchedDriver,
    });
  }

  return out;
}
