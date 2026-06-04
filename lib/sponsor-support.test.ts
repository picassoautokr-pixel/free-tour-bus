import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  supportLimitForQuote,
  supportPlannedLimitForQuote,
  getApprovedSponsorSupport,
  type ApplicationSponsorSupportSummary,
} from "./sponsor-support";

// ---------------------------------------------------------------------------
// supportLimitForQuote
// ---------------------------------------------------------------------------

describe("supportLimitForQuote", () => {
  it("approved 금액이 있으면 approved 금액을 반환한다", () => {
    const result = supportLimitForQuote({
      approvedSupportAmountTotal: 300_000,
      preapprovedSupportAmountTotal: 200_000,
      estimatedSupportAmount: 100_000,
    });
    assert.equal(result, 300_000);
  });

  it("approved가 0이면 preapproved 금액을 반환한다", () => {
    const result = supportLimitForQuote({
      approvedSupportAmountTotal: 0,
      preapprovedSupportAmountTotal: 200_000,
      estimatedSupportAmount: 100_000,
    });
    assert.equal(result, 200_000);
  });

  it("approved와 preapproved가 모두 0이면 estimated 금액을 반환한다", () => {
    const result = supportLimitForQuote({
      approvedSupportAmountTotal: 0,
      preapprovedSupportAmountTotal: 0,
      estimatedSupportAmount: 100_000,
    });
    assert.equal(result, 100_000);
  });

  it("모든 값이 null/undefined이면 0을 반환한다", () => {
    const result = supportLimitForQuote({});
    assert.equal(result, 0);
  });

  it("음수 estimated는 0으로 처리한다", () => {
    const result = supportLimitForQuote({
      estimatedSupportAmount: -100_000,
    });
    assert.equal(result, 0);
  });

  it("approved가 null이면 preapproved를 사용한다", () => {
    const result = supportLimitForQuote({
      approvedSupportAmountTotal: null,
      preapprovedSupportAmountTotal: 150_000,
    });
    assert.equal(result, 150_000);
  });
});

// ---------------------------------------------------------------------------
// supportPlannedLimitForQuote
// ---------------------------------------------------------------------------

describe("supportPlannedLimitForQuote", () => {
  it("preapproved 금액이 있으면 preapproved 금액을 반환한다", () => {
    const result = supportPlannedLimitForQuote({
      preapprovedSupportAmountTotal: 200_000,
      estimatedSupportAmount: 100_000,
    });
    assert.equal(result, 200_000);
  });

  it("preapproved가 0이면 estimated 금액을 반환한다", () => {
    const result = supportPlannedLimitForQuote({
      preapprovedSupportAmountTotal: 0,
      estimatedSupportAmount: 100_000,
    });
    assert.equal(result, 100_000);
  });

  it("preapproved가 null이면 estimated 금액을 반환한다", () => {
    const result = supportPlannedLimitForQuote({
      preapprovedSupportAmountTotal: null,
      estimatedSupportAmount: 150_000,
    });
    assert.equal(result, 150_000);
  });

  it("모든 값이 없으면 0을 반환한다", () => {
    const result = supportPlannedLimitForQuote({});
    assert.equal(result, 0);
  });

  it("approved 금액은 무시한다 (planned 한도에는 포함되지 않음)", () => {
    // supportPlannedLimitForQuote는 approved를 받지 않음
    const result = supportPlannedLimitForQuote({
      preapprovedSupportAmountTotal: 0,
      estimatedSupportAmount: 200_000,
    });
    assert.equal(result, 200_000);
  });

  it("음수 estimated는 0으로 처리한다", () => {
    const result = supportPlannedLimitForQuote({
      estimatedSupportAmount: -50_000,
    });
    assert.equal(result, 0);
  });
});

// ---------------------------------------------------------------------------
// supportLimitForQuote vs supportPlannedLimitForQuote 비교
// ---------------------------------------------------------------------------

describe("supportLimitForQuote vs supportPlannedLimitForQuote 차이", () => {
  it("supportLimitForQuote는 approved를 우선 사용하지만 supportPlannedLimitForQuote는 preapproved를 사용한다", () => {
    const params = {
      approvedSupportAmountTotal: 300_000,
      preapprovedSupportAmountTotal: 200_000,
      estimatedSupportAmount: 100_000,
    };
    const limit = supportLimitForQuote(params);
    const plannedLimit = supportPlannedLimitForQuote(params);

    assert.equal(limit, 300_000);      // approved 우선
    assert.equal(plannedLimit, 200_000); // preapproved 우선 (approved 무시)
  });
});

// ---------------------------------------------------------------------------
// getApprovedSponsorSupport — Mock DB 기반 테스트
// ---------------------------------------------------------------------------

type MockRow = {
  status: string;
  approved_support_amount?: number | null;
  estimated_support_amount?: number | null;
};

function makeMockAdmin(rows: MockRow[]) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) =>
          Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

describe("getApprovedSponsorSupport", () => {
  it("데이터가 없으면 모든 값이 0이고 status는 none이다", async () => {
    const admin = makeMockAdmin([]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    const expected: ApplicationSponsorSupportSummary = {
      approved_support_amount_total: 0,
      preapproved_support_amount_total: 0,
      approved_count: 0,
      pending_count: 0,
      rejected_count: 0,
      status: "none",
    };
    assert.deepEqual(result, expected);
  });

  it("approved 행이 있으면 approved_support_amount_total에 합산된다", async () => {
    const admin = makeMockAdmin([
      { status: "approved", approved_support_amount: 200_000 },
      { status: "approved", approved_support_amount: 100_000 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.approved_support_amount_total, 300_000);
    assert.equal(result.approved_count, 2);
    assert.equal(result.status, "approved");
  });

  it("preapproved 행이 있으면 preapproved_support_amount_total에 합산된다", async () => {
    const admin = makeMockAdmin([
      { status: "preapproved", estimated_support_amount: 150_000 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.preapproved_support_amount_total, 150_000);
    assert.equal(result.pending_count, 1);
    assert.equal(result.status, "preapproved");
  });

  it("pending 행은 preapproved와 동일하게 처리된다", async () => {
    const admin = makeMockAdmin([
      { status: "pending", estimated_support_amount: 100_000 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.preapproved_support_amount_total, 100_000);
    assert.equal(result.pending_count, 1);
    assert.equal(result.status, "preapproved");
  });

  it("rejected 행은 rejected_count에 집계되고 status는 rejected이다", async () => {
    const admin = makeMockAdmin([
      { status: "rejected" },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.rejected_count, 1);
    assert.equal(result.status, "rejected");
  });

  it("cancelled와 expired도 rejected_count에 집계된다", async () => {
    const admin = makeMockAdmin([
      { status: "cancelled" },
      { status: "expired" },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.rejected_count, 2);
  });

  it("approved와 preapproved가 혼재하면 status는 mixed이다", async () => {
    const admin = makeMockAdmin([
      { status: "approved", approved_support_amount: 200_000 },
      { status: "preapproved", estimated_support_amount: 100_000 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.status, "mixed");
  });

  it("approved 행의 approved_support_amount가 없으면 estimated_support_amount를 fallback으로 사용한다", async () => {
    const admin = makeMockAdmin([
      { status: "approved", approved_support_amount: null, estimated_support_amount: 180_000 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    assert.equal(result.approved_support_amount_total, 180_000);
  });

  it("금액이 0이거나 음수인 행은 합산에서 제외된다", async () => {
    const admin = makeMockAdmin([
      { status: "approved", approved_support_amount: 0 },
      { status: "approved", approved_support_amount: -100 },
    ]);
    const result = await getApprovedSponsorSupport(
      admin as unknown as Parameters<typeof getApprovedSponsorSupport>[0],
      "app-1",
    );
    // 금액이 0 이하이면 합산 제외, 하지만 count는 올라감
    assert.equal(result.approved_support_amount_total, 0);
    assert.equal(result.approved_count, 2);
  });
});
