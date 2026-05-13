"use client";

import { useCallback, useMemo, useState } from "react";

import { SERVICE_REGIONS, type ServiceRegion } from "@/lib/regions";
import { GuestQuoteForm } from "@/components/guest/GuestQuoteForm";
import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";
import { formatRouteWithStopovers, formatStopovers } from "@/lib/stopovers";

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
};

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function departureLine(call: GuestCall) {
  return [call.departure_date || "미정", call.departure_time].filter(Boolean).join(" ");
}

export function GuestQuotesClient({ initialQuotes }: { initialQuotes: GuestCall[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [region, setRegion] = useState<ServiceRegion | "">("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (region === "" ? quotes : quotes.filter((q) => q.departure_region === region)),
    [quotes, region],
  );

  const refresh = useCallback(async () => {
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
    tables: ["applications"],
    debounceMs: 800,
    onRefresh: refresh,
  });

  return (
    <div>
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

      <div className="mt-5 space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">
            표시할 견적요청이 없습니다.
          </div>
        ) : (
          filtered.map((call) => (
            <article key={call.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
                    {call.departure_region || "지역 미정"}
                  </span>
                  <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-slate-950">
                    {formatRouteWithStopovers(
                      call.departure,
                      call.stopovers,
                      call.destination,
                    )}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {departureLine(call)}
                  </p>
                  {formatStopovers(call.stopovers) ? (
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      경유지: {formatStopovers(call.stopovers)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={call.quote_closed_at != null && call.quote_closed_at !== ""}
                  onClick={() => setOpenId((prev) => (prev === call.id ? null : call.id))}
                  className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm disabled:bg-slate-300"
                  style={tapStyle}
                >
                  {call.quote_closed_at ? "견적 마감됨" : "견적 제출"}
                </button>
              </div>
              <div className="mt-4">
                <QuoteStatusSummary
                  quoteStatus={call.quote_status ?? "collecting"}
                  quoteDeadlineAt={call.quote_deadline_at}
                  autoFinalConfirmAt={call.auto_final_confirm_at}
                  quoteCount={call.quote_count}
                  quoteLimitCount={call.quote_limit_count}
                  targetNormalPrice={call.target_normal_price}
                  targetMemberPrice={call.target_member_price}
                  compact
                />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-[11px] font-bold text-slate-400">인원수</dt>
                  <dd className="mt-1 font-black text-slate-900">{call.passenger_count ?? "—"}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-[11px] font-bold text-slate-400">왕복/편도</dt>
                  <dd className="mt-1 font-black text-slate-900">{call.trip_type}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <dt className="text-[11px] font-bold text-slate-400">등급</dt>
                  <dd className="mt-1 font-black text-slate-900">{call.bus_grade}</dd>
                </div>
                {formatStopovers(call.stopovers) ? (
                  <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                    <dt className="text-[11px] font-bold text-slate-400">경유지</dt>
                    <dd className="mt-1 font-black text-slate-900">
                      {formatStopovers(call.stopovers)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
                {call.request_message || "요청사항 없음"}
              </p>
              <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800 ring-1 ring-blue-100">
                회원 등록 시 지원금 견적 제출 가능
              </p>
              {openId === call.id ? (
                <div className="mt-4">
                  <GuestQuoteForm
                    applicationId={call.id}
                    compact
                    passengerCount={call.passenger_count}
                    registerHref="/partner/register"
                    quoteClosed={call.quote_closed_at != null && call.quote_closed_at !== ""}
                  />
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
