-- =============================================================================
-- partner_drivers: 제휴기사(업체) 등록 신청
-- Supabase SQL Editor에서 실행하거나 마이그레이션으로 적용하세요.
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.partner_drivers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_name text not null,
  manager_name text not null,
  phone text not null,
  email text not null,
  region text not null,
  business_type text not null,
  bus_types text[] not null default '{}',
  vehicle_model text not null,
  vehicle_number text not null,
  passenger_capacity int not null,
  business_license_url text,
  business_license_name text,
  memo text,
  status text not null default 'pending'
);

comment on table public.partner_drivers is '제휴 전세버스 기사/법인 등록 신청';

-- RLS (브라우저 anon 키로 insert 하려면 정책 필요)
alter table public.partner_drivers enable row level security;

-- 기존 정책이 있으면 이름 충돌 시 삭제 후 재실행
create policy "partner_drivers_anon_insert"
  on public.partner_drivers
  for insert
  to anon
  with check (true);

-- Storage: 버킷 partner-files 생성 후, 아래는 예시 정챱입니다.
-- (대시보드 Storage → New bucket → name: partner-files, Public 여부는 정책에 맞게)
/*
insert into storage.buckets (id, name, public)
values ('partner-files', 'partner-files', true)
on conflict (id) do nothing;

create policy "partner_files_anon_upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'partner-files');

create policy "partner_files_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'partner-files');
*/
