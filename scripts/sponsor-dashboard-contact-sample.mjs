/**
 * 스폰서 대시보드 연락처 lookup 샘플 (서비스 롤)
 *
 *   set NEXT_PUBLIC_SUPABASE_URL=...
 *   set SUPABASE_SERVICE_ROLE_KEY=...
 *   set SPONSOR_VERIFY_QUOTE_ID=1aaeacce-d533-4a2b-add1-2c3b38a0f853
 *   node scripts/sponsor-dashboard-contact-sample.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const quoteId =
  process.env.SPONSOR_VERIFY_QUOTE_ID?.trim() ||
  "1aaeacce-d533-4a2b-add1-2c3b38a0f853";

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DRIVER_SELECT =
  "id, application_id, partner_driver_id, auth_user_id, price, status";

async function main() {
  const byId = await admin.from("driver_quotes").select(DRIVER_SELECT).eq("id", quoteId).maybeSingle();

  const sample = {
    quote_id: quoteId,
    driver_quotes_by_id: {
      data: byId.data,
      error: byId.error
        ? { message: byId.error.message, code: byId.error.code, details: byId.error.details }
        : null,
    },
    quote_is_null: byId.data == null,
    has_debug_contact_lookup: false,
    note: "Run GET /api/sponsor/dashboard after deploy; each call must include debug_contact_lookup object.",
  };

  if (byId.data?.application_id) {
    const appId = String(byId.data.application_id);
    const byApp = await admin
      .from("driver_quotes")
      .select(DRIVER_SELECT)
      .eq("application_id", appId)
      .order("created_at", { ascending: false })
      .limit(1);
    sample.driver_quotes_by_application_id = {
      application_id: appId,
      data: byApp.data?.[0] ?? null,
      error: byApp.error
        ? { message: byApp.error.message, code: byApp.error.code }
        : null,
    };

    const app = await admin
      .from("applications")
      .select("id, applicant_name, name, organization_name, phone, customer_phone")
      .eq("id", appId)
      .maybeSingle();
    sample.applications_contact = {
      data: app.data,
      error: app.error ? { message: app.error.message, code: app.error.code } : null,
    };
  }

  console.log(JSON.stringify(sample, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
