"use client";

import { useEffect, useRef, useState } from "react";

import { createSupabaseClient } from "@/lib/supabase";

const applicationTypes = [
  "기계약 전세버스 지원금 신청",
  "전세버스 신규 신청",
  "파트너 소개 신청",
];

const tripTypes = ["왕복", "편도"];
const busGrades = ["일반", "프리미엄"];
const organizationTypes = [
  "회사/직장",
  "학교",
  "교회/종교단체",
  "공공기관",
  "협회/단체",
  "기타 소속단체",
];

/** Supabase `applications`에 넣는 컬럼만 (id·created_at 등 자동값 제외) */
type ApplicationInsertPayload = {
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  destination: string;
  departure_date: string | null;
  return_date: string | null;
  passenger_count: number;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string | null;
  request_message: string;
  file_url?: string | null;
  file_name?: string | null;
  status: string;
};

const DRAFT_STORAGE_KEY = "freeTourBusFormDraft";

// 모바일 입력 UX용: 숫자만 남기고 010-1234-5678 형태로 포맷
const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
};

function makeUploadObjectKey(fileName: string) {
  // Storage path에는 영문/숫자/하이픈/언더스코어만 사용 (확장자 유지)
  const extRaw = fileName.split(".").pop() ?? "";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "");

  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now()}`;

  const safeRand = String(rand).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safeFileName = `${Date.now()}_${safeRand}${ext ? `.${ext}` : ""}`;

  return `applications/${safeFileName}`;
}

type FormData = {
  applicationType: string;
  tripType: string;
  busGrade: string;
  departure: string;
  destination: string;
  stopovers: string[];
  departureDate: string;
  returnDate: string;
  passengerCount: string;
  applicantName: string;
  phone: string;
  organizationName: string;
  organizationType: string;
  requestMessage: string;
};

const INITIAL_FORM_DATA: FormData = {
  applicationType: "기계약 전세버스 지원금 신청",
  tripType: "왕복",
  busGrade: "일반",
  departure: "",
  destination: "",
  stopovers: [],
  departureDate: "",
  returnDate: "",
  passengerCount: "",
  applicantName: "",
  phone: "",
  organizationName: "",
  organizationType: "",
  requestMessage: "",
};

/** 이전 버전 draft 키(partyCount, additionalNotes 등)를 새 formData로 맞춥니다. */
function normalizeDraftRaw(saved: string): Partial<FormData> | null {
  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    const partial: Partial<FormData> = {};

    if (typeof parsed.applicationType === "string")
      partial.applicationType = parsed.applicationType;
    if (typeof parsed.selectedApplicationType === "string")
      partial.applicationType = parsed.selectedApplicationType;

    if (typeof parsed.tripType === "string") partial.tripType = parsed.tripType;
    if (typeof parsed.selectedTripType === "string")
      partial.tripType = parsed.selectedTripType;

    if (typeof parsed.busGrade === "string") partial.busGrade = parsed.busGrade;
    if (typeof parsed.selectedBusGrade === "string")
      partial.busGrade = parsed.selectedBusGrade;

    if (typeof parsed.departure === "string") partial.departure = parsed.departure;
    if (typeof parsed.destination === "string")
      partial.destination = parsed.destination;

    if (Array.isArray(parsed.stopovers))
      partial.stopovers = parsed.stopovers.filter((v) => typeof v === "string");

    if (typeof parsed.departureDate === "string")
      partial.departureDate = parsed.departureDate;
    if (typeof parsed.returnDate === "string")
      partial.returnDate = parsed.returnDate;

    if (typeof parsed.passengerCount === "string")
      partial.passengerCount = parsed.passengerCount;
    if (typeof parsed.partyCount === "string")
      partial.passengerCount = parsed.partyCount;

    if (typeof parsed.applicantName === "string")
      partial.applicantName = parsed.applicantName;
    if (typeof parsed.phone === "string") partial.phone = parsed.phone;
    if (typeof parsed.organizationName === "string")
      partial.organizationName = parsed.organizationName;
    if (typeof parsed.organizationType === "string")
      partial.organizationType = parsed.organizationType;

    if (typeof parsed.requestMessage === "string")
      partial.requestMessage = parsed.requestMessage;
    if (typeof parsed.additionalNotes === "string")
      partial.requestMessage = parsed.additionalNotes;

    return partial;
  } catch {
    return null;
  }
}

export default function Home() {
  const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

  const [formData, setFormData] = useState<FormData>(() => ({
    ...INITIAL_FORM_DATA,
  }));

  const [phoneError, setPhoneError] = useState(false);
  const [passengerCountError, setPassengerCountError] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  /** 저장 실패 시 Supabase/예외 message (임시 디버깅용) */
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return;
      const parsed = normalizeDraftRaw(saved);
      if (!parsed) return;
      setFormData((prev) => ({
        ...prev,
        ...parsed,
        stopovers: Array.isArray(parsed.stopovers)
          ? parsed.stopovers.filter((v) => typeof v === "string")
          : prev.stopovers,
      }));
    } catch (e) {
      console.warn("[draft restore] failed:", e);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
    } catch (e) {
      console.warn("[draft save] failed:", e);
    }
  }, [formData]);

  const handleAddStopover = () => {
    console.log("stopover clicked");
    setFormData((prev) => {
      if (prev.stopovers.length >= 3) return prev;
      return { ...prev, stopovers: [...prev.stopovers, ""] };
    });
  };

  const handleUpdateStopover = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      stopovers: prev.stopovers.map((s, i) => (i === index ? value : s)),
    }));
  };

  const handleSubmit = async () => {
    console.log("submit clicked");

    const phoneDigits = formData.phone.replace(/[^0-9]/g, "");
    const phoneOk = phoneDigits.length === 11 && phoneDigits.startsWith("010");
    const parsedCount = Number.parseInt(formData.passengerCount, 10);
    const headcountOk = Number.isFinite(parsedCount) && parsedCount >= 10;

    setPhoneError(!phoneOk);
    setPassengerCountError(!headcountOk);

    if (!phoneOk || !headcountOk) return;

    setSubmitError(false);
    setSubmitErrorMessage(null);
    setIsSubmitting(true);

    const departureDateValue = formData.departureDate.trim();
    const returnDateValue = formData.returnDate.trim();

    try {
      const supabase = createSupabaseClient();

      let uploadedFileUrl: string | null = null;
      let uploadedFileName: string | null = null;

      if (attachmentFile) {
        const objectKey = makeUploadObjectKey(attachmentFile.name);

        const { error: uploadError } = await supabase.storage
          .from("application-files")
          .upload(objectKey, attachmentFile, {
            upsert: false,
            contentType: attachmentFile.type || undefined,
          });

        if (uploadError) {
          setSubmitErrorMessage(`파일 업로드 실패: ${uploadError.message}`);
          setSubmitError(true);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("application-files")
          .getPublicUrl(objectKey);

        uploadedFileUrl = publicUrlData.publicUrl ?? null;
        uploadedFileName = attachmentFile.name;
      }

      const insertPayload: ApplicationInsertPayload = {
        application_type: formData.applicationType,
        trip_type: formData.tripType,
        bus_grade: formData.busGrade,
        departure: formData.departure.trim(),
        destination: formData.destination.trim(),
        departure_date: departureDateValue === "" ? null : departureDateValue,
        return_date: returnDateValue === "" ? null : returnDateValue,
        passenger_count: Number(parsedCount),
        applicant_name: formData.applicantName.trim(),
        phone: formatPhoneNumber(phoneDigits),
        organization_name: formData.organizationName.trim(),
        organization_type:
          formData.organizationType.trim() === ""
            ? null
            : formData.organizationType.trim(),
        request_message: formData.requestMessage.trim(),
        file_url: uploadedFileUrl,
        file_name: uploadedFileName,
        status: "pending",
      };

      console.log(
        "[applications insert] payload (id must be absent):",
        JSON.stringify(insertPayload),
      );

      const { error } = await supabase.from("applications").insert(insertPayload);
      if (error) {
        console.error("[applications insert] Supabase error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setSubmitErrorMessage(`DB 저장 실패: ${error.message}`);
        setSubmitError(true);
        return;
      }

      setShowSubmitSuccess(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSubmitErrorMessage(message);
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f3f8fb] pb-28">
      <header className="relative z-10 flex h-[78px] items-center justify-between rounded-b-[2rem] bg-gradient-to-r from-blue-600 to-blue-500 px-6 text-white shadow-lg shadow-blue-900/20">
        <h1 className="rounded-2xl bg-white px-4 py-2.5 text-lg font-black tracking-[-0.04em] text-blue-700 shadow-sm ring-1 ring-white/60">
          무료관광버스
        </h1>
        <button
          type="button"
          className="rounded-full px-3 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10 hover:text-white"
        >
          로그인
        </button>
      </header>

      <section className="relative bg-gradient-to-b from-sky-50 via-cyan-50 to-[#f3f8fb] px-6 pb-24 pt-12 text-center">
        <p className="relative text-[2.12rem] font-black leading-[1.18] tracking-[-0.06em] text-slate-950">
          관광버스도 무료!
          <br />
          재테크 정보도 무료!
        </p>
        <p className="relative mt-6 text-[1.03rem] font-semibold leading-8 tracking-[-0.035em] text-slate-500">
          열심히 일한 당신은 전액 무료~
          <br />
          신청만 하면 지원 가능~
        </p>
      </section>

      <section className="relative z-10 -mt-10 overflow-visible px-5">
        <div className="relative z-10 overflow-visible rounded-[2rem] bg-white px-6 pb-10 pt-9 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
          <div>
            <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
              신청 유형
            </h2>
            <div className="mt-5 grid gap-3">
              {applicationTypes.map((applicationType) => {
                const isSelected = formData.applicationType === applicationType;

                return (
                  <button
                    key={applicationType}
                    type="button"
                    onClick={() => {
                      console.log("application type clicked");
                      setFormData((prev) => ({
                        ...prev,
                        applicationType,
                      }));
                    }}
                    className={`touch-manipulation min-h-14 cursor-pointer rounded-2xl border px-4 text-left text-base font-extrabold tracking-[-0.035em] transition ${
                      isSelected
                        ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/20"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    style={tapStyle}
                  >
                    {applicationType}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-9 border-t border-slate-100 pt-8">
            <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
              이동 정보
            </h2>

            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {tripTypes.map((tripType) => {
                  const isSelected = formData.tripType === tripType;

                  return (
                    <button
                      key={tripType}
                      type="button"
                      onClick={() => {
                        console.log("trip type clicked");
                        setFormData((prev) => ({ ...prev, tripType }));
                      }}
                      className={`touch-manipulation min-h-12 cursor-pointer rounded-full border text-base font-black tracking-[-0.035em] transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {tripType}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {busGrades.map((busGrade) => {
                  const isSelected = formData.busGrade === busGrade;

                  return (
                    <button
                      key={busGrade}
                      type="button"
                      onClick={() => {
                        console.log("bus grade clicked");
                        setFormData((prev) => ({ ...prev, busGrade }));
                      }}
                      className={`touch-manipulation min-h-12 cursor-pointer rounded-full border text-base font-black tracking-[-0.035em] transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {busGrade}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3.5">
                <input
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                  placeholder="출발지 입력"
                  value={formData.departure}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      departure: event.target.value,
                    }))
                  }
                />
                <input
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                  placeholder="도착지 입력"
                  value={formData.destination}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      destination: event.target.value,
                    }))
                  }
                />

                {formData.stopovers.map((stopover, index) => (
                  <input
                    key={`stopover-${index + 1}`}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                    placeholder={`경유지 ${index + 1} 입력`}
                    value={stopover}
                    onChange={(event) =>
                      handleUpdateStopover(index, event.target.value)
                    }
                  />
                ))}

                <button
                  type="button"
                  onClick={handleAddStopover}
                  disabled={formData.stopovers.length >= 3}
                  className="touch-manipulation flex min-h-12 w-full cursor-pointer items-center rounded-2xl px-1 text-left text-base font-black tracking-[-0.035em] text-blue-500 transition hover:text-blue-600 disabled:text-slate-300"
                  style={tapStyle}
                >
                  + 경유지 추가
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold tracking-[-0.03em] text-slate-500">
                    가는 날짜
                  </span>
                  <input
                    type="date"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                    value={formData.departureDate}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        departureDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold tracking-[-0.03em] text-slate-500">
                    오는 날짜
                  </span>
                  <input
                    type="date"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                    value={formData.returnDate}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        returnDate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    passengerCountError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="인원수 입력"
                  value={formData.passengerCount}
                  onChange={(event) => {
                    setFormData((prev) => ({
                      ...prev,
                      passengerCount: event.target.value,
                    }));
                    setPassengerCountError(false);
                  }}
                />
                {passengerCountError ? (
                  <p className="px-1 text-xs font-medium leading-5 text-red-500">
                    10인 이상 단체만 신청 가능합니다.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-9 border-t border-slate-100 pt-8">
            <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
              신청자 정보
            </h2>

            <div className="mt-5 space-y-3.5">
              <input
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="신청자 이름 입력"
                value={formData.applicantName}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    applicantName: event.target.value,
                  }))
                }
              />
              <div className="space-y-1.5">
                <input
                  type="tel"
                  inputMode="numeric"
                  style={tapStyle}
                  autoComplete="tel"
                  className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    phoneError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="010-1234-5678"
                  value={formData.phone}
                  onChange={(e) => {
                    setPhoneError(false);
                    setFormData((prev) => ({
                      ...prev,
                      phone: formatPhoneNumber(e.target.value),
                    }));
                  }}
                />
                {phoneError ? (
                  <p className="px-1 text-xs font-medium leading-5 text-red-500">
                    올바른 휴대폰 번호를 입력해주세요.
                  </p>
                ) : null}
              </div>
              <input
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="단체명 입력"
                value={formData.organizationName}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    organizationName: event.target.value,
                  }))
                }
              />
              <select
                className={`h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none focus:border-blue-500 ${
                  formData.organizationType ? "text-slate-700" : "text-slate-400"
                }`}
                value={formData.organizationType}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    organizationType: event.target.value,
                  }))
                }
              >
                <option value="" disabled>
                  단체 유형 선택
                </option>
                {organizationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                ※ 일부 업종 및 일반 동호회는 지원 대상에서 제외될 수 있습니다.
              </p>
              {formData.organizationType === "기타 소속단체" ? (
                <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                  소속 확인이 가능한 단체만 심사 대상에 포함됩니다.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-9 border-t border-slate-100 pt-8">
            <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
              증빙자료 첨부
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 tracking-[-0.02em] text-slate-500">
              전세버스 견적서 또는 결제 영수증을 첨부해주세요.
            </p>

            <div className="mt-5 space-y-3">
              <input
                ref={attachmentInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.hwp"
                className="sr-only"
                onChange={(event) =>
                  setAttachmentFile(event.target.files?.[0] ?? null)
                }
              />
              <div className="flex min-h-[4.25rem] items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="shrink-0 rounded-full bg-blue-50 px-4 py-2.5 text-sm font-bold tracking-[-0.03em] text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100"
                >
                  파일 선택
                </button>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.02em] text-slate-700">
                  {attachmentFile ? attachmentFile.name : "선택된 파일 없음"}
                </p>
              </div>

              <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                PDF, JPG, PNG, DOC, HWP 파일 지원
              </p>
              <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                ※ 허위 자료 제출 시 지원이 제한될 수 있습니다.
              </p>
            </div>
          </div>

          <div className="mt-9 border-t border-slate-100 pt-8">
            <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
              기타 요청사항
            </h2>
            <textarea
              className="mt-5 h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="추가 요청사항이나 전달 내용을 입력해주세요."
              value={formData.requestMessage}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  requestMessage: event.target.value,
                }))
              }
              rows={4}
            />
            <p className="mt-3 px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
              ※ 선택 입력 항목입니다.
            </p>
          </div>

          <div className="mt-9 border-t border-slate-100 pt-8">
            <p className="mb-5 text-center text-xs font-medium leading-6 tracking-[-0.02em] text-slate-400">
              신청 후 관리자 심사를 통해 지원 여부가 안내됩니다.
            </p>
            {submitError ? (
              <div className="mb-4 space-y-2 text-center">
                <p className="text-sm font-medium leading-6 text-red-500">
                  신청 저장 중 오류가 발생했습니다.
                </p>
                {submitErrorMessage ? (
                  <p className="break-words px-1 font-mono text-xs leading-5 text-red-600/90">
                    {submitErrorMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="touch-manipulation relative z-10 flex min-h-[3.75rem] w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-4 text-lg font-black tracking-[-0.04em] text-white shadow-lg shadow-slate-950/20 ring-1 ring-slate-900/80 transition hover:bg-slate-900 hover:shadow-xl hover:shadow-slate-950/25 active:scale-[0.99] active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-950"
              style={tapStyle}
            >
              {isSubmitting ? "신청 접수 중..." : "무료버스 신청하기"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 px-5">
        <div className="rounded-[1.75rem] bg-white p-6 shadow-[0_14px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
          <h2 className="mb-5 flex items-center gap-2.5 text-xl font-black tracking-[-0.045em] text-slate-950">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
              !
            </span>
            신청 조건
          </h2>

          <div className="space-y-3.5">
            <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100/60">
              <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.87M16 5.13a3 3 0 0 1 0 5.74"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                단체 인원
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-500">10인 이상</p>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100/70">
              <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="m9 12 2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
                지원 대상
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                직장 및 소속이 있는 단체
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100/60">
              <p className="flex items-center gap-2.5 text-lg font-black tracking-[-0.045em] text-slate-950">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-500 text-xs font-black text-blue-500">
                  !
                </span>
                지원 제외
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                금융업, 일반 동호회, 소속 확인이 어려운 임의 모임
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-sm font-medium leading-6 tracking-[-0.02em] text-slate-500">
            ※ 신청 후 관리자 심사를 거쳐 영업일 기준 3-5일 이내 결과를
            통보해드립니다
          </p>
        </div>
      </section>

      {showSubmitSuccess ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 px-5 py-10 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-success-title"
        >
          <div className="w-full max-w-[340px] rounded-[1.75rem] bg-white p-8 shadow-2xl shadow-slate-900/25 ring-1 ring-slate-100">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-emerald-50 ring-[10px] ring-emerald-50/70">
                <svg
                  aria-hidden="true"
                  className="h-11 w-11 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <h3
                id="submit-success-title"
                className="mt-6 text-xl font-black tracking-[-0.045em] text-slate-950"
              >
                신청이 정상적으로 접수되었습니다.
              </h3>
              <p className="mt-3 text-[0.9375rem] font-medium leading-7 tracking-[-0.02em] text-slate-500">
                관리자 심사 후 문자로 결과를 안내드립니다.
              </p>
              <button
                type="button"
                className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-base font-bold tracking-[-0.03em] text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-900 active:scale-[0.99]"
                onClick={() => {
                  setShowSubmitSuccess(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="fixed bottom-24 right-[max(1.25rem,calc((100vw-480px)/2+1.25rem))] z-40 flex h-14 items-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950 shadow-[0_14px_30px_rgba(161,98,7,0.35)] ring-1 ring-yellow-200 transition hover:-translate-y-1 hover:bg-yellow-200 active:translate-y-0"
        onClick={() => console.log("[click] 고객센터")}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9H13a8.48 8.48 0 0 1 8 8v.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
        고객센터
      </button>
    </main>
  );
}
