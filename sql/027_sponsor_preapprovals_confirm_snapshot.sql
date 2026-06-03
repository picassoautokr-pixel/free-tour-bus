-- 지원확정 시 스냅샷 필드 (규칙·담당자·예상/확정 금액)
alter table public.sponsor_preapprovals
  add column if not exists planned_total_support bigint,
  add column if not exists sponsor_rule_name text,
  add column if not exists support_settlement_mode text,
  add column if not exists manager_name text,
  add column if not exists manager_phone text;

comment on column public.sponsor_preapprovals.planned_total_support is '확정 시점 예상(총) 지원금 스냅샷';
comment on column public.sponsor_preapprovals.sponsor_rule_name is '확정 시점 지원종류명';
comment on column public.sponsor_preapprovals.support_settlement_mode is '지원금 정산모드 (client_priority|ratio)';
comment on column public.sponsor_preapprovals.manager_name is '확정 시점 담당자 이름';
comment on column public.sponsor_preapprovals.manager_phone is '확정 시점 담당자 연락처';
