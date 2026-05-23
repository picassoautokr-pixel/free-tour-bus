import assert from "node:assert/strict";
import test from "node:test";

import {
  isCustomerStageMatched,
  isSponsorStageConfirmed,
  resolveCustomerStageBadge,
  resolveSponsorStageBadge,
} from "@/lib/admin-progress-stage";

test("resolveCustomerStageBadge", () => {
  assert.equal(
    resolveCustomerStageBadge({ quoteStatus: "collecting", finalSelectedQuoteId: "" }),
    "견적요청",
  );
  assert.equal(
    resolveCustomerStageBadge({ quoteStatus: "auto_selected", finalSelectedQuoteId: "" }),
    "자동마감",
  );
  assert.equal(
    resolveCustomerStageBadge({ quoteStatus: "collecting", finalSelectedQuoteId: "q-1" }),
    "매칭완료",
  );
  assert.equal(isCustomerStageMatched({ quoteStatus: "final_selected" }), true);
});

test("resolveSponsorStageBadge", () => {
  assert.equal(resolveSponsorStageBadge("pending"), "지원검토");
  assert.equal(resolveSponsorStageBadge("preapproved"), "지원검토");
  assert.equal(resolveSponsorStageBadge("approved"), "지원확정");
  assert.equal(isSponsorStageConfirmed("confirmed"), true);
});
