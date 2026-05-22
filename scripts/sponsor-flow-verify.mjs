/**
 * 스폰서·지원금 스냅샷 E2E DB 검증 (서비스 롤 필요)
 *
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   npm run verify:sponsor-flow
 *
 *   SPONSOR_VERIFY_APPLICATION_ID=<uuid>
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function log(section, detail) {
  console.log(`\n=== ${section} ===`);
  if (detail != null) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
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

function pickSnapshotFields(raw) {
  if (!raw || typeof raw !== "object") return null;
  const s = raw;
  return {
    sponsor_rule_id: s.sponsor_rule_id ?? null,
    sponsor_rule_name: s.sponsor_rule_name ?? null,
    per_person_support: s.per_person_support ?? null,
    planned_total_support: s.planned_total_support ?? null,
    planned_discount_price: s.planned_discount_price ?? null,
    confirmed_total_support: s.confirmed_total_support ?? null,
    final_discount_price: s.final_discount_price ?? null,
    capture_phase: s.capture_phase ?? null,
  };
}

async function main() {
  const push = (name, pass, detail) => {
    (pass ? ok : fail)(`${name}${detail ? `: ${detail}` : ""}`);
  };

  log("환경", { url: `${url.slice(0, 40)}…` });

  const hasQuoteBreakdown = await columnExists("driver_quotes", "support_breakdown");
  const hasAppSnapshot = await columnExists("applications", "support_breakdown_snapshot");
  const hasSelectedType = await columnExists("applications", "selected_price_type");
  push("driver_quotes.support_breakdown", hasQuoteBreakdown, hasQuoteBreakdown ? "ok" : "sql/driver_quote_support_breakdown.sql");
  push("applications.support_breakdown_snapshot", hasAppSnapshot, hasAppSnapshot ? "ok" : "sql/application_support_breakdown_snapshot.sql");
  push("applications.selected_price_type", hasSelectedType, hasSelectedType ? "ok" : "sql/application_selected_price.sql");

  let applicationId = process.env.SPONSOR_VERIFY_APPLICATION_ID?.trim();

  if (!applicationId) {
    const { data: recent } = await admin
      .from("applications")
      .select("id, sponsor_support_status, selected_price_type, support_breakdown_snapshot")
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
    }
  }

  if (!applicationId) {
    fail("검증할 application_id 없음");
    return;
  }

  const { data: app } = await admin
    .from("applications")
    .select(
      "id, sponsor_support_status, selected_price_type, selected_price_label, selected_price, support_breakdown_snapshot, final_selected_quote_id",
    )
    .eq("id", applicationId)
    .maybeSingle();

  const { data: preRows } = await admin
    .from("sponsor_preapprovals")
    .select("id, status, estimated_support_amount, sponsor_rule_id")
    .eq("application_id", applicationId);

  const { data: quotes } = await admin
    .from("driver_quotes")
    .select(
      "id, price, support_breakdown, planned_total_support, planned_discount_price, confirmed_total_support, confirmed_discount_price, final_member_price",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(3);

  const reviewCount = (preRows ?? []).filter((r) =>
    ["preapproved", "pending", "reviewing"].includes(String(r.status ?? "")),
  ).length;
  push("지원검토 자동 생성", reviewCount > 0, `${reviewCount}건 preapproved`);

  const appSnap = pickSnapshotFields(app?.support_breakdown_snapshot);
  push(
    "신규 직후 application support_breakdown_snapshot",
    Boolean(appSnap?.planned_total_support),
    appSnap ? JSON.stringify(appSnap) : "없음 — match 후 refresh 필요",
  );

  const quoteWithBreakdown = (quotes ?? []).find((q) => q.support_breakdown);
  if (quoteWithBreakdown) {
    const qSnap = pickSnapshotFields(quoteWithBreakdown.support_breakdown);
    push("견적 support_breakdown 스냅샷", Boolean(qSnap?.per_person_support != null), JSON.stringify(qSnap));

    if (qSnap?.sponsor_rule_id) {
      const { data: liveRule } = await admin
        .from("sponsor_rules")
        .select("support_per_person, title")
        .eq("id", qSnap.sponsor_rule_id)
        .maybeSingle();
      const frozen = qSnap.per_person_support;
      const live = liveRule?.support_per_person ?? null;
      const differs = live != null && frozen != null && live !== frozen;
      push(
        "규칙 변경 후 과거 견적 per_person 유지",
        !differs || frozen !== live,
        differs
          ? `스냅샷=${frozen} 현재규칙=${live} (다르면 스냅샷 고정 정상)`
          : `스냅샷=${frozen} 현재규칙=${live}`,
      );
    }
  } else {
    push("견적 support_breakdown 스냅샷", (quotes ?? []).length === 0, "기사 견적 없음");
  }

  const selectedType = app?.selected_price_type ?? null;
  if (selectedType) {
    push(
      "selected_price_type 저장",
      ["normal", "support_planned", "support_confirmed"].includes(selectedType),
      `${selectedType} label=${app?.selected_price_label ?? ""} price=${app?.selected_price ?? ""}`,
    );
    if (selectedType === "support_planned") {
      push("support_planned 표시 기준", true, "DB type 고정 (금액 비교 미사용)");
    }
    if (selectedType === "support_confirmed") {
      push("support_confirmed 표시 기준", true, "DB type 고정");
    }
  } else if (app?.final_selected_quote_id) {
    push("selected_price_type 저장", false, "매칭됐으나 type 미저장");
  } else {
    push("selected_price_type 저장", true, "미매칭 — type 없음 정상");
  }

  log("실제 DB 값 예시", {
    application_id: applicationId,
    selected_price_type: app?.selected_price_type ?? null,
    selected_price: app?.selected_price ?? null,
    sponsor_support_status: app?.sponsor_support_status ?? null,
    application_snapshot: appSnap,
    quote_example: quoteWithBreakdown
      ? {
          quote_id: quoteWithBreakdown.id,
          price: quoteWithBreakdown.price,
          planned_total_support: quoteWithBreakdown.planned_total_support,
          planned_discount_price: quoteWithBreakdown.planned_discount_price,
          confirmed_total_support: quoteWithBreakdown.confirmed_total_support,
          support_breakdown: pickSnapshotFields(quoteWithBreakdown.support_breakdown),
        }
      : null,
  });
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
