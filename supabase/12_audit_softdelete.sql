-- ============================================================
-- 학교 업무관리 시스템 — 12. 변경 이력 + 휴지통
-- 01~11 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   1) 변경 이력 — 누가 언제 무엇을 바꿨는지 기록합니다.
--      학생 정보를 다루는 시스템이라 사고가 났을 때 추적할 수 있어야 합니다.
--   2) 삭제를 되돌릴 수 있게 — 지우는 대신 deleted_at 을 찍습니다.
--
--   ※ 조회 정책(RLS)에 deleted_at is null 을 넣습니다. 그러면 앱의 모든
--     쿼리와 뷰가 자동으로 걸러지므로 화면 코드를 고칠 필요가 없습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 휴지통 — 지우는 대신 표시만
-- ------------------------------------------------------------

alter table public.events   add column if not exists deleted_at timestamptz;
alter table public.students add column if not exists deleted_at timestamptz;

create index if not exists idx_events_alive
  on public.events (academic_year_id, start_date) where deleted_at is null;

drop policy if exists "events_select" on public.events;
create policy "events_select" on public.events
  for select to authenticated
  using (public.is_school_member(school_id) and deleted_at is null);

drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select to authenticated
  using (public.can_view_classroom(classroom_id) and deleted_at is null);

-- ------------------------------------------------------------
-- 2. 변경 이력
-- ------------------------------------------------------------

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete', 'restore')),
  entity text not null,                 -- event · student · staff_role · member
  record_id uuid,
  label text not null default '',       -- 사람이 읽는 대상 이름
  changes jsonb,                        -- 바뀐 항목만
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_school
  on public.audit_log (school_id, created_at desc);
create index if not exists idx_audit_record
  on public.audit_log (record_id, created_at desc);

alter table public.audit_log enable row level security;

-- 감사 기록은 교장 · 교감 · 관리자만 봅니다. 쓰는 것은 트리거만 합니다.
create policy "audit_select" on public.audit_log
  for select to authenticated using (public.is_school_admin(school_id));

-- 바뀐 항목만 뽑기
create or replace function public.jsonb_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(
    jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)),
    '{}'::jsonb)
  from jsonb_object_keys(p_new) k
  where (p_old -> k) is distinct from (p_new -> k);
$$;

/*
  공통 감사 트리거.
    TG_ARGV[0] = entity 이름
    TG_ARGV[1] = 사람이 읽을 이름이 든 컬럼
  기록 자체가 실패해서 본 작업이 막히면 안 되므로 예외는 삼킵니다.
*/
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_rec jsonb;
  v_action text;
  v_changes jsonb;
begin
  begin
    if TG_OP = 'DELETE' then
      v_old := to_jsonb(old); v_rec := v_old; v_action := 'delete';
    elsif TG_OP = 'INSERT' then
      v_new := to_jsonb(new); v_rec := v_new; v_action := 'insert';
    else
      v_old := to_jsonb(old); v_new := to_jsonb(new); v_rec := v_new;
      v_changes := public.jsonb_diff(v_old - 'updated_at', v_new - 'updated_at');
      if v_changes = '{}'::jsonb then
        return new;                       -- 실제로 바뀐 게 없음
      end if;
      -- 휴지통에 넣고 빼는 것은 따로 표시합니다.
      if (v_old ->> 'deleted_at' is null) is distinct from (v_new ->> 'deleted_at' is null) then
        v_action := case when v_new ->> 'deleted_at' is null then 'restore' else 'delete' end;
      else
        v_action := 'update';
      end if;
    end if;

    insert into audit_log (school_id, actor_id, action, entity, record_id, label, changes)
    values (
      (v_rec ->> 'school_id')::uuid,
      auth.uid(),
      v_action,
      TG_ARGV[0],
      (v_rec ->> 'id')::uuid,
      left(coalesce(v_rec ->> TG_ARGV[1], ''), 80),
      v_changes
    );
  exception when others then
    null;   -- 기록 실패가 본 작업을 막지 않도록
  end;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_events on public.events;
create trigger trg_audit_events
  after insert or update or delete on public.events
  for each row execute function public.audit_row('event', 'title');

drop trigger if exists trg_audit_students on public.students;
create trigger trg_audit_students
  after insert or update or delete on public.students
  for each row execute function public.audit_row('student', 'name');

drop trigger if exists trg_audit_staff_roles on public.staff_roles;
create trigger trg_audit_staff_roles
  after insert or update or delete on public.staff_roles
  for each row execute function public.audit_row('staff_role', 'role');

drop trigger if exists trg_audit_members on public.school_members;
create trigger trg_audit_members
  after insert or update or delete on public.school_members
  for each row execute function public.audit_row('member', 'role');

-- ------------------------------------------------------------
-- 3. 삭제 / 복구 RPC
-- ------------------------------------------------------------

create or replace function public.soft_delete_event(p_event uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_edit_event(p_event) then
    raise exception 'FORBIDDEN';
  end if;
  update events set deleted_at = now() where id = p_event and deleted_at is null;
end;
$$;

create or replace function public.restore_event(p_event uuid)
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
  -- 복구는 부장 · 관리자만
  if not (public.is_head(v_school) or public.is_school_admin(v_school)) then
    raise exception 'FORBIDDEN';
  end if;
  update events set deleted_at = null where id = p_event;
end;
$$;

-- 휴지통 목록 — 조회 정책이 지운 것을 감추므로 definer 로 따로 봅니다.
create or replace function public.deleted_events(p_school uuid)
returns table (
  id uuid,
  title text,
  event_type text,
  start_date date,
  deleted_at timestamptz,
  participation_count int
)
language plpgsql stable
security definer set search_path = public
as $$
begin
  if not (public.is_head(p_school) or public.is_school_admin(p_school)) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select e.id, e.title, e.event_type, e.start_date, e.deleted_at,
         (select count(*)::int from participations p where p.event_id = e.id)
  from events e
  where e.school_id = p_school and e.deleted_at is not null
  order by e.deleted_at desc
  limit 100;
end;
$$;

-- 완전 삭제 — 관리자만. 되돌릴 수 없습니다.
create or replace function public.purge_event(p_event uuid)
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
  if not public.is_school_admin(v_school) then
    raise exception 'FORBIDDEN';
  end if;
  delete from events where id = p_event;
end;
$$;
