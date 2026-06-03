-- =============================================================================
-- STEP 3: 기사 승인 — partner_drivers 확장 (선택)
-- 컬럼이 없으면 앱은 nullable/생략으로 동작합니다. 권장 시 아래를 실행하세요.
-- =============================================================================

alter table public.partner_drivers
  add column if not exists approved_at timestamptz;

alter table public.partner_drivers
  add column if not exists auth_user_id uuid;

comment on column public.partner_drivers.approved_at is '관리자 승인(approved) 시각';
comment on column public.partner_drivers.auth_user_id is 'Supabase Auth auth.users.id';

-- 인증된 기사가 본인 partner_drivers 행을 읽을 수 있게 (대시보드·로그인 검증용)
-- 프로젝트 RLS에 맞게 조정하세요.
/*
create policy "partner_drivers_select_own_by_auth"
  on public.partner_drivers
  for select
  to authenticated
  using (auth.uid() = auth_user_id);
*/
