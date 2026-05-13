import Link from "next/link";

import { GuestQuoteForm } from "@/components/guest/GuestQuoteForm";
import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

type PageProps = {
  params: Promise<{ token: string }>;
};

type SharedApplication = {
  departure: string;
  destination: string;
  departure_date: string | null;
  departure_time: string;
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  request_message: string;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  quote_count: number;
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  auto_final_confirm_at: string;
};

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function safeText(value: unknown, emptyLabel = "—"): string {
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

function formatDeparture(app: SharedApplication): string {
  const date = safeText(app.departure_date, "미정");
  const time = safeText(app.departure_time, "");
  return [date, time].filter(Boolean).join(" ");
}

function clipRequestMessage(value: string): string {
  const text = value.trim();
  if (text === "" || text === "—") return "—";
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
      <dt className="text-xs font-black text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-black text-slate-900">{value}</dd>
    </div>
  );
}

function MessageCard({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f8fb] px-5 py-12">
      <section className="w-full max-w-md rounded-[2rem] bg-white p-7 text-center shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료관광버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          {title}
        </h1>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          {message}
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
          style={tapStyle}
        >
          메인으로
        </Link>
      </section>
    </main>
  );
}

export default async function SharedQuotePage({ params }: PageProps) {
  const { token } = await params;
  const cleanToken = safeText(token, "");
  if (cleanToken === "") {
    return <MessageCard title="잘못된 링크입니다" message="견적요청 링크를 다시 확인해 주세요." />;
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return (
      <MessageCard
        title="페이지를 불러올 수 없습니다"
        message="서버 설정을 확인한 뒤 다시 시도해 주세요."
      />
    );
  }

  const { data: referral, error } = await admin
    .from("quote_referrals")
    .select(
      "id, token, status, expires_at, applications(id, departure, destination, departure_date, departure_time, passenger_count, trip_type, bus_grade, request_message, quote_status, quote_deadline_at, quote_limit_count, target_normal_price, target_member_price, quote_closed_at, auto_final_confirm_at)",
    )
    .eq("token", cleanToken)
    .maybeSingle();

  if (error) {
    return <MessageCard title="페이지를 불러올 수 없습니다" message={error.message} />;
  }

  const row = referral as
    | {
        expires_at?: unknown;
        id?: unknown;
        applications?: unknown;
      }
    | null
    | undefined;
  const expiresAt = safeText(row?.expires_at, "");
  if (!row || expiresAt === "") {
    return <MessageCard title="잘못된 링크입니다" message="견적요청 링크를 다시 확인해 주세요." />;
  }

  const expiresTime = new Date(expiresAt).getTime();
  const nowTime = new Date().getTime();
  if (!Number.isFinite(expiresTime) || expiresTime < nowTime) {
    return <MessageCard title="만료된 링크입니다" message="이 견적요청 전달 링크는 7일이 지나 만료되었습니다." />;
  }

  const rawApp = Array.isArray(row.applications)
    ? row.applications[0]
    : row.applications;
  const appRow = rawApp as Record<string, unknown> | null | undefined;
  if (!appRow) {
    return <MessageCard title="견적요청을 찾을 수 없습니다" message="삭제되었거나 더 이상 확인할 수 없는 요청입니다." />;
  }

  const applicationId = safeText(appRow.id, "");
  let quoteCount = 0;
  if (applicationId !== "") {
    const [{ data: memberRows }, { data: guestRows }] = await Promise.all([
      admin.from("driver_quotes").select("id").eq("application_id", applicationId),
      admin.from("guest_driver_quotes").select("id").eq("application_id", applicationId),
    ]);
    quoteCount =
      (Array.isArray(memberRows) ? memberRows.length : 0) +
      (Array.isArray(guestRows) ? guestRows.length : 0);
  }

  const app: SharedApplication = {
    departure: safeText(appRow.departure),
    destination: safeText(appRow.destination),
    departure_date:
      appRow.departure_date == null ? null : safeText(appRow.departure_date, ""),
    departure_time: safeText(appRow.departure_time, ""),
    passenger_count: parseInteger(appRow.passenger_count),
    trip_type: safeText(appRow.trip_type),
    bus_grade: safeText(appRow.bus_grade),
    request_message: safeText(appRow.request_message),
    quote_status: safeText(appRow.quote_status, "collecting"),
    quote_deadline_at: safeText(appRow.quote_deadline_at, ""),
    quote_limit_count: parseInteger(appRow.quote_limit_count),
    quote_count: quoteCount,
    target_normal_price: parseInteger(appRow.target_normal_price),
    target_member_price: parseInteger(appRow.target_member_price),
    quote_closed_at: safeText(appRow.quote_closed_at, ""),
    auto_final_confirm_at: safeText(appRow.auto_final_confirm_at, ""),
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-[#f3f8fb] px-5 py-10">
      <section className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] ring-1 ring-slate-100 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">
          무료관광버스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">
          전달받은 견적요청
        </h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          고객 개인정보와 첨부파일은 공개하지 않습니다. 아래 운행 조건을 확인해 주세요.
        </p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoCard label="출발지" value={app.departure} />
          <InfoCard label="도착지" value={app.destination} />
          <InfoCard label="출발일시" value={formatDeparture(app)} />
          <InfoCard label="인원수" value={app.passenger_count ?? "—"} />
          <InfoCard label="왕복/편도" value={app.trip_type} />
          <InfoCard label="일반/프리미엄" value={app.bus_grade} />
        </dl>

        <div className="mt-4">
          <QuoteStatusSummary
            quoteStatus={app.quote_status}
            quoteDeadlineAt={app.quote_deadline_at}
            autoFinalConfirmAt={app.auto_final_confirm_at}
            quoteCount={app.quote_count}
            quoteLimitCount={app.quote_limit_count}
            targetNormalPrice={app.target_normal_price}
            targetMemberPrice={app.target_member_price}
          />
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <p className="text-xs font-black text-slate-400">요청사항 일부</p>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">
            {clipRequestMessage(app.request_message)}
          </p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/partner/register?ref=${encodeURIComponent(cleanToken)}`}
            className="inline-flex min-h-13 items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
            style={tapStyle}
          >
            제휴기사 등록하고 견적 제출
          </Link>
        </div>
        {applicationId !== "" ? (
          <div className="mt-6">
            <GuestQuoteForm
              applicationId={applicationId}
              referralToken={cleanToken}
              passengerCount={app.passenger_count}
              registerHref={`/partner/register?ref=${encodeURIComponent(cleanToken)}`}
              quoteClosed={app.quote_closed_at !== ""}
              compact
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}
