-- ============================================================
-- 학교 업무관리 시스템 — 15. 진행 명단에 담을 학생 찾기
-- 01~14 를 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   14 까지는 명단에 담을 학생을 '내가 볼 수 있는 반'에서만 찾을 수 있어,
--   3-1 담임이 담당자여도 3-2 학생을 담지 못했습니다.
--   학년부 교사는 그 학년 학생을 함께 지도하므로 학년 단위로 넓힙니다.
--
--   ※ 넓히는 범위를 분명히 해 둡니다.
--     - 넓어지는 것 : '명단에 담을 학생 찾기' 하나뿐입니다.
--                     그것도 그 일감의 담당자에게만 열립니다.
--     - 그대로인 것 : 학생 조회 · 참여 체크 · 참여 현황 이름 · 엑셀 ·
--                     통합 검색은 여전히 자기 반만 보입니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 내가 속한 학년
--    학년부장이면 그 학년, 담임 · 부담임 · 교과면 그 반이 속한 학년.
--    교장 · 교감 · 관리자는 전 학년.
-- ------------------------------------------------------------

create or replace function public.my_grade_ids(p_school uuid)
returns setof uuid
language sql stable
security definer set search_path = public
as $$
  select g.id
  from grades g
  join academic_years y on y.id = g.academic_year_id and y.is_current
  where g.school_id = p_school
    and (
      public.is_school_admin(p_school)
      or exists (
        select 1 from staff_roles r
        where r.user_id = auth.uid() and r.grade_id = g.id
      )
      or exists (
        select 1 from staff_roles r
        join classrooms c on c.id = r.classroom_id
        where r.user_id = auth.uid() and c.grade_id = g.id
      )
    );
$$;

-- ------------------------------------------------------------
-- 2. 명단에 담을 학생 찾기
--    담당자에게만, 자기 학년 안에서만, 이미 담긴 학생은 빼고.
-- ------------------------------------------------------------

create or replace function public.search_roster_candidates(p_event uuid, p_q text)
returns table (
  student_id uuid,
  student_name text,
  classroom_name text,
  class_no int,
  student_no int
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_year uuid;
begin
  select e.school_id, e.academic_year_id into v_school, v_year
  from events e where e.id = p_event;

  if v_school is null then
    raise exception 'NOT_FOUND';
  end if;
  -- 명단을 고칠 수 있는 사람만 학생을 찾을 수 있습니다.
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;
  if coalesce(trim(p_q), '') = '' then
    return;
  end if;

  return query
  select s.id, s.name, c.name, c.class_no, s.number
  from students s
  join classrooms c on c.id = s.classroom_id
  where s.academic_year_id = v_year
    and s.status = 'enrolled'
    and s.deleted_at is null
    and c.grade_id in (select public.my_grade_ids(v_school))
    and s.name ilike '%' || trim(p_q) || '%'
    and not exists (
      select 1 from event_roster r
      where r.event_id = p_event and r.student_id = s.id
    )
  order by c.class_no, s.number
  limit 30;
end;
$$;

-- ------------------------------------------------------------
-- 3. 담기 — 찾을 수 있는 범위 밖의 학생은 담기지 않게
--    화면을 거치지 않고 학생 id 를 직접 보내도 막습니다.
-- ------------------------------------------------------------

create or replace function public.add_roster_students(p_event uuid, p_students uuid[])
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_year uuid;
  v_first uuid;
  v_allowed uuid[];
  v_count int;
begin
  select e.school_id, e.academic_year_id into v_school, v_year
  from events e where e.id = p_event;

  if v_school is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  -- 내 학년의 재학생만 추립니다.
  select coalesce(array_agg(s.id), '{}') into v_allowed
  from students s
  join classrooms c on c.id = s.classroom_id
  where s.id = any (coalesce(p_students, '{}'))
    and s.academic_year_id = v_year
    and s.status = 'enrolled'
    and s.deleted_at is null
    and c.grade_id in (select public.my_grade_ids(v_school));

  if array_length(v_allowed, 1) is null then
    return 0;
  end if;

  select id into v_first from event_stages
  where event_id = p_event order by position limit 1;

  insert into event_roster (event_id, student_id, stage_id, added_by, updated_by)
  select p_event, x, v_first, auth.uid(), auth.uid()
  from unnest(v_allowed) x
  on conflict (event_id, student_id) do nothing;

  get diagnostics v_count = row_count;

  insert into event_roster_history (event_id, student_id, from_stage, to_stage, changed_by)
  select p_event, x, null,
         (select name from event_stages where id = v_first),
         auth.uid()
  from unnest(v_allowed) x;

  return v_count;
end;
$$;
