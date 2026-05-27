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

test("sponsor confirmed when status is mixed but sponsor_approved_count > 0", () => {
  const r = resolveAdminSponsorConfirmed({
    application: { sponsor_support_status: "mixed", sponsor_approved_count: 1 },
    sponsor: null,
  });
  assert.equal(r.confirmed, true);
  assert.equal(r.badge, "지원확정");
  assert.match(r.source, /sponsor_approved_count/);
});

test("not confirmed when status is mixed but sponsor_approved_count is 0", () => {
  const r = resolveAdminSponsorConfirmed({
    application: { sponsor_support_status: "mixed", sponsor_approved_count: 0 },
    sponsor: null,
  });
  assert.equal(r.confirmed, false);
});

test("sponsor confirmed from sponsor_approved_count even without sponsor object", () => {
  const r = resolveAdminSponsorConfirmed({
    application: { sponsor_support_status: "none", sponsor_approved_count: 2 },
    sponsor: null,
  });
  assert.equal(r.confirmed, true);
  assert.equal(r.badge, "지원확정");
});
