-- ============================================================
-- 학교 업무관리 시스템 — 04. 일정 편집
-- 01~03 을 이미 실행한 프로젝트라면 이 파일만 추가로 실행하면 됩니다.
-- (create or replace 라 여러 번 실행해도 안전합니다.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. RPC — 일정 수정
--   대상(event_targets)을 통째로 갈아끼우므로 한 트랜잭션 안에서 처리합니다.
--   클라이언트에서 delete → insert 로 나눠 하면 중간에 실패했을 때
--   대상이 비어 '전교'로 뒤바뀌는 사고가 납니다.
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
  p_due_at timestamptz default null
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
