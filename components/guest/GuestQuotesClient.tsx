"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { SERVICE_REGIONS, type ServiceRegion } from "@/lib/regions";
import { GuestQuoteForm } from "@/components/guest/GuestQuoteForm";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";
import { formatRouteWithStopovers, formatStopovers } from "@/lib/stopovers";
import { normalizeSponsorStage } from "@/lib/status-normalizer";

type GuestCall = {
  id: string;
  departure_region: string;
  departure: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  request_message: string;
  quote_status?: string;
  quote_deadline_at?: string;
  quote_limit_count?: number | null;
  quote_count?: number;
  target_normal_price?: number | null;
  target_member_price?: number | null;
  quote_closed_at?: string;
  auto_final_confirm_at?: string;
  sponsor_support_status?: string;
  sponsor_estimated_amount?: number | null;
  sponsor_confirmed_amount?: number | null;
};

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function ListCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

function formatWon(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatDeadline(deadlineAt: string | undefined | null): string {
  if (!deadlineAt) return "—";
  const diff = new Date(deadlineAt).getTime() - Date.now();
  if (diff <= 0) return "마감";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}일 ${h % 24}시간`;
  }
  return `${h}시간 ${m}분`;
}

/** 스폰서 단계 정보 박스 */
function SponsorInfoBox({ call }: { call: GuestCall }) {
  const stage = normalizeSponsorStage(call.sponsor_support_status);
  const isConfirmed = stage === "confirmed";
  const isReview = stage === "review";
  const hasSupport = isConfirmed || isReview;

  const sponsorAmount = isConfirmed
    ? call.sponsor_confirmed_amount
    : call.sponsor_estimated_amount;
  const amountLabel = isConfirmed ? "확정 지원금" : "예상 지원금";
  const badgeLabel = isConfirmed ? "지원확정" : "지원검토";
  const badgeTone = isConfirmed
    ? "bg-emerald-600 text-white"
    : "bg-blue-600 text-white";

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 ring-1 ring-slate-100">
      {/* 스폰서 단계 배지 + 금액 */}
      <div className="flex flex-wrap items-center gap-2">
        {hasSupport ? (
          <span className={`inline-flex rounded-full px-3 py-0.5 text-xs font-black ${badgeTone}`}>
            {badgeLabel}
          </span>
        ) : null}
        {hasSupport && sponsorAmount != null ? (
          <span className="text-sm font-black text-slate-900">
            {amountLabel} : {formatWon(sponsorAmount)}
          </span>
        ) : hasSupport ? (
          <span className="text-xs font-semibold text-slate-500">{amountLabel} : 미확정</span>
        ) : null}
      </div>

      {/* 희망 견적가 */}
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-600">
        {call.target_normal_price != null ? (
          <span>희망견적가 : {formatWon(call.target_normal_price)}</span>
        ) : null}
        {call.target_member_price != null ? (
          <span>할인견적가 : {formatWon(call.target_member_price)}</span>
        ) : null}
      </div>

      {/* 제휴기사 안내 */}
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
        제휴기사 가입시 : 지원금을 직접 확인하고, 지원금 할인 견적을 제출할 수 있습니다.
      </p>
    </div>
  );
}

function GuestCallCard({
  call,
  openId,
  setOpenId,
}: {
  call: GuestCall;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const closed = Boolean(call.quote_closed_at);
  const isOpen = openId === call.id;
  const stopoverText = formatStopovers(call.stopovers) || "—";
  const departureDate = call.departure_date.trim() || "미정";
  const departureTime = call.departure_time.trim() || "—";
  const region = call.departure_region.trim() || "—";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100 transition">
      <div className="p-4">
        {/* 경로 제목 */}
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-black leading-snug text-slate-900 sm:text-base">
            {formatRouteWithStopovers(call.departure, call.stopovers, call.destination)}
          </h2>
          {region !== "—" ? (
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-black text-blue-700">
              {region}
            </span>
          ) : null}
        </div>

        {/* 스폰서 정보 박스 */}
        <SponsorInfoBox call={call} />

        {/* 정보 그리드 — 파트너 카드 ListCell 스타일 */}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <ListCell label="출발일" value={departureDate} />
          <ListCell label="출발시간" value={departureTime} />
          <ListCell label="출발지역" value={region} />
          <ListCell label="출발지" value={call.departure || "—"} />
          <ListCell label="경유지" value={stopoverText} />
          <ListCell label="도착지" value={call.destination || "—"} />
          <ListCell
            label="인원수"
            value={call.passenger_count != null ? `${call.passenger_count}명` : "미확정"}
          />
          <ListCell label="왕복/편도" value={call.trip_type || "—"} />
          <ListCell label="차량등급" value={call.bus_grade || "—"} />
          <ListCell
            label="남은 마감시간"
            value={closed ? "마감됨" : formatDeadline(call.quote_deadline_at)}
          />
          <ListCell
            label="전적 진행현황"
            value={
              call.quote_limit_count != null
                ? `${call.quote_count ?? 0} / ${call.quote_limit_count}건`
                : `${call.quote_count ?? 0}건`
            }
          />
        </div>

        {/* 버튼 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={closed && !isOpen}
            onClick={() => setOpenId(isOpen ? null : call.id)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
            style={tapStyle}
          >
            {closed && !isOpen ? "마감됨" : isOpen ? "접기" : "견적 제출"}
          </button>
        </div>
      </div>

      {/* 견적 제출 폼 확장 */}
      {isOpen ? (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <GuestQuoteForm
            applicationId={call.id}
            compact
            passengerCount={call.passenger_count}
            registerHref="/partner/register"
            quoteClosed={closed}
            sponsorStatus={call.sponsor_support_status}
            sponsorEstimatedAmount={call.sponsor_estimated_amount}
            sponsorConfirmedAmount={call.sponsor_confirmed_amount}
          />
        </div>
      ) : null}
    </article>
  );
}

export function GuestQuotesClient({ initialQuotes }: { initialQuotes: GuestCall[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [region, setRegion] = useState<ServiceRegion | "">("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const subscribedLoggedRef = useRef(false);

  const filtered = useMemo(
    () => (region === "" ? quotes : quotes.filter((q) => q.departure_region === region)),
    [quotes, region],
  );

  const refresh = useCallback(async () => {
    if (process.env.NODE_ENV === "development") {
      console.log("[realtime] reload guest quotes");
    }
    setLoading(true);
    try {
      const query = region ? `?region=${encodeURIComponent(region)}` : "";
      const res = await fetch(`/api/guest/quotes${query}`);
      const json = (await res.json()) as { quotes?: GuestCall[] };
      setQuotes(Array.isArray(json.quotes) ? json.quotes : []);
    } finally {
      setLoading(false);
    }
  }, [region]);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "guest-quotes-live",
    tables: ["applications", "driver_quotes", "guest_driver_quotes"],
    debounceMs: 800,
    onRefresh: refresh,
    onEvent: (payload) => {
      const table = String(payload.table ?? "");
      const eventType = String(payload.eventType ?? "");
      if (process.env.NODE_ENV === "development") {
        console.log(`[realtime] ${table} ${eventType}`);
      }
      if (table === "applications" && eventType === "INSERT") {
        setToastMessage("새 전국 견적요청이 등록되었습니다.");
      }
    },
  });

  useEffect(() => {
    if (realtimeStatus !== "connected" || subscribedLoggedRef.current) return;
    subscribedLoggedRef.current = true;
    if (process.env.NODE_ENV === "development") {
      console.log("[realtime] guest-quotes subscribed");
    }
  }, [realtimeStatus]);

  useEffect(() => {
    if (toastMessage == null) return;
    const id = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  return (
    <div>
      {toastMessage ? (
        <div
          className="fixed left-1/2 top-4 z-[120] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-center text-sm font-black text-blue-900 shadow-xl shadow-slate-900/15 ring-1 ring-blue-50"
          role="status"
        >
          {toastMessage}
        </div>
      ) : null}

      {/* 지역 필터 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900">지역 필터</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              전국 견적요청을 로그인 없이 확인할 수 있습니다.
            </p>
          </div>
          <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600">
            {realtimeStatusLabel(realtimeStatus)}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm disabled:opacity-50"
            style={tapStyle}
          >
            {loading ? "새로고침 중…" : "새로고침"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRegion("")}
            className={`min-h-9 rounded-full border px-3 text-xs font-black ${
              region === ""
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            전체 지역
          </button>
          {SERVICE_REGIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRegion(item)}
              className={`min-h-9 rounded-full border px-3 text-xs font-black ${
                region === item
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* 카드 목록 */}
      <div className="mt-5 space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            표시할 견적요청이 없습니다.
          </div>
        ) : (
          filtered.map((call) => (
            <GuestCallCard
              key={call.id}
              call={call}
              openId={openId}
              setOpenId={setOpenId}
            />
          ))
        )}
      </div>
    </div>
  );
}
