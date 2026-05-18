"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import {
  buildQuoteSupportBreakdown,
  formatSupportAmount,
  type QuoteSupportBreakdown,
} from "@/lib/support-calculation";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;
const applicationTabs = [
  { id: "collecting", label: "견적 수집중" },
  { id: "needs_selection", label: "선택 필요" },
  { id: "matched", label: "매칭 완료" },
] as const;

type ApplicationTab = (typeof applicationTabs)[number]["id"];

type ClientQuote = {
  source: "member" | "guest";
  id: string;
  company_name: string;
  driver_name: string;
  phone: string;
  price: number | null;
  member_price: number | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
  sponsor_support_status?: "none" | "preapproved" | "approved" | "rejected" | "mixed" | "";
  sponsor_quote_enabled: boolean;
  vehicle_type: string;
  available_time: string;
  memo?: string;
  message?: string;
  status: string;
  created_at?: string;
};

type ClientApplication = {
  id: string;
  receipt_number: string;
  contract_number: string;
  contract_pdf_generated_at: string;
  contract_pdf_url: string;
  applicant_name: string;
  phone: string;
  departure: string;
  destination: string;
  stopovers: string[];
  departure_date: string;
  departure_time: string;
  trip_type: string;
  bus_grade: string;
  passenger_count: number | null;
  request_message: string;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  auto_final_confirm_at: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  final_selected_at: string;
  contact_revealed_at: string;
  contract_status: string;
  contract_started_at: string;
  client_contract_confirmed_at: string;
  driver_contract_confirmed_at: string;
  deposit_amount: number;
  deposit_status: string;
  deposit_confirmed_at: string;
  contract_memo: string;
  quote_count: number;
  sponsor_support_status?: "none" | "preapproved" | "approved" | "rejected" | "mixed";
  sponsor_preapproved_count?: number;
  sponsor_approved_count?: number;
  sponsor_rejected_count?: number;
  quotes?: ClientQuote[];
};

function quoteBreakdown(quote: ClientQuote): QuoteSupportBreakdown {
  if (quote.support_breakdown) return quote.support_breakdown;
  if (quote.source === "guest") {
    return buildQuoteSupportBreakdown({
      price: quote.price,
      sponsor_quote_enabled: false,
    });
  }
  return buildQuoteSupportBreakdown({
    price: quote.price,
    member_price: quote.member_price,
    final_member_price: quote.support_discount_applied_price,
    sponsor_quote_enabled: quote.sponsor_quote_enabled,
    customer_support_amount: quote.member_price != null && quote.price != null
      ? quote.price - quote.member_price
      : null,
  });
}

function QuotePriceSummary({ quote }: { quote: ClientQuote }) {
  const breakdown = quoteBreakdown(quote);
  if (quote.source === "guest") {
    return (
      <dl className="grid gap-1 text-xs">
        <dt className="font-semibold text-slate-500">일반견적가</dt>
        <dd className="font-black text-slate-900">
          {formatSupportAmount(quote.price, { phase: "planned" })}
        </dd>
      </dl>
    );
  }
  return <SupportQuoteBreakdown breakdown={breakdown} mode="customer" compact />;
}

function applicationTabFor(application: ClientApplication): ApplicationTab {
  if (application.final_selected_quote_id) return "matched";
  if (application.quote_count > 0) return "needs_selection";
  return "collecting";
}

export default function ClientDashboardPage() {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupPassword, setLookupPassword] = useState("");
  const [showReceiptLookup, setShowReceiptLookup] = useState(false);
  const [activeTab, setActiveTab] = useState<ApplicationTab>("collecting");
  const [applications, setApplications] = useState<ClientApplication[]>([]);
  const [application, setApplication] = useState<ClientApplication | null>(null);
  const [quotes, setQuotes] = useState<ClientQuote[]>([]);
  const [confirmQuote, setConfirmQuote] = useState<ClientQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const quoteCountRef = useRef(0);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setMessage(null);
    }
    try {
      const query = new URLSearchParams({
        receipt_number: receiptNumber,
        phone,
      });
      const res = await fetch(`/api/client/quotes?${query.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        application?: ClientApplication;
        quotes?: ClientQuote[];
      };
      if (!res.ok) {
        setMessage(json.error ?? "견적요청을 찾을 수 없습니다.");
        setApplication(null);
        setQuotes([]);
        return;
      }
      if (
        options?.silent &&
        Array.isArray(json.quotes) &&
        json.quotes.length > quoteCountRef.current
      ) {
        setMessage("새 견적이 도착했습니다.");
      }
      setApplication(json.application ?? null);
      const nextQuotes = Array.isArray(json.quotes) ? json.quotes : [];
      quoteCountRef.current = nextQuotes.length;
      setQuotes(nextQuotes);
      setApplications(json.application ? [{ ...json.application, quotes: nextQuotes }] : []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [phone, receiptNumber]);

  const loadApplications = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setMessage(null);
    }
    try {
      const query = new URLSearchParams({
        phone: lookupPhone,
        lookup_password: lookupPassword,
      });
      const res = await fetch(`/api/client/quotes?${query.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        applications?: ClientApplication[];
      };
      if (!res.ok) {
        setMessage(json.error ?? "견적요청을 찾을 수 없습니다.");
        setApplications([]);
        setApplication(null);
        setQuotes([]);
        return;
      }
      const nextApplications = Array.isArray(json.applications) ? json.applications : [];
      setApplications(nextApplications);
      const nextApplication =
        nextApplications.find((item) => item.id === application?.id) ?? nextApplications[0] ?? null;
      setApplication(nextApplication);
      const nextQuotes = Array.isArray(nextApplication?.quotes) ? nextApplication.quotes : [];
      quoteCountRef.current = nextQuotes.length;
      setQuotes(nextQuotes);
      if (!options?.silent) setMessage(`견적요청 ${nextApplications.length}건을 불러왔습니다.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [application?.id, lookupPassword, lookupPhone]);

  const selectApplication = (nextApplication: ClientApplication) => {
    setApplication(nextApplication);
    setQuotes(Array.isArray(nextApplication.quotes) ? nextApplication.quotes : []);
    setMessage(null);
  };

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "client-dashboard-live",
    tables: ["applications", "driver_quotes", "guest_driver_quotes", "sponsor_preapprovals"],
    enabled: application != null,
    debounceMs: 800,
    onRefresh: () =>
      lookupPassword.trim() !== ""
        ? loadApplications({ silent: true })
        : load({ silent: true }),
  });

  const runAction = async (
    action: "final_confirm" | "select_quote" | "reopen",
    quote?: ClientQuote,
  ) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/client/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receipt_number: application?.receipt_number ?? receiptNumber,
          phone: application?.phone ?? phone,
          action,
          quote_id: quote?.id,
          quote_source: quote?.source,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        application?: ClientApplication;
        quotes?: ClientQuote[];
      };
      if (!res.ok) {
        setMessage(json.error ?? "처리하지 못했습니다.");
        return;
      }
      setApplication(json.application ?? null);
      const nextQuotes = Array.isArray(json.quotes) ? json.quotes : [];
      setQuotes(nextQuotes);
      if (json.application) {
        setApplications((prev) =>
          prev.map((item) =>
            item.id === json.application?.id ? { ...json.application, quotes: nextQuotes } : item,
          ),
        );
      }
      setMessage(
        action === "reopen"
          ? "견적을 재오픈했습니다."
          : action === "select_quote"
            ? "선택 후보가 변경되었습니다."
            : "최종 견적을 선택했습니다. 선택한 기사 연락처가 공개됩니다.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const selectedQuote =
    application == null
      ? null
      : quotes.find(
          (quote) =>
            quote.id === application.final_selected_quote_id &&
            quote.source === application.final_selected_quote_source,
        ) ??
        quotes.find(
          (quote) =>
            quote.id === application.auto_selected_quote_id &&
            quote.source === application.auto_selected_quote_source,
        ) ??
        null;
  const filteredApplications = applications.filter(
    (item) => applicationTabFor(item) === activeTab,
  );
  const contactRevealed =
    application != null &&
    application.contact_revealed_at.trim() !== "" &&
    application.final_selected_quote_id.trim() !== "" &&
    ["final_selected", "contract_pending", "completed"].includes(
      application.quote_status,
    );
  const subsidyPreApproved =
    application != null &&
    ["auto_selected", "final_selected", "contract_pending", "completed"].includes(
      application.quote_status,
    );

  return (
    <main className="min-h-screen bg-[#f3f8fb] px-5 py-10">
      {confirmQuote ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black text-slate-950">
              이 견적을 최종 선택하시겠습니까?
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-black text-slate-950">{confirmQuote.company_name}</p>
              <p className="font-semibold text-slate-600">
                {confirmQuote.vehicle_type} · {confirmQuote.available_time}
              </p>
              <div className="rounded-xl bg-slate-50 p-3">
                <QuotePriceSummary quote={confirmQuote} />
              </div>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">
                최종 선택 후 선택한 기사/업체 연락처가 공개됩니다.
              </p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setConfirmQuote(null)}
                className="min-h-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const quote = confirmQuote;
                  setConfirmQuote(null);
                  void runAction("final_confirm", quote);
                }}
                className="min-h-11 rounded-xl bg-blue-600 text-sm font-black text-white"
              >
                최종 선택
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          지원금 전세버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          내 견적요청 모아보기
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          휴대폰번호와 견적 조회용 간단 비밀번호로 내 신청서를 한 번에 확인합니다.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            value={lookupPhone}
            onChange={(event) => setLookupPhone(event.target.value)}
            placeholder="휴대폰번호"
            className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={lookupPassword}
            onChange={(event) => setLookupPassword(event.target.value)}
            placeholder="견적 조회용 간단 비밀번호"
            className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadApplications()}
          disabled={loading || lookupPhone.trim() === "" || lookupPassword.trim().length < 4}
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          style={tapStyle}
        >
          {loading ? "조회 중…" : "내 견적요청 조회"}
        </button>
        <button
          type="button"
          onClick={() => setShowReceiptLookup((prev) => !prev)}
          className="mt-3 text-sm font-black text-blue-700"
        >
          {showReceiptLookup ? "신청번호 조회 닫기" : "신청번호로 조회하기"}
        </button>
        {showReceiptLookup ? (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value)}
                placeholder="신청번호"
                className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
              />
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="휴대폰번호"
                className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || receiptNumber.trim() === "" || phone.trim() === ""}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              신청번호로 조회
            </button>
          </div>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
            {message}
          </p>
        ) : null}
        {applications.length > 0 ? (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-black text-slate-950">내 견적요청</h2>
            <div className="grid grid-cols-3 gap-2">
              {applicationTabs.map((tab) => {
                const count = applications.filter((item) => applicationTabFor(item) === tab.id).length;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-10 rounded-xl text-xs font-black ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-50 text-slate-600 ring-1 ring-slate-100"
                    }`}
                  >
                    {tab.label} {count}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3">
              {filteredApplications.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500">
                  이 상태의 견적요청이 없습니다.
                </p>
              ) : null}
              {filteredApplications.map((item) => {
                const active = item.id === application?.id;
                const statusLabel =
                  applicationTabFor(item) === "matched"
                    ? "매칭 완료"
                    : applicationTabFor(item) === "needs_selection"
                      ? "선택 필요"
                      : "견적 수집중";
                const supportLabel =
                  item.sponsor_support_status === "approved"
                    ? "확정 지원금"
                    : item.sponsor_support_status === "rejected"
                      ? "지원금 미승인"
                      : item.sponsor_support_status === "none"
                        ? "지원금 없음"
                        : "지원금 검토중";
                return (
                  <article
                    key={item.id}
                    className={`rounded-2xl border p-4 ${
                      active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-500">{item.receipt_number}</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {[item.departure, ...item.stopovers, item.destination].filter(Boolean).join(" → ")}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {item.departure_date} {item.departure_time} · {item.passenger_count ?? "—"}명 · 견적 {item.quote_count}건
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                          {statusLabel}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">
                          {supportLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => selectApplication(item)}
                          className="min-h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white"
                        >
                          보기
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        {application ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200">
              {realtimeStatusLabel(realtimeStatus)}
            </p>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-black text-blue-950">
                {application.auto_selected_quote_id
                  ? "최저가 자동마감 확정됨"
                  : "견적 수집 상태"}
              </p>
              <p className="mt-2 text-sm font-semibold text-blue-900">
                {application.departure} → {application.destination}
              </p>
              <p className="mt-2 text-sm font-semibold text-blue-900">
                총 견적 {application.quote_count}건
              </p>
              <div className="mt-3">
                <QuoteStatusSummary
                  quoteStatus={application.quote_status}
                  quoteDeadlineAt={application.quote_deadline_at}
                  autoFinalConfirmAt={application.auto_final_confirm_at}
                  quoteCount={application.quote_count}
                  quoteLimitCount={application.quote_limit_count}
                  targetNormalPrice={application.target_normal_price}
                  targetMemberPrice={application.target_member_price}
                  compact
                />
              </div>
              {selectedQuote ? (
                <div className="mt-4 rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
                  <p className="text-xs font-black text-blue-500">
                    선택된 기사 정보
                  </p>
                  <p className="mt-2 text-lg font-black text-blue-950">
                    {selectedQuote.company_name}
                    {selectedQuote.driver_name !== "—" ? (
                      <span className="ml-2 text-sm font-bold text-blue-700">
                        {selectedQuote.driver_name}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {selectedQuote.vehicle_type} · {selectedQuote.available_time}
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <QuotePriceSummary quote={selectedQuote} />
                  </div>
                  {contactRevealed && selectedQuote.phone ? (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                      <p className="text-[11px] font-bold text-emerald-600">
                        기사 연락처
                      </p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <p className="font-black text-emerald-950">
                          {selectedQuote.phone}
                        </p>
                        <div className="flex gap-2">
                          <a
                            href={`tel:${selectedQuote.phone}`}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-black text-white"
                            style={tapStyle}
                          >
                            전화하기
                          </a>
                          <a
                            href={`sms:${selectedQuote.phone}`}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-emerald-900"
                            style={tapStyle}
                          >
                            문자보내기
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-3 text-xs font-semibold leading-5 text-blue-800">
                {contactRevealed
                  ? "매칭이 확정되어 기사 연락처가 공개되었습니다."
                  : "예상 지원금 검토 후 매칭 확정 시 제휴기사 연락처가 공개됩니다."}
              </p>
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-black text-emerald-950">
                  예상 지원금 검토 진행
                </p>
                <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-3">
                  <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
                    후원 조건 {subsidyPreApproved ? "예상 지원금" : "검토중"}
                  </div>
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-900">
                    기사 견적 {selectedQuote ? "선정됨" : "수집중"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
                    연락처 {contactRevealed ? "공개됨" : "확정 후 공개"}
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                  후원업체 지원 여부에 따라 지원견적가가 적용될 수 있습니다.
                  후원업체의 세부 지원금액은 공개되지 않습니다.
                </p>
                <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-900">
                  {application.sponsor_support_status === "approved"
                    ? "확정 지원금"
                    : application.sponsor_support_status === "rejected"
                      ? "지원금 미승인 또는 조건 불일치"
                      : application.sponsor_support_status === "none"
                        ? "지원금 없음"
                        : "지원금 검토중"}
                </p>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={loading || !selectedQuote}
                  onClick={() => selectedQuote ? setConfirmQuote(selectedQuote) : undefined}
                  className="min-h-11 rounded-xl bg-slate-950 px-3 text-sm font-black text-white disabled:opacity-50"
                >
                  선택 견적 최종확정
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void runAction("reopen")}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800"
                >
                  조건 재검토 요청
                </button>
                <Link
                  href="/"
                  className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800"
                  style={tapStyle}
                >
                  메인으로
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {quotes.map((quote) => {
                const selected =
                  (quote.id === application.auto_selected_quote_id &&
                    quote.source === application.auto_selected_quote_source) ||
                  (quote.id === application.final_selected_quote_id &&
                    quote.source === application.final_selected_quote_source);
                const supportStatus =
                  quote.sponsor_support_status ||
                  (quote.sponsor_quote_enabled ? application.sponsor_support_status : "none");
                const supportStatusLabel =
                  supportStatus === "approved"
                    ? "확정 지원금"
                    : supportStatus === "preapproved" || supportStatus === "mixed"
                      ? "예상 지원금 검토중"
                      : supportStatus === "rejected"
                        ? "지원금 미승인"
                        : "일반견적";
                return (
                  <article
                    key={`${quote.source}-${quote.id}`}
                    className={`rounded-2xl border p-4 ${
                      selected
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                            quote.source === "member"
                              ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                              : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                          }`}>
                            {quote.source === "member" ? "제휴기사 견적" : "일반기사 견적"}
                          </span>
                          {quote.sponsor_quote_enabled ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
                              지원금 할인 견적
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-black text-slate-950">
                          {quote.company_name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {quote.driver_name !== "—" ? `${quote.driver_name} · ` : ""}
                          {quote.vehicle_type} · {quote.available_time}
                        </p>
                        {quote.phone ? (
                          <p className="mt-1 text-xs font-black text-emerald-700">
                            연락처 {quote.phone}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-[11rem] text-right text-sm">
                        <QuotePriceSummary quote={quote} />
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                          {supportStatusLabel}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading || selected}
                      onClick={() => setConfirmQuote(quote)}
                      className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50"
                    >
                      {selected ? "선택된 견적" : "이 견적 선택"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
          style={tapStyle}
        >
          메인으로
        </Link>
      </section>
    </main>
  );
}
