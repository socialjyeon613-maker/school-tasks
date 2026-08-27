-- ============================================================
-- 학교 업무관리 시스템 — 09. 쪽지 + 공지 권한 축소
-- 01~08 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   1) 공지는 부장만 작성합니다 (기존: 부장 · 관리자)
--   2) 같은 학교 교직원끼리 1:1 쪽지
-- ============================================================

-- ------------------------------------------------------------
-- 1. 공지 작성 권한 — 부장만
--    is_head() 하나만 봅니다. 학교를 만든 관리자라도 부장 보직이 없으면
--    공지를 올릴 수 없습니다.
-- ------------------------------------------------------------

create or replace function public.can_post_notice(p_school uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.is_head(p_school);
$$;

-- ------------------------------------------------------------
-- 2. 쪽지
-- ------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> recipient_id)
);

create index if not exists idx_messages_pair
  on public.messages (school_id, sender_id, recipient_id, created_at desc);
create index if not exists idx_messages_inbox
  on public.messages (recipient_id, read_at) where read_at is null;

alter table public.messages enable row level security;

-- 보내는 사람과 받는 사람만 봅니다. 관리자도 남의 쪽지는 못 봅니다.
create policy "messages_select" on public.messages
  for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- 본인 이름으로만, 같은 학교 구성원에게만 보냅니다.
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_school_member(school_id)
    and exists (
      select 1 from school_members m
      where m.user_id = recipient_id
        and m.school_id = messages.school_id
        and m.status = 'active'
    )
  );

-- 받은 사람이 읽음 표시를 합니다.
create policy "messages_update" on public.messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- 보낸 사람이 자기 쪽지를 지웁니다.
create policy "messages_delete" on public.messages
  for delete to authenticated
  using (sender_id = auth.uid());

-- ------------------------------------------------------------
-- 3. 대화 목록
--    security definer 가 아니므로 위 RLS 가 그대로 적용됩니다 —
--    내가 주고받은 쪽지만 집계됩니다.
-- ------------------------------------------------------------

create or replace function public.my_conversations(p_school uuid)
returns table (
  other_id uuid,
  other_name text,
  last_body text,
  last_at timestamptz,
  last_mine boolean,
  unread int
)
language sql stable
set search_path = public
as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
    from messages m
    where m.school_id = p_school
  ),
  latest as (
    select distinct on (other) other, body, created_at, sender_id
    from mine
    order by other, created_at desc
  )
  select
    l.other,
    p.name,
    l.body,
    l.created_at,
    l.sender_id = auth.uid(),
    (select count(*) from mine u
      where u.other = l.other and u.recipient_id = auth.uid() and u.read_at is null)::int
  from latest l
  join profiles p on p.id = l.other
  order by l.created_at desc;
$$;

create or replace function public.unread_message_count(p_school uuid)
returns int
language sql stable
set search_path = public
as $$
  select count(*)::int
  from messages
  where school_id = p_school
    and recipient_id = auth.uid()
    and read_at is null;
$$;

-- 대화를 열면 상대가 보낸 것들을 읽음 처리합니다.
create or replace function public.mark_messages_read(p_school uuid, p_other uuid)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  update messages
     set read_at = now()
   where school_id = p_school
     and sender_id = p_other
     and recipient_id = auth.uid()
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 4. 등록 / 수정 — 공지 권한 검사를 can_post_notice() 로 위임
--    시그니처는 08 과 같으므로 create or replace 로 그대로 교체됩니다.
--    앞으로 공지 권한을 바꾸려면 can_post_notice() 하나만 고치면 됩니다.
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
  -- 공지는 부장만 올립니다 (can_post_notice).
  if v_notice and not public.can_post_notice(v_school) then
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
  if v_notice and not public.can_post_notice(v_school) then
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
