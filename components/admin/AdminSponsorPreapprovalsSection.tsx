"use client";

import { useCallback, useEffect, useState } from "react";
import type { SponsorPreapprovalDetail } from "./admin-types";
import { formatCreatedAt } from "./admin-page-utils";

export function AdminSponsorPreapprovalsSection({ applicationId }: { applicationId: string }) {
  const [items, setItems] = useState<SponsorPreapprovalDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/sponsors?application_id=${encodeURIComponent(applicationId)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as { preapprovals?: SponsorPreapprovalDetail[] };
      setItems(Array.isArray(json.preapprovals) ? json.preapprovals : []);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  const runAction = async (item: SponsorPreapprovalDetail, action: "approve" | "reject") => {
    setActionBusy(`${action}:${item.id}`);
    try {
      await fetch(`/api/admin/sponsor-preapprovals/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          preapproval_id: item.id,
          approved_support_amount:
            item.approved_support_amount ?? item.estimated_support_amount,
          decision_memo:
            action === "approve"
              ? "관리자 승인 처리"
              : "관리자 취소 처리",
        }),
      });
      await load();
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-emerald-950">후원업체 가승인 후보</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-8 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-900 disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white px-3 py-4 text-center text-xs font-semibold text-slate-500">
          생성된 가승인 후보가 없습니다.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg bg-white p-3 text-xs ring-1 ring-emerald-100">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-950">
                    {item.sponsor_company_name || "후원업체"}
                  </p>
                  <p className="mt-1 font-semibold text-slate-500">
                    조건명: {item.sponsor_rule_title || "—"}
                  </p>
                  {item.assigned_staff_name ? (
                    <p className="mt-1 font-semibold text-slate-500">
                      담당자: {item.assigned_staff_name} / {item.assigned_staff_phone || "—"}
                    </p>
                  ) : null}
                  {item.decision_memo ? (
                    <p className="mt-1 font-semibold text-slate-500">
                      결정 메모: {item.decision_memo}
                    </p>
                  ) : null}
                  {item.matched_reason ? (
                    <p className="mt-1 font-semibold text-emerald-700">
                      {item.matched_reason}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-black text-blue-700">
                    {item.estimated_support_amount.toLocaleString("ko-KR")}원
                  </p>
                  {item.approved_support_amount != null ? (
                    <p className="mt-1 font-black text-indigo-700">
                      승인 {item.approved_support_amount.toLocaleString("ko-KR")}원
                    </p>
                  ) : null}
                  <p className="mt-1 font-bold text-emerald-700">
                    {item.status === "preapproved" ? "가승인" : item.status}
                  </p>
                  <p className="mt-1 font-semibold text-slate-500">
                    결정 {item.decided_at ? formatCreatedAt(item.decided_at) : "—"}
                  </p>
                  <p className="mt-1 font-semibold text-slate-500">
                    문자 {item.staff_sms_sent_at ? "발송" : item.staff_sms_error ? "실패" : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={actionBusy != null || item.status === "approved"}
                  onClick={() => void runAction(item, "approve")}
                  className="min-h-9 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50"
                >
                  관리자 승인 처리
                </button>
                <button
                  type="button"
                  disabled={actionBusy != null || item.status === "rejected"}
                  onClick={() => void runAction(item, "reject")}
                  className="min-h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700 disabled:opacity-50"
                >
                  관리자 취소 처리
                </button>
                <button
                  type="button"
                  disabled
                  className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-400"
                >
                  담당자 재배정
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
