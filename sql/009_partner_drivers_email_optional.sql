-- 이메일 미입력 신청 허용 (기존 DB에 partner_drivers 가 이미 있을 때 실행)
alter table public.partner_drivers
  alter column email drop not null;
