-- ============================================================
-- 학교 업무관리 시스템 — 05. 교사 권한 확대
-- 01~04 를 이미 실행한 프로젝트라면 이 파일만 추가로 실행하면 됩니다.
--
--  1) 모든 교직원이 일정을 등록할 수 있게 (기존: 부장 · 관리자만)
--  2) 모든 교직원이 다른 반의 참여 '집계'를 볼 수 있게
--     — 학생 이름은 여전히 자기 반 · 해당 학년부장 · 교장/교감만 봅니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 일정 등록 권한 — 학교 구성원 전체
--    수정 권한은 그대로입니다(can_edit_event): 작성자 · 담당자 · 부장 · 관리자.
--    즉 교사는 자기가 만든 일정만 고칠 수 있습니다.
-- ------------------------------------------------------------

drop policy if exists "events_insert" on public.events;

create policy "events_insert" on public.events
  for insert to authenticated
  with check (public.is_school_member(school_id) and created_by = auth.uid());

create or replace function public.create_event(
  p_year_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date default null,
  p_category_id uuid default null,
  p_event_type text default 'academic',
  p_all_day boolean default true,
  p_period_from int default null,
  p_period_to int default null,
  p_start_time time default null,
  p_location text default '',
  p_requires_participation boolean default false,
  p_classroom_ids uuid[] default '{}',
  p_grade_ids uuid[] default '{}',
  p_department_ids uuid[] default '{}',
  p_due_at timestamptz default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_event uuid;
begin
  select school_id into v_school from academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'YEAR_NOT_FOUND';
  end if;
  -- 부장 · 관리자만이 아니라 학교 구성원 누구나 등록할 수 있습니다.
  if not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  insert into events (
    school_id, academic_year_id, category_id, title, event_type,
    start_date, end_date, all_day, period_from, period_to,
    start_time, location, requires_participation, due_at, created_by, owner_id
  ) values (
    v_school, p_year_id, p_category_id, trim(p_title), p_event_type,
    p_start_date, coalesce(p_end_date, p_start_date),
    p_all_day,
    case when p_all_day then null else p_period_from end,
    case when p_all_day then null else coalesce(p_period_to, p_period_from) end,
    p_start_time, coalesce(p_location, ''), p_requires_participation, p_due_at,
    auth.uid(), auth.uid()
  )
  returning id into v_event;

  insert into event_targets (event_id, classroom_id)
  select v_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;

  insert into event_targets (event_id, grade_id)
  select v_event, x from unnest(coalesce(p_grade_ids, '{}')) x;

  insert into event_targets (event_id, department_id)
  select v_event, x from unnest(coalesce(p_department_ids, '{}')) x;

  return v_event;
end;
$$;

-- ------------------------------------------------------------
-- 2. 반별 참여 집계 — 학교 구성원 전체가 조회
--
--    v_participation_by_classroom 은 security_invoker 라 RLS 를 그대로 받습니다.
--    (담임은 자기 반만 보임 — 학생 개인정보를 지키기 위한 의도된 동작)
--    여기서는 '몇 명이 참여/불참/미입력인지' 라는 **숫자만** 돌려주므로
--    security definer 로 RLS 를 우회하되, 학교 구성원인지는 직접 검사합니다.
--
--    ※ 학생 이름은 이 함수가 절대 돌려주지 않습니다.
--      이름이 필요한 v_absentees / students / participations 는 그대로 잠겨 있습니다.
-- ------------------------------------------------------------

create or replace function public.event_classroom_status(p_event uuid)
returns table (
  classroom_id uuid,
  classroom_name text,
  class_no int,
  grade_id uuid,
  total int,
  attended int,
  absent int,
  pending int,
  is_complete boolean,
  can_edit boolean          -- 내가 이 반의 입력을 고칠 수 있는가
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from events where id = p_event;
  if v_school is null or not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    c.id,
    c.name,
    c.class_no,
    c.grade_id,
    count(s.id)::int,
    (count(s.id) filter (where p.status = 'attended'))::int,
    (count(s.id) filter (where p.status = 'absent'))::int,
    (count(s.id) filter (where coalesce(p.status, 'pending') = 'pending'))::int,
    (count(s.id) filter (where coalesce(p.status, 'pending') = 'pending')) = 0,
    public.can_manage_classroom(c.id)
  from v_event_classrooms ec
  join classrooms c on c.id = ec.classroom_id
  join students s on s.classroom_id = c.id and s.status = 'enrolled'
  left join participations p on p.event_id = p_event and p.student_id = s.id
  where ec.event_id = p_event
  group by c.id, c.name, c.class_no, c.grade_id
  order by c.class_no;
end;
$$;
