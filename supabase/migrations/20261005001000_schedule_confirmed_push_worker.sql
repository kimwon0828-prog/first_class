-- Vercel Hobby cannot run a five-minute cron. One event-specific Supabase HTTP job.
-- Activation and Vault provisioning occur only after the compatible deployment is READY.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function app.invoke_confirmed_push_worker()
returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; request_id bigint;
begin
 if not exists(select 1 from public.parent_confirmed_push_deliveries
   where state in ('pending','receipts','checking','fallback_ready') and next_check_at<=now()) then return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='parent_confirmed_push_cron_secret';
 if secret is null then raise exception 'confirmed_push_worker_secret_missing'; end if;
 select net.http_get(url:='https://firstsuup.com/api/cron/schedule-confirmed-push',
   headers:=jsonb_build_object('Authorization','Bearer '||secret),timeout_milliseconds:=55000) into request_id;
 return request_id;
end;
$$;
revoke all on function app.invoke_confirmed_push_worker() from public,anon,authenticated,service_role;
select cron.schedule('firstsuup-schedule-confirmed-push','*/5 * * * *','select app.invoke_confirmed_push_worker();');
select cron.alter_job((select jobid from cron.job where jobname='firstsuup-schedule-confirmed-push'),active:=false);
commit;
