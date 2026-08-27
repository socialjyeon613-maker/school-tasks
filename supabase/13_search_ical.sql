-- ============================================================
-- 학교 업무관리 시스템 — 13. 검색 + 캘린더 구독 (요구사항 5-3)
-- 01~12 를 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   1) 검색 — 일정 · 첨부 파일명 · 학생 이름을 한 번에.
--      학생은 볼 수 있는 반만 나옵니다.
--   2) iCal 구독 — 개인 폰 캘린더에 학사일정을 자동으로 띄웁니다.
--      캘린더 앱은 로그인을 할 수 없으므로 사람마다 비밀 토큰을 줍니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 통합 검색
--    security definer 가 아니라 invoker 입니다 — 그래야 학생 조회에
--    RLS 가 그대로 걸려, 담임은 자기 반 학생만 찾습니다.
-- ------------------------------------------------------------

create or replace function public.search_school(p_school uuid, p_q text)
returns table (
  kind text,        -- event · attachment · student
  id uuid,
  title text,
  subtitle text,
  link text,
  on_date date
)
language sql stable
set search_path = public
as $$
  /*
    종류마다 따로 20건씩 뽑아 합칩니다.
    하나로 묶어 정렬하면 날짜가 없는 학생이 맨 뒤로 밀려,
    일정이 많은 학교에서는 학생이 아예 안 나옵니다.
  */
  with q as (select '%' || trim(p_q) || '%' as like),
  ev as (
    select 'event'::text as kind, e.id, e.title,
           coalesce(nullif(e.location, ''), to_char(e.start_date, 'MM/DD')) as subtitle,
           '/schools/' || e.school_id || '/events/' || e.id as link,
           e.start_date as on_date
    from events e, q
    where e.school_id = p_school
      and (e.title ilike q.like or e.location ilike q.like or e.description ilike q.like)
    order by e.start_date desc
    limit 20
  ),
  att as (
    select 'attachment'::text, a.event_id, a.file_name, e.title,
           '/schools/' || e.school_id || '/events/' || e.id, e.start_date
    from event_attachments a
    join events e on e.id = a.event_id, q
    where e.school_id = p_school and a.file_name ilike q.like
    order by e.start_date desc
    limit 20
  ),
  st as (
    select 'student'::text, s.id, s.name,
           c.name || ' ' || s.number || '번',
           '/schools/' || s.school_id || '/search?q=' || s.name,
           null::date
    from students s
    join classrooms c on c.id = s.classroom_id, q
    where s.school_id = p_school and s.status = 'enrolled' and s.name ilike q.like
    order by c.class_no, s.number
    limit 20
  )
  select * from ev
  union all select * from att
  union all select * from st;
$$;

-- ------------------------------------------------------------
-- 2. 캘린더 구독 토큰
--    사람 · 학교마다 하나. 유출되면 재발급하면 됩니다.
-- ------------------------------------------------------------

create table if not exists public.calendar_tokens (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_id, user_id)
);

alter table public.calendar_tokens enable row level security;

create policy "calendar_tokens_own" on public.calendar_tokens
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 내 토큰을 만들거나 가져옵니다.
create or replace function public.my_calendar_token(p_school uuid, p_reset boolean default false)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.is_school_member(p_school) then
    raise exception 'FORBIDDEN';
  end if;

  if p_reset then
    delete from calendar_tokens where school_id = p_school and user_id = auth.uid();
  end if;

  select token into v_token from calendar_tokens
  where school_id = p_school and user_id = auth.uid();

  if v_token is null then
    insert into calendar_tokens (school_id, user_id)
    values (p_school, auth.uid())
    returning token into v_token;
  end if;

  return v_token;
end;
$$;

/*
  토큰으로 일정 읽기.

  캘린더 앱은 로그인을 못 하므로 anon 으로 들어옵니다.
  그래서 security definer 로 두되, 토큰이 가리키는 사람이 볼 수 있는
  범위(그 사람의 학교 · 학년도)만 돌려줍니다.
  학생 개인정보는 한 줄도 나가지 않습니다 — 일정 제목과 시간뿐입니다.
*/
create or replace function public.calendar_feed(p_token text)
returns table (
  id uuid,
  title text,
  start_date date,
  end_date date,
  all_day boolean,
  starts_at time,
  ends_at time,
  location text,
  event_type text,
  mine boolean
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_user uuid;
  v_year uuid;
begin
  select t.school_id, t.user_id into v_school, v_user
  from calendar_tokens t where t.token = p_token;

  if v_school is null then
    return;                       -- 잘못된 토큰이면 빈 달력
  end if;

  select y.id into v_year from academic_years y
  where y.school_id = v_school and y.is_current;

  return query
  select
    e.id, e.title, e.start_date, e.end_date, e.all_day,
    -- 교시가 있으면 그 교시의 실제 시각으로 바꿔 줍니다.
    (select p.starts_at from periods p
      where p.academic_year_id = e.academic_year_id and p.no = e.period_from),
    (select p.ends_at from periods p
      where p.academic_year_id = e.academic_year_id and p.no = e.period_to),
    e.location, e.event_type,
    -- 나에게 배정됐거나 내 반/학년 일정인지
    exists (select 1 from event_assignments a
            where a.event_id = e.id and a.user_id = v_user)
    or exists (
      select 1 from event_targets t
      join staff_roles r on r.user_id = v_user
                        and (r.grade_id = t.grade_id or r.classroom_id = t.classroom_id
                             or r.department_id = t.department_id)
      where t.event_id = e.id
    )
  from events e
  where e.academic_year_id = v_year
    and e.deleted_at is null
    and e.status <> 'canceled'
    and e.start_date >= current_date - 60
  order by e.start_date;
end;
$$;

-- 캘린더 앱은 로그인하지 않으므로 anon 도 이 함수만은 부를 수 있어야 합니다.
grant execute on function public.calendar_feed(text) to anon;
