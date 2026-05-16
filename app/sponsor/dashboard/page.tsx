"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import { SERVICE_REGIONS } from "@/lib/regions";
import {
  SPONSOR_SUPPORT_TYPES,
  sponsorSupportTypeLabel,
  safeText,
} from "@/lib/sponsor";
import { formatRouteWithStopovers } from "@/lib/stopovers";
import { createSponsorBrowserClient } from "@/lib/supabase";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

type Tab = "calls" | "rules" | "staff" | "history";

type Rule = Record<string, unknown> & { id: string; title?: string; is_active?: boolean };
type Staff = Record<string, unknown> & {
  id: string;
  name?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
};
type Call = {
  id: string;
  application_id: string;
  sponsor_rule_title: string;
  support_type: string;
  support_condition: string;
  status: string;
  departure_region: string;
  departure: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  quote_status: string;
  quote_closed_at: string;
  estimated_support_amount: number;
  approved_support_amount?: number | null;
  decision_memo?: string;
  decided_at?: string;
  approved_at?: string;
  rejected_at?: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  assigned_staff_phone?: string;
  staff_sms_sent_at?: string;
  staff_sms_error?: string;
  quote_count?: number;
  sponsor_quote_count?: number;
  matched_quote_count?: number;
  final_quote_count?: number;
};

type ApprovalModal =
  | { kind: "approve"; call: Call; amount: string; staffId: string; memo: string }
  | { kind: "reject"; call: Call; memo: string }
  | null;

export default function SponsorDashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("calls");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<ApprovalModal>(null);
  const [ruleForm, setRuleForm] = useState({
    id: "",
    title: "",
    service_regions: [] as string[],
    support_per_person: "",
    support_per_case: "",
    max_support_amount: "",
    min_passenger_count: "",
    max_passenger_count: "",
    target_group: "",
    support_condition: "",
    support_type: "cash",
    daily_budget: "",
    monthly_budget: "",
    is_active: true,
    memo: "",
  });
  const [staffForm, setStaffForm] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    role: "",
    service_regions: [] as string[],
    is_active: true,
  });
  const callIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/dashboard", { credentials: "same-origin" });
      const json = (await res.json()) as {
        error?: string;
        approved?: boolean;
        company?: Record<string, unknown>;
        rules?: Rule[];
        staff?: Staff[];
        calls?: Call[];
      };
      if (!res.ok) {
        if ([401, 403, 404].includes(res.status)) {
          const supabase = createSponsorBrowserClient();
          await supabase.auth.signOut();
          router.replace("/sponsor/login");
          return;
        }
        setMessage(json.error ?? "후원업체 정보를 불러오지 못했습니다.");
        return;
      }
      setCompany(json.company ?? null);
      if (!json.approved) {
        setMessage("관리자 승인 후 후원업체 대시보드를 이용할 수 있습니다.");
        setRules([]);
        setStaff([]);
        setCalls([]);
        return;
      }
      setRules(Array.isArray(json.rules) ? json.rules : []);
      setStaff(Array.isArray(json.staff) ? json.staff : []);
      const nextCalls = Array.isArray(json.calls) ? json.calls : [];
      const previousIds = callIdsRef.current;
      if (previousIds.size > 0 && nextCalls.some((call) => !previousIds.has(call.id))) {
        setToast("새 지원금 가승인 후보가 도착했습니다.");
      }
      callIdsRef.current = new Set(nextCalls.map((call) => call.id));
      setCalls(nextCalls);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "sponsor-dashboard-live",
    tables: ["sponsor_preapprovals"],
    enabled: company != null && safeText(company.status) === "approved",
    debounceMs: 800,
    onRefresh: load,
  });

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const saveRule = async () => {
    await fetch("/api/sponsor/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ type: "rule", id: ruleForm.id, payload: ruleForm }),
    });
    setRuleForm((prev) => ({ ...prev, id: "", title: "" }));
    await load();
  };

  const saveStaff = async () => {
    await fetch("/api/sponsor/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ type: "staff", id: staffForm.id, payload: staffForm }),
    });
    setStaffForm({ id: "", name: "", phone: "", email: "", role: "", service_regions: [], is_active: true });
    await load();
  };

  const submitApprove = async () => {
    if (!approvalModal || approvalModal.kind !== "approve") return;
    if (!approvalModal.staffId) {
      setMessage("담당자를 먼저 등록해주세요.");
      setTab("staff");
      return;
    }
    const res = await fetch("/api/sponsor/preapprovals/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        preapproval_id: approvalModal.call.id,
        approved_support_amount: approvalModal.amount,
        assigned_staff_id: approvalModal.staffId,
        decision_memo: approvalModal.memo,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(json?.error ?? "지원 승인 처리에 실패했습니다.");
      return;
    }
    setApprovalModal(null);
    await load();
  };

  const submitReject = async () => {
    if (!approvalModal || approvalModal.kind !== "reject") return;
    const res = await fetch("/api/sponsor/preapprovals/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        preapproval_id: approvalModal.call.id,
        decision_memo: approvalModal.memo,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(json?.error ?? "지원 취소 처리에 실패했습니다.");
      return;
    }
    setApprovalModal(null);
    await load();
  };

  const logout = async () => {
    const supabase = createSponsorBrowserClient();
    await supabase.auth.signOut();
    router.replace("/sponsor/login");
  };

  const tabs = useMemo(
    () => [
      ["calls", "신규 지원검토"],
      ["rules", "내 후원조건"],
      ["staff", "담당자 관리"],
      ["history", "승인/지원 내역"],
    ] as const,
    [],
  );

  return (
    <main className="min-h-screen bg-[#f3f8fb] px-5 py-8">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[120] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-blue-900 shadow-xl ring-1 ring-blue-100">
          {toast}
        </div>
      ) : null}
      <section className="mx-auto max-w-5xl">
        {approvalModal ? (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/50 px-4 py-8">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-black text-slate-950">
                {approvalModal.kind === "approve" ? "지원 승인" : "지원 취소"}
              </h2>
              {approvalModal.kind === "approve" ? (
                <div className="mt-4 space-y-4">
                  <p className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
                    예상 지원금: {approvalModal.call.estimated_support_amount.toLocaleString("ko-KR")}원
                  </p>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">최종 승인 지원금</span>
                    <input
                      value={approvalModal.amount}
                      onChange={(event) =>
                        setApprovalModal((prev) =>
                          prev?.kind === "approve" ? { ...prev, amount: event.target.value } : prev,
                        )
                      }
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">담당자</span>
                    <select
                      value={approvalModal.staffId}
                      onChange={(event) =>
                        setApprovalModal((prev) =>
                          prev?.kind === "approve" ? { ...prev, staffId: event.target.value } : prev,
                        )
                      }
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
                    >
                      <option value="">담당자 선택</option>
                      {staff
                        .filter((item) => item.is_active !== false)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {safeText(item.name, "이름 없음")} / {safeText(item.phone, "연락처 없음")} / {safeText(item.role, "역할 없음")}
                          </option>
                        ))}
                    </select>
                  </label>
                  {staff.filter((item) => item.is_active !== false).length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setApprovalModal(null);
                        setTab("staff");
                      }}
                      className="min-h-10 w-full rounded-xl border border-amber-200 bg-amber-50 text-sm font-black text-amber-900"
                    >
                      담당자를 먼저 등록해주세요.
                    </button>
                  ) : null}
                  <textarea
                    value={approvalModal.memo}
                    onChange={(event) =>
                      setApprovalModal((prev) =>
                        prev?.kind === "approve" ? { ...prev, memo: event.target.value } : prev,
                      )
                    }
                    placeholder="메모"
                    className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => void submitApprove()}
                    className="min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
                  >
                    승인 확정
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <textarea
                    value={approvalModal.memo}
                    onChange={(event) =>
                      setApprovalModal((prev) =>
                        prev?.kind === "reject" ? { ...prev, memo: event.target.value } : prev,
                      )
                    }
                    placeholder="취소 사유"
                    className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => void submitReject()}
                    className="min-h-11 w-full rounded-xl bg-red-600 text-sm font-black text-white"
                  >
                    지원 취소
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setApprovalModal(null)}
                className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black text-blue-600">후원업체 대시보드</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
                {safeText(company?.company_name, "후원업체")}
              </h1>
              <p className="mt-1 text-sm font-bold text-slate-600">
                후원업체 · {safeText(company?.manager_name, "담당자 미등록")}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {realtimeStatusLabel(realtimeStatus)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              로그아웃
            </button>
          </div>
          {message ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`min-h-10 rounded-xl px-4 text-sm font-black ${
                  tab === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "calls" ? (
          <div className="mt-5 space-y-4">
            {loading ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                불러오는 중...
              </p>
            ) : calls.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                표시할 신규 지원검토 요청이 없습니다.
              </p>
            ) : (
              calls.map((call) => (
                <article key={call.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                        {call.departure_region || "지역 미정"}
                      </span>
                      <h2 className="mt-2 text-lg font-black text-slate-950">
                        {formatRouteWithStopovers(call.departure, call.stopovers, call.destination)}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {call.departure_date || "미정"} {call.departure_time}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        {call.passenger_count ?? "—"}명 · {call.trip_type} · {call.bus_grade}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-bold text-slate-400">예상 지원금</p>
                      <p className="mt-1 text-lg font-black text-blue-700">
                        {call.estimated_support_amount.toLocaleString("ko-KR")}원
                      </p>
                      <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900">
                        {call.status === "preapproved" ? "가승인" : call.status}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                    적용 조건: {call.sponsor_rule_title} · 지원형태: {sponsorSupportTypeLabel(call.support_type)}
                  </p>
                  {call.support_condition ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                      지원조건: {call.support_condition}
                    </p>
                  ) : null}
                  {call.assigned_staff_name ? (
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      담당자: {call.assigned_staff_name} / {call.assigned_staff_phone || "연락처 없음"}
                    </p>
                  ) : null}
                  {call.approved_support_amount != null ? (
                    <p className="mt-2 text-xs font-black text-blue-700">
                      승인 지원금: {call.approved_support_amount.toLocaleString("ko-KR")}원
                    </p>
                  ) : null}
                  {call.status === "approved" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <p className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-600">
                        기사 견적 {call.quote_count ?? 0}건
                      </p>
                      <p className="rounded-xl bg-blue-50 px-3 py-2 font-bold text-blue-700">
                        지원금 견적 {call.sponsor_quote_count ?? 0}건
                      </p>
                      <p className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-700">
                        매칭 {call.matched_quote_count ?? 0}건
                      </p>
                      <p className="rounded-xl bg-indigo-50 px-3 py-2 font-bold text-indigo-700">
                        최종 {call.final_quote_count ?? 0}건
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <QuoteStatusSummary quoteStatus={call.quote_status} compact />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setApprovalModal({
                          kind: "approve",
                          call,
                          amount: String(call.approved_support_amount ?? call.estimated_support_amount),
                          staffId: call.assigned_staff_id ?? "",
                          memo: call.decision_memo ?? "",
                        })
                      }
                      disabled={call.status === "approved"}
                      className="min-h-10 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-50"
                    >
                      {call.status === "approved" ? "승인완료" : "지원 승인"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalModal({ kind: "reject", call, memo: call.decision_memo ?? "" })}
                      disabled={call.status === "rejected"}
                      className="min-h-10 rounded-xl border border-red-200 bg-white text-sm font-black text-red-700 disabled:opacity-50"
                    >
                      {call.status === "rejected" ? "취소완료" : "지원 취소"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : null}

        {tab === "rules" ? (
          <SponsorRulePanel rules={rules} form={ruleForm} setForm={setRuleForm} onSave={saveRule} />
        ) : null}
        {tab === "staff" ? (
          <SponsorStaffPanel staff={staff} form={staffForm} setForm={setStaffForm} onSave={saveStaff} />
        ) : null}
        {tab === "history" ? (
          <div className="mt-5 rounded-2xl bg-white p-6 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-100">
            실제 자동지원금 확정/정산 내역은 다음 단계에서 제공됩니다.
          </div>
        ) : null}
      </section>
    </main>
  );
}

function RegionChecks({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {SERVICE_REGIONS.map((region) => {
        const checked = value.includes(region);
        return (
          <button
            key={region}
            type="button"
            onClick={() =>
              onChange(checked ? value.filter((item) => item !== region) : [...value, region])
            }
            className={`min-h-9 rounded-full border px-3 text-xs font-black ${
              checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {region}
          </button>
        );
      })}
    </div>
  );
}

function SponsorRulePanel({
  rules,
  form,
  setForm,
  onSave,
}: {
  rules: Rule[];
  form: Record<string, unknown> & { service_regions: string[] };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-black text-slate-950">후원조건 추가/수정</h2>
        {[
          ["title", "조건명"],
          ["support_per_person", "인당 지원금"],
          ["support_per_case", "건당 지원금"],
          ["max_support_amount", "최대 지원금"],
          ["min_passenger_count", "최소 인원"],
          ["max_passenger_count", "최대 인원"],
          ["target_group", "지원대상 조건"],
          ["support_condition", "지원조건"],
          ["daily_budget", "일 예산"],
          ["monthly_budget", "월 예산"],
          ["memo", "메모"],
        ].map(([key, label]) => (
          <label key={key} className="mt-3 block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <input
              value={safeText(form[key])}
              onChange={(event) => setForm((prev: any) => ({ ...prev, [key]: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
        ))}
        <label className="mt-3 block">
          <span className="text-xs font-bold text-slate-500">지원형태</span>
          <select
            value={safeText(form.support_type, "cash")}
            onChange={(event) => setForm((prev: any) => ({ ...prev, support_type: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
          >
            {SPONSOR_SUPPORT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <div className="mt-3">
          <span className="text-xs font-bold text-slate-500">지원지역</span>
          <RegionChecks
            value={form.service_regions}
            onChange={(next) => setForm((prev: any) => ({ ...prev, service_regions: next }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
        >
          후원조건 저장
        </button>
      </div>
      <div className="space-y-3">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="font-black text-slate-950">{safeText(rule.title, "조건명 없음")}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {sponsorSupportTypeLabel(rule.support_type)} · {rule.is_active === false ? "비활성" : "활성"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SponsorStaffPanel({
  staff,
  form,
  setForm,
  onSave,
}: {
  staff: Staff[];
  form: Record<string, unknown> & { service_regions: string[] };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-black text-slate-950">담당자 추가/수정</h2>
        {[
          ["name", "이름"],
          ["phone", "연락처"],
          ["email", "이메일"],
          ["role", "역할"],
        ].map(([key, label]) => (
          <label key={key} className="mt-3 block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <input
              value={safeText(form[key])}
              onChange={(event) => setForm((prev: any) => ({ ...prev, [key]: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
        ))}
        <div className="mt-3">
          <span className="text-xs font-bold text-slate-500">담당지역</span>
          <RegionChecks
            value={form.service_regions}
            onChange={(next) => setForm((prev: any) => ({ ...prev, service_regions: next }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
        >
          담당자 저장
        </button>
      </div>
      <div className="space-y-3">
        {staff.map((item) => (
          <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="font-black text-slate-950">{safeText(item.name, "이름 없음")}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {safeText(item.role, "역할 미정")} · {item.is_active === false ? "비활성" : "활성"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
