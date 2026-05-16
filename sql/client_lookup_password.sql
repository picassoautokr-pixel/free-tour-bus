alter table public.applications
  add column if not exists client_lookup_password text,
  add column if not exists client_lookup_password_set_at timestamptz;

comment on column public.applications.client_lookup_password is
  'MVP 견적 조회용 간단 비밀번호. TODO: 운영 보안 강화를 위해 hash 저장으로 전환 필요.';

comment on column public.applications.client_lookup_password_set_at is
  '고객 견적 조회용 간단 비밀번호 설정 시각';

create index if not exists applications_client_lookup_idx
on public.applications(phone, client_lookup_password, created_at desc);
