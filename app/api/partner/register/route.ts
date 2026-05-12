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
  const manualReferralPhoneDigits = normalizeKoreanMobileDigits(
    body.referral_phone,
  );
  const hasManualReferralPhone = safeText(body.referral_phone) !== "";

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
  if (hasManualReferralPhone && manualReferralPhoneDigits == null) {
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

  let matchedReferral:
    | {
        id: string;
        referrer_partner_driver_id: string;
      }
    | null = null;
  let referralPhoneMismatch = false;
  let manualReferralSmsNeeded = false;
  let manualReferralSmsResult: { ok: boolean; error?: string } | null = null;

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
        const phoneMatches =
          referredPhoneDigits != null && referredPhoneDigits === phoneDigits;
        referralPhoneMismatch = !phoneMatches;
        if (phoneMatches) {
          matchedReferral = {
            id,
            referrer_partner_driver_id: referrerPartnerDriverId,
          };
        }
      }
    }
  }

  if (referralToken === "" && manualReferralPhoneDigits != null) {
    const phoneCandidates = [
      manualReferralPhoneDigits,
      formatKoreanMobile(manualReferralPhoneDigits),
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
      manualReferralSmsNeeded = true;
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
    if (referralPhoneMismatch) {
      insertPayload.referral_source = "quote_referral_phone_mismatch";
    }
  }
  if (referralToken === "" && manualReferralPhoneDigits != null) {
    insertPayload.referral_phone = manualReferralPhoneDigits;
    insertPayload.referral_source = matchedReferral
      ? "manual_phone_referral"
      : "manual_phone_referral_unregistered";
  }
  if (matchedReferral) {
    insertPayload.referrer_partner_driver_id =
      matchedReferral.referrer_partner_driver_id;
    if (referralToken !== "") {
      insertPayload.referral_source = "quote_referral";
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from("partner_drivers")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  const partnerDriverId = safeText((inserted as { id?: unknown } | null)?.id);
  if (matchedReferral && matchedReferral.id !== "" && partnerDriverId !== "") {
    const { error: updateError } = await admin
      .from("quote_referrals")
      .update({
        status: "joined",
        joined_partner_driver_id: partnerDriverId,
      })
      .eq("id", matchedReferral.id);

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
    manualReferralSmsNeeded &&
    manualReferralPhoneDigits != null &&
    partnerDriverId !== ""
  ) {
    const sms = await sendManualReferralInviteSms({
      toDigits: manualReferralPhoneDigits,
      applicantName: managerName,
    });
    manualReferralSmsResult = sms.ok
      ? { ok: true }
      : { ok: false, error: sms.error };

    const patch: Record<string, unknown> = sms.ok
      ? { referral_sms_sent_at: new Date().toISOString(), referral_sms_error: null }
      : { referral_sms_error: sms.error };
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
    manual_referral_sms_sent: manualReferralSmsResult?.ok === true,
    manual_referral_sms_error:
      manualReferralSmsResult?.ok === false
        ? manualReferralSmsResult.error
        : null,
  });
}
