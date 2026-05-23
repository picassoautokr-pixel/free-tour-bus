"use client";

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
  AdminMemberQuoteDebug,
  AdminSmsLog,
  AdminSponsorDetail,
} from "@/lib/admin-application-detail-build";
import { isApplicationMatchCompleted } from "@/lib/admin-application-detail-build";

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

function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100 ${className}`}
    >
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InfoGrid({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModalShell({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-base font-black text-slate-950">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function QuoteSupportDebugBlock({ debug }: { debug: AdminMemberQuoteDebug }) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-amber-200 bg-amber-50/80 p-2 text-[10px] text-amber-950">
      <p className="font-black">계산 상태 (DEBUG)</p>
      <ul className="mt-1 space-y-0.5 font-mono">
        <li>support_breakdown: {debug.has_support_breakdown ? "있음" : "없음"}</li>
        <li>planned_total_support (resolved): {debug.planned_total_support ?? "—"}</li>
        <li>confirmed_total_support (resolved): {debug.confirmed_total_support ?? "—"}</li>
        <li>resolved_discount_price: {debug.resolved_discount_price ?? "—"}</li>
        <li>
          confirmed_customer_support_source: {debug.confirmed_customer_support_source ?? "—"}
        </li>
        <li>
          confirmed_customer_support_formula:{" "}
          {debug.confirmed_customer_support_formula ?? "—"}
        </li>
        <li>
          derived_preview: {debug.confirmed_customer_support_derived_preview ?? "—"}
        </li>
        <li>confirmed_driver_support: {debug.confirmed_driver_support ?? "—"}</li>
        <li>calculation_status: {debug.calculation_status}</li>
        <li>failed_reason: {debug.failed_reason ?? "—"}</li>
        <li>calculation_error: {debug.calculation_error ?? "—"}</li>
        <li>missing_required_fields: {JSON.stringify(debug.missing_required_fields)}</li>
        <li>missing_snapshot_fields: {JSON.stringify(debug.missing_snapshot_fields)}</li>
        <li>selected_price: {debug.selected_price ?? "—"}</li>
        <li>approved_support_amount: {debug.approved_support_amount ?? "—"}</li>
        <li>estimated_support_amount: {debug.estimated_support_amount ?? "—"}</li>
        <li>UI fallbacks_used: {JSON.stringify(debug.fallbacks_used)}</li>
        <li>fallback_used: {JSON.stringify(debug.fallback_used)}</li>
        <li>missing_fields: {JSON.stringify(debug.missing_fields)}</li>
      </ul>
      {debug.support_breakdown_raw ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-white/80 p-2 text-[9px] leading-relaxed ring-1 ring-amber-100">
          {JSON.stringify(debug.support_breakdown_raw, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function QuoteCardMember({
  quote,
  onEdit,
  onSms,
  onSponsorInfo,
}: {
  quote: AdminMemberQuoteCard;
  onEdit: () => void;
  onSms: () => void;
  onSponsorInfo: () => void;
}) {
  const debugOn = isQuoteDebugEnabled();
  const showSupportPricing =
    quote.sponsor_quote_enabled ||
    quote.sponsor_stage_badge === "지원검토" ||
    quote.sponsor_stage_badge === "지원확정" ||
    quote.support_rows.length > 0;
  return (
    <article
      className={`rounded-xl border p-3 ${
        quote.is_matched
          ? "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-200"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-950">{quote.company_name}</p>
          <p className="text-xs font-semibold text-slate-600">{quote.driver_name}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {quote.is_matched ? (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
              매칭기사
            </span>
          ) : null}
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-900">
            제휴기사
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">{quote.phone}</p>
      <dl className="mt-2 grid gap-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">일반견적가</dt>
          <dd className="font-bold">{formatAdminWon(quote.price)}</dd>
        </div>
        {showSupportPricing
          ? quote.support_rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-2">
                <dt className="text-slate-500">{row.label}</dt>
                <dd className="font-bold text-slate-900">{formatAdminWon(row.value)}</dd>
              </div>
            ))
          : null}
        {showSupportPricing ? (
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">정산모드</dt>
            <dd className="font-bold">{quote.support_settlement_label}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">제출시간</dt>
          <dd>{formatAdminCreatedAt(quote.created_at)}</dd>
        </div>
      </dl>
      {quote.message ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-700 ring-1 ring-slate-100">
          {quote.message}
        </p>
      ) : null}
      {debugOn && quote.support_debug ? (
        <QuoteSupportDebugBlock debug={quote.support_debug} />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {showSupportPricing ? (
          <button
            type="button"
            onClick={onSponsorInfo}
            className="rounded-lg bg-violet-100 px-2.5 py-1.5 text-[11px] font-black text-violet-900"
          >
            후원업체
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-800"
        >
          관리자수정
        </button>
        <button
          type="button"
          onClick={onSms}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white"
        >
          문자발송
        </button>
      </div>
    </article>
  );
}

function QuoteCardGuest({
  quote,
  onEdit,
  onSms,
}: {
  quote: AdminGuestQuoteCard;
  onEdit: () => void;
  onSms: () => void;
}) {
  return (
    <article
      className={`rounded-xl border p-3 ${
        quote.is_matched
          ? "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-200"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-slate-950">{quote.company_name}</p>
          <p className="text-xs font-semibold text-slate-600">{quote.driver_name}</p>
        </div>
        {quote.is_matched ? (
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">
            매칭기사
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
            일반기사
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold">{quote.phone}</p>
      <p className="mt-1 text-sm font-bold">{formatAdminWon(quote.price)}</p>
      <p className="mt-1 text-xs text-slate-500">{formatAdminCreatedAt(quote.created_at)}</p>
      {quote.message ? (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-2 text-xs">{quote.message}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-black"
        >
          관리자수정
        </button>
        <button
          type="button"
          onClick={onSms}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-black text-white"
        >
          문자발송
        </button>
      </div>
    </article>
  );
}

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

  const reportError = useCallback((e: unknown, fallback: string) => {
    const raw = e instanceof Error ? e.message : fallback;
    setError(sanitizeOperationalError(raw, fallback));
  }, []);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [smsLogOpen, setSmsLogOpen] = useState(false);
  const [sponsorInfoOpen, setSponsorInfoOpen] = useState(false);
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
        setBasic({
          ...payload,
          application: { ...payload.application, admin_memo: row.admin_memo },
        });
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
      setError(null);
      try {
        const quotes = await loadAdminDetailQuotes(row.id, { force });
        setQuotesPayload(quotes);
        if (isQuoteDebugEnabled()) {
          const debug = await loadAdminDetailDebug(row.id, { force });
          setDebugRaw(debug);
        }
      } catch (e) {
        reportError(e, "견적 데이터를 불러오는 중 문제가 발생했습니다.");
      } finally {
        setLoadingQuotes(false);
      }
    },
    [row.id, reportError],
  );

  const refreshAll = useCallback(() => {
    refreshAdminDetailCache(row.id);
    setQuotesPayload(null);
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

  if (!loadingBasic && basic && !isApplicationMatchCompleted(lifecycle)) {
    return (
      <p className="text-sm text-slate-600">
        매칭완료 레이아웃을 사용할 수 없습니다. 기존 상세 보기를 이용하세요.
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

      {matchedDriver ? (
        <SectionCard title="4. 매칭기사" className="ring-2 ring-emerald-200">
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
        </SectionCard>
      ) : null}

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
          ) : (
          <div className="mt-4 space-y-4">
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

      <ModalShell title="후원업체 정보" open={sponsorInfoOpen} onClose={() => setSponsorInfoOpen(false)}>
        {loadingSponsor ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : sponsorDetail ? (
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

function QuoteEditForm({
  quote,
  kind,
  busy,
  onSave,
}: {
  quote: AdminMemberQuoteCard | AdminGuestQuoteCard;
  kind: "member" | "guest";
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [price, setPrice] = useState(String(quote.price ?? ""));
  const [vehicle, setVehicle] = useState(quote.vehicle_type === "—" ? "" : quote.vehicle_type);
  const [time, setTime] = useState(quote.available_time === "—" ? "" : quote.available_time);
  const [message, setMessage] = useState(quote.message);
  const [hidden, setHidden] = useState(quote.status === "admin_hidden");

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">
        일반견적가
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        차량유형
        <input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        가능 출발시간
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        기사 메모
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.target.checked)}
        />
        견적 숨김 (status=admin_hidden)
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            price: price === "" ? null : Number.parseInt(price, 10),
            vehicle_type: vehicle,
            available_time: time,
            message,
            status: hidden ? "admin_hidden" : "submitted",
            quote_kind: kind,
          })
        }
        className="h-10 w-full rounded-xl bg-slate-900 text-sm font-black text-white disabled:opacity-50"
      >
        저장
      </button>
    </div>
  );
}
