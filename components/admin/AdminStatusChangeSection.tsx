"use client";

import { useState, type ReactNode } from "react";
import { createAdminBrowserClient } from "@/lib/supabase";
import { APPLICATION_STATUSES, type ApplicationStatusValue } from "./admin-types";
import { coerceApplicationStatus, isPersistableApplicationId } from "./admin-page-utils";

export function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function AdminStatusChangeSection({
  rowId,
  statusFromServer,
  memoFromServer,
  onSaved,
  compact = false,
}: {
  rowId: string;
  statusFromServer: string;
  memoFromServer: string;
  onSaved: (nextStatus: ApplicationStatusValue, nextMemo: string) => void;
  compact?: boolean;
}) {
  const persistedId = isPersistableApplicationId(rowId);
  const normalizedSaved = coerceApplicationStatus(statusFromServer);

  const [selected, setSelected] = useState<ApplicationStatusValue>(() =>
    coerceApplicationStatus(statusFromServer),
  );
  const [memo, setMemo] = useState(() => memoFromServer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unchanged =
    selected === normalizedSaved &&
    (memo ?? "").trim() === (memoFromServer ?? "").trim();

  const handleSave = async () => {
    if (!persistedId) {
      setError(
        "이 행은 임시 ID입니다. 목록 상단의 새로고침 후 다시 시도해 주세요.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createAdminBrowserClient();
      const { error: updateError } = await supabase
        .from("applications")
        .update({ status: selected, admin_memo: memo })
        .eq("id", rowId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      onSaved(selected, memo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "mt-2 space-y-2"
          : "mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm ring-1 ring-slate-100/80"
      }
    >
      {!compact ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            상태 변경
          </p>
          <p className="mt-1 text-xs text-slate-500">
            내부용 메모이며 저장 후 목록 배지가 바로 반영됩니다.
          </p>
        </>
      ) : null}

      <div className={`flex flex-col gap-3 sm:flex-row sm:items-stretch ${compact ? "" : "mt-3"}`}>
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value as ApplicationStatusValue)
          }
          disabled={saving || !persistedId}
          className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
          aria-label="신청 상태 선택"
        >
          {APPLICATION_STATUSES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!compact ? (
        <div className="mt-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              관리자 메모
            </span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={saving || !persistedId}
              placeholder="반려 이유, 승인 참고사항, 지원금 전달 담당자에게 공유할 내용을 입력하세요."
              className="mt-2 min-h-[140px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <p className="mt-2 text-xs text-slate-500">
              ※ 내부용 메모입니다. 신청자에게 노출되지 않습니다.
            </p>
          </label>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !persistedId || unchanged}
        className={`${compact ? "mt-1" : "mt-3"} h-10 w-full rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {saving ? "저장 중…" : compact ? "상태 저장" : "상태 및 메모 저장"}
      </button>

      {!persistedId ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          신청 ID를 확인할 수 없어 저장할 수 없습니다.
        </p>
      ) : null}

      {error ? (
        <div
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
