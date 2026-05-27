update public.classes
set region = '후곡학원가'
where region not in ('후곡학원가', '백마학원가', '은행사거리학원가');

alter table public.classes
  drop constraint if exists classes_region_academy_area_check;

alter table public.classes
  add constraint classes_region_academy_area_check
  check (region in ('후곡학원가', '백마학원가', '은행사거리학원가'));
