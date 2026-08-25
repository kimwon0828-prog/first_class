create table if not exists public.subject_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_categories_sort_order_check
    check (sort_order >= 1)
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null
    references public.subject_categories(id)
    on delete restrict,
  code text not null unique,
  name text not null,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_sort_order_check
    check (sort_order >= 1)
);

alter table public.classes
  add column if not exists subject_id uuid
    references public.subjects(id)
    on delete set null;

create index if not exists subjects_category_id_sort_order_idx
  on public.subjects (category_id, sort_order);

create index if not exists classes_subject_id_idx
  on public.classes (subject_id);

drop trigger if exists set_subject_categories_updated_at on public.subject_categories;
create trigger set_subject_categories_updated_at
before update on public.subject_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_subjects_updated_at on public.subjects;
create trigger set_subjects_updated_at
before update on public.subjects
for each row execute function public.set_updated_at();

insert into public.subject_categories (code, name, sort_order, is_active)
values
  ('korean_language', '국어·논술', 1, true),
  ('math', '수학', 2, true),
  ('english', '영어', 3, true),
  ('science', '과학', 4, true),
  ('social_history', '사회·역사', 5, true),
  ('coding_it_robotics', '코딩·IT·로봇', 6, true),
  ('foreign_language', '외국어', 7, true),
  ('music', '음악', 8, true),
  ('art_design', '미술·디자인', 9, true),
  ('sports_dance', '체육·무용', 10, true),
  ('creative_mind', '창의·두뇌', 11, true),
  ('other', '기타', 12, true)
on conflict (code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active
where (subject_categories.name, subject_categories.sort_order, subject_categories.is_active)
  is distinct from (excluded.name, excluded.sort_order, excluded.is_active);

with subject_seed (category_code, code, name, sort_order) as (
  values
    ('korean_language', 'korean', '국어', 1),
    ('korean_language', 'reading', '독서', 2),
    ('korean_language', 'essay_writing', '논술', 3),
    ('korean_language', 'literacy', '문해력', 4),
    ('korean_language', 'writing', '글쓰기', 5),
    ('korean_language', 'reading_discussion', '독서토론', 6),
    ('math', 'school_math', '교과수학', 1),
    ('math', 'thinking_math', '사고력수학', 2),
    ('math', 'competition_math', '경시수학', 3),
    ('math', 'arithmetic', '연산', 4),
    ('math', 'abacus', '주산·암산', 5),
    ('english', 'english', '영어', 1),
    ('english', 'phonics', '파닉스', 2),
    ('english', 'english_conversation', '영어회화', 3),
    ('english', 'english_reading', '영어독서', 4),
    ('english', 'school_english', '내신영어', 5),
    ('english', 'csat_english', '수능영어', 6),
    ('english', 'certified_english', '공인영어', 7),
    ('science', 'science', '과학', 1),
    ('science', 'science_experiment', '과학실험', 2),
    ('science', 'inquiry_science', '탐구과학', 3),
    ('social_history', 'social', '사회', 1),
    ('social_history', 'korean_history', '한국사', 2),
    ('social_history', 'world_history', '세계사', 3),
    ('social_history', 'history_essay', '역사논술', 4),
    ('coding_it_robotics', 'coding', '코딩', 1),
    ('coding_it_robotics', 'robotics', '로봇', 2),
    ('coding_it_robotics', 'ai', 'AI', 3),
    ('coding_it_robotics', 'python', '파이썬', 4),
    ('coding_it_robotics', 'algorithm', '알고리즘', 5),
    ('coding_it_robotics', 'web_app_development', '웹·앱 개발', 6),
    ('foreign_language', 'chinese', '중국어', 1),
    ('foreign_language', 'japanese', '일본어', 2),
    ('foreign_language', 'spanish', '스페인어', 3),
    ('foreign_language', 'french', '프랑스어', 4),
    ('foreign_language', 'other_foreign_language', '기타 외국어', 5),
    ('music', 'piano', '피아노', 1),
    ('music', 'violin', '바이올린', 2),
    ('music', 'cello', '첼로', 3),
    ('music', 'flute', '플루트', 4),
    ('music', 'guitar', '기타', 5),
    ('music', 'drums', '드럼', 6),
    ('music', 'vocal', '성악', 7),
    ('music', 'composition', '작곡', 8),
    ('art_design', 'art', '미술', 1),
    ('art_design', 'drawing', '드로잉', 2),
    ('art_design', 'painting', '회화', 3),
    ('art_design', 'craft', '만들기·공예', 4),
    ('art_design', 'design', '디자인', 5),
    ('art_design', 'digital_drawing', '디지털드로잉', 6),
    ('sports_dance', 'taekwondo', '태권도', 1),
    ('sports_dance', 'soccer', '축구', 2),
    ('sports_dance', 'basketball', '농구', 3),
    ('sports_dance', 'swimming', '수영', 4),
    ('sports_dance', 'ballet', '발레', 5),
    ('sports_dance', 'dance', '무용', 6),
    ('sports_dance', 'gymnastics', '체조', 7),
    ('sports_dance', 'jump_rope', '줄넘기', 8),
    ('creative_mind', 'chess', '체스', 1),
    ('creative_mind', 'baduk', '바둑', 2),
    ('creative_mind', 'board_game', '보드게임', 3),
    ('creative_mind', 'creative_convergence', '창의융합', 4),
    ('creative_mind', 'manipulative_activity', '교구활동', 5),
    ('other', 'other', '기타', 1)
)
insert into public.subjects (category_id, code, name, sort_order, is_active)
select
  category.id,
  seed.code,
  seed.name,
  seed.sort_order,
  true
from subject_seed seed
join public.subject_categories category
  on category.code = seed.category_code
on conflict (code) do update
set category_id = excluded.category_id,
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active
where (subjects.category_id, subjects.name, subjects.sort_order, subjects.is_active)
  is distinct from (excluded.category_id, excluded.name, excluded.sort_order, excluded.is_active);

alter table public.subject_categories enable row level security;
alter table public.subjects enable row level security;

revoke all on table public.subject_categories from anon, authenticated;
revoke all on table public.subjects from anon, authenticated;
grant select on table public.subject_categories to anon, authenticated;
grant select on table public.subjects to anon, authenticated;

drop policy if exists subject_categories_public_read on public.subject_categories;
create policy subject_categories_public_read
on public.subject_categories
for select
to anon, authenticated
using (true);

drop policy if exists subjects_public_read on public.subjects;
create policy subjects_public_read
on public.subjects
for select
to anon, authenticated
using (true);
