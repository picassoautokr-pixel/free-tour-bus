"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ContractPreview,
  type ContractPreviewData,
} from "@/components/ContractPreview";
import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";
import { isPartnerDriverLoginAllowed } from "@/lib/partner-driver-access";
import { fetchProfileForAuthUser } from "@/lib/profile";
import {
  SERVICE_REGIONS,
  normalizeRegion,
  normalizeServiceRegions,
  type ServiceRegion,
} from "@/lib/regions";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import {
  formatRouteWithStopovers,
  formatStopovers,
  parseStopovers,
} from "@/lib/stopovers";
import { createSupabaseClient } from "@/lib/supabase";
import { estimateSponsorSupport } from "@/lib/support-estimate";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

/** 콜 목록에 포함된 내 견적(회원 제출 또는 동일 번호 비회원 제출) */
type PartnerMyQuote = {
  source: "member" | "guest";
  id: string;
  price: number | null;
  estimated_support_amount?: number | null;
  support_discount_amount?: number | null;
  member_price?: number | null;
  is_member_quote?: boolean;
  converted_from_guest_quote_id?: string;
  sponsor_support_amount?: number | null;
  sponsor_discounted_price?: number | null;
  sponsor_quote_enabled?: boolean;
  driver_support_amount?: number | null;
  client_reward_amount?: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
  created_at: string;
  match_result?: string;
};

type PartnerCall = {
  id: string;
  created_at: string;
  receipt_number: string;
  contract_number: string;
  contract_pdf_generated_at: string;
  contract_pdf_url: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_region: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  return_date: string;
  passenger_count: number | null;
  request_message?: string;
  estimated_support_amount: number;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  quote_count: number;
  call_category: "new" | "quoted" | "matched";
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  extension_round: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  auto_final_confirm_at: string;
  contact_revealed_at: string;
  contract_status: string;
  contract_started_at: string;
  client_contract_confirmed_at: string;
  driver_contract_confirmed_at: string;
  deposit_amount: number;
  deposit_status: string;
  deposit_confirmed_at: string;
  contract_memo: string;
  customer_name?: string;
  customer_phone?: string;
  my_quote: PartnerMyQuote | null;
};

type QuoteForm = {
  price: string;
  supportDiscountAmount: string;
  vehicleType: string;
  availableTime: string;
  message: string;
};

type ReferralForm = {
  phones: string;
};

type ReferralResult = {
  phone: string;
  status: "sent" | "skipped_duplicate" | "invalid_phone" | "send_failed";
  error?: string;
};

type DashboardTab = "new" | "quoted" | "matched";

const emptyQuoteForm: QuoteForm = {
  price: "",
  supportDiscountAmount: "",
  vehicleType: "",
  availableTime: "",
  message: "",
};

const emptyReferralForm: ReferralForm = {
  phones: "",
};

const PARTNER_NOTIFICATION_SOUND_PREF_KEY = "partnerDashboardSoundEnabled";
const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

const DASHBOARD_TABS: Array<{
  id: DashboardTab;
  label: string;
  empty: string;
}> = [
  { id: "new", label: "신규 견적요청", empty: "현재 신규 견적이 없습니다." },
  { id: "quoted", label: "내가 제출한 견적", empty: "제출한 견적이 없습니다." },
  { id: "matched", label: "내가 매칭된 견적", empty: "매칭된 견적이 없습니다." },
];

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

function formatRemaining(deadline: string): string {
  const time = new Date(deadline).getTime();
  if (!Number.isFinite(time)) return "마감시간 미정";
  const diff = time - Date.now();
  if (diff <= 0) return "마감 임박";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `마감까지 ${minutes}분`;
  return `마감까지 ${hours}시간`;
}

function isQuoteClosed(call: PartnerCall): boolean {
  const closedStatuses = new Set([
    "closed_by_time",
    "closed_by_quote_count",
    "closed_by_price",
    "auto_selected",
    "final_selected",
    "completed",
    "contract_pending",
    "manually_closed",
  ]);
  return (
    call.quote_closed_at.trim() !== "" ||
    call.final_selected_quote_id.trim() !== "" ||
    closedStatuses.has(call.quote_status)
  );
}

function isMatchedCall(call: PartnerCall): boolean {
  if (call.call_category === "matched") return true;
  if (call.my_quote == null) return false;
  const selectedQuoteId =
    call.final_selected_quote_id.trim() || call.auto_selected_quote_id.trim();
  return selectedQuoteId !== "" && call.my_quote.id === selectedQuoteId;
}

function isNewCall(call: PartnerCall): boolean {
  return call.call_category === "new" && call.my_quote == null && !isQuoteClosed(call);
}

function isQuotedCall(call: PartnerCall): boolean {
  return (
    call.call_category === "quoted" &&
    call.my_quote != null &&
    call.final_selected_quote_id.trim() === "" &&
    !isMatchedCall(call)
  );
}

function canRevealCustomerInfo(call: PartnerCall): boolean {
  if (call.my_quote == null) return false;
  const revealStatuses = new Set(["final_selected", "contract_pending", "completed"]);
  return (
    call.contact_revealed_at.trim() !== "" &&
    call.final_selected_quote_id.trim() !== "" &&
    call.my_quote.id === call.final_selected_quote_id &&
    revealStatuses.has(call.quote_status)
  );
}

function contractPreviewDataForCall(call: PartnerCall): ContractPreviewData | null {
  if (!call.my_quote) return null;
  return {
    applicationId: call.id,
    contractNumber: call.contract_number,
    contractPdfGeneratedAt: call.contract_pdf_generated_at,
    contractStatus: call.contract_status || "pending",
    clientContractConfirmedAt: call.client_contract_confirmed_at,
    driverContractConfirmedAt: call.driver_contract_confirmed_at,
    depositStatus: call.deposit_status,
    clientName: call.customer_name ?? "",
    clientPhone: call.customer_phone ?? "",
    receiptNumber: call.receipt_number,
    driverCompanyName: "내 견적",
    driverManagerName: "제휴기사",
    driverPhone: "",
    vehicleType: call.my_quote.vehicle_type,
    departure: call.departure,
    stopovers: call.stopovers,
    destination: call.destination,
    departureDateTime: formatDeparture(call),
    tripType: call.trip_type,
    busGrade: call.bus_grade,
    passengerCount: call.passenger_count,
    requestMessage: call.request_message ?? "",
    normalPrice: call.my_quote.price,
    memberPrice: call.my_quote.member_price ?? call.my_quote.sponsor_discounted_price ?? null,
    estimatedSupportAmount:
      call.my_quote.estimated_support_amount ?? call.my_quote.sponsor_support_amount ?? null,
    supportDiscountAmount:
      call.my_quote.support_discount_amount ?? call.my_quote.sponsor_support_amount ?? null,
    driverSupportAmount: call.my_quote.driver_support_amount ?? null,
    clientRewardAmount: call.my_quote.client_reward_amount ?? null,
    depositAmount: call.deposit_amount,
  };
}

function quoteStatusLabel(call: PartnerCall): string {
  if (isMatchedCall(call)) {
    return call.final_selected_quote_id.trim() !== ""
      ? "최종 확정"
      : "자동선정 후보";
  }
  if (call.my_quote != null) return "견적 검토중";
  return "제출 전";
}

function averageStatusLabel(call: PartnerCall): string {
  const myPrice =
    call.my_quote?.member_price ??
    call.my_quote?.sponsor_discounted_price ??
    call.my_quote?.price ??
    null;
  if (myPrice == null || call.quote_count <= 1) return "평균가 산정 전";
  return "평균가 대비 상태 확인 중";
}

function formatSubmittedAt(iso: string): string {
  const t = iso.trim();
  if (t === "" || t === "—") return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parsePriceInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const text = String(value).trim();
  return text === "" ? emptyLabel : text;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d-]/g, "");
    if (digits !== "") {
      const parsed = Number.parseInt(digits, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function supportDiscountFor(call: PartnerCall, value: string): number {
  const parsed = parsePriceInput(value);
  return parsed ?? call.estimated_support_amount;
}

function discountedPriceFor(
  call: PartnerCall,
  priceText: string,
  supportDiscountText: string,
): number | null {
  const price = parsePriceInput(priceText);
  if (price == null) return null;
  return Math.max(price - supportDiscountFor(call, supportDiscountText), 0);
}

function parseReferralPhones(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function referralStatusLabel(status: ReferralResult["status"]): string {
  if (status === "sent") return "발송 완료";
  if (status === "skipped_duplicate") return "중복 건너뜀";
  if (status === "invalid_phone") return "번호 오류";
  return "발송 실패";
}

function buildReferralPreview(call: PartnerCall): string {
  const stopoverText = formatStopovers(call.stopovers);
  return `[무료관광버스]
전세버스 견적요청이 전달되었습니다.

출발: ${call.departure}
${stopoverText ? `경유: ${stopoverText}\n` : ""}도착: ${call.destination}
일시: ${formatDeparture(call)}
인원: ${call.passenger_count ?? "미정"}

견적 확인:
https://www.free-bus.co.kr/shared-quote/{전달 후 생성}

제휴기사 등록:
https://www.free-bus.co.kr/partner/register?ref={전달 후 생성}`;
}

function logRealtime(message: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  if (payload === undefined) console.log(message);
  else console.log(message, payload);
}

function buildOptimisticCall(row: Record<string, unknown>): PartnerCall | null {
  const id = safeText(row.id);
  if (id === "") return null;
  if (safeText(row.application_type) !== APPLICATION_TYPE_NEW_BOOKING) return null;

  const passengerCount = parseInteger(row.passenger_count);
  const estimatedSupportAmount = estimateSponsorSupport({
    passengerCount,
    price: 0,
  }).supportAmount;

  return {
    id,
    created_at: safeText(row.created_at, new Date().toISOString()),
    receipt_number: safeText(row.receipt_number),
    contract_number: safeText(row.contract_number),
    contract_pdf_generated_at: safeText(row.contract_pdf_generated_at),
    contract_pdf_url: safeText(row.contract_pdf_url),
    application_type: safeText(row.application_type),
    trip_type: safeText(row.trip_type),
    bus_grade: safeText(row.bus_grade),
    departure: safeText(row.departure),
    departure_region: safeText(row.departure_region),
    destination: safeText(row.destination),
    stopovers: parseStopovers(row.stopovers),
    departure_date: safeText(row.departure_date),
    departure_time: safeText(row.departure_time),
    return_date: safeText(row.return_date),
    passenger_count: passengerCount,
    estimated_support_amount: estimatedSupportAmount,
    quote_status: safeText(row.quote_status, "collecting"),
    quote_deadline_at: safeText(row.quote_deadline_at),
    quote_limit_count: parseInteger(row.quote_limit_count),
    quote_count: 0,
    call_category: "new",
    target_normal_price: parseInteger(row.target_normal_price),
    target_member_price: parseInteger(row.target_member_price),
    quote_closed_at: safeText(row.quote_closed_at),
    extension_round: parseInteger(row.extension_round) ?? 0,
    support_client_reward_ratio: parseInteger(row.support_client_reward_ratio) ?? 0,
    support_driver_ratio: parseInteger(row.support_driver_ratio) ?? 100,
    auto_selected_quote_id: safeText(row.auto_selected_quote_id),
    auto_selected_quote_source: safeText(row.auto_selected_quote_source),
    final_selected_quote_id: safeText(row.final_selected_quote_id),
    final_selected_quote_source: safeText(row.final_selected_quote_source),
    auto_final_confirm_at: safeText(row.auto_final_confirm_at),
    contact_revealed_at: safeText(row.contact_revealed_at),
    contract_status: safeText(row.contract_status),
    contract_started_at: safeText(row.contract_started_at),
    client_contract_confirmed_at: safeText(row.client_contract_confirmed_at),
    driver_contract_confirmed_at: safeText(row.driver_contract_confirmed_at),
    deposit_amount: parseInteger(row.deposit_amount) ?? 0,
    deposit_status: safeText(row.deposit_status, "unpaid"),
    deposit_confirmed_at: safeText(row.deposit_confirmed_at),
    contract_memo: safeText(row.contract_memo),
    my_quote: null,
  };
}

export default function PartnerDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [calls, setCalls] = useState<PartnerCall[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("new");
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [activeQuoteCallId, setActiveQuoteCallId] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState<QuoteForm>(emptyQuoteForm);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null);
  const [quoteDetailCall, setQuoteDetailCall] = useState<PartnerCall | null>(
    null,
  );
  const [customerDetailCall, setCustomerDetailCall] = useState<PartnerCall | null>(
    null,
  );
  const [contractDetailCall, setContractDetailCall] = useState<PartnerCall | null>(
    null,
  );
  const [contractChecks, setContractChecks] = useState({
    preview: false,
    route: false,
    deposit: false,
    support: false,
  });
  const [contractPreviewCall, setContractPreviewCall] = useState<PartnerCall | null>(
    null,
  );
  const [contractBusy, setContractBusy] = useState(false);
  const [activeReferralCallId, setActiveReferralCallId] = useState<string | null>(null);
  const [referralForm, setReferralForm] =
    useState<ReferralForm>(emptyReferralForm);
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [referralResults, setReferralResults] = useState<ReferralResult[]>([]);
  const [serviceRegions, setServiceRegions] = useState<ServiceRegion[]>([]);
  const [savedServiceRegions, setSavedServiceRegions] = useState<ServiceRegion[]>([]);
  const [serviceRegionBusy, setServiceRegionBusy] = useState(false);
  const [serviceRegionMessage, setServiceRegionMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [newCallNoticeId, setNewCallNoticeId] = useState<string | null>(null);
  const [highlightedNewCallIds, setHighlightedNewCallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const knownCallIdsRef = useRef<Set<string>>(new Set());
  const notifiedCallIdsRef = useRef<Set<string>>(new Set());
  const callsInitializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingApplicationInsertIdRef = useRef<string | null>(null);
  const realtimeSubscribedLoggedRef = useRef(false);
  const savedServiceRegionsRef = useRef<ServiceRegion[]>([]);
  const highlightTimersRef = useRef<Map<string, number>>(new Map());

  function scrollToCall(id: string) {
    setActiveTab("new");
    window.setTimeout(() => {
      document.getElementById(`partner-call-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  const playNotificationSound = useCallback(() => {
    if (!soundEnabled || !audioContextRef.current) return;
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.12);
    } catch {
      /* ignore */
    }
  }, [soundEnabled]);

  const highlightNewCall = useCallback((id: string) => {
    setHighlightedNewCallIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const previousTimer = highlightTimersRef.current.get(id);
    if (previousTimer != null) {
      window.clearTimeout(previousTimer);
    }

    const timer = window.setTimeout(() => {
      highlightTimersRef.current.delete(id);
      setHighlightedNewCallIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
    highlightTimersRef.current.set(id, timer);
  }, []);

  const showBrowserNotification = useCallback((call: PartnerCall) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;

    const title = `🔔 ${formatRouteWithStopovers(
      call.departure,
      call.stopovers,
      call.destination,
    )} 신규 견적`;
    const body = `${call.passenger_count ?? "미정"}인 / ${call.trip_type || "미정"} / ${
      call.bus_grade || "미정"
    }`;
    const notification = new window.Notification(title, {
      body,
      tag: `partner-new-call-${call.id}`,
    });
    notification.onclick = () => {
      window.focus();
      scrollToCall(call.id);
      notification.close();
    };
  }, []);

  const handleNewCallArrived = useCallback(
    (call: PartnerCall) => {
      if (notifiedCallIdsRef.current.has(call.id)) return;
      notifiedCallIdsRef.current.add(call.id);
      setNewCallNoticeId(call.id);
      highlightNewCall(call.id);
      playNotificationSound();
      showBrowserNotification(call);
    },
    [highlightNewCall, playNotificationSound, showBrowserNotification],
  );

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
      const nextCalls = Array.isArray(json.calls) ? json.calls : [];
      const nextIds = new Set(nextCalls.map((call) => call.id));
      if (callsInitializedRef.current) {
        const pendingInsertId = pendingApplicationInsertIdRef.current;
        const newCall =
          (pendingInsertId
            ? nextCalls.find((call) => call.id === pendingInsertId && isNewCall(call))
            : undefined) ??
          nextCalls.find(
            (call) => !knownCallIdsRef.current.has(call.id) && isNewCall(call),
          );
        if (newCall) {
          handleNewCallArrived(newCall);
        }
        pendingApplicationInsertIdRef.current = null;
      } else {
        callsInitializedRef.current = true;
      }
      knownCallIdsRef.current = nextIds;
      setCalls(nextCalls);
      const nextRegions = normalizeServiceRegions(json.service_regions);
      setServiceRegions(nextRegions);
      setSavedServiceRegions(nextRegions);
    } catch (e) {
      setCallsError(e instanceof Error ? e.message : String(e));
      setCalls([]);
    } finally {
      setCallsLoading(false);
    }
  }, [handleNewCallArrived]);

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

  const handleRealtimeRefresh = useCallback(() => {
    logRealtime("[realtime] reload calls");
    return loadCalls();
  }, [loadCalls]);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "partner-dashboard-live",
    // Supabase Realtime 수신을 위해 public.applications도 supabase_realtime publication에 포함되어야 합니다.
    tables: ["applications", "driver_quotes", "guest_driver_quotes"],
    enabled: !checking,
    debounceMs: 800,
    onRefresh: handleRealtimeRefresh,
    onEvent: (payload) => {
      const table = String(payload.table ?? "");
      const eventType = String(payload.eventType ?? "");
      if (table === "applications" && eventType === "INSERT") {
        logRealtime("[realtime] applications INSERT", payload);
        const insertedId =
          typeof payload.new?.id === "string" ? payload.new.id : null;
        pendingApplicationInsertIdRef.current = insertedId;
        const optimisticCall = payload.new ? buildOptimisticCall(payload.new) : null;
        if (optimisticCall && isNewCall(optimisticCall)) {
          const selectedRegions = savedServiceRegionsRef.current;
          const callRegion = normalizeRegion(optimisticCall.departure_region);
          if (
            selectedRegions.length === 0 ||
            (callRegion !== "" && selectedRegions.includes(callRegion))
          ) {
            setCalls((prev) => {
              if (prev.some((call) => call.id === optimisticCall.id)) return prev;
              return [optimisticCall, ...prev];
            });
            knownCallIdsRef.current.add(optimisticCall.id);
            handleNewCallArrived(optimisticCall);
          }
        }
      } else if (table === "applications" && eventType === "UPDATE") {
        logRealtime("[realtime] applications UPDATE", payload);
      } else if (
        (table === "driver_quotes" || table === "guest_driver_quotes") &&
        (eventType === "INSERT" || eventType === "UPDATE")
      ) {
        logRealtime(`[realtime] ${table} ${eventType}`, payload);
      }
    },
  });

  useEffect(() => {
    if (realtimeStatus !== "connected" || realtimeSubscribedLoggedRef.current) return;
    realtimeSubscribedLoggedRef.current = true;
    logRealtime("[realtime] partner-dashboard subscribed");
  }, [realtimeStatus]);

  useEffect(() => {
    savedServiceRegionsRef.current = savedServiceRegions;
  }, [savedServiceRegions]);

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(PARTNER_NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
      setNotificationPermission(
        "Notification" in window ? window.Notification.permission : "unsupported",
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, []);

  const toggleSound = async () => {
    const next = !soundEnabled;
    if (next) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextCtor && !audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
    }
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(
        PARTNER_NOTIFICATION_SOUND_PREF_KEY,
        next ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  };

  const requestBrowserNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const nextPermission = await window.Notification.requestPermission();
    setNotificationPermission(nextPermission);
  };

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

  const newCalls = calls.filter(isNewCall);
  const quotedCalls = calls.filter(isQuotedCall);
  const matchedCalls = calls.filter(isMatchedCall);
  const visibleCalls =
    activeTab === "new"
      ? newCalls
      : activeTab === "quoted"
        ? quotedCalls
        : matchedCalls;
  const activeTabMeta =
    DASHBOARD_TABS.find((tab) => tab.id === activeTab) ?? DASHBOARD_TABS[0];
  const tabCounts: Record<DashboardTab, number> = {
    new: newCalls.length,
    quoted: quotedCalls.length,
    matched: matchedCalls.length,
  };

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
    if (call.my_quote?.source === "member") return;
    setActiveQuoteCallId(call.id);
    setActiveReferralCallId(null);
    setQuoteForm({
      ...emptyQuoteForm,
      price: call.my_quote?.source === "guest" && call.my_quote.price != null
        ? String(call.my_quote.price)
        : "",
      vehicleType:
        call.my_quote?.source === "guest" ? call.my_quote.vehicle_type : "",
      availableTime:
        call.my_quote?.source === "guest" ? call.my_quote.available_time : "",
      message: call.my_quote?.source === "guest" ? call.my_quote.message : "",
      supportDiscountAmount: String(call.estimated_support_amount),
    });
    setQuoteMessage(null);
  };

  const closeQuoteForm = () => {
    if (quoteBusy) return;
    setActiveQuoteCallId(null);
    setQuoteForm(emptyQuoteForm);
    setQuoteMessage(null);
  };

  const openReferralForm = (call: PartnerCall) => {
    if (isQuoteClosed(call)) return;
    setActiveReferralCallId(call.id);
    setActiveQuoteCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
    setReferralResults([]);
  };

  const closeReferralForm = () => {
    if (referralBusy) return;
    setActiveReferralCallId(null);
    setReferralForm(emptyReferralForm);
    setReferralMessage(null);
    setReferralResults([]);
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
          support_discount_amount: supportDiscountFor(
            call,
            quoteForm.supportDiscountAmount,
          ),
          sponsor_discounted_price: discountedPriceFor(
            call,
            quoteForm.price,
            quoteForm.supportDiscountAmount,
          ),
          vehicle_type: quoteForm.vehicleType,
          available_time: quoteForm.availableTime,
          message: quoteForm.message,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        quote_type?: "guest" | "member";
        quote?: { id?: string; price?: number | null };
      };
      if (!res.ok) {
        if (json.error === "already_quoted") {
          setQuoteMessage("이미 이 견적요청에 견적서를 제출했습니다.");
          void loadCalls();
          return;
        }
        setQuoteMessage(json.error ?? "견적 제출에 실패했습니다.");
        return;
      }
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
    if (isQuoteClosed(call)) {
      setReferralMessage("이미 마감되었거나 매칭 완료된 견적입니다.");
      return;
    }
    setReferralBusy(true);
    setReferralMessage(null);
    setReferralResults([]);
    try {
      const phones = parseReferralPhones(referralForm.phones);
      const res = await fetch("/api/partner/quote-referrals", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: call.id,
          phones,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        success_count?: number;
        fail_count?: number;
        skipped_count?: number;
        results?: ReferralResult[];
      };
      if (!res.ok) {
        setReferralMessage(
          json.error === "quote_closed"
            ? "이미 마감되었거나 매칭 완료된 견적입니다."
            : (json.error ?? "문자 발송에 실패했습니다."),
        );
        return;
      }
      setReferralResults(Array.isArray(json.results) ? json.results : []);
      setReferralMessage(
        `발송 ${json.success_count ?? 0}건 · 실패 ${json.fail_count ?? 0}건 · 중복 ${json.skipped_count ?? 0}건`,
      );
      if ((json.success_count ?? 0) > 0) {
        setReferralForm(emptyReferralForm);
      }
    } catch (e) {
      setReferralMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setReferralBusy(false);
    }
  };

  const confirmDriverContract = async (call: PartnerCall) => {
    setContractBusy(true);
    setQuoteMessage(null);
    try {
      const res = await fetch("/api/partner/contract-confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: call.id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setQuoteMessage(json.error ?? "계약 확인에 실패했습니다.");
        return;
      }
      setQuoteMessage("기사 계약 확인이 완료되었습니다.");
      setContractDetailCall(null);
      setContractChecks({ preview: false, route: false, deposit: false, support: false });
      void loadCalls();
    } catch (e) {
      setQuoteMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setContractBusy(false);
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
      <style>{`
        @keyframes partner-new-call-glow {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.45), 0 18px 45px rgba(15, 23, 42, 0.08);
            transform: translateY(-2px);
          }
          45% {
            box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.18), 0 22px 55px rgba(37, 99, 235, 0.16);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0), 0 1px 3px rgba(15, 23, 42, 0.08);
            transform: translateY(0);
          }
        }
      `}</style>
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
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
                {realtimeStatusLabel(realtimeStatus)}
              </span>
              <button
                type="button"
                onClick={() => void toggleSound()}
                className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-black shadow-sm transition ${
                  soundEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
                style={tapStyle}
              >
                {soundEnabled ? "알림음 끄기" : "알림음 켜기"}
              </button>
              <button
                type="button"
                onClick={() => void requestBrowserNotifications()}
                disabled={
                  notificationPermission === "granted" ||
                  notificationPermission === "unsupported"
                }
                className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  notificationPermission === "granted"
                    ? "border-blue-200 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
                style={tapStyle}
              >
                {notificationPermission === "granted"
                  ? "브라우저 알림 켜짐"
                  : notificationPermission === "unsupported"
                    ? "브라우저 알림 미지원"
                    : "브라우저 알림 켜기"}
              </button>
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

          {newCallNoticeId ? (
            <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-black">새 견적요청이 도착했습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    scrollToCall(newCallNoticeId);
                    setNewCallNoticeId(null);
                  }}
                  className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                >
                  확인하기
                </button>
              </div>
            </div>
          ) : null}

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

          {quoteDetailCall?.my_quote ? (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-quote-detail-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="닫기"
                onClick={() => setQuoteDetailCall(null)}
              />
              <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
                <h2
                  id="partner-quote-detail-title"
                  className="text-lg font-black tracking-[-0.04em] text-slate-950"
                >
                  내 견적 상세
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {formatRouteWithStopovers(
                    quoteDetailCall.departure,
                    quoteDetailCall.stopovers,
                    quoteDetailCall.destination,
                  )}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      제출 방식
                    </dt>
                    <dd className="mt-1 font-black text-slate-900">
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "비회원 시 제출한 견적"
                        : "회원 견적"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "비회원 제출가"
                        : "일반 견적가"}
                    </dt>
                    <dd className="mt-1 font-black text-blue-900">
                      {formatPrice(quoteDetailCall.my_quote.price)}
                    </dd>
                  </div>
                  {quoteDetailCall.my_quote.source === "member" &&
                  quoteDetailCall.my_quote.sponsor_quote_enabled ? (
                    <>
                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                        <dt className="text-[11px] font-bold text-blue-500">
                          예상 지원금
                        </dt>
                        <dd className="mt-1 font-black text-blue-900">
                          약{" "}
                          {formatPrice(
                            quoteDetailCall.my_quote.estimated_support_amount ??
                              quoteDetailCall.my_quote.sponsor_support_amount ??
                              0,
                          )}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                        <dt className="text-[11px] font-bold text-blue-500">
                          고객 반영 지원금
                        </dt>
                        <dd className="mt-1 font-black text-blue-900">
                          {formatPrice(
                            quoteDetailCall.my_quote.support_discount_amount ??
                              quoteDetailCall.my_quote.sponsor_support_amount ??
                              0,
                          )}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                        <dt className="text-[11px] font-bold text-blue-500">
                          지원금 적용 고객가
                        </dt>
                        <dd className="mt-1 font-black text-blue-900">
                          {formatPrice(
                            quoteDetailCall.my_quote.member_price ??
                              quoteDetailCall.my_quote
                                .sponsor_discounted_price ??
                              null,
                          )}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      차량유형
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.vehicle_type}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      가능 출발시간
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.available_time}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">메모</dt>
                    <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.message.trim() === ""
                        ? "—"
                        : quoteDetailCall.my_quote.message}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      제출일시
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {formatSubmittedAt(quoteDetailCall.my_quote.created_at)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      견적 상태
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {quoteDetailCall.my_quote.status}
                      {quoteDetailCall.my_quote.source === "guest" &&
                      quoteDetailCall.my_quote.match_result ? (
                        <span className="ml-2 text-xs font-bold text-slate-500">
                          (매칭: {quoteDetailCall.my_quote.match_result})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div
                    className={`rounded-xl p-3 ring-1 ${
                      quoteDetailCall.my_quote.source === "guest"
                        ? "bg-amber-50 ring-amber-100"
                        : "bg-blue-50 ring-blue-100"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold leading-5 ${
                        quoteDetailCall.my_quote.source === "guest"
                          ? "text-amber-900"
                          : "text-blue-900"
                      }`}
                    >
                      {quoteDetailCall.my_quote.source === "guest"
                        ? "비회원 견적은 지원금 미적용가입니다. 회원 전환 후 지원금 적용 견적을 다시 제출할 수 있습니다."
                        : "지원금 적용가는 후원사 심사 결과에 따라 변동 또는 거절될 수 있습니다."}
                    </p>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                  onClick={() => setQuoteDetailCall(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}

          {customerDetailCall ? (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-customer-detail-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="닫기"
                onClick={() => setCustomerDetailCall(null)}
              />
              <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
                <h2
                  id="partner-customer-detail-title"
                  className="text-lg font-black tracking-[-0.04em] text-slate-950"
                >
                  고객정보 확인
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {customerDetailCall.receipt_number || "신청번호 미정"}
                </p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <dt className="text-[11px] font-bold text-emerald-600">
                      고객명
                    </dt>
                    <dd className="mt-1 font-black text-emerald-950">
                      {customerDetailCall.customer_name || "—"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <dt className="text-[11px] font-bold text-emerald-600">
                      고객 전화번호
                    </dt>
                    <dd className="mt-2">
                      {customerDetailCall.customer_phone ? (
                        <div className="flex flex-col gap-2">
                          <p className="font-black text-emerald-950">
                            {customerDetailCall.customer_phone}
                          </p>
                          <div className="flex gap-2">
                            <a
                              href={`tel:${customerDetailCall.customer_phone}`}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-black text-white"
                              style={tapStyle}
                            >
                              전화하기
                            </a>
                            <a
                              href={`sms:${customerDetailCall.customer_phone}`}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 text-sm font-black text-emerald-900"
                              style={tapStyle}
                            >
                              문자보내기
                            </a>
                          </div>
                        </div>
                      ) : (
                        <span className="font-semibold text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">출발지</dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {customerDetailCall.departure}
                    </dd>
                  </div>
                  {formatStopovers(customerDetailCall.stopovers) ? (
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        경유지
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatStopovers(customerDetailCall.stopovers)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">도착지</dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {customerDetailCall.destination}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      출발일시
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {formatDeparture(customerDetailCall)}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        인원수
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.passenger_count ?? "—"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        왕복/편도
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.trip_type}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        일반/프리미엄
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.bus_grade}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <dt className="text-[11px] font-bold text-slate-400">
                        계약상태
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {customerDetailCall.contract_status || "—"}
                      </dd>
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                    <dt className="text-[11px] font-bold text-slate-400">
                      요청사항
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">
                      {customerDetailCall.request_message?.trim()
                        ? customerDetailCall.request_message
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm"
                  style={tapStyle}
                  onClick={() => setCustomerDetailCall(null)}
                >
                  닫기
                </button>
              </div>
            </div>
          ) : null}

          {contractDetailCall?.my_quote ? (
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-contract-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="닫기"
                onClick={() => setContractDetailCall(null)}
              />
              <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
                <h2 id="partner-contract-title" className="text-lg font-black text-slate-950">
                  전자계약 진행
                </h2>
                <button
                  type="button"
                  onClick={() => setContractPreviewCall(contractDetailCall)}
                  className="mt-3 min-h-10 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-black text-indigo-900"
                >
                  전자계약서 보기
                </button>
                <div className="mt-4 space-y-2 text-sm font-semibold text-slate-700">
                  <p>고객: {contractDetailCall.customer_name || "—"}</p>
                  <p>전화: {contractDetailCall.customer_phone || "—"}</p>
                  <p>
                    운행:{" "}
                    {formatRouteWithStopovers(
                      contractDetailCall.departure,
                      contractDetailCall.stopovers,
                      contractDetailCall.destination,
                    )}
                  </p>
                  <p>출발일시: {formatDeparture(contractDetailCall)}</p>
                  <p>내 견적금액: {formatPrice(contractDetailCall.my_quote.price)}</p>
                  {contractDetailCall.my_quote.member_price != null ? (
                    <p>지원금 적용가: {formatPrice(contractDetailCall.my_quote.member_price)}</p>
                  ) : null}
                  <p>
                    기사 지원금 예상액:{" "}
                    {formatPrice(contractDetailCall.my_quote.driver_support_amount ?? null)}
                  </p>
                  <p>
                    고객 감사지원금 예상액:{" "}
                    {formatPrice(contractDetailCall.my_quote.client_reward_amount ?? null)}
                  </p>
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    예약금/노쇼 정책은 관리자 확인 기준으로 진행됩니다. 양측 확인 완료 후 예약금 입금 대기 상태로 전환됩니다.
                  </p>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    ["preview", "전자계약서 내용을 확인했습니다."],
                    ["route", "운행 정보와 고객 정보를 확인했습니다."],
                    ["deposit", "예약금/노쇼 정책을 확인했습니다."],
                    ["support", "후원업체 지원금은 심사 결과에 따라 변동될 수 있음을 확인했습니다."],
                  ].map(([key, label]) => (
                    <label key={key} className="flex gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={contractChecks[key as keyof typeof contractChecks]}
                        onChange={(event) =>
                          setContractChecks((prev) => ({
                            ...prev,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={
                    contractBusy ||
                    !contractChecks.route ||
                    !contractChecks.preview ||
                    !contractChecks.deposit ||
                    !contractChecks.support ||
                    contractDetailCall.driver_contract_confirmed_at !== ""
                  }
                  onClick={() => void confirmDriverContract(contractDetailCall)}
                  className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-indigo-600 text-sm font-black text-white shadow-sm disabled:opacity-50"
                  style={tapStyle}
                >
                  {contractDetailCall.driver_contract_confirmed_at
                    ? "기사 확인 완료"
                    : contractBusy
                      ? "처리 중…"
                      : "기사 계약 확인"}
                </button>
              </div>
            </div>
          ) : null}

          {contractPreviewCall ? (
            <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-4 py-8 backdrop-blur-[2px]">
              <div className="w-full max-w-3xl">
                {contractPreviewDataForCall(contractPreviewCall) ? (
                  <ContractPreview
                    data={contractPreviewDataForCall(contractPreviewCall)!}
                    onClose={() => setContractPreviewCall(null)}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="-mx-1 overflow-x-auto px-1 pb-2">
              <div className="flex min-w-max gap-2">
                {DASHBOARD_TABS.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setActiveQuoteCallId(null);
                        setActiveReferralCallId(null);
                      }}
                      className={`min-h-11 shrink-0 rounded-2xl border px-4 text-sm font-black transition ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-900/20"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {tab.label} ({tabCounts[tab.id]})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {callsLoading && calls.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                대기중인 콜을 불러오는 중…
              </div>
            ) : visibleCalls.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-black text-slate-700">
                  {activeTabMeta.empty}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  새 신청이 들어오면 새로고침으로 확인할 수 있습니다.
                </p>
              </div>
            ) : (
              visibleCalls.map((call) => {
                const memberQuoted = call.my_quote?.source === "member";
                const guestOnlyQuoted = call.my_quote?.source === "guest";
                const formOpen = activeQuoteCallId === call.id;
                const referralOpen = activeReferralCallId === call.id;
                const quoteClosed = isQuoteClosed(call);
                const customerInfoVisible = canRevealCustomerInfo(call);
                const rideConfirmed =
                  call.contract_status === "ride_confirmed" ||
                  call.deposit_status === "paid" ||
                  call.deposit_status === "waived";
                const highlightedNewCall = highlightedNewCallIds.has(call.id);
                const driverSupportAmount = Math.round(
                  (call.estimated_support_amount * call.support_driver_ratio) / 100,
                );
                const clientRewardAmount = Math.max(
                  call.estimated_support_amount - driverSupportAmount,
                  0,
                );
                const provisionalSelected =
                  call.my_quote != null &&
                  call.auto_selected_quote_id === call.my_quote.id &&
                  call.final_selected_quote_id.trim() === "";
                const supportDiscountValue = supportDiscountFor(
                  call,
                  quoteForm.supportDiscountAmount,
                );
                const quotePriceValue = parsePriceInput(quoteForm.price);
                const supportDiscountInvalid =
                  supportDiscountValue > call.estimated_support_amount;
                const customerPerceivedPrice =
                  quotePriceValue == null
                    ? null
                    : Math.max(0, quotePriceValue - supportDiscountValue);
                const quoteDriverSupportAmount = Math.max(
                  call.estimated_support_amount - supportDiscountValue,
                  0,
                );
                return (
                  <article
                    key={call.id}
                    id={`partner-call-${call.id}`}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ring-1 transition ${
                      highlightedNewCall
                        ? "border-blue-300 ring-blue-200"
                        : "border-slate-200 ring-slate-100"
                    }`}
                    style={
                      highlightedNewCall
                        ? { animation: "partner-new-call-glow 3s ease-out" }
                        : undefined
                    }
                  >
                    <div
                      className={`mb-4 rounded-2xl border px-4 py-3 ${
                        quoteClosed
                          ? "border-slate-200 bg-slate-100 text-slate-700"
                          : "border-orange-100 bg-orange-50 text-orange-950"
                      }`}
                    >
                      <p className="text-sm font-black">
                        {quoteClosed ? "견적 마감됨" : "실시간 견적 수집 중"}
                        {call.extension_round > 0 ? (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-black ring-1 ring-slate-200">
                            {call.extension_round}회차 자동연장
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                        {call.quote_deadline_at ? (
                          <span>⏰ {formatRemaining(call.quote_deadline_at)}</span>
                        ) : null}
                        {call.quote_limit_count != null ? (
                          <span>
                            📦 견적 {call.quote_count} / {call.quote_limit_count}
                          </span>
                        ) : (
                          <span>📦 견적 {call.quote_count}건</span>
                        )}
                        {call.target_normal_price != null ? (
                          <span>🎯 목표가 {formatPrice(call.target_normal_price)}</span>
                        ) : null}
                        {call.target_member_price != null ? (
                          <span>
                            🔥 지원금 견적 목표 {formatPrice(call.target_member_price)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mb-4">
                      <QuoteStatusSummary
                        quoteStatus={call.quote_status}
                        quoteDeadlineAt={call.quote_deadline_at}
                        autoFinalConfirmAt={call.auto_final_confirm_at}
                        quoteCount={call.quote_count}
                        quoteLimitCount={call.quote_limit_count}
                        targetNormalPrice={call.target_normal_price}
                        targetMemberPrice={call.target_member_price}
                        compact
                      />
                    </div>
                    {provisionalSelected ? (
                      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-950">
                        <p className="font-black">최저가 자동매칭 되었습니다.</p>
                        <p>최종 확정 시 고객 연락처가 공개됩니다.</p>
                        <p className="text-xs text-emerald-800">
                          확정매칭은 고객 또는 관리자 선택에 따라 변경될 수 있습니다.
                        </p>
                      </div>
                    ) : null}
                    {rideConfirmed ? (
                      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-950">
                        <p className="font-black">배차 확정 완료</p>
                        <p>운행 준비를 진행해주세요.</p>
                      </div>
                    ) : null}
                    {activeTab === "quoted" ? (
                      <div className="mb-4 grid gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-xs sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100">
                          <p className="font-bold text-blue-500">제출 상태</p>
                          <p className="mt-1 font-black text-blue-950">제출 완료</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100">
                          <p className="font-bold text-blue-500">선정 상태</p>
                          <p className="mt-1 font-black text-blue-950">
                            {quoteStatusLabel(call)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-blue-100">
                          <p className="font-bold text-blue-500">평균가 대비</p>
                          <p className="mt-1 font-black text-blue-950">
                            {averageStatusLabel(call)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {activeTab === "matched" ? (
                      <div className="mb-4 grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-xs sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                          <p className="font-bold text-emerald-600">매칭 상태</p>
                          <p className="mt-1 font-black text-emerald-950">
                            {quoteStatusLabel(call)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                          <p className="font-bold text-emerald-600">고객 공개</p>
                          <p className="mt-1 font-black text-emerald-950">
                            {call.final_selected_quote_id.trim() !== ""
                              ? "고객정보 공개 가능"
                              : "최종 확정 대기"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                          <p className="font-bold text-emerald-600">전자계약</p>
                          <p className="mt-1 font-black text-emerald-950">
                            {call.contract_status.trim() !== ""
                              ? call.contract_status
                              : "최종 확정 후 진행"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                          <p className="font-bold text-emerald-600">지원금 예상액</p>
                          <p className="mt-1 font-black text-emerald-950">
                            {formatPrice(call.estimated_support_amount)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100 sm:col-span-2">
                          <p className="font-bold text-emerald-600">
                            고객 감사지원금 비율
                          </p>
                          <p className="mt-1 font-black text-emerald-950">
                            고객 {call.support_client_reward_ratio}% · 기사{" "}
                            {call.support_driver_ratio}%
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          {call.receipt_number || "신규 콜"}
                          {highlightedNewCall ? (
                            <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
                              NEW
                            </span>
                          ) : null}
                        </p>
                        <h2 className="mt-1 text-lg font-black tracking-[-0.03em] text-slate-900">
                          {formatRouteWithStopovers(
                            call.departure,
                            call.stopovers,
                            call.destination,
                          )}
                        </h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {formatDeparture(call)}
                        </p>
                        {formatStopovers(call.stopovers) ? (
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            경유지: {formatStopovers(call.stopovers)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        {activeTab === "matched" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setCustomerDetailCall(call)}
                              disabled={!customerInfoVisible}
                              title={
                                customerInfoVisible
                                  ? undefined
                                  : "최종확정 후 고객정보가 공개됩니다."
                              }
                              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                              style={tapStyle}
                            >
                              {customerInfoVisible
                                ? "고객정보 확인"
                                : "최종확정 후 고객정보가 공개됩니다."}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setContractChecks({ preview: false, route: false, deposit: false, support: false });
                                setContractDetailCall(call);
                              }}
                              disabled={!customerInfoVisible}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-900 shadow-sm transition hover:bg-blue-100"
                              style={tapStyle}
                            >
                              전자계약 진행
                            </button>
                            <button
                              type="button"
                              onClick={() => setContractPreviewCall(call)}
                              disabled={!customerInfoVisible}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 text-sm font-black text-indigo-900 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50"
                              style={tapStyle}
                            >
                              전자계약서 보기
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
                              style={tapStyle}
                            >
                              계약 완료 상태 보기
                            </button>
                          </>
                        ) : activeTab === "quoted" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setQuoteDetailCall(call)}
                              className="inline-flex min-h-10 max-w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm font-black text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                              style={tapStyle}
                            >
                              내 견적 보기
                            </button>
                            {guestOnlyQuoted ? (
                              <button
                                type="button"
                                onClick={() => openQuoteForm(call)}
                                disabled={quoteClosed}
                                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                style={tapStyle}
                              >
                                회원 지원금 견적 추가 제출
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openQuoteForm(call)}
                              disabled={quoteClosed}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-300"
                              style={tapStyle}
                            >
                              {quoteClosed ? "견적 마감됨" : "견적 제출"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReferralForm(call)}
                              disabled={quoteClosed}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-emerald-50"
                              style={tapStyle}
                            >
                              {quoteClosed ? "전달 종료" : "동료기사에게 전달"}
                            </button>
                          </>
                        )}
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
                      {formatStopovers(call.stopovers) ? (
                        <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
                          <dt className="text-[11px] font-bold text-slate-400">
                            경유지
                          </dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {formatStopovers(call.stopovers)}
                          </dd>
                        </div>
                      ) : null}
                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                        <dt className="text-[11px] font-bold text-blue-500">
                          예상 지원금
                        </dt>
                        <dd className="mt-1 font-black text-blue-900">
                          약 {formatPrice(call.estimated_support_amount)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
                        <dt className="text-[11px] font-bold text-blue-500">
                          기사 예상 지원금
                        </dt>
                        <dd className="mt-1 font-black text-blue-900">
                          약 {formatPrice(driverSupportAmount)}
                        </dd>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100">
                        <dt className="text-[11px] font-bold text-amber-600">
                          고객 감사지원금
                        </dt>
                        <dd className="mt-1 font-black text-amber-900">
                          약 {formatPrice(clientRewardAmount)}
                        </dd>
                      </div>
                    </dl>

                    {formOpen && !memberQuoted && !quoteClosed ? (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                        {guestOnlyQuoted ? (
                          <div className="mb-4 rounded-2xl border border-amber-200 bg-white p-4">
                            <p className="text-xs font-black text-amber-800">
                              기존 비회원 견적 참고
                            </p>
                            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="font-bold text-slate-400">비회원 제출가</dt>
                                <dd className="font-black text-slate-900">
                                  {formatPrice(call.my_quote?.price ?? null)}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-bold text-slate-400">제출일시</dt>
                                <dd className="font-semibold text-slate-800">
                                  {formatSubmittedAt(call.my_quote?.created_at ?? "")}
                                </dd>
                              </div>
                              <div>
                                <dt className="font-bold text-slate-400">차량유형</dt>
                                <dd className="font-semibold text-slate-800">
                                  {call.my_quote?.vehicle_type ?? "—"}
                                </dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="font-bold text-slate-400">메모</dt>
                                <dd className="whitespace-pre-wrap font-semibold text-slate-800">
                                  {call.my_quote?.message?.trim()
                                    ? call.my_quote.message
                                    : "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-bold text-slate-500">
                              일반 운행가
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
                          <div className="rounded-xl border border-blue-100 bg-white p-3">
                            <p className="text-xs font-bold text-blue-500">
                              예상 지원금
                            </p>
                            <p className="mt-1 text-sm font-black text-blue-900">
                              약 {formatPrice(call.estimated_support_amount)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-100 bg-white p-3 sm:col-span-2">
                            <p className="text-xs font-bold text-amber-600">
                              지원금 분리 예상
                            </p>
                            <p className="mt-1 text-sm font-black text-slate-900">
                              기사 {formatPrice(driverSupportAmount)} · 고객 감사{" "}
                              {formatPrice(clientRewardAmount)}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
                              후원사 심사 결과에 따라 최종 지원금은 변경될 수 있습니다.
                            </p>
                          </div>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-bold text-slate-500">
                              고객에게 반영할 지원금
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={quoteForm.supportDiscountAmount}
                              onChange={(e) =>
                                setQuoteForm((prev) => ({
                                  ...prev,
                                  supportDiscountAmount: e.target.value.replace(/[^\d]/g, ""),
                                }))
                              }
                              placeholder="예상 지원금 전액이 기본값입니다"
                              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">
                              기사님이 후원 지원금을 얼마나 고객에게 반영할지 직접 결정할 수 있습니다.
                              예상 지원금 한도 내에서 입력해 주세요.
                            </span>
                            <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">
                              기사 예상 수령 지원금: {formatPrice(quoteDriverSupportAmount)}
                            </span>
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-xs font-bold text-slate-500">
                              고객 체감가
                            </span>
                            <input
                              type="text"
                              readOnly
                              value={
                                customerPerceivedPrice == null
                                  ? ""
                                  : String(customerPerceivedPrice)
                              }
                              placeholder="일반 운행가 입력 시 자동 계산"
                              className="mt-1 min-h-11 w-full rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-black text-blue-900 outline-none"
                            />
                            <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-500">
                              * 지원금 적용가는 후원사 심사 결과에 따라 변동 또는 거절될 수 있습니다.
                            </span>
                            {customerPerceivedPrice === 0 ? (
                              <span className="mt-2 block rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black leading-5 text-emerald-900">
                                🎉 후원업체 지원으로 고객 부담금 0원 예상
                              </span>
                            ) : null}
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
                              quoteForm.availableTime.trim() === "" ||
                              supportDiscountInvalid
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
                          <textarea
                            value={referralForm.phones}
                            onChange={(e) =>
                              setReferralForm({
                                phones: e.target.value,
                              })
                            }
                            placeholder={"010-1111-2222\n010-3333-4444, 010-5555-6666"}
                            className="mt-1 min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
                            줄바꿈, 쉼표, 공백, 세미콜론으로 구분합니다. 한 번에 최대 20명까지 전달할 수 있습니다.
                          </span>
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
                              quoteClosed ||
                              referralBusy ||
                              parseReferralPhones(referralForm.phones).length === 0
                            }
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {quoteClosed
                              ? "마감된 견적"
                              : referralBusy
                                ? "발송 중…"
                                : "동료에게 문자발송"}
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
                        {referralResults.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-xs font-black text-slate-500">
                              발송 결과
                            </p>
                            <ul className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                              {referralResults.map((result, index) => (
                                <li
                                  key={`${result.phone}-${index}`}
                                  className="flex justify-between gap-3"
                                >
                                  <span className="font-mono">{result.phone}</span>
                                  <span
                                    className={
                                      result.status === "sent"
                                        ? "text-emerald-700"
                                        : result.status === "skipped_duplicate"
                                          ? "text-amber-700"
                                          : "text-red-700"
                                    }
                                  >
                                    {referralStatusLabel(result.status)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
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
