-- 기사 견적 제출 MVP
-- 평문 고객 연락처는 기사 화면에 노출하지 않고, 견적은 서버 API(service role)를 통해 저장/조회합니다.

create table if not exists public.driver_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  application_id uuid references public.applications(id) on delete cascade,
  partner_driver_id uuid references public.partner_drivers(id) on delete cascade,
  auth_user_id uuid,
  price integer,
  vehicle_type text,
  available_time text,
  message text,
  status text default 'submitted'
);

create unique index if not exists driver_quotes_application_driver_unique
  on public.driver_quotes (application_id, partner_driver_id);

create index if not exists driver_quotes_application_id_idx
  on public.driver_quotes (application_id, created_at desc);

create index if not exists driver_quotes_partner_driver_id_idx
  on public.driver_quotes (partner_driver_id, created_at desc);

comment on table public.driver_quotes is '제휴기사의 예약 신청 콜 견적 제출 내역';
comment on column public.driver_quotes.application_id is 'applications.id';
comment on column public.driver_quotes.partner_driver_id is 'partner_drivers.id';
comment on column public.driver_quotes.auth_user_id is '견적 제출 당시 Supabase Auth 사용자 ID';
comment on column public.driver_quotes.price is '견적 금액(원)';
comment on column public.driver_quotes.vehicle_type is '제출 차량 유형';
comment on column public.driver_quotes.available_time is '가능 출발시간';
comment on column public.driver_quotes.message is '기사 메모';
comment on column public.driver_quotes.status is '견적 상태(submitted 등)';
