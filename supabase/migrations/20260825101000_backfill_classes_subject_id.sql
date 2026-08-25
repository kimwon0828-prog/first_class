do $$
declare
  approved_class_ids constant uuid[] := array[
    '350a23a0-a83e-462f-953f-10f4aa9c2596'::uuid,
    'ee6f72a8-5256-451e-b13b-09b859e32f1d'::uuid,
    '29158755-8452-4238-af9c-ce2b400d701f'::uuid,
    'c10e5679-862a-499c-8c2d-124526358584'::uuid,
    '99b21894-f6fc-4415-84b1-be7d6ba43a0c'::uuid,
    '1c104bc9-41d1-432a-bd51-3b7cffec9448'::uuid,
    '509d0395-9d38-42eb-b4f2-364e9bd2c07c'::uuid,
    '8106776d-71f2-4ed0-9093-71d1b71affa4'::uuid,
    '2a37e1be-d20b-44c6-89ff-7916e5479f90'::uuid,
    'babdbfec-393d-475a-87b5-f40530ffc292'::uuid,
    '6bddae75-f908-40ac-9c16-f78f50986da6'::uuid,
    '5f15b9d7-84e7-462d-a5ca-f7abb89676d6'::uuid,
    '1a801b22-6b6b-40de-84ff-e6777d5b4555'::uuid,
    '5b527274-ef06-4772-b0f6-7aad7786520d'::uuid,
    '9d2711fc-537c-4aa6-b7ef-9d86b54ff490'::uuid,
    'c885e421-fa69-4769-afc2-9890161c42ad'::uuid,
    '28669748-1b92-41aa-bd27-422b2f3e7769'::uuid,
    '5506782c-7e2a-4f4e-b7df-87655d03a6cc'::uuid,
    '03e2ff26-c5cb-4959-8321-dbbbdd2afa60'::uuid,
    'ef6792b4-198d-4072-b63b-cfff98bee951'::uuid,
    '55a875b7-761d-4315-82d4-00e3b0b763ec'::uuid,
    '7a975bbe-6904-4efe-bfd7-13357543d7ce'::uuid
  ];
  approved_subject_codes constant text[] := array[
    'ballet',
    'english',
    'other',
    'python',
    'other',
    'other',
    'coding',
    'coding',
    'korean',
    'coding',
    'korean',
    'social',
    'coding',
    'english',
    'coding',
    'thinking_math',
    'korean',
    'thinking_math',
    'python',
    'english',
    'robotics',
    'piano'
  ];
  duplicate_approved_class_ids uuid[];
  missing_subject_codes text[];
  mismatched_approved_class_ids uuid[];
begin
  if cardinality(approved_class_ids) <> 22
    or cardinality(approved_subject_codes) <> 22 then
    raise exception 'invalid_subject_backfill_mapping_count';
  end if;

  select array_agg(duplicate.class_id order by duplicate.class_id)
  into duplicate_approved_class_ids
  from (
    select mapping.class_id
    from unnest(approved_class_ids, approved_subject_codes) as mapping(class_id, subject_code)
    group by mapping.class_id
    having count(*) > 1
  ) duplicate;

  if duplicate_approved_class_ids is not null then
    raise exception 'duplicate_subject_backfill_class_ids: %', duplicate_approved_class_ids;
  end if;

  select array_agg(distinct mapping.subject_code order by mapping.subject_code)
  into missing_subject_codes
  from unnest(approved_class_ids, approved_subject_codes) as mapping(class_id, subject_code)
  left join public.subjects subject_item
    on subject_item.code = mapping.subject_code
  where subject_item.id is null;

  if missing_subject_codes is not null then
    raise exception 'missing_subject_backfill_codes: %', missing_subject_codes;
  end if;

  update public.classes class_item
  set subject_id = subject_item.id
  from unnest(approved_class_ids, approved_subject_codes) as mapping(class_id, subject_code)
  join public.subjects subject_item
    on subject_item.code = mapping.subject_code
  where class_item.id = mapping.class_id
    and class_item.subject_id is distinct from subject_item.id;

  select array_agg(mapping.class_id order by mapping.class_id)
  into mismatched_approved_class_ids
  from unnest(approved_class_ids, approved_subject_codes) as mapping(class_id, subject_code)
  join public.classes class_item
    on class_item.id = mapping.class_id
  join public.subjects subject_item
    on subject_item.code = mapping.subject_code
  where class_item.subject_id is distinct from subject_item.id;

  if mismatched_approved_class_ids is not null then
    raise exception 'subject_backfill_verification_failed: %', mismatched_approved_class_ids;
  end if;

end
$$;
