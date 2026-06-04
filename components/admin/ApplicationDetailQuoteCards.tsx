"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationDetailQuoteCards.tsx
// 견적 카드 컴포넌트: QuoteSupportDebugBlock, QuoteCardMember, QuoteCardGuest
// ─────────────────────────────────────────────────────────────────────────────

import { formatAdminCreatedAt, formatAdminWon } from "@/components/admin/admin-detail-format";
import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";
import type {
  AdminGuestQuoteCard,
  AdminMemberQuoteCard,
  AdminMemberQuoteDebug,
} from "@/lib/admin-application-detail-build";

export function QuoteSupportDebugBlock({ debug }: { debug: AdminMemberQuoteDebug }) {
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
        <li>application.selected_price_type: {debug.application_selected_price_type ?? "—"}</li>
        <li>application.selected_price_label: {debug.application_selected_price_label ?? "—"}</li>
        <li>application.selected_price: {debug.application_selected_price ?? "—"}</li>
        <li>
          application.client_price_selection_kind:{" "}
          {debug.application_client_price_selection_kind ?? "—"}
        </li>
        <li>
          application.final_selected_quote_id: {debug.application_final_selected_quote_id ?? "—"}
        </li>
        <li>quote.price: {debug.quote_price ?? "—"}</li>
        <li>sponsor_status_resolution: {debug.sponsor_status_resolution ?? "—"}</li>
        <li>
          sponsor_confirmed_resolved:{" "}
          {debug.sponsor_confirmed_resolved === true
            ? "true"
            : debug.sponsor_confirmed_resolved === false
              ? "false"
              : "—"}
        </li>
        <li>
          selected_price_calculation_source: {debug.selected_price_calculation_source ?? "—"}
        </li>
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

export function QuoteCardMember({
  quote,
  showSupportDetails = true,
  onEdit,
  onSms,
  onSponsorInfo,
}: {
  quote: AdminMemberQuoteCard;
  showSupportDetails?: boolean;
  onEdit: () => void;
  onSms: () => void;
  onSponsorInfo: () => void;
}) {
  const debugOn = isQuoteDebugEnabled();
  const showSupportPricing =
    showSupportDetails &&
    (quote.sponsor_quote_enabled ||
      quote.sponsor_stage_badge === "지원검토" ||
      quote.sponsor_stage_badge === "지원확정" ||
      quote.support_rows.length > 0 ||
      quote.price != null);
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

export function QuoteCardGuest({
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
