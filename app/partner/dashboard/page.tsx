"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
import {
  SERVICE_REGIONS,
  normalizeServiceRegions,
  type ServiceRegion,
} from "@/lib/regions";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseClient } from "@/lib/supabase";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

type PartnerCall = {
  id: string;
  created_at: string;
  receipt_number: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_region: string;
  destination: string;
  departure_date: string;
  departure_time: string;
  return_date: string;
  passenger_count: number | null;
  my_quote: { id: string; price: number | null } | null;
};

type QuoteForm = {
  price: string;
  vehicleType: string;
  availableTime: string;
  message: string;
};

type ReferralForm = {
  phone: string;
};

const emptyQuoteForm: QuoteForm = {
  price: "",
  vehicleType: "",
  availableTime: "",
  message: "",
};

const emptyReferralForm: ReferralForm = {
  phone: "",
};

function formatDate(value: string): string {
  const t = value.trim();
  if (t === "") return "미정";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toISOString().slice(0, 10);
}

function formatDeparture(call: PartnerCall): string {
  const date = formatDate(call.departure_date);
  const time = call.departure_time.trim();
  if (time === "" || time === "—") return date;
  return `${date} ${time}`;
}

function formatPrice(value: number | null): string {
  if (value == null) return "제출 완료";
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

function buildReferralPreview(call: PartnerCall): string {
  return `[무료관광버스]
전세버스 견적요청이 전달되었습니다.

출발: ${call.departure}
도착: ${call.destination}
일시: ${formatDeparture(call)}
인원: ${call.passenger_count ?? "미정"}

견적 확인/제출:
https://www.free-bus.co.kr/shared-quote/{전달 후 생성}

제휴기사 등록:
https://www.free-bus.co.kr/partner/register?ref={전달 후 생성}`;
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [calls, setCalls] = useState<PartnerCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [activeQuoteCallId, setActiveQuoteCallId] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState<QuoteForm>(emptyQuoteForm);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null);
  const [activeReferralCallId, setActiveReferralCallId] = useState<string | null>(null);
  const [referralForm, setReferralForm] =
    useState<ReferralForm>(emptyReferralForm);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [serviceRegions, setServiceRegions] = useState<ServiceRegion[]>([]);
  const [savedServiceRegions, setSavedServiceRegions] = useState<ServiceRegion[]>([]);
  const [serviceRegionBusy, setServiceRegionBusy] = useState(false);
  const [serviceRegionMessage, setServiceRegionMessage] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    setCallsError(null);
    try {
      const res = await fetch("/api/partner/calls", {
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        error?: string;
        calls?: PartnerCall[];
        service_regions?: unknown;
      };
      if (!res.ok) {
        setCallsError(json.error ?? "대기중인 콜을 불러오지 못했습니다.");
        setCalls([]);
        return;
      }
      setCalls(Array.isArray(json.calls) ? json.calls : []);
      const nextRegions = normalizeServiceRegions(json.service_regions);
      setServiceRegions(nextRegions);
      setSavedServiceRegions(nextRegions);
    } catch (e) {
      setCallsError(e instanceof Error ? e.message : String(e));
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          router.replace("/partner/login");
          return;
        }

        const profile = await fetchProfileForAuthUser(supabase, user.id);
        const role = parseUserRole(profile?.role ?? null);

        if (role !== USER_ROLES.DRIVER) {
          await supabase.auth.signOut();
          router.replace("/partner/login?error=forbidden");
          return;
        }

        const approvedOk = await isPartnerDriverLoginAllowed(
          supabase,
          profile,
          user.email,
        );
        if (!approvedOk) {
          await supabase.auth.signOut();
          router.replace("/partner/login");
          return;
        }

        const pid = profile?.partner_driver_id?.trim();
        if (pid) {
          const { data: pwRow, error: pwErr } = await supabase
            .from("partner_drivers")
            .select("temporary_password_issued_at, password_changed_at")
            .eq("id", pid)
            .maybeSingle();
          if (!pwErr && pwRow && typeof pwRow === "object") {
            const row = pwRow as {
              temporary_password_issued_at?: unknown;
              password_changed_at?: unknown;
            };
            const issued =
              row.temporary_password_issued_at != null &&
              String(row.temporary_password_issued_at).trim() !== "";
            const changed =
              row.password_changed_at != null &&
              String(row.password_changed_at).trim() !== "";
            if (issued && !changed) {
              router.replace("/partner/change-password");
              return;
            }
          }
        }

        if (!cancelled) {
          setChecking(false);
          void loadCalls();
        }
      } catch {
        router.replace("/partner/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCalls, router]);

  useEffect(() => {
    if (checking) return;
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel("partner-dashboard-application-inserts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applications",
        },
        () => {
          void loadCalls();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [checking, loadCalls]);

  const handleLogout = async () => {
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/partner/login");
    }
  };

  const toggleServiceRegion = (region: ServiceRegion) => {
    setServiceRegionMessage(null);
    setServiceRegions((prev) =>
      prev.includes(region)
        ? prev.filter((item) => item !== region)
        : [...prev, region],
    );
  };

  const serviceRegionsChanged =
    serviceRegions.join("|") !== savedServiceRegions.join("|");

  const saveServiceRegions = async () => {
    setServiceRegionBusy(true);
    setServiceRegionMessage(null);
    try {
      const normalized = normalizeServiceRegions(serviceRegions);
      const res = await fetch("/api/partner/service-regions", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_regions: normalized }),
      });
      const json = (await res.json()) as {
        error?: string;
        service_regions?: unknown;
      };
      if (!res.ok) {
        setServiceRegionMessage(json.error ?? "수신지역 저장에 실패했습니다.");
        return;
      }
      const nextRegions = normalizeServiceRegions(json.service_regions);
      setServiceRegions(nextRegions);
      setSavedServiceRegions(nextRegions);
      setServiceRegionMessage("수신지역을 저장했습니다.");
      void loadCalls();
    } catch (e) {
      setServiceRegionMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setServiceRegionBusy(false);
    }
  };

  const openQuoteForm = (call: PartnerCall) => {
    setActiveQuoteCallId(call.id);
    setActiveReferralCallId(null);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
  };

  const closeQuoteForm = () => {
    if (quoteBusy) return;
    setActiveQuoteCallId(null);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
  };

  const openReferralForm = (call: PartnerCall) => {
    setActiveReferralCallId(call.id);
    setActiveQuoteCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
  };

  const closeReferralForm = () => {
    if (referralBusy) return;
    setActiveReferralCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
  };

  const submitQuote = async (call: PartnerCall) => {
    setQuoteBusy(true);
    setQuoteMessage(null);
    try {
      const res = await fetch("/api/partner/quotes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: call.id,
          price: quoteForm.price,
          vehicle_type: quoteForm.vehicleType,
          available_time: quoteForm.availableTime,
          message: quoteForm.message,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        quote?: { id?: string; price?: number | null };
      };
      if (!res.ok) {
        setQuoteMessage(json.error ?? "견적 제출에 실패했습니다.");
        return;
      }
      const quoteId = String(json.quote?.id ?? "");
      setCalls((prev) =>
        prev.map((item) =>
          item.id === call.id
            ? {
                ...item,
                my_quote: {
                  id: quoteId,
                  price:
                    typeof json.quote?.price === "number"
                      ? json.quote.price
                      : null,
                },
              }
            : item,
        ),
      );
      setQuoteMessage("견적을 제출했습니다.");
      setActiveQuoteCallId(null);
      setQuoteForm(emptyQuoteForm);
      void loadCalls();
    } catch (e) {
      setQuoteMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setQuoteBusy(false);
    }
  };

  const submitReferral = async (call: PartnerCall) => {
    setReferralBusy(true);
    setReferralMessage(null);
    try {
      const res = await fetch("/api/partner/quote-referrals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: call.id,
          referred_phone: referralForm.phone,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setReferralMessage(json.error ?? "문자 발송에 실패했습니다.");
        return;
      }
      setReferralMessage("동료기사에게 견적요청 문자를 발송했습니다.");
      setActiveReferralCallId(null);
      setReferralForm(emptyReferralForm);
    } catch (e) {
      setReferralMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setReferralBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f8fb] text-sm font-semibold text-slate-500">
        확인 중…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 pb-16 pt-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-slate-200/90 bg-white px-5 py-6 shadow-[0_18px_45px_rgba(15,23,42,0.1)] sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                제휴 기사
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900">
                대기중인 콜
              </h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                신규 예약 신청만 표시됩니다. 고객 연락처와 이름은 아직 공개하지 않습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadCalls()}
                disabled={callsLoading}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                style={tapStyle}
              >
                {callsLoading ? "새로고침 중…" : "새로고침"}
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900"
                style={tapStyle}
              >
                로그아웃
              </button>
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  콜 수신지역 설정
                </h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  선택한 지역의 출발 콜만 표시됩니다. 비워두면 모든 지역 콜을 표시합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void saveServiceRegions()}
                disabled={serviceRegionBusy || !serviceRegionsChanged}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-50"
                style={tapStyle}
              >
                {serviceRegionBusy ? "저장 중…" : "수신지역 저장"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {SERVICE_REGIONS.map((region) => {
                const selected = serviceRegions.includes(region);
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleServiceRegion(region)}
                    className={`min-h-9 rounded-full border px-3 text-xs font-black transition ${
                      selected
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                    style={tapStyle}
                  >
                    {region}
                  </button>
                );
              })}
            </div>
            {serviceRegions.length === 0 ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900 ring-1 ring-amber-100">
                수신지역이 설정되지 않아 모든 지역 콜이 표시됩니다.
              </p>
            ) : null}
            {serviceRegionMessage ? (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-700 ring-1 ring-slate-200">
                {serviceRegionMessage}
              </p>
            ) : null}
          </section>

          {callsError ? (
            <div
              className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800"
              role="alert"
            >
              {callsError}
            </div>
          ) : null}

          {quoteMessage ? (
            <div
              className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-relaxed text-blue-900"
              role="status"
            >
              {quoteMessage}
            </div>
          ) : null}

          {referralMessage ? (
            <div
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-relaxed text-emerald-900"
              role="status"
            >
              {referralMessage}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            {callsLoading && calls.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                대기중인 콜을 불러오는 중…
              </div>
            ) : calls.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-black text-slate-700">
                  현재 대기중인 콜이 없습니다.
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  새 신청이 들어오면 새로고침으로 확인할 수 있습니다.
                </p>
              </div>
            ) : (
              calls.map((call) => {
                const alreadyQuoted = call.my_quote != null;
                const formOpen = activeQuoteCallId === call.id;
                const referralOpen = activeReferralCallId === call.id;
                return (
                  <article
                    key={call.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-100"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          {call.receipt_number || "신규 콜"}
                        </p>
                        <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">
                          {call.departure} → {call.destination}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {formatDeparture(call)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        {alreadyQuoted ? (
                          <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                            이미 견적 제출 · {formatPrice(call.my_quote?.price ?? null)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openQuoteForm(call)}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                            style={tapStyle}
                          >
                            견적 제출
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openReferralForm(call)}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                          style={tapStyle}
                        >
                          동료기사에게 전달
                        </button>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-bold text-slate-400">
                          인원수
                        </dt>
                        <dd className="mt-1 font-black text-slate-900">
                          {call.passenger_count ?? "—"}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-bold text-slate-400">
                          왕복/편도
                        </dt>
                        <dd className="mt-1 font-black text-slate-900">
                          {call.trip_type}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-bold text-slate-400">
                          일반/프리미엄
                        </dt>
                        <dd className="mt-1 font-black text-slate-900">
                          {call.bus_grade}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-bold text-slate-400">
                          신청유형
                        </dt>
                        <dd className="mt-1 font-black text-slate-900">
                          {call.application_type}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-bold text-slate-400">
                          출발지역
                        </dt>
                        <dd className="mt-1 font-black text-slate-900">
                          {call.departure_region || "—"}
                        </dd>
                      </div>
                    </dl>

                    {formOpen && !alreadyQuoted ? (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-bold text-slate-500">
                              견적금액
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={quoteForm.price}
                              onChange={(e) =>
                                setQuoteForm((prev) => ({
                                  ...prev,
                                  price: e.target.value,
                                }))
                              }
                              placeholder="예: 450000"
                              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-bold text-slate-500">
                              차량유형
                            </span>
                            <input
                              type="text"
                              value={quoteForm.vehicleType}
                              onChange={(e) =>
                                setQuoteForm((prev) => ({
                                  ...prev,
                                  vehicleType: e.target.value,
                                }))
                              }
                              placeholder="예: 45인승 일반버스"
                              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-bold text-slate-500">
                              가능 출발시간
                            </span>
                            <input
                              type="text"
                              value={quoteForm.availableTime}
                              onChange={(e) =>
                                setQuoteForm((prev) => ({
                                  ...prev,
                                  availableTime: e.target.value,
                                }))
                              }
                              placeholder="예: 요청 시간 가능 / 08:30 가능"
                              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-bold text-slate-500">
                              기사 메모
                            </span>
                            <textarea
                              value={quoteForm.message}
                              onChange={(e) =>
                                setQuoteForm((prev) => ({
                                  ...prev,
                                  message: e.target.value,
                                }))
                              }
                              placeholder="차량 조건, 포함/불포함 사항 등을 입력하세요."
                              className="mt-1 min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void submitQuote(call)}
                            disabled={
                              quoteBusy ||
                              quoteForm.price.trim() === "" ||
                              quoteForm.vehicleType.trim() === "" ||
                              quoteForm.availableTime.trim() === ""
                            }
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            {quoteBusy ? "제출 중…" : "견적 제출"}
                          </button>
                          <button
                            type="button"
                            onClick={closeQuoteForm}
                            disabled={quoteBusy}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {referralOpen ? (
                      <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500">
                            동료기사 휴대폰번호
                          </span>
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={referralForm.phone}
                            onChange={(e) =>
                              setReferralForm({
                                phone: formatPhoneNumber(e.target.value),
                              })
                            }
                            placeholder="010-0000-0000"
                            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </label>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-xs font-black text-slate-500">
                            전달 메시지 미리보기
                          </p>
                          <pre className="mt-2 whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-700">
                            {buildReferralPreview(call)}
                          </pre>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void submitReferral(call)}
                            disabled={
                              referralBusy ||
                              !/^010-\d{4}-\d{4}$/.test(referralForm.phone)
                            }
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {referralBusy ? "발송 중…" : "문자 발송"}
                          </button>
                          <button
                            type="button"
                            onClick={closeReferralForm}
                            disabled={referralBusy}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/"
              className="touch-manipulation inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              style={tapStyle}
            >
              메인으로
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
