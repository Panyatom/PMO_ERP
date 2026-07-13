-- Repair authority title rows whose legacy source text was stored as literal
-- question marks during the authority_titles backfill.
--
-- Matching criteria are intentionally narrow:
--   * exact row IDs observed in the corrupted authority_titles rows
--   * exact all-question-mark title_th values
--   * expected limit profile already linked through authority_limits
--
-- The repair preserves stable IDs and existing authority_limits relationships.
-- It does not touch historical memo data or legitimate custom titles.

update public.authority_titles
set
  title_th = 'ผู้จัดการโครงการ',
  title_en = 'Project Manager',
  sort_order = least(sort_order, 70),
  is_active = true,
  updated_at = now()
where id = 7
  and title_th = '????????????????'
  and exists (
    select 1
    from public.authority_limits al
    where al.authority_title_id = 7
      and al.memo_type = 'sl'
      and al.limit_thb = 50000
  );

update public.authority_limits
set
  title = 'ผู้จัดการโครงการ',
  updated_at = now()
where authority_title_id = 7
  and title = '????????????????';

update public.authority_titles
set
  title_th = 'หัวหน้าฝ่าย',
  title_en = 'Department Head',
  sort_order = least(sort_order, 80),
  is_active = true,
  updated_at = now()
where id = 8
  and title_th = '??????????????????'
  and exists (
    select 1
    from public.authority_limits al
    where al.authority_title_id = 8
      and al.memo_type = 'sl'
      and al.limit_thb = 500000
  );

update public.authority_limits
set
  title = 'หัวหน้าฝ่าย',
  updated_at = now()
where authority_title_id = 8
  and title = '??????????????????';

update public.authority_titles
set
  title_th = 'กรรมการผู้จัดการ',
  title_en = 'Managing Director',
  sort_order = least(sort_order, 90),
  is_active = true,
  updated_at = now()
where id = 9
  and title_th = '???????????????????????'
  and exists (
    select 1
    from public.authority_limits al
    where al.authority_title_id = 9
      and al.memo_type = 'sl'
      and al.limit_thb = 2000000
  );

update public.authority_limits
set
  title = 'กรรมการผู้จัดการ',
  updated_at = now()
where authority_title_id = 9
  and title = '???????????????????????';

update public.user_profiles
set
  default_authority_title_id = 7,
  updated_at = now()
where default_authority_title_id is null
  and btrim(coalesce(title, '')) = 'ผู้จัดการโครงการ'
  and exists (
    select 1
    from public.authority_titles at
    where at.id = 7
      and at.title_th = 'ผู้จัดการโครงการ'
  );
