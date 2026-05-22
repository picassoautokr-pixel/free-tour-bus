import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveSponsorCustomerInfoPopup,
  type SponsorMatchedContactDebug,
} from "./sponsor-matched-contact";

describe("resolveSponsorCustomerInfoPopup", () => {
  it("resolves member quote from partner_drivers", () => {
    const debug: SponsorMatchedContactDebug = {
      application: {
        applicant_name: "홍길동",
        phone: "010-1111-2222",
        final_selected_quote_source: "member",
      },
      driver_quote: { id: "q1", partner_driver_id: "pd1", price: 500000 },
      guest_driver_quote: null,
      partner_driver: {
        company_name: "테스트운수",
        manager_name: "김기사",
        phone: "010-3333-4444",
      },
      profile: null,
    };
    const popup = resolveSponsorCustomerInfoPopup(debug);
    assert.equal(popup.customer_name, "홍길동");
    assert.equal(popup.customer_phone, "010-1111-2222");
    assert.equal(popup.driver_company, "테스트운수");
    assert.equal(popup.driver_name, "김기사");
    assert.equal(popup.driver_phone, "010-3333-4444");
    assert.equal(popup.data_source, "partner_drivers");
  });

  it("resolves guest quote", () => {
    const debug: SponsorMatchedContactDebug = {
      application: {
        applicant_name: "단체담당",
        phone: "010-9999-8888",
        final_selected_quote_source: "guest",
      },
      driver_quote: null,
      guest_driver_quote: {
        guest_driver_name: "이기사",
        guest_phone: "010-7777-6666",
        guest_company_name: "개인기사",
      },
      partner_driver: null,
      profile: null,
    };
    const popup = resolveSponsorCustomerInfoPopup(debug);
    assert.equal(popup.driver_name, "이기사");
    assert.equal(popup.driver_phone, "010-7777-6666");
    assert.equal(popup.data_source, "guest_driver_quotes");
  });
});
