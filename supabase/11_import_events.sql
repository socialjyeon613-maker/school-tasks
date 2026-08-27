-- ============================================================
-- 학교 업무관리 시스템 — 11. 일정 가져오기
-- 01~10 을 이미 실행한 프로젝트에 추가로 실행하세요.
--
--   엑셀로 내보낸 일정을 고쳐서 다시 넣습니다.
--   새 학년도를 시작할 때 작년 일정을 그대로 옮기는 것이 주 용도입니다.
--
--   이름으로 맞춥니다 (id 가 아니라):
--     분류   → event_categories.name
--     학년   → grades.grade_no
--     반     → classrooms.class_no
--     담당자 → profiles.email  (사람이 바뀔 수 있어 이메일로)
--   못 찾은 값은 비우고 넘어가되 어떤 줄이 그랬는지 돌려줍니다.
-- ============================================================

create or replace function public.import_events(
  p_year_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  r jsonb;
  v_i int := 0;
  v_created int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  v_category uuid;
  v_grade_id uuid;
  v_class_ids uuid[];
  v_grade_ids uuid[];
  v_assignees uuid[];
  v_type text;
  v_title text;
begin
  select school_id into v_school from academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'YEAR_NOT_FOUND';
  end if;
  if not public.is_school_member(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_title := trim(coalesce(r ->> 'title', ''));
    v_type := coalesce(nullif(r ->> 'type', ''), 'academic');

    if v_title = '' then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'message', '제목이 비어 있습니다');
      continue;
    end if;
    if (r ->> 'start_date') is null then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'title', v_title,
                                                 'message', '시작일이 비어 있습니다');
      continue;
    end if;
    if v_type = 'notice' and not public.can_post_notice(v_school) then
      v_errors := v_errors || jsonb_build_object('row', v_i, 'title', v_title,
                                                 'message', '공지는 부장만 등록할 수 있습니다');
      continue;
    end if;

    -- 분류 (이름으로)
    v_category := null;
    if coalesce(r ->> 'category', '') <> '' then
      select id into v_category from event_categories
      where academic_year_id = p_year_id and name = r ->> 'category';
      if v_category is null then
        v_warnings := v_warnings || jsonb_build_object(
          'row', v_i, 'title', v_title,
          'message', '분류 "' || (r ->> 'category') || '" 가 없어 비워 둡니다');
      end if;
    end if;

    -- 학년 / 반 (번호로)
    v_grade_id := null;
    v_grade_ids := '{}';
    v_class_ids := '{}';

    if (r ->> 'grade_no') is not null then
      select id into v_grade_id from grades
      where academic_year_id = p_year_id and grade_no = (r ->> 'grade_no')::int;

      if v_grade_id is null then
        v_warnings := v_warnings || jsonb_build_object(
          'row', v_i, 'title', v_title,
          'message', (r ->> 'grade_no') || '학년이 없어 전교 대상으로 넣습니다');
      elsif jsonb_array_length(coalesce(r -> 'class_nos', '[]'::jsonb)) > 0 then
        select coalesce(array_agg(c.id), '{}') into v_class_ids
        from classrooms c
        where c.grade_id = v_grade_id
          and c.class_no in (
            select (value #>> '{}')::int from jsonb_array_elements(r -> 'class_nos')
          );
        if array_length(v_class_ids, 1) is null then
          v_grade_ids := array[v_grade_id];
          v_warnings := v_warnings || jsonb_build_object(
            'row', v_i, 'title', v_title, 'message', '지정한 반이 없어 학년 전체로 넣습니다');
        end if;
      else
        v_grade_ids := array[v_grade_id];
      end if;
    end if;

    -- 담당자 (이메일로)
    v_assignees := '{}';
    if jsonb_array_length(coalesce(r -> 'assignee_emails', '[]'::jsonb)) > 0 then
      select coalesce(array_agg(pr.id), '{}') into v_assignees
      from profiles pr
      join school_members m on m.user_id = pr.id
                           and m.academic_year_id = p_year_id
                           and m.status = 'active'
      where lower(pr.email) in (
        select lower(value #>> '{}') from jsonb_array_elements(r -> 'assignee_emails')
      );
      if array_length(v_assignees, 1) is null then
        v_warnings := v_warnings || jsonb_build_object(
          'row', v_i, 'title', v_title, 'message', '담당자를 찾지 못해 비워 둡니다');
      end if;
    end if;

    begin
      perform public.create_event(
        p_year_id,
        v_title,
        (r ->> 'start_date')::date,
        nullif(r ->> 'end_date', '')::date,
        v_category,
        v_type,
        coalesce((r ->> 'all_day')::boolean, true),
        nullif(r ->> 'period_from', '')::int,
        nullif(r ->> 'period_to', '')::int,
        nullif(r ->> 'start_time', '')::time,
        coalesce(r ->> 'location', ''),
        coalesce((r ->> 'requires_participation')::boolean, false),
        v_class_ids,
        v_grade_ids,
        '{}'::uuid[],
        nullif(r ->> 'due_at', '')::timestamptz,
        coalesce((r ->> 'daily_participation')::boolean, false),
        v_assignees,
        coalesce(r ->> 'description', '')
      );
      v_created := v_created + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'row', v_i, 'title', v_title, 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'total', v_i,
    'errors', v_errors,
    'warnings', v_warnings
  );
end;
$$;
