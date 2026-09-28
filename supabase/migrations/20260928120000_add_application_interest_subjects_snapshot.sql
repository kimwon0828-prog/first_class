-- Application-time child interest snapshot. Same nullable free-text type as children.
-- No default, UPDATE, profile backfill, or changes to existing snapshot values.
alter table public.trial_applications
  add column interest_subjects text;

comment on column public.trial_applications.interest_subjects is
  '신청 당시 선택한 자녀의 관심 과목 자유 입력값. 현재 자녀 프로필이나 수업 과목으로 보완하지 않는다. 기존 신청은 NULL 유지.';

-- PostgreSQL expands SELECT * when a view is defined. Append the new field while
-- retaining the existing teacher/org predicate, check option and existing grants.
create or replace view public.studio_trial_applications as
select ta.*
from public.trial_applications ta
where app.current_role() = 'teacher'
  and ta.class_id in (
    select c.id
    from public.classes c
    where c.organization_id = app.current_org_id()
  )
with check option;

notify pgrst, 'reload schema';
