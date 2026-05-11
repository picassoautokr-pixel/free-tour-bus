"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
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

const emptyQuoteForm: QuoteForm = {
  price: "",
  vehicleType: "",
  availableTime: "",
  message: "",
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
      };
      if (!res.ok) {
        setCallsError(json.error ?? "대기중인 콜을 불러오지 못했습니다.");
        setCalls([]);
        return;
      }
      setCalls(Array.isArray(json.calls) ? json.calls : []);
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

  const openQuoteForm = (call: PartnerCall) => {
    setActiveQuoteCallId(call.id);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
  };

  const closeQuoteForm = () => {
    if (quoteBusy) return;
    setActiveQuoteCallId(null);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
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
