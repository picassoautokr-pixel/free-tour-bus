"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SPONSOR_STATUSES,
  parseSponsorStatus,
  safeText,
  sponsorStatusLabel,
  sponsorSupportTypeLabel,
} from "@/lib/sponsor";

type SponsorRow = Record<string, unknown> & {
  id: string;
  company_name?: string;
  manager_name?: string;
  phone?: string;
  status?: string;
  admin_memo?: string;
};

type Props = {
  setToast: (toast: { message: string }) => void;
};

function formatDate(value: unknown): string {
  const text = safeText(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("ko-KR");
}

export function SponsorCompaniesAdmin({ setToast }: Props) {
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | string>("all");
  const [selected, setSelected] = useState<SponsorRow | null>(null);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsors", { credentials: "same-origin" });
      const json = (await res.json()) as { sponsors?: SponsorRow[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "후원업체 목록을 불러오지 못했습니다.");
        return;
      }
      setRows(Array.isArray(json.sponsors) ? json.sponsors : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("sponsor-admin-refresh", onRefresh);
    return () => window.removeEventListener("sponsor-admin-refresh", onRefresh);
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((row) => filter === "all" || parseSponsorStatus(row.status) === filter),
    [filter, rows],
  );

  const updateStatus = async (status: string) => {
    if (!selected) return;
    const res = await fetch("/api/admin/sponsors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        id: selected.id,
        status,
        admin_memo: memo,
        support_type: selected.support_type,
      }),
    });
    const json = (await res.json()) as { sponsor?: SponsorRow; error?: string };
    if (!res.ok || !json.sponsor) {
      setError(json.error ?? "상태 저장에 실패했습니다.");
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === json.sponsor?.id ? json.sponsor : row)));
    setSelected(json.sponsor);
    setToast({ message: "후원업체 상태가 저장되었습니다." });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">후원업체 관리</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            신청 검토, 승인, 반려, 정지 처리를 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`min-h-9 rounded-full px-3 text-xs font-black ${
            filter === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          전체
        </button>
        {SPONSOR_STATUSES.map((status) => (
          <button
            key={status.value}
            type="button"
            onClick={() => setFilter(status.value)}
            className={`min-h-9 rounded-full px-3 text-xs font-black ${
              filter === status.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
          {error}
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs font-black text-slate-500">
            <tr>
              {["업체명", "담당자", "연락처", "업종", "품목", "지원형태", "상태", "신청일"].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-slate-100 px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => {
                  setSelected(row);
                  setMemo(safeText(row.admin_memo));
                }}
              >
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 font-black">
                  {safeText(row.company_name, "—")}
                </td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{safeText(row.manager_name, "—")}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{safeText(row.phone, "—")}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{safeText(row.business_category, "—")}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{safeText(row.product_category, "—")}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{sponsorSupportTypeLabel(row.support_type)}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{sponsorStatusLabel(row.status)}</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">{formatDate(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <h3 className="text-base font-black text-slate-950">
            {safeText(selected.company_name)}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
            {safeText(selected.product_description, "상품/서비스 설명 없음")}
          </p>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className="mt-4 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500"
            placeholder="관리자 메모"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {[
              ["reviewing", "검토"],
              ["approved", "승인"],
              ["rejected", "반려"],
              ["suspended", "정지"],
            ].map(([status, label]) => (
              <button
                key={status}
                type="button"
                onClick={() => void updateStatus(status)}
                className="min-h-10 rounded-xl bg-slate-950 text-sm font-black text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
