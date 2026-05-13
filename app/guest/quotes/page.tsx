import { GuestQuotesClient } from "@/components/guest/GuestQuotesClient";
import { parseStopovers } from "@/lib/stopovers";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function clip(value: unknown): string {
  const text = safeText(value);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

export default async function GuestQuotesPage() {
  const admin = createServiceRoleSupabase();
  let initialQuotes: Array<{
    id: string;
    departure_region: string;
    departure: string;
    destination: string;
    stopovers?: string[];
    departure_date: string;
    departure_time: string;
    passenger_count: number | null;
    trip_type: string;
    bus_grade: string;
    request_message: string;
    quote_status?: string;
    quote_deadline_at?: string;
    quote_limit_count?: number | null;
    quote_count?: number;
    target_normal_price?: number | null;
    target_member_price?: number | null;
    quote_closed_at?: string;
    auto_final_confirm_at?: string;
  }> = [];

  if (admin) {
    const { data } = await admin
      .from("applications")
      .select(
        "id, departure_region, departure, destination, stopovers, departure_date, departure_time, passenger_count, trip_type, bus_grade, request_message, quote_status, quote_deadline_at, quote_limit_count, target_normal_price, target_member_price, quote_closed_at, auto_final_confirm_at",
      )
      .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
      .order("created_at", { ascending: false })
      .limit(80);
    const rows = Array.isArray(data) ? data : [];
    const ids = rows.map((raw) => safeText((raw as { id?: unknown }).id)).filter(Boolean);
    const quoteCountByApplication = new Map<string, number>();
    if (ids.length > 0) {
      const [{ data: memberRows }, { data: guestRows }] = await Promise.all([
        admin.from("driver_quotes").select("application_id").in("application_id", ids),
        admin.from("guest_driver_quotes").select("application_id").in("application_id", ids),
      ]);
      for (const raw of Array.isArray(memberRows) ? memberRows : []) {
        const id = safeText((raw as { application_id?: unknown }).application_id);
        quoteCountByApplication.set(id, (quoteCountByApplication.get(id) ?? 0) + 1);
      }
      for (const raw of Array.isArray(guestRows) ? guestRows : []) {
        const id = safeText((raw as { application_id?: unknown }).application_id);
        quoteCountByApplication.set(id, (quoteCountByApplication.get(id) ?? 0) + 1);
      }
    }
    initialQuotes = rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const id = safeText(row.id);
      return {
        id,
        departure_region: safeText(row.departure_region),
        departure: safeText(row.departure),
        destination: safeText(row.destination),
        stopovers: parseStopovers(row.stopovers),
        departure_date: safeText(row.departure_date),
        departure_time: safeText(row.departure_time),
        passenger_count: parseInteger(row.passenger_count),
        trip_type: safeText(row.trip_type),
        bus_grade: safeText(row.bus_grade),
        request_message: clip(row.request_message),
        quote_status: safeText(row.quote_status, "collecting"),
        quote_deadline_at: safeText(row.quote_deadline_at, ""),
        quote_limit_count: parseInteger(row.quote_limit_count),
        quote_count: quoteCountByApplication.get(id) ?? 0,
        target_normal_price: parseInteger(row.target_normal_price),
        target_member_price: parseInteger(row.target_member_price),
        quote_closed_at: safeText(row.quote_closed_at, ""),
        auto_final_confirm_at: safeText(row.auto_final_confirm_at, ""),
      };
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 py-10">
      <section className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
            무료관광버스
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
            전국 견적요청
          </h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            고객 개인정보와 다른 기사 견적은 공개하지 않습니다.
          </p>
        </div>
        <GuestQuotesClient initialQuotes={initialQuotes} />
      </section>
    </main>
  );
}
