"use client";

import Link from "next/link";
import { useState } from "react";

import { estimateSponsorSupport } from "@/lib/support-estimate";

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
  passengerCount?: number | null;
  registerHref?: string;
  quoteClosed?: boolean;
};

export function GuestQuoteForm({
  applicationId,
  referralToken = "",
  compact,
  passengerCount = null,
  registerHref = "/partner/register",
  quoteClosed = false,
}: Props) {
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
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const supportEstimate = estimateSponsorSupport({
    passengerCount,
    price: 0,
  });

  const submit = async () => {
    if (quoteClosed) return;
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
      {supportModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-member-only-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="닫기"
            onClick={() => setSupportModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3
              id="support-member-only-title"
              className="text-xl font-black tracking-[-0.04em] text-slate-950"
            >
              회원 기사 전용 기능
            </h3>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
              회원 기사 등록 시 지원금 적용 견적 제출이 가능해 고객 선택률을 높일 수 있습니다.
            </p>
            <ul className="mt-4 space-y-2 text-sm font-semibold text-slate-700">
              <li>지원금 적용 견적 제출 가능</li>
              <li>고객 선택률 상승</li>
              <li>실시간 콜 수신</li>
              <li>지역 우선 매칭</li>
              <li>추천인 리워드 참여 가능</li>
            </ul>
            <Link
              href={registerHref}
              className="mt-6 flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              style={tapStyle}
            >
              회원가입하고 지원금 견적 제출
            </Link>
            <button
              type="button"
              onClick={() => setSupportModalOpen(false)}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600"
              style={tapStyle}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-black text-slate-900">일반 견적 제출</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          지원금 미적용 일반 운행 견적
        </p>
      </div>
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
      {quoteClosed ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
          이 견적요청은 자동마감되어 새 견적을 제출할 수 없습니다.
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || quoteClosed}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        style={tapStyle}
      >
        {quoteClosed ? "견적 마감됨" : busy ? "제출 중…" : "비회원 견적 제출"}
      </button>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-black text-blue-950">
          회원 전용 지원금 견적 ⭐
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-blue-900">
          후원업체 지원금 적용 예상가 제출 가능
        </p>
        <p className="mt-3 text-sm font-black text-blue-950">
          예상 지원금: 약{" "}
          {supportEstimate.supportAmount.toLocaleString("ko-KR")}원
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-blue-800">
          회원 기사만 제출 가능하며 고객은 일반가와 지원금 적용가를 비교할 수 있습니다.
        </p>
        <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500">
          * 지원금 적용 예상가는 후원업체 심사 결과에 따라 실제 변동될 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setSupportModalOpen(true)}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          style={tapStyle}
        >
          회원 등록 후 지원금 견적 제출
        </button>
      </div>
    </div>
  );
}
