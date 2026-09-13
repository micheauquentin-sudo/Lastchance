-- Regroupe les compteurs d'observabilite a haute frequence sans perdre une
-- seule unite : un lot applicatif devient un increment atomique en base.
create or replace function public.check_rate_limit_weighted(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer,
  p_increment integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w_start timestamptz;
  c integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_increment < 1 then
    return true;
  end if;

  w_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, count)
  values (p_bucket, w_start, p_increment)
  on conflict (bucket, window_start)
  do update set count = least(
    public.rate_limits.count + excluded.count,
    2147483647
  )
  returning count into c;

  return c <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit_weighted(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit_weighted(text, integer, integer, integer)
  to service_role;
