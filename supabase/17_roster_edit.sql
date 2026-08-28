-- ============================================================
-- 학교 업무관리 시스템 — 17. 단계 고치기 · 메모 쓰기
-- 01~16 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   16 까지는 단계를 만들 때 한 번 정하면 끝이었습니다.
--   set_event_stages() 는 **이름으로** 짝을 맞춥니다. 그래서 이름을 고치면
--   옛 단계가 통째로 지워지고, 거기 있던 학생들의 단계가 날아갔습니다.
--   고치기는 id 로 짝을 맞춰야 합니다.
--
--   메모 칸도 화면에만 있고 쓸 방법이 없었습니다.
--   set_roster_stage() 가 단계를 옮길 때만 곁들여 받았기 때문입니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 단계 고치기 — id 로 짝을 맞춰 학생을 잃지 않습니다
--
--    p_stages 는 [{id, name, kind}, ...] 순서대로.
--    id 가 있으면 그 단계를 고치고, 없으면 새로 만듭니다.
--    목록에서 빠진 단계는 지웁니다. 다만 학생이 남아 있으면 지우지 않고
--    알려 줍니다 — 말없이 단계 없음으로 만들면 나중에 찾기 어렵습니다.
-- ------------------------------------------------------------

create or replace function public.update_event_stages(p_event uuid, p_stages jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r        jsonb;
  i        int := 0;
  v_id     uuid;
  v_name   text;
  v_kind   text;
  v_keep   uuid[] := '{}';
  v_stuck  text;
  v_left   int;
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  if jsonb_array_length(coalesce(p_stages, '[]'::jsonb)) = 0 then
    raise exception 'NO_STAGES';
  end if;

  -- 먼저 지울 단계부터 살핍니다. 반쯤 고치다 멈추면 더 헷갈립니다.
  for r in select * from jsonb_array_elements(p_stages) loop
    if nullif(r ->> 'id', '') is not null then
      v_keep := v_keep || (r ->> 'id')::uuid;
    end if;
  end loop;

  select s.name, count(*)::int into v_stuck, v_left
  from event_stages s
  join event_roster t on t.stage_id = s.id
  where s.event_id = p_event
    and s.id <> all (v_keep)
  group by s.name
  order by count(*) desc
  limit 1;

  if v_stuck is not null then
    raise exception 'STAGE_IN_USE:%:%', v_stuck, v_left;
  end if;

  for r in select * from jsonb_array_elements(p_stages) loop
    i := i + 1;
    v_id   := nullif(r ->> 'id', '')::uuid;
    v_name := trim(r ->> 'name');
    v_kind := coalesce(nullif(r ->> 'kind', ''), 'active');

    if v_name = '' then
      raise exception 'EMPTY_NAME';
    end if;
    if v_kind not in ('active', 'success', 'fail') then
      raise exception 'BAD_KIND';
    end if;

    if v_id is null then
      -- 새로 넣은 단계도 지켜야 합니다. v_keep 에 안 담으면 바로 아래
      -- delete 가 방금 만든 것을 도로 지워 버립니다.
      insert into event_stages (event_id, position, name, kind)
      values (p_event, i, v_name, v_kind)
      on conflict (event_id, name)
        do update set position = excluded.position, kind = excluded.kind
      returning id into v_id;

      v_keep := v_keep || v_id;
    else
      -- 남의 일감 단계를 섞어 보내지 못하게 event_id 까지 확인합니다.
      update event_stages
      set position = i, name = v_name, kind = v_kind
      where id = v_id and event_id = p_event;

      if not found then
        raise exception 'NOT_FOUND';
      end if;
    end if;
  end loop;

  delete from event_stages
  where event_id = p_event and id <> all (v_keep);

  return i;
end;
$$;

-- ------------------------------------------------------------
-- 2. 메모 쓰기
--    단계를 옮기지 않고 메모만 고칩니다.
--    쓸 수 있는 사람은 명단 화면의 can_edit 과 같습니다 — 담당자 · 부장 ·
--    관리자. 담임은 자기 반 행이 보이더라도 남의 일감이므로 읽기만 합니다.
-- ------------------------------------------------------------

create or replace function public.set_roster_note(
  p_event uuid,
  p_student uuid,
  p_note text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_manage_roster(p_event) then
    raise exception 'FORBIDDEN';
  end if;

  update event_roster
  set note = coalesce(trim(p_note), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where event_id = p_event and student_id = p_student;

  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;
