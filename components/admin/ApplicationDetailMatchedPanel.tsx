"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationDetailMatchedPanel.tsx
// 신청 상세 패널 (메인 컴포넌트)
// 인라인 UI 프리미티브/카드/폼은 각각 별도 파일로 분리됨:
//   - ApplicationDetailPrimitives.tsx (SectionCard, InfoGrid, ModalShell)
//   - ApplicationDetailQuoteCards.tsx (QuoteSupportDebugBlock, QuoteCardMember, QuoteCardGuest)
//   - ApplicationDetailForms.tsx (QuoteEditForm, SponsorEditForm)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  displayAdminApplicationType,
  formatAdminCreatedAt,
  formatAdminDateOnly,
  formatAdminDepartureDateTime,
  formatAdminWon,
  phoneDialHref,
  phoneSmsHref,
} from "@/components/admin/admin-detail-format";
import {
  isCustomerStageMatched,
  resolveCustomerStageBadge,
} from "@/lib/admin-progress-stage";
import { ApplicationDetailSkeleton, QuotesSectionSkeleton } from "@/components/admin/ApplicationDetailSkeleton";
import {
  loadAdminDetailBasic,
  loadAdminDetailDebug,
  loadAdminDetailQuotes,
  loadAdminDetailSms,
  loadAdminDetailSponsor,
  refreshAdminDetailCache,
  refreshAdminDetailQuotesCache,
} from "@/lib/admin-detail-api-client";
import { sanitizeOperationalError } from "@/lib/operational-error-message";
import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";
import { createAdminBrowserClient } from "@/lib/supabase";
import type {
  AdminApplicationDetailBasicPayload,
  AdminApplicationDetailQuotesPayload,
  AdminGuestQuoteCard,
  AdminMemberQuoteCard,
  AdminSmsLog,
  AdminSponsorDetail,
} from "@/lib/admin-application-detail-build";
import {
  InfoGrid,
  ModalShell,
  SectionCard,
} from "@/components/admin/ApplicationDetailPrimitives";
import {
  QuoteCardGuest,
  QuoteCardMember,
} from "@/components/admin/ApplicationDetailQuoteCards";
import {
  QuoteEditForm,
  SponsorEditForm,
} from "@/components/admin/ApplicationDetailForms";

type ListRow = {
  id: string;
  created_at: string | null;
  receipt_number: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_detail: string;
  departure_region: string;
  destination: string;
  destination_detail: string;
  stopovers: string[];
  departure_date: string | null;
  departure_time: string;
  return_date: string | null;
  passenger_count: number | null;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string;
  request_message: string;
  file_url: string;
  file_name: string;
  attachment_url: string;
  admin_memo: string;
  status: string;
  final_selected_quote_id: string;
  quote_status: string;
};

type ApplicationStatusValue = "pending" | "reviewing" | "approved" | "rejected";

export function ApplicationDetailMatchedPanel({
  row,
  onOpenSms,
  onStatusSaved,
  onApplicationHidden,
  lifecycleTools,
}: {
  row: ListRow;
  onOpenSms: (row: ListRow) => void;
  onStatusSaved: (
    applicationId: string,
    nextStatus: ApplicationStatusValue,
    nextMemo: string,
  ) => void;
  onApplicationHidden?: () => void;
  lifecycleTools?: React.ReactNode;
}) {
  const [basic, setBasic] = useState<AdminApplicationDetailBasicPayload | null>(null);
  const [quotesPayload, setQuotesPayload] = useState<AdminApplicationDetailQuotesPayload | null>(
    null,
  );
  const [sponsorDetail, setSponsorDetail] = useState<AdminSponsorDetail | null | undefined>(
    undefined,
  );
  const [smsLogs, setSmsLogs] = useState<AdminSmsLog[] | null>(null);
  const [debugRaw, setDebugRaw] = useState<unknown>(null);
  const [loadingBasic, setLoadingBasic] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingSponsor, setLoadingSponsor] = useState(false);
  const [loadingSms, setLoadingSms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [basicWarnings, setBasicWarnings] = useState<string[]>([]);

  const reportError = useCallback((e: unknown, fallback: string) => {
    const raw = e instanceof Error ? e.message : fallback;
    setError(sanitizeOperationalError(raw, fallback));
  }, []);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [smsLogOpen, setSmsLogOpen] = useState(false);
  const [sponsorInfoOpen, setSponsorInfoOpen] = useState(false);
  const [sponsorEditMode, setSponsorEditMode] = useState(false);
  const [sponsorEditBusy, setSponsorEditBusy] = useState(false);
  const [editQuote, setEditQuote] = useState<AdminMemberQuoteCard | AdminGuestQuoteCard | null>(
    null,
  );
  const [editQuoteKind, setEditQuoteKind] = useState<"member" | "guest">("member");
  const [editBusy, setEditBusy] = useState(false);
  const [adminMemo, setAdminMemo] = useState(row.admin_memo);
  const [memoBusy, setMemoBusy] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);

  const loadBasic = useCallback(
    async (force = false) => {
      if (!row.id) return;
      setLoadingBasic(true);
      setError(null);
      try {
        const payload = await loadAdminDetailBasic(row.id, { force });
        setBasicWarnings(payload.warnings ?? []);
        setBasic({
          ...payload,
          application: { ...payload.application, admin_memo: row.admin_memo },
        });
        if (payload.sponsor !== undefined) {
          setSponsorDetail(payload.sponsor ?? null);
        }
      } catch (e) {
        reportError(e, "상세 정보를 불러오지 못했습니다.");
        setBasic(null);
      } finally {
        setLoadingBasic(false);
      }
    },
    [row.id, row.admin_memo, reportError],
  );

  const loadQuotes = useCallback(
    async (force = false) => {
      if (!row.id) return;
      setLoadingQuotes(true);
      setQuoteWarning(null);
      try {
        const quotes = await loadAdminDetailQuotes(row.id, { force });
        setQuotesPayload(quotes);
        if (quotes.warnings && quotes.warnings.length > 0) {
          setQuoteWarning(quotes.warnings[0] ?? "견적 데이터를 불러오는 중 문제가 발생했습니다.");
        }
      } catch (e) {
        reportError(e, "견적 데이터를 불러오는 중 문제가 발생했습니다.");
      } finally {
        setLoadingQuotes(false);
      }
    },
    [row.id, reportError],
  );

  useEffect(() => {
    if (!isQuoteDebugEnabled() || !row.id) return;
    void loadAdminDetailDebug(row.id).then(setDebugRaw).catch(() => setDebugRaw(null));
  }, [row.id]);

  const refreshAll = useCallback(() => {
    refreshAdminDetailCache(row.id);
    setQuotesPayload(null);
    setQuoteWarning(null);
    setBasicWarnings([]);
    setSponsorDetail(undefined);
    setSmsLogs(null);
    setDebugRaw(null);
    void loadBasic(true);
    if (quotesOpen) void loadQuotes(true);
  }, [row.id, quotesOpen, loadBasic, loadQuotes]);

  useEffect(() => {
    void loadBasic(false);
  }, [loadBasic]);

  useEffect(() => {
    if (!quotesOpen || quotesPayload) return;
    void loadQuotes(false);
  }, [quotesOpen, quotesPayload, loadQuotes]);

  useEffect(() => {
    if (!sponsorInfoOpen || sponsorDetail !== undefined) return;
    setLoadingSponsor(true);
    void loadAdminDetailSponsor(row.id)
      .then(setSponsorDetail)
      .catch((e) => reportError(e, "후원 정보를 불러오지 못했습니다."))
      .finally(() => setLoadingSponsor(false));
  }, [sponsorInfoOpen, sponsorDetail, row.id]);

  useEffect(() => {
    if (!smsLogOpen || smsLogs) return;
    setLoadingSms(true);
    void loadAdminDetailSms(row.id)
      .then(setSmsLogs)
      .catch((e) => reportError(e, "문자 로그를 불러오지 못했습니다."))
      .finally(() => setLoadingSms(false));
  }, [smsLogOpen, smsLogs, row.id]);

  const app = basic?.application ?? {};
  const lifecycle = basic?.application ?? {};
  const customerStageBadge = resolveCustomerStageBadge({
    quoteStatus: String(app.quote_status ?? ""),
    finalSelectedQuoteId: String(lifecycle.final_selected_quote_id ?? ""),
  });
  const customerMatched = isCustomerStageMatched({
    quoteStatus: String(app.quote_status ?? ""),
    finalSelectedQuoteId: String(lifecycle.final_selected_quote_id ?? ""),
  });
  const sponsorStageBadge = basic?.sponsor_stage.support_stage_badge ?? "없음";
  const hasSponsor = basic?.sponsor_stage.has_sponsor ?? false;

  const deadlineLine = useMemo(() => {
    const deadline = String(app.quote_deadline_at ?? "").trim();
    const normal = app.target_normal_price as number | null | undefined;
    const member = app.target_member_price as number | null | undefined;
    return {
      deadline: deadline ? formatAdminCreatedAt(deadline) : "—",
      normal: formatAdminWon(normal ?? null),
      member: formatAdminWon(member ?? null),
    };
  }, [app]);

  const customerPhone = String(app.customer_phone ?? app.phone ?? row.phone ?? "").trim();

  const saveMemo = async () => {
    setMemoBusy(true);
    setError(null);
    try {
      const supabase = createAdminBrowserClient();
      const { error: updateError } = await supabase
        .from("applications")
        .update({ admin_memo: adminMemo })
        .eq("id", row.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      onStatusSaved(row.id, row.status as ApplicationStatusValue, adminMemo);
    } catch {
      setError("관리자 메모 저장에 실패했습니다.");
    } finally {
      setMemoBusy(false);
    }
  };

  const hideApplication = async () => {
    if (customerMatched) return;
    setHideBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: row.id,
          hide_application: true,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "견적 숨김 처리에 실패했습니다.");
        return;
      }
      onApplicationHidden?.();
    } catch {
      setError("견적 숨김 처리에 실패했습니다.");
    } finally {
      setHideBusy(false);
    }
  };

  const saveSponsorPatch = async (patch: Record<string, unknown>) => {
    if (!sponsorDetail?.preapproval_id) return;
    setSponsorEditBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sponsor-preapprovals/edit", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preapproval_id: sponsorDetail.preapproval_id,
          ...patch,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "스폰서 정보 저장에 실패했습니다.");
        return;
      }
      setSponsorEditMode(false);
      setSponsorDetail(undefined);
      refreshAdminDetailCache(row.id);
      void loadBasic(true);
      if (quotesOpen) void loadQuotes(true);
    } catch {
      setError("스폰서 정보 저장에 실패했습니다.");
    } finally {
      setSponsorEditBusy(false);
    }
  };

  const saveQuotePatch = async (patch: Record<string, unknown>) => {
    if (!editQuote) return;
    setEditBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/driver-quotes", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: editQuote.id,
          quote_kind: editQuoteKind,
          quote_patch: patch,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "견적 저장에 실패했습니다.");
        return;
      }
      setEditQuote(null);
      refreshAdminDetailQuotesCache(row.id);
      void loadQuotes(true);
    } catch {
      setError("견적 저장에 실패했습니다.");
    } finally {
      setEditBusy(false);
    }
  };

  if (error && !basic && !loadingBasic) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {error}
      </p>
    );
  }

  if (loadingBasic || !basic) {
    return <ApplicationDetailSkeleton />;
  }

  const attachments = (app.attachments ?? {}) as Record<string, string>;
  const fileUrl = attachments.file_url || row.file_url;
  const stopovers = Array.isArray(app.stopovers)
    ? (app.stopovers as string[])
    : row.stopovers;

  const matchedDriver = basic.matched_driver;
  const quoteSummary = quotesPayload?.quote_summary;
  const memberQuotes = quotesPayload?.member_quotes ?? [];
  const guestQuotes = quotesPayload?.guest_quotes ?? [];

  return (
    <div className="space-y-4 pb-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => refreshAll()}
          disabled={loadingBasic || loadingQuotes}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-800 disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {error ? (
        <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {error}
        </p>
      ) : null}
      {basicWarnings.length > 0 ? (
        <p className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {isQuoteDebugEnabled()
            ? basicWarnings.join("\n")
            : "일부 상세 정보를 불러오지 못했습니다."}
        </p>
      ) : null}

      <SectionCard title="1. 신청 기본정보">
        <InfoGrid
          items={[
            { label: "신청일시", value: formatAdminCreatedAt(row.created_at) },
            { label: "접수번호", value: <span className="font-mono">{row.receipt_number}</span> },
            { label: "신청유형", value: displayAdminApplicationType(row.application_type) },
            { label: "운행", value: row.trip_type },
            { label: "등급", value: row.bus_grade },
            { label: "출발지역", value: row.departure_region || "—" },
            { label: "출발지", value: row.departure },
            {
              label: "경유지",
              value: stopovers.length > 0 ? stopovers.join(", ") : "—",
            },
            { label: "도착지", value: row.destination },
            {
              label: "출발일시",
              value: formatAdminDepartureDateTime(row.departure_date, row.departure_time),
            },
            { label: "오는 날짜", value: formatAdminDateOnly(row.return_date) },
            { label: "인원수", value: row.passenger_count ?? "—" },
            {
              label: "마감조건",
              value: (
                <div className="space-y-0.5 text-xs">
                  <p>마감: {deadlineLine.deadline}</p>
                  <p>희망 일반견적가: {deadlineLine.normal}</p>
                  <p>희망 할인가: {deadlineLine.member}</p>
                </div>
              ),
            },
            {
              label: "신청자명",
              value: String(app.customer_name ?? row.applicant_name),
            },
            {
              label: "연락처",
              value: (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{customerPhone || "—"}</span>
                  {customerPhone ? (
                    <>
                      <a
                        href={phoneDialHref(customerPhone)}
                        className="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-black text-white"
                      >
                        전화하기
                      </a>
                      <a
                        href={phoneSmsHref(customerPhone)}
                        className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-black text-white"
                      >
                        문자하기
                      </a>
                    </>
                  ) : null}
                </div>
              ),
            },
            { label: "단체명", value: row.organization_name },
            { label: "단체유형", value: row.organization_type },
            {
              label: "고객메모",
              value: (
                <span className="whitespace-pre-wrap text-xs">
                  {row.request_message === "—" ? "—" : row.request_message}
                </span>
              ),
            },
            {
              label: "첨부파일",
              value: fileUrl ? (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 underline"
                >
                  {attachments.file_name || row.file_name || "첨부파일 보기"}
                </a>
              ) : (
                "—"
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="2. 진행 상태">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-xs font-black text-blue-900">고객단계</p>
            <p className="mt-2">
              <span className="inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
                {customerStageBadge}
              </span>
            </p>
            <button
              type="button"
              disabled={customerMatched || hideBusy}
              onClick={() => void hideApplication()}
              title={
                customerMatched
                  ? "매칭완료 단계에서는 숨김할 수 없습니다."
                  : "모든 대시보드에서 이 견적요청을 숨깁니다."
              }
              className="mt-3 rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-blue-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hideBusy ? "처리 중…" : "견적 숨김"}
            </button>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-xs font-black text-violet-900">스폰서단계</p>
            <p className="mt-2">
              <span className="inline-flex rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">
                {sponsorStageBadge}
              </span>
            </p>
            {hasSponsor ? (
              <button
                type="button"
                onClick={() => setSponsorInfoOpen(true)}
                className="mt-3 rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-violet-900"
              >
                후원업체 정보
              </button>
            ) : null}
          </div>
        </div>
        {lifecycleTools ? <div className="mt-3 border-t border-slate-100 pt-3">{lifecycleTools}</div> : null}
      </SectionCard>

      <SectionCard title="3. 관리자 메모">
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="관리자 내부 메모"
        />
        <button
          type="button"
          disabled={memoBusy}
          onClick={() => void saveMemo()}
          className="mt-2 h-10 rounded-xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-50"
        >
          저장
        </button>
      </SectionCard>

      <SectionCard
        title="4. 매칭기사"
        className={matchedDriver ? "ring-2 ring-emerald-200" : ""}
      >
        {matchedDriver ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-base font-black text-slate-950">{matchedDriver.company_name}</p>
                <p className="text-sm font-semibold text-slate-700">{matchedDriver.driver_name}</p>
                <p className="mt-1 text-sm">{matchedDriver.phone}</p>
              </div>
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                {matchedDriver.badge}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={phoneDialHref(matchedDriver.phone)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white"
              >
                전화하기
              </a>
              <a
                href={phoneSmsHref(matchedDriver.phone)}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"
              >
                문자하기
              </a>
            </div>
            <p className="mt-3 text-sm font-bold text-emerald-900">
              선택 견적: {matchedDriver.selected_price_label}{" "}
              {formatAdminWon(matchedDriver.selected_price)}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">아직 매칭된 기사가 없습니다.</p>
        )}
      </SectionCard>

      <SectionCard title="5. 견적종합">
        <button
          type="button"
          onClick={() => setQuotesOpen((v) => !v)}
          className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 text-sm font-black text-slate-900"
        >
          {quotesOpen ? "견적종합 접기" : "견적종합 보기"}
        </button>
        {quotesOpen ? (
          loadingQuotes || !quotesPayload ? (
            <QuotesSectionSkeleton />
          ) : memberQuotes.length === 0 && guestQuotes.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              아직 제출된 견적이 없습니다.
            </p>
          ) : (
          <div className="mt-4 space-y-4">
            {quoteWarning ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                {quoteWarning}
              </p>
            ) : null}
            {quoteSummary ? (
            <InfoGrid
              items={[
                {
                  label: "제휴기사 신청",
                  value: `${quoteSummary.member_quote_count}건`,
                },
                {
                  label: "일반기사 신청",
                  value: `${quoteSummary.guest_quote_count}건`,
                },
                {
                  label: "평균 일반견적가",
                  value: formatAdminWon(quoteSummary.avg_normal_price),
                },
                {
                  label: "평균 예상 지원금",
                  value: formatAdminWon(quoteSummary.avg_estimated_support),
                },
                {
                  label: "평균 확정 지원금",
                  value: formatAdminWon(quoteSummary.avg_approved_support),
                },
                {
                  label: "연장회차",
                  value: String(quoteSummary.extension_round),
                },
              ]}
            />
            ) : null}
            <div>
              <p className="mb-2 text-xs font-black text-slate-700">5-1. 제휴기사 견적</p>
              <div className="space-y-3">
                {memberQuotes.map((q) => (
                  <QuoteCardMember
                    key={q.id}
                    quote={q}
                    showSupportDetails
                    onEdit={() => {
                      setEditQuoteKind("member");
                      setEditQuote(q);
                    }}
                    onSms={() =>
                      onOpenSms({
                        ...row,
                        applicant_name: q.driver_name,
                        phone: q.phone,
                      })
                    }
                    onSponsorInfo={() => setSponsorInfoOpen(true)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-black text-slate-700">5-2. 일반기사 견적</p>
              <div className="space-y-3">
                {guestQuotes.map((q) => (
                  <QuoteCardGuest
                    key={q.id}
                    quote={q}
                    onEdit={() => {
                      setEditQuoteKind("guest");
                      setEditQuote(q);
                    }}
                    onSms={() =>
                      onOpenSms({
                        ...row,
                        applicant_name: q.driver_name,
                        phone: q.phone,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          )
        ) : null}
      </SectionCard>

      <SectionCard title="6. 문자발송 로그">
        <button
          type="button"
          onClick={() => setSmsLogOpen(true)}
          className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-black"
        >
          문자발송 로그 보기
          {smsLogs ? ` (${smsLogs.length}건)` : ""}
        </button>
      </SectionCard>

      {isQuoteDebugEnabled() && debugRaw ? (
        <SectionCard title="디버그 RAW">
          <pre className="max-h-64 overflow-auto text-[10px]">
            {JSON.stringify(debugRaw, null, 2)}
          </pre>
        </SectionCard>
      ) : null}

      <ModalShell
        title="후원업체 정보"
        open={sponsorInfoOpen}
        onClose={() => {
          setSponsorInfoOpen(false);
          setSponsorEditMode(false);
        }}
      >
        {loadingSponsor ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : sponsorDetail ? (
          sponsorEditMode ? (
            <SponsorEditForm
              detail={sponsorDetail}
              busy={sponsorEditBusy}
              onSave={(patch) => void saveSponsorPatch(patch)}
              onCancel={() => setSponsorEditMode(false)}
            />
          ) : (
            <>
              <InfoGrid
                items={[
                  { label: "업체명", value: sponsorDetail.sponsor_company_name },
                  { label: "지원단계", value: sponsorDetail.support_stage_badge },
                  { label: "지원종류", value: sponsorDetail.support_kind || "—" },
                  { label: "지원조건", value: sponsorDetail.support_condition || "—" },
                  { label: "지원유형", value: sponsorDetail.support_type || "—" },
                  {
                    label: "예상 지원금",
                    value: formatAdminWon(sponsorDetail.estimated_support_amount),
                  },
                  {
                    label: "확정 지원금",
                    value: formatAdminWon(sponsorDetail.approved_support_amount),
                  },
                  {
                    label: "확정 지원금 결정일시",
                    value: formatAdminCreatedAt(sponsorDetail.approved_at || null),
                  },
                  { label: "담당자", value: sponsorDetail.assigned_staff_name || "—" },
                  { label: "담당자 전화", value: sponsorDetail.assigned_staff_phone || "—" },
                ]}
              />
              <button
                type="button"
                onClick={() => setSponsorEditMode(true)}
                className="mt-4 w-full rounded-xl border border-violet-300 bg-violet-50 py-2 text-sm font-black text-violet-900"
              >
                스폰서 정보 수정
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-slate-500">연결된 스폰서 후원이 없습니다.</p>
        )}
      </ModalShell>

      <ModalShell title="문자발송 로그" open={smsLogOpen} onClose={() => setSmsLogOpen(false)}>
        {loadingSms ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {!smsLogs || smsLogs.length === 0 ? (
            <li className="text-sm text-slate-500">로그 없음</li>
          ) : (
            smsLogs.map((log, i) => (
              <li key={`${log.sent_at}-${i}`} className="rounded-lg border border-slate-200 p-2 text-xs">
                <p className="font-bold">{log.type}</p>
                <p>
                  {log.target_role} · {log.target_name} · {log.target_phone}
                </p>
                <p>
                  {log.status} · {formatAdminCreatedAt(log.sent_at)}
                </p>
                {log.error ? <p className="text-red-600">{log.error}</p> : null}
              </li>
            ))
          )}
        </ul>
        )}
      </ModalShell>

      <ModalShell
        title="견적 관리자수정"
        open={editQuote != null}
        onClose={() => setEditQuote(null)}
      >
        {editQuote ? (
          <QuoteEditForm
            quote={editQuote}
            kind={editQuoteKind}
            busy={editBusy}
            onSave={(patch) => void saveQuotePatch(patch)}
          />
        ) : null}
      </ModalShell>
    </div>
  );
}
