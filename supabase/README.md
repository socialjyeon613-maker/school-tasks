# Supabase 스키마

학교 업무관리 시스템의 DB 스키마입니다.
설계 근거는 [../SPEC-일정-참여.md](../SPEC-일정-참여.md), 요구사항 리뷰는 [../REQUIREMENTS-REVIEW.md](../REQUIREMENTS-REVIEW.md) 를 보세요.

## 실행 순서

Supabase 대시보드 > **SQL Editor** 에서 순서대로 붙여넣고 Run:

1. `01_schema.sql` — 학교 · 학년도 · 학년 · 반 · 부서 · 교직원 · 학생 · 초대 + RLS
2. `02_events.sql` — 교시 · 분류(색상) · 일정 · 대상 · 담당배정 · 댓글 · 첨부 + RLS
3. `03_participation.sql` — 학생 참여 + 집계 뷰 + Storage 버킷
4. `04_event_edit.sql` — 일정 수정 RPC
5. `05_teacher_access.sql` — 교사 일정 등록 + 반별 집계 공개
6. `06_daily_participation.sql` — 날짜별 출석 + 담임/편집권 구분
7. `07_task_assignees.sql` — 업무 일정에 담당자 지정
8. `08_notices.sql` — 공지
9. `09_messages.sql` — 쪽지 + 공지 권한을 부장으로 축소
10. `10_notifications.sql` — 알림 (트리거 + 마감 리마인드)

> 10 의 마감 리마인드는 `pg_cron` 이 켜져 있으면 매일 한국시각 07:00 에
> 자동으로 돕니다. 없으면 조용히 넘어가니, 대시보드 > Database > Extensions
> 에서 켠 뒤 10 을 다시 실행하거나 외부 스케줄러로
> `select create_due_reminders();` 를 호출하세요.

> 06 은 `participations` 의 기본키를 `(event_id, student_id)` 에서
> `(event_id, student_id, on_date)` 로 넓힙니다. 기존 기록은 일정 시작일로
> 자동 채워지므로 데이터 손실은 없습니다.

> `create_school()` 은 `periods` / `event_categories` 에 기본값을 넣기 때문에
> **3개 파일을 모두 실행한 뒤** 호출해야 합니다.

## 첫 세팅

```sql
-- 1. 학교 만들기 (호출자가 관리자가 됩니다)
select create_school('○○중학교', 'middle', 2026, array['sen.go.kr']);

-- 2. 학년 · 반 편성  (3학년 1~10반)
select create_classrooms('<academic_year_id>', 3, 10);

-- 3. 학생 명단 (연번은 결번 허용 — 전출 자리)
select import_students('<classroom_id>',
  '[{"number":1,"name":"강OO","gender":"F"},{"number":3,"name":"김OO"}]'::jsonb);

-- 4. 일정 등록 (3학년 전체 / 3~4교시 / 참여체크 on)
select create_event(
  '<academic_year_id>', '난타 공연', '2026-12-10',
  p_all_day => false, p_period_from => 3, p_period_to => 4,
  p_start_time => '11:00', p_location => '홍대 전용관',
  p_requires_participation => true,
  p_grade_ids => array['<grade_id>']::uuid[]
);
```

담임은 `set_classroom_participation(event, classroom, 'attended')` 로 반 전체를 참여 처리한 뒤,
빠진 학생만 `set_participation(event, student, 'absent', '질병')` 으로 바꾸면 됩니다.

## 권한 요약

| 역할 | 학생 조회 | 참여 입력 | 일정 등록 |
|---|---|---|---|
| 교장 · 교감 · 관리자 | 전교 | 전교 | O |
| 학년부장 (`head` + grade) | 해당 학년 | 해당 학년 | O |
| 담임 (`homeroom` + classroom) | 자기 반 | 자기 반 | X |
| 교과담당 (`subject` + classroom) | 해당 반 (조회만) | X | O |
| 비담임 (부서 소속만) | **없음** | X | O |

일정 등록은 구성원 누구나 할 수 있고, **수정·삭제는 만든 사람**(과 부장·관리자)만 합니다.
**공지는 부장만** 올립니다 — `can_post_notice()` 한 곳에서 정합니다.
**쪽지는 보낸 사람과 받은 사람만** 봅니다. 부장도 관리자도 남의 쪽지는 못 봅니다.

반별 참여 **집계(숫자)** 는 모든 교직원이 봅니다 — `event_classroom_status()`.
**학생 이름**(`v_absentees` · `students` · `participations`)은 위 표대로 잠겨 있습니다.

학사일정 자체는 교직원 모두가 봅니다. 잠그는 대상은 **학생 개인정보**입니다.

## 주요 뷰

| 뷰 | 용도 | 대체하는 시트 탭 |
|---|---|---|
| `v_events_by_date` | 날짜 × 교시 그리드 렌더링 (기간 일정을 날짜별로 전개) | — |
| `v_event_classrooms` | 일정 → 대상 반 전개 (학년 대상도 반으로 풀림) | — |
| `v_event_target_labels` | 대상 표시 라벨 | — |
| `v_participation_by_classroom` | 반별 참여/불참/**미입력** | 각 반 탭 |
| `v_participation_summary` | 일정별 총원 + **미입력 반 목록** | 총원 |
| `v_absentees` | 반별 불참자 명단 | 불참 |
| `v_student_participation_stats` | 학생별 누적 (상습 불참 파악) | — |
| `v_assignment_progress` | 업무 일정 담당자별 완료 집계 | — |

모든 뷰는 `security_invoker = true` 입니다. **뷰를 통해서도 RLS 가 그대로 적용됩니다.**
(이 옵션이 없으면 뷰가 RLS 를 우회합니다 — 뷰를 추가할 때 반드시 붙이세요.)

## 검증

스키마를 고친 뒤 실제 Postgres(PGlite)에 올려 RLS 가 의도대로 막는지 확인합니다.
Supabase 계정이나 Docker 없이 로컬에서 바로 돌아갑니다.

```bash
cd supabase/test && npm install && npm test
```

검사 항목: 역할별 학생 조회 범위 / 남의 반 입력 차단 / 부장·담임 현황판 수치 /
비담임 격리 / 초대 도메인 제한 / 교시 충돌 감지.

> `test/00_supabase_stub.sql` 은 `auth.uid()` 등 Supabase 전용 객체를 흉내내는
> **검증 전용** 파일입니다. 실제 프로젝트에는 실행하지 마세요.
