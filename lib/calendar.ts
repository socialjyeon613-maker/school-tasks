import type { EventOnDate } from "@/lib/types";

/** 그리드에 놓인 하나의 칸 — 교시 from~to 를 차지합니다. */
export interface Placed {
  event: EventOnDate;
  from: number;
  to: number;
}

/**
 * 한 날짜의 일정들을 겹치지 않는 행으로 나눕니다.
 *
 * 스샷 11/11 처럼 '마약예방교육(4,5,6반)' 과 '동양고 홍보' 가 같은 교시를 쓰면
 * 한 줄에 못 넣으므로 날짜 한 칸이 두 줄이 됩니다.
 * 겹치지 않으면 (11/8 의 1교시·2교시·4교시·5~7교시) 한 줄에 모두 들어갑니다.
 */
export function packRows(events: EventOnDate[], maxPeriod: number): Placed[][] {
  const placed = events
    .map((e) => ({
      event: e,
      from: e.all_day ? 1 : (e.period_from ?? 1),
      to: e.all_day ? maxPeriod : (e.period_to ?? e.period_from ?? 1),
    }))
    // 넓은 칸부터 배치해야 종일 일정이 위로 올라갑니다.
    .sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from);

  const rows: Placed[][] = [];

  for (const p of placed) {
    const row = rows.find((r) =>
      r.every((x) => p.to < x.from || p.from > x.to)
    );
    if (row) row.push(p);
    else rows.push([p]);
  }

  for (const r of rows) r.sort((a, b) => a.from - b.from);
  return rows;
}

/**
 * 한 행을 실제 <td> 배열로 — 빈 교시는 빈 칸으로 메웁니다.
 * colSpan 이 붙은 칸이 스샷의 병합 셀에 해당합니다.
 */
export function rowCells(
  row: Placed[],
  maxPeriod: number
): Array<{ span: number; placed: Placed | null }> {
  const cells: Array<{ span: number; placed: Placed | null }> = [];
  let cursor = 1;

  for (const p of row) {
    if (p.from > cursor) cells.push({ span: p.from - cursor, placed: null });
    cells.push({ span: p.to - p.from + 1, placed: p });
    cursor = p.to + 1;
  }
  if (cursor <= maxPeriod) cells.push({ span: maxPeriod - cursor + 1, placed: null });

  return cells;
}

/** 대상 반 번호들 → '1~3, 5반' */
export interface EventTargetInfo {
  classNos: number[];
  gradeIds: string[];
  classroomGradeIds: string[];
  isSchoolWide: boolean;
}

export function buildTargetIndex(
  rows: Array<{
    event_id: string;
    grade_id: string | null;
    department_id: string | null;
    user_id: string | null;
    classroom: { class_no: number; grade_id: string } | null;
  }>
) {
  const index = new Map<string, EventTargetInfo>();

  for (const r of rows) {
    const cur = index.get(r.event_id) ?? {
      classNos: [],
      gradeIds: [],
      classroomGradeIds: [],
      isSchoolWide: false,
    };
    if (r.classroom) {
      cur.classNos.push(r.classroom.class_no);
      cur.classroomGradeIds.push(r.classroom.grade_id);
    }
    if (r.grade_id) cur.gradeIds.push(r.grade_id);
    index.set(r.event_id, cur);
  }

  return index;
}

/** 이 일정이 선택한 학년에 해당하는가 (대상이 없으면 전교) */
export function matchesGrade(info: EventTargetInfo | undefined, gradeId: string) {
  if (!info) return true; // 대상 행이 없음 = 전교
  if (info.gradeIds.length === 0 && info.classNos.length === 0) return true;
  return (
    info.gradeIds.includes(gradeId) || info.classroomGradeIds.includes(gradeId)
  );
}
