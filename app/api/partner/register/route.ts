import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Body = {
  company_name?: unknown;
  manager_name?: unknown;
  phone?: unknown;
  email?: unknown;
  region?: unknown;
  business_type?: unknown;
  bus_types?: unknown;
  vehicle_model?: unknown;
  vehicle_number?: unknown;
  passenger_capacity?: unknown;
  business_license_url?: unknown;
  business_license_name?: unknown;
  memo?: unknown;
  referral_token?: unknown;
  referral_phone?: unknown;
  actual_referrer_phone?: unknown;
};

type DuplicatePartnerRow = {
  id: string;
  status: string;
  company_name: string;
  manager_name: string;
  created_at: string;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parsePassengerCapacity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/\D/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseBusTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSimpleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeKoreanMobileDigits(value: unknown): string | null {
  const digits = safeText(value).replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

function formatKoreanMobile(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function normalizeStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (status === "접수완료") return "pending";
  if (status === "검토중") return "reviewing";
  if (status === "승인완료" || status === "approve") return "approved";
  if (status === "반려" || status === "reject" || status === "denied") {
    return "rejected";
  }
  return status || "pending";
}

function duplicateResponse(row: DuplicatePartnerRow) {
  const status = normalizeStatus(row.status);
  if (status === "reviewing") {
    return {
      duplicate: true,
      status,
      title: "제휴기사 신청이 검토 중입니다.",
      message:
        "관리자가 제출하신 정보를 검토하고 있습니다.\n검토가 완료되면 안내드리겠습니다.",
      action_label: "홈으로 이동",
      action_url: "/",
      company_name: row.company_name,
      manager_name: row.manager_name,
      created_at: row.created_at,
    };
  }
  if (status === "approved") {
    return {
      duplicate: true,
      status,
      title: "이미 승인된 제휴기사 계정입니다.",
      message:
        "이미 제휴기사로 승인되어 로그인 후 콜대기 페이지를 이용하실 수 있습니다.",
      action_label: "제휴기사 로그인",
      action_url: "/partner/login",
      company_name: row.company_name,
      manager_name: row.manager_name,
      created_at: row.created_at,
    };
  }
  if (status === "rejected") {
    return {
      duplicate: true,
      status,
      title: "이전 제휴기사 신청이 반려되었습니다.",
      message:
        "이전 신청이 반려되었습니다.\n정보를 수정하여 다시 신청하시려면 관리자에게 문의하거나 새 신청을 진행해주세요.",
      action_label: "다시 신청하기",
      action_url: "resubmit",
      secondary_action_label: "고객센터 문의",
      secondary_action_url: "https://open.kakao.com/o/sZJ2nnyi",
      company_name: row.company_name,
      manager_name: row.manager_name,
      created_at: row.created_at,
    };
  }
  return {
    duplicate: true,
    status: status || "pending",
    title: "이미 제휴기사 신청이 접수되어 있습니다.",
    message:
      "현재 신청서가 접수되어 관리자 확인을 기다리고 있습니다.\n승인 후 문자 또는 안내를 받으실 수 있습니다.",
    action_label: "신청 상태 확인하기",
    action_url: "/partner/login",
    company_name: row.company_name,
    manager_name: row.manager_name,
    created_at: row.created_at,
  };
}

async function findExistingPartnerDriver(
  admin: NonNullable<ReturnType<typeof createServiceRoleSupabase>>,
  params: { phoneDigits: string; email: string },
): Promise<{ row: DuplicatePartnerRow | null; error: string | null }> {
  const phoneCandidates = [params.phoneDigits, formatKoreanMobile(params.phoneDigits)];
  const { data: phoneRows, error: phoneError } = await admin
    .from("partner_drivers")
    .select("id, status, company_name, manager_name, created_at")
    .in("phone", phoneCandidates)
    .order("created_at", { ascending: false })
    .limit(1);
  if (phoneError) return { row: null, error: phoneError.message };
  const phoneRow = Array.isArray(phoneRows) ? phoneRows[0] : null;
  if (phoneRow) {
    const row = phoneRow as Record<string, unknown>;
    return {
      row: {
        id: safeText(row.id),
        status: safeText(row.status, "pending"),
        company_name: safeText(row.company_name),
        manager_name: safeText(row.manager_name),
        created_at: safeText(row.created_at),
      },
      error: null,
    };
  }

  if (params.email === "") return { row: null, error: null };

  const { data: emailRows, error: emailError } = await admin
    .from("partner_drivers")
    .select("id, status, company_name, manager_name, created_at")
    .eq("email", params.email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (emailError) return { row: null, error: emailError.message };
  const emailRow = Array.isArray(emailRows) ? emailRows[0] : null;
  if (!emailRow) return { row: null, error: null };
  const row = emailRow as Record<string, unknown>;
  return {
    row: {
      id: safeText(row.id),
      status: safeText(row.status, "pending"),
      company_name: safeText(row.company_name),
      manager_name: safeText(row.manager_name),
      created_at: safeText(row.created_at),
    },
    error: null,
  };
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://www.free-bus.co.kr";
}

async function sendManualReferralInviteSms(params: {
  toDigits: string;
  applicantName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !from) {
    return {
      ok: false,
      error:
        "솔라피 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.",
    };
  }

  const text = `[무료관광버스]
방금 소개해주신 ${params.applicantName}님이 무료버스 제휴기사로 회원가입을 신청하셨습니다.

앞으로 저희 무료버스와 함께해주시면 더욱 감사드리겠습니다.

제휴기사 등록:
${siteBaseUrl()}/partner/register?invitePhone=${params.toDigits}`;

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to: params.toDigits, from, text }]);
    return { ok: true };
  } catch (e) {
    console.error("[partner/register] manual referral sms failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const companyName = safeText(body.company_name);
  const managerName = safeText(body.manager_name);
  const phone = safeText(body.phone);
  const phoneDigits = normalizeKoreanMobileDigits(phone);
  const email = safeText(body.email);
  const region = safeText(body.region);
  const businessType = safeText(body.business_type);
  const busTypes = parseBusTypes(body.bus_types);
  const vehicleModel = safeText(body.vehicle_model);
  const vehicleNumber = safeText(body.vehicle_number).replace(/\s/g, "");
  const passengerCapacity = parsePassengerCapacity(body.passenger_capacity);
  const referralToken = safeText(body.referral_token);
  const actualReferrerPhoneDigits = normalizeKoreanMobileDigits(
    body.actual_referrer_phone ?? body.referral_phone,
  );
  const hasActualReferrerPhone =
    safeText(body.actual_referrer_phone ?? body.referral_phone) !== "";

  if (
    companyName === "" ||
    managerName === "" ||
    phoneDigits == null ||
    region === "" ||
    businessType === "" ||
    busTypes.length === 0 ||
    vehicleModel === "" ||
    vehicleNumber === "" ||
    passengerCapacity == null ||
    passengerCapacity < 1
  ) {
    return NextResponse.json(
      { error: "필수 항목을 모두 입력해 주세요." },
      { status: 400 },
    );
  }

  if (email !== "" && !isSimpleEmail(email)) {
    return NextResponse.json(
      { error: "이메일 형식을 확인해 주세요." },
      { status: 400 },
    );
  }
  if (hasActualReferrerPhone && actualReferrerPhoneDigits == null) {
    return NextResponse.json(
      { error: "추천인 연락처 형식을 확인해 주세요." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const existingLookup = await findExistingPartnerDriver(admin, {
    phoneDigits,
    email,
  });
  if (existingLookup.error) {
    return NextResponse.json({ error: existingLookup.error }, { status: 502 });
  }
  const existingPartner = existingLookup.row;
  const isRejectedResubmission =
    existingPartner != null &&
    normalizeStatus(existingPartner.status) === "rejected";
  if (existingPartner && !isRejectedResubmission) {
    return NextResponse.json(duplicateResponse(existingPartner), { status: 409 });
  }

  let matchedReferral:
    | {
        id: string;
        referrer_partner_driver_id: string;
      }
    | null = null;
  let referralPhoneMismatch = false;
  let quoteReferralId = "";
  let actualReferralSmsNeeded = false;
  let actualReferralSmsResult: { ok: boolean; error?: string } | null = null;

  if (referralToken !== "") {
    const { data: referral, error: referralError } = await admin
      .from("quote_referrals")
      .select("id, referrer_partner_driver_id, referred_phone, expires_at")
      .eq("token", referralToken)
      .maybeSingle();

    if (referralError) {
      return NextResponse.json({ error: referralError.message }, { status: 502 });
    }

    const row = referral as
      | {
          id?: unknown;
          referrer_partner_driver_id?: unknown;
          referred_phone?: unknown;
          expires_at?: unknown;
        }
      | null
      | undefined;
    const expiresAt = safeText(row?.expires_at);
    const expiresTime = expiresAt === "" ? NaN : new Date(expiresAt).getTime();
    if (row && Number.isFinite(expiresTime) && expiresTime >= Date.now()) {
      const id = safeText(row.id);
      const referrerPartnerDriverId = safeText(row.referrer_partner_driver_id);
      const referredPhoneDigits = normalizeKoreanMobileDigits(row.referred_phone);
      if (id !== "" && referrerPartnerDriverId !== "") {
        quoteReferralId = id;
        const phoneMatches =
          referredPhoneDigits != null && referredPhoneDigits === phoneDigits;
        referralPhoneMismatch = !phoneMatches;
      }
    }
  }

  if (actualReferrerPhoneDigits != null) {
    const phoneCandidates = [
      actualReferrerPhoneDigits,
      formatKoreanMobile(actualReferrerPhoneDigits),
    ];
    const { data: referrerRows, error: referrerError } = await admin
      .from("partner_drivers")
      .select("id, status")
      .in("phone", phoneCandidates)
      .order("created_at", { ascending: false })
      .limit(5);

    if (referrerError) {
      return NextResponse.json({ error: referrerError.message }, { status: 502 });
    }

    const referrer = (Array.isArray(referrerRows) ? referrerRows : []).find(
      (raw) => {
        const row = raw as { id?: unknown; status?: unknown };
        const status = safeText(row.status).toLowerCase();
        return (
          safeText(row.id) !== "" &&
          (status === "approved" ||
            status === "pending" ||
            status === "reviewing")
        );
      },
    ) as { id?: unknown } | undefined;

    if (referrer?.id) {
      matchedReferral = {
        id: "",
        referrer_partner_driver_id: safeText(referrer.id),
      };
    } else {
      actualReferralSmsNeeded = true;
    }
  }

  const insertPayload: Record<string, unknown> = {
    company_name: companyName,
    manager_name: managerName,
    phone,
    email: email === "" ? null : email,
    region,
    business_type: businessType,
    bus_types: busTypes,
    vehicle_model: vehicleModel,
    vehicle_number: vehicleNumber,
    passenger_capacity: passengerCapacity,
    business_license_url: safeText(body.business_license_url) || null,
    business_license_name: safeText(body.business_license_name) || null,
    memo: safeText(body.memo) || null,
  };

  if (referralToken !== "") {
    insertPayload.referral_token = referralToken;
    if (actualReferrerPhoneDigits != null) {
      insertPayload.referral_source = "quote_referral_actual_referrer";
    } else if (referralPhoneMismatch) {
      insertPayload.referral_source = "quote_referral_phone_mismatch";
    } else {
      insertPayload.referral_source = "quote_referral";
    }
  }
  if (actualReferrerPhoneDigits != null) {
    insertPayload.actual_referrer_phone = actualReferrerPhoneDigits;
    insertPayload.referral_phone = actualReferrerPhoneDigits;
    insertPayload.referral_source = matchedReferral
      ? "manual_actual_referrer"
      : "manual_actual_referrer_unregistered";
    insertPayload.actual_referral_source = matchedReferral
      ? "manual_actual_referrer"
      : "manual_actual_referrer_unregistered";
  }
  if (matchedReferral) {
    insertPayload.referrer_partner_driver_id =
      matchedReferral.referrer_partner_driver_id;
    insertPayload.actual_referrer_partner_driver_id =
      matchedReferral.referrer_partner_driver_id;
  }

  const writeQuery = isRejectedResubmission
    ? admin
        .from("partner_drivers")
        .update({
          ...insertPayload,
          status: "pending",
          admin_memo: null,
        })
        .eq("id", existingPartner.id)
    : admin.from("partner_drivers").insert(insertPayload);

  const { data: inserted, error: insertError } = await writeQuery
    .select("id")
    .single();

  if (insertError) {
    if (/duplicate key|unique constraint|23505/i.test(insertError.message)) {
      const fallbackLookup = await findExistingPartnerDriver(admin, {
        phoneDigits,
        email,
      });
      if (fallbackLookup.row) {
        return NextResponse.json(duplicateResponse(fallbackLookup.row), {
          status: 409,
        });
      }
      return NextResponse.json(
        {
          error:
            "이미 같은 연락처 또는 이메일로 신청된 내역이 있습니다. 신청 상태 확인 또는 고객센터 문의를 이용해 주세요.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  const partnerDriverId = safeText((inserted as { id?: unknown } | null)?.id);
  if (
    referralToken !== "" &&
    quoteReferralId !== "" &&
    partnerDriverId !== ""
  ) {
    const { error: updateError } = await admin
      .from("quote_referrals")
      .update({
        status: "joined",
        joined_partner_driver_id: partnerDriverId,
      })
      .eq("id", quoteReferralId);

    if (updateError) {
      return NextResponse.json(
        {
          error: `등록은 접수되었지만 추천 상태 갱신에 실패했습니다: ${updateError.message}`,
        },
        { status: 502 },
      );
    }
  }

  if (
    actualReferralSmsNeeded &&
    actualReferrerPhoneDigits != null &&
    partnerDriverId !== ""
  ) {
    const sms = await sendManualReferralInviteSms({
      toDigits: actualReferrerPhoneDigits,
      applicantName: managerName,
    });
    actualReferralSmsResult = sms.ok
      ? { ok: true }
      : { ok: false, error: sms.error };

    const patch: Record<string, unknown> = sms.ok
      ? {
          actual_referral_sms_sent_at: new Date().toISOString(),
          actual_referral_sms_error: null,
          referral_sms_sent_at: new Date().toISOString(),
          referral_sms_error: null,
        }
      : {
          actual_referral_sms_error: sms.error,
          referral_sms_error: sms.error,
        };
    const { error: smsPatchError } = await admin
      .from("partner_drivers")
      .update(patch)
      .eq("id", partnerDriverId);
    if (smsPatchError) {
      console.warn(
        "[partner/register] referral sms status update failed:",
        smsPatchError.message,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    partner_driver_id: partnerDriverId,
    referral_matched: matchedReferral != null,
    referral_phone_mismatch: referralPhoneMismatch,
    manual_referral_sms_sent: actualReferralSmsResult?.ok === true,
    manual_referral_sms_error:
      actualReferralSmsResult?.ok === false
        ? actualReferralSmsResult.error
        : null,
  });
}
