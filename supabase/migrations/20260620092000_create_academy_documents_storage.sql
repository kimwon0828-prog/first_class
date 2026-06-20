do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'academy-documents'
  ) then
    insert into storage.buckets (id, name, public)
    values ('academy-documents', 'academy-documents', false);
  else
    update storage.buckets
      set name = 'academy-documents',
          public = false
    where id = 'academy-documents';
  end if;
end
$$;

-- Current phase keeps academy documents fully private.
-- Expected future object paths:
-- - teacher-signup-requests/{request_id}/business-registration/{uuid}.{ext}
-- - academy-update-requests/{request_id}/business-registration/{uuid}.{ext}
-- This phase does not open any direct read/write policies on storage.objects
-- for academy-documents. Access will be added in a later phase through
-- server actions plus signed URL issuance.
