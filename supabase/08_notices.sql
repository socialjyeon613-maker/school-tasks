-- ============================================================
-- 학교 업무관리 시스템 — 08. 공지
-- 01~07 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   공지는 '게시 기간이 있는 알림글' 입니다.
--   교시 · 대상 · 참여체크 · 담당자를 쓰지 않고, 본문(description)과
--   시작일~종료일만 갖습니다. 등록은 부장 · 관리자만 합니다.
--
--   events 를 재사용합니다. 첨부 · 댓글 · 수정 · 삭제 · RLS 가 그대로 붙고,
--   달력에서는 event_type 으로 걸러 별도 영역에 보여줍니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. event_type 에 'notice' 허용
-- ------------------------------------------------------------

alter table public.events drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type in ('academic', 'task', 'notice'));

create index if not exists idx_events_notice
  on public.events (academic_year_id, start_date)
  where event_type = 'notice';

-- ------------------------------------------------------------
-- 2. 등록 / 수정 — 본문(p_description)과 공지 권한 검사 추가
-- ------------------------------------------------------------

drop function if exists public.create_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz, boolean, uuid[]
);

drop function if exists public.update_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz, boolean, uuid[]
);

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
  p_assignee_ids uuid[] default '{}',
  p_description text default ''
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_event uuid;
  v_task boolean := p_event_type = 'task';
  v_notice boolean := p_event_type = 'notice';
  v_plain boolean := p_event_type = 'academic';
begin
  select school_id into v_school from academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'YEAR_NOT_FOUND';
  end if;
  if not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;
  -- 공지는 부장 · 관리자만 올립니다.
  if v_notice and not (public.is_head(v_school) or public.is_school_admin(v_school)) then
    raise exception 'NOTICE_FORBIDDEN';
  end if;

  insert into events (
    school_id, academic_year_id, category_id, title, description, event_type,
    start_date, end_date, all_day, period_from, period_to,
    start_time, location, requires_participation, daily_participation,
    due_at, created_by, owner_id
  ) values (
    v_school, p_year_id,
    case when v_notice then null else p_category_id end,
    trim(p_title), coalesce(p_description, ''), p_event_type,
    p_start_date, coalesce(p_end_date, p_start_date),
    -- 교시는 학사일정에서만 씁니다.
    case when v_plain then p_all_day else true end,
    case when v_plain and not p_all_day then p_period_from else null end,
    case when v_plain and not p_all_day
         then coalesce(p_period_to, p_period_from) else null end,
    case when v_plain then p_start_time else null end,
    coalesce(p_location, ''),
    p_requires_participation and v_plain,
    p_daily_participation and v_plain
      and coalesce(p_end_date, p_start_date) > p_start_date,
    p_due_at, auth.uid(), auth.uid()
  )
  returning id into v_event;

  if v_plain then
    insert into event_targets (event_id, classroom_id)
    select v_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;
    insert into event_targets (event_id, grade_id)
    select v_event, x from unnest(coalesce(p_grade_ids, '{}')) x;
    insert into event_targets (event_id, department_id)
    select v_event, x from unnest(coalesce(p_department_ids, '{}')) x;
  end if;

  if v_task then
    insert into event_assignments (event_id, user_id, due_at)
    select v_event, x, p_due_at from unnest(coalesce(p_assignee_ids, '{}')) x
    on conflict (event_id, user_id) do nothing;
  end if;

  return v_event;
end;
$$;

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
  p_assignee_ids uuid[] default '{}',
  p_description text default ''
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_task boolean := p_event_type = 'task';
  v_notice boolean := p_event_type = 'notice';
  v_plain boolean := p_event_type = 'academic';
begin
  if not public.can_edit_event(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  select school_id into v_school from events where id = p_event;
  if v_notice and not (public.is_head(v_school) or public.is_school_admin(v_school)) then
    raise exception 'NOTICE_FORBIDDEN';
  end if;

  update events set
    title                  = trim(p_title),
    description            = coalesce(p_description, ''),
    category_id            = case when v_notice then null else p_category_id end,
    event_type             = p_event_type,
    start_date             = p_start_date,
    end_date               = coalesce(p_end_date, p_start_date),
    all_day                = case when v_plain then p_all_day else true end,
    period_from            = case when v_plain and not p_all_day
                                  then p_period_from else null end,
    period_to              = case when v_plain and not p_all_day
                                  then coalesce(p_period_to, p_period_from) else null end,
    start_time             = case when v_plain then p_start_time else null end,
    location               = coalesce(p_location, ''),
    requires_participation = p_requires_participation and v_plain,
    daily_participation    = p_daily_participation and v_plain
                             and coalesce(p_end_date, p_start_date) > p_start_date,
    due_at                 = p_due_at
  where id = p_event;

  delete from event_targets where event_id = p_event;

  if v_plain then
    insert into event_targets (event_id, classroom_id)
    select p_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;
    insert into event_targets (event_id, grade_id)
    select p_event, x from unnest(coalesce(p_grade_ids, '{}')) x;
    insert into event_targets (event_id, department_id)
    select p_event, x from unnest(coalesce(p_department_ids, '{}')) x;
  end if;

  if v_task then
    -- 빠진 담당자만 지우고 남는 사람의 진행 상태는 보존합니다.
    delete from event_assignments
    where event_id = p_event
      and user_id <> all (coalesce(p_assignee_ids, '{}'));

    insert into event_assignments (event_id, user_id, due_at)
    select p_event, x, p_due_at from unnest(coalesce(p_assignee_ids, '{}')) x
    on conflict (event_id, user_id) do nothing;
  else
    delete from event_assignments where event_id = p_event;
  end if;

  return p_event;
end;
$$;
