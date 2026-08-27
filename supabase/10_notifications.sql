-- ============================================================
-- 학교 업무관리 시스템 — 10. 알림
-- 01~09 를 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   두 갈래로 만듭니다.
--   (1) 사건이 생기는 즉시 — 트리거. 쪽지 · 업무 배정 · 댓글 · 공지.
--   (2) 시간이 되면      — create_due_reminders(). 마감 임박 · 참여 미입력.
--       pg_cron 이 켜져 있으면 자동으로 돌고, 없으면 수동/외부 스케줄러로
--       호출하면 됩니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'message',              -- 쪽지가 왔습니다
    'assigned',             -- 업무를 배정받았습니다
    'comment',              -- 내 일정에 댓글이 달렸습니다
    'notice',               -- 새 공지
    'due_soon',             -- 업무 마감이 다가옵니다
    'participation_pending' -- 학생 참여 입력이 아직입니다
  )),
  title text not null,
  body text not null default '',
  link text not null default '',
  /* 같은 알림을 두 번 만들지 않기 위한 열쇠. 마감 리마인드처럼
     매번 돌면서 만드는 알림에 씁니다. 즉시 알림은 null 이라 제한 없음. */
  dedup_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_inbox
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (user_id) where read_at is null;
create unique index if not exists uniq_notifications_dedup
  on public.notifications (user_id, dedup_key) where dedup_key is not null;

alter table public.notifications enable row level security;

-- 내 알림만 봅니다. 만드는 것은 트리거(security definer)만 합니다.
create policy "notifications_select" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. 생성 헬퍼
-- ------------------------------------------------------------

create or replace function public.push_notification(
  p_school uuid,
  p_user uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedup text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- 자기가 한 일로 자기에게 알리지 않습니다.
  if p_user is null or p_user = auth.uid() then
    return;
  end if;

  insert into notifications (school_id, user_id, kind, title, body, link, dedup_key)
  values (p_school, p_user, p_kind, p_title, left(coalesce(p_body, ''), 200),
          p_link, p_dedup)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
end;
$$;

-- ------------------------------------------------------------
-- 3. 즉시 알림 — 트리거
-- ------------------------------------------------------------

-- 쪽지
create or replace function public.notify_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from profiles where id = new.sender_id;
  perform public.push_notification(
    new.school_id, new.recipient_id, 'message',
    coalesce(v_name, '누군가') || ' 님의 쪽지',
    new.body,
    '/schools/' || new.school_id || '/messages?with=' || new.sender_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message
  after insert on public.messages
  for each row execute function public.notify_message();

-- 업무 배정
create or replace function public.notify_assignment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
begin
  select * into v_event from events where id = new.event_id;
  if not found then
    return new;
  end if;

  perform public.push_notification(
    v_event.school_id, new.user_id, 'assigned',
    '업무를 배정받았습니다',
    v_event.title,
    '/schools/' || v_event.school_id || '/events/' || v_event.id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_assignment on public.event_assignments;
create trigger trg_notify_assignment
  after insert on public.event_assignments
  for each row execute function public.notify_assignment();

-- 댓글 — 일정 작성자 · 담당자 · 배정된 사람에게
create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_event events%rowtype;
  v_name text;
  v_target uuid;
begin
  select * into v_event from events where id = new.event_id;
  if not found then
    return new;
  end if;
  select name into v_name from profiles where id = new.user_id;

  for v_target in
    select distinct u from (
      select v_event.created_by as u
      union select v_event.owner_id
      union select a.user_id from event_assignments a where a.event_id = new.event_id
    ) t where u is not null
  loop
    perform public.push_notification(
      v_event.school_id, v_target, 'comment',
      coalesce(v_name, '누군가') || ' 님의 댓글',
      v_event.title || ' — ' || new.content,
      '/schools/' || v_event.school_id || '/events/' || v_event.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_comment on public.event_comments;
create trigger trg_notify_comment
  after insert on public.event_comments
  for each row execute function public.notify_comment();

-- 공지 — 그 학년도의 활성 교직원 전체에게
create or replace function public.notify_notice()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_target uuid;
begin
  if new.event_type <> 'notice' then
    return new;
  end if;

  for v_target in
    select user_id from school_members
    where academic_year_id = new.academic_year_id and status = 'active'
  loop
    perform public.push_notification(
      new.school_id, v_target, 'notice',
      '새 공지: ' || new.title,
      new.description,
      '/schools/' || new.school_id || '/events/' || new.id,
      'notice:' || new.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_notice on public.events;
create trigger trg_notify_notice
  after insert on public.events
  for each row execute function public.notify_notice();

-- ------------------------------------------------------------
-- 4. 시간이 되면 — 마감 임박 · 참여 미입력
--    하루 한 번 돌리면 됩니다. dedup_key 덕분에 여러 번 돌아도
--    같은 알림이 쌓이지 않습니다.
-- ------------------------------------------------------------

create or replace function public.create_due_reminders()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_made int := 0;
begin
  -- (1) 업무 마감 D-3 이내인데 아직 완료하지 않은 담당자
  for r in
    select a.user_id, e.school_id, e.id as event_id, e.title, e.due_at,
           (e.due_at::date - current_date) as days
    from event_assignments a
    join events e on e.id = a.event_id
    where a.status <> 'done'
      and e.status <> 'canceled'
      and e.due_at is not null
      and e.due_at::date between current_date and current_date + 3
  loop
    insert into notifications (school_id, user_id, kind, title, body, link, dedup_key)
    values (
      r.school_id, r.user_id, 'due_soon',
      case when r.days = 0 then '오늘 마감: ' || r.title
           else 'D-' || r.days || ' 마감: ' || r.title end,
      to_char(r.due_at, 'MM/DD HH24:MI') || ' 까지',
      '/schools/' || r.school_id || '/events/' || r.event_id,
      'due:' || r.event_id || ':' || current_date
    )
    on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
    v_made := v_made + 1;
  end loop;

  -- (2) 참여 체크가 필요한데 아직 입력이 안 끝난 반의 담임
  for r in
    select distinct sr.user_id, e.school_id, e.id as event_id, e.title,
           c.name as classroom_name
    from events e
    join v_event_classrooms ec on ec.event_id = e.id
    join classrooms c on c.id = ec.classroom_id
    join staff_roles sr on sr.classroom_id = c.id
                       and sr.role in ('homeroom', 'co_homeroom')
    where e.requires_participation
      and e.status <> 'canceled'
      and e.start_date between current_date - 1 and current_date + 2
      and exists (
        select 1 from students s
        where s.classroom_id = c.id and s.status = 'enrolled'
          and not exists (
            select 1 from participations p
            where p.event_id = e.id and p.student_id = s.id
              and p.status <> 'pending'
          )
      )
  loop
    insert into notifications (school_id, user_id, kind, title, body, link, dedup_key)
    values (
      r.school_id, r.user_id, 'participation_pending',
      '참여 입력이 남았습니다',
      r.title || ' — ' || r.classroom_name,
      '/schools/' || r.school_id || '/events/' || r.event_id,
      'part:' || r.event_id || ':' || current_date
    )
    on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
    v_made := v_made + 1;
  end loop;

  return v_made;
end;
$$;

-- ------------------------------------------------------------
-- 5. 읽기 도우미
-- ------------------------------------------------------------

create or replace function public.unread_notification_count(p_school uuid)
returns int
language sql stable
set search_path = public
as $$
  select count(*)::int from notifications
  where school_id = p_school and user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read(
  p_school uuid,
  p_id uuid default null      -- null 이면 이 학교 알림 전체
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_count int;
begin
  update notifications
     set read_at = now()
   where school_id = p_school
     and user_id = auth.uid()
     and read_at is null
     and (p_id is null or id = p_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 6. 매일 자동 실행 (pg_cron)
--    확장이 없으면 조용히 넘어갑니다. 대시보드 > Database > Extensions
--    에서 pg_cron 을 켠 뒤 이 파일을 다시 실행하면 등록됩니다.
--    켤 수 없다면 외부 스케줄러에서 create_due_reminders() 를 호출하세요.
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('school-due-reminders')
    where exists (select 1 from cron.job where jobname = 'school-due-reminders');

    perform cron.schedule(
      'school-due-reminders',
      '0 22 * * *',                     -- UTC 22:00 = 한국 07:00
      $cron$ select public.create_due_reminders(); $cron$
    );
    raise notice '마감 알림을 매일 한국시각 07:00 에 생성하도록 등록했습니다.';
  else
    raise notice 'pg_cron 이 없어 자동 실행은 등록하지 않았습니다. create_due_reminders() 를 직접 호출하세요.';
  end if;
end;
$$;
