-- ============================================================
-- 학교 업무관리 시스템 — 02. 일정 (교시 · 분류 · 대상 · 담당배정)
-- 01_schema.sql 실행 후에 실행하세요.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

-- 교시 정의 — 이 시스템의 시간 단위는 '시:분' 이 아니라 '교시' 입니다.
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  no int not null check (no between 1 and 12),
  name text not null default '',           -- '1교시'
  starts_at time,
  ends_at time,
  unique (academic_year_id, no)
);

-- 일정 분류 = 색상. 일정표의 가독성이 곧 이 문서의 가치입니다.
--   lane 'grid' : 날짜 × 교시 본 그리드에 표시
--   lane 'side' : 그리드 밖 우측 별도 열 (스샷의 '고입 전형 일정')
create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  color text not null default 'slate',
  lane text not null default 'grid' check (lane in ('grid', 'side')),
  position double precision not null default 0,
  unique (academic_year_id, name)
);

-- 일정
create table public.events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  category_id uuid references public.event_categories (id) on delete set null,

  title text not null,
  description text not null default '',

  -- 'academic' 학사일정 : 언제 무엇이 있다 (공지 성격)
  -- 'task'     업무일정 : 누가 언제까지 무엇을 한다 (담당자 · 마감 · 개별상태)
  event_type text not null default 'academic' check (event_type in ('academic', 'task')),

  start_date date not null,
  end_date date not null,                  -- 하루짜리면 start_date 와 같게
  all_day boolean not null default true,   -- true면 교시 전체 (스샷의 '에듀투어')
  period_from int check (period_from between 1 and 12),
  period_to int check (period_to between 1 and 12),

  start_time time,                         -- 실제 집합/시작 시각 ('11:30')
  location text not null default '',       -- '한성아트홀', '가양 롯데시네마'
  note text not null default '',

  status text not null default 'planned'
    check (status in ('planned', 'ongoing', 'done', 'canceled')),

  -- 학생 참여 체크 대상 여부. true 면 03_participation.sql 의 흐름이 열립니다.
  requires_participation boolean not null default false,

  due_at timestamptz,                      -- event_type='task' 의 마감
  owner_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_date_order check (end_date >= start_date),
  constraint events_period_order check (
    period_from is null or period_to is null or period_to >= period_from
  ),
  -- 종일이 아니면 교시를 반드시 지정
  constraint events_period_required check (all_day or period_from is not null)
);

-- 일정 대상 — 다대다.
--   ※ 이 일정에 대상 행이 하나도 없으면 '전교 대상' 입니다.
--   스샷의 '경제배움터(1~5반)', '마약예방교육(4,5,6반)' 처럼 자유롭게 묶입니다.
create table public.event_targets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  grade_id uuid references public.grades (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  constraint event_targets_one_scope
    check (num_nonnulls(grade_id, classroom_id, department_id, user_id) = 1)
);

-- 교사 업무 배정 + 개별 진행 상태
--   일정 하나에 상태 하나면 쓸모가 없습니다.
--   "3학년 담임 12명이 각자 제출" → 일정 1개, 이 행 12개.
create table public.event_assignments (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done', 'rejected')),
  due_at timestamptz,
  submitted_at timestamptz,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 댓글
create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 첨부 (파일 / 링크). 파일은 Supabase Storage 버킷 'attachments' 사용.
-- 학교 문서는 대부분 한글(.hwp/.hwpx)입니다.
create table public.event_attachments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null default 'file' check (kind in ('file', 'link')),
  file_path text,                          -- storage 경로
  url text,                                -- kind='link'
  file_name text not null default '',
  file_size bigint,
  mime_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attachment_shape check (
    (kind = 'file' and file_path is not null) or (kind = 'link' and url is not null)
  )
);

create index idx_periods_year on public.periods (academic_year_id);
create index idx_categories_year on public.event_categories (academic_year_id);
create index idx_events_year_date on public.events (academic_year_id, start_date);
create index idx_events_school on public.events (school_id);
create index idx_events_participation
  on public.events (academic_year_id) where requires_participation;
create index idx_event_targets_event on public.event_targets (event_id);
create index idx_event_targets_classroom on public.event_targets (classroom_id);
create index idx_event_targets_grade on public.event_targets (grade_id);
create index idx_event_targets_user on public.event_targets (user_id);
create index idx_assignments_user on public.event_assignments (user_id);
create index idx_comments_event on public.event_comments (event_id);
create index idx_attachments_event on public.event_attachments (event_id);

-- ------------------------------------------------------------
-- 2. updated_at 자동 갱신
-- ------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_events_touch
  before update on public.events
  for each row execute function public.touch_updated_at();

create trigger trg_assignments_touch
  before update on public.event_assignments
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 3. 권한 헬퍼
-- ------------------------------------------------------------

-- 일정을 수정할 수 있는가 — 작성자 / 담당자 / 부장 / 관리자
create or replace function public.can_edit_event(p_event uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from events e
    where e.id = p_event
      and (
        e.created_by = auth.uid()
        or e.owner_id = auth.uid()
        or public.is_school_admin(e.school_id)
        or public.is_head(e.school_id)
      )
  );
$$;

-- 이 일정이 나에게 해당되는가 ('내 할 일' 필터용)
--   대상 행이 없으면 전교 대상 → 모두 해당
create or replace function public.is_my_event(p_event uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select not exists (select 1 from event_targets t where t.event_id = p_event)
      or exists (
        select 1 from event_targets t
        where t.event_id = p_event
          and (
            t.user_id = auth.uid()
            or exists (select 1 from staff_roles r
                       where r.user_id = auth.uid() and r.department_id = t.department_id)
            or exists (select 1 from staff_roles r
                       where r.user_id = auth.uid() and r.grade_id = t.grade_id)
            or exists (select 1 from staff_roles r
                       where r.user_id = auth.uid() and r.classroom_id = t.classroom_id)
            -- 학년 대상 일정은 그 학년의 담임에게도 해당
            or exists (select 1 from staff_roles r
                       join classrooms c on c.id = r.classroom_id
                       where r.user_id = auth.uid() and c.grade_id = t.grade_id)
          )
      )
      or exists (select 1 from event_assignments a
                 where a.event_id = p_event and a.user_id = auth.uid());
$$;

-- ------------------------------------------------------------
-- 4. RLS 정책
--   학사일정표는 교직원 모두가 보는 문서이므로 조회는 학교 구성원 전체에게 엽니다.
--   (학생 개인정보가 걸린 곳은 students / participations 쪽입니다.)
-- ------------------------------------------------------------

alter table public.periods enable row level security;
alter table public.event_categories enable row level security;
alter table public.events enable row level security;
alter table public.event_targets enable row level security;
alter table public.event_assignments enable row level security;
alter table public.event_comments enable row level security;
alter table public.event_attachments enable row level security;

create policy "periods_select" on public.periods
  for select to authenticated using (public.is_school_member(school_id));
create policy "periods_write" on public.periods
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "categories_select" on public.event_categories
  for select to authenticated using (public.is_school_member(school_id));
create policy "categories_write" on public.event_categories
  for all to authenticated
  using (public.is_school_admin(school_id) or public.is_head(school_id))
  with check (public.is_school_admin(school_id) or public.is_head(school_id));

-- 일정: 구성원 전체 조회 / 부장 · 관리자가 등록 / 작성자 · 담당자 · 부장 · 관리자가 수정
create policy "events_select" on public.events
  for select to authenticated using (public.is_school_member(school_id));
create policy "events_insert" on public.events
  for insert to authenticated
  with check (
    (public.is_school_admin(school_id) or public.is_head(school_id))
    and created_by = auth.uid()
  );
create policy "events_update" on public.events
  for update to authenticated
  using (public.can_edit_event(id))
  with check (public.can_edit_event(id));
create policy "events_delete" on public.events
  for delete to authenticated using (public.can_edit_event(id));

create policy "event_targets_select" on public.event_targets
  for select to authenticated
  using (exists (select 1 from events e
                 where e.id = event_id and public.is_school_member(e.school_id)));
create policy "event_targets_write" on public.event_targets
  for all to authenticated
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

-- 배정: 구성원 조회(누가 아직 안 냈는지 서로 보임) / 부장·관리자가 배정
--       본인 배정의 상태는 본인이 갱신
create policy "assignments_select" on public.event_assignments
  for select to authenticated
  using (exists (select 1 from events e
                 where e.id = event_id and public.is_school_member(e.school_id)));
create policy "assignments_insert" on public.event_assignments
  for insert to authenticated with check (public.can_edit_event(event_id));
create policy "assignments_delete" on public.event_assignments
  for delete to authenticated using (public.can_edit_event(event_id));
create policy "assignments_update" on public.event_assignments
  for update to authenticated
  using (user_id = auth.uid() or public.can_edit_event(event_id))
  with check (user_id = auth.uid() or public.can_edit_event(event_id));

-- 댓글: 구성원 조회 · 작성, 본인 것만 수정 · 삭제
create policy "event_comments_select" on public.event_comments
  for select to authenticated
  using (exists (select 1 from events e
                 where e.id = event_id and public.is_school_member(e.school_id)));
create policy "event_comments_insert" on public.event_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from events e
                where e.id = event_id and public.is_school_member(e.school_id))
  );
create policy "event_comments_update" on public.event_comments
  for update to authenticated using (user_id = auth.uid());
create policy "event_comments_delete" on public.event_comments
  for delete to authenticated using (user_id = auth.uid());

-- 첨부: 구성원 조회 · 업로드, 올린 사람 또는 일정 편집 권한자가 삭제
create policy "event_attachments_select" on public.event_attachments
  for select to authenticated
  using (exists (select 1 from events e
                 where e.id = event_id and public.is_school_member(e.school_id)));
create policy "event_attachments_insert" on public.event_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from events e
                where e.id = event_id and public.is_school_member(e.school_id))
  );
create policy "event_attachments_delete" on public.event_attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_edit_event(event_id));

-- ------------------------------------------------------------
-- 5. 뷰
-- ------------------------------------------------------------

-- 대상 표시용 라벨 — '1-3,5반' 처럼 압축해서 보여주기 위한 원재료
create view public.v_event_target_labels
with (security_invoker = true) as
select
  e.id as event_id,
  coalesce(
    nullif(string_agg(distinct coalesce(c.name, g.name, d.name, p.name), ', '), ''),
    '전교'
  ) as target_label,
  count(*) filter (where t.classroom_id is not null) as classroom_count
from events e
left join event_targets t on t.event_id = e.id
left join classrooms c on c.id = t.classroom_id
left join grades g on g.id = t.grade_id
left join departments d on d.id = t.department_id
left join profiles p on p.id = t.user_id
group by e.id;

-- 날짜 × 교시 그리드 렌더링용 — 기간 일정을 날짜별로 펼칩니다.
create view public.v_events_by_date
with (security_invoker = true) as
select
  e.id as event_id,
  e.school_id,
  e.academic_year_id,
  d::date as on_date,
  e.title,
  e.event_type,
  e.all_day,
  e.period_from,
  e.period_to,
  e.start_time,
  e.location,
  e.status,
  e.requires_participation,
  c.name as category_name,
  c.color as category_color,
  c.lane as category_lane
from events e
left join event_categories c on c.id = e.category_id
cross join lateral generate_series(e.start_date, e.end_date, interval '1 day') d;

-- 일정 → 대상 반 전개.
--   '3학년 전체' 처럼 학년으로 지정한 일정도 반 단위로 풀어줍니다.
--   대상 행이 없으면 전교 → 모든 반.
--   충돌 감지와 참여 대상 학생 산출이 모두 이 뷰를 씁니다.
create view public.v_event_classrooms
with (security_invoker = true) as
select e.id as event_id, c.id as classroom_id
from events e
join classrooms c on c.academic_year_id = e.academic_year_id
where not exists (
        select 1 from event_targets t
        where t.event_id = e.id
          and (t.classroom_id is not null or t.grade_id is not null)
      )
   or exists (select 1 from event_targets t where t.event_id = e.id and t.classroom_id = c.id)
   or exists (select 1 from event_targets t where t.event_id = e.id and t.grade_id = c.grade_id);

-- 부장 현황판 — 업무 일정의 담당자별 완료 집계
create view public.v_assignment_progress
with (security_invoker = true) as
select
  e.id as event_id,
  e.title,
  e.due_at,
  count(a.user_id)::int as assigned,
  (count(a.user_id) filter (where a.status = 'done'))::int as done,
  (count(a.user_id) filter (where a.status <> 'done'))::int as remaining
from events e
join event_assignments a on a.event_id = e.id
group by e.id, e.title, e.due_at;

-- ------------------------------------------------------------
-- 6. RPC — 일정 등록 (대상 지정까지 한 번에)
-- ------------------------------------------------------------

-- p_classroom_ids / p_grade_ids / p_department_ids 가 모두 비면 '전교 대상'
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
  p_due_at timestamptz default null      -- event_type='task' 의 마감
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
  if not (public.is_school_admin(v_school) or public.is_head(v_school)) then
    raise exception 'FORBIDDEN';
  end if;

  insert into events (
    school_id, academic_year_id, category_id, title, event_type,
    start_date, end_date, all_day, period_from, period_to,
    start_time, location, requires_participation, due_at, created_by, owner_id
  ) values (
    v_school, p_year_id, p_category_id, trim(p_title), p_event_type,
    p_start_date, coalesce(p_end_date, p_start_date),
    p_all_day, p_period_from, coalesce(p_period_to, p_period_from),
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
-- 7. RPC — 시간표 충돌 감지
-- ------------------------------------------------------------

-- 같은 반이 같은 날 같은 교시에 두 일정에 잡혀 있는지 확인합니다.
create or replace function public.event_conflicts(p_event uuid)
returns table (other_event_id uuid, other_title text, on_date date, classroom_name text)
language sql stable
security definer set search_path = public
as $$
  select distinct
    o.id,
    o.title,
    greatest(o.start_date, me.start_date) as on_date,
    c.name
  from events me
  join v_event_classrooms mec on mec.event_id = me.id
  join v_event_classrooms oec on oec.classroom_id = mec.classroom_id
  join events o on o.id = oec.event_id
  join classrooms c on c.id = mec.classroom_id
  where me.id = p_event
    and o.id <> p_event
    and o.status <> 'canceled'
    and me.status <> 'canceled'
    and daterange(o.start_date, o.end_date, '[]')
        && daterange(me.start_date, me.end_date, '[]')
    and (
      o.all_day or me.all_day
      or int4range(o.period_from, o.period_to, '[]')
         && int4range(me.period_from, me.period_to, '[]')
    );
$$;
