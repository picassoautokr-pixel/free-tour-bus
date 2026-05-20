"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";

import {
  SponsorCallCard,
  type SponsorCardForm,
} from "@/components/sponsor/SponsorCallCard";
import { SponsorReportCards } from "@/components/sponsor/SponsorReportCards";
import { SERVICE_REGIONS } from "@/lib/regions";
import { roleLoginPath } from "@/lib/role-hosts";
import {
  isConfirmedCall,
  isReviewCall,
  matchesPayoutFilter,
  type SponsorCallRow,
  type SponsorSummary,
} from "@/lib/sponsor-call-view-model";
import {
  LABEL,
  PAYOUT_FILTERS,
  SPONSOR_DASHBOARD_TITLE,
  SPONSOR_MAIN_TABS,
  type CardExpandMode,
  type ConfirmedPayoutFilter,
  type SponsorMainTab,
} from "@/lib/sponsor-dashboard-labels";
import {
  catalogFromSettings,
  parseDashboardSettings,
  type SponsorDashboardSettings,
} from "@/lib/sponsor-catalog";
import {
  SPONSOR_SUPPORT_TYPES,
  sponsorSupportTypeLabel,
  safeText,
} from "@/lib/sponsor";
import { createSponsorBrowserClient } from "@/lib/supabase";
import {
  realtimeStatusLabel,
  useSupabaseRealtimeRefresh,
} from "@/hooks/useSupabaseRealtimeRefresh";

const SPONSOR_NOTIFICATION_SOUND_PREF_KEY = "sponsorDashboardSoundEnabled";
const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

type Rule = Record<string, unknown> & { id: string; title?: string; is_active?: boolean };
type Staff = Record<string, unknown> & {
  id: string;
  name?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
};

type SettingsSubTab = "rules" | "staff" | "catalog";

function defaultFormFromCall(call: SponsorCallRow): SponsorCardForm {
  return {
    amount: String(call.approved_support_amount ?? call.estimated_support_amount ?? ""),
    staffId: call.assigned_staff_id ?? "",
    memo: call.decision_memo ?? "",
    supportKind: call.support_kind?.trim() || call.sponsor_rule_title?.trim() || "",
    supportForm: call.support_form_kind?.trim() || call.support_type?.trim() || "",
    supportCondition:
      call.support_condition_label?.trim() || call.support_condition?.trim() || "",
    payoutStatus: call.payout_status === "completed" ? "completed" : "processing",
    cancelReason: "",
    cancelReasonCustom: "",
  };
}

function buildCancelMemo(form: SponsorCardForm): string {
  const custom = form.cancelReasonCustom.trim();
  if (form.cancelReason === "기타" && custom) return custom;
  return [form.cancelReason, custom].filter(Boolean).join(" — ");
}

export default function SponsorDashboardPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<SponsorMainTab>("review");
  const [payoutFilter, setPayoutFilter] = useState<ConfirmedPayoutFilter>("all");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("rules");
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [calls, setCalls] = useState<SponsorCallRow[]>([]);
  const [summary, setSummary] = useState<SponsorSummary | null>(null);
  const [catalog, setCatalog] = useState({
    supportKinds: [] as string[],
    supportForms: [] as string[],
    supportConditions: [] as string[],
  });
  const [catalogDraft, setCatalogDraft] = useState<SponsorDashboardSettings>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [expandedDetailId, setExpandedDetailId] = useState<string | null>(null);
  const [actionByCallId, setActionByCallId] = useState<Record<string, CardExpandMode>>({});
  const [formsByCallId, setFormsByCallId] = useState<Record<string, SponsorCardForm>>({});
  const [busyCallId, setBusyCallId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({
    id: "",
    title: "",
    service_regions: [] as string[],
    support_per_person: "",
    support_per_case: "",
    max_support_amount: "",
    min_passenger_count: "",
    max_passenger_count: "",
    target_group: "",
    support_condition: "",
    support_type: "cash",
    daily_budget: "",
    monthly_budget: "",
    is_active: true,
    memo: "",
  });
  const [staffForm, setStaffForm] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    role: "",
    service_regions: [] as string[],
    is_active: true,
  });
  const callIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const notificationPermissionRef = useRef<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    notificationPermissionRef.current = notificationPermission;
  }, [notificationPermission]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/dashboard", { credentials: "same-origin" });
      const json = (await res.json()) as {
        error?: string;
        approved?: boolean;
        company?: Record<string, unknown>;
        rules?: Rule[];
        staff?: Staff[];
        calls?: SponsorCallRow[];
        summary?: SponsorSummary | null;
        catalog?: {
          supportKinds: string[];
          supportForms: string[];
          supportConditions: string[];
        };
        dashboard_settings?: SponsorDashboardSettings;
      };
      if (!res.ok) {
        if ([401, 403, 404].includes(res.status)) {
          const supabase = createSponsorBrowserClient();
          await supabase.auth.signOut();
          router.replace(roleLoginPath("sponsor"));
          return;
        }
        setMessage(json.error ?? "후원업체 정보를 불러오지 못했습니다.");
        return;
      }
      setCompany(json.company ?? null);
      if (!json.approved) {
        setMessage("관리자 승인 후 후원업체 대시보드를 이용할 수 있습니다.");
        setRules([]);
        setStaff([]);
        setCalls([]);
        setSummary(null);
        return;
      }
      setRules(Array.isArray(json.rules) ? json.rules : []);
      setStaff(Array.isArray(json.staff) ? json.staff : []);
      const nextCalls = Array.isArray(json.calls) ? json.calls : [];
      const previousIds = callIdsRef.current;
      if (previousIds.size > 0 && nextCalls.some((call) => !previousIds.has(call.id))) {
        setToast(LABEL.newReviewToast);
        if (soundEnabledRef.current && audioContextRef.current) {
          try {
            const osc = audioContextRef.current.createOscillator();
            const gain = audioContextRef.current.createGain();
            osc.connect(gain);
            gain.connect(audioContextRef.current.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.08;
            osc.start();
            osc.stop(audioContextRef.current.currentTime + 0.12);
          } catch {
            /* ignore */
          }
        }
        if (notificationPermissionRef.current === "granted" && typeof window !== "undefined") {
          try {
            new window.Notification(SPONSOR_DASHBOARD_TITLE, {
              body: LABEL.newReviewToast,
            });
          } catch {
            /* ignore */
          }
        }
      }
      callIdsRef.current = new Set(nextCalls.map((call) => call.id));
      setCalls(nextCalls);
      setSummary(json.summary ?? null);
      const settings = parseDashboardSettings(json.dashboard_settings);
      setCatalogDraft(settings);
      setCatalog(
        json.catalog ?? catalogFromSettings(settings),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      setSoundEnabled(
        window.localStorage.getItem(SPONSOR_NOTIFICATION_SOUND_PREF_KEY) === "1",
      );
      setNotificationPermission(
        "Notification" in window ? window.Notification.permission : "unsupported",
      );
    } catch {
      /* ignore */
    }
  }, []);

  const realtimeStatus = useSupabaseRealtimeRefresh({
    channelName: "sponsor-dashboard-live",
    tables: ["sponsor_preapprovals"],
    enabled: company != null && safeText(company.status) === "approved",
    debounceMs: 800,
    onRefresh: load,
  });

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const reviewCalls = useMemo(
    () => calls.filter((call) => isReviewCall(call)),
    [calls],
  );

  const confirmedCalls = useMemo(
    () =>
      calls.filter(
        (call) => isConfirmedCall(call) && matchesPayoutFilter(call, payoutFilter),
      ),
    [calls, payoutFilter],
  );

  const mergedCatalog = useMemo(() => catalog, [catalog]);

  const getForm = (call: SponsorCallRow) =>
    formsByCallId[call.id] ?? defaultFormFromCall(call);

  const patchForm = (callId: string, call: SponsorCallRow, patch: Partial<SponsorCardForm>) => {
    setFormsByCallId((prev) => ({
      ...prev,
      [callId]: { ...(prev[callId] ?? defaultFormFromCall(call)), ...patch },
    }));
  };

  const setActionMode = (callId: string, mode: CardExpandMode) => {
    setActionByCallId((prev) => {
      const next = { ...prev };
      if (mode == null) delete next[callId];
      else next[callId] = mode;
      return next;
    });
  };

  const postPreapproval = async (
    callId: string,
    action: string,
    body: Record<string, unknown>,
  ) => {
    setBusyCallId(callId);
    setMessage(null);
    try {
      const res = await fetch("/api/sponsor/preapprovals/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, preapproval_id: callId, ...body }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(json?.error ?? "처리에 실패했습니다.");
        return;
      }
      setActionMode(callId, null);
      setExpandedDetailId(null);
      await load();
    } finally {
      setBusyCallId(null);
    }
  };

  const saveRule = async () => {
    await fetch("/api/sponsor/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ type: "rule", id: ruleForm.id, payload: ruleForm }),
    });
    setRuleForm((prev) => ({ ...prev, id: "", title: "" }));
    await load();
  };

  const saveStaff = async () => {
    await fetch("/api/sponsor/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ type: "staff", id: staffForm.id, payload: staffForm }),
    });
    setStaffForm({
      id: "",
      name: "",
      phone: "",
      email: "",
      role: "",
      service_regions: [],
      is_active: true,
    });
    await load();
  };

  const saveCatalogSettings = async () => {
    const res = await fetch("/api/sponsor/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        type: "settings",
        support_kinds: catalog.supportKinds,
        support_forms: catalog.supportForms,
        support_conditions: catalog.supportConditions,
        total_budget: catalogDraft.total_budget,
        monthly_budget: catalogDraft.monthly_budget,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(json?.error ?? "설정 저장에 실패했습니다.");
      return;
    }
    await load();
  };

  const addCatalogOption = (
    field: "supportKinds" | "supportForms" | "supportConditions",
    value: string,
  ) => {
    setCatalog((prev) => {
      const key =
        field === "supportKinds"
          ? "supportKinds"
          : field === "supportForms"
            ? "supportForms"
            : "supportConditions";
      if (prev[key].includes(value)) return prev;
      return { ...prev, [key]: [...prev[key], value] };
    });
  };

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
      window.localStorage.setItem(SPONSOR_NOTIFICATION_SOUND_PREF_KEY, next ? "1" : "0");
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

  const logout = async () => {
    const supabase = createSponsorBrowserClient();
    await supabase.auth.signOut();
    router.replace(roleLoginPath("sponsor"));
  };

  const settingsLinks: Array<{ id: SettingsSubTab; label: string }> = [
    { id: "rules", label: LABEL.settingsRules },
    { id: "staff", label: LABEL.settingsStaff },
    { id: "catalog", label: LABEL.settingsSupportKind },
  ];

  const listCalls = mainTab === "review" ? reviewCalls : confirmedCalls;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-4 py-6 pb-16 sm:px-5">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[120] w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-blue-900 shadow-xl ring-1 ring-blue-100">
          {toast}
        </div>
      ) : null}
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-black text-blue-600">{SPONSOR_DASHBOARD_TITLE}</p>
              <h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
                {safeText(company?.company_name, "후원업체")}
              </h1>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <p className="text-xs font-black text-slate-500">후원업체 프로필</p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {safeText(company?.company_name, "—")} · {safeText(company?.manager_name, "—")}
              </p>
              <p className="mt-0.5 text-xs font-bold text-slate-600">
                {safeText(company?.phone, "—")} · {LABEL.companyStatus}:{" "}
                {safeText(company?.status, "—")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">
                {realtimeStatusLabel(realtimeStatus)}
              </span>
              <button
                type="button"
                onClick={() => void toggleSound()}
                className={`min-h-10 rounded-xl border px-3 text-xs font-black ${
                  soundEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
                style={tapStyle}
              >
                {soundEnabled ? LABEL.soundOn : LABEL.soundOff}
              </button>
              <button
                type="button"
                onClick={() => void requestBrowserNotifications()}
                disabled={
                  notificationPermission === "granted" ||
                  notificationPermission === "unsupported"
                }
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-60"
                style={tapStyle}
              >
                {notificationPermission === "granted"
                  ? LABEL.browserNotifyOn
                  : LABEL.browserNotify}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50"
                style={tapStyle}
              >
                {loading ? LABEL.loading : LABEL.refresh}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-10 rounded-xl bg-slate-950 px-3 text-xs font-black text-white"
                style={tapStyle}
              >
                {LABEL.logout}
              </button>
            </div>
          </div>

          <SponsorReportCards summary={summary} />

          {message ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {SPONSOR_MAIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`min-h-10 rounded-xl px-4 text-sm font-black ${
                  mainTab === tab.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
                style={tapStyle}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mainTab === "settings" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {settingsLinks.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setSettingsSubTab(link.id)}
                  className={`min-h-9 rounded-full px-3 text-xs font-black ${
                    settingsSubTab === link.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {link.id === "catalog"
                    ? `${LABEL.settingsSupportKind} · ${LABEL.settingsSupportForm} · ${LABEL.settingsSupportCondition}`
                    : link.label}
                </button>
              ))}
            </div>
          ) : null}

          {mainTab === "confirmed" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {PAYOUT_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPayoutFilter(f.id)}
                  className={`min-h-9 rounded-full px-3 text-xs font-black ${
                    payoutFilter === f.id
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {mainTab === "review" || mainTab === "confirmed" ? (
          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                {LABEL.loading}
              </p>
            ) : listCalls.length === 0 ? (
              <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-slate-500">
                {mainTab === "review" ? LABEL.noReviewItems : LABEL.noConfirmedItems}
              </p>
            ) : (
              listCalls.map((call) => (
                <SponsorCallCard
                  key={call.id}
                  call={call}
                  listMode={mainTab === "review" ? "review" : "confirmed"}
                  detailExpanded={expandedDetailId === call.id}
                  onToggleDetail={() =>
                    setExpandedDetailId((prev) => (prev === call.id ? null : call.id))
                  }
                  actionMode={actionByCallId[call.id] ?? null}
                  onActionMode={(mode) => {
                    setActionMode(call.id, mode);
                    if (mode) {
                      setFormsByCallId((prev) => ({
                        ...prev,
                        [call.id]: prev[call.id] ?? defaultFormFromCall(call),
                      }));
                    }
                  }}
                  form={getForm(call)}
                  onFormChange={(patch) => patchForm(call.id, call, patch)}
                  catalog={mergedCatalog}
                  onAddCatalogOption={addCatalogOption}
                  staff={staff}
                  busy={busyCallId === call.id}
                  onSubmitApprove={() => {
                    const form = getForm(call);
                    void postPreapproval(call.id, "approve", {
                      approved_support_amount: form.amount,
                      assigned_staff_id: form.staffId,
                      decision_memo: form.memo,
                      support_kind: form.supportKind,
                      support_form_kind: form.supportForm,
                      support_condition_label: form.supportCondition,
                    });
                  }}
                  onSubmitReject={() => {
                    const form = getForm(call);
                    void postPreapproval(call.id, "reject", {
                      decision_memo: buildCancelMemo(form),
                    });
                  }}
                  onSubmitChange={() => {
                    const form = getForm(call);
                    void postPreapproval(call.id, "change", {
                      approved_support_amount: form.amount,
                      assigned_staff_id: form.staffId,
                      decision_memo: form.memo,
                      support_kind: form.supportKind,
                      support_form_kind: form.supportForm,
                      support_condition_label: form.supportCondition,
                      payout_status: form.payoutStatus,
                    });
                  }}
                  onSubmitRevert={() => {
                    void postPreapproval(call.id, "revert", {});
                  }}
                  onSubmitPayoutComplete={() => {
                    void postPreapproval(call.id, "payout", { payout_status: "completed" });
                  }}
                />
              ))
            )}
          </div>
        ) : null}

        {mainTab === "settings" && settingsSubTab === "rules" ? (
          <SponsorRulePanel rules={rules} form={ruleForm} setForm={setRuleForm} onSave={saveRule} />
        ) : null}
        {mainTab === "settings" && settingsSubTab === "staff" ? (
          <SponsorStaffPanel
            staff={staff}
            form={staffForm}
            setForm={setStaffForm}
            onSave={saveStaff}
          />
        ) : null}
        {mainTab === "settings" && settingsSubTab === "catalog" ? (
          <SponsorCatalogSettingsPanel
            catalog={catalog}
            draft={catalogDraft}
            onDraftChange={setCatalogDraft}
            onSave={() => void saveCatalogSettings()}
          />
        ) : null}
      </section>
    </main>
  );
}

function SponsorCatalogSettingsPanel({
  catalog,
  draft,
  onDraftChange,
  onSave,
}: {
  catalog: { supportKinds: string[]; supportForms: string[]; supportConditions: string[] };
  draft: SponsorDashboardSettings;
  onDraftChange: (v: SponsorDashboardSettings) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="text-lg font-black text-slate-950">
        {LABEL.settingsSupportKind} · {LABEL.settingsSupportForm} ·{" "}
        {LABEL.settingsSupportCondition}
      </h2>
      <p className="text-xs font-bold text-slate-500">
        카드에서 선택·추가할 목록입니다. 견적 처리 시에도 동일 목록이 사용됩니다.
      </p>
      {[
        [LABEL.settingsSupportKind, "supportKinds", catalog.supportKinds] as const,
        [LABEL.settingsSupportForm, "supportForms", catalog.supportForms] as const,
        [LABEL.settingsSupportCondition, "supportConditions", catalog.supportConditions] as const,
      ].map(([title, , items]) => (
        <div key={title}>
          <p className="text-xs font-black text-slate-600">{title}</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {items.map((item) => (
              <li
                key={item}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <label className="block">
        <span className="text-xs font-bold text-slate-500">{LABEL.reportTotalBudget}</span>
        <input
          type="number"
          value={draft.total_budget ?? ""}
          onChange={(e) =>
            onDraftChange({
              ...draft,
              total_budget: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        className="min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
      >
        설정 저장
      </button>
    </div>
  );
}

function RegionChecks({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {SERVICE_REGIONS.map((region) => {
        const checked = value.includes(region);
        return (
          <button
            key={region}
            type="button"
            onClick={() =>
              onChange(checked ? value.filter((item) => item !== region) : [...value, region])
            }
            className={`min-h-9 rounded-full border px-3 text-xs font-black ${
              checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {region}
          </button>
        );
      })}
    </div>
  );
}

function SponsorRulePanel({
  rules,
  form,
  setForm,
  onSave,
}: {
  rules: Rule[];
  form: Record<string, unknown> & { service_regions: string[] };
  setForm: Dispatch<SetStateAction<any>>;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-black text-slate-950">{LABEL.settingsRules}</h2>
        {[
          ["title", "조건명"],
          ["support_per_person", "인당 지원금"],
          ["support_per_case", "건당 지원금"],
          ["max_support_amount", "최대 지원금"],
          ["min_passenger_count", "최소 인원"],
          ["max_passenger_count", "최대 인원"],
          ["target_group", "지원대상 조건"],
          ["support_condition", "지원조건"],
          ["daily_budget", "일 예산"],
          ["monthly_budget", "월 예산"],
          ["memo", "메모"],
        ].map(([key, label]) => (
          <label key={key} className="mt-3 block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <input
              value={safeText(form[key])}
              onChange={(event) => setForm((prev: any) => ({ ...prev, [key]: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
        ))}
        <label className="mt-3 block">
          <span className="text-xs font-bold text-slate-500">{LABEL.supportForm}</span>
          <select
            value={safeText(form.support_type, "cash")}
            onChange={(event) => setForm((prev: any) => ({ ...prev, support_type: event.target.value }))}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
          >
            {SPONSOR_SUPPORT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3">
          <span className="text-xs font-bold text-slate-500">지원지역</span>
          <RegionChecks
            value={form.service_regions}
            onChange={(next) => setForm((prev: any) => ({ ...prev, service_regions: next }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
        >
          저장
        </button>
      </div>
      <div className="space-y-3">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="font-black text-slate-950">{safeText(rule.title, "조건명 없음")}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {sponsorSupportTypeLabel(rule.support_type)} ·{" "}
              {rule.is_active === false ? "비활성" : "활성"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SponsorStaffPanel({
  staff,
  form,
  setForm,
  onSave,
}: {
  staff: Staff[];
  form: Record<string, unknown> & { service_regions: string[] };
  setForm: Dispatch<SetStateAction<any>>;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <h2 className="text-lg font-black text-slate-950">{LABEL.settingsStaff}</h2>
        {[
          ["name", "이름"],
          ["phone", "연락처"],
          ["email", "이메일"],
          ["role", "역할"],
        ].map(([key, label]) => (
          <label key={key} className="mt-3 block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <input
              value={safeText(form[key])}
              onChange={(event) => setForm((prev: any) => ({ ...prev, [key]: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-500"
            />
          </label>
        ))}
        <div className="mt-3">
          <span className="text-xs font-bold text-slate-500">담당지역</span>
          <RegionChecks
            value={form.service_regions}
            onChange={(next) => setForm((prev: any) => ({ ...prev, service_regions: next }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="mt-5 min-h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white"
        >
          저장
        </button>
      </div>
      <div className="space-y-3">
        {staff.map((item) => (
          <article key={item.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <p className="font-black text-slate-950">{safeText(item.name, "이름 없음")}</p>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {safeText(item.role, "역할 미정")} · {item.is_active === false ? "비활성" : "활성"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
