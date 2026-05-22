import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveSponsorCustomerInfoPopup,
} from "./sponsor-matched-contact";

describe("resolveSponsorCustomerInfoPopup", () => {
  it("resolves member quote from partner_drivers", () => {
    const popup = resolveSponsorCustomerInfoPopup({
      application: {
        applicant_name: "홍길동",
        phone: "010-1111-2222",
        final_selected_quote_source: "member",
      },
      driverQuote: { id: "q1", partner_driver_id: "pd1", price: 500000 },
      guestQuote: null,
      matchedDriver: {
        company_name: "테스트운수",
        manager_name: "김기사",
        phone: "010-3333-4444",
      },
      profile: null,
      isGuestQuote: false,
    });
    assert.equal(popup.customer_name, "홍길동");
    assert.equal(popup.customer_phone, "010-1111-2222");
    assert.equal(popup.driver_company, "테스트운수");
    assert.equal(popup.driver_name, "김기사");
    assert.equal(popup.driver_phone, "010-3333-4444");
    assert.equal(popup.data_source, "partner_drivers");
  });

  it("resolves guest quote", () => {
    const popup = resolveSponsorCustomerInfoPopup({
      application: {
        applicant_name: "단체담당",
        phone: "010-9999-8888",
        final_selected_quote_source: "guest",
      },
      driverQuote: null,
      guestQuote: {
        guest_driver_name: "이기사",
        guest_phone: "010-7777-6666",
        guest_company_name: "개인기사",
      },
      matchedDriver: null,
      profile: null,
      isGuestQuote: true,
    });
    assert.equal(popup.driver_name, "이기사");
    assert.equal(popup.driver_phone, "010-7777-6666");
    assert.equal(popup.data_source, "guest_driver_quotes");
  });

  it("falls back customer phone from application.phone", () => {
    const popup = resolveSponsorCustomerInfoPopup({
      application: {
        customer_name: "안현정",
        customer_phone: "",
        phone: "010-1234-5678",
      },
      driverQuote: null,
      guestQuote: null,
      matchedDriver: null,
      profile: null,
      isGuestQuote: false,
    });
    assert.equal(popup.customer_name, "안현정");
    assert.equal(popup.customer_phone, "010-1234-5678");
  });

  it("prefers applications.phone over customer_phone", () => {
    const popup = resolveSponsorCustomerInfoPopup({
      application: {
        customer_phone: "010-0000-0000",
        phone: "010-9999-1111",
      },
      driverQuote: null,
      guestQuote: null,
      matchedDriver: null,
      profile: null,
      isGuestQuote: false,
    });
    assert.equal(popup.customer_phone, "010-9999-1111");
  });
});
