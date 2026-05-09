"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
  status: string;
};

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
  const normalized = status.trim().toLowerCase();

  let label: string;
  let className: string;

  if (normalized === "" || normalized === "—") {
    label = "—";
    className =
      "border-slate-200 bg-slate-50 text-slate-600 ring-slate-100";
  } else if (normalized === "pending") {
    label = "접수완료";
    className =
      "border-emerald-200 bg-emerald-50 text-emerald-800 ring-emerald-100";
  } else if (normalized === "approved" || normalized === "approve") {
    label = "승인";
    className = "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100";
  } else if (
    normalized === "rejected" ||
    normalized === "reject" ||
    normalized === "denied"
  ) {
    label = "반려";
    className = "border-red-200 bg-red-50 text-red-800 ring-red-100";
  } else {
    label = status;
    className =
      "border-slate-200 bg-slate-50 text-slate-700 ring-slate-100";
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

function DetailSlidePanel({
  row,
  open,
  onClose,
}: {
  row: ApplicationDetail | null;
  open: boolean;
  onClose: () => void;
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
                상태
              </dt>
              <dd className="mt-1">
                <StatusBadge status={row.status} />
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </>
  );
}

export default function AdminApplicationsPage() {
  const [rows, setRows] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);

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
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
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
        ) : (
          <>
            <ul className="space-y-4 md:hidden">
              {rows.map((row) => (
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
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      신청일
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      신청 유형
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      신청자명
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      연락처
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      단체명
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      출발지
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      도착지
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      인원수
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-center text-xs text-slate-500">
              총 {rows.length}건 · 최신 신청일 순 · 행 클릭 시 상세
            </p>
          </>
        )}
      </main>

      <DetailSlidePanel row={selected} open={detailOpen} onClose={closeDetail} />
    </div>
  );
}
