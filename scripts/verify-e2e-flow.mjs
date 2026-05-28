/**
 * E2E 흐름 DB 검증 스크립트
 *
 * 사용법:
 *   set NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *   npm run verify:e2e
 *
 * 특정 신청서 지정:
 *   set E2E_APPLICATION_ID=<uuid>
 *   npm run verify:e2e
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const targetAppId = process.env.E2E_APPLICATION_ID?.trim();

// ─── 출력 유틸 ────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
let warnCount = 0;

function section(title) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function ok(label, detail = "") {
  passCount++;
  console.log(`  [OK]   ${label}${detail ? "  →  " + detail : ""}`);
}

function fail(label, detail = "") {
  failCount++;
  console.error(`  [FAIL] ${label}${detail ? "  →  " + detail : ""}`);
}

function warn(label, detail = "") {
  warnCount++;
  console.warn(`  [WARN] ${label}${detail ? "  →  " + detail : ""}`);
}

function check(label, pass, detail = "", warnOnly = false) {
  if (pass) ok(label, detail);
  else if (warnOnly) warn(label, detail);
  else fail(label, detail);
}

// ─── 환경 확인 ────────────────────────────────────────────────
if (!url || !key) {
  console.error(
    "[ERROR] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── 헬퍼 ────────────────────────────────────────────────────
async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error || !/does not exist|42703|column/i.test(error?.message ?? "");
}

function fmt(val) {
  if (val == null) return "(null)";
  if (typeof val === "number") return val.toLocaleString("ko-KR") + "원";
  return String(val);
}

function extractBreakdown(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    capture_phase: raw.capture_phase ?? null,
    support_stage: raw.support_stage ?? null,
    normal_price: raw.normal_price ?? null,
    planned_total_support: raw.planned_total_support ?? null,
    planned_customer_support: raw.planned_customer_support ?? null,
    planned_driver_support: raw.planned_driver_support ?? null,
    planned_discount_price: raw.planned_discount_price ?? null,
    confirmed_total_support: raw.confirmed_total_support ?? null,
    confirmed_customer_support: raw.confirmed_customer_support ?? null,
    confirmed_driver_support: raw.confirmed_driver_support ?? null,
    confirmed_discount_price: raw.confirmed_discount_price ?? null,
    final_discount_price: raw.final_discount_price ?? null,
    extension_support: raw.extension_support ?? null,
  };
}

// ─── 메인 ────────────────────────────────────────────────────
async function main() {
  section("1. DB 스키마 컬럼 존재 확인");

  const checks = [
    ["applications", "selected_price_type"],
    ["applications", "selected_price_label"],
    ["applications", "selected_price"],
    ["applications", "client_price_selection_kind"],
    ["applications", "sponsor_support_status"],
    ["driver_quotes", "support_breakdown"],
    ["sponsor_preapprovals", "approved_support_amount"],
    ["sponsor_rules", "service_regions"],
  ];

  for (const [table, col] of checks) {
    const exists = await columnExists(table, col);
    check(`${table}.${col}`, exists, exists ? "존재" : "SQL 마이그레이션 필요");
  }

  const hasPlannedCols = await columnExists("driver_quotes", "planned_total_support");
  check(
    "driver_quotes.planned_total_support",
    hasPlannedCols,
    hasPlannedCols ? "존재" : "레거시 DB — support_breakdown fallback 사용",
    true,
  );

  const hasConfirmedCols = await columnExists("driver_quotes", "confirmed_discount_price");
  check(
    "driver_quotes.confirmed_discount_price",
    hasConfirmedCols,
    hasConfirmedCols ? "존재" : "레거시 DB",
    true,
  );

  // ─── 대상 신청서 찾기 ──────────────────────────────────────
  section("2. 검증 대상 신청서 선택");

  let appId = targetAppId;

  if (!appId) {
    // 가장 최근 신규 신청서 자동 선택
    const { data: recent } = await admin
      .from("applications")
      .select("id, receipt_number, group_type, departure_region, sponsor_support_status, quote_status, final_selected_quote_id, created_at")
      .eq("application_type", "신규로 예약이 필요하신 경우")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!recent?.length) {
      fail("검증 대상 신청서 없음", "신규 견적요청 신청서를 먼저 생성하세요.");
      return;
    }

    console.log("\n  최근 신청서 목록:");
    for (const r of recent) {
      const matched = r.final_selected_quote_id ? "[매칭완료]" : "[미매칭]";
      console.log(
        `    ${matched} ${r.receipt_number ?? r.id} | 출발:${r.departure_region ?? "-"} | 스폰서:${r.sponsor_support_status ?? "-"} | 생성:${r.created_at?.slice(0, 16)}`,
      );
    }

    // 스폰서 확정 + 견적 있는 것 우선, 없으면 최신 것
    const best =
      recent.find((r) => r.sponsor_support_status === "approved" && r.final_selected_quote_id) ??
      recent.find((r) => r.sponsor_support_status === "approved") ??
      recent[0];

    appId = best.id;
    ok("자동 선택", `${best.receipt_number ?? appId} (E2E_APPLICATION_ID 환경변수로 지정 가능)`);
  } else {
    ok("지정된 신청서", appId);
  }

  // ─── 신청서 상세 조회 ──────────────────────────────────────
  section("3. 신청서 기본정보 확인");

  const { data: app } = await admin
    .from("applications")
    .select(
      "id, receipt_number, group_type, departure_region, application_type, " +
      "quote_status, sponsor_support_status, sponsor_approved_count, sponsor_approved_support_amount, " +
      "target_normal_price, target_member_price, " +
      "final_selected_quote_id, final_selected_quote_source, " +
      "selected_price_type, selected_price_label, selected_price, client_price_selection_kind",
    )
    .eq("id", appId)
    .maybeSingle();

  if (!app) {
    fail("신청서 조회 실패", `id=${appId}`);
    return;
  }

  console.log("\n  신청서 기본정보:");
  console.log(`    receipt_number      : ${app.receipt_number ?? "(없음)"}`);
  console.log(`    group_type          : ${app.group_type ?? "(없음)"}`);
  console.log(`    departure_region    : ${app.departure_region ?? "(없음)"}`);
  console.log(`    quote_status        : ${app.quote_status ?? "(없음)"}`);
  console.log(`    sponsor_support_status: ${app.sponsor_support_status ?? "(없음)"}`);
  console.log(`    target_normal_price : ${fmt(app.target_normal_price)}`);
  console.log(`    target_member_price : ${fmt(app.target_member_price)}`);

  check(
    "단체유형 저장",
    app.group_type != null && app.group_type !== "",
    `"${app.group_type}"`,
  );
  check(
    "출발지역 저장",
    app.departure_region != null && app.departure_region !== "",
    `"${app.departure_region}"`,
  );
  check(
    "목표 일반견적가 저장",
    app.target_normal_price != null && app.target_normal_price > 0,
    fmt(app.target_normal_price),
  );

  // ─── 스폰서 가승인 확인 ──────────────────────────────────
  section("4. 스폰서 가승인(preapproval) 확인");

  const { data: preRows } = await admin
    .from("sponsor_preapprovals")
    .select("id, status, estimated_support_amount, approved_support_amount, sponsor_rule_id, sponsor_company_id")
    .eq("application_id", appId);

  const preapprovals = preRows ?? [];
  const reviewing = preapprovals.filter((r) =>
    ["preapproved", "pending", "reviewing"].includes(r.status ?? ""),
  );
  const approved = preapprovals.filter((r) => r.status === "approved");

  check("지원검토 가승인 생성", reviewing.length > 0 || approved.length > 0,
    `검토:${reviewing.length}건 확정:${approved.length}건`);

  if (approved.length > 0) {
    const ap = approved[0];
    check(
      "지원확정 approved_support_amount",
      (ap.approved_support_amount ?? 0) > 0,
      fmt(ap.approved_support_amount),
    );
    check(
      "신청서 sponsor_support_status = approved",
      app.sponsor_support_status === "approved",
      `현재값: "${app.sponsor_support_status}"`,
    );
  } else {
    warn("지원확정 미완료", "스폰서 대시보드에서 '지원확정' 처리 필요");
  }

  // ─── 스폰서 규칙 지역 설정 확인 ─────────────────────────
  section("5. 스폰서 규칙 지역 설정 확인");

  const ruleId = preapprovals[0]?.sponsor_rule_id;
  if (ruleId) {
    const { data: rule } = await admin
      .from("sponsor_rules")
      .select("id, title, service_regions, target_groups, status")
      .eq("id", ruleId)
      .maybeSingle();

    if (rule) {
      const regions = Array.isArray(rule.service_regions) ? rule.service_regions : [];
      const depRegion = app.departure_region ?? "";
      const regionMatch = regions.length === 0 || regions.includes(depRegion);
      check(
        "출발지역이 지원규칙 service_regions에 포함",
        regionMatch,
        regions.length === 0
          ? "regions 비어 있음 = 전체지역 허용"
          : `규칙regions=[${regions.join(",")}] 출발지=${depRegion}`,
      );
      console.log(`  규칙명: ${rule.title ?? "(없음)"}`);
      console.log(`  지원지역: ${regions.length > 0 ? regions.join(", ") : "전체"}`);
    }
  } else {
    warn("sponsor_rule_id 없음", "규칙 없는 직접 가승인이거나 rule 연결 미완료");
  }

  // ─── 파트너 견적 확인 ─────────────────────────────────────
  section("6. 파트너 견적(driver_quotes) 확인");

  const selectCols = [
    "id", "price", "support_breakdown",
    "sponsor_support_status", "extension_support_amount",
  ].join(", ");

  let { data: quotes, error: qErr } = await admin
    .from("driver_quotes")
    .select(selectCols)
    .eq("application_id", appId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (qErr && /does not exist|42703/i.test(qErr.message ?? "")) {
    const fallback = await admin
      .from("driver_quotes")
      .select("id, price, support_breakdown")
      .eq("application_id", appId)
      .order("created_at", { ascending: false })
      .limit(3);
    quotes = fallback.data;
  }

  const quoteList = quotes ?? [];
  check(
    "파트너 견적 제출 여부",
    quoteList.length > 0,
    `${quoteList.length}건 제출됨`,
    true,
  );

  if (quoteList.length > 0) {
    const q = quoteList[0];
    const bd = extractBreakdown(q.support_breakdown);

    console.log("\n  최신 견적 내용:");
    console.log(`    price                : ${fmt(q.price)}`);
    console.log(`    extension_support_amount: ${fmt(q.extension_support_amount)}`);
    console.log(`    sponsor_support_status  : ${q.sponsor_support_status ?? "(없음)"}`);

    if (bd) {
      console.log("\n  support_breakdown 주요 필드:");
      console.log(`    capture_phase        : ${bd.capture_phase}`);
      console.log(`    support_stage        : ${bd.support_stage}`);
      console.log(`    normal_price         : ${fmt(bd.normal_price)}`);
      console.log(`    planned_total_support: ${fmt(bd.planned_total_support)}`);
      console.log(`    planned_discount_price: ${fmt(bd.planned_discount_price)}`);
      console.log(`    confirmed_total_support: ${fmt(bd.confirmed_total_support)}`);
      console.log(`    confirmed_discount_price: ${fmt(bd.confirmed_discount_price)}`);
      console.log(`    final_discount_price : ${fmt(bd.final_discount_price)}`);
      console.log(`    extension_support    : ${fmt(bd.extension_support)}`);

      check("support_breakdown 존재", true, `capture_phase=${bd.capture_phase}`);
      check(
        "confirmed_total_support 존재 (지원확정 시)",
        approved.length === 0 || (bd.confirmed_total_support ?? 0) > 0,
        fmt(bd.confirmed_total_support),
      );

      // 연장 지원금 계산 정합성 확인
      if ((bd.confirmed_total_support ?? 0) > 0 && bd.confirmed_customer_support != null) {
        const driverBase = (bd.confirmed_total_support ?? 0) - (bd.confirmed_customer_support ?? 0);
        const extAmt = bd.extension_support ?? 0;
        const expectDiscount =
          (bd.normal_price ?? q.price ?? 0) -
          (bd.confirmed_customer_support ?? 0) -
          extAmt;

        check(
          "지원금 할인 적용가 계산 정합 (final_discount_price)",
          Math.abs((bd.final_discount_price ?? bd.confirmed_discount_price ?? 0) - expectDiscount) <= 1,
          `기대=${fmt(expectDiscount)} 실제=${fmt(bd.final_discount_price ?? bd.confirmed_discount_price)}`,
        );
        check(
          "기사 확정 지원금 = 총확정 - 고객확정",
          Math.abs((bd.confirmed_driver_support ?? driverBase) - (driverBase - extAmt)) <= 1,
          `기대=${fmt(driverBase - extAmt)} 실제=${fmt(bd.confirmed_driver_support)}`,
        );
      }
    } else {
      warn("support_breakdown 없음", "견적 재제출 또는 DB 마이그레이션 필요");
    }
  }

  // ─── 매칭완료 확인 ────────────────────────────────────────
  section("7. 클라이언트 매칭완료 확인");

  const isMatched = Boolean(app.final_selected_quote_id);
  check("매칭완료 여부", isMatched, isMatched ? "매칭됨" : "아직 미매칭 — 클라이언트 매칭완료 필요", true);

  if (isMatched) {
    const validTypes = ["normal", "support_planned", "support_confirmed"];
    check(
      "selected_price_type 저장",
      validTypes.includes(app.selected_price_type ?? ""),
      `"${app.selected_price_type}"`,
    );
    check(
      "selected_price_label 저장",
      Boolean(app.selected_price_label?.trim()),
      `"${app.selected_price_label}"`,
    );
    check(
      "selected_price 저장",
      app.selected_price != null && app.selected_price >= 0,
      fmt(app.selected_price),
    );

    // 지원확정 상태에서 support_planned 라벨이면 화면 override 필요 안내
    if (app.sponsor_support_status === "approved" && app.selected_price_type === "support_planned") {
      warn(
        "지원검토 시 매칭 후 확정됨",
        "ClientMatchedPricePanel이 '지원금 할인 적용가'로 override 해야 함 — 배포 반영 확인",
      );
    }

    const matchedQuote = quoteList.find((q) => q.id === app.final_selected_quote_id);
    if (matchedQuote) {
      const bd = extractBreakdown(matchedQuote.support_breakdown);
      if (bd && app.sponsor_support_status === "approved") {
        const confirmedPrice = bd.final_discount_price ?? bd.confirmed_discount_price;
        check(
          "매칭 견적 확정 할인 적용가",
          confirmedPrice != null && confirmedPrice > 0,
          fmt(confirmedPrice),
        );
      }
    }
  }

  // ─── 어드민 상태 컬럼 확인 ────────────────────────────────
  section("8. 어드민 상태 컬럼 기준값 확인");

  const qs = app.quote_status ?? "";
  const fqId = app.final_selected_quote_id ?? "";

  let expectedAdminStatus;
  if (fqId) {
    expectedAdminStatus = "매칭완료";
  } else if (["auto_selected", "closed_by_time", "closed_by_quote_count", "closed_by_price", "manually_closed"].includes(qs)) {
    expectedAdminStatus = "자동마감";
  } else {
    expectedAdminStatus = "견적요청중";
  }

  console.log(`\n  quote_status: "${qs}" | final_selected_quote_id: ${fqId ? "있음" : "없음"}`);
  ok("어드민 상태 컬럼 기대값", expectedAdminStatus);

  // ─── 최종 요약 ────────────────────────────────────────────
  section("검증 결과 요약");

  console.log(`\n  대상 신청서: ${app.receipt_number ?? appId}`);
  console.log(`  검증 통과  : ${passCount}건`);
  console.log(`  경고       : ${warnCount}건`);
  console.log(`  실패       : ${failCount}건`);

  if (failCount > 0) {
    console.error(`\n  [결과] FAIL — docs/e2e-test-checklist.md의 "실패 시 확인" 섹션 참고`);
    process.exitCode = 1;
  } else if (warnCount > 0) {
    console.warn(`\n  [결과] PASS (경고 ${warnCount}건) — 수동 확인 권장`);
  } else {
    console.log(`\n  [결과] PASS`);
  }
}

main().catch((e) => {
  console.error("[FATAL]", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
