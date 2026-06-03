import { filterVisibleApplicationRows } from "@/lib/application-visibility";
import type {
  ApplicationDetail,
  ApplicationStatusValue,
  DashboardStats,
} from "./admin-types";

export const LEGACY_APPLICATION_TYPE_LABELS: Record<string, string> = {
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

export const NOTIFICATION_SOUND_PREF_KEY = "admin-notification-sound-enabled";

export function parseKnownApplicationStatus(
  raw: string,
): ApplicationStatusValue | null {
  const n = raw.trim().toLowerCase();
  if (n === "approve" || n === "approved") return "approved";
  if (n === "reject" || n === "rejected" || n === "denied") return "rejected";
  if (n === "reviewing" || n === "review") return "reviewing";
  if (n === "pending") return "pending";
  return null;
}

export function statusLabelForSearch(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  if (trimmed === "" || trimmed === "—") return "";
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed;
}

export function statusLabelForExport(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  if (trimmed === "" || trimmed === "—") return "";
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed;
}

export function statusLabelForSms(rawStatus: string): string {
  const trimmed = rawStatus.trim();
  const known = parseKnownApplicationStatus(trimmed);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return trimmed === "" || trimmed === "—" ? "—" : trimmed;
}

export function formatIsoDate(value: string | null): string {
  if (value == null || value.trim() === "") return "";
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toISOString().slice(0, 10);
}

export function ymdTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 선택 UI 초기값용 — 미매핑이면 pending 으로 둡니다. */
export function coerceApplicationStatus(raw: string): ApplicationStatusValue {
  return parseKnownApplicationStatus(raw) ?? "pending";
}

export function isPersistableApplicationId(id: string): boolean {
  return id.length > 0 && !id.startsWith("idx-");
}

/** 로컬 날짜 기준 오늘 접수 여부 */
export function isCreatedAtSameLocalDay(
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
export function isCreatedAtSameLocalMonth(
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

export function computeDashboardStats(rows: ApplicationDetail[]): DashboardStats {
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

  return { total: rows.length, todayCount, monthCount, pending, reviewing, approved, rejected };
}

export function safeText(value: unknown, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

export function displayApplicationTypeLabel(raw: string): string {
  const t = raw.trim();
  if (t === "" || t === "—") return "—";
  return LEGACY_APPLICATION_TYPE_LABELS[t] ?? t;
}

/** 공유 AudioContext로 비프 재생 (호출부에서 try/catch 권장) */
export function playNotificationBeep(ctx: AudioContext) {
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

export function parseStopovers(raw: unknown): string[] {
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
        return parsed.filter((v) => typeof v === "string").map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      return t.split(/[,，;；\r\n]+/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function parseAttachmentUrl(r: Record<string, unknown>): string {
  const candidates = [r.attachment_url, r.attachment_file_url, r.file_url, r.attachment];
  for (const c of candidates) {
    const s = safeText(c, "");
    if (s !== "—" && (s.startsWith("http://") || s.startsWith("https://"))) {
      return s;
    }
  }
  return "";
}

export function memoPreview(memo: string, maxChars = 28): string {
  const trimmed = memo.trim();
  if (trimmed === "") return "-";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

export function getFileExtFromNameOrUrl(name: string, url: string): string {
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

export function isImageExt(ext: string) {
  return ["jpg", "jpeg", "png", "webp"].includes(ext);
}

export function isPdfExt(ext: string) {
  return ext === "pdf";
}

export function normalizeRows(data: unknown, includeHidden = false): ApplicationDetail[] {
  if (data == null) return [];
  if (!Array.isArray(data)) return [];

  const allRows = data as Record<string, unknown>[];
  const visible = includeHidden ? allRows : filterVisibleApplicationRows(allRows);

  return visible.map((raw, index) => {
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
      final_selected_quote_id: safeText(r.final_selected_quote_id, ""),
      quote_status: safeText(r.quote_status, ""),
      is_hidden: r.is_hidden === true,
    };
  });
}

export function formatCreatedAt(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function formatDateOnly(value: string | null): string {
  if (value == null || value === "") return "—";
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    }
  } catch {
    /* fallthrough */
  }
  return value;
}

export function formatDepartureTimeLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "—") return "—";
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(trimmed);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  }
  try {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
  } catch {
    /* fallthrough */
  }
  return trimmed;
}

export function formatDepartureDateTimeLine(
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

export function hasPersistedReceiptNumber(row: ApplicationDetail): boolean {
  const rn = row.receipt_number.trim();
  return rn !== "" && rn !== "-" && rn !== "—";
}

export function buildDefaultSmsText(row: ApplicationDetail): string {
  const status = coerceApplicationStatus(row.status);
  const memo = row.admin_memo.trim();
  const rn = row.receipt_number.trim();
  const receiptBlock = hasPersistedReceiptNumber(row) ? `\n\n접수번호: ${rn}` : "";

  if (status === "pending") {
    return `[지원금 전세버스]\n지원금 가승인 신청이 정상 접수되었습니다.${receiptBlock}\n\n후원 조건과 기사 견적 검토 후 결과를 안내드립니다.\n감사합니다.\n`;
  }
  if (status === "reviewing") {
    return `[지원금 전세버스]\n지원금 가승인 조건을 검토 중입니다.${receiptBlock}\n\n추가 확인 후 안내드리겠습니다.\n감사합니다.\n`;
  }
  if (status === "approved") {
    return `[지원금 전세버스]\n지원금 가승인이 완료되었습니다.${receiptBlock}\n\n매칭 조건을 순차 안내드릴 예정입니다.\n감사합니다.\n`;
  }

  return `[지원금 전세버스]\n지원금 가승인이 어렵습니다.${receiptBlock}\n\n사유:\n${memo || "사유 미기재"}\n\n문의사항은 고객센터로 연락 부탁드립니다.\n`;
}
