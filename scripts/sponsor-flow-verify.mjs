/**
 * 스폰서 지원 흐름 DB 검증 (서비스 롤 필요)
 *
 * 사용:
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   node scripts/sponsor-flow-verify.mjs
 *
 * 선택:
 *   SPONSOR_VERIFY_APPLICATION_ID=<uuid>  기존 신청으로 매칭만 재검증
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function log(section, detail) {
  console.log(`\n=== ${section} ===`);
  if (detail != null) console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

function fail(msg) {
  console.error(`\n[FAIL] ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[OK] ${msg}`);
}

if (!url || !key) {
  fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error || !/does not exist|42703|column/i.test(error.message ?? "");
}

async function main() {
  const report = { checks: [] };
  const push = (name, pass, detail) => {
    report.checks.push({ name, pass, detail });
    (pass ? ok : fail)(`${name}${detail ? `: ${detail}` : ""}`);
  };

  log("환경", { url: url.slice(0, 32) + "…" });

  const hasIsDefault = await columnExists("sponsor_rules", "is_default");
  const hasAssignedRegions = await columnExists("sponsor_staff", "assigned_regions");
  const hasPlannedSnapshot = await columnExists("sponsor_preapprovals", "planned_total_support");
  push("sponsor_rules.is_default", hasIsDefault, hasIsDefault ? "컬럼 존재" : "sql/sponsor_rules_is_default.sql 적용 필요");
  push("sponsor_staff.assigned_regions", hasAssignedRegions, hasAssignedRegions ? "컬럼 존재" : "sql/sponsor_staff_assigned_regions.sql 적용 필요");
  push("sponsor_preapprovals.planned_total_support", hasPlannedSnapshot, hasPlannedSnapshot ? "컬럼 존재" : "sql/sponsor_preapprovals_confirm_snapshot.sql 적용 필요");

  const { data: companies, error: coErr } = await admin
    .from("sponsor_companies")
    .select("id, company_name, status")
    .eq("status", "approved")
    .limit(5);
  if (coErr) {
    push("approved sponsors", false, coErr.message);
  } else {
    push("approved sponsors", (companies ?? []).length > 0, `${(companies ?? []).length}건`);
  }

  const companyId = companies?.[0]?.id;
  if (companyId) {
    const { data: defaultRules } = await admin
      .from("sponsor_rules")
      .select("id, title, is_default, is_active")
      .eq("sponsor_company_id", companyId);
    const defaults = (defaultRules ?? []).filter(
      (r) => r.is_default === true || r.title === "기본지원",
    );
    push(
      "기본지원 규칙 (회사당)",
      defaults.length >= 1,
      `${defaults.length}건 (is_default=${defaults.filter((r) => r.is_default).length})`,
    );

    const { data: staffRows } = await admin
      .from("sponsor_staff")
      .select("id, name, assigned_regions, service_regions")
      .eq("sponsor_company_id", companyId)
      .limit(3);
    const multiRegion = (staffRows ?? []).some((s) => {
      const ar = Array.isArray(s.assigned_regions) ? s.assigned_regions : s.service_regions;
      return Array.isArray(ar) && ar.length > 1;
    });
    push(
      "담당자 다중 지역 (assigned_regions)",
      hasAssignedRegions,
      multiRegion ? "다중 지역 담당자 있음" : "샘플 없음 — 설정에서 다중 선택 가능",
    );
  }

  const appId = process.env.SPONSOR_VERIFY_APPLICATION_ID?.trim();
  let applicationId = appId;

  if (!applicationId) {
    const { data: recent } = await admin
      .from("applications")
      .select("id, application_type, departure_region, passenger_count, organization_type, sponsor_support_status")
      .eq("application_type", "신규로 예약이 필요하신 경우")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    applicationId = recent?.id;
    if (recent) {
      push(
        "최근 신규 견적",
        true,
        `id=${recent.id} sponsor_support_status=${recent.sponsor_support_status ?? "(null)"}`,
      );
    } else {
      push("최근 신규 견적", false, "신규 예약 견적 없음");
    }
  }

  if (applicationId) {
    const { data: preRows } = await admin
      .from("sponsor_preapprovals")
      .select(
        "id, status, sponsor_company_id, sponsor_rule_id, estimated_support_amount, planned_total_support, sponsor_rule_name, support_kind, manager_name, approved_support_amount",
      )
      .eq("application_id", applicationId);
    const reviewRows = (preRows ?? []).filter((r) =>
      ["preapproved", "pending", "reviewing"].includes(String(r.status ?? "")),
    );
    push(
      "지원검토(preapproved) 레코드",
      reviewRows.length > 0,
      `${reviewRows.length}건 / 전체 ${(preRows ?? []).length}건`,
    );
    if (reviewRows[0]) {
      const r = reviewRows[0];
      push(
        "기본지원·예상금 자동연결",
        (r.estimated_support_amount ?? 0) > 0 && Boolean(r.sponsor_rule_id),
        `estimated=${r.estimated_support_amount} rule=${r.sponsor_rule_id}`,
      );
    }

    const approved = (preRows ?? []).find((r) => r.status === "approved");
    if (approved) {
      push(
        "지원확정 스냅샷",
        Boolean(approved.sponsor_rule_name || approved.support_kind) &&
          (approved.approved_support_amount ?? 0) > 0,
        JSON.stringify({
          sponsor_rule_name: approved.sponsor_rule_name,
          planned_total_support: approved.planned_total_support,
          approved_support_amount: approved.approved_support_amount,
          manager_name: approved.manager_name,
        }),
      );
    }

    const { data: app } = await admin
      .from("applications")
      .select("final_selected_quote_id, sponsor_support_status")
      .eq("id", applicationId)
      .maybeSingle();
    push(
      "매칭완료 상태",
      Boolean(app?.final_selected_quote_id),
      app?.final_selected_quote_id
        ? `quote=${app.final_selected_quote_id}`
        : "미매칭 (고객정보 API 마스킹은 매칭 후 공개)",
    );
  }

  log("요약", {
    passed: report.checks.filter((c) => c.pass).length,
    failed: report.checks.filter((c) => !c.pass).length,
    total: report.checks.length,
  });

  if (report.checks.some((c) => !c.pass)) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
