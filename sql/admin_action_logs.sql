-- 관리자 수정/숨김 처리 감사 로그
create table if not exists public.admin_action_logs (
  id          uuid        primary key default gen_random_uuid(),
  admin_email text,
  action_type text        not null,
  target_table text       not null,
  target_id   text        not null,
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz not null default now()
);

comment on table  public.admin_action_logs is '관리자 수정/숨김 처리 감사 로그';
comment on column public.admin_action_logs.action_type  is 'hide_application | quote_edit | sponsor_edit | quote_unhide 등';
comment on column public.admin_action_logs.target_table is '대상 테이블명 (applications, driver_quotes, sponsor_preapprovals)';
comment on column public.admin_action_logs.target_id    is '대상 행의 uuid';
comment on column public.admin_action_logs.before_json  is '수정 전 값 스냅샷';
comment on column public.admin_action_logs.after_json   is '수정 후 값 스냅샷';

-- 서비스 롤만 읽기/쓰기 허용
alter table public.admin_action_logs enable row level security;

drop policy if exists "admin_action_logs_deny_all" on public.admin_action_logs;
create policy "admin_action_logs_deny_all" on public.admin_action_logs
  using (false)
  with check (false);

-- 최근 로그 조회 인덱스
create index if not exists admin_action_logs_created_at_idx
  on public.admin_action_logs (created_at desc);

create index if not exists admin_action_logs_target_idx
  on public.admin_action_logs (target_table, target_id);
