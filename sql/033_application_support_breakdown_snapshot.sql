-- 신규 견적(매칭) 직후 앱 단위 지원 스냅샷 — 기사 견적 제출 전에도 표시용
alter table public.applications
  add column if not exists support_breakdown_snapshot jsonb;

comment on column public.applications.support_breakdown_snapshot is
  'sponsor_preapprovals 매칭 직후 고정된 예상 지원·규칙 스냅샷 (견적 제출 전 지원검토 표시)';
