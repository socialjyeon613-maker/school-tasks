-- ============================================================
-- 학교 업무관리 시스템 — 07. 업무 일정에 담당자 지정
-- 01~06 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   업무(event_type='task')는 교시 · 대상 · 학생참여가 필요 없습니다.
--   대신 '누가 하는가'가 핵심이라 등록할 때 바로 담당자를 지정합니다.
--
--   ※ create or replace 는 인자 목록이 다르면 교체가 아니라 오버로드를
--     만듭니다. 예전 시그니처를 먼저 지웁니다.
-- ============================================================

drop function if exists public.create_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz, boolean
);

drop function if exists public.update_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz, boolean
);

-- ------------------------------------------------------------
-- 1. 등록
-- ------------------------------------------------------------

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
  p_due_at timestamptz default null,
  p_daily_participation boolean default false,
  p_assignee_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_event uuid;
  v_task boolean := p_event_type = 'task';
begin
  select school_id into v_school from academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'YEAR_NOT_FOUND';
  end if;
  if not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  insert into events (
    school_id, academic_year_id, category_id, title, event_type,
    start_date, end_date, all_day, period_from, period_to,
    start_time, location, requires_participation, daily_participation,
    due_at, created_by, owner_id
  ) values (
    v_school, p_year_id, p_category_id, trim(p_title), p_event_type,
    p_start_date, coalesce(p_end_date, p_start_date),
    -- 업무는 교시를 쓰지 않습니다.
    case when v_task then true else p_all_day end,
    case when v_task or p_all_day then null else p_period_from end,
    case when v_task or p_all_day then null
         else coalesce(p_period_to, p_period_from) end,
    p_start_time, coalesce(p_location, ''),
    -- 업무에는 학생 참여 체크가 없습니다.
    p_requires_participation and not v_task,
    p_daily_participation and not v_task
      and coalesce(p_end_date, p_start_date) > p_start_date,
    p_due_at, auth.uid(), auth.uid()
  )
  returning id into v_event;

  -- 업무는 대상(학년/반) 대신 담당자로 지정합니다.
  if not v_task then
    insert into event_targets (event_id, classroom_id)
    select v_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;
    insert into event_targets (event_id, grade_id)
    select v_event, x from unnest(coalesce(p_grade_ids, '{}')) x;
    insert into event_targets (event_id, department_id)
    select v_event, x from unnest(coalesce(p_department_ids, '{}')) x;
  end if;

  insert into event_assignments (event_id, user_id, due_at)
  select v_event, x, p_due_at from unnest(coalesce(p_assignee_ids, '{}')) x
  on conflict (event_id, user_id) do nothing;

  return v_event;
end;
$$;

-- ------------------------------------------------------------
-- 2. 수정
--   담당자 목록을 통째로 갈아끼우되, 그대로 남는 담당자의 진행 상태는
--   보존합니다. 제목만 고쳤는데 '완료'가 '미확인'으로 되돌아가면 안 됩니다.
-- ------------------------------------------------------------

create or replace function public.update_event(
  p_event uuid,
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
  p_due_at timestamptz default null,
  p_daily_participation boolean default false,
  p_assignee_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_task boolean := p_event_type = 'task';
begin
  if not public.can_edit_event(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  update events set
    title                  = trim(p_title),
    category_id            = p_category_id,
    event_type             = p_event_type,
    start_date             = p_start_date,
    end_date               = coalesce(p_end_date, p_start_date),
    all_day                = case when v_task then true else p_all_day end,
    period_from            = case when v_task or p_all_day then null
                                  else p_period_from end,
    period_to              = case when v_task or p_all_day then null
                                  else coalesce(p_period_to, p_period_from) end,
    start_time             = p_start_time,
    location               = coalesce(p_location, ''),
    requires_participation = p_requires_participation and not v_task,
    daily_participation    = p_daily_participation and not v_task
                             and coalesce(p_end_date, p_start_date) > p_start_date,
    due_at                 = p_due_at
  where id = p_event;

  delete from event_targets where event_id = p_event;

  if not v_task then
    insert into event_targets (event_id, classroom_id)
    select p_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;
    insert into event_targets (event_id, grade_id)
    select p_event, x from unnest(coalesce(p_grade_ids, '{}')) x;
    insert into event_targets (event_id, department_id)
    select p_event, x from unnest(coalesce(p_department_ids, '{}')) x;
  end if;

  -- 빠진 담당자만 지우고, 남는 사람의 status/submitted_at 은 건드리지 않습니다.
  delete from event_assignments
  where event_id = p_event
    and user_id <> all (coalesce(p_assignee_ids, '{}'));

  insert into event_assignments (event_id, user_id, due_at)
  select p_event, x, p_due_at from unnest(coalesce(p_assignee_ids, '{}')) x
  on conflict (event_id, user_id) do nothing;

  return p_event;
end;
$$;
