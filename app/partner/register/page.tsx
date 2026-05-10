"use client";

/**
 * 제휴기사 등록 — Supabase `partner_drivers` + Storage `partner-files`
 *
 * DB 준비: 프로젝트 루트 `sql/partner_drivers.sql` 실행
 * Storage: 대시보드에서 버킷 `partner-files` 생성 및 업로드 정책 설정 (SQL 파일 주석 참고)
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { createSupabaseClient } from "@/lib/supabase";

const BUSINESS_TYPE_OPTIONS = ["개인 기사", "법인 회사"] as const;
const BUS_TYPE_OPTIONS = ["일반버스", "프리미엄버스"] as const;

type BusinessTypeOption = (typeof BUSINESS_TYPE_OPTIONS)[number];

type PartnerInsertPayload = {
  company_name: string;
  manager_name: string;
  phone: string;
  email: string;
  region: string;
  business_type: string;
  bus_types: string[];
  vehicle_model: string;
  vehicle_number: string;
  passenger_capacity: number;
  business_license_url: string | null;
  business_license_name: string | null;
  memo: string | null;
};

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function formatPhoneNumber(value: string) {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

function makePartnerUploadKey(fileName: string) {
  const extRaw = fileName.split(".").pop() ?? "";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now()}`;
  const safeRand = String(rand).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `partner/${Date.now()}_${safeRand}${ext ? `.${ext}` : ""}`;
}

function isSimpleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export default function PartnerRegisterPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [companyName, setCompanyName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("");
  const [businessType, setBusinessType] = useState<BusinessTypeOption | "">(
    "",
  );
  const [busTypeNormal, setBusTypeNormal] = useState(false);
  const [busTypePremium, setBusTypePremium] = useState(false);
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [passengerCapacity, setPassengerCapacity] = useState("");
  const [memo, setMemo] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const [phoneError, setPhoneError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const resetForm = () => {
    setCompanyName("");
    setManagerName("");
    setPhone("");
    setEmail("");
    setRegion("");
    setBusinessType("");
    setBusTypeNormal(false);
    setBusTypePremium(false);
    setVehicleModel("");
    setVehicleNumber("");
    setPassengerCapacity("");
    setMemo("");
    setLicenseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPhoneError(false);
    setEmailError(false);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    const phoneDigits = phone.replace(/[^0-9]/g, "");
    const phoneOk = phoneDigits.length === 11 && phoneDigits.startsWith("010");
    const emailOk = isSimpleEmail(email);
    setPhoneError(!phoneOk);
    setEmailError(!emailOk);

    const busTypes: string[] = [];
    if (busTypeNormal) busTypes.push("일반버스");
    if (busTypePremium) busTypes.push("프리미엄버스");

    const cap = Number.parseInt(passengerCapacity.replace(/\D/g, ""), 10);
    const capOk = Number.isFinite(cap) && cap >= 1;

    if (
      companyName.trim() === "" ||
      managerName.trim() === "" ||
      region.trim() === "" ||
      businessType === "" ||
      busTypes.length === 0 ||
      vehicleModel.trim() === "" ||
      vehicleNumber.trim() === "" ||
      !capOk
    ) {
      setSubmitError("필수 항목을 모두 입력해 주세요.");
      return;
    }

    if (!phoneOk || !emailOk) {
      setSubmitError("연락처·이메일을 확인해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createSupabaseClient();

      let licenseUrl: string | null = null;
      let licenseName: string | null = null;

      if (licenseFile) {
        const objectKey = makePartnerUploadKey(licenseFile.name);
        const { error: uploadError } = await supabase.storage
          .from("partner-files")
          .upload(objectKey, licenseFile, {
            upsert: false,
            contentType: licenseFile.type || undefined,
          });

        if (uploadError) {
          const msg = uploadError.message;
          if (/bucket|not found|404/i.test(msg)) {
            setSubmitError(
              `파일 업로드 실패: Storage 버킷 partner-files 가 없거나 권한이 없습니다. Supabase에서 버킷을 생성한 뒤 다시 시도해 주세요. (${msg})`,
            );
          } else {
            setSubmitError(`파일 업로드 실패: ${msg}`);
          }
          return;
        }

        const { data: pub } = supabase.storage
          .from("partner-files")
          .getPublicUrl(objectKey);
        licenseUrl = pub.publicUrl ?? null;
        licenseName = licenseFile.name;
      }

      const payload: PartnerInsertPayload = {
        company_name: companyName.trim(),
        manager_name: managerName.trim(),
        phone: formatPhoneNumber(phoneDigits),
        email: email.trim(),
        region: region.trim(),
        business_type: businessType,
        bus_types: busTypes,
        vehicle_model: vehicleModel.trim(),
        vehicle_number: vehicleNumber.trim().replace(/\s/g, ""),
        passenger_capacity: cap,
        business_license_url: licenseUrl,
        business_license_name: licenseName,
        memo: memo.trim() === "" ? null : memo.trim(),
      };

      const { error: insertError } = await supabase
        .from("partner_drivers")
        .insert(payload);

      if (insertError) {
        if (/relation|does not exist|42P01/i.test(insertError.message)) {
          setSubmitError(
            `DB 저장 실패: partner_drivers 테이블이 없습니다. sql/partner_drivers.sql 을 실행해 주세요. (${insertError.message})`,
          );
        } else {
          setSubmitError(`DB 저장 실패: ${insertError.message}`);
        }
        return;
      }

      resetForm();
      setSuccessOpen(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f3f8fb] pb-28">
      <header className="relative z-10 flex h-[78px] items-center justify-between rounded-b-[2rem] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/20">
        <Link
          href="/"
          className="rounded-2xl bg-white px-4 py-2.5 text-lg font-black tracking-[-0.04em] text-blue-900 shadow-sm ring-1 ring-white/60 transition hover:bg-blue-50"
        >
          무료관광버스
        </Link>
      </header>

      <section className="relative bg-gradient-to-b from-sky-50 via-cyan-50 to-[#f3f8fb] px-6 pb-10 pt-10 text-center">
        <h1 className="text-[1.65rem] font-black leading-snug tracking-[-0.05em] text-slate-950">
          제휴기사 등록신청
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[1.02rem] font-semibold leading-7 tracking-[-0.03em] text-slate-600">
          무료관광버스 제휴 기사님과 전세버스 회사를 모집합니다.
        </p>
      </section>

      <section className="relative z-10 -mt-4 px-5 pb-16">
        <div className="mx-auto max-w-lg rounded-[2rem] bg-white px-6 pb-10 pt-9 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
          <div className="space-y-9">
            <div>
              <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
                기본 정보
              </h2>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    업체명 또는 기사명 <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="예: ○○여행 / 홍길동"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    담당자명 <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    연락처 <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold outline-none ${
                      phoneError
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-blue-500"
                    }`}
                    value={phone}
                    onChange={(e) => {
                      setPhoneError(false);
                      setPhone(formatPhoneNumber(e.target.value));
                    }}
                    placeholder="010-0000-0000"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    이메일 <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold outline-none ${
                      emailError
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-blue-500"
                    }`}
                    value={email}
                    onChange={(e) => {
                      setEmailError(false);
                      setEmail(e.target.value);
                    }}
                    placeholder="name@example.com"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    지역 <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="예: 경기 성남시"
                  />
                </label>
                <div>
                  <p className="mb-2 text-xs font-bold text-slate-500">
                    사업자 유형 <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {BUSINESS_TYPE_OPTIONS.map((opt) => {
                      const sel = businessType === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setBusinessType(opt)}
                          className={`touch-manipulation min-h-14 rounded-2xl border text-sm font-black tracking-[-0.02em] transition ${
                            sel
                              ? "border-emerald-500 bg-emerald-500 text-white shadow-md"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                          style={tapStyle}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-8">
              <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
                보유버스 유형
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                복수 선택 가능 <span className="text-red-500">*</span>
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBusTypeNormal((v) => !v)}
                  className={`touch-manipulation min-h-14 rounded-2xl border text-sm font-black transition ${
                    busTypeNormal
                      ? "border-blue-600 bg-blue-600 text-white shadow-md"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  style={tapStyle}
                >
                  {BUS_TYPE_OPTIONS[0]}
                </button>
                <button
                  type="button"
                  onClick={() => setBusTypePremium((v) => !v)}
                  className={`touch-manipulation min-h-14 rounded-2xl border text-sm font-black transition ${
                    busTypePremium
                      ? "border-blue-600 bg-blue-600 text-white shadow-md"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  style={tapStyle}
                >
                  {BUS_TYPE_OPTIONS[1]}
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-8">
              <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
                차량정보
              </h2>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    차량 모델 <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    차량번호 <span className="text-red-500">*</span>
                  </span>
                  <input
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="예: 경기12가3456"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    최대 탑승인원 <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    value={passengerCapacity}
                    onChange={(e) => setPassengerCapacity(e.target.value)}
                    placeholder="숫자 입력"
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-8">
              <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
                사업자등록증 업로드
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                PDF, JPG, PNG ·{" "}
                <span className="font-bold text-amber-700">
                  첨부를 권장합니다
                </span>
                (미첨부 시에도 신청 가능)
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-400">
                Supabase Storage에 버킷{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-700">
                  partner-files
                </code>
                가 없으면 대시보드에서 생성해 주세요.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(e) =>
                  setLicenseFile(e.target.files?.[0] ?? null)
                }
              />
              <div className="mt-4 flex min-h-[4rem] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-full bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 ring-1 ring-blue-100"
                >
                  파일 선택
                </button>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
                  {licenseFile ? licenseFile.name : "선택된 파일 없음"}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-8">
              <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
                기타 메모
              </h2>
              <textarea
                className="mt-4 h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold outline-none focus:border-blue-500"
                placeholder="운행 가능 지역, 보유 차량 수, 특이사항 등을 입력해주세요."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            {submitError ? (
              <div
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                role="alert"
              >
                {submitError}
              </div>
            ) : null}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
              className="touch-manipulation flex min-h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black tracking-[-0.03em] text-white shadow-lg shadow-blue-900/25 transition hover:brightness-105 disabled:opacity-60"
              style={tapStyle}
            >
              {isSubmitting ? "제출 중…" : "제휴기사 등록 신청하기"}
            </button>
          </div>
        </div>
      </section>

      {successOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partner-success-title"
        >
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
            <h2
              id="partner-success-title"
              className="text-center text-xl font-black tracking-[-0.04em] text-slate-950"
            >
              제휴기사 등록신청이 접수되었습니다.
            </h2>
            <p className="mt-4 text-center text-[0.9375rem] font-semibold leading-7 text-slate-600">
              담당자 확인 후 순차적으로 연락드리겠습니다.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
                style={tapStyle}
                onClick={() => setSuccessOpen(false)}
              >
                확인
              </button>
              <button
                type="button"
                className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black text-white shadow-lg transition hover:brightness-105"
                style={tapStyle}
                onClick={() => {
                  resetForm();
                  setSuccessOpen(false);
                  router.push("/");
                }}
              >
                메인으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
