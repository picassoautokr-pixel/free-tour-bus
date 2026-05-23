import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminSponsorConfirmed } from "@/lib/admin-sponsor-confirmed";

test("sponsor confirmed from application.sponsor_support_status approved", () => {
  const r = resolveAdminSponsorConfirmed({
    application: { sponsor_support_status: "approved" },
    sponsor: null,
  });
  assert.equal(r.confirmed, true);
  assert.equal(r.badge, "지원확정");
});

test("sponsor confirmed from preapproval status confirmed", () => {
  const r = resolveAdminSponsorConfirmed({
    application: { sponsor_support_status: "preapproved" },
    sponsor: null,
    preapprovalRows: [{ status: "confirmed" }],
  });
  assert.equal(r.confirmed, true);
});
