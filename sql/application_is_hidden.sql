-- 클라이언트 견적요청 어드민 숨김 (soft hide, 모든 대시보드 목록 제외)
alter table public.applications
  add column if not exists is_hidden boolean not null default false;

alter table public.applications
  add column if not exists hidden_at timestamptz;

comment on column public.applications.is_hidden is
  'true이면 클라이언트·기사·스폰서·어드민 목록에서 숨김';

comment on column public.applications.hidden_at is
  '관리자 숨김 처리 시각';

create index if not exists applications_is_hidden_idx
  on public.applications (is_hidden)
  where is_hidden = true;
