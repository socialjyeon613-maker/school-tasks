-- ============================================================
-- 학교 업무관리 시스템 — 03. 학생 참여 (출석부 대체)
-- 02_events.sql 실행 후에 실행하세요.
--
-- 지금 쓰시는 구글시트(반별 탭 10개 + 총원 + 불참)를 그대로 대체합니다.
-- 시트와 다른 점: '미입력' 과 '불참' 을 구분합니다.
--   시트는 0/1 뿐이라 담임이 아직 입력을 안 한 것과 전원 불참이 구분되지 않습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

create table public.participations (
  event_id uuid not null references public.events (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  -- 반별 집계와 RLS 를 단순하게 하려고 중복 저장합니다 (트리거가 채웁니다).
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'attended', 'absent')),
  reason text not null default '',         -- 불참 사유 (질병 / 개인사정 / 기타)
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, student_id)
);

create index idx_participations_event_class
  on public.participations (event_id, classroom_id);
create index idx_participations_student on public.participations (student_id);

-- classroom_id / updated_by / updated_at 자동 채움
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
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_participation_fill
  before insert or update on public.participations
  for each row execute function public.fill_participation();

-- ------------------------------------------------------------
-- 2. RLS — 담임은 자기 반, 학년부장은 자기 학년, 교장 · 교감은 전교
-- ------------------------------------------------------------

alter table public.participations enable row level security;

create policy "participations_select" on public.participations
  for select to authenticated using (public.can_view_classroom(classroom_id));
create policy "participations_write" on public.participations
  for all to authenticated
  using (public.can_manage_classroom(classroom_id))
  with check (public.can_manage_classroom(classroom_id));

-- ------------------------------------------------------------
-- 3. 뷰 — 집계 3단계 (반별 → 학년 총원 → 불참자 명단)
--   모두 security_invoker 이므로 위 RLS 가 그대로 적용됩니다.
-- ------------------------------------------------------------

-- 이 일정에서 참여 체크 대상이 되는 학생
--   대상 반 전개는 02_events.sql 의 v_event_classrooms 가 담당합니다.
create view public.v_event_students
with (security_invoker = true) as
select
  e.id as event_id,
  s.id as student_id,
  s.classroom_id,
  s.number,
  s.name
from events e
join v_event_classrooms ec on ec.event_id = e.id
join students s
  on s.classroom_id = ec.classroom_id
 and s.status = 'enrolled'
where e.requires_participation;

-- 반별 현황 — 시트의 각 반 탭 1행("참여자 수")에 해당
create view public.v_participation_by_classroom
with (security_invoker = true) as
select
  es.event_id,
  es.classroom_id,
  c.name as classroom_name,
  c.grade_id,
  count(*) as total,
  count(*) filter (where p.status = 'attended') as attended,
  count(*) filter (where p.status = 'absent') as absent,
  count(*) filter (where coalesce(p.status, 'pending') = 'pending') as pending,
  -- ★ 시트가 못 하던 것: 이 반이 입력을 끝냈는지
  (count(*) filter (where coalesce(p.status, 'pending') = 'pending') = 0) as is_complete
from v_event_students es
join classrooms c on c.id = es.classroom_id
left join participations p
  on p.event_id = es.event_id and p.student_id = es.student_id
group by es.event_id, es.classroom_id, c.name, c.grade_id;

-- 일정별 총원 — 시트의 '총원' 탭에 해당
create view public.v_participation_summary
with (security_invoker = true) as
select
  e.id as event_id,
  e.title,
  e.start_date,
  sum(v.total)::int      as total,
  sum(v.attended)::int   as attended,
  sum(v.absent)::int     as absent,
  sum(v.pending)::int    as pending,
  count(*)::int                                    as classroom_count,
  (count(*) filter (where v.is_complete))::int     as classroom_done,
  -- 아직 입력 안 한 반 이름 (부장 화면에서 바로 독촉할 대상)
  coalesce(string_agg(v.classroom_name, ', ')
           filter (where not v.is_complete), '') as pending_classrooms
from events e
join v_participation_by_classroom v on v.event_id = e.id
group by e.id, e.title, e.start_date;

-- 불참자 명단 — 시트의 '불참' 탭에 해당
create view public.v_absentees
with (security_invoker = true) as
select
  es.event_id,
  es.classroom_id,
  c.name as classroom_name,
  count(*)::int as absent_count,
  string_agg(es.name, ', ' order by es.number) as names
from v_event_students es
join classrooms c on c.id = es.classroom_id
join participations p
  on p.event_id = es.event_id and p.student_id = es.student_id
where p.status = 'absent'
group by es.event_id, es.classroom_id, c.name;

-- 학생별 누적 — "이 학생이 4회 중 몇 번 빠졌나" (상습 불참 파악)
create view public.v_student_participation_stats
with (security_invoker = true) as
select
  s.id as student_id,
  s.classroom_id,
  s.number,
  s.name,
  count(p.student_id)::int                                     as checked,
  (count(p.student_id) filter (where p.status = 'attended'))::int as attended,
  (count(p.student_id) filter (where p.status = 'absent'))::int   as absent
from students s
left join participations p on p.student_id = s.id and p.status <> 'pending'
where s.status = 'enrolled'
group by s.id, s.classroom_id, s.number, s.name;

-- ------------------------------------------------------------
-- 4. RPC — 참여 입력
-- ------------------------------------------------------------

-- 학생 1명 토글
create or replace function public.set_participation(
  p_event uuid,
  p_student uuid,
  p_status text,
  p_reason text default ''
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_classroom uuid;
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

  insert into participations (event_id, student_id, classroom_id, status, reason)
  values (p_event, p_student, v_classroom, p_status, coalesce(p_reason, ''))
  on conflict (event_id, student_id)
    do update set status = excluded.status, reason = excluded.reason;
end;
$$;

-- 반 전체 일괄 지정 — '전체 참여' 버튼용.
-- 담임은 이걸 누른 뒤 빠진 학생만 해제하면 됩니다.
create or replace function public.set_classroom_participation(
  p_event uuid,
  p_classroom uuid,
  p_status text default 'attended',
  p_overwrite boolean default true      -- false 면 미입력(pending)만 채웁니다
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

  insert into participations (event_id, student_id, classroom_id, status)
  select p_event, s.id, s.classroom_id, p_status
  from students s
  where s.classroom_id = p_classroom and s.status = 'enrolled'
  on conflict (event_id, student_id) do update
    set status = case
                   when p_overwrite then excluded.status
                   when participations.status = 'pending' then excluded.status
                   else participations.status
                 end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 그리드 한 화면을 한 번에 저장
-- p_rows 예: '[{"student_id":"…","status":"absent","reason":"질병"}, …]'
create or replace function public.save_participations(p_event uuid, p_rows jsonb)
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
      coalesce(v_row ->> 'reason', '')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 5. 첨부 파일용 Storage 버킷
--   학교 문서는 대부분 한글(.hwp/.hwpx)입니다.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- 경로 규칙: attachments/{school_id}/{event_id}/{파일명}
create policy "attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_school_member(((storage.foldername(name))[1])::uuid)
  );

create policy "attachments_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_school_member(((storage.foldername(name))[1])::uuid)
  );

-- 올린 사람, 또는 그 일정을 편집할 수 있는 사람(작성자·담당자·부장·관리자).
-- 업로더만 지울 수 있게 두면, 부장이 DB 행을 지워도 파일이 스토리지에 남습니다.
create policy "attachments_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = auth.uid()
      or public.can_edit_event(((storage.foldername(name))[2])::uuid)
    )
  );
