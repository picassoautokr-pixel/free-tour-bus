-- 후원 지급 상태 및 지원 분류 필드 (스폰서 대시보드 MVP)

alter table public.sponsor_preapprovals
  add column if not exists payout_status text,
  add column if not exists support_kind text,
  add column if not exists support_form_kind text,
  add column if not exists support_condition_label text;

comment on column public.sponsor_preapprovals.payout_status is '지급상태: pending, processing, completed';
comment on column public.sponsor_preapprovals.support_kind is '지원종류 (스폰서 선택)';
comment on column public.sponsor_preapprovals.support_form_kind is '지원형태 (스폰서 선택)';
comment on column public.sponsor_preapprovals.support_condition_label is '지원조건 (스폰서 선택)';

alter table public.sponsor_companies
  add column if not exists dashboard_settings jsonb default '{}'::jsonb;

comment on column public.sponsor_companies.dashboard_settings is '지원종류/지원형태/지원조건 카탈로그 등 대시보드 설정';

-- 승인 시 기본 지급중
update public.sponsor_preapprovals
set payout_status = 'processing'
where status = 'approved' and (payout_status is null or payout_status = '');
