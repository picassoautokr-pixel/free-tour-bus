import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEmptyDebugContactLookup } from "./sponsor-matched-contact";

/** API call 객체에 debug_contact_lookup이 항상 포함되는지 형태 검증 */
describe("sponsor dashboard call API shape", () => {
  it("debug_contact_lookup is always a non-null object on matched calls", () => {
    const lookup = buildEmptyDebugContactLookup({
      applicationId: "7f465000-0000-4000-8000-000000000001",
      sponsorPreapprovalId: "1ca80000-0000-4000-8000-000000000001",
      finalQuoteId: "1aaeacce-d533-4a2b-add1-2c3b38a0f853",
      mapKey: "7f465000-0000-4000-8000-000000000001",
      reason: "test",
    });

    const callRow = {
      id: lookup.sponsor_preapproval_id,
      application_id: lookup.application_id,
      final_selected_quote_id: lookup.final_selected_quote_id,
      quote: lookup.fetched_driver_quote,
      matched_driver: lookup.fetched_partner_driver,
      debug_contact_lookup: lookup,
      popup_customer_phone: lookup.popup_customer_phone,
      popup_driver_phone: lookup.popup_driver_phone,
    };

    assert.ok(callRow.debug_contact_lookup);
    assert.equal(typeof callRow.debug_contact_lookup.tried_driver_quotes_by_id, "boolean");
    assert.ok(Array.isArray(callRow.debug_contact_lookup.tried_application_id_values));
    assert.equal(callRow.debug_contact_lookup.final_selected_quote_id, callRow.final_selected_quote_id);
  });
});
