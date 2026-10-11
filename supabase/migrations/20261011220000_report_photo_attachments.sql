-- COMPAT / approval required. No existing data rewrite, bucket change, or report publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A registry is necessary for uploads that exist BEFORE a trial_results row, and
-- for immutable file identity / orphan cleanup independently of editable captions.
create table public.report_attachment_files (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.trial_applications(id),
 object_path text not null unique,
 state text not null default 'uploading' check(state in ('uploading','ready','failed','deleting','deleted')),
 width integer, height integer, mime_type text, byte_size integer,
 created_at timestamptz not null default now(), touched_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 check(state <> 'ready' or (width>0 and height>0 and width::bigint*height<=24000000 and byte_size between 1 and 4194304 and mime_type in ('image/jpeg','image/png','image/webp')))
);
create index report_attachment_files_application on public.report_attachment_files(application_id);
alter table public.report_attachment_files enable row level security;
revoke all on public.report_attachment_files from public,anon,authenticated,service_role;
grant select on public.report_attachment_files to service_role;
-- No direct client DML/SELECT. Authorized RPCs are the sole metadata interface.
alter table public.trial_results add column attachments jsonb not null default '[]'::jsonb check(jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=6);

-- Fail rather than alter an unexpected bucket. Existing buckets/policies stay untouched.
do $$ begin
 if exists(select 1 from storage.buckets where id='report-attachments') then raise exception 'report_attachment_bucket_already_exists'; end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('report-attachments','report-attachments',false,4194304,array['image/jpeg','image/png','image/webp']);
-- Restrictive policies also protect against any unrelated permissive catch-all policy.
create policy report_files_private_select on storage.objects as restrictive for select to anon,authenticated using(bucket_id <> 'report-attachments');
create policy report_files_private_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id <> 'report-attachments');
create policy report_files_private_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id <> 'report-attachments') with check(bucket_id <> 'report-attachments');
create policy report_files_private_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id <> 'report-attachments');

create function public.reserve_report_attachment(p_application_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.trial_applications; f public.report_attachment_files; new_id uuid:=gen_random_uuid();
begin
 a:=public.workflow_studio_application(p_application_id);
 if exists(select 1 from public.experience_reports where application_id=a.id) then raise exception 'report_content_locked'; end if;
 if (select count(*) from public.report_attachment_files where application_id=a.id and state in ('uploading','ready') and created_at>now()-interval '1 day')>=30 then raise exception 'attachment_upload_limit'; end if;
 insert into public.report_attachment_files(id,application_id,object_path,created_by)
 values(new_id,a.id,a.id::text||'/'||new_id::text,auth.uid()) returning * into f;
 return jsonb_build_object('id',f.id,'object_path',f.object_path);
end $$;

-- Only trusted server decoder can finish/fail uploads; metadata cannot be forged by clients.
create function public.finish_report_attachment(p_id uuid,p_width integer,p_height integer,p_mime text,p_bytes integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.report_attachment_files;
begin
 select * into f from public.report_attachment_files where id=p_id;
 perform 1 from public.trial_applications where id=f.application_id for update;
 select * into f from public.report_attachment_files where id=p_id for update;
 if f.id is null or f.state<>'uploading' or f.created_at<now()-interval '10 minutes' then raise exception 'attachment_upload_expired'; end if;
 if exists(select 1 from public.experience_reports where application_id=f.application_id) then raise exception 'report_content_locked'; end if;
 if p_width is null or p_height is null or p_mime is null or p_bytes is null then raise exception 'invalid_attachment'; end if;
 update public.report_attachment_files set state='ready',width=p_width,height=p_height,mime_type=p_mime,byte_size=p_bytes,touched_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'caption','','width',p_width,'height',p_height,'mimeType',p_mime);
end $$;
create function public.fail_report_attachment(p_id uuid) returns void
language sql security definer set search_path='' as $$
 update public.report_attachment_files set state='failed',touched_at=now() where id=p_id and state='uploading';
$$;

-- Resolve file reads under the CALLER's identity, even though storage bytes are
-- fetched by the server. Parent must own a currently published snapshot reference.
create function public.read_report_attachment(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.report_attachment_files; allowed boolean;
begin
 if auth.uid() is null then raise exception 'attachment_forbidden'; end if;
 select * into f from public.report_attachment_files where id=p_id and state='ready';
 if not found then raise exception 'attachment_forbidden'; end if;
 select exists(select 1 from public.trial_applications a join public.classes c on c.id=a.class_id
  join public.profiles p on p.id=auth.uid() where a.id=f.application_id and
  ((p.role in ('academy','admin') and p.organization_id=c.organization_id) or
   (p.role='parent' and a.parent_id=p.id and exists(select 1 from public.experience_reports r where r.application_id=a.id and r.status='published' and r.content_version=4 and r.content->'attachments' @> jsonb_build_array(jsonb_build_object('id',f.id::text)))))) into allowed;
 if not allowed then raise exception 'attachment_forbidden'; end if;
 return jsonb_build_object('object_path',f.object_path,'mime_type',f.mime_type);
end $$;

create function public.save_studio_trial_result_with_attachments(p_application_id uuid,p_content jsonb,p_expected_updated_at timestamptz default null)
returns text language plpgsql security definer set search_path='' as $$
declare a public.trial_applications; item jsonb; f public.report_attachment_files; list jsonb:='[]'; ids uuid[]:='{}'; result text;
begin
 a:=public.workflow_studio_application(p_application_id);
 if exists(select 1 from public.experience_reports where application_id=a.id) then raise exception 'report_content_locked'; end if;
 if jsonb_typeof(p_content->'attachments') is distinct from 'array' or jsonb_array_length(p_content->'attachments')>6 then raise exception 'invalid_attachments'; end if;
 if exists(select 1 from public.report_attachment_files where application_id=a.id and state='uploading' and created_at>now()-interval '10 minutes') then raise exception 'attachment_upload_in_progress'; end if;
 for item in select value from jsonb_array_elements(p_content->'attachments') loop
  if jsonb_typeof(item)<>'object' or (item-'id'-'caption')<>'{}'::jsonb or jsonb_typeof(item->'caption') is distinct from 'string' or length(item->>'caption')>100 then raise exception 'invalid_attachments'; end if;
  select * into f from public.report_attachment_files where id=(item->>'id')::uuid and application_id=a.id and state='ready' for update;
  if not found or f.id=any(ids) then raise exception 'invalid_attachment_reference'; end if;
  ids:=array_append(ids,f.id);
  list:=list||jsonb_build_array(jsonb_build_object('id',f.id,'caption',btrim(item->>'caption'),'width',f.width,'height',f.height,'mimeType',f.mime_type));
 end loop;
 -- Existing RPC owns all original observations, subject validation, revision,
 -- entitlement/organization/completed checks. Both updates share one transaction.
 result:=public.save_studio_trial_result(a.id,p_content-'attachments',p_expected_updated_at);
 update public.report_attachment_files set touched_at=now() where application_id=a.id and
 (id=any(ids) or id in (select (value->>'id')::uuid from public.trial_results t cross join lateral jsonb_array_elements(t.attachments) where t.application_id=a.id));
 update public.trial_results set attachments=list where application_id=a.id and attachments is distinct from list;
 return result;
end $$;

-- Claim specific old orphans before deleting storage bytes. The application lock
-- serializes claims against save/publish; deleting files cannot be reattached.
create function public.claim_report_attachment_cleanup(p_ids uuid[]) returns table(id uuid,object_path text)
language plpgsql security definer set search_path='' as $$
declare f public.report_attachment_files;
begin
 if cardinality(p_ids)>50 then raise exception 'cleanup_batch_too_large'; end if;
 for f in select * from public.report_attachment_files x where x.id=any(p_ids) order by x.application_id,x.id loop
  perform 1 from public.trial_applications where trial_applications.id=f.application_id for update;
  select * into f from public.report_attachment_files x where x.id=f.id for update;
  if f.touched_at<now()-interval '7 days' and f.state<>'deleted'
   and not exists(select 1 from public.trial_results t where t.application_id=f.application_id and t.attachments @> jsonb_build_array(jsonb_build_object('id',f.id::text)))
   and not exists(select 1 from public.experience_reports r where r.application_id=f.application_id and r.content->'attachments' @> jsonb_build_array(jsonb_build_object('id',f.id::text))) then
   update public.report_attachment_files x set state='deleting' where x.id=f.id;
   id:=f.id;object_path:=f.object_path;return next;
  end if;
 end loop;
end $$;
create function public.finish_report_attachment_cleanup(p_id uuid) returns void
language sql security definer set search_path='' as $$
 update public.report_attachment_files set state='deleted' where id=p_id and state='deleting';
$$;

-- Generate V4 from the approved V3 body; existing publications are never touched.
-- Guards fail closed if a later deployment changed the underlying function.
do $patch$
declare body text:=pg_get_functiondef('public.publish_experience_report_v3(uuid,timestamptz)'::regprocedure); newbody text;
begin
 if position('public.publish_experience_report_v3(' in body)=0 or position('''published'', 3, v_content' in body)=0 then raise exception 'unexpected_v3_publisher'; end if;
 newbody:=replace(body,'public.publish_experience_report_v3(','public.publish_experience_report_v4(');
 newbody:=replace(newbody,'  -- 원장이 본 revision', E'  if exists(select 1 from public.report_attachment_files where application_id=p_application_id and state=''uploading'' and created_at>now()-interval ''10 minutes'') then raise exception ''attachment_upload_in_progress''; end if;\n  -- 원장이 본 revision');
 newbody:=replace(newbody,'  -- 살아 있는 발행본', E'  if jsonb_array_length(v_result.attachments)>0 then\n    if exists(select 1 from jsonb_array_elements(v_result.attachments) x where not exists(select 1 from public.report_attachment_files f where f.id=(x->>''id'')::uuid and f.application_id=p_application_id and f.state=''ready'')) then raise exception ''invalid_attachment_reference''; end if;\n    v_content:=v_content||jsonb_build_object(''attachments'',v_result.attachments);\n  end if;\n  -- 살아 있는 발행본');
 newbody:=replace(newbody,'''published'', 3, v_content','''published'', case when jsonb_array_length(v_result.attachments)>0 then 4 else 3 end, v_content');
 if newbody=body or position('attachment_upload_in_progress' in newbody)=0 or position('invalid_attachment_reference' in newbody)=0 then raise exception 'v4_patch_failed'; end if;
 execute newbody;
 -- Older apps cannot silently publish a text-only snapshot while photos exist.
 body:=replace(body,'  -- 원장이 본 revision', E'  if jsonb_array_length(v_result.attachments)>0 then raise exception ''attachment_reader_required''; end if;\n  if exists(select 1 from public.report_attachment_files where application_id=p_application_id and state=''uploading'' and created_at>now()-interval ''10 minutes'') then raise exception ''attachment_upload_in_progress''; end if;\n  -- 원장이 본 revision');
 if position('attachment_reader_required' in body)=0 then raise exception 'v3_guard_patch_failed'; end if;
 execute body;
 body:=pg_get_functiondef('public.publish_experience_report(uuid,timestamptz)'::regprocedure);
 body:=replace(body,'  -- 원장이 본 revision', E'  if jsonb_array_length(v_result.attachments)>0 then raise exception ''attachment_reader_required''; end if;\n  if exists(select 1 from public.report_attachment_files where application_id=p_application_id and state=''uploading'' and created_at>now()-interval ''10 minutes'') then raise exception ''attachment_upload_in_progress''; end if;\n  -- 원장이 본 revision');
 if position('attachment_reader_required' in body)=0 then raise exception 'v2_guard_patch_failed'; end if;
 execute body;
end $patch$;

revoke all on function public.reserve_report_attachment(uuid),public.read_report_attachment(uuid),public.save_studio_trial_result_with_attachments(uuid,jsonb,timestamptz),public.publish_experience_report_v4(uuid,timestamptz) from public,anon;
grant execute on function public.reserve_report_attachment(uuid),public.read_report_attachment(uuid),public.save_studio_trial_result_with_attachments(uuid,jsonb,timestamptz),public.publish_experience_report_v4(uuid,timestamptz) to authenticated;
revoke all on function public.finish_report_attachment(uuid,integer,integer,text,integer),public.fail_report_attachment(uuid),public.claim_report_attachment_cleanup(uuid[]),public.finish_report_attachment_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finish_report_attachment(uuid,integer,integer,text,integer),public.fail_report_attachment(uuid),public.claim_report_attachment_cleanup(uuid[]),public.finish_report_attachment_cleanup(uuid) to service_role;
notify pgrst,'reload schema';
commit;
