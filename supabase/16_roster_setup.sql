-- ============================================================
-- 학교 업무관리 시스템 — 16. 일정 등록할 때 진행 명단까지 한 번에
-- 01~15 를 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   15 까지는 일정을 만든 뒤 상세 화면에서 단계를 고르고 학생을 담았습니다.
--   등록 화면에서 단계 이름 · 순서 · 공개 범위 · 학생을 한 번에 정합니다.
--
--   등록 전에는 일정 id 가 없으므로 학생 검색이 일감에 묶이면 안 됩니다.
--   그래서 검색을 '학교 + 내 학년' 기준으로 바꾸고, 일감이 정해졌을 때만
--   이미 담긴 학생을 빼도록 했습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 학생 찾기 — 일감이 없어도 됨
--    p_event 를 주면 그 일감의 담당자만, 이미 담긴 학생은 제외.
--    p_event 가 없으면(등록 화면) 학년에 소속된 교사면 찾을 수 있습니다.
-- ------------------------------------------------------------

create or replace function public.search_students_for_roster(
  p_school uuid,
  p_q text,
  p_event uuid default null
)
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
  v_year uuid;
begin
  if not public.is_school_member(p_school) then
    raise exception 'FORBIDDEN';
  end if;

  -- 이미 만들어진 일감이면 그 명단을 고칠 수 있는 사람만
  if p_event is not null and not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  select id into v_year from academic_years
  where school_id = p_school and is_current;

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
    and c.grade_id in (select public.my_grade_ids(p_school))
    and s.name ilike '%' || trim(p_q) || '%'
    and (
      p_event is null
      or not exists (
        select 1 from event_roster r
        where r.event_id = p_event and r.student_id = s.id
      )
    )
  order by c.class_no, s.number
  limit 30;
end;
$$;

-- ------------------------------------------------------------
-- 2. 진행 명단 한 번에 설정
--    단계 · 공개 범위 · 학생을 한 트랜잭션에서 처리합니다.
--    등록 화면에서 create_event 직후에 부릅니다.
-- ------------------------------------------------------------

create or replace function public.setup_roster(
  p_event uuid,
  p_stages jsonb default '[]',
  p_visibility text default null,
  p_students uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_stages int := 0;
  v_added int := 0;
begin
  select school_id into v_school from events where id = p_event;
  if v_school is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  if jsonb_array_length(coalesce(p_stages, '[]'::jsonb)) > 0 then
    v_stages := public.set_event_stages(p_event, p_stages);
  end if;

  -- 공개 범위를 넓히는 것은 부장 · 관리자만. 조용히 무시하지 않고 알립니다.
  if p_visibility is not null then
    if p_visibility not in ('assignees', 'school') then
      raise exception 'INVALID_MODE';
    end if;
    if p_visibility = 'school'
       and not (public.is_head(v_school) or public.is_school_admin(v_school)) then
      raise exception 'VISIBILITY_FORBIDDEN';
    end if;
    update events set roster_visibility = p_visibility where id = p_event;
  end if;

  if array_length(coalesce(p_students, '{}'), 1) is not null then
    v_added := public.add_roster_students(p_event, p_students);
  end if;

  return jsonb_build_object('stages', v_stages, 'students', v_added);
end;
$$;
