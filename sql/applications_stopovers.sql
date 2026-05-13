-- 고객 신청 경유지 목록

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'stopovers'
  ) then
    alter table public.applications
      add column stopovers text[];
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'stopovers'
      and udt_name = 'text'
  ) then
    alter table public.applications
      alter column stopovers type text[]
      using case
        when stopovers is null or btrim(stopovers) = '' then null
        else array_remove(
          regexp_split_to_array(btrim(stopovers), '\s*[,，;；\r\n]+\s*'),
          ''
        )
      end;
  end if;
end $$;
