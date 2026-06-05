import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripMemberQuoteForClient,
  buildGuestQuoteCard,
  pickPrimarySponsor,
  buildMatchedDriver,
  isApplicationMatchCompleted,
  emptyAdminQuoteSummary,
  type AdminMemberQuoteCard,
  type AdminSponsorDetail,
} from "./admin-application-detail-build";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMemberCard(overrides: Partial<AdminMemberQuoteCard> = {}): AdminMemberQuoteCard {
  return {
    id: "quote-1",
    partner_driver_id: "driver-1",
    company_name: "테스트버스",
    driver_name: "홍길동",
    phone: "010-1234-5678",
    price: 1200000,
    support_settlement_type: "client_priority",
    support_settlement_label: "고객우선",
    support_rows: [],
    sponsor_stage_badge: "지원검토",
    created_at: "2024-01-01T00:00:00Z",
    message: "안녕하세요",
    status: "submitted",
    vehicle_type: "45인승",
    available_time: "09:00",
    is_matched: false,
    sponsor_quote_enabled: false,
    support_breakdown: null,
    support_debug: null,
    ...overrides,
  };
}

function makeGuestRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "guest-1",
    guest_company_name: "일반버스",
    guest_driver_name: "김철수",
    guest_phone: "010-9999-0000",
    price: 1100000,
    created_at: "2024-01-01T00:00:00Z",
    message: "비회원 견적",
    status: "submitted",
    vehicle_type: "28인승",
    available_time: "10:00",
    match_result: "pending",
    ...overrides,
  };
}

function makePreapproval(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pre-1",
    sponsor_company_name: "테스트후원",
    status: "preapproved",
    support_kind: "할인지원",
    support_condition_label: "단체",
    support_type: "discount",
    estimated_support_amount: 200000,
    approved_support_amount: null,
    approved_at: null,
    assigned_staff_name: "이담당",
    assigned_staff_phone: "010-1111-2222",
    ...overrides,
  };
}

// ─── isApplicationMatchCompleted ────────────────────────────────────────────

describe("isApplicationMatchCompleted", () => {
  it("final_selected_quote_id가 있으면 true를 반환한다", () => {
    assert.equal(isApplicationMatchCompleted({ final_selected_quote_id: "quote-abc" }), true);
  });

  it("final_selected_quote_id가 빈 문자열이면 false를 반환한다", () => {
    assert.equal(isApplicationMatchCompleted({ final_selected_quote_id: "" }), false);
  });

  it("final_selected_quote_id가 없으면 false를 반환한다", () => {
    assert.equal(isApplicationMatchCompleted({}), false);
  });

  it("lifecycle이 null이면 false를 반환한다", () => {
    assert.equal(isApplicationMatchCompleted(null), false);
  });

  it("final_selected_quote_id가 null이면 false를 반환한다", () => {
    assert.equal(isApplicationMatchCompleted({ final_selected_quote_id: null }), false);
  });
});

// ─── emptyAdminQuoteSummary ──────────────────────────────────────────────────

describe("emptyAdminQuoteSummary", () => {
  it("기본 빈 요약 객체를 반환한다", () => {
    const result = emptyAdminQuoteSummary();
    assert.equal(result.member_quote_count, 0);
    assert.equal(result.guest_quote_count, 0);
    assert.equal(result.avg_normal_price, null);
    assert.equal(result.avg_estimated_support, null);
    assert.equal(result.avg_approved_support, null);
    assert.equal(result.extension_round, 0);
  });

  it("application의 extension_round를 반영한다", () => {
    const result = emptyAdminQuoteSummary({ extension_round: 2 });
    assert.equal(result.extension_round, 2);
  });

  it("extension_round가 소수이면 trunc한다", () => {
    const result = emptyAdminQuoteSummary({ extension_round: 3.9 });
    assert.equal(result.extension_round, 3);
  });

  it("extension_round가 없으면 0을 반환한다", () => {
    const result = emptyAdminQuoteSummary({});
    assert.equal(result.extension_round, 0);
  });
});

// ─── stripMemberQuoteForClient ───────────────────────────────────────────────

describe("stripMemberQuoteForClient", () => {
  it("includeDebug=false이면 support_breakdown과 support_debug를 null로 만든다", () => {
    const card = makeMemberCard({
      support_breakdown: { planned_discount_price: 300000 } as never,
      support_debug: { fallbacks_used: [] } as never,
    });
    const result = stripMemberQuoteForClient(card, false);
    assert.equal(result.support_breakdown, null);
    assert.equal(result.support_debug, null);
  });

  it("includeDebug=true이면 원본 데이터를 그대로 반환한다", () => {
    const breakdown = { planned_discount_price: 300000 } as never;
    const debug = { fallbacks_used: [] } as never;
    const card = makeMemberCard({ support_breakdown: breakdown, support_debug: debug });
    const result = stripMemberQuoteForClient(card, true);
    assert.deepEqual(result.support_breakdown, breakdown);
    assert.deepEqual(result.support_debug, debug);
  });

  it("나머지 필드는 변경되지 않는다", () => {
    const card = makeMemberCard({ price: 1500000, company_name: "테스트버스" });
    const result = stripMemberQuoteForClient(card, false);
    assert.equal(result.price, 1500000);
    assert.equal(result.company_name, "테스트버스");
  });
});

// ─── buildGuestQuoteCard ─────────────────────────────────────────────────────

describe("buildGuestQuoteCard", () => {
  it("기본 필드를 올바르게 매핑한다", () => {
    const row = makeGuestRow();
    const result = buildGuestQuoteCard(row, "", "member");
    assert.equal(result.id, "guest-1");
    assert.equal(result.company_name, "일반버스");
    assert.equal(result.driver_name, "김철수");
    assert.equal(result.phone, "010-9999-0000");
    assert.equal(result.price, 1100000);
    assert.equal(result.status, "submitted");
    assert.equal(result.match_result, "pending");
  });

  it("finalSource가 guest이고 id가 일치하면 is_matched=true", () => {
    const row = makeGuestRow({ id: "guest-abc" });
    const result = buildGuestQuoteCard(row, "guest-abc", "guest");
    assert.equal(result.is_matched, true);
  });

  it("finalSource가 member이면 is_matched=false", () => {
    const row = makeGuestRow({ id: "guest-abc" });
    const result = buildGuestQuoteCard(row, "guest-abc", "member");
    assert.equal(result.is_matched, false);
  });

  it("finalSource가 guest이지만 id가 다르면 is_matched=false", () => {
    const row = makeGuestRow({ id: "guest-abc" });
    const result = buildGuestQuoteCard(row, "guest-xyz", "guest");
    assert.equal(result.is_matched, false);
  });

  it("빈 필드는 '—'로 대체된다", () => {
    const row = makeGuestRow({
      guest_company_name: "",
      guest_driver_name: null,
      guest_phone: undefined,
    });
    const result = buildGuestQuoteCard(row, "", "member");
    assert.equal(result.company_name, "—");
    assert.equal(result.driver_name, "—");
    assert.equal(result.phone, "—");
  });

  it("match_result가 없으면 pending을 기본값으로 사용한다", () => {
    const row = makeGuestRow({ match_result: null });
    const result = buildGuestQuoteCard(row, "", "member");
    assert.equal(result.match_result, "pending");
  });
});

// ─── pickPrimarySponsor ──────────────────────────────────────────────────────

describe("pickPrimarySponsor", () => {
  it("빈 배열이면 null을 반환한다", () => {
    assert.equal(pickPrimarySponsor([]), null);
  });

  it("approved 상태를 최우선으로 선택한다", () => {
    const rows = [
      makePreapproval({ id: "pre-1", status: "preapproved" }),
      makePreapproval({ id: "pre-2", status: "approved" }),
      makePreapproval({ id: "pre-3", status: "pending" }),
    ];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.preapproval_id, "pre-2");
  });

  it("approved가 없으면 preapproved를 선택한다", () => {
    const rows = [
      makePreapproval({ id: "pre-1", status: "pending" }),
      makePreapproval({ id: "pre-2", status: "preapproved" }),
    ];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.preapproval_id, "pre-2");
  });

  it("approved/preapproved 모두 없으면 첫 번째를 선택한다", () => {
    const rows = [
      makePreapproval({ id: "pre-1", status: "pending" }),
      makePreapproval({ id: "pre-2", status: "rejected" }),
    ];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.preapproval_id, "pre-1");
  });

  it("approved 상태이면 sponsor_confirmed=true를 반환한다", () => {
    const rows = [makePreapproval({ status: "approved" })];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.sponsor_confirmed, true);
  });

  it("preapproved 상태이면 sponsor_confirmed=false를 반환한다", () => {
    const rows = [makePreapproval({ status: "preapproved" })];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.sponsor_confirmed, false);
  });

  it("estimated_support_amount를 정수로 파싱한다", () => {
    const rows = [makePreapproval({ estimated_support_amount: 200000.9 })];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.estimated_support_amount, 200000);
  });

  it("빈 company_name은 '—'로 대체된다", () => {
    const rows = [makePreapproval({ sponsor_company_name: "" })];
    const result = pickPrimarySponsor(rows);
    assert.equal(result?.sponsor_company_name, "—");
  });
});

// ─── buildMatchedDriver ──────────────────────────────────────────────────────

describe("buildMatchedDriver", () => {
  it("finalQuoteId가 빈 문자열이면 null을 반환한다", () => {
    const result = buildMatchedDriver("", "member", [], [], {});
    assert.equal(result, null);
  });

  it("finalSource가 guest이고 guestQuotes에서 찾으면 guest 드라이버를 반환한다", () => {
    const guestCard = {
      id: "guest-1",
      company_name: "일반버스",
      driver_name: "김철수",
      phone: "010-9999-0000",
      price: 1100000,
      created_at: "",
      message: "",
      status: "submitted",
      vehicle_type: "",
      available_time: "",
      is_matched: true,
      match_result: "pending",
    };
    const result = buildMatchedDriver("guest-1", "guest", [], [guestCard], {
      selected_price: 1100000,
      selected_price_label: "일반견적가",
    });
    assert.ok(result !== null);
    assert.equal(result!.source, "guest");
    assert.equal(result!.company_name, "일반버스");
    assert.equal(result!.driver_name, "김철수");
    assert.equal(result!.badge, "일반기사");
  });

  it("finalSource가 guest이지만 guestQuotes에 없으면 null을 반환한다", () => {
    const result = buildMatchedDriver("guest-999", "guest", [], [], {});
    assert.equal(result, null);
  });

  it("finalSource가 member이고 memberQuotes에서 찾으면 member 드라이버를 반환한다", () => {
    const memberCard = makeMemberCard({ id: "quote-1", is_matched: true });
    const result = buildMatchedDriver("quote-1", "member", [memberCard], [], {
      selected_price: 1200000,
      selected_price_label: "지원할인가",
    });
    assert.ok(result !== null);
    assert.equal(result!.source, "member");
    assert.equal(result!.company_name, "테스트버스");
    assert.equal(result!.badge, "제휴기사");
  });

  it("finalSource가 member이지만 memberQuotes에 없으면 null을 반환한다", () => {
    const result = buildMatchedDriver("quote-999", "member", [], [], {});
    assert.equal(result, null);
  });
});
