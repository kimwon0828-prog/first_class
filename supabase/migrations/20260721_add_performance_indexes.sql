create index if not exists idx_classes_organization_id_created_at_desc
  on public.classes (organization_id, created_at desc);

create index if not exists idx_trial_applications_class_id_status_created_at_desc
  on public.trial_applications (class_id, status, created_at desc);

create index if not exists idx_teachers_org_active_created_at_partial
  on public.teachers (organization_id, is_active, created_at)
  where profile_id is null;
