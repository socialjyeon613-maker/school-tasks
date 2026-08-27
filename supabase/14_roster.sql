-- ============================================================
-- 학교 업무관리 시스템 — 14. 진행 명단
-- 01~13 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   "2027 과학고 진학" 처럼 반을 가로질러 학생을 골라 담고,
--   준비 → 서류제출 → 면접 → 합격 처럼 일감마다 다른 단계로 관리합니다.
--
--   참여 체크(participations)와는 다릅니다.
--     참여 체크 : 대상 반에서 학생이 자동으로 나옴 · 3단계 고정 · 날짜별
--     진행 명단 : 손으로 골라 담음 · 단계는 일감마다 다름 · 단계 이동 이력
--
--   공개 범위 (roster_visibility)
--     'assignees' (기본) — 담당자 · 부장 · 관리자만 명단 전체를 봅니다.
--                          담임은 자기 반 학생 행만 보입니다.
--     'school'          — 그 학교 교직원 전체가 명단을 봅니다.
--   진학 정보는 민감하므로 기본은 좁게 두고, 필요할 때만 넓힙니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

alter table public.events
  add column if not exists roster_visibility text not null default 'assignees'
  check (roster_visibility in ('assignees', 'school'));

-- 이 일감에서 쓸 단계
create table if not exists public.event_stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  position double precision not null,
  name text not null,
  -- active: 진행중 / success: 좋게 끝남(합격) / fail: 아쉽게 끝남(불합격·포기)
  kind text not null default 'active' check (kind in ('active', 'success', 'fail')),
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create index if not exists idx_stages_event on public.event_stages (event_id, position);

-- 손으로 고른 명단 + 현재 단계
create table if not exists public.event_roster (
  event_id uuid not null references public.events (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  stage_id uuid references public.event_stages (id) on delete set null,
  note text not null default '',
  added_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (event_id, student_id)
);

create index if not exists idx_roster_event on public.event_roster (event_id);
create index if not exists idx_roster_student on public.event_roster (student_id);

-- 언제 어느 단계로 넘어갔는지 — "면접이 12/13 이었지" 를 나중에 찾습니다
create table if not exists public.event_roster_history (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  from_stage text,
  to_stage text,
  note text not null default '',
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_roster_history
  on public.event_roster_history (event_id, student_id, changed_at);

-- 단계 묶음 템플릿 — 과학고 · 자사고는 해마다 반복됩니다
create table if not exists public.stage_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  stages jsonb not null,            -- [{name, kind}, ...]
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

-- ------------------------------------------------------------
-- 2. 권한
-- ------------------------------------------------------------

-- 명단을 고칠 수 있는가 — 일정 편집권자 또는 이 일감의 담당자
create or replace function public.can_manage_roster(p_event uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.can_edit_event(p_event)
      or exists (
        select 1 from event_assignments a
        where a.event_id = p_event and a.user_id = auth.uid()
      );
$$;

-- 이 학생 행을 볼 수 있는가
create or replace function public.can_view_roster_row(p_event uuid, p_student uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select
    -- 담당자 · 부장 · 관리자
    public.can_manage_roster(p_event)
    -- 공개 범위를 학교 전체로 열어 둔 일감
    or exists (
      select 1 from events e
      where e.id = p_event
        and e.roster_visibility = 'school'
        and public.is_school_member(e.school_id)
    )
    -- 담임은 자기 반 학생 행만
    or exists (
      select 1 from students s
      where s.id = p_student and public.can_view_classroom(s.classroom_id)
    );
$$;

alter table public.event_stages enable row level security;
alter table public.event_roster enable row level security;
alter table public.event_roster_history enable row level security;
alter table public.stage_templates enable row level security;

-- 단계 정의는 학교 구성원 모두가 봅니다 (이름만 있고 학생 정보가 없습니다)
create policy "stages_select" on public.event_stages
  for select to authenticated
  using (exists (select 1 from events e
                 where e.id = event_id and public.is_school_member(e.school_id)));
create policy "stages_write" on public.event_stages
  for all to authenticated
  using (public.can_manage_roster(event_id))
  with check (public.can_manage_roster(event_id));

create policy "roster_select" on public.event_roster
  for select to authenticated using (public.can_view_roster_row(event_id, student_id));
create policy "roster_write" on public.event_roster
  for all to authenticated
  using (public.can_manage_roster(event_id))
  with check (public.can_manage_roster(event_id));

create policy "roster_history_select" on public.event_roster_history
  for select to authenticated using (public.can_view_roster_row(event_id, student_id));

create policy "templates_select" on public.stage_templates
  for select to authenticated using (public.is_school_member(school_id));
create policy "templates_write" on public.stage_templates
  for all to authenticated
  using (public.is_school_admin(school_id) or public.is_head(school_id))
  with check (public.is_school_admin(school_id) or public.is_head(school_id));

-- ------------------------------------------------------------
-- 3. 단계 정의
-- ------------------------------------------------------------

-- p_stages 예: '[{"name":"준비","kind":"active"},{"name":"합격","kind":"success"}]'
-- 이름이 같은 단계는 그대로 두어 학생들의 현재 단계가 유지됩니다.
create or replace function public.set_event_stages(p_event uuid, p_stages jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r jsonb;
  i int := 0;
  v_keep text[] := '{}';
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  for r in select * from jsonb_array_elements(p_stages) loop
    i := i + 1;
    v_keep := v_keep || (r ->> 'name');

    insert into event_stages (event_id, position, name, kind)
    values (p_event, i, trim(r ->> 'name'),
            coalesce(nullif(r ->> 'kind', ''), 'active'))
    on conflict (event_id, name)
      do update set position = excluded.position, kind = excluded.kind;
  end loop;

  -- 빠진 단계에 있던 학생은 단계 없음으로 남습니다 (명단에서 사라지지 않게)
  delete from event_stages
  where event_id = p_event and name <> all (v_keep);

  return i;
end;
$$;

-- ------------------------------------------------------------
-- 4. 명단 읽기
--    students 는 반 단위로 잠겨 있어 그냥 조인하면 다른 반 학생이 안 나옵니다.
--    그래서 definer 로 두되 행마다 볼 수 있는지 직접 검사합니다.
-- ------------------------------------------------------------

create or replace function public.event_roster_list(p_event uuid)
returns table (
  student_id uuid,
  student_name text,
  classroom_name text,
  class_no int,
  student_no int,
  stage_id uuid,
  stage_name text,
  stage_kind text,
  stage_position double precision,
  note text,
  updated_at timestamptz,
  can_edit boolean
)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_manage boolean;
  v_open boolean;
begin
  select e.school_id, e.roster_visibility = 'school'
    into v_school, v_open
  from events e where e.id = p_event;

  if v_school is null or not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  v_manage := public.can_manage_roster(p_event);

  return query
  select
    s.id, s.name, c.name, c.class_no, s.number,
    st.id, st.name, st.kind, st.position,
    r.note, r.updated_at,
    v_manage
  from event_roster r
  join students s on s.id = r.student_id
  join classrooms c on c.id = s.classroom_id
  left join event_stages st on st.id = r.stage_id
  where r.event_id = p_event
    and (v_manage or v_open or public.can_view_classroom(s.classroom_id))
  order by st.position nulls last, c.class_no, s.number;
end;
$$;

-- 단계별 인원 — 명단을 못 보는 사람도 숫자는 볼 수 있게 (학생 정보 없음)
create or replace function public.event_roster_summary(p_event uuid)
returns table (
  stage_id uuid,
  stage_name text,
  stage_kind text,
  stage_position double precision,
  count int
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
  select st.id, st.name, st.kind, st.position,
         (select count(*)::int from event_roster r
           where r.event_id = p_event and r.stage_id = st.id)
  from event_stages st
  where st.event_id = p_event
  order by st.position;
end;
$$;

-- ------------------------------------------------------------
-- 5. 명단 고치기
-- ------------------------------------------------------------

create or replace function public.add_roster_students(p_event uuid, p_students uuid[])
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_first uuid;
  v_count int;
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  -- 처음 단계로 넣습니다
  select id into v_first from event_stages
  where event_id = p_event order by position limit 1;

  insert into event_roster (event_id, student_id, stage_id, added_by, updated_by)
  select p_event, x, v_first, auth.uid(), auth.uid()
  from unnest(coalesce(p_students, '{}')) x
  on conflict (event_id, student_id) do nothing;

  get diagnostics v_count = row_count;

  insert into event_roster_history (event_id, student_id, from_stage, to_stage, changed_by)
  select p_event, x, null,
         (select name from event_stages where id = v_first),
         auth.uid()
  from unnest(coalesce(p_students, '{}')) x;

  return v_count;
end;
$$;

-- 여러 명을 한 번에 옮깁니다 — "오늘 서류 낸 5명" 이 실제 사용 방식입니다
create or replace function public.set_roster_stage(
  p_event uuid,
  p_students uuid[],
  p_stage uuid,
  p_note text default null
)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
  v_to text;
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;
  if p_stage is not null and not exists (
    select 1 from event_stages where id = p_stage and event_id = p_event
  ) then
    raise exception 'STAGE_NOT_IN_EVENT';
  end if;

  select name into v_to from event_stages where id = p_stage;

  insert into event_roster_history (event_id, student_id, from_stage, to_stage, note, changed_by)
  select p_event, r.student_id,
         (select name from event_stages where id = r.stage_id),
         v_to, coalesce(p_note, ''), auth.uid()
  from event_roster r
  where r.event_id = p_event
    and r.student_id = any (p_students)
    and r.stage_id is distinct from p_stage;

  update event_roster r
     set stage_id = p_stage,
         note = coalesce(nullif(p_note, ''), r.note),
         updated_by = auth.uid(),
         updated_at = now()
   where r.event_id = p_event and r.student_id = any (p_students);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.remove_roster_students(p_event uuid, p_students uuid[])
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  delete from event_roster
  where event_id = p_event and student_id = any (p_students);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 공개 범위 바꾸기 — 넓히는 결정이라 부장 · 관리자만
create or replace function public.set_roster_visibility(p_event uuid, p_mode text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from events where id = p_event;
  if v_school is null then
    raise exception 'NOT_FOUND';
  end if;
  if not (public.is_head(v_school) or public.is_school_admin(v_school)) then
    raise exception 'FORBIDDEN';
  end if;
  if p_mode not in ('assignees', 'school') then
    raise exception 'INVALID_MODE';
  end if;

  update events set roster_visibility = p_mode where id = p_event;
end;
$$;

-- ------------------------------------------------------------
-- 6. 단계 이동 이력
-- ------------------------------------------------------------

create or replace function public.roster_history(p_event uuid, p_student uuid)
returns table (
  from_stage text,
  to_stage text,
  note text,
  changed_at timestamptz,
  changed_by_name text
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not public.can_view_roster_row(p_event, p_student) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select h.from_stage, h.to_stage, h.note, h.changed_at, p.name
  from event_roster_history h
  left join profiles p on p.id = h.changed_by
  where h.event_id = p_event and h.student_id = p_student
  order by h.changed_at;
end;
$$;
