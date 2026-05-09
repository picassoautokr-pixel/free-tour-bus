"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as XLSX from "xlsx";

import { createSupabaseClient } from "@/lib/supabase";

/** 목록·상세 공통 — Supabase row 정규화 */
type ApplicationDetail = {
  id: string;
  created_at: string | null;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  destination: string;
  stopovers: string[];
  departure_date: string | null;
  return_date: string | null;
  passenger_count: number | null;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string;
  request_message: string;
  attachment_url: string;
  admin_memo: string;
  status: string;
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
  | "application_type"
  | "applicant_name"
  | "phone"
  | "organization_name"
  | "departure"
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

function safeText(value: unknown, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

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

    return {
      id,
      created_at: created,
      application_type: safeText(r.application_type),
      trip_type: safeText(r.trip_type),
      bus_grade: safeText(r.bus_grade),
      departure: safeText(r.departure),
      destination: safeText(r.destination),
      stopovers: parseStopovers(r.stopovers),
      departure_date: depDate,
      return_date: retDate,
      passenger_count: passengerCount,
      applicant_name: safeText(r.applicant_name),
      phone: safeText(r.phone),
      organization_name: safeText(r.organization_name),
      organization_type: safeText(r.organization_type),
      request_message: safeText(r.request_message),
      attachment_url: attachmentDisplay === "—" ? "" : attachmentDisplay,
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

function DetailSlidePanel({
  row,
  open,
  onClose,
  onStatusSaved,
}: {
  row: ApplicationDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusSaved: (
    applicationId: string,
    nextStatus: ApplicationStatusValue,
    nextMemo: string,
  ) => void;
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

  const attachment = row.attachment_url.trim();
  const isHttpUrl =
    attachment.startsWith("http://") || attachment.startsWith("https://");

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

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
          <dl>
            <DetailField label="신청 유형">{row.application_type}</DetailField>
            <DetailField label="왕복 / 편도">{row.trip_type}</DetailField>
            <DetailField label="버스 등급">{row.bus_grade}</DetailField>
            <DetailField label="출발지">{row.departure}</DetailField>
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
            <DetailField label="가는 날짜">
              {formatDateOnly(row.departure_date)}
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
                첨부파일 URL
              </dt>
              <dd className="mt-1 break-all text-sm font-medium">
                {attachment === "" ? (
                  <span className="text-slate-400">—</span>
                ) : isHttpUrl ? (
                  <a
                    href={attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline hover:text-blue-800"
                  >
                    {attachment}
                  </a>
                ) : (
                  attachment
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

  const [rows, setRows] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    if (toastMessage == null) return;
    const timerId = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  useEffect(() => {
    // 로그인된 관리자 이메일 표시용
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { data } = await supabase.auth.getUser();
        setAdminEmail(data.user?.email ?? null);
      } catch {
        setAdminEmail(null);
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
      setToastMessage("저장되었습니다.");
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

  const openDetail = (row: ApplicationDetail) => {
    setSelected(row);
    setDetailOpen(true);
  };

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
        row.applicant_name,
        row.phone,
        row.organization_name,
        row.departure,
        row.destination,
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
        신청유형: r.application_type,
        상태: statusLabelForExport(r.status),
        신청자명: r.applicant_name,
        연락처: r.phone,
        단체명: r.organization_name,
        단체유형: r.organization_type,
        출발지: r.departure,
        도착지: r.destination,
        가는날짜: formatIsoDate(r.departure_date),
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
      setToastMessage(`엑셀 다운로드 실패: ${message}`);
    }
  }, [filteredAndSortedRows]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              신청 관리
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              무료관광버스 신청 목록 · 행을 눌러 상세 보기
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {authLoading
                ? "관리자 확인 중…"
                : adminEmail
                  ? `관리자: ${adminEmail}`
                  : "관리자: -"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExcelDownload}
              disabled={loading || filteredAndSortedRows.length === 0}
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
              onClick={() => void load()}
              disabled={loading}
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
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="block flex-1">
              <span className="sr-only">검색</span>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="신청자명, 연락처, 단체명, 출발지, 도착지 검색"
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
                <li key={row.id}>
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
                    <p className="mt-3 text-base font-bold text-slate-900">
                      {row.applicant_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.application_type}
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
                      <td className="max-w-[200px] px-4 py-3 text-slate-800">
                        <span className="line-clamp-2">
                          {row.application_type}
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
      </main>

      <DetailSlidePanel
        row={selected}
        open={detailOpen}
        onClose={closeDetail}
        onStatusSaved={handleStatusSaved}
      />

      {toastMessage ? (
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
          <span className="leading-snug">{toastMessage}</span>
        </div>
      ) : null}
    </div>
  );
}
