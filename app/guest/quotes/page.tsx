import { GuestQuotesClient } from "@/components/guest/GuestQuotesClient";
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
    departure_date: string;
    departure_time: string;
    passenger_count: number | null;
    trip_type: string;
    bus_grade: string;
    request_message: string;
  }> = [];

  if (admin) {
    const { data } = await admin
      .from("applications")
      .select(
        "id, departure_region, departure, destination, departure_date, departure_time, passenger_count, trip_type, bus_grade, request_message",
      )
      .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
      .order("created_at", { ascending: false })
      .limit(80);
    initialQuotes = (Array.isArray(data) ? data : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: safeText(row.id),
        departure_region: safeText(row.departure_region),
        departure: safeText(row.departure),
        destination: safeText(row.destination),
        departure_date: safeText(row.departure_date),
        departure_time: safeText(row.departure_time),
        passenger_count: parseInteger(row.passenger_count),
        trip_type: safeText(row.trip_type),
        bus_grade: safeText(row.bus_grade),
        request_message: clip(row.request_message),
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
