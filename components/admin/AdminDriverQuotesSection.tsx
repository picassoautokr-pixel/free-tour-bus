"use client";

import { useCallback, useEffect, useState } from "react";
import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import {
  formatSupportAmount,
  formatSupportAmountFromBreakdown,
} from "@/lib/support-calculation";
import { useSupabaseRealtimeRefresh } from "@/hooks/useSupabaseRealtimeRefresh";
import type {
  ApplicationDetail,
  ApplicationQuoteLifecycle,
  DriverQuoteDetail,
  GuestDriverQuoteDetail,
  NotificationLogDetail,
} from "./admin-types";
import { isPersistableApplicationId, formatCreatedAt } from "./admin-page-utils";

export function AdminDriverQuotesSection({
  applicationId,
  applicationDetail,
}: {
  applicationId: string;
  applicationDetail: ApplicationDetail;
}) {
  const [quotes, setQuotes] = useState<DriverQuoteDetail[]>([]);
  const [guestQuotes, setGuestQuotes] = useState<GuestDriverQuoteDetail[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLogDetail[]>([]);
  const [application, setApplication] = useState<ApplicationQuoteLifecycle | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestBusyId, setGuestBusyId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    if (!isPersistableApplicationId(applicationId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/driver-quotes?application_id=${encodeURIComponent(applicationId)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as {
        error?: string;
        application?: ApplicationQuoteLifecycle | null;
        quotes?: DriverQuoteDetail[];
        guest_quotes?: GuestDriverQuoteDetail[];
        notification_logs?: NotificationLogDetail[];
      };
      if (!res.ok) {
        console.error("[admin] driver quotes api error", json.error);
        setError(json.error ?? "견적 목록을 불러오지 못했습니다.");
        setApplication(null);
        setQuotes([]);
        setGuestQuotes([]);
        setNotificationLogs([]);
        return;
      }
      setApplication(json.application ?? null);
      setQuotes(Array.isArray(json.quotes) ? json.quotes : []);
      setGuestQuotes(Array.isArray(json.guest_quotes) ? json.guest_quotes : []);
      setNotificationLogs(
        Array.isArray(json.notification_logs) ? json.notification_logs : [],
      );
    } catch (e) {
      console.error("[admin] failed to load driver quotes", e);
      setError("견적 정보를 불러오지 못했습니다.");
      setQuotes([]);
      setGuestQuotes([]);
      setApplication(null);
      setNotificationLogs([]);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  const updateGuestResult = async (
    quote: GuestDriverQuoteDetail,
    matchResult: string,
  ) => {
    setGuestBusyId(quote.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_quote_id: quote.id,
          match_result: matchResult,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "비회원 견적 상태 저장에 실패했습니다.");
        return;
      }
      void loadQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuestBusyId(null);
    }
  };

  const runApplicationAction = async (
    action: "final_confirm" | "reopen" | "manual_close",
  ) => {
    setActionBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "자동마감 상태 변경에 실패했습니다.");
        return;
      }
      void loadQuotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  useSupabaseRealtimeRefresh({
    channelName: `admin-driver-quotes-${applicationId}`,
    tables: ["applications", "driver_quotes", "guest_driver_quotes", "notification_logs"],
    enabled: isPersistableApplicationId(applicationId),
    debounceMs: 800,
    onRefresh: loadQuotes,
  });

  return (
    <section className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm ring-1 ring-indigo-100/80">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
            기사 견적
          </p>
          <p className="mt-1 text-xs font-medium text-indigo-950/70">
            {applicationDetail.applicant_name}님의 신청에 제출된 회원/비회원 기사
            견적을 관리자만 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadQuotes()}
          disabled={loading}
          className="h-9 shrink-0 rounded-xl border border-indigo-200 bg-white px-3 text-xs font-black text-indigo-950 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {loading ? "조회 중…" : "새로고침"}
        </button>
      </div>

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-relaxed text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {application ? (
        <div className="mt-3 rounded-xl border border-white bg-white p-3 shadow-sm ring-1 ring-indigo-100">
          <QuoteStatusSummary
            quoteStatus={application.quote_status}
            quoteDeadlineAt={application.quote_deadline_at}
            autoFinalConfirmAt={application.auto_final_confirm_at}
            quoteClosedReason={application.quote_closed_reason}
            quoteCount={quotes.length + guestQuotes.length}
            quoteLimitCount={application.quote_limit_count}
            targetNormalPrice={application.target_normal_price}
            targetMemberPrice={application.target_member_price}
            compact
          />
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-6">
            <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
              <p className="font-bold text-blue-500">후원 가승인 수</p>
              <p className="mt-1 font-black text-blue-950">
                {application.sponsor_preapproved_count ?? 0}건
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
              <p className="font-bold text-emerald-600">승인 수</p>
              <p className="mt-1 font-black text-emerald-950">
                {application.sponsor_approved_count ?? 0}건
              </p>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 ring-1 ring-indigo-100">
              <p className="font-bold text-indigo-600">승인 지원금 합계</p>
              <p className="mt-1 font-black text-indigo-950">
                {((application.sponsor_approved_support_amount ?? 0)).toLocaleString("ko-KR")}원
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <p className="font-bold text-slate-500">지원금 상태</p>
              <p className="mt-1 font-black text-slate-950">
                {application.sponsor_support_status ?? "none"}
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
              <p className="font-bold text-blue-500">지원금 적용 견적</p>
              <p className="mt-1 font-black text-blue-950">
                {quotes.filter((quote) => quote.sponsor_quote_enabled).length}건
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
              <p className="font-bold text-emerald-600">최종 지원금 적용가</p>
              <p className="mt-1 font-black text-emerald-950">
                {(() => {
                  const selected = quotes.find((quote) => quote.id === application.final_selected_quote_id);
                  const value =
                    selected?.final_member_price ??
                    selected?.member_price ??
                    selected?.sponsor_discounted_price ??
                    null;
                  return value == null ? "—" : `${value.toLocaleString("ko-KR")}원`;
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-indigo-950">지원금 가승인 상태</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {application.quote_status}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                현재 회차 {application.extension_round}회 · 자동연장{" "}
                {application.extension_round}회 · 지원금 상태{" "}
                {application.final_selected_quote_id ? "가승인 후보 있음" : "검토중"}
              </p>
            </div>
            <div className="text-right text-xs font-semibold text-slate-600">
              <p>마감: {formatCreatedAt(application.quote_closed_at || null)}</p>
              <p>매칭확정: {formatCreatedAt(application.final_selected_at || null)}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-indigo-50 p-2">
              <dt className="font-bold text-indigo-500">자동확정 기사</dt>
              <dd className="mt-1 break-all font-semibold text-indigo-950">
                {application.auto_selected_quote_id || "—"}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="font-bold text-slate-400">마감조건</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {application.quote_limit_count != null
                  ? `${application.quote_limit_count}건`
                  : "수량 미설정"}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <dt className="font-bold text-slate-400">목표가</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                {application.target_normal_price != null
                  ? `${application.target_normal_price.toLocaleString("ko-KR")}원`
                  : "—"}
              </dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-2">
              <dt className="font-bold text-amber-600">고객 감사지원금</dt>
              <dd className="mt-1 font-semibold text-amber-900">
                {application.client_reward_amount.toLocaleString("ko-KR")}원 (
                {application.support_client_reward_ratio}%)
              </dd>
            </div>
            <div className="rounded-lg bg-blue-50 p-2">
              <dt className="font-bold text-blue-600">기사 지원금</dt>
              <dd className="mt-1 font-semibold text-blue-900">
                {application.driver_support_amount.toLocaleString("ko-KR")}원 (
                {application.support_driver_ratio}%)
              </dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2">
              <dt className="font-bold text-emerald-600">연락처 공개</dt>
              <dd className="mt-1 font-semibold text-emerald-900">
                {application.contact_revealed_at ? "공개됨" : "대기"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs font-black text-emerald-950">
              지원금 가승인 관리
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">후원업체 검토</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {application.quote_status === "collecting" ? "견적 수집중" : "가승인 검토"}
                </dd>
              </div>
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">클라이언트 혜택</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {application.client_reward_amount.toLocaleString("ko-KR")}원
                </dd>
              </div>
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">기사 지원</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {application.driver_support_amount.toLocaleString("ko-KR")}원
                </dd>
              </div>
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">매칭 상태</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {application.final_selected_quote_id ? "확정 후보 있음" : "후보 대기"}
                </dd>
              </div>
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">연락처 공개</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {application.contact_revealed_at ? "공개됨" : "확정 후 공개"}
                </dd>
              </div>
              <div className="rounded-lg bg-white p-2">
                <dt className="font-bold text-emerald-600">확정 시각</dt>
                <dd className="mt-1 font-semibold text-emerald-950">
                  {formatCreatedAt(application.final_selected_at || null)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={actionBusy != null || application.auto_selected_quote_id === ""}
              onClick={() => void runApplicationAction("final_confirm")}
              className="min-h-9 rounded-lg bg-slate-950 px-2 text-xs font-black text-white disabled:opacity-50"
            >
              {actionBusy === "final_confirm" ? "처리 중…" : "가승인 확정"}
            </button>
            <button
              type="button"
              disabled={actionBusy != null}
              onClick={() => void runApplicationAction("reopen")}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 disabled:opacity-50"
            >
              재오픈
            </button>
            <button
              type="button"
              disabled={actionBusy != null}
              onClick={() => void runApplicationAction("manual_close")}
              className="min-h-9 rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-black text-red-800 disabled:opacity-50"
            >
              수동 마감
            </button>
          </div>
          {application.final_selected_at ? (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-900">
              지원금 가승인이 확정되어 클라이언트와 기사에게 매칭 상태가 안내됩니다.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <p className="text-xs font-black text-slate-900">문자 발송 로그</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          상태 변화에 따라 자동 발송된 고객/기사 안내 내역입니다.
        </p>
        {notificationLogs.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
            발송 로그가 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {notificationLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-slate-900">
                    {log.notification_type}
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 font-bold text-slate-600 ring-1 ring-slate-200">
                      {log.status}
                    </span>
                  </p>
                  <p className="font-semibold text-slate-500">
                    {formatCreatedAt(log.sent_at || log.created_at)}
                  </p>
                </div>
                <p className="mt-1 font-semibold text-slate-700">
                  대상: {log.target_name || "—"} / {log.target_phone || "—"} (
                  {log.target_type || "—"})
                </p>
                {log.error ? (
                  <p className="mt-1 font-semibold text-red-700">
                    실패 사유: {log.error}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-3 space-y-3">
        {loading && quotes.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
            견적을 불러오는 중…
          </p>
        ) : quotes.length === 0 && guestQuotes.length === 0 ? (
          <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
            아직 제출된 견적이 없습니다.
          </p>
        ) : (
          <>
            <p className="text-xs font-black text-indigo-950">제휴기사 견적</p>
            {quotes.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
                회원 기사 견적이 없습니다.
              </p>
            ) : (
              quotes.map((quote) => (
                <article
                  key={quote.id}
                  className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {quote.company_name}
                        {quote.sponsor_quote_enabled ? (
                          <span className="ml-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-blue-100">
                            ⭐ 지원금 가능 기사
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {quote.manager_name} · {quote.phone}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-400">
                        견적 ID: {quote.id}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-black text-indigo-900">
                      {quote.price == null
                        ? "금액 미입력"
                        : `${quote.price.toLocaleString("ko-KR")}원`}
                      {/* NOTE: 어드민 견적 목록 미리보기는 support_breakdown 직접 렌더링 방식을 사용합니다.
                           buildQuoteSupportDisplayModel 기반 통합은 ApplicationDetailMatchedPanel과
                           인터페이스를 맞춘 후 별도 PR로 진행합니다. */}
                      {quote.support_breakdown?.sponsorQuoteEnabled ? (
                        <span className="mt-1 block text-xs font-bold text-blue-700">
                          {quote.support_breakdown.isConfirmed
                            ? `지원금 할인 적용가 ${formatSupportAmountFromBreakdown(
                                quote.support_breakdown,
                                quote.support_breakdown.finalDiscountAppliedPrice ??
                                  quote.support_breakdown.supportDiscountAppliedPrice,
                                "confirmed",
                              )}`
                            : `지원금 할인 예정가 ${formatSupportAmountFromBreakdown(
                                quote.support_breakdown,
                                quote.support_breakdown.supportDiscountPlannedPrice,
                                "planned",
                              )}`}
                        </span>
                      ) : quote.sponsor_quote_enabled ? (
                        <span className="mt-1 block text-xs font-bold text-blue-700">
                          지원금 할인 예정가 {formatSupportAmount(quote.member_price, { phase: "planned" })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {quote.support_breakdown ? (
                    <div>
                      <SupportQuoteBreakdown breakdown={quote.support_breakdown} />
                    </div>
                  ) : quote.sponsor_quote_enabled ? (
                    <p className="mt-3 text-xs font-bold text-red-700">계산 실패</p>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-bold text-slate-400">차량유형</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.vehicle_type}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">가능 출발시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.available_time}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">제출시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {formatCreatedAt(quote.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">상태</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.status}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">일반기사 견적 전환</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.converted_from_guest_quote_id?.trim()
                          ? `전환됨${
                              quote.converted_from_guest_price != null
                                ? ` · 기존 ${quote.converted_from_guest_price.toLocaleString("ko-KR")}원`
                                : ""
                            }`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-400">메모</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                      {quote.message.trim() === "" ? "—" : quote.message}
                    </p>
                  </div>
                </article>
              ))
            )}

            <p className="pt-2 text-xs font-black text-indigo-950">비회원 견적</p>
            {guestQuotes.length === 0 ? (
              <p className="rounded-xl bg-white px-3 py-4 text-center text-sm font-semibold text-slate-500 ring-1 ring-indigo-100">
                비회원 견적이 없습니다.
              </p>
            ) : (
              guestQuotes.map((quote) => (
                <article
                  key={quote.id}
                  className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {quote.guest_company_name}
                        <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                          일반 견적
                        </span>
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {quote.guest_driver_name} · {quote.guest_phone}
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-400">
                        견적 ID: {quote.id}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-black text-amber-900">
                      {quote.price == null
                        ? "금액 미입력"
                        : `${quote.price.toLocaleString("ko-KR")}원`}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-bold text-slate-400">차량유형</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.vehicle_type}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">가능시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.available_time}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">제출시간</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {formatCreatedAt(quote.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">매칭결과</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.match_result}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">회원전환 여부</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">
                        {quote.linked_partner_driver_id?.trim()
                          ? `전환됨 · ${quote.linked_partner_driver_id}`
                          : quote.member_converted
                            ? "전환됨"
                            : "미전환"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-400">추천토큰</dt>
                      <dd className="mt-0.5 break-all font-mono text-[11px] font-semibold text-slate-800">
                        {quote.referral_token || "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-400">메모</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                      {quote.message.trim() === "" ? "—" : quote.message}
                    </p>
                  </div>
                  {quote.result_sms_error.trim() !== "" ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      결과 문자 오류: {quote.result_sms_error}
                    </p>
                  ) : quote.result_notified_at.trim() !== "" ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                      결과 문자 발송: {formatCreatedAt(quote.result_notified_at)}
                    </p>
                  ) : null}
                  {quote.member_converted ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                      <p className="font-black">
                        {quote.converted_to_member_quote_id?.trim()
                          ? "회원 견적으로 전환됨"
                          : "회원 전환됨"}
                      </p>
                      <p className="mt-1">
                        연결 기사:{" "}
                        {quote.linked_partner_company?.trim() || "—"}{" "}
                        /{" "}
                        {quote.linked_partner_phone?.trim() || "—"}
                      </p>
                      {quote.converted_at?.trim() ? (
                        <p className="mt-1">
                          전환시각: {formatCreatedAt(quote.converted_at)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {["pending", "selected", "not_selected"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={guestBusyId === quote.id}
                        onClick={() => void updateGuestResult(quote, status)}
                        className="min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-800 disabled:opacity-50"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
}
