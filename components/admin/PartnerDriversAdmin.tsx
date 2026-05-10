"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as XLSX from "xlsx";

import {
  normalizePartnerDrivers,
  type PartnerDriverDetail,
} from "@/lib/partner-drivers-admin";
import { createSupabaseClient } from "@/lib/supabase";

const PARTNER_STATUS_OPTIONS = [
  { value: "pending", label: "접수완료" },
  { value: "reviewing", label: "검토중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
] as const;

type PartnerStatusValue = (typeof PARTNER_STATUS_OPTIONS)[number]["value"];

function parsePartnerStatus(raw: string): PartnerStatusValue | null {
  const n = raw.trim().toLowerCase();
  if (n === "approve" || n === "approved") return "approved";
  if (n === "reject" || n === "rejected" || n === "denied") return "rejected";
  if (n === "reviewing" || n === "review") return "reviewing";
  if (n === "pending") return "pending";
  return null;
}

function coercePartnerStatus(raw: string): PartnerStatusValue {
  return parsePartnerStatus(raw) ?? "pending";
}

function statusLabelForSearch(raw: string): string {
  const known = parsePartnerStatus(raw);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return raw.trim();
}

function statusLabelForExport(raw: string): string {
  return statusLabelForSearch(raw);
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

function ymdTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function PartnerStatusBadge({ status }: { status: string }) {
  const trimmed = status.trim();
  if (trimmed === "" || trimmed === "—") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
        —
      </span>
    );
  }
  const known = parsePartnerStatus(trimmed);
  let label: string;
  let className: string;
  if (known === null) {
    label = trimmed;
    className = "border-slate-200 bg-slate-50 text-slate-700 ring-slate-100";
  } else if (known === "pending") {
    label = "접수완료";
    className = "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100";
  } else if (known === "reviewing") {
    label = "검토중";
    className = "border-amber-300 bg-amber-50 text-amber-950 ring-amber-100";
  } else if (known === "approved") {
    label = "승인완료";
    className = "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-100";
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

function PartnerStatusSection({
  rowId,
  statusFromServer,
  memoFromServer,
  onSaved,
  setToast,
}: {
  rowId: string;
  statusFromServer: string;
  memoFromServer: string;
  onSaved: (nextStatus: PartnerStatusValue, nextMemo: string) => void;
  setToast: (t: { message: string }) => void;
}) {
  const normalizedSaved = coercePartnerStatus(statusFromServer);
  const [selected, setSelected] = useState<PartnerStatusValue>(() =>
    coercePartnerStatus(statusFromServer),
  );
  const [memo, setMemo] = useState(() => memoFromServer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(coercePartnerStatus(statusFromServer));
    setMemo(memoFromServer ?? "");
    setError(null);
  }, [rowId, statusFromServer, memoFromServer]);

  const unchanged =
    selected === normalizedSaved &&
    (memo ?? "").trim() === (memoFromServer ?? "").trim();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const memoTrim = memo.trim();

      let { error: updateError } = await supabase
        .from("partner_drivers")
        .update({ status: selected, admin_memo: memoTrim })
        .eq("id", rowId);

      if (updateError) {
        const msg = updateError.message.toLowerCase();
        const maybeMemoMissing =
          msg.includes("admin_memo") ||
          msg.includes("column") ||
          msg.includes("schema");

        if (maybeMemoMissing) {
          const retry = await supabase
            .from("partner_drivers")
            .update({ status: selected })
            .eq("id", rowId);
          updateError = retry.error;
          if (!retry.error) {
            onSaved(selected, "");
            setToast({
              message:
                "상태만 저장되었습니다. DB에 admin_memo 컬럼을 추가하면 관리자 메모도 저장됩니다.",
            });
            return;
          }
        }

        if (updateError) {
          setError(updateError.message);
        }
        return;
      }

      onSaved(selected, memoTrim);
      setToast({ message: "저장되었습니다." });
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
      <div className="mt-3">
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value as PartnerStatusValue)
          }
          disabled={saving}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          aria-label="제휴 신청 상태"
        >
          {PARTNER_STATUS_OPTIONS.map((opt) => (
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
            disabled={saving}
            placeholder="내부 검토 메모 (admin_memo 컬럼 필요)"
            className="mt-2 min-h-[120px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || unchanged}
        className="mt-3 h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {saving ? "저장 중…" : "상태 및 메모 저장"}
      </button>

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

type PartnerSortKey =
  | "created_at"
  | "company_name"
  | "manager_name"
  | "phone"
  | "email"
  | "region"
  | "business_type"
  | "vehicle_number"
  | "passenger_capacity"
  | "status";

type PartnerFilterValue = "all" | PartnerStatusValue;

type Props = {
  setToast: (t: { message: string }) => void;
};

export function PartnerDriversAdmin({ setToast }: Props) {
  const [rows, setRows] = useState<PartnerDriverDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<PartnerFilterValue>("all");
  const [sortKey, setSortKey] = useState<PartnerSortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<PartnerDriverDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error: q } = await supabase
        .from("partner_drivers")
        .select("*")
        .order("created_at", { ascending: false });

      if (q) {
        setError(q.message);
        setRows([]);
        return;
      }
      setRows(normalizePartnerDrivers(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("partner-admin-refresh", onRefresh);
    return () => window.removeEventListener("partner-admin-refresh", onRefresh);
  }, [load]);

  const handlePartnerStatusSaved = useCallback(
    (id: string, nextStatus: PartnerStatusValue, nextMemo: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: nextStatus, admin_memo: nextMemo } : r,
        ),
      );
      setSelected((prev) =>
        prev && prev.id === id
          ? { ...prev, status: nextStatus, admin_memo: nextMemo }
          : prev,
      );
    },
    [],
  );

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const hasTerm = term.length > 0;

    return rows.filter((row) => {
      if (statusFilter !== "all") {
        const known = parsePartnerStatus(row.status);
        if (known !== statusFilter) return false;
      }
      if (!hasTerm) return true;

      const haystack = [
        row.company_name,
        row.manager_name,
        row.phone,
        row.email,
        row.region,
        row.vehicle_number,
        row.status,
        statusLabelForSearch(row.status),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [rows, searchTerm, statusFilter]);

  const filteredAndSorted = useMemo(() => {
    const copy = [...filteredRows];
    const dir = sortDirection === "asc" ? 1 : -1;

    const ts = (v: string | null) => {
      if (v == null || v === "") return Number.NEGATIVE_INFINITY;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
    };

    const cmp = (a: string, b: string) =>
      a.localeCompare(b, "ko-KR", { sensitivity: "base" });

    copy.sort((a, b) => {
      if (sortKey === "created_at") {
        return (ts(a.created_at) - ts(b.created_at)) * dir;
      }
      if (sortKey === "passenger_capacity") {
        const av = a.passenger_capacity ?? Number.NEGATIVE_INFINITY;
        const bv = b.passenger_capacity ?? Number.NEGATIVE_INFINITY;
        return (av - bv) * dir;
      }
      if (sortKey === "status") {
        return (
          cmp(statusLabelForSearch(a.status), statusLabelForSearch(b.status)) *
          dir
        );
      }
      const av = String(
        (a as Record<string, unknown>)[sortKey] ?? "",
      );
      const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
      return cmp(av, bv) * dir;
    });

    return copy;
  }, [filteredRows, sortKey, sortDirection]);

  const handleSortClick = (key: PartnerSortKey) => {
    if (key === sortKey) {
      setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: PartnerSortKey) => {
    if (key !== sortKey) return null;
    return (
      <span className="ml-1 text-[10px] font-black text-slate-500" aria-hidden>
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const handleExcel = useCallback(() => {
    try {
      const exportRows = filteredAndSorted.map((r) => ({
        신청일: formatCreatedAt(r.created_at),
        업체명: r.company_name,
        담당자명: r.manager_name,
        연락처: r.phone,
        이메일: r.email,
        차고지: r.region,
        사업자유형: r.business_type,
        보유버스유형: r.bus_types.join(", "),
        차량모델: r.vehicle_model,
        차량번호: r.vehicle_number,
        최대탑승인원: r.passenger_capacity ?? "",
        상태: statusLabelForExport(r.status),
        관리자메모: r.admin_memo,
        기타메모: r.memo === "—" ? "" : r.memo,
        사업자등록증파일명: r.business_license_name,
        사업자등록증URL: r.business_license_url,
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: false });
      const headers = Object.keys(exportRows[0] ?? {});
      const colWidths = headers.map((h) => {
        let max = h.length;
        for (const row of exportRows) {
          const v = (row as Record<string, unknown>)[h];
          const s = v == null ? "" : String(v);
          if (s.length > max) max = s.length;
        }
        return { wch: Math.min(Math.max(max + 2, 10), 60) };
      });
      (ws as XLSX.WorkSheet)["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "제휴기사신청");
      XLSX.writeFile(wb, `제휴기사_신청목록_${ymdTodayLocal()}.xlsx`, {
        bookType: "xlsx",
      });
    } catch (e) {
      setToast({
        message: `엑셀 다운로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, [filteredAndSorted, setToast]);

  const openDetail = (row: PartnerDriverDetail) => {
    setSelected(row);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelected(null);
  };

  const partnerStats = useMemo(() => {
    let pending = 0;
    let reviewing = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of rows) {
      const k = parsePartnerStatus(r.status);
      if (k === "pending") pending++;
      else if (k === "reviewing") reviewing++;
      else if (k === "approved") approved++;
      else if (k === "rejected") rejected++;
    }
    return { total: rows.length, pending, reviewing, approved, rejected };
  }, [rows]);

  return (
    <>
      <section className="mb-5" aria-labelledby="partner-dash-heading">
        <h2
          id="partner-dash-heading"
          className="mb-3 text-sm font-black tracking-tight text-slate-900"
        >
          제휴기사 신청 현황
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold text-slate-500">전체</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">
              {partnerStats.total}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-blue-800">접수완료</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-blue-950">
              {partnerStats.pending}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-amber-900">검토중</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-amber-950">
              {partnerStats.reviewing}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-emerald-900">승인완료</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">
              {partnerStats.approved}
            </p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-sm">
            <p className="text-[11px] font-bold text-red-900">반려</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-red-950">
              {partnerStats.rejected}
            </p>
          </div>
        </div>
      </section>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="block flex-1">
            <span className="sr-only">검색</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="업체명, 담당자명, 연락처, 이메일, 차고지, 차량번호, 상태 검색"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <label className="block sm:w-[220px]">
            <span className="sr-only">상태 필터</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PartnerFilterValue)
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
          <button
            type="button"
            onClick={() => void handleExcel()}
            disabled={loading || filteredAndSorted.length === 0}
            className="h-11 shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            제휴 엑셀 다운로드
          </button>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          총 {rows.length}건 중 {filteredAndSorted.length}건 표시
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
            aria-hidden
          />
          <p className="mt-4 text-sm font-medium text-slate-600">
            제휴 신청 목록을 불러오는 중…
          </p>
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-semibold text-red-900">
            partner_drivers 를 불러오지 못했습니다.
          </p>
          <p className="mt-2 text-xs text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">
            등록된 제휴 신청이 없습니다.
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">
            조건에 맞는 내역이 없습니다.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-4 md:hidden">
            {filteredAndSorted.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => openDetail(row)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {formatCreatedAt(row.created_at)}
                    </p>
                    <PartnerStatusBadge status={row.status} />
                  </div>
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {row.company_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{row.manager_name}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">연락처</dt>
                      <dd className="font-medium text-slate-800">{row.phone}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">차량번호</dt>
                      <dd className="font-medium text-slate-800">
                        {row.vehicle_number}
                      </dd>
                    </div>
                  </dl>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("created_at")}
                    >
                      신청일{sortIndicator("created_at")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("company_name")}
                    >
                      업체명{sortIndicator("company_name")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("manager_name")}
                    >
                      담당자명{sortIndicator("manager_name")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("phone")}
                    >
                      연락처{sortIndicator("phone")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("email")}
                    >
                      이메일{sortIndicator("email")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("region")}
                    >
                      차고지{sortIndicator("region")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("business_type")}
                    >
                      사업자 유형{sortIndicator("business_type")}
                    </button>
                  </th>
                  <th className="min-w-[120px] px-3 py-3 font-semibold text-slate-700">
                    보유버스
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("vehicle_number")}
                    >
                      차량번호{sortIndicator("vehicle_number")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("passenger_capacity")}
                    >
                      탑승인원{sortIndicator("passenger_capacity")}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-0 font-semibold text-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1 py-3 hover:text-slate-900"
                      onClick={() => handleSortClick("status")}
                    >
                      상태{sortIndicator("status")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAndSorted.map((row) => (
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
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {formatCreatedAt(row.created_at)}
                    </td>
                    <td className="max-w-[140px] px-3 py-3 font-medium text-slate-900">
                      <span className="line-clamp-2">{row.company_name}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {row.manager_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.phone}
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-slate-700">
                      <span className="line-clamp-2 break-all">{row.email}</span>
                    </td>
                    <td className="max-w-[120px] px-3 py-3 text-slate-700">
                      <span className="line-clamp-2">{row.region}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.business_type}
                    </td>
                    <td className="max-w-[140px] px-3 py-3 text-xs text-slate-700">
                      {row.bus_types.length === 0
                        ? "—"
                        : row.bus_types.join(", ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-[13px] text-slate-800">
                      {row.vehicle_number}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.passenger_capacity ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <PartnerStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            행을 눌러 상세 보기 · 총 {filteredAndSorted.length}건
          </p>
        </>
      )}

      <PartnerDriverSlidePanel
        row={selected}
        open={detailOpen}
        onClose={closeDetail}
        onStatusSaved={handlePartnerStatusSaved}
        setToast={setToast}
      />
    </>
  );
}

function PartnerDriverSlidePanel({
  row,
  open,
  onClose,
  onStatusSaved,
  setToast,
}: {
  row: PartnerDriverDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusSaved: (
    id: string,
    nextStatus: PartnerStatusValue,
    nextMemo: string,
  ) => void;
  setToast: (t: { message: string }) => void;
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

  const licenseUrl = row.business_license_url.trim();
  const licenseHttp =
    licenseUrl.startsWith("http://") || licenseUrl.startsWith("https://");

  return (
    <>
      <button
        type="button"
        aria-label="패널 닫기"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              제휴 신청 상세
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatCreatedAt(row.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-2 sm:px-6">
          <dl>
            <DetailField label="업체명">{row.company_name}</DetailField>
            <DetailField label="담당자명">{row.manager_name}</DetailField>
            <DetailField label="연락처">{row.phone}</DetailField>
            <DetailField label="이메일">{row.email}</DetailField>
            <DetailField label="차고지">{row.region}</DetailField>
            <DetailField label="사업자 유형">{row.business_type}</DetailField>
            <DetailField label="보유버스 유형">
              {row.bus_types.length === 0 ? "—" : row.bus_types.join(", ")}
            </DetailField>
            <DetailField label="차량 모델">{row.vehicle_model}</DetailField>
            <DetailField label="차량번호">{row.vehicle_number}</DetailField>
            <DetailField label="최대 탑승인원">
              {row.passenger_capacity ?? "—"}
            </DetailField>
            <DetailField label="사업자등록증 파일명">
              {row.business_license_name.trim() === "" ? (
                "—"
              ) : (
                row.business_license_name
              )}
            </DetailField>
            <div className="border-b border-slate-100 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                사업자등록증
              </dt>
              <dd className="mt-2">
                {licenseHttp ? (
                  <a
                    href={licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700"
                  >
                    파일 보기
                  </a>
                ) : (
                  <span className="text-sm text-slate-400">첨부 없음</span>
                )}
              </dd>
            </div>
            <DetailField label="기타 메모">
              {row.memo.trim() === "" || row.memo === "—" ? (
                <span className="text-slate-400">—</span>
              ) : (
                <span className="whitespace-pre-wrap">{row.memo}</span>
              )}
            </DetailField>
            <DetailField label="현재 상태">
              <PartnerStatusBadge status={row.status} />
            </DetailField>
          </dl>

          <PartnerStatusSection
            rowId={row.id}
            statusFromServer={row.status}
            memoFromServer={row.admin_memo}
            onSaved={(nextStatus, nextMemo) =>
              onStatusSaved(row.id, nextStatus, nextMemo)
            }
            setToast={setToast}
          />
        </div>
      </aside>
    </>
  );
}
