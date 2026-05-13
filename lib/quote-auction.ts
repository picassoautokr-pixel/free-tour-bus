import { estimateSponsorSupport } from "@/lib/support-estimate";

export const QUOTE_FINAL_CONFIRM_DELAY_HOURS = 12;
export const QUOTE_NO_QUOTES_EXTENSION_HOURS = 12;
export const QUOTE_MAX_EXTENSION_ROUNDS = 6;

export type QuoteStatus =
  | "collecting"
  | "closed_by_time"
  | "closed_by_quote_count"
  | "closed_by_price"
  | "manually_closed"
  | "auto_selected"
  | "final_selected"
  | "completed"
  | "extended_no_quotes"
  | "contract_pending";

export type QuoteSource = "member" | "guest";

type SupabaseLike = {
  from: (table: string) => any;
};

type QuoteCandidate = {
  id: string;
  source: QuoteSource;
  price: number | null;
  memberPrice: number | null;
  isSupportQuote: boolean;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function addHours(isoOrDate: string | Date, hours: number): string {
  const base = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const time = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  return new Date(time + hours * 60 * 60 * 1000).toISOString();
}

function isQuoteOpenStatus(status: string): boolean {
  return status === "" || status === "collecting" || status === "extended_no_quotes";
}

export function quoteLifecycleSelectColumns(): string {
  return [
    "id",
    "quote_status",
    "quote_deadline_at",
    "quote_limit_count",
    "target_normal_price",
    "target_member_price",
    "quote_closed_at",
    "quote_closed_reason",
    "auto_selected_quote_id",
    "auto_selected_quote_source",
    "auto_selected_at",
    "auto_final_confirm_at",
    "final_selected_quote_id",
    "final_selected_quote_source",
    "final_selected_at",
    "extension_round",
    "extension_started_at",
    "support_client_reward_ratio",
    "support_driver_ratio",
    "passenger_count",
  ].join(", ");
}

export function isApplicationQuoteAccepting(application: Record<string, unknown>): boolean {
  const status = safeText(application.quote_status, "collecting");
  if (!isQuoteOpenStatus(status)) return false;
  return safeText(application.quote_closed_at) === "";
}

export function supportRewardRatios(extensionRound: unknown): {
  support_client_reward_ratio: number;
  support_driver_ratio: number;
} {
  const round = Math.max(0, parseInteger(extensionRound) ?? 0);
  if (round <= 0) {
    return { support_client_reward_ratio: 0, support_driver_ratio: 100 };
  }
  if (round === 1) {
    return { support_client_reward_ratio: 20, support_driver_ratio: 80 };
  }
  return { support_client_reward_ratio: 40, support_driver_ratio: 60 };
}

export function supportRewardAmounts(params: {
  passengerCount: unknown;
  extensionRound: unknown;
}): {
  estimated_support_amount: number;
  client_reward_amount: number;
  driver_support_amount: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
} {
  const estimated = estimateSponsorSupport({
    passengerCount: params.passengerCount,
    price: 0,
  }).supportAmount;
  const ratios = supportRewardRatios(params.extensionRound);
  return {
    estimated_support_amount: estimated,
    client_reward_amount: Math.round(
      (estimated * ratios.support_client_reward_ratio) / 100,
    ),
    driver_support_amount: Math.max(
      estimated - Math.round((estimated * ratios.support_client_reward_ratio) / 100),
      0,
    ),
    ...ratios,
  };
}

async function fetchQuoteCandidates(
  admin: SupabaseLike,
  applicationId: string,
): Promise<QuoteCandidate[]> {
  const [{ data: memberRows }, { data: guestRows }] = await Promise.all([
    admin
      .from("driver_quotes")
      .select("id, price, member_price, sponsor_discounted_price, sponsor_quote_enabled")
      .eq("application_id", applicationId),
    admin.from("guest_driver_quotes").select("id, price").eq("application_id", applicationId),
  ]);

  const members = (Array.isArray(memberRows) ? memberRows : []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const memberPrice =
      parseInteger(row.member_price) ?? parseInteger(row.sponsor_discounted_price);
    return {
      id: safeText(row.id),
      source: "member" as const,
      price: parseInteger(row.price),
      memberPrice,
      isSupportQuote: row.sponsor_quote_enabled === true && memberPrice != null,
    };
  });

  const guests = (Array.isArray(guestRows) ? guestRows : []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: safeText(row.id),
      source: "guest" as const,
      price: parseInteger(row.price),
      memberPrice: null,
      isSupportQuote: false,
    };
  });

  return [...members, ...guests].filter((quote) => quote.id !== "");
}

function bestQuote(candidates: QuoteCandidate[]): QuoteCandidate | null {
  const priced = candidates
    .map((quote) => {
      const priority = quote.source === "member" && quote.isSupportQuote
        ? 0
        : quote.source === "member"
          ? 1
          : 2;
      const effectivePrice =
        priority === 0 ? quote.memberPrice : quote.price;
      return {
        ...quote,
        priority,
        effectivePrice,
      };
    })
    .filter((quote) => quote.effectivePrice != null && quote.effectivePrice >= 0);

  priced.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.effectivePrice ?? Number.MAX_SAFE_INTEGER) -
      (b.effectivePrice ?? Number.MAX_SAFE_INTEGER);
  });

  return priced[0] ?? null;
}

async function markSelectedQuote(
  admin: SupabaseLike,
  quote: QuoteCandidate,
  status: "provisional_selected" | "final_selected",
) {
  if (quote.source === "member") {
    await admin.from("driver_quotes").update({ status }).eq("id", quote.id);
    return;
  }
  await admin
    .from("guest_driver_quotes")
    .update({
      status,
      match_result: status === "final_selected" ? "selected" : "provisional_selected",
    })
    .eq("id", quote.id);
}

async function markNotSelectedQuotes(
  admin: SupabaseLike,
  applicationId: string,
  selected: QuoteCandidate,
) {
  await admin
    .from("driver_quotes")
    .update({ status: "not_selected" })
    .eq("application_id", applicationId)
    .neq("id", selected.source === "member" ? selected.id : "");
  await admin
    .from("guest_driver_quotes")
    .update({ status: "not_selected", match_result: "not_selected" })
    .eq("application_id", applicationId)
    .neq("id", selected.source === "guest" ? selected.id : "");
}

async function closeApplication(
  admin: SupabaseLike,
  applicationId: string,
  status: QuoteStatus,
  reason: string,
) {
  const now = new Date().toISOString();
  await admin
    .from("applications")
    .update({
      quote_status: status,
      quote_closed_at: now,
      quote_closed_reason: reason,
    })
    .eq("id", applicationId);
}

async function autoExtendNoQuotes(
  admin: SupabaseLike,
  application: Record<string, unknown>,
) {
  const currentRound = Math.max(0, parseInteger(application.extension_round) ?? 0);
  if (currentRound >= QUOTE_MAX_EXTENSION_ROUNDS) {
    await closeApplication(
      admin,
      safeText(application.id),
      "closed_by_time",
      "no_quotes_extension_limit",
    );
    return;
  }

  const nextRound = currentRound + 1;
  const ratios = supportRewardRatios(nextRound);
  const baseDeadline = safeText(application.quote_deadline_at) || new Date().toISOString();
  await admin
    .from("applications")
    .update({
      extension_round: nextRound,
      extension_started_at: new Date().toISOString(),
      quote_deadline_at: addHours(baseDeadline, QUOTE_NO_QUOTES_EXTENSION_HOURS),
      quote_status: "extended_no_quotes",
      quote_closed_at: null,
      quote_closed_reason: "no_quotes_auto_extended",
      ...ratios,
    })
    .eq("id", safeText(application.id));
}

async function autoSelectIfNeeded(
  admin: SupabaseLike,
  application: Record<string, unknown>,
  candidates: QuoteCandidate[],
) {
  if (safeText(application.auto_selected_quote_id) !== "") return;
  if (safeText(application.final_selected_quote_id) !== "") return;

  const selected = bestQuote(candidates);
  if (!selected) return;

  const now = new Date().toISOString();
  await admin
    .from("applications")
    .update({
      auto_selected_quote_id: selected.id,
      auto_selected_quote_source: selected.source,
      auto_selected_at: now,
      auto_final_confirm_at: addHours(now, QUOTE_FINAL_CONFIRM_DELAY_HOURS),
      quote_status: "auto_selected",
    })
    .eq("id", safeText(application.id));
  await markSelectedQuote(admin, selected, "provisional_selected");
}

async function autoFinalConfirmIfDue(
  admin: SupabaseLike,
  application: Record<string, unknown>,
) {
  const finalSelectedQuoteId = safeText(application.final_selected_quote_id);
  const autoSelectedQuoteId = safeText(application.auto_selected_quote_id);
  const autoFinalConfirmAt = safeText(application.auto_final_confirm_at);
  if (finalSelectedQuoteId !== "" || autoSelectedQuoteId === "" || autoFinalConfirmAt === "") {
    return;
  }
  const confirmAt = new Date(autoFinalConfirmAt).getTime();
  if (!Number.isFinite(confirmAt) || confirmAt > Date.now()) return;

  const source = safeText(application.auto_selected_quote_source) === "guest"
    ? "guest"
    : "member";
  const selected: QuoteCandidate = {
    id: autoSelectedQuoteId,
    source,
    price: null,
    memberPrice: null,
    isSupportQuote: false,
  };
  const now = new Date().toISOString();
  await admin
    .from("applications")
    .update({
      final_selected_quote_id: autoSelectedQuoteId,
      final_selected_quote_source: source,
      final_selected_at: now,
      quote_status: "final_selected",
      contract_status: "contract_pending",
      contact_revealed_at: now,
    })
    .eq("id", safeText(application.id));
  await markSelectedQuote(admin, selected, "final_selected");
  await markNotSelectedQuotes(admin, safeText(application.id), selected);
}

function closingReasonFor(
  application: Record<string, unknown>,
  candidates: QuoteCandidate[],
): { status: QuoteStatus; reason: string } | null {
  const deadline = safeText(application.quote_deadline_at);
  if (deadline !== "") {
    const deadlineMs = new Date(deadline).getTime();
    if (Number.isFinite(deadlineMs) && Date.now() > deadlineMs) {
      return { status: "closed_by_time", reason: "time_deadline" };
    }
  }

  const limit = parseInteger(application.quote_limit_count);
  if (limit != null && limit > 0 && candidates.length >= limit) {
    return { status: "closed_by_quote_count", reason: "quote_limit_count" };
  }

  const targetNormal = parseInteger(application.target_normal_price);
  if (
    targetNormal != null &&
    targetNormal > 0 &&
    candidates.some((quote) => quote.price != null && quote.price <= targetNormal)
  ) {
    return { status: "closed_by_price", reason: "target_normal_price" };
  }

  const targetMember = parseInteger(application.target_member_price);
  if (
    targetMember != null &&
    targetMember > 0 &&
    candidates.some(
      (quote) =>
        quote.source === "member" &&
        quote.memberPrice != null &&
        quote.memberPrice <= targetMember,
    )
  ) {
    return { status: "closed_by_price", reason: "target_member_price" };
  }

  return null;
}

export async function processApplicationQuoteLifecycle(
  admin: SupabaseLike,
  applicationId: string,
): Promise<void> {
  if (applicationId === "") return;

  const { data } = await admin
    .from("applications")
    .select(quoteLifecycleSelectColumns())
    .eq("id", applicationId)
    .maybeSingle();

  const application = data as Record<string, unknown> | null | undefined;
  if (!application) return;

  await autoFinalConfirmIfDue(admin, application);

  const status = safeText(application.quote_status, "collecting");
  if (!isQuoteOpenStatus(status) || safeText(application.quote_closed_at) !== "") {
    if (status === "auto_selected") return;
    const alreadyClosedWithQuotes = [
      "closed_by_time",
      "closed_by_quote_count",
      "closed_by_price",
      "manually_closed",
    ].includes(status);
    if (!alreadyClosedWithQuotes) return;
    const candidates = await fetchQuoteCandidates(admin, applicationId);
    await autoSelectIfNeeded(admin, application, candidates);
    return;
  }

  const candidates = await fetchQuoteCandidates(admin, applicationId);
  const close = closingReasonFor(application, candidates);
  if (!close) return;

  if (candidates.length === 0) {
    await autoExtendNoQuotes(admin, application);
    return;
  }

  await closeApplication(admin, applicationId, close.status, close.reason);
  await autoSelectIfNeeded(admin, application, candidates);
}

