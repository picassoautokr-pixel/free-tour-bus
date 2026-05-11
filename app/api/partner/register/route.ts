import { NextResponse } from "next/server";

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
  const email = safeText(body.email);
  const region = safeText(body.region);
  const businessType = safeText(body.business_type);
  const busTypes = parseBusTypes(body.bus_types);
  const vehicleModel = safeText(body.vehicle_model);
  const vehicleNumber = safeText(body.vehicle_number).replace(/\s/g, "");
  const passengerCapacity = parsePassengerCapacity(body.passenger_capacity);
  const referralToken = safeText(body.referral_token);

  if (
    companyName === "" ||
    managerName === "" ||
    phone === "" ||
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

  if (referralToken !== "") {
    const { data: referral, error: referralError } = await admin
      .from("quote_referrals")
      .select("id, referrer_partner_driver_id, expires_at")
      .eq("token", referralToken)
      .maybeSingle();

    if (referralError) {
      return NextResponse.json({ error: referralError.message }, { status: 502 });
    }

    const row = referral as
      | {
          id?: unknown;
          referrer_partner_driver_id?: unknown;
          expires_at?: unknown;
        }
      | null
      | undefined;
    const expiresAt = safeText(row?.expires_at);
    const expiresTime = expiresAt === "" ? NaN : new Date(expiresAt).getTime();
    if (row && Number.isFinite(expiresTime) && expiresTime >= Date.now()) {
      const id = safeText(row.id);
      const referrerPartnerDriverId = safeText(row.referrer_partner_driver_id);
      if (id !== "" && referrerPartnerDriverId !== "") {
        matchedReferral = {
          id,
          referrer_partner_driver_id: referrerPartnerDriverId,
        };
      }
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
  }
  if (matchedReferral) {
    insertPayload.referrer_partner_driver_id =
      matchedReferral.referrer_partner_driver_id;
    insertPayload.referral_source = "quote_referral";
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
  if (matchedReferral && partnerDriverId !== "") {
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

  return NextResponse.json({
    ok: true,
    partner_driver_id: partnerDriverId,
    referral_matched: matchedReferral != null,
  });
}
