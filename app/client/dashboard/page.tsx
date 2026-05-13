"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

type ClientQuote = {
  source: "member" | "guest";
  id: string;
  company_name: string;
  driver_name: string;
  phone: string;
  price: number | null;
  member_price: number | null;
  sponsor_quote_enabled: boolean;
  vehicle_type: string;
  available_time: string;
  status: string;
};

type ClientApplication = {
  receipt_number: string;
  departure: string;
  destination: string;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  auto_selected_quote_id: string;
  auto_final_confirm_at: string;
  final_selected_quote_id: string;
  final_selected_at: string;
  contact_revealed_at: string;
  contract_status: string;
  quote_count: number;
};

function formatPrice(value: number | null): string {
  return value == null ? "금액 확인 중" : `${value.toLocaleString("ko-KR")}원`;
}

export default function ClientDashboardPage() {
  const [receiptNumber, setReceiptNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [application, setApplication] = useState<ClientApplication | null>(null);
  const [quotes, setQuotes] = useState<ClientQuote[]>([]);
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [phone, receiptNumber]);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "client-dashboard-live",
    tables: ["applications", "driver_quotes", "guest_driver_quotes"],
    enabled: application != null,
    debounceMs: 800,
    onRefresh: () => load({ silent: true }),
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
          receipt_number: receiptNumber,
          phone,
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
      setQuotes(Array.isArray(json.quotes) ? json.quotes : []);
      setMessage(
        action === "reopen"
          ? "견적을 재오픈했습니다."
          : action === "select_quote"
            ? "다른 견적으로 자동확정을 변경했습니다."
            : "최종 확정했습니다. 기사 연락처가 공개됩니다.",
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
      : quotes.find((quote) => quote.id === application.auto_selected_quote_id) ??
        quotes.find((quote) => quote.id === application.final_selected_quote_id) ??
        null;

  return (
    <main className="min-h-screen bg-[#f3f8fb] px-5 py-10">
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료관광버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          내 견적요청서 조회
        </h1>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value)}
            placeholder="접수번호"
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
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          style={tapStyle}
        >
          {loading ? "조회 중…" : "견적 조회"}
        </button>
        {message ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
            {message}
          </p>
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
                <p className="mt-2 text-lg font-black text-blue-950">
                  최저가{" "}
                  {formatPrice(
                    selectedQuote.member_price ?? selectedQuote.price,
                  )}
                </p>
              ) : null}
              <p className="mt-3 text-xs font-semibold leading-5 text-blue-800">
                최종확정 시 기사 연락처가 공개됩니다.
              </p>
              {application.contract_status === "contract_pending" ? (
                <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-900">
                  예약금 및 전자계약 절차가 진행됩니다.
                </p>
              ) : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={loading || !selectedQuote}
                  onClick={() => void runAction("final_confirm", selectedQuote ?? undefined)}
                  className="min-h-11 rounded-xl bg-slate-950 px-3 text-sm font-black text-white disabled:opacity-50"
                >
                  최종 확정
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void runAction("reopen")}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800"
                >
                  견적 재오픈
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
                  quote.id === application.auto_selected_quote_id ||
                  quote.id === application.final_selected_quote_id;
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
                        <p className="text-sm font-black text-slate-950">
                          {quote.company_name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {quote.vehicle_type} · {quote.available_time}
                        </p>
                        {quote.phone ? (
                          <p className="mt-1 text-xs font-black text-emerald-700">
                            연락처 {quote.phone}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-right text-sm font-black text-slate-950">
                        {formatPrice(quote.price)}
                        {quote.member_price != null ? (
                          <span className="block text-xs text-blue-700">
                            지원금 적용 {formatPrice(quote.member_price)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={loading || selected}
                      onClick={() => void runAction("select_quote", quote)}
                      className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50"
                    >
                      {selected ? "선택된 견적" : "다른 견적 선택"}
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
