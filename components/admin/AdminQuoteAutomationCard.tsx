"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuoteAutomationSettingsForm } from "./admin-types";

export function AdminQuoteAutomationCard() {
  const [settings, setSettings] = useState<QuoteAutomationSettingsForm>({
    business_start_time: "09:00",
    business_end_time: "18:00",
    auto_final_confirm_delay_minutes: 30,
    timezone: "Asia/Seoul",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/quote-settings", {
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        error?: string;
        settings?: QuoteAutomationSettingsForm;
      };
      if (!res.ok) {
        setMessage(json.error ?? "자동매칭 운영설정을 불러오지 못했습니다.");
        return;
      }
      if (json.settings) {
        setSettings({
          business_start_time: json.settings.business_start_time || "09:00",
          business_end_time: json.settings.business_end_time || "18:00",
          auto_final_confirm_delay_minutes:
            json.settings.auto_final_confirm_delay_minutes || 30,
          timezone: json.settings.timezone || "Asia/Seoul",
        });
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/quote-settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as {
        error?: string;
        settings?: QuoteAutomationSettingsForm;
      };
      if (!res.ok) {
        setMessage(json.error ?? "자동매칭 운영설정 저장에 실패했습니다.");
        return;
      }
      if (json.settings) {
        setSettings({
          business_start_time: json.settings.business_start_time || "09:00",
          business_end_time: json.settings.business_end_time || "18:00",
          auto_final_confirm_delay_minutes:
            json.settings.auto_final_confirm_delay_minutes || 30,
          timezone: json.settings.timezone || "Asia/Seoul",
        });
      }
      setMessage("자동매칭 운영설정을 저장했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm ring-1 ring-blue-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-600">
            가승인 매칭 운영설정
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">
            현재 설정: 업무시간 {settings.business_start_time} ~{" "}
            {settings.business_end_time} · 매칭 확정 대기시간{" "}
            {settings.auto_final_confirm_delay_minutes}분
          </h2>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            지원금 가승인 후보 선정 후 설정된 시간이 지나면 매칭 확정됩니다. 단,
            업무시간 외에는 다음 업무 시작시간에 고객정보가 공개됩니다. 고객은
            24시간 직접 매칭 확정할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={loading || saving}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "조회 중…" : "설정 새로고침"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-xs font-bold text-slate-500">업무 시작시간</span>
          <input
            type="time"
            value={settings.business_start_time}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                business_start_time: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">업무 종료시간</span>
          <input
            type="time"
            value={settings.business_end_time}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                business_end_time: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">
            자동확정 대기시간(분)
          </span>
          <input
            type="number"
            min={1}
            max={1440}
            value={settings.auto_final_confirm_delay_minutes}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                auto_final_confirm_delay_minutes:
                  Number.parseInt(event.target.value, 10) || 30,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-slate-500">시간대</span>
          <input
            type="text"
            value={settings.timezone}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                timezone: event.target.value,
              }))
            }
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
            {message}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || loading}
          className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </div>
    </section>
  );
}
