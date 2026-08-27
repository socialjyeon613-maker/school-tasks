-- ============================================================
-- 학교 업무관리 시스템 — 06. 날짜별 출석 + '내 반' 구분
-- 01~05 를 이미 실행한 프로젝트에 추가로 실행하세요.
--
--  1) 여러 날에 걸친 일정에서 '매일 출석 체크' 여부를 고를 수 있게
--     - 끄면(기본): 한 번 체크하면 그 일정 전체에 적용
--     - 켜면:        날짜마다 따로 체크 (수련회 · 캠프 · 방과후 강좌)
--  2) event_classroom_status 가 '담임인 반'과 '편집 가능한 반'을 구분해 반환
--     (학년부장은 학년 전체를 편집할 수 있지만 담임인 반은 따로입니다)
-- ============================================================

-- ------------------------------------------------------------
-- 1. 스키마 변경
-- ------------------------------------------------------------

alter table public.events
  add column if not exists daily_participation boolean not null default false;

comment on column public.events.daily_participation is
  '여러 날 일정에서 날짜마다 출석을 따로 받을지. false 면 일정 전체에 한 번.';

-- 참여 기록에 날짜 축을 추가합니다.
alter table public.participations
  add column if not exists on_date date;

-- 기존 기록은 일정 시작일로 채웁니다.
update public.participations p
   set on_date = e.start_date
  from public.events e
 where e.id = p.event_id
   and p.on_date is null;

alter table public.participations alter column on_date set not null;

-- 기본키를 (일정, 학생, 날짜) 로 확장
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'participations_pkey' and conrelid = 'public.participations'::regclass
  ) then
    alter table public.participations drop constraint participations_pkey;
  end if;
end;
$$;

alter table public.participations
  add constraint participations_pkey primary key (event_id, student_id, on_date);

create index if not exists idx_participations_event_date
  on public.participations (event_id, on_date, classroom_id);

-- on_date 가 비면 일정 시작일로 채웁니다.
create or replace function public.fill_participation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select classroom_id into new.classroom_id from students where id = new.student_id;
  if new.classroom_id is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;

  if new.on_date is null then
    select start_date into new.on_date from events where id = new.event_id;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. 이 일정에서 출석을 받아야 하는 날짜들
--    매일 체크가 아니면 시작일 하루뿐입니다.
-- ------------------------------------------------------------

-- 집합 반환 함수는 CASE 안에 못 쓰므로 분기해서 돌려줍니다.
create or replace function public.event_dates(p_event uuid)
returns setof date
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_daily boolean;
begin
  select start_date, end_date, daily_participation
    into v_start, v_end, v_daily
  from events where id = p_event;

  if v_start is null then
    return;
  end if;

  if v_daily then
    return query
      select generate_series(v_start, v_end, interval '1 day')::date;
  else
    return query select v_start;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. 반별 집계 — 날짜 지정 + 담임 여부 구분
-- ------------------------------------------------------------

drop function if exists public.event_classroom_status(uuid);

create or replace function public.event_classroom_status(
  p_event uuid,
  p_on_date date default null
)
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
  can_edit boolean,      -- 입력을 고칠 수 있는가 (담임 · 학년부장 · 관리자)
  is_homeroom boolean    -- 내가 담임인 반인가 ('내 반' 표시는 이걸로)
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_date date;
begin
  select e.school_id, coalesce(p_on_date, e.start_date)
    into v_school, v_date
  from events e where e.id = p_event;

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
    public.can_manage_classroom(c.id),
    exists (
      select 1 from staff_roles r
      where r.user_id = auth.uid()
        and r.classroom_id = c.id
        and r.role in ('homeroom', 'co_homeroom')
    )
  from v_event_classrooms ec
  join classrooms c on c.id = ec.classroom_id
  join students s on s.classroom_id = c.id and s.status = 'enrolled'
  left join participations p
    on p.event_id = p_event and p.student_id = s.id and p.on_date = v_date
  where ec.event_id = p_event
  group by c.id, c.name, c.class_no, c.grade_id
  order by c.class_no;
end;
$$;

-- 날짜별 진행 상황 — 매일 체크 일정의 날짜 탭에 씁니다.
create or replace function public.event_daily_summary(p_event uuid)
returns table (
  on_date date,
  total int,
  attended int,
  absent int,
  pending int,
  is_complete boolean
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
    d.d,
    count(s.id)::int,
    (count(s.id) filter (where p.status = 'attended'))::int,
    (count(s.id) filter (where p.status = 'absent'))::int,
    (count(s.id) filter (where coalesce(p.status, 'pending') = 'pending'))::int,
    (count(s.id) filter (where coalesce(p.status, 'pending') = 'pending')) = 0
  from public.event_dates(p_event) d(d)
  join v_event_classrooms ec on ec.event_id = p_event
  join students s on s.classroom_id = ec.classroom_id and s.status = 'enrolled'
  left join participations p
    on p.event_id = p_event and p.student_id = s.id and p.on_date = d.d
  group by d.d
  order by d.d;
end;
$$;

-- ------------------------------------------------------------
-- 4. 입력 RPC — 날짜 인자 추가
-- ------------------------------------------------------------

drop function if exists public.set_participation(uuid, uuid, text, text);

create or replace function public.set_participation(
  p_event uuid,
  p_student uuid,
  p_status text,
  p_reason text default '',
  p_on_date date default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_classroom uuid;
  v_date date;
begin
  select classroom_id into v_classroom from students where id = p_student;
  if v_classroom is null then
    raise exception 'STUDENT_NOT_FOUND';
  end if;
  if not public.can_manage_classroom(v_classroom) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending', 'attended', 'absent') then
    raise exception 'INVALID_STATUS';
  end if;

  select coalesce(p_on_date, start_date) into v_date from events where id = p_event;

  insert into participations (event_id, student_id, classroom_id, on_date, status, reason)
  values (p_event, p_student, v_classroom, v_date, p_status, coalesce(p_reason, ''))
  on conflict (event_id, student_id, on_date)
    do update set status = excluded.status, reason = excluded.reason;
end;
$$;

drop function if exists public.set_classroom_participation(uuid, uuid, text, boolean);

-- p_all_dates = true 면 매일 체크 일정의 '모든 날짜'에 한 번에 적용합니다.
-- (수련회 3일을 전원 참석으로 깔고 빠지는 날만 고치는 흐름)
create or replace function public.set_classroom_participation(
  p_event uuid,
  p_classroom uuid,
  p_status text default 'attended',
  p_overwrite boolean default true,
  p_on_date date default null,
  p_all_dates boolean default false
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not public.can_manage_classroom(p_classroom) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('pending', 'attended', 'absent') then
    raise exception 'INVALID_STATUS';
  end if;

  insert into participations (event_id, student_id, classroom_id, on_date, status)
  select p_event, s.id, s.classroom_id, d.d, p_status
  from students s
  cross join lateral (
    select d from public.event_dates(p_event) d
    where p_all_dates
       or d = coalesce(p_on_date, (select start_date from events where id = p_event))
  ) d
  where s.classroom_id = p_classroom and s.status = 'enrolled'
  on conflict (event_id, student_id, on_date) do update
    set status = case
                   when p_overwrite then excluded.status
                   when participations.status = 'pending' then excluded.status
                   else participations.status
                 end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.save_participations(uuid, jsonb);

create or replace function public.save_participations(
  p_event uuid,
  p_rows jsonb,
  p_on_date date default null
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_count int := 0;
begin
  for v_row in select * from jsonb_array_elements(p_rows) loop
    perform public.set_participation(
      p_event,
      (v_row ->> 'student_id')::uuid,
      v_row ->> 'status',
      coalesce(v_row ->> 'reason', ''),
      p_on_date
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 5. 불참자 명단 — 날짜 포함
-- ------------------------------------------------------------

drop view if exists public.v_absentees;

create view public.v_absentees
with (security_invoker = true) as
select
  es.event_id,
  p.on_date,
  es.classroom_id,
  c.name as classroom_name,
  count(*)::int as absent_count,
  string_agg(es.name, ', ' order by es.number) as names
from v_event_students es
join classrooms c on c.id = es.classroom_id
join participations p
  on p.event_id = es.event_id and p.student_id = es.student_id
where p.status = 'absent'
group by es.event_id, p.on_date, es.classroom_id, c.name;

-- ------------------------------------------------------------
-- 6. create_event / update_event 에 daily_participation 추가
--
--   ※ create or replace 는 인자 목록이 다르면 '교체'가 아니라 '새 함수'를
--     만듭니다. 인자를 하나 늘렸으므로 예전 버전을 먼저 지우지 않으면
--     두 함수가 공존해 호출이 모호해집니다(42725).
-- ------------------------------------------------------------

drop function if exists public.create_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz
);

drop function if exists public.update_event(
  uuid, text, date, date, uuid, text, boolean, int, int, time, text, boolean,
  uuid[], uuid[], uuid[], timestamptz
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
  p_daily_participation boolean default false
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
    p_all_day,
    case when p_all_day then null else p_period_from end,
    case when p_all_day then null else coalesce(p_period_to, p_period_from) end,
    p_start_time, coalesce(p_location, ''), p_requires_participation,
    -- 하루짜리 일정에는 '매일 체크'가 의미 없습니다.
    p_daily_participation and coalesce(p_end_date, p_start_date) > p_start_date,
    p_due_at, auth.uid(), auth.uid()
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
  p_daily_participation boolean default false
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
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
    all_day                = p_all_day,
    period_from            = case when p_all_day then null else p_period_from end,
    period_to              = case when p_all_day then null
                                  else coalesce(p_period_to, p_period_from) end,
    start_time             = p_start_time,
    location               = coalesce(p_location, ''),
    requires_participation = p_requires_participation,
    daily_participation    = p_daily_participation
                             and coalesce(p_end_date, p_start_date) > p_start_date,
    due_at                 = p_due_at
  where id = p_event;

  delete from event_targets where event_id = p_event;

  insert into event_targets (event_id, classroom_id)
  select p_event, x from unnest(coalesce(p_classroom_ids, '{}')) x;
  insert into event_targets (event_id, grade_id)
  select p_event, x from unnest(coalesce(p_grade_ids, '{}')) x;
  insert into event_targets (event_id, department_id)
  select p_event, x from unnest(coalesce(p_department_ids, '{}')) x;

  return p_event;
end;
$$;
