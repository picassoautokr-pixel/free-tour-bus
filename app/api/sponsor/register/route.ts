import { NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/roles";
import {
  parseSponsorSupportType,
  safeText,
} from "@/lib/sponsor";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Body = {
  company_name?: unknown;
  manager_name?: unknown;
  phone?: unknown;
  email?: unknown;
  password?: unknown;
  business_number?: unknown;
  business_category?: unknown;
  product_category?: unknown;
  product_description?: unknown;
  support_type?: unknown;
  admin_memo?: unknown;
};

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const companyName = safeText(body.company_name);
  const managerName = safeText(body.manager_name);
  const phone = safeText(body.phone);
  const email = safeText(body.email).toLowerCase();
  const password = safeText(body.password);
  const supportType = parseSponsorSupportType(body.support_type);

  if (!companyName || !managerName || !phone || !isEmailLike(email)) {
    return NextResponse.json(
      { error: "업체명, 담당자명, 연락처, 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "비밀번호는 8자 이상으로 설정해 주세요." },
      { status: 400 },
    );
  }

  const existing = await admin
    .from("sponsor_companies")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  if (existing.data) {
    return NextResponse.json(
      { error: "이미 후원업체 신청이 접수된 이메일입니다." },
      { status: 409 },
    );
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: USER_ROLES.SPONSOR, company_name: companyName },
  });
  if (created.error || !created.data.user?.id) {
    return NextResponse.json(
      { error: created.error?.message ?? "후원업체 계정을 생성하지 못했습니다." },
      { status: 502 },
    );
  }

  const userId = created.data.user.id;
  const inserted = await admin
    .from("sponsor_companies")
    .insert({
      auth_user_id: userId,
      company_name: companyName,
      manager_name: managerName,
      phone,
      email,
      business_number: safeText(body.business_number),
      business_category: safeText(body.business_category),
      product_category: safeText(body.product_category),
      product_description: safeText(body.product_description),
      support_type: supportType,
      status: "pending",
      admin_memo: safeText(body.admin_memo),
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data?.id) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json(
      { error: inserted.error?.message ?? "후원업체 신청 저장에 실패했습니다." },
      { status: 502 },
    );
  }

  await admin.from("profiles").upsert(
    {
      user_id: userId,
      name: managerName,
      phone,
      email,
      role: USER_ROLES.SPONSOR,
      sponsor_company_id: inserted.data.id,
    },
    { onConflict: "user_id" },
  );

  return NextResponse.json({ ok: true, sponsor_company_id: inserted.data.id });
}
