"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import { ClientApplicationListItem } from "@/app/client/dashboard/ClientApplicationListItem";
import { normalizeClientApplication } from "@/app/client/dashboard/client-display";
import { applyClientPartnerQuoteApiFields } from "@/lib/client-member-quote-payload";
import { quoteSubmitPriceLines } from "@/app/client/dashboard/page-quote-screen";
import {
  selectedPriceTypeToLegacyKind,
  type QuoteMatchPriceSelection,
} from "@/lib/client-quote-match-selection";
import {
  CLIENT_DASHBOARD_TITLE,
  CLIENT_LIST_SORTS,
  CLIENT_MAIN_TABS,
  LABEL,
  MATCHED_RUN_FILTERS,
  labelWithCount,
  type ClientListSort,
  type ClientMainTab,
  type MatchedRunFilter,
} from "@/lib/client-dashboard-labels";
import {
  clientApplicationTab,
  clientTabCounts,
  matchedRunStatus,
  sortClientApplications,
  type ClientApplication,
  type ClientQuote,
} from "@/lib/client-application-view-model";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

/** 매칭완료 탭 — 매칭 세부내역 영역 표시 용어 */
export const CLIENT_MATCHED_DETAIL_LABEL = {
  sectionTitle: LABEL.matchedDetailTitle,
  matchedPriceKind: LABEL.matchedPriceKind,
  finalPaymentPrice: LABEL.finalPaymentPrice,
} as const;

/** API 견적 응답 — 제휴기사 필수 지원금 숫자 필드 보강 후 normalize */
function normalizeClientApplicationFromApi(app: ClientApplication): ClientApplication {
  const withQuotes: ClientApplication = {
    ...app,
    quotes: (app.quotes ?? []).map((q) =>
      q.source === "member" ? applyClientPartnerQuoteApiFields(q, app) : q,
    ),
  };
  return normalizeClientApplication(withQuotes);
}

/** 견적서 제출현황 가격 표시 (page-quote-screen.ts) */
export { quoteSubmitPriceLines, QUOTE_SCREEN_LABEL } from "@/app/client/dashboard/page-quote-screen";
export type { QuoteMatchPriceSelection } from "@/lib/client-quote-match-selection";

export default function ClientDashboardPage() {
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupPassword, setLookupPassword] = useState("");
  const [showReceiptLookup, setShowReceiptLookup] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [activeTab, setActiveTab] = useState<ClientMainTab>("requesting");
  const [matchedFilter, setMatchedFilter] = useState<MatchedRunFilter>("in_progress");
  const [listSort, setListSort] = useState<ClientListSort>("deadline");
  const [applications, setApplications] = useState<ClientApplication[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const quoteCountRef = useRef(0);

  const mergeApplications = useCallback(
    (next: ClientApplication[], toastNewQuotes?: boolean) => {
      if (toastNewQuotes) {
        const totalQuotes = next.reduce((sum, a) => sum + (a.quote_count ?? 0), 0);
        if (totalQuotes > quoteCountRef.current) {
          setMessage("새 견적이 도착했습니다.");
        }
        quoteCountRef.current = totalQuotes;
      }
      setApplications(next);
    },
    [],
  );

  const loadByReceipt = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setMessage(null);
    }
    try {
      const query = new URLSearchParams({ receipt_number: receiptNumber, phone });
      const res = await fetch(`/api/client/quotes?${query.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        application?: ClientApplication;
        quotes?: ClientQuote[];
      };
      if (!res.ok) {
        setMessage(json.error ?? "견적요청을 찾을 수 없습니다.");
        setApplications([]);
        return;
      }
      const app = json.application;
      const quotes = Array.isArray(json.quotes) ? json.quotes : [];
      mergeApplications(
        app ? [normalizeClientApplicationFromApi({ ...app, quotes })] : [],
        !options?.silent,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [mergeApplications, phone, receiptNumber]);

  const loadApplications = useCallback(
    async (options?: { silent?: boolean }) => {
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
          return;
        }
        const next = (Array.isArray(json.applications) ? json.applications : []).map(
          normalizeClientApplicationFromApi,
        );
        mergeApplications(next, true);
        if (!options?.silent) {
          setMessage(`견적요청 ${next.length}${LABEL.countSuffix}을 불러왔습니다.`);
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [lookupPassword, lookupPhone, mergeApplications],
  );

  const realtimeEnabled = applications.length > 0;
  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "client-dashboard-live",
    tables: ["applications", "driver_quotes", "guest_driver_quotes", "sponsor_preapprovals"],
    enabled: realtimeEnabled,
    debounceMs: 800,
    onRefresh: () =>
      lookupPassword.trim() !== ""
        ? void loadApplications({ silent: true })
        : receiptNumber.trim() && phone.trim()
          ? void loadByReceipt({ silent: true })
          : undefined,
  });

  const tabCounts = useMemo(() => clientTabCounts(applications), [applications]);

  const filteredApplications = useMemo(() => {
    let list = applications.filter((app) => clientApplicationTab(app) === activeTab);
    if (activeTab === "matched") {
      list = list.filter((app) => matchedRunStatus(app) === matchedFilter);
    }
    if (activeTab === "requesting" || activeTab === "auto_closed") {
      list = sortClientApplications(list, listSort);
    }
    return list;
  }, [activeTab, applications, listSort, matchedFilter]);

  const runMatch = async (
    app: ClientApplication,
    quote: ClientQuote,
    selection: QuoteMatchPriceSelection,
  ) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/client/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: app.id,
          receipt_number: app.receipt_number,
          phone: app.phone,
          action: "final_confirm",
          quote_id: quote.id,
          quote_source: quote.source,
          selected_price_type: selection.selected_price_type,
          selected_price_label: selection.selected_price_label,
          selected_price: selection.selected_price,
          price_selection_kind: selectedPriceTypeToLegacyKind(selection.selected_price_type),
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
      if (json.application) {
        const quotes = Array.isArray(json.quotes) ? json.quotes : [];
        setApplications((prev) =>
          prev.map((item) =>
            item.id === json.application?.id
              ? normalizeClientApplicationFromApi({ ...json.application!, quotes })
              : item,
          ),
        );
        setActiveTab("matched");
        setMatchedFilter("in_progress");
        setExpandedId(json.application.id);
      }
      setMessage("매칭이 완료되었습니다. 기사·업체 연락처가 공개됩니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f8fb] px-4 py-8 pb-16">
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          지원금 전세버스
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
          {CLIENT_DASHBOARD_TITLE}
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          휴대폰번호와 견적 조회용 간단 비밀번호로 신청서를 확인합니다.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={lookupPhone}
            onChange={(e) => setLookupPhone(e.target.value)}
            placeholder="휴대폰번호"
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={lookupPassword}
            onChange={(e) => setLookupPassword(e.target.value)}
            placeholder="견적 조회용 간단 비밀번호"
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadApplications()}
          disabled={loading || lookupPhone.trim() === "" || lookupPassword.trim().length < 4}
          className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
          style={tapStyle}
        >
          {loading ? LABEL.loading : LABEL.lookup}
        </button>
        <button
          type="button"
          onClick={() => setShowReceiptLookup((p) => !p)}
          className="mt-2 text-sm font-black text-blue-700"
        >
          {showReceiptLookup ? "신청번호 조회 닫기" : LABEL.receiptLookup}
        </button>
        {showReceiptLookup ? (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="신청번호"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="휴대폰번호"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadByReceipt()}
              disabled={loading || !receiptNumber.trim() || !phone.trim()}
              className="mt-2 min-h-10 w-full rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-50"
            >
              신청번호로 조회
            </button>
          </div>
        ) : null}

        {applications.length > 0 ? (
          <p className="mt-3 text-xs font-bold text-slate-500">
            {realtimeStatusLabel(realtimeStatus)}
          </p>
        ) : null}

        {message ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
            {message}
          </p>
        ) : null}

        {applications.length > 0 ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {CLIENT_MAIN_TABS.map((tab) => {
                const count =
                  tab.id === "requesting"
                    ? tabCounts.requesting
                    : tab.id === "auto_closed"
                      ? tabCounts.autoClosed
                      : tabCounts.matched;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl px-3 text-xs font-black sm:text-sm ${
                      activeTab === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                    style={tapStyle}
                  >
                    {labelWithCount(tab.label, count)}
                  </button>
                );
              })}
            </div>

            {activeTab === "matched" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {MATCHED_RUN_FILTERS.map((f) => {
                  const count =
                    f.id === "in_progress"
                      ? tabCounts.matchedInProgress
                      : tabCounts.matchedCompleted;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMatchedFilter(f.id)}
                      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-black ${
                        matchedFilter === f.id
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-700"
                      }`}
                      style={tapStyle}
                    >
                      {labelWithCount(f.label, count)}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {(activeTab === "requesting" || activeTab === "auto_closed") && (
              <label className="mt-3 block">
                <span className="sr-only">정렬</span>
                <select
                  value={listSort}
                  onChange={(e) => setListSort(e.target.value as ClientListSort)}
                  className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800"
                >
                  {CLIENT_LIST_SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-4 space-y-3">
              {loading && filteredApplications.length === 0 ? (
                <p className="py-8 text-center text-sm font-bold text-slate-500">{LABEL.loading}</p>
              ) : null}
              {!loading && filteredApplications.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                  {LABEL.noItems}
                </p>
              ) : null}
              {filteredApplications.map((app) => (
                <ClientApplicationListItem
                  key={app.id}
                  application={app}
                  tab={activeTab}
                  expanded={expandedId === app.id}
                  onToggleExpand={() =>
                    setExpandedId((prev) => (prev === app.id ? null : app.id))
                  }
                  onMatch={(quote, selection) => void runMatch(app, quote, selection)}
                  busy={loading}
                  quoteSubmitPriceLines={quoteSubmitPriceLines}
                />
              ))}
            </div>
          </>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-800"
          style={tapStyle}
        >
          {LABEL.mainLink}
        </Link>
      </section>
    </main>
  );
}
