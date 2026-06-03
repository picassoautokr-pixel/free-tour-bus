"use client";

import { useRef } from "react";
import {
  SERVICE_REGIONS,
  inferDepartureRegion,
  type ServiceRegion,
} from "@/lib/regions";
import {
  CUSTOMER_ORGANIZATION_TYPES,
  normalizeCustomerOrganizationType,
} from "@/lib/organization-types";
import {
  APPLICATION_TYPE_REQUIRES_ATTACHMENT,
  customerApplicationTypes,
  tripTypes,
  busGrades,
  TIME_SLOT_OPTIONS,
  formatPhoneNumber,
  type FormData,
} from "./site-form-types";

type Props = {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  phoneError: boolean;
  setPhoneError: (v: boolean) => void;
  lookupPasswordError: string | null;
  setLookupPasswordError: (v: string | null) => void;
  passengerCountError: boolean;
  setPassengerCountError: (v: boolean) => void;
  departureError: string | null;
  setDepartureError: (v: string | null) => void;
  departureRegionError: string | null;
  setDepartureRegionError: (v: string | null) => void;
  destinationError: string | null;
  setDestinationError: (v: string | null) => void;
  dateTimeError: string | null;
  setDateTimeError: (v: string | null) => void;
  attachmentFile: File | null;
  setAttachmentFile: (f: File | null) => void;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  submitError: boolean;
  submitErrorMessage: string | null;
  onSubmit: () => void;
};

export function ApplicationFormCard({
  formData,
  setFormData,
  phoneError,
  setPhoneError,
  lookupPasswordError,
  setLookupPasswordError,
  passengerCountError,
  setPassengerCountError,
  departureError,
  setDepartureError,
  departureRegionError,
  setDepartureRegionError,
  destinationError,
  setDestinationError,
  dateTimeError,
  setDateTimeError,
  attachmentFile,
  setAttachmentFile,
  attachmentInputRef,
  isSubmitting,
  submitError,
  submitErrorMessage,
  onSubmit,
}: Props) {
  const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

  const inferredDepartureRegion = inferDepartureRegion(formData.departure);
  const displayedDepartureRegion =
    formData.departureRegionManual || formData.departureRegion !== ""
      ? formData.departureRegion
      : inferredDepartureRegion;

  const organizationTypes = CUSTOMER_ORGANIZATION_TYPES;

  return (
    <section className="relative z-10 -mt-10 overflow-visible px-5">
      <div className="relative z-10 overflow-visible rounded-[2rem] bg-white px-6 pb-10 pt-9 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">

        {/* ── 1. 운행견적 유형 ── */}
        <div>
          <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
            1. 운행견적 유형
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            이미 예약한 차량도, 새 전세버스 예약도 견적 신청이 가능합니다.
          </p>
          <div className="mt-5 grid gap-3">
            {customerApplicationTypes.map((applicationType) => {
              const isSelected = formData.applicationType === applicationType;
              return (
                <button
                  key={applicationType}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, applicationType }));
                    if (applicationType !== APPLICATION_TYPE_REQUIRES_ATTACHMENT) {
                      setAttachmentFile(null);
                      if (attachmentInputRef.current) {
                        attachmentInputRef.current.value = "";
                      }
                    }
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

        {/* ── 이동 정보 ── */}
        <div className="mt-9 border-t border-slate-100 pt-8">
          <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
            이동 정보
          </h2>

          <div className="mt-5 space-y-5">
            {/* 왕복/편도 */}
            <div className="grid grid-cols-2 gap-3">
              {tripTypes.map((tripType) => {
                const isSelected = formData.tripType === tripType;
                return (
                  <button
                    key={tripType}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, tripType }))}
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

            {/* 일반/프리미엄 */}
            <div className="grid grid-cols-2 gap-3">
              {busGrades.map((busGrade) => {
                const isSelected = formData.busGrade === busGrade;
                return (
                  <button
                    key={busGrade}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, busGrade }))}
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

            {/* 출발지 */}
            <div className="space-y-5">
              <div className="space-y-2">
                <input
                  className={`min-h-[3.75rem] w-full rounded-2xl border bg-white px-4 py-3 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    departureError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="출발지 예: 서울 강남구 역삼동"
                  value={formData.departure}
                  onChange={(event) => {
                    setDepartureError(null);
                    setDepartureRegionError(null);
                    const nextDeparture = event.target.value;
                    const nextRegion = inferDepartureRegion(nextDeparture);
                    setFormData((prev) => ({
                      ...prev,
                      departure: nextDeparture,
                      departureRegion: prev.departureRegionManual
                        ? prev.departureRegion
                        : nextRegion,
                    }));
                  }}
                />
                <p className="px-1 text-xs font-medium leading-5 text-slate-500">
                  출발 장소를 입력해 주세요.
                </p>
                <div
                  className={`rounded-2xl border bg-slate-50 p-3 ${
                    departureRegionError ? "border-red-400" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-slate-500">출발지역</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {inferredDepartureRegion !== "" && !formData.departureRegionManual
                          ? `자동 인식 지역: ${inferredDepartureRegion}`
                          : "출발지역을 직접 선택해주세요."}
                      </p>
                    </div>
                    {inferredDepartureRegion !== "" && !formData.departureRegionManual ? (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                        자동: {inferredDepartureRegion}
                      </span>
                    ) : null}
                  </div>
                  <select
                    className={`mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-blue-500 ${
                      displayedDepartureRegion ? "text-slate-800" : "text-slate-400"
                    }`}
                    value={displayedDepartureRegion}
                    onChange={(event) => {
                      setDepartureRegionError(null);
                      setFormData((prev) => ({
                        ...prev,
                        departureRegion: event.target.value as ServiceRegion | "",
                        departureRegionManual: true,
                      }));
                    }}
                  >
                    <option value="">출발지역 선택</option>
                    {SERVICE_REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  {formData.departureRegionManual ? (
                    <button
                      type="button"
                      className="mt-2 text-xs font-bold text-blue-600"
                      onClick={() => {
                        setDepartureRegionError(null);
                        setFormData((prev) => ({
                          ...prev,
                          departureRegion: inferDepartureRegion(prev.departure),
                          departureRegionManual: false,
                        }));
                      }}
                    >
                      자동 추정으로 되돌리기
                    </button>
                  ) : null}
                  {departureRegionError ? (
                    <p className="mt-2 px-1 text-xs font-semibold text-red-500">
                      {departureRegionError}
                    </p>
                  ) : null}
                </div>
                {departureError ? (
                  <p className="px-1 text-xs font-semibold text-red-500">
                    {departureError}
                  </p>
                ) : null}
              </div>

              {/* 도착지 */}
              <div className="space-y-2">
                <input
                  className={`min-h-[3.75rem] w-full rounded-2xl border bg-white px-4 py-3 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    destinationError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="도착지 예: 부산 해운대구 우동"
                  value={formData.destination}
                  onChange={(event) => {
                    setDestinationError(null);
                    setFormData((prev) => ({ ...prev, destination: event.target.value }));
                  }}
                />
                {destinationError ? (
                  <p className="px-1 text-xs font-semibold text-red-500">
                    {destinationError}
                  </p>
                ) : null}
              </div>

              {/* 경유지 */}
              <input
                className="min-h-[3.75rem] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
                placeholder="경유지 (선택, 쉼표로 구분)"
                value={formData.stopovers}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, stopovers: event.target.value }))
                }
              />

              {/* 출발 날짜 */}
              <label className="block">
                <span className="mb-2 block text-sm font-bold tracking-[-0.03em] text-slate-500">
                  가는 날짜
                </span>
                <input
                  type="date"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                  value={formData.departureDate}
                  onChange={(event) => {
                    setDateTimeError(null);
                    setFormData((prev) => ({ ...prev, departureDate: event.target.value }));
                  }}
                />
              </label>

              {/* 시간대 */}
              <div>
                <p className="mb-2 text-sm font-bold tracking-[-0.03em] text-slate-500">
                  출발 시간대
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {TIME_SLOT_OPTIONS.map((opt) => {
                    const isSelected = formData.departureTimeSlot === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setDateTimeError(null);
                          setFormData((prev) => ({
                            ...prev,
                            departureTimeSlot: opt.value,
                          }));
                        }}
                        className={`min-h-11 rounded-full border px-2 text-sm font-black transition ${
                          isSelected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        style={tapStyle}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {formData.departureTimeSlot === "custom" ? (
                  <label className="mt-3 block">
                    <span className="mb-2 block text-xs font-bold tracking-[-0.03em] text-slate-500">
                      시간 직접 입력
                    </span>
                    <input
                      type="time"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                      value={formData.departureTimeCustom}
                      onChange={(event) => {
                        setDateTimeError(null);
                        setFormData((prev) => ({
                          ...prev,
                          departureTimeCustom: event.target.value,
                        }));
                      }}
                    />
                  </label>
                ) : null}

                {dateTimeError ? (
                  <p className="mt-3 px-1 text-xs font-semibold text-red-500">
                    {dateTimeError}
                  </p>
                ) : null}
              </div>

              {/* 오는 날짜 */}
              <label className="block">
                <span className="mb-2 block text-sm font-bold tracking-[-0.03em] text-slate-500">
                  오는 날짜
                </span>
                <input
                  type="date"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500"
                  value={formData.returnDate}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, returnDate: event.target.value }))
                  }
                />
              </label>

              {/* 인원수 */}
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
                    setFormData((prev) => ({ ...prev, passengerCount: event.target.value }));
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
        </div>

        {/* ── 견적 마감 설정 ── */}
        <div className="mt-9 border-t border-slate-100 pt-8">
          <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
            견적 마감 설정
          </h2>
          <p className="mt-3 text-sm font-semibold leading-6 tracking-[-0.02em] text-slate-500">
            설정한 시간, 견적 수, 목표 금액 중 하나라도 충족되면 견적 접수가 자동으로 마감됩니다.
          </p>

          <div className="mt-5 space-y-5">
            {/* 시간 마감 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black tracking-[-0.03em] text-slate-900">
                시간 마감
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(["12", "24", "36", "48", "custom"] as const).map((option) => {
                  const selected = formData.quoteDeadlineOption === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, quoteDeadlineOption: option }))
                      }
                      className={`min-h-11 rounded-full border px-3 text-sm font-black transition ${
                        selected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {option === "custom" ? "직접지정" : `${option}시간`}
                    </button>
                  );
                })}
              </div>
              {formData.quoteDeadlineOption === "custom" ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={formData.quoteDeadlineCustomHours}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      quoteDeadlineCustomHours: event.target.value,
                    }))
                  }
                  placeholder="마감까지 시간 입력"
                  className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500"
                />
              ) : null}
            </div>

            {/* 견적 수 마감 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black tracking-[-0.03em] text-slate-900">
                견적 수 마감
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["5", "10", "15", "custom"] as const).map((option) => {
                  const selected = formData.quoteLimitOption === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, quoteLimitOption: option }))
                      }
                      className={`min-h-11 rounded-full border px-3 text-sm font-black transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      style={tapStyle}
                    >
                      {option === "custom" ? "직접지정" : `${option}건`}
                    </button>
                  );
                })}
              </div>
              {formData.quoteLimitOption === "custom" ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={formData.quoteLimitCustomCount}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      quoteLimitCustomCount: event.target.value,
                    }))
                  }
                  placeholder="마감 견적 수 입력"
                  className="mt-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              ) : null}
            </div>

            {/* 희망견적 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black tracking-[-0.03em] text-slate-900">
                희망견적
              </p>
              <div className="mt-3">
                <p className="text-xs font-bold tracking-[-0.02em] text-slate-500">
                  희망견적유형
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800">
                    <input
                      type="checkbox"
                      checked={formData.preferredNormalQuote}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          preferredNormalQuote: event.target.checked,
                        }))
                      }
                      className="size-4 rounded border-slate-300"
                    />
                    일반견적
                  </label>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800">
                    <input
                      type="checkbox"
                      checked={formData.preferredDiscountQuote}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          preferredDiscountQuote: event.target.checked,
                        }))
                      }
                      className="size-4 rounded border-slate-300"
                    />
                    할인견적
                  </label>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  둘 다 선택 가능합니다. 최소 한 가지는 선택해 주세요.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {formData.preferredNormalQuote ? (
                  <label className="block">
                    <span className="text-xs font-bold tracking-[-0.02em] text-slate-500">
                      일반견적
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.targetNormalPrice}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          targetNormalPrice: event.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      placeholder="선택 입력"
                      className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </label>
                ) : null}
                {formData.preferredDiscountQuote ? (
                  <label className="block">
                    <span className="text-xs font-bold tracking-[-0.02em] text-slate-500">
                      할인견적
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.targetMemberPrice}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          targetMemberPrice: event.target.value.replace(/[^\d]/g, ""),
                        }))
                      }
                      placeholder="선택 입력"
                      className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500"
                    />
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* ── 신청자 정보 ── */}
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
                setFormData((prev) => ({ ...prev, applicantName: event.target.value }))
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block px-1 text-xs font-black text-slate-500">
                  견적 조회용 간단 비밀번호
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    lookupPasswordError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="4자리 이상"
                  value={formData.lookupPassword}
                  onChange={(event) => {
                    setLookupPasswordError(null);
                    setFormData((prev) => ({ ...prev, lookupPassword: event.target.value }));
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block px-1 text-xs font-black text-slate-500">
                  간단 비밀번호 확인
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={`h-14 w-full rounded-2xl border bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 ${
                    lookupPasswordError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-blue-500"
                  }`}
                  placeholder="한 번 더 입력"
                  value={formData.lookupPasswordConfirm}
                  onChange={(event) => {
                    setLookupPasswordError(null);
                    setFormData((prev) => ({
                      ...prev,
                      lookupPasswordConfirm: event.target.value,
                    }));
                  }}
                />
              </label>
            </div>
            <p className="px-1 text-xs font-semibold leading-5 text-slate-500">
              나중에 내 견적요청을 다시 확인할 때 사용합니다.
            </p>
            {lookupPasswordError ? (
              <p className="px-1 text-xs font-medium leading-5 text-red-500">
                {lookupPasswordError}
              </p>
            ) : null}
            <input
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
              placeholder="단체명 입력"
              value={formData.organizationName}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, organizationName: event.target.value }))
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
                  organizationType: normalizeCustomerOrganizationType(event.target.value),
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
            {formData.organizationType === "공공기관" ? (
              <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                소속 확인이 가능한 단체만 심사 대상에 포함됩니다.
              </p>
            ) : null}
          </div>
        </div>

        {/* ── 증빙자료 첨부 ── */}
        {formData.applicationType === APPLICATION_TYPE_REQUIRES_ATTACHMENT ? (
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
                JPG, PNG, DOC, HWP 파일 지원
              </p>
              <p className="px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
                ※ 허위 자료 제출 시 지원이 제한될 수 있습니다.
              </p>
            </div>
          </div>
        ) : null}

        {/* ── 기타 요청사항 ── */}
        <div className="mt-9 border-t border-slate-100 pt-8">
          <h2 className="text-lg font-black tracking-[-0.045em] text-slate-950">
            기타 요청사항
          </h2>
          <textarea
            className="mt-5 h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base font-semibold tracking-[-0.03em] outline-none placeholder:text-slate-400 focus:border-blue-500"
            placeholder="추가 요청사항이나 전달 내용을 입력해주세요."
            value={formData.requestMessage}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, requestMessage: event.target.value }))
            }
            rows={4}
          />
          <p className="mt-3 px-1 text-xs font-medium leading-5 tracking-[-0.02em] text-slate-400">
            ※ 선택 입력 항목입니다.
          </p>
        </div>

        {/* ── 제출 버튼 ── */}
        <div className="mt-9 border-t border-slate-100 pt-8">
          <p className="mb-5 text-center text-xs font-medium leading-6 tracking-[-0.02em] text-slate-400">
            신청 후 기사 견적과 지원 가능 여부를 확인해 안내합니다.
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
            onClick={onSubmit}
            className="touch-manipulation relative z-10 flex min-h-[3.75rem] w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-4 text-lg font-black tracking-[-0.04em] text-white shadow-lg shadow-slate-950/20 ring-1 ring-slate-900/80 transition hover:bg-slate-900 hover:shadow-xl hover:shadow-slate-950/25 active:scale-[0.99] active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-950"
            style={tapStyle}
          >
            {isSubmitting ? "견적 신청 접수 중..." : "무료버스 견적 신청하기"}
          </button>
        </div>
      </div>
    </section>
  );
}
