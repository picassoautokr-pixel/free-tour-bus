import type { SupabaseClient } from "@supabase/supabase-js";
import { logNotification, type NotificationType } from "@/lib/notification-service";

type SupabaseLike = SupabaseClient;

export type QuoteSource = "member" | "guest";

export function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

export function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function calculateDepositAmount(price: number | null): number {
  if (price == null || price <= 0) return 50_000;
  return Math.min(Math.max(Math.round(price * 0.1), 50_000), 200_000);
}

function dateKey(value: unknown): string {
  const date = new Date(safeText(value) || Date.now());
  const usable = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = usable.getFullYear();
  const month = String(usable.getMonth() + 1).padStart(2, "0");
  const day = String(usable.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateContractNumber(application: Record<string, unknown>): string {
  const receiptDigits = safeText(application.receipt_number).replace(/\D/g, "");
  const suffix =
    receiptDigits.slice(-4) ||
    safeText(application.id).replace(/-/g, "").slice(0, 4).toUpperCase() ||
    "0000";
  return `FB-CON-${dateKey(
    application.final_selected_at ||
      application.contract_started_at ||
      application.created_at,
  )}-${suffix}`;
}

export async function ensureContractNumber(
  admin: SupabaseLike,
  application: Record<string, unknown>,
): Promise<string> {
  const existing = safeText(application.contract_number);
  if (existing !== "") return existing;

  const next = generateContractNumber(application);
  const applicationId = safeText(application.id);
  if (applicationId !== "") {
    await admin
      .from("applications")
      .update({ contract_number: next })
      .eq("id", applicationId)
      .is("contract_number", null);
  }
  return next;
}

export async function selectedQuotePrice(
  admin: SupabaseLike,
  quoteId: string,
  quoteSource: QuoteSource,
): Promise<number | null> {
  const table = quoteSource === "guest" ? "guest_driver_quotes" : "driver_quotes";
  const select =
    quoteSource === "guest"
      ? "price"
      : "price, member_price, sponsor_discounted_price";
  const { data } = await admin.from(table).select(select).eq("id", quoteId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  return (
    parseInteger(row.member_price) ??
    parseInteger(row.sponsor_discounted_price) ??
    parseInteger(row.price)
  );
}

export async function ensureContractStarted(
  admin: SupabaseLike,
  applicationId: string,
  now = new Date().toISOString(),
) {
  const { data } = await admin
    .from("applications")
    .select("id, receipt_number, created_at, final_selected_at, contract_status, contract_started_at, contract_number")
    .eq("id", applicationId)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  const patch: Record<string, unknown> = {};
  if (safeText(row?.contract_status) === "") patch.contract_status = "pending";
  if (safeText(row?.contract_started_at) === "") patch.contract_started_at = now;
  if (safeText(row?.contract_number) === "") {
    patch.contract_number = generateContractNumber({
      ...row,
      id: applicationId,
      contract_started_at: safeText(row?.contract_started_at) || now,
    });
  }
  if (Object.keys(patch).length > 0) {
    await admin.from("applications").update(patch).eq("id", applicationId);
  }
}

export async function maybeStartDepositWaiting(
  admin: SupabaseLike,
  application: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const applicationId = safeText(application.id);
  const clientConfirmed = safeText(application.client_contract_confirmed_at) !== "";
  const driverConfirmed = safeText(application.driver_contract_confirmed_at) !== "";
  if (!clientConfirmed || !driverConfirmed) return {};

  const quoteId = safeText(application.final_selected_quote_id);
  const quoteSource: QuoteSource =
    safeText(application.final_selected_quote_source) === "guest" ? "guest" : "member";
  const price = quoteId === "" ? null : await selectedQuotePrice(admin, quoteId, quoteSource);
  const depositAmount = calculateDepositAmount(price);
  return {
    contract_status: "deposit_waiting",
    deposit_status: "unpaid",
    deposit_amount: depositAmount,
  };
}

export async function logContractNotification(
  admin: SupabaseLike,
  params: {
    applicationId: string;
    notificationType: NotificationType;
    message: string;
    targetType?: "customer" | "driver" | "guest_driver" | "admin";
    targetPhone?: string;
    targetName?: string;
  },
) {
  await logNotification(
    admin,
    {
      target_type: params.targetType ?? "admin",
      target_phone: params.targetPhone ?? "contract-log",
      target_name: params.targetName,
      notification_type: params.notificationType,
      application_id: params.applicationId,
      message: params.message,
      allowDuplicate: true,
    },
    { status: "logged", sent_at: new Date().toISOString() },
  );
}
