"use client";

import { useEffect, useRef, useState } from "react";

import { CustomerSupportSheet } from "@/components/CustomerSupportSheet";
import { ApplicationBenefitsSection } from "@/components/site/ApplicationBenefitsSection";
import { ApplicationFormCard } from "@/components/site/ApplicationFormCard";
import { ApplicationSuccessModal } from "@/components/site/ApplicationSuccessModal";
import { SiteHeroSection } from "@/components/site/SiteHeroSection";
import {
  APPLICATION_TYPE_REQUIRES_ATTACHMENT,
  DRAFT_STORAGE_KEY,
  INITIAL_FORM_DATA,
  addHoursFromNow,
  buildDepartureDateTimeSummary,
  formatPhoneNumber,
  generateReceiptNumber,
  makeUploadObjectKey,
  parsePositiveIntegerText,
  resolveDepartureTimeForDb,
  type ApplicationInsertPayload,
  type FormData,
  type SubmitSuccessSummary,
} from "@/components/site/site-form-types";
import { inferDepartureRegion } from "@/lib/regions";
import { normalizeCustomerOrganizationType } from "@/lib/organization-types";
import { parseStopovers } from "@/lib/stopovers";
import { createSupabaseClient } from "@/lib/supabase";
import { hashLookupPassword } from "@/lib/lookup-password";

export default function Home() {
  const [formData, setFormData] = useState<FormData>(() => ({
    ...INITIAL_FORM_DATA,
  }));

  const [phoneError, setPhoneError] = useState(false);
  const [lookupPasswordError, setLookupPasswordError] = useState<string | null>(null);
  const [passengerCountError, setPassengerCountError] = useState(false);
  const [departureError, setDepartureError] = useState<string | null>(null);
  const [departureRegionError, setDepartureRegionError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [dateTimeError, setDateTimeError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [showSubmitSuccess, setShowSubmitSuccess] = useState(false);
  const [successSummary, setSuccessSummary] = useState<SubmitSuccessSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [supportSheetOpen, setSupportSheetOpen] = useState(false);

  const inferredDepartureRegion = inferDepartureRegion(formData.departure);

  useEffect(() => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const resetFormToInitial = () => {
    setFormData({ ...INITIAL_FORM_DATA });
    setAttachmentFile(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
    setPhoneError(false);
    setPassengerCountError(false);
    setDepartureError(null);
    setDepartureRegionError(null);
    setDestinationError(null);
    setDateTimeError(null);
    setSuccessSummary(null);
  };

  const handleSubmit = async () => {
    setDepartureError(null);
    setDepartureRegionError(null);
    setDestinationError(null);
    setDateTimeError(null);

    const phoneDigits = formData.phone.replace(/[^0-9]/g, "");
    const phoneOk = phoneDigits.length === 11 && phoneDigits.startsWith("010");
    const parsedCount = Number.parseInt(formData.passengerCount, 10);
    const headcountOk = Number.isFinite(parsedCount) && parsedCount >= 10;

    setPhoneError(!phoneOk);
    const lookupPassword = formData.lookupPassword.trim();
    const lookupPasswordConfirm = formData.lookupPasswordConfirm.trim();
    const lookupPasswordErr =
      lookupPassword.length < 4
        ? "견적 조회용 간단 비밀번호는 4자리 이상 입력해 주세요."
        : lookupPassword !== lookupPasswordConfirm
          ? "견적 조회용 비밀번호가 서로 일치하지 않습니다."
          : null;
    setLookupPasswordError(lookupPasswordErr);
    setPassengerCountError(!headcountOk);

    if (!phoneOk || !headcountOk || lookupPasswordErr) return;

    if (!formData.preferredNormalQuote && !formData.preferredDiscountQuote) {
      setSubmitErrorMessage("희망견적유형을 최소 한 가지 이상 선택해 주세요.");
      setSubmitError(true);
      return;
    }

    const depTrim = formData.departure.trim();
    const destTrim = formData.destination.trim();
    const finalDepartureRegion =
      (formData.departureRegionManual
        ? formData.departureRegion
        : inferredDepartureRegion) || "";

    const depErr = depTrim === "" ? "출발지를 입력해주세요." : null;
    const depRegionErr = finalDepartureRegion === "" ? "출발지역을 선택해주세요." : null;
    const destErr = destTrim === "" ? "도착지를 입력해주세요." : null;

    const dateOk = formData.departureDate.trim() !== "";
    const customOk =
      formData.departureTimeSlot !== "custom" ||
      formData.departureTimeCustom.trim() !== "";
    const dtErr =
      !dateOk || !customOk ? "출발일과 시간대를 모두 선택해 주세요." : null;

    if (depErr || depRegionErr || destErr || dtErr) {
      setDepartureError(depErr);
      setDepartureRegionError(depRegionErr);
      setDestinationError(destErr);
      setDateTimeError(dtErr);
      return;
    }

    const departureTimeValue = resolveDepartureTimeForDb(
      formData.departureTimeSlot,
      formData.departureTimeCustom,
    );

    setSubmitError(false);
    setSubmitErrorMessage(null);
    setIsSubmitting(true);

    const departureDateValue = formData.departureDate.trim();
    const returnDateValue = formData.returnDate.trim();

    try {
      const supabase = createSupabaseClient();

      let uploadedFileUrl: string | null = null;
      let uploadedFileName: string | null = null;

      const needsAttachment =
        formData.applicationType === APPLICATION_TYPE_REQUIRES_ATTACHMENT;

      if (needsAttachment && attachmentFile) {
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

      const receiptNumber = generateReceiptNumber();
      const quoteDeadlineHours =
        formData.quoteDeadlineOption === "custom"
          ? parsePositiveIntegerText(formData.quoteDeadlineCustomHours)
          : Number.parseInt(formData.quoteDeadlineOption, 10);
      const quoteLimitCount =
        formData.quoteLimitOption === "custom"
          ? parsePositiveIntegerText(formData.quoteLimitCustomCount)
          : Number.parseInt(formData.quoteLimitOption, 10);
      const stopovers = parseStopovers(formData.stopovers);

      const insertPayload: ApplicationInsertPayload = {
        receipt_number: receiptNumber,
        application_type: formData.applicationType,
        trip_type: formData.tripType,
        bus_grade: formData.busGrade,
        departure: depTrim,
        departure_detail: "",
        departure_region: finalDepartureRegion,
        destination: destTrim,
        destination_detail: "",
        stopovers: stopovers.length > 0 ? stopovers : null,
        departure_date: departureDateValue === "" ? null : departureDateValue,
        departure_time: departureTimeValue,
        return_date: returnDateValue === "" ? null : returnDateValue,
        passenger_count: Number(parsedCount),
        applicant_name: formData.applicantName.trim(),
        phone: formatPhoneNumber(phoneDigits),
        organization_name: formData.organizationName.trim(),
        organization_type:
          normalizeCustomerOrganizationType(formData.organizationType) === ""
            ? null
            : normalizeCustomerOrganizationType(formData.organizationType),
        request_message: formData.requestMessage.trim(),
        file_url: needsAttachment ? uploadedFileUrl : null,
        file_name: needsAttachment ? uploadedFileName : null,
        status: "pending",
        quote_deadline_at:
          (quoteDeadlineHours ?? 0) > 0
            ? addHoursFromNow(quoteDeadlineHours ?? 0)
            : null,
        quote_limit_count: quoteLimitCount,
        target_normal_price: parsePositiveIntegerText(formData.targetNormalPrice),
        target_member_price: parsePositiveIntegerText(formData.targetMemberPrice),
        preferred_quote_types: [
          ...(formData.preferredNormalQuote ? ["normal"] : []),
          ...(formData.preferredDiscountQuote ? ["support"] : []),
        ],
        quote_status: "collecting",
        extension_round: 0,
        support_client_reward_ratio: 0,
        support_driver_ratio: 100,
        // hash(SHA-256 + salt)로 저장. 검증은 verifyLookupPassword 참고.
        client_lookup_password: await hashLookupPassword(lookupPassword),
        client_lookup_password_set_at: new Date().toISOString(),
      };

      let insertPayloadFinal = insertPayload;
      let { data: insertedApplication, error } = await supabase
        .from("applications")
        .insert(insertPayloadFinal)
        .select("id")
        .single();
      if (
        error &&
        /preferred_quote_types/i.test(error.message) &&
        "preferred_quote_types" in insertPayloadFinal
      ) {
        const { preferred_quote_types: _removed, ...withoutPreferred } = insertPayloadFinal;
        insertPayloadFinal = withoutPreferred;
        ({ data: insertedApplication, error } = await supabase
          .from("applications")
          .insert(insertPayloadFinal)
          .select("id")
          .single());
      }
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

      void fetch("/api/notifications/new-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_number: receiptNumber }),
      }).catch(() => {
        /* 신청 저장 성공 후 알림 로그 실패는 사용자 흐름을 막지 않습니다. */
      });

      const insertedApplicationId =
        typeof insertedApplication?.id === "string" ? insertedApplication.id : "";
      if (insertedApplicationId) {
        void fetch("/api/sponsor/preapprovals/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ application_id: insertedApplicationId }),
        }).catch((matchError) => {
          console.warn("[sponsor preapproval] match failed:", matchError);
        });
      }

      setSuccessSummary({
        receiptNumber,
        applicationType: formData.applicationType,
        applicantName: formData.applicantName.trim(),
        phone: formatPhoneNumber(phoneDigits),
        departure: depTrim,
        destination: destTrim,
        departureDateTime: buildDepartureDateTimeSummary(
          departureDateValue,
          departureTimeValue,
        ),
      });
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
      <SiteHeroSection />

      <ApplicationFormCard
        formData={formData}
        setFormData={setFormData}
        phoneError={phoneError}
        setPhoneError={setPhoneError}
        lookupPasswordError={lookupPasswordError}
        setLookupPasswordError={setLookupPasswordError}
        passengerCountError={passengerCountError}
        setPassengerCountError={setPassengerCountError}
        departureError={departureError}
        setDepartureError={setDepartureError}
        departureRegionError={departureRegionError}
        setDepartureRegionError={setDepartureRegionError}
        destinationError={destinationError}
        setDestinationError={setDestinationError}
        dateTimeError={dateTimeError}
        setDateTimeError={setDateTimeError}
        attachmentFile={attachmentFile}
        setAttachmentFile={setAttachmentFile}
        attachmentInputRef={attachmentInputRef}
        isSubmitting={isSubmitting}
        submitError={submitError}
        submitErrorMessage={submitErrorMessage}
        onSubmit={handleSubmit}
      />

      <ApplicationBenefitsSection />

      {showSubmitSuccess && successSummary ? (
        <ApplicationSuccessModal
          summary={successSummary}
          onConfirm={() => setShowSubmitSuccess(false)}
          onReset={() => {
            resetFormToInitial();
            setShowSubmitSuccess(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}

      <CustomerSupportSheet
        open={supportSheetOpen}
        onClose={() => setSupportSheetOpen(false)}
      />

      <button
        type="button"
        className="fixed bottom-24 right-[max(1.25rem,calc((100vw-480px)/2+1.25rem))] z-40 flex h-14 items-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950 shadow-[0_14px_30px_rgba(161,98,7,0.35)] ring-1 ring-yellow-200 transition hover:-translate-y-1 hover:bg-yellow-200 active:translate-y-0"
        onClick={() => setSupportSheetOpen(true)}
        aria-expanded={supportSheetOpen}
        aria-haspopup="dialog"
        aria-controls="customer-support-sheet"
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
