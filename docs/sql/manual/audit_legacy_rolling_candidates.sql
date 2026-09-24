-- READ ONLY. Patterns are review candidates, NOT evidence of rolling intent.
-- Run after the additive rolling migration; never modifies operational data.
select c.id as class_id, c.organization_id, c.title, c.is_active,
  count(distinct s.id) filter(where s.specific_date >= (now() at time zone 'Asia/Seoul')::date) as future_dated_slots,
  max(s.specific_date) as last_dated_slot,
  count(distinct s.series_id) as existing_series_groups,
  count(distinct a.id) as referenced_applications,
  '운영자 기간·요일·시간·정원 확인 필요 (자동 변환 금지)' as review_required
from public.classes c
left join public.class_schedules s on s.class_id=c.id and s.schedule_type='one_time'
left join public.trial_applications a on a.class_schedule_id=s.id
where not exists(select 1 from public.class_operating_rules r where r.class_id=c.id)
group by c.id,c.organization_id,c.title,c.is_active
order by c.organization_id,c.title;
