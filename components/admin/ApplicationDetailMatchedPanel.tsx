"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import {
  displayAdminApplicationType,
  formatAdminCreatedAt,
  formatAdminDateOnly,
  formatAdminDepartureDateTime,
  formatAdminWon,
  phoneDialHref,
  phoneSmsHref,
} from "@/components/admin/admin-detail-format";
import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";
import { createAdminBrowserClient } from "@/lib/supabase";
import type {
  AdminApplicationDetailPayload,
  AdminGuestQuoteCard,
  AdminMemberQuoteCard,
} from "@/lib/admin-application-detail-build";
import { isApplicationMatchCompleted } from "@/lib/admin-application-detail-build";
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";

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

function QuoteCardMember({
  quote,
  sponsorConfirmed,
  onEdit,
  onSms,
  onSponsorInfo,
}: {
  quote: AdminMemberQuoteCard;
  sponsorConfirmed: boolean;
  onEdit: () => void;
  onSms: () => void;
  onSponsorInfo: () => void;
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
        {quote.sponsor_quote_enabled ? (
          <>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">예정 지원금</dt>
              <dd className="font-bold">{formatAdminWon(quote.total_support_display)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">고객 {sponsorConfirmed ? "확정" : "예정"} 지원금</dt>
              <dd className="font-bold">{formatAdminWon(quote.customer_support_display)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">예상 연장 지원금</dt>
              <dd className="font-bold">{formatAdminWon(quote.extension_support_display)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">
                {sponsorConfirmed ? "지원금 할인 적용가" : "지원금 할인 예상가"}
              </dt>
              <dd className="font-bold text-emerald-800">
                {formatAdminWon(quote.discount_price_display)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">정산모드</dt>
              <dd className="font-bold">{quote.support_settlement_label}</dd>
            </div>
          </>
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
      {quote.support_breakdown ? (
        <div className="mt-2">
          <SupportQuoteBreakdown
            breakdown={quote.support_breakdown as unknown as QuoteSupportBreakdown}
            mode="full"
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {quote.sponsor_quote_enabled ? (
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
  statusSection,
  lifecycleTools,
}: {
  row: ListRow;
  onOpenSms: (row: ListRow) => void;
  onStatusSaved: (
    applicationId: string,
    nextStatus: ApplicationStatusValue,
    nextMemo: string,
  ) => void;
  statusSection: React.ReactNode;
  lifecycleTools?: React.ReactNode;
}) {
  const [detail, setDetail] = useState<AdminApplicationDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    if (!row.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/driver-quotes?application_id=${encodeURIComponent(row.id)}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as {
        error?: string;
        detail?: AdminApplicationDetailPayload;
      };
      if (!res.ok) {
        setError(json.error ?? "상세 정보를 불러오지 못했습니다.");
        setDetail(null);
        return;
      }
      const payload = json.detail ?? null;
      if (payload) {
        setDetail({
          ...payload,
          application: { ...payload.application, admin_memo: row.admin_memo },
        });
      } else {
        setError("detail 응답이 없습니다. API 배포 상태를 확인하세요.");
      }
    } catch {
      setError("상세 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [row.id, row.admin_memo]);

  useEffect(() => {
    void load();
  }, [load]);

  const app = detail?.application ?? {};
  const lifecycle = detail?.application ?? {};
  const sponsorConfirmed = Boolean(
    detail?.sponsor?.sponsor_confirmed || detail?.sponsor?.support_status === "approved",
  );

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
      void load();
    } catch {
      setError("견적 저장에 실패했습니다.");
    } finally {
      setEditBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="py-8 text-center text-sm font-semibold text-slate-500">상세 불러오는 중…</p>
    );
  }

  if (error && !detail) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {error}
      </p>
    );
  }

  if (!detail || !isApplicationMatchCompleted(lifecycle)) {
    return (
      <p className="text-sm text-slate-600">
        매칭완료 레이아웃을 사용할 수 없습니다. 기존 상세 보기를 이용하세요.
      </p>
    );
  }

  const attachments = (app.attachments ?? {}) as Record<string, string>;
  const fileUrl = attachments.file_url || row.file_url;
  const stopovers = Array.isArray(app.stopovers)
    ? (app.stopovers as string[])
    : row.stopovers;

  return (
    <div className="space-y-4 pb-6">
      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
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
            <ul className="mt-2 space-y-1 text-xs font-semibold text-blue-950">
              <li>견적요청</li>
              <li>자동마감</li>
              <li>매칭완료</li>
            </ul>
            <p className="mt-2 inline-flex rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
              {String(app.quote_status ?? "—")}
            </p>
            <div className="mt-2">{statusSection}</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
            <p className="text-xs font-black text-violet-900">스폰서단계</p>
            <ul className="mt-2 space-y-1 text-xs font-semibold text-violet-950">
              <li>지원검토</li>
              <li>지원확정</li>
            </ul>
            <p className="mt-2 inline-flex rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-black text-white">
              {detail.sponsor?.support_status ?? "없음"}
            </p>
            {detail.sponsor ? (
              <button
                type="button"
                onClick={() => setSponsorInfoOpen(true)}
                className="mt-2 rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-[11px] font-black text-violet-900"
              >
                관리자수정
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

      {detail.matched_driver ? (
        <SectionCard title="4. 매칭기사" className="ring-2 ring-emerald-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-black text-slate-950">
                {detail.matched_driver.company_name}
              </p>
              <p className="text-sm font-semibold text-slate-700">
                {detail.matched_driver.driver_name}
              </p>
              <p className="mt-1 text-sm">{detail.matched_driver.phone}</p>
            </div>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
              {detail.matched_driver.badge}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={phoneDialHref(detail.matched_driver.phone)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white"
            >
              전화하기
            </a>
            <a
              href={phoneSmsHref(detail.matched_driver.phone)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"
            >
              문자하기
            </a>
          </div>
          <p className="mt-3 text-sm font-bold text-emerald-900">
            선택 견적: {detail.matched_driver.selected_price_label}{" "}
            {formatAdminWon(detail.matched_driver.selected_price)}
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
          <div className="mt-4 space-y-4">
            <InfoGrid
              items={[
                {
                  label: "제휴기사 신청",
                  value: `${detail.quote_summary.member_quote_count}건`,
                },
                {
                  label: "일반기사 신청",
                  value: `${detail.quote_summary.guest_quote_count}건`,
                },
                {
                  label: "평균 일반견적가",
                  value: formatAdminWon(detail.quote_summary.avg_normal_price),
                },
                {
                  label: "평균 예상 지원금",
                  value: formatAdminWon(detail.quote_summary.avg_estimated_support),
                },
                {
                  label: "평균 확정 지원금",
                  value: formatAdminWon(detail.quote_summary.avg_approved_support),
                },
                {
                  label: "연장회차",
                  value: String(detail.quote_summary.extension_round),
                },
              ]}
            />
            <div>
              <p className="mb-2 text-xs font-black text-slate-700">5-1. 제휴기사 견적</p>
              <div className="space-y-3">
                {detail.member_quotes.map((q) => (
                  <QuoteCardMember
                    key={q.id}
                    quote={q}
                    sponsorConfirmed={sponsorConfirmed}
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
                {detail.guest_quotes.map((q) => (
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
        ) : null}
      </SectionCard>

      <SectionCard title="6. 문자발송 로그">
        <button
          type="button"
          onClick={() => setSmsLogOpen(true)}
          className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-black"
        >
          문자발송 로그 보기 ({detail.sms_logs.length}건)
        </button>
      </SectionCard>

      {isQuoteDebugEnabled() ? (
        <SectionCard title="디버그 RAW">
          <pre className="max-h-64 overflow-auto text-[10px]">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </SectionCard>
      ) : null}

      <ModalShell title="후원업체 정보" open={sponsorInfoOpen} onClose={() => setSponsorInfoOpen(false)}>
        {detail.sponsor ? (
          <InfoGrid
            items={[
              { label: "업체명", value: detail.sponsor.sponsor_company_name },
              { label: "지원단계", value: detail.sponsor.support_status },
              { label: "지원종류", value: detail.sponsor.support_kind || "—" },
              { label: "지원조건", value: detail.sponsor.support_condition || "—" },
              { label: "지원유형", value: detail.sponsor.support_type || "—" },
              {
                label: "예상 지원금",
                value: formatAdminWon(detail.sponsor.estimated_support_amount),
              },
              {
                label: "확정 지원금",
                value: formatAdminWon(detail.sponsor.approved_support_amount),
              },
              {
                label: "확정 결정일시",
                value: formatAdminCreatedAt(detail.sponsor.approved_at || null),
              },
              { label: "담당자", value: detail.sponsor.assigned_staff_name || "—" },
              { label: "담당자 전화", value: detail.sponsor.assigned_staff_phone || "—" },
            ]}
          />
        ) : (
          <p className="text-sm text-slate-500">연결된 스폰서 후원이 없습니다.</p>
        )}
      </ModalShell>

      <ModalShell title="문자발송 로그" open={smsLogOpen} onClose={() => setSmsLogOpen(false)}>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {detail.sms_logs.length === 0 ? (
            <li className="text-sm text-slate-500">로그 없음</li>
          ) : (
            detail.sms_logs.map((log, i) => (
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
