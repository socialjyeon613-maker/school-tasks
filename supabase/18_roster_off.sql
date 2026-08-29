-- ============================================================
-- 학교 업무관리 시스템 — 18. 진행 명단 끄기
-- 01~17 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   등록할 때 진행 명단을 켜면 끌 방법이 없었습니다.
--   잘못 켰거나 쓰다 보니 필요 없어진 일감을 되돌릴 길이 필요합니다.
--
--   ※ 이것은 되돌릴 수 없습니다.
--     일정 삭제는 휴지통을 거치지만, 명단은 되돌릴 자리가 없습니다.
--     그래서 무엇이 얼마나 사라지는지 세어서 돌려주고, 화면이 그 숫자를
--     보여 준 뒤에 다시 묻도록 했습니다.
-- ============================================================

create or replace function public.disable_roster(p_event uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_school   uuid;
  v_students int;
  v_stages   int;
  v_history  int;
begin
  select school_id into v_school from events where id = p_event;
  if v_school is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  -- 지우기 전에 세어 둡니다. 지운 뒤에는 셀 것이 없습니다.
  select count(*) into v_students from event_roster where event_id = p_event;
  select count(*) into v_stages   from event_stages where event_id = p_event;
  select count(*) into v_history  from event_roster_history where event_id = p_event;

  delete from event_roster_history where event_id = p_event;
  delete from event_roster where event_id = p_event;
  delete from event_stages where event_id = p_event;

  -- 다시 켤 때 남의 눈에 띄지 않게 기본값으로 되돌립니다.
  update events set roster_visibility = 'assignees' where id = p_event;

  return jsonb_build_object(
    'students', v_students,
    'stages', v_stages,
    'history', v_history
  );
end;
$$;
