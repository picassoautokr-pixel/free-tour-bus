"use client";

import Link from "next/link";
import { useState } from "react";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

type Props = {
  applicationId: string;
  referralToken?: string;
  compact?: boolean;
};

export function GuestQuoteForm({ applicationId, referralToken = "", compact }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [availableTime, setAvailableTime] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInviteUrl(null);
    try {
      const res = await fetch("/api/guest/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          referral_token: referralToken,
          guest_company_name: companyName,
          guest_driver_name: driverName,
          guest_phone: phone,
          price,
          vehicle_type: vehicleType,
          available_time: availableTime,
          message,
        }),
      });
      const json = (await res.json()) as { error?: string; invite_url?: string };
      if (!res.ok) {
        setError(json.error ?? "견적 제출에 실패했습니다.");
        return;
      }
      setInviteUrl(json.invite_url ?? `/partner/register?invitePhone=${phone.replace(/\D/g, "")}`);
      setCompanyName("");
      setDriverName("");
      setPrice("");
      setVehicleType("");
      setAvailableTime("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (inviteUrl) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-black text-emerald-950">
          견적서가 접수되었습니다.
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">
          회원가입하면 다음 콜부터 실시간 알림을 받을 수 있습니다.
        </p>
        <Link
          href={inviteUrl}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
          style={tapStyle}
        >
          제휴기사 회원가입하기
        </Link>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${compact ? "" : "shadow-sm"}`}>
      <h3 className="text-sm font-black text-slate-900">비회원 견적 제출</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="업체명"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <input
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="담당자명"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
          placeholder="010-0000-0000"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="견적금액"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <input
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          placeholder="차량유형"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <input
          value={availableTime}
          onChange={(e) => setAvailableTime(e.target.value)}
          placeholder="가능 출발시간"
          className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-500"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="메모"
          className="min-h-24 resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 sm:col-span-2"
        />
      </div>
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        style={tapStyle}
      >
        {busy ? "제출 중…" : "비회원 견적 제출"}
      </button>
    </div>
  );
}
