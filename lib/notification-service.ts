import type { SupabaseClient } from "@supabase/supabase-js";
import { SolapiMessageService } from "solapi";

type SupabaseLike = SupabaseClient;

export type NotificationType =
  | "new_application"
  | "quote_closed"
  | "auto_selected_customer"
  | "auto_selected_driver"
  | "final_selected_customer"
  | "final_selected_driver"
  | "extended_no_quotes"
  | "guest_not_selected"
  | "contract_client_confirmed"
  | "contract_driver_confirmed"
  | "deposit_waiting"
  | "deposit_paid"
  | "ride_confirmed"
  | "sponsor_preapproval_approved"
  | "sponsor_preapproval_rejected"
  | "sponsor_staff_assigned";

type NotificationInput = {
  target_type: "customer" | "driver" | "guest_driver" | "admin" | "sponsor_staff";
  target_phone: string;
  target_name?: string;
  notification_type: NotificationType;
  application_id?: string;
  quote_id?: string;
  quote_source?: string;
  message: string;
  allowDuplicate?: boolean;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function normalizeKoreanMobileDigits(value: unknown): string | null {
  const digits = safeText(value).replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

export function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://www.free-bus.co.kr";
}

export function formatWon(value: number | null | undefined): string {
  return value == null ? "확인 중" : `${value.toLocaleString("ko-KR")}원`;
}

async function notificationTableAvailable(admin: SupabaseLike): Promise<boolean> {
  try {
    const { error } = await admin
      .from("notification_logs")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function preventDuplicateNotification(
  admin: SupabaseLike,
  input: NotificationInput,
): Promise<boolean> {
  if (input.allowDuplicate) return false;
  if (!input.application_id) return false;
  const phone = normalizeKoreanMobileDigits(input.target_phone);
  if (!phone) return false;
  try {
    const { data, error } = await admin
      .from("notification_logs")
      .select("id")
      .eq("application_id", input.application_id)
      .eq("target_phone", phone)
      .eq("notification_type", input.notification_type)
      .limit(1);
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export async function logNotification(
  admin: SupabaseLike,
  input: NotificationInput,
  patch?: { status?: string; error?: string | null; sent_at?: string | null },
): Promise<string | null> {
  const phone = normalizeKoreanMobileDigits(input.target_phone) ?? safeText(input.target_phone);
  try {
    const { data, error } = await admin
      .from("notification_logs")
      .insert({
        target_type: input.target_type,
        target_phone: phone,
        target_name: input.target_name ?? null,
        notification_type: input.notification_type,
        application_id: input.application_id || null,
        quote_id: input.quote_id || null,
        quote_source: input.quote_source || null,
        message: input.message,
        status: patch?.status ?? "pending",
        error: patch?.error ?? null,
        sent_at: patch?.sent_at ?? null,
      })
      .select("id")
      .single();
    if (error) return null;
    return safeText((data as { id?: unknown } | null)?.id) || null;
  } catch {
    return null;
  }
}

export async function sendNotificationSms(
  admin: SupabaseLike,
  input: NotificationInput,
): Promise<void> {
  const tableOk = await notificationTableAvailable(admin);
  const phone = normalizeKoreanMobileDigits(input.target_phone);
  if (!phone) {
    if (tableOk) {
      await logNotification(admin, input, {
        status: "failed",
        error: "invalid_phone",
      });
    }
    return;
  }

  if (tableOk && (await preventDuplicateNotification(admin, input))) {
    return;
  }

  const logId = tableOk ? await logNotification(admin, { ...input, target_phone: phone }) : null;
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !from) {
    if (tableOk && logId) {
      await admin
        .from("notification_logs")
        .update({
          status: "skipped",
          error: "SOLAPI environment variables are not configured.",
        })
        .eq("id", logId);
    }
    return;
  }

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to: phone, from, text: input.message }]);
    if (tableOk && logId) {
      await admin
        .from("notification_logs")
        .update({
          status: "sent",
          error: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
  } catch (e) {
    if (tableOk && logId) {
      await admin
        .from("notification_logs")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        })
        .eq("id", logId);
    }
  }
}

