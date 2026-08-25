alter table public.classes
  add column if not exists subject_category_id uuid
    references public.subject_categories(id)
    on delete restrict;

create index if not exists classes_subject_category_id_idx
  on public.classes (subject_category_id);

update public.classes as class_item
set subject_category_id = subject_item.category_id
from public.subjects as subject_item
where class_item.subject_id = subject_item.id
  and class_item.subject_category_id is distinct from subject_item.category_id;
