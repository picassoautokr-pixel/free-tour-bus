"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as XLSX from "xlsx";

import {
  fetchProfileForAuthUser,
  resolveAdminRoleAccess,
  type Profile,
} from "@/lib/profile";
import { PartnerDriversAdmin } from "@/components/admin/PartnerDriversAdmin";
import { normalizePartnerDrivers } from "@/lib/partner-drivers-admin";
import { createSupabaseClient } from "@/lib/supabase";

/** 목록·상세 공통 — Supabase row 정규화 */
type ApplicationDetail = {
  id: string;
  created_at: string | null;
  receipt_number: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_detail: string;
  departure_region: string;
  destination: string;
  destination_detail: string;
  stopovers: string[];
  departure_date: string | null;
  departure_time: string;
  return_date: string | null;
  passenger_count: number | null;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string;
  request_message: string;
  attachment_url: string;
  file_url: string;
  file_name: string;
  admin_memo: string;
  status: string;
};

type DriverQuoteDetail = {
  id: string;
  created_at: string;
  partner_driver_id: string;
  company_name: string;
  manager_name: string;
  phone: string;
  price: number | null;
  estimated_support_amount?: number | null;
  support_discount_amount?: number | null;
  member_price?: number | null;
  is_member_quote?: boolean;
  converted_from_guest_quote_id?: string;
  converted_from_guest_price?: number | null;
  sponsor_support_amount?: number | null;
  sponsor_discounted_price?: number | null;
  sponsor_quote_enabled?: boolean;
  driver_support_amount?: number | null;
  client_reward_amount?: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
};

type ApplicationQuoteLifecycle = {
  id: string;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  quote_closed_reason: string;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  auto_selected_at: string;
  auto_final_confirm_at: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  final_selected_at: string;
  contact_revealed_at: string;
  extension_round: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
  contract_status: string;
  estimated_support_amount: number;
  client_reward_amount: number;
  driver_support_amount: number;
};

type GuestDriverQuoteDetail = {
  id: string;
  created_at: string;
  application_id: string;
  quote_referral_id: string;
  referral_token: string;
  guest_company_name: string;
  guest_driver_name: string;
  guest_phone: string;
  price: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
  match_result: string;
  result_notified_at: string;
  result_sms_error: string;
  converted_to_member_quote_id?: string;
  converted_at?: string;
  member_converted?: boolean;
  linked_partner_company?: string;
  linked_partner_phone?: string;
};

type QuoteAutomationSettingsForm = {
  business_start_time: string;
  business_end_time: string;
  auto_final_confirm_delay_minutes: number;
  timezone: string;
};

const APPLICATION_STATUSES = [
  { value: "pending", label: "접수완료" },
  { value: "reviewing", label: "검토중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
] as const;

type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number]["value"];

type StatusFilterValue = "all" | ApplicationStatusValue;

type SortKey =
  | "created_at"
  | "receipt_number"
  | "application_type"
  | "applicant_name"
  | "phone"
  | "organization_name"
  | "departure"
  | "departure_region"
  | "destination"
  | "passenger_count"
  | "status"
  | "admin_memo";

type SortDirection = "asc" | "desc";

/** DB에 정의된 값 또는 레거시 별칭만 매핑합니다. 알 수 없으면 null. */
function parseKnownApplicationStatus(raw: string): ApplicationStatusValue | null {
  const n = raw.trim().toLowerCase();
  if (n === "approve" || n === "approved") return "approved";
  if (n === "reject" || n === "rejected" || n === "denied") return "rejected";
  if (n === "reviewing" || n === "review") return "reviewing";
  if (n === "pending") return "pending";
  return null;
}

function statusLabelForSearch(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  if (trimmed === "" || trimmed === "—") return "";
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed;
}

function statusLabelForExport(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  if (trimmed === "" || trimmed === "—") return "";
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed;
}

function formatIsoDate(value: string | null): string {
  if (value == null || value.trim() === "") return "";
  // Supabase가 yyyy-mm-dd 또는 ISO를 줄 수 있어 그대로 유지하되, ISO는 날짜만 잘라 표시
  const v = value.trim();
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toISOString().slice(0, 10);
}

function ymdTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 선택 UI 초기값용 — 미매핑이면 pending 으로 둡니다. */
function coerceApplicationStatus(raw: string): ApplicationStatusValue {
  return parseKnownApplicationStatus(raw) ?? "pending";
}

function isPersistableApplicationId(id: string): boolean {
  return id.length > 0 && !id.startsWith("idx-");
}

/** 로컬 날짜 기준 오늘 접수 여부 */
function isCreatedAtSameLocalDay(
  createdAt: string | null,
  ref: Date,
): boolean {
  if (createdAt == null || createdAt.trim() === "") return false;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

/** 로컬 달력 기준 이번 달 접수 여부 */
function isCreatedAtSameLocalMonth(
  createdAt: string | null,
  ref: Date,
): boolean {
  if (createdAt == null || createdAt.trim() === "") return false;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  );
}

type DashboardStats = {
  total: number;
  todayCount: number;
  monthCount: number;
  pending: number;
  reviewing: number;
  approved: number;
  rejected: number;
};

function computeDashboardStats(rows: ApplicationDetail[]): DashboardStats {
  const now = new Date();
  let todayCount = 0;
  let monthCount = 0;
  let pending = 0;
  let reviewing = 0;
  let approved = 0;
  let rejected = 0;

  for (const row of rows) {
    if (isCreatedAtSameLocalDay(row.created_at, now)) todayCount++;
    if (isCreatedAtSameLocalMonth(row.created_at, now)) monthCount++;

    const known = parseKnownApplicationStatus(row.status);
    if (known === "pending") pending++;
    else if (known === "reviewing") reviewing++;
    else if (known === "approved") approved++;
    else if (known === "rejected") rejected++;
  }

  return {
    total: rows.length,
    todayCount,
    monthCount,
    pending,
    reviewing,
    approved,
    rejected,
  };
}

function safeText(value: unknown, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

/** DB 예전 신청유형 문자열을 현재 화면 명칭으로 표시 */
const LEGACY_APPLICATION_TYPE_LABELS: Record<string, string> = {
  "기계약 전세버스 지원금 신청": "이미 예약을 완료하신 경우",
  "기예약된 전세버스 지원금 신청": "이미 예약을 완료하신 경우",

  "전세버스 신규 신청": "신규로 예약이 필요하신 경우",
  "지원금 확정된 제휴버스 신청": "신규로 예약이 필요하신 경우",
  "지원금이 확정된 제휴버스 추천 비교": "신규로 예약이 필요하신 경우",
  "지원금이 확정된 전세버스 추천 비교": "신규로 예약이 필요하신 경우",

  "파트너 소개 신청": "지원금 대상 버스로 등록신청(업체신청용)",
  "지원금 확정 버스로 제휴신청(업체등록용)":
    "지원금 대상 버스로 등록신청(업체신청용)",
};

function displayApplicationTypeLabel(raw: string): string {
  const t = raw.trim();
  if (t === "" || t === "—") return "—";
  return LEGACY_APPLICATION_TYPE_LABELS[t] ?? t;
}

const NOTIFICATION_SOUND_PREF_KEY = "admin-notification-sound-enabled";

/** 공유 AudioContext로 비프 재생 (호출부에서 try/catch 권장) */
function playNotificationBeep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.18);
}

type AdminToast = { message: string };

/** 실시간 INSERT 전용 토스트 (우측 상단) */
type RealtimeToastPayload =
  | {
      kind: "bus";
      applicantName: string;
      applicationTypeLabel: string;
      passengerLine: string;
    }
  | {
      kind: "partner";
      title: string;
      message: string;
    };

type RecentNotificationItem = {
  kind: "bus" | "partner";
  id: string;
  created_at: string | null;
} & (
  | {
      kind: "bus";
      applicant_name: string;
      application_type: string;
      passenger_count: number | null;
    }
  | {
      kind: "partner";
      notification_id?: string;
      message: string;
    }
);

function parseStopovers(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v) => typeof v === "string").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v) => typeof v === "string")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {
      /* 한 줄 문자열이면 쉼표 분리 시도 */
      return t.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseAttachmentUrl(r: Record<string, unknown>): string {
  const candidates = [
    r.attachment_url,
    r.attachment_file_url,
    r.file_url,
    r.attachment,
  ];
  for (const c of candidates) {
    const s = safeText(c, "");
    if (s !== "—" && (s.startsWith("http://") || s.startsWith("https://"))) {
      return s;
    }
  }
  return "";
}

function memoPreview(memo: string, maxChars = 28): string {
  const trimmed = memo.trim();
  if (trimmed === "") return "-";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

function getFileExtFromNameOrUrl(name: string, url: string): string {
  const raw = (name || "").trim();
  const fromName = raw.includes(".") ? raw.split(".").pop() ?? "" : "";
  const fromUrl = (() => {
    try {
      const u = new URL(url);
      const p = u.pathname;
      const last = p.split("/").pop() ?? "";
      return last.includes(".") ? last.split(".").pop() ?? "" : "";
    } catch {
      const last = url.split("?")[0]?.split("#")[0]?.split("/").pop() ?? "";
      return last.includes(".") ? last.split(".").pop() ?? "" : "";
    }
  })();

  return (fromName || fromUrl).toLowerCase();
}

function isImageExt(ext: string) {
  return ["jpg", "jpeg", "png", "webp"].includes(ext);
}

function isPdfExt(ext: string) {
  return ext === "pdf";
}

function normalizeRows(data: unknown): ApplicationDetail[] {
  if (data == null) return [];
  if (!Array.isArray(data)) return [];

  return data.map((raw, index) => {
    const r = raw as Record<string, unknown>;
    const idRaw = r.id;
    const id =
      idRaw != null && String(idRaw).trim() !== ""
        ? String(idRaw)
        : `idx-${index}`;

    const created =
      r.created_at != null && String(r.created_at).trim() !== ""
        ? String(r.created_at)
        : null;

    const pc = r.passenger_count;
    let passengerCount: number | null = null;
    if (typeof pc === "number" && Number.isFinite(pc)) passengerCount = pc;
    else if (typeof pc === "string" && pc.trim() !== "") {
      const n = Number.parseInt(pc, 10);
      if (Number.isFinite(n)) passengerCount = n;
    }

    const depDate =
      r.departure_date != null && String(r.departure_date).trim() !== ""
        ? String(r.departure_date)
        : null;
    const retDate =
      r.return_date != null && String(r.return_date).trim() !== ""
        ? String(r.return_date)
        : null;

    const attachmentUrl = parseAttachmentUrl(r);
    const attachmentDisplay =
      attachmentUrl !== "" ? attachmentUrl : safeText(r.attachment_url);

    const receiptRaw = r.receipt_number;
    const receiptNumber =
      receiptRaw != null && String(receiptRaw).trim() !== ""
        ? String(receiptRaw).trim()
        : "-";

    return {
      id,
      created_at: created,
      receipt_number: receiptNumber,
      application_type: safeText(r.application_type),
      trip_type: safeText(r.trip_type),
      bus_grade: safeText(r.bus_grade),
      departure: safeText(r.departure),
      departure_detail: safeText(r.departure_detail),
      departure_region: safeText(r.departure_region, ""),
      destination: safeText(r.destination),
      destination_detail: safeText(r.destination_detail),
      stopovers: parseStopovers(r.stopovers),
      departure_date: depDate,
      departure_time: safeText(r.departure_time),
      return_date: retDate,
      passenger_count: passengerCount,
      applicant_name: safeText(r.applicant_name),
      phone: safeText(r.phone),
      organization_name: safeText(r.organization_name),
      organization_type: safeText(r.organization_type),
      request_message: safeText(r.request_message),
      attachment_url: attachmentDisplay === "—" ? "" : attachmentDisplay,
      file_url: safeText(r.file_url, ""),
      file_name: safeText(r.file_name, ""),
      admin_memo: safeText(r.admin_memo, ""),
      status: safeText(r.status, ""),
    };
  });
}

function formatCreatedAt(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateOnly(value: string | null): string {
  if (value == null || value === "") return "—";
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  } catch {
    /* fallthrough */
  }
  return value;
}

function formatDepartureTimeLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "—") return "—";
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  }
  try {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
  } catch {
    /* fallthrough */
  }
  return trimmed;
}

function formatDepartureDateTimeLine(
  departureDate: string | null,
  departureTimeRaw: string,
): string {
  const dateStr = formatDateOnly(departureDate);
  const timeStr = formatDepartureTimeLabel(departureTimeRaw);
  if (dateStr === "—" && timeStr === "—") return "—";
  if (dateStr === "—") return timeStr;
  if (timeStr === "—") return dateStr;
  return `${dateStr} ${timeStr}`;
}

function StatusBadge({ status }: { status: string }) {
  const trimmed = status.trim();
  if (trimmed === "" || trimmed === "—") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
        —
      </span>
    );
  }

  const known = parseKnownApplicationStatus(status);

  let label: string;
  let className: string;

  if (known === null) {
    label = trimmed;
    className =
      "border-slate-200 bg-slate-50 text-slate-700 ring-slate-100";
  } else if (known === "pending") {
    label = "접수완료";
    className =
      "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100";
  } else if (known === "reviewing") {
    label = "검토중";
    className =
      "border-amber-300 bg-amber-50 text-amber-950 ring-amber-100";
  } else if (known === "approved") {
    label = "승인완료";
    className =
      "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-100";
  } else {
    label = "반려";
    className = "border-red-200 bg-red-50 text-red-800 ring-red-100";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

function statusLabelForSms(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed === "" || trimmed === "—" ? "—" : trimmed;
}

function hasPersistedReceiptNumber(row: ApplicationDetail): boolean {
  const rn = row.receipt_number.trim();
  return rn !== "" && rn !== "-" && rn !== "—";
}

function buildDefaultSmsText(row: ApplicationDetail): string {
  const status = coerceApplicationStatus(row.status);
  const memo = row.admin_memo.trim();
  const rn = row.receipt_number.trim();
  const receiptBlock = hasPersistedReceiptNumber(row)
    ? `\n\n접수번호: ${rn}`
    : "";

  if (status === "pending") {
    return `[무료관광버스]\n신청이 정상 접수되었습니다.${receiptBlock}\n\n관리자 심사 후 문자로 결과를 안내드립니다.\n감사합니다.\n`;
  }
  if (status === "reviewing") {
    return `[무료관광버스]\n신청 내용 검토 중입니다.${receiptBlock}\n\n추가 확인 후 안내드리겠습니다.\n감사합니다.\n`;
  }
  if (status === "approved") {
    return `[무료관광버스]\n신청이 승인되었습니다.${receiptBlock}\n\n담당자가 순차 연락드릴 예정입니다.\n감사합니다.\n`;
  }

  return `[무료관광버스]\n신청이 반려되었습니다.${receiptBlock}\n\n사유:\n${memo || "사유 미기재"}\n\n문의사항은 고객센터로 연락 부탁드립니다.\n`;
}

function SmsModal({
  row,
  open,
  message,
  onChangeMessage,
  onSend,
  sendLoading,
  sendError,
  onCopy,
  onClose,
}: {
  row: ApplicationDetail;
  open: boolean;
  message: string;
  onChangeMessage: (next: string) => void;
  onSend: () => void | Promise<void>;
  sendLoading: boolean;
  sendError: string | null;
  onCopy: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4 py-10 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-modal-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div>
            <h3 id="sms-modal-title" className="text-lg font-black tracking-tight">
              문자 발송
            </h3>
            <p className="mt-1 text-xs font-semibold text-white/70">
              솔라피로 발송하거나, 복사하여 다른 채널로 보낼 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                신청자명
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {row.applicant_name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                연락처
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">{row.phone}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                신청 유형
              </p>
              <p className="mt-1 text-sm font-bold leading-snug text-slate-900">
                {displayApplicationTypeLabel(row.application_type)}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                현재 상태
              </p>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={row.status} />
                <span className="text-xs font-semibold text-slate-600">
                  {statusLabelForSms(row.status)}
                </span>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              문자 내용
            </span>
            <textarea
              value={message}
              onChange={(e) => onChangeMessage(e.target.value)}
              disabled={sendLoading}
              className="mt-2 min-h-[220px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </label>

          {sendError ? (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              role="alert"
            >
              {sendError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={
                sendLoading || message.trim() === "" || row.phone.trim() === ""
              }
              className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendLoading ? "발송 중…" : "솔라피로 발송"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={sendLoading}
              className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              복사하기
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={sendLoading}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function StatusChangeSection({
  rowId,
  statusFromServer,
  memoFromServer,
  onSaved,
}: {
  rowId: string;
  statusFromServer: string;
  memoFromServer: string;
  onSaved: (nextStatus: ApplicationStatusValue, nextMemo: string) => void;
}) {
  const persistedId = isPersistableApplicationId(rowId);
  const normalizedSaved = coerceApplicationStatus(statusFromServer);

  const [selected, setSelected] = useState<ApplicationStatusValue>(() =>
    coerceApplicationStatus(statusFromServer),
  );
  const [memo, setMemo] = useState(() => memoFromServer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unchanged =
    selected === normalizedSaved &&
    (memo ?? "").trim() === (memoFromServer ?? "").trim();

  const handleSave = async () => {
    if (!persistedId) {
      setError(
        "이 행은 임시 ID입니다. 목록 상단의 새로고침 후 다시 시도해 주세요.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error: updateError } = await supabase
        .from("applications")
        .update({ status: selected, admin_memo: memo })
        .eq("id", rowId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      onSaved(selected, memo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm ring-1 ring-slate-100/80">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        상태 변경
      </p>
      <p className="mt-1 text-xs text-slate-500">
        내부용 메모이며 저장 후 목록 배지가 바로 반영됩니다.
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value as ApplicationStatusValue)
          }
          disabled={saving || !persistedId}
          className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
          aria-label="신청 상태 선택"
        >
          {APPLICATION_STATUSES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            관리자 메모
          </span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            disabled={saving || !persistedId}
            placeholder="반려 이유, 승인 참고사항, 지원금 전달 담당자에게 공유할 내용을 입력하세요."
            className="mt-2 min-h-[140px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            ※ 내부용 메모입니다. 신청자에게 노출되지 않습니다.
          </p>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !persistedId || unchanged}
        className="mt-3 h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {saving ? "저장 중…" : "상태 및 메모 저장"}
      </button>

      {!persistedId ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          신청 ID를 확인할 수 없어 저장할 수 없습니다.
        </p>
      ) : null}

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function DriverQuotesSection({ applicationId }: { applicationId: string }) {
  const [quotes, setQuotes] = useState<DriverQuoteDetail[]>([]);
  const [guestQuotes, setGuestQuotes] = useState<GuestDriverQuoteDetail[]>([]);
  const [application, setApplication] = useState<ApplicationQuoteLifecycle | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestBusyId, setGuestBusyId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    if (!isPersistableApplicationId(applicationId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/driver-quotes?application_id=${encodeURIComponent(applicationId)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as {
        error?: string;
        application?: ApplicationQuoteLifecycle | null;
        quotes?: DriverQuoteDetail[];
        guest_quotes?: GuestDriverQuoteDetail[];
      };
      if (!res.ok) {
        setError(json.error ?? "견적 목록을 불러오지 못했습니다.");
        setApplication(null);
        setQuotes([]);
        setGuestQuotes([]);
        return;
      }
      setApplication(json.application ?? null);
      setQuotes(Array.isArray(json.quotes) ? json.quotes : []);
      setGuestQuotes(Array.isArray(json.guest_quotes) ? json.guest_quotes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQuotes([]);
      setGuestQuotes([]);
      setApplication(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  const updateGuestResult = async (
    quote: GuestDriverQuoteDetail,
    matchResult: string,
  ) => {
    setGuestBusyId(quote.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_quote_id: quote.id,
          match_result: matchResult,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "비회원 견적 상태 저장에 실패했습니다.");
        return;
      }
      void loadQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuestBusyId(null);
    }
  };

  const runApplicationAction = async (
    action: "final_confirm" | "reopen" | "manual_close",
  ) => {
    setActionBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "자동마감 상태 변경에 실패했습니다.");
        return;
      }
      void loadQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  return (
    <section className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm ring-1 ring-indigo-100/80">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
            기사 견적
          </p>
          <p className="mt-1 text-xs font-medium text-indigo-950/70">
            제출된 회원/비회원 기사 견적을 관리자만 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadQuotes()}
          disabled={loading}
          className="h-9 shrink-0 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-black text-indigo-950 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {loading ? "조회 중…" : "새로고침"}
        </button>
      </div>

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-relaxed text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {application ? (
        <div className="mt-3 rounded-xl border border-white bg-white p-3 shadow-sm ring-1 ring-indigo-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-indigo-950">자동 경매 상태</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {application.quote_status}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                현재 회차 {application.extension_round}회 · 자동연장{" "}
                {application.extension_round}회 · 계약상태{" "}
                {application.contract_status || "—"}
              </p>
            </div>
            <div className="text-right text-xs font-semibold text-slate-600">
              <p>마감: {formatCreatedAt(application.quote_closed_at || null)}</p>
              <p>최종확정: {formatCreatedAt(application.final_selected_at || null)}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <dt className="font-bold text-indigo-500">자동확정 기사</dt>
              <dd className="mt-1 break-all font-semibold text-indigo-950">
                {application.auto_selected_quote_id || "—"}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="font-bold text-slate-400">마감조건</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {application.quote_limit_count != null
                  ? `${application.quote_limit_count}건`
                  : "수량 미설정"}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="font-bold text-slate-400">목표가</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {application.target_normal_price != null
                  ? `${application.target_normal_price.toLocaleString("ko-KR")}원`
                  : "—"}
              </dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <dt className="font-bold text-amber-600">고객 감사지원금</dt>
              <dd className="mt-1 font-semibold text-amber-900">
                {application.client_reward_amount.toLocaleString("ko-KR")}원 (
                {application.support_client_reward_ratio}%)
              </dd>
            </div>
            <div className="rounded-lg bg-blue-50 p-2">
              <dt className="font-bold text-blue-600">기사 지원금</dt>
              <dd className="mt-1 font-semibold text-blue-900">
                {application.driver_support_amount.toLocaleString("ko-KR")}원 (
                {application.support_driver_ratio}%)
              </dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2">
              <dt className="font-bold text-emerald-600">연락처 공개</dt>
              <dd className="mt-1 font-semibold text-emerald-900">
                {application.contact_revealed_at ? "공개됨" : "대기"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={actionBusy != null || application.auto_selected_quote_id === ""}
              onClick={() => void runApplicationAction("final_confirm")}
              className="min-h-9 rounded-lg bg-slate-950 px-2 text-xs font-black text-white disabled:opacity-50"
            >
              {actionBusy === "final_confirm" ? "처리 중…" : "즉시 최종확정"}
            </button>
            <button
              type="button"
              disabled={actionBusy != null}
              onClick={() => void runApplicationAction("reopen")}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 disabled:opacity-50"
            >
              재오픈
            </button>
            <button
              type="button"
              disabled={actionBusy != null}
              onClick={() => void runApplicationAction("manual_close")}
              className="min-h-9 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-black text-red-800 disabled:opacity-50"
            >
              수동 마감
            </button>
          </div>
          {application.final_selected_at ? (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">
              예약금 및 전자계약 절차가 진행됩니다.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {loading && quotes.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
            견적을 불러오는 중…
          </p>
        ) : quotes.length === 0 && guestQuotes.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
            아직 제출된 견적이 없습니다.
          </p>
        ) : (
          <>
            <p className="text-xs font-black text-indigo-950">회원 기사 견적</p>
            {quotes.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
                회원 기사 견적이 없습니다.
              </p>
            ) : (
              quotes.map((quote) => (
                <article
                  key={quote.id}
                  className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm"
                >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {quote.company_name}
                    {quote.sponsor_quote_enabled ? (
                      <span className="ml-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-blue-100">
                        ⭐ 지원금 가능 기사
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {quote.manager_name} · {quote.phone}
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-black text-indigo-900">
                  {quote.price == null
                    ? "금액 미입력"
                    : `${quote.price.toLocaleString("ko-KR")}원`}
                  {quote.sponsor_quote_enabled &&
                  (quote.member_price ?? quote.sponsor_discounted_price) != null ? (
                    <span className="mt-1 block text-xs font-bold text-blue-700">
                      지원금 적용{" "}
                      {(quote.member_price ?? quote.sponsor_discounted_price ?? 0).toLocaleString("ko-KR")}원
                    </span>
                  ) : null}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-slate-400">차량유형</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.vehicle_type}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">가능 출발시간</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.available_time}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">제출시간</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {formatCreatedAt(quote.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">상태</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.status}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">예상 지원금</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.sponsor_quote_enabled
                      ? `${(quote.estimated_support_amount ?? quote.sponsor_support_amount ?? 0).toLocaleString("ko-KR")}원`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">고객 반영 지원금</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.sponsor_quote_enabled
                      ? `${(quote.support_discount_amount ?? quote.sponsor_support_amount ?? 0).toLocaleString("ko-KR")}원`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">지원금 적용 고객가</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {(quote.member_price ?? quote.sponsor_discounted_price) != null
                      ? `${(quote.member_price ?? quote.sponsor_discounted_price ?? 0).toLocaleString("ko-KR")}원`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">비회원 견적 전환</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">
                    {quote.converted_from_guest_quote_id?.trim()
                      ? `전환됨${
                          quote.converted_from_guest_price != null
                            ? ` · 기존 ${quote.converted_from_guest_price.toLocaleString("ko-KR")}원`
                            : ""
                        }`
                      : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-400">메모</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                  {quote.message.trim() === "" ? "—" : quote.message}
                </p>
              </div>
                </article>
              ))
            )}

            <p className="pt-2 text-xs font-black text-indigo-950">비회원 견적</p>
            {guestQuotes.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
                비회원 견적이 없습니다.
              </p>
            ) : (
              guestQuotes.map((quote) => (
                <article
                  key={quote.id}
                  className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {quote.guest_company_name}
                        <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                          일반 견적
                        </span>
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {quote.guest_driver_name} · {quote.guest_phone}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-black text-amber-900">
                      {quote.price == null
                        ? "금액 미입력"
                        : `${quote.price.toLocaleString("ko-KR")}원`}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-bold text-slate-400">차량유형</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.vehicle_type}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">가능시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.available_time}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">제출시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {formatCreatedAt(quote.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">매칭결과</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.match_result}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">추천토큰</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px] font-semibold text-slate-800">
                        {quote.referral_token || "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-400">메모</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                      {quote.message.trim() === "" ? "—" : quote.message}
                    </p>
                  </div>
                  {quote.result_sms_error.trim() !== "" ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      결과 문자 오류: {quote.result_sms_error}
                    </p>
                  ) : quote.result_notified_at.trim() !== "" ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      결과 문자 발송: {formatCreatedAt(quote.result_notified_at)}
                    </p>
                  ) : null}
                  {quote.member_converted ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                      <p className="font-black">
                        {quote.converted_to_member_quote_id?.trim()
                          ? "회원 견적으로 전환됨"
                          : "회원 전환됨"}
                      </p>
                      <p className="mt-1">
                        연결 기사:{" "}
                        {quote.linked_partner_company?.trim() ||
                          "—"}{" "}
                        /{" "}
                        {quote.linked_partner_phone?.trim() || "—"}
                      </p>
                      {quote.converted_at?.trim() ? (
                        <p className="mt-1">
                          전환시각: {formatCreatedAt(quote.converted_at)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {["pending", "selected", "not_selected"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={guestBusyId === quote.id}
                        onClick={() => void updateGuestResult(quote, status)}
                        className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-800 disabled:opacity-50"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}

function QuoteAutomationSettingsCard() {
  const [settings, setSettings] = useState<QuoteAutomationSettingsForm>({
    business_start_time: "09:00",
    business_end_time: "18:00",
    auto_final_confirm_delay_minutes: 30,
    timezone: "Asia/Seoul",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/quote-settings", {
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        error?: string;
        settings?: QuoteAutomationSettingsForm;
      };
      if (!res.ok) {
        setMessage(json.error ?? "자동매칭 운영설정을 불러오지 못했습니다.");
        return;
      }
      if (json.settings) {
        setSettings({
          business_start_time: json.settings.business_start_time || "09:00",
          business_end_time: json.settings.business_end_time || "18:00",
          auto_final_confirm_delay_minutes:
            json.settings.auto_final_confirm_delay_minutes || 30,
          timezone: json.settings.timezone || "Asia/Seoul",
        });
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/quote-settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as {
        error?: string;
        settings?: QuoteAutomationSettingsForm;
      };
      if (!res.ok) {
        setMessage(json.error ?? "자동매칭 운영설정 저장에 실패했습니다.");
        return;
      }
      if (json.settings) {
        setSettings({
          business_start_time: json.settings.business_start_time || "09:00",
          business_end_time: json.settings.business_end_time || "18:00",
          auto_final_confirm_delay_minutes:
            json.settings.auto_final_confirm_delay_minutes || 30,
          timezone: json.settings.timezone || "Asia/Seoul",
        });
      }
      setMessage("자동매칭 운영설정을 저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm ring-1 ring-blue-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">
            자동매칭 운영설정
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">
            현재 설정: 업무시간 {settings.business_start_time} ~{" "}
            {settings.business_end_time} · 자동확정 대기시간{" "}
            {settings.auto_final_confirm_delay_minutes}분
          </h2>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            자동 최저가 매칭 후 설정된 시간이 지나면 최종확정됩니다. 단,
            업무시간 외에는 다음 업무 시작시간에 고객정보가 공개됩니다. 고객은
            24시간 직접 최종확정할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={loading || saving}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "조회 중…" : "설정 새로고침"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">업무 시작시간</span>
          <input
            type="time"
            value={settings.business_start_time}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                business_start_time: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">업무 종료시간</span>
          <input
            type="time"
            value={settings.business_end_time}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                business_end_time: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">
            자동확정 대기시간(분)
          </span>
          <input
            type="number"
            min={1}
            max={1440}
            value={settings.auto_final_confirm_delay_minutes}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                auto_final_confirm_delay_minutes:
                  Number.parseInt(event.target.value, 10) || 30,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">시간대</span>
          <input
            type="text"
            value={settings.timezone}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                timezone: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
            {message}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || loading}
          className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </div>
    </section>
  );
}

function DetailSlidePanel({
  row,
  open,
  onClose,
  onStatusSaved,
  onOpenSms,
}: {
  row: ApplicationDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusSaved: (
    applicationId: string,
    nextStatus: ApplicationStatusValue,
    nextMemo: string,
  ) => void;
  onOpenSms: (row: ApplicationDetail) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || row == null) return null;

  const fileUrl = row.file_url.trim();
  const fileName = row.file_name.trim();
  const fileHttpUrl =
    fileUrl.startsWith("http://") || fileUrl.startsWith("https://");
  const fileExt = getFileExtFromNameOrUrl(fileName, fileUrl);
  const isImage = fileHttpUrl && isImageExt(fileExt);
  const isPdf = fileHttpUrl && isPdfExt(fileExt);

  // 이전 데이터 호환 (attachment_url)
  const legacyUrl = row.attachment_url.trim();
  const legacyHttpUrl =
    legacyUrl.startsWith("http://") || legacyUrl.startsWith("https://");

  return (
    <>
      <button
        type="button"
        aria-label="패널 닫기"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl ring-1 ring-slate-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2
              id="admin-detail-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              신청 상세
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatCreatedAt(row.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSms(row)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 max-[480px]:hidden"
            >
              문자 발송
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="닫기"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
          <button
            type="button"
            onClick={() => onOpenSms(row)}
            className="mb-3 hidden h-10 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 max-[480px]:inline-flex"
          >
            문자 발송
          </button>
          <dl>
            <DetailField label="접수번호">
              <span className="font-mono font-semibold tracking-tight">
                {row.receipt_number}
              </span>
            </DetailField>
            <DetailField label="신청 유형">
              {displayApplicationTypeLabel(row.application_type)}
            </DetailField>
            <DetailField label="왕복 / 편도">{row.trip_type}</DetailField>
            <DetailField label="버스 등급">{row.bus_grade}</DetailField>
            <DetailField label="출발지">{row.departure}</DetailField>
            <DetailField label="출발지역">
              {row.departure_region.trim() === "" ? "—" : row.departure_region}
            </DetailField>
            <DetailField label="도착지">{row.destination}</DetailField>
            <div className="border-b border-slate-100 py-3 last:border-b-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                경유지
              </dt>
              <dd className="mt-1">
                {row.stopovers.length === 0 ? (
                  <span className="text-sm font-medium text-slate-400">—</span>
                ) : (
                  <ol className="list-inside list-decimal space-y-1 text-sm font-medium text-slate-900">
                    {row.stopovers.map((s, i) => (
                      <li key={`${row.id}-stop-${i}`}>{s}</li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
            <DetailField label="출발일시">
              {formatDepartureDateTimeLine(
                row.departure_date,
                row.departure_time,
              )}
            </DetailField>
            <DetailField label="오는 날짜">
              {formatDateOnly(row.return_date)}
            </DetailField>
            <DetailField label="인원수">
              {row.passenger_count ?? "—"}
            </DetailField>
            <DetailField label="신청자명">{row.applicant_name}</DetailField>
            <DetailField label="연락처">{row.phone}</DetailField>
            <DetailField label="단체명">{row.organization_name}</DetailField>
            <DetailField label="단체 유형">{row.organization_type}</DetailField>
            <div className="border-b border-slate-100 py-3 last:border-b-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                요청사항
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-900">
                {row.request_message === "—" ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  row.request_message
                )}
              </dd>
            </div>
            <div className="border-b border-slate-100 py-3 last:border-b-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                첨부파일
              </dt>
              <dd className="mt-1 break-all text-sm font-medium">
                {fileUrl !== "" ? (
                  <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {fileName !== "" ? fileName : "첨부파일"}
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          업로드됨
                        </p>
                      </div>
                      {isPdf ? (
                        <span className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                          PDF
                        </span>
                      ) : null}
                    </div>

                    {isImage ? (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-slate-300"
                        title="클릭하여 원본 보기"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fileUrl}
                          alt={fileName !== "" ? fileName : "첨부 이미지"}
                          className="h-40 w-full object-cover sm:h-48"
                          loading="lazy"
                        />
                      </a>
                    ) : isPdf ? (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100"
                            aria-hidden
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M14 3v6h6"
                              />
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            PDF 문서
                          </p>
                        </div>
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                        >
                          PDF 열기
                        </a>
                      </div>
                    ) : fileHttpUrl ? (
                      <div className="mt-3">
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 w-fit items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                        >
                          첨부파일 보기
                        </a>
                        <p className="mt-2 break-all text-xs font-medium text-slate-500">
                          {fileUrl}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 break-all text-xs font-medium text-slate-500">
                        {fileUrl}
                      </div>
                    )}
                  </div>
                ) : legacyUrl !== "" ? (
                  legacyHttpUrl ? (
                    <a
                      href={legacyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-800"
                    >
                      {legacyUrl}
                    </a>
                  ) : (
                    legacyUrl
                  )
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    첨부파일 없음
                  </div>
                )}
              </dd>
            </div>
            <div className="border-b border-slate-100 py-3 last:border-b-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                현재 상태
              </dt>
              <dd className="mt-1">
                <StatusBadge status={row.status} />
              </dd>
            </div>
            <div className="border-b border-slate-100 py-3 last:border-b-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                관리자 메모 (내부용)
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-900">
                {row.admin_memo.trim() === "" ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  row.admin_memo
                )}
              </dd>
            </div>
          </dl>

          <DriverQuotesSection applicationId={row.id} />

          <div className="mt-4">
            <button
              type="button"
              onClick={() => onOpenSms(row)}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              문자 발송
            </button>
          </div>

          <StatusChangeSection
            key={row.id}
            rowId={row.id}
            statusFromServer={row.status}
            memoFromServer={row.admin_memo}
            onSaved={(nextStatus, nextMemo) =>
              onStatusSaved(row.id, nextStatus, nextMemo)
            }
          />
        </div>
      </aside>
    </>
  );
}

export default function AdminApplicationsPage() {
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionProfile, setSessionProfile] = useState<Profile | null>(null);

  const adminRoleAccess = useMemo(
    () => resolveAdminRoleAccess(sessionProfile),
    [sessionProfile],
  );

  const [rows, setRows] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const [realtimeToast, setRealtimeToast] =
    useState<RealtimeToastPayload | null>(null);
  /** SSR과 첫 클라이언트 페인트를 일치시키기 위해 초기값은 false, 마운트 후 localStorage 동기화 */
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const realtimeToastTimerRef = useRef<number | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseClient> | null>(
    null,
  );
  const realtimeSubscribedRef = useRef(false);
  const seenRealtimeIdsRef = useRef<{
    bus: Set<string>;
    /** admin_notifications 행 단위 중복 방지 */
    partnerNotif: Set<string>;
  }>({
    bus: new Set(),
    partnerNotif: new Set(),
  });

  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);

  const [unseenRealtimeCount, setUnseenRealtimeCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<
    RecentNotificationItem[]
  >([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const notificationWrapRef = useRef<HTMLDivElement | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsRow, setSmsRow] = useState<ApplicationDetail | null>(null);
  const [smsText, setSmsText] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsSendError, setSmsSendError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [adminSectionTab, setAdminSectionTab] = useState<"bus" | "partner">(
    "bus",
  );

  useEffect(() => {
    if (adminSectionTab !== "partner") return;
    setDetailOpen(false);
    setSelected(null);
    setSmsOpen(false);
    setSmsRow(null);
  }, [adminSectionTab]);

  useEffect(() => {
    if (toast == null) return;
    const timerId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (realtimeToastTimerRef.current != null) {
        window.clearTimeout(realtimeToastTimerRef.current);
      }
    };
  }, []);

  const handleEnableNotificationSound = useCallback(async () => {
    try {
      const AC =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (
              window as Window & {
                webkitAudioContext?: typeof AudioContext;
              }
            ).webkitAudioContext
          : undefined;
      if (!AC) {
        console.warn("[notification sound] AudioContext를 사용할 수 없습니다.");
        return;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new AC();
      }
      const ctx = audioContextRef.current;
      await ctx.resume();
      playNotificationBeep(ctx);
      setSoundEnabled(true);
      window.localStorage.setItem(NOTIFICATION_SOUND_PREF_KEY, "1");
    } catch (e) {
      console.warn("[notification sound] 알림음 활성화 실패", e);
    }
  }, []);

  useEffect(() => {
    if (!notificationPanelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = notificationWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setNotificationPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notificationPanelOpen]);

  const openSms = useCallback((row: ApplicationDetail) => {
    setSmsRow(row);
    setSmsText(buildDefaultSmsText(row));
    setSmsSendError(null);
    setSmsOpen(true);
  }, []);

  const closeSms = useCallback(() => {
    setSmsOpen(false);
    setSmsRow(null);
    setSmsSendError(null);
    setSmsSending(false);
  }, []);

  const handleSendSms = useCallback(async () => {
    if (!smsRow) return;
    setSmsSending(true);
    setSmsSendError(null);
    try {
      const res = await fetch("/api/admin/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          to: smsRow.phone,
          text: smsText,
        }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setSmsSendError(data.error ?? "발송에 실패했습니다.");
        return;
      }
      setToast({ message: "문자가 발송되었습니다." });
      closeSms();
    } catch (e) {
      setSmsSendError(
        e instanceof Error ? e.message : "발송 요청 중 오류가 발생했습니다.",
      );
    } finally {
      setSmsSending(false);
    }
  }, [smsRow, smsText, closeSms]);

  const handleCopySms = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(smsText);
      setToast({ message: "복사 완료" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast({ message: `복사 실패: ${message}` });
    }
  }, [smsText]);

  useEffect(() => {
    // 로그인된 관리자 이메일 + profiles 역할(STEP 1: 조회만, 미확인 시에도 접근 유지)
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        setAdminEmail(user?.email ?? null);
        if (user?.id) {
          const p = await fetchProfileForAuthUser(supabase, user.id);
          setSessionProfile(p);
        } else {
          setSessionProfile(null);
        }
      } catch {
        setAdminEmail(null);
        setSessionProfile(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = "/admin/login";
    }
  }, []);

  const handleStatusSaved = useCallback(
    (
      applicationId: string,
      nextStatus: ApplicationStatusValue,
      nextMemo: string,
    ) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === applicationId
            ? { ...r, status: nextStatus, admin_memo: nextMemo }
            : r,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === applicationId
          ? { ...prev, status: nextStatus, admin_memo: nextMemo }
          : prev,
      );
      setToast({ message: "저장되었습니다." });
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(queryError.message);
        setRows([]);
        return;
      }

      setRows(normalizeRows(data));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 초기 목록 로드 */
    void load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  useEffect(() => {
    // /admin 이 mount 된 상태에서만 realtime 연결
    if (realtimeSubscribedRef.current) return;
    realtimeSubscribedRef.current = true;

    if (!supabaseRef.current) {
      supabaseRef.current = createSupabaseClient();
    }
    const supabase = supabaseRef.current;

    const handleBeep = () => {
      if (!soundEnabledRef.current) return;
      try {
        const ctx = audioContextRef.current;
        if (!ctx) {
          console.warn(
            "[notification sound] AudioContext가 없습니다. 상단에서 「알림음 켜기」를 눌러 주세요.",
          );
          return;
        }
        void ctx.resume().then(() => {
          try {
            playNotificationBeep(ctx);
          } catch (e) {
            console.warn("[notification sound] 비프 재생 실패", e);
          }
        });
      } catch (e) {
        console.warn("[notification sound] 재생 처리 실패", e);
      }
    };

    const channel = supabase
      .channel("realtime-admin-inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
        },
        (payload) => {
          console.log("[realtime] applications INSERT payload:", payload);
          const raw = payload.new as Record<string, unknown>;
          const normalized = normalizeRows([raw]);
          const row = normalized[0];
          if (!row?.id || row.id.startsWith("idx-")) return;
          if (seenRealtimeIdsRef.current.bus.has(row.id)) return;
          seenRealtimeIdsRef.current.bus.add(row.id);

          setRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [row, ...prev];
          });

          setUnseenRealtimeCount((c) => c + 1);
          setRecentNotifications((prev) => {
            const item: RecentNotificationItem = {
              kind: "bus",
              id: row.id,
              applicant_name: row.applicant_name,
              application_type: row.application_type,
              passenger_count: row.passenger_count ?? null,
              created_at: row.created_at,
            };
            return [
              item,
              ...prev.filter((x) => !(x.kind === item.kind && x.id === item.id)),
            ].slice(0, 25);
          });

          const typeLabel = displayApplicationTypeLabel(row.application_type);
          const passengerLine =
            row.passenger_count != null && Number.isFinite(row.passenger_count)
              ? `${row.passenger_count}명`
              : "—";
          const applicant =
            row.applicant_name === "—" || row.applicant_name.trim() === ""
              ? "(이름 없음)"
              : row.applicant_name;

          setRealtimeToast({
            kind: "bus",
            applicantName: applicant,
            applicationTypeLabel: typeLabel,
            passengerLine,
          });
          if (realtimeToastTimerRef.current != null) {
            window.clearTimeout(realtimeToastTimerRef.current);
          }
          realtimeToastTimerRef.current = window.setTimeout(() => {
            setRealtimeToast(null);
            realtimeToastTimerRef.current = null;
          }, 5000);

          handleBeep();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          console.log("admin_notifications payload", payload);
          const raw = payload.new as Record<string, unknown>;
          const notifType = String(raw.type ?? "").trim();
          if (notifType !== "partner_driver") return;

          const sourceId = String(raw.source_id ?? "").trim();
          if (!sourceId) return;

          const notifRowId =
            raw.id != null && String(raw.id).trim() !== ""
              ? String(raw.id).trim()
              : "";
          const dedupeKey =
            notifRowId ||
            `${sourceId}:${raw.created_at != null ? String(raw.created_at) : ""}`;
          if (seenRealtimeIdsRef.current.partnerNotif.has(dedupeKey)) return;
          seenRealtimeIdsRef.current.partnerNotif.add(dedupeKey);

          const msg = String(raw.message ?? "").trim();

          window.dispatchEvent(new CustomEvent("partner-admin-refresh"));

          void (async () => {
            const { data: pdRow, error: fetchErr } = await supabase
              .from("partner_drivers")
              .select("*")
              .eq("id", sourceId)
              .maybeSingle();
            if (fetchErr) {
              console.warn(
                "[admin_notifications] partner_drivers 조회 실패:",
                fetchErr.message,
              );
              return;
            }
            if (pdRow) {
              const row = normalizePartnerDrivers([pdRow])[0];
              window.dispatchEvent(
                new CustomEvent("partner-admin-insert", {
                  detail: { row },
                }),
              );
            }
          })();

          setUnseenRealtimeCount((c) => c + 1);
          setRecentNotifications((prev) => {
            const item: RecentNotificationItem = {
              kind: "partner",
              id: sourceId,
              notification_id: notifRowId || undefined,
              message: msg,
              created_at:
                raw.created_at != null ? String(raw.created_at) : null,
            };
            return [
              item,
              ...prev.filter((x) => {
                if (x.kind !== "partner") return true;
                if (notifRowId) return x.notification_id !== notifRowId;
                return x.id !== sourceId;
              }),
            ].slice(0, 25);
          });

          setRealtimeToast({
            kind: "partner",
            title: "새 제휴기사 신청이 접수되었습니다.",
            message: msg || "내용이 없습니다.",
          });
          if (realtimeToastTimerRef.current != null) {
            window.clearTimeout(realtimeToastTimerRef.current);
          }
          realtimeToastTimerRef.current = window.setTimeout(() => {
            setRealtimeToast(null);
            realtimeToastTimerRef.current = null;
          }, 5000);

          handleBeep();
        },
      )
      .subscribe((status) => {
        console.log("[realtime] realtime-admin-inserts status:", status);
      });

    return () => {
      void supabase.removeChannel(channel);
      realtimeSubscribedRef.current = false;
    };
  }, []);

  const openDetail = (row: ApplicationDetail) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const focusApplicationRow = useCallback((applicationId: string) => {
    requestAnimationFrame(() => {
      document
        .getElementById(`admin-application-row-${applicationId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const focusPartnerRow = useCallback((partnerDriverId: string) => {
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("partner-admin-focus", {
          detail: { id: partnerDriverId },
        }),
      );
    });
  }, []);

  const handleSelectNotification = useCallback(
    (n: RecentNotificationItem) => {
      setNotificationPanelOpen(false);
      if (n.kind === "bus") {
        setAdminSectionTab("bus");
        const row = rows.find((r) => r.id === n.id);
        if (row) {
          setSelected(row);
          setDetailOpen(true);
          focusApplicationRow(n.id);
        }
        return;
      }

      // partner
      setAdminSectionTab("partner");
      focusPartnerRow(n.id);
    },
    [rows, focusApplicationRow, focusPartnerRow],
  );

  const closeDetail = () => {
    setDetailOpen(false);
    setSelected(null);
  };

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasTerm = term.length > 0;

    return rows.filter((row) => {
      if (statusFilter !== "all") {
        const known = parseKnownApplicationStatus(row.status);
        if (known !== statusFilter) return false;
      }

      if (!hasTerm) return true;

      const haystack = [
        row.receipt_number,
        row.applicant_name,
        row.phone,
        row.organization_name,
        row.departure,
        row.departure_detail,
        row.destination,
        row.destination_detail,
        row.application_type,
        displayApplicationTypeLabel(row.application_type),
        row.status,
        statusLabelForSearch(row.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, searchTerm, statusFilter]);

  const filteredAndSortedRows = (() => {
    const copy = [...filteredRows];

    const directionFactor = sortDirection === "asc" ? 1 : -1;

    const getTimestamp = (v: string | null) => {
      if (v == null || v === "") return Number.NEGATIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    };

    const cmpText = (a: string, b: string) =>
      a.localeCompare(b, "ko-KR", { sensitivity: "base" });

    copy.sort((a, b) => {
      if (sortKey === "created_at") {
        return (getTimestamp(a.created_at) - getTimestamp(b.created_at)) * directionFactor;
      }

      if (sortKey === "passenger_count") {
        const av = a.passenger_count ?? Number.NEGATIVE_INFINITY;
        const bv = b.passenger_count ?? Number.NEGATIVE_INFINITY;
        return (av - bv) * directionFactor;
      }

      if (sortKey === "status") {
        const al = statusLabelForSearch(a.status);
        const bl = statusLabelForSearch(b.status);
        return cmpText(al, bl) * directionFactor;
      }

      const av = safeText(
        (a as unknown as Record<string, unknown>)[sortKey],
        "",
      );
      const bv = safeText(
        (b as unknown as Record<string, unknown>)[sortKey],
        "",
      );
      return cmpText(av, bv) * directionFactor;
    });

    return copy;
  })();

  const dashboardStats: DashboardStats = useMemo(
    () => computeDashboardStats(rows),
    [rows],
  );

  const handleSortClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return null;
    return (
      <span className="ml-1 text-[10px] font-black text-slate-500" aria-hidden>
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const handleExcelDownload = useCallback(() => {
    try {
      const exportRows = filteredAndSortedRows.map((r) => ({
        신청일: formatCreatedAt(r.created_at),
        접수번호: r.receipt_number,
        신청유형: displayApplicationTypeLabel(r.application_type),
        상태: statusLabelForExport(r.status),
        신청자명: r.applicant_name,
        연락처: r.phone,
        단체명: r.organization_name,
        단체유형: r.organization_type,
        출발지: r.departure,
        출발지역: r.departure_region,
        도착지: r.destination,
        출발일: formatIsoDate(r.departure_date),
        출발시간:
          r.departure_time === "—"
            ? ""
            : formatDepartureTimeLabel(r.departure_time),
        오는날짜: formatIsoDate(r.return_date),
        인원수: r.passenger_count ?? "",
        "왕복/편도": r.trip_type,
        "일반/프리미엄": r.bus_grade,
        요청사항: r.request_message === "—" ? "" : r.request_message,
        관리자메모: r.admin_memo,
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: false });

      // 컬럼 너비 자동 조절 (간단 추정)
      const headers = Object.keys(exportRows[0] ?? {});
      const colWidths = headers.map((h) => {
        let max = h.length;
        for (const row of exportRows) {
          const v = (row as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v);
          if (s.length > max) max = s.length;
        }
        // 너무 넓어지는 것 방지
        return { wch: Math.min(Math.max(max + 2, 10), 60) };
      });
      (ws as XLSX.WorkSheet)["!cols"] = colWidths;

      // 헤더 bold (xlsx에서 지원되는 경우 적용)
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        const cell = (ws as XLSX.WorkSheet)[addr] as XLSX.CellObject | undefined;
        if (cell) {
          (cell as XLSX.CellObject & { s?: unknown }).s = {
            font: { bold: true },
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "신청목록");

      const filename = `무료관광버스_신청목록_${ymdTodayLocal()}.xlsx`;
      XLSX.writeFile(wb, filename, { bookType: "xlsx" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setToast({ message: `엑셀 다운로드 실패: ${message}` });
    }
  }, [filteredAndSortedRows]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                신청 관리
              </h1>
              {unseenRealtimeCount > 0 ? (
                <span className="rounded-full bg-[#1e3a5f] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm ring-1 ring-slate-900/15">
                  새 신청
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {adminSectionTab === "bus"
                ? "무료관광버스 신청 목록 · 행을 눌러 상세 보기"
                : "제휴기사 등록 신청 목록 · 행을 눌러 상세 보기"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {authLoading
                ? "관리자 확인 중…"
                : adminEmail
                  ? `관리자: ${adminEmail}`
                  : "관리자: -"}
            </p>
            <span className="sr-only">
              {adminRoleAccess.isVerifiedAdmin
                ? "프로필 기준 관리자 역할이 확인되었습니다."
                : "프로필이 없거나 관리자 역할이 확인되지 않아 기존 방식으로 접근합니다."}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleEnableNotificationSound()}
              className={`rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition sm:text-sm ${
                soundEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-100"
                  : "border-slate-200 bg-white text-[#1e3a5f] hover:bg-slate-50"
              }`}
            >
              {soundEnabled ? "알림음 켜짐" : "알림음 켜기"}
            </button>
            <div className="relative" ref={notificationWrapRef}>
              <button
                type="button"
                aria-label="실시간 알림"
                onClick={() => {
                  setNotificationPanelOpen((prev) => {
                    const next = !prev;
                    if (next) setUnseenRealtimeCount(0);
                    return next;
                  });
                }}
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-[#1e3a5f] shadow-sm transition hover:bg-slate-50"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                  />
                </svg>
                {unseenRealtimeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                    {unseenRealtimeCount > 99 ? "99+" : unseenRealtimeCount}
                  </span>
                ) : null}
              </button>
              {notificationPanelOpen ? (
                <div className="absolute right-0 top-full z-[80] mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-100">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-black text-slate-900">
                      최근 신청
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                      실시간 접수 알림
                    </p>
                  </div>
                  <ul className="max-h-[min(60vh,24rem)] overflow-y-auto py-1">
                    {recentNotifications.length === 0 ? (
                      <li className="px-4 py-8 text-center text-sm text-slate-500">
                        아직 알림이 없습니다.
                      </li>
                    ) : (
                      recentNotifications.map((n) => (
                        <li
                          key={
                            n.kind === "bus"
                              ? `bus-${n.id}`
                              : `partner-${n.notification_id ?? n.id}`
                          }
                        >
                          <button
                            type="button"
                            className="flex w-full flex-col gap-1 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 active:bg-slate-100"
                            onClick={() => handleSelectNotification(n)}
                          >
                            {n.kind === "bus" ? (
                              <>
                                <span className="text-sm font-bold text-slate-900">
                                  {`[버스 신청] ${n.applicant_name} / ${
                                    n.passenger_count != null &&
                                    Number.isFinite(n.passenger_count)
                                      ? `${n.passenger_count}명`
                                      : "—"
                                  }`}
                                </span>
                                <span className="line-clamp-2 text-xs font-medium leading-snug text-slate-600">
                                  {displayApplicationTypeLabel(
                                    n.application_type,
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="line-clamp-3 whitespace-pre-wrap text-sm font-bold leading-snug text-slate-900">
                                [제휴기사]{" "}
                                {n.message.trim() !== ""
                                  ? n.message
                                  : "새 제휴기사 신청"}
                              </span>
                            )}
                            <span className="text-[11px] font-semibold text-slate-400">
                              {formatCreatedAt(n.created_at)}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleExcelDownload}
              disabled={
                adminSectionTab !== "bus" ||
                loading ||
                filteredAndSortedRows.length === 0
              }
              title={
                adminSectionTab !== "bus"
                  ? "버스 신청 관리 탭에서 이용할 수 있습니다."
                  : undefined
              }
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <span className="hidden items-center gap-2 sm:inline-flex">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 3v10m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  />
                </svg>
                엑셀 다운로드
              </span>
              <span className="sm:hidden">엑셀 다운로드</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (adminSectionTab === "partner") {
                  window.dispatchEvent(new CustomEvent("partner-admin-refresh"));
                } else {
                  void load();
                }
              }}
              disabled={adminSectionTab === "bus" && loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div
          className="mb-6 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:flex-row sm:flex-wrap"
          role="tablist"
          aria-label="관리 메뉴"
        >
          <button
            type="button"
            role="tab"
            aria-selected={adminSectionTab === "bus"}
            onClick={() => setAdminSectionTab("bus")}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${
              adminSectionTab === "bus"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-50"
            }`}
          >
            버스 신청 관리
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminSectionTab === "partner"}
            onClick={() => setAdminSectionTab("partner")}
            className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition sm:flex-none ${
              adminSectionTab === "partner"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-50"
            }`}
          >
            제휴기사 신청 관리
          </button>
        </div>

        {adminSectionTab === "partner" ? (
          <PartnerDriversAdmin setToast={setToast} />
        ) : (
          <>
        <QuoteAutomationSettingsCard />
        <section
          className="mb-5"
          aria-labelledby="admin-dashboard-heading"
        >
          <h2
            id="admin-dashboard-heading"
            className="mb-3 text-sm font-black tracking-tight text-slate-900"
          >
            운영 통계
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                전체 신청
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                {dashboardStats.total}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                오늘 신청
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                {dashboardStats.todayCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                이번 달 신청
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
                {dashboardStats.monthCount}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm ring-1 ring-blue-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800">
                접수완료
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-blue-950">
                {dashboardStats.pending}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm ring-1 ring-amber-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                검토중
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">
                {dashboardStats.reviewing}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm ring-1 ring-emerald-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                승인완료
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">
                {dashboardStats.approved}
              </p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm ring-1 ring-red-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-900">
                반려
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-red-950">
                {dashboardStats.rejected}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            검색·필터와 무관하게 전체 신청 데이터 기준입니다.
          </p>
        </section>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="block flex-1">
              <span className="sr-only">검색</span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="접수번호, 신청자명, 연락처, 단체명, 출발지, 도착지 검색"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="block sm:w-[220px]">
              <span className="sr-only">상태 필터</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilterValue)
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">전체</option>
                <option value="pending">접수완료</option>
                <option value="reviewing">검토중</option>
                <option value="approved">승인완료</option>
                <option value="rejected">반려</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs font-medium text-slate-500">
            총 {rows.length}건 중 {filteredAndSortedRows.length}건 표시
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div
              className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
              aria-hidden
            />
            <p className="mt-4 text-sm font-medium text-slate-600">
              목록을 불러오는 중…
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-2xl border border-red-200 bg-gradient-to-b from-red-50 to-white p-6 shadow-sm"
            role="alert"
          >
            <p className="text-sm font-semibold text-red-900">
              데이터를 불러오지 못했습니다.
            </p>
            <p className="mt-3 rounded-lg border border-red-100 bg-white/80 px-3 py-2 text-xs leading-relaxed text-red-800">
              {error}
            </p>
            <p className="mt-3 text-xs text-red-700/90">
              Supabase 연결·RLS 정책·테이블 권한을 확인해 주세요.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              다시 시도
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-700">
              등록된 신청이 없습니다.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              신청이 접수되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-700">
              조건에 맞는 신청 내역이 없습니다.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              검색어 또는 상태 필터를 조정해 주세요.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-4 md:hidden">
              {filteredAndSortedRows.map((row) => (
                <li key={row.id} id={`admin-application-row-${row.id}`}>
                  <button
                    type="button"
                    onClick={() => openDetail(row)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80 active:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-medium text-slate-500">
                        {formatCreatedAt(row.created_at)}
                      </p>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-700">
                      접수번호{" "}
                      <span className="font-mono text-[0.8125rem] font-bold text-slate-900">
                        {row.receipt_number}
                      </span>
                    </p>
                    <p className="mt-3 text-base font-bold text-slate-900">
                      {row.applicant_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {displayApplicationTypeLabel(row.application_type)}
                    </p>
                    <p className="mt-2 max-w-full truncate text-xs font-semibold text-slate-600">
                      <span className="mr-1 text-slate-400" aria-hidden>
                        📝
                      </span>
                      {memoPreview(row.admin_memo, 28)}
                    </p>
                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">연락처</dt>
                        <dd className="text-right font-medium text-slate-800">
                          {row.phone}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">단체명</dt>
                        <dd className="text-right font-medium text-slate-800">
                          {row.organization_name}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">출발 → 도착</dt>
                        <dd className="max-w-[55%] text-right font-medium text-slate-800">
                          {`${row.departure} → ${row.destination}`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">출발지역</dt>
                        <dd className="text-right font-medium text-slate-800">
                          {row.departure_region || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-500">인원</dt>
                        <dd className="text-right font-medium text-slate-800">
                          {row.passenger_count ?? "—"}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs font-medium text-blue-600">
                      탭하여 상세 보기 →
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("created_at")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        신청일{sortIndicator("created_at")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("receipt_number")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        접수번호{sortIndicator("receipt_number")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("application_type")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        신청 유형{sortIndicator("application_type")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("applicant_name")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        신청자명{sortIndicator("applicant_name")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("phone")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        연락처{sortIndicator("phone")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("organization_name")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        단체명{sortIndicator("organization_name")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("departure")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        출발지{sortIndicator("departure")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("departure_region")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        출발지역{sortIndicator("departure_region")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("destination")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        도착지{sortIndicator("destination")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("passenger_count")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        인원수{sortIndicator("passenger_count")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("status")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        상태{sortIndicator("status")}
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-0 font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => handleSortClick("admin_memo")}
                        className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      >
                        메모{sortIndicator("admin_memo")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAndSortedRows.map((row) => (
                    <tr
                      key={row.id}
                      id={`admin-application-row-${row.id}`}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => openDetail(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(row);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatCreatedAt(row.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-semibold text-slate-800">
                        {row.receipt_number}
                      </td>
                      <td className="max-w-[200px] px-4 py-3 text-slate-800">
                        <span className="line-clamp-2">
                          {displayApplicationTypeLabel(row.application_type)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {row.applicant_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.phone}
                      </td>
                      <td className="max-w-[160px] px-4 py-3 text-slate-700">
                        <span className="line-clamp-2">
                          {row.organization_name}
                        </span>
                      </td>
                      <td className="max-w-[140px] px-4 py-3 text-slate-700">
                        <span className="line-clamp-2">{row.departure}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.departure_region || "—"}
                      </td>
                      <td className="max-w-[140px] px-4 py-3 text-slate-700">
                        <span className="line-clamp-2">{row.destination}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.passenger_count ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-slate-400" aria-hidden>
                            📝
                          </span>
                          <span className="min-w-0 max-w-[260px] truncate text-sm">
                            {memoPreview(row.admin_memo, 28)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              총 {rows.length}건 중 {filteredAndSortedRows.length}건 표시 · 행 클릭 시 상세
            </p>
          </>
        )}
          </>
        )}
      </main>

      <DetailSlidePanel
        row={selected}
        open={detailOpen}
        onClose={closeDetail}
        onStatusSaved={handleStatusSaved}
        onOpenSms={openSms}
      />

      {smsRow ? (
        <SmsModal
          row={smsRow}
          open={smsOpen}
          message={smsText}
          onChangeMessage={setSmsText}
          onSend={() => void handleSendSms()}
          sendLoading={smsSending}
          sendError={smsSendError}
          onCopy={() => void handleCopySms()}
          onClose={closeSms}
        />
      ) : null}

      {realtimeToast ? (
        <div
          className="fixed right-4 top-4 z-[300] w-[min(calc(100vw-2rem),22rem)] rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/20 ring-1 ring-slate-100"
          role="status"
          aria-live="assertive"
        >
          <div className="flex gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f]"
              aria-hidden
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-sm font-black leading-snug text-slate-900">
                {realtimeToast.kind === "partner"
                  ? realtimeToast.title
                  : "새 신청이 접수되었습니다."}
              </p>
              {realtimeToast.kind === "partner" ? (
                <p className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-slate-600">
                  {realtimeToast.message}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">신청자명</span>{" "}
                    {realtimeToast.applicantName}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">신청유형</span>{" "}
                    {realtimeToast.applicationTypeLabel}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                    <span className="text-slate-500">인원수</span>{" "}
                    {realtimeToast.passengerLine}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[60] flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100"
          role="status"
          aria-live="polite"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            aria-hidden
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span className="leading-snug">{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}
