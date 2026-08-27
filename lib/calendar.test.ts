/**
 * 스샷(2024 자기개발시기 3학년 특별 학사일정)의 실제 행을 그대로 넣어
 * 그리드 배치가 재현되는지 확인합니다.
 *
 *   npx tsx lib/calendar.test.ts
 */
import assert from "node:assert/strict";
import { packRows, rowCells } from "./calendar";
import { compactClassLabel } from "./format";
import type { EventOnDate } from "./types";

const MAX = 7;
let passed = 0;

function ev(title: string, from: number | null, to: number | null, allDay = false) {
  return {
    event_id: title,
    on_date: "2024-11-08",
    title,
    event_type: "academic",
    all_day: allDay,
    period_from: from,
    period_to: to,
    start_time: null,
    location: "",
    status: "planned",
    requires_participation: false,
    category_name: null,
    category_color: null,
    category_lane: "grid",
  } as EventOnDate;
}

function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("\n스샷 재현 검증");

// 11/8(금): 홍익디자인고(1) 서울항공고(2) 자치(4) 동아리(5) 동아리(6) 동아리(7)
// → 겹치지 않으므로 한 줄에 모두 들어가야 합니다.
check("11/8 겹치지 않는 6개 일정 → 1줄", () => {
  const rows = packRows(
    [
      ev("홍익디자인고", 1, 1),
      ev("서울항공고", 2, 2),
      ev("자치", 4, 4),
      ev("동아리A", 5, 5),
      ev("동아리B", 6, 6),
      ev("동아리C", 7, 7),
    ],
    MAX
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].map((p) => p.event.title), [
    "홍익디자인고", "서울항공고", "자치", "동아리A", "동아리B", "동아리C",
  ]);
});

// 3교시가 비어 있으므로 빈 칸이 하나 생겨야 합니다.
check("11/8 빈 교시는 빈 칸으로 채워짐", () => {
  const rows = packRows([ev("홍익디자인고", 1, 1), ev("자치", 4, 4)], MAX);
  const cells = rowCells(rows[0], MAX);
  assert.deepEqual(
    cells.map((c) => (c.placed ? c.placed.event.title : `빈${c.span}`)),
    ["홍익디자인고", "빈2", "자치", "빈3"]
  );
  // 칸 너비의 합은 항상 교시 수와 같아야 합니다 (표가 깨지지 않는 조건)
  assert.equal(cells.reduce((s, c) => s + c.span, 0), MAX);
});

// 11/11(월): 마약예방교육(1~3교시) 아래에 동양고 홍보가 또 옵니다 → 2줄
check("11/11 같은 교시가 겹치면 2줄로 분리", () => {
  const rows = packRows(
    [ev("마약예방교육", 1, 3), ev("동양고 홍보", 1, 2)],
    MAX
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0].event.title, "마약예방교육"); // 넓은 칸이 위로
  assert.equal(rows[1][0].event.title, "동양고 홍보");
});

// 하자센터 에듀투어 = 종일 → 1~7교시 전체를 하나의 병합 셀로
check("종일 일정은 1~7교시 전체를 한 칸으로 병합", () => {
  const rows = packRows([ev("하자센터 에듀투어", null, null, true)], MAX);
  const cells = rowCells(rows[0], MAX);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].span, MAX);
});

// 종합 발표회(체육관)처럼 중간 교시를 넓게 쓰는 경우
check("2~6교시 병합 + 양쪽 빈 칸", () => {
  const cells = rowCells(packRows([ev("종합 발표회", 2, 6)], MAX)[0], MAX);
  assert.deepEqual(cells.map((c) => c.span), [1, 5, 1]);
});

// 스샷의 대상 표기
console.log("\n대상 반 표기");
check("경제배움터(1~5반)", () => {
  assert.equal(compactClassLabel([1, 2, 3, 4, 5]), "1~5반");
});
check("경제배움터(6~10반)", () => {
  assert.equal(compactClassLabel([6, 7, 8, 9, 10]), "6~10반");
});
check("마약예방교육(4,5,6반)", () => {
  assert.equal(compactClassLabel([4, 5, 6]), "4~6반");
});
check("떨어진 반은 쉼표로", () => {
  assert.equal(compactClassLabel([1, 3, 5]), "1, 3, 5반");
});
check("혼합", () => {
  assert.equal(compactClassLabel([1, 2, 3, 7, 9, 10]), "1~3, 7, 9~10반");
});
check("한 반", () => {
  assert.equal(compactClassLabel([2]), "2반");
});


/* ------------------------------------------------------------------
   편집 권한 — DB의 can_edit_event() 와 같은 판정을 하는지
------------------------------------------------------------------ */
import { canEditEvent } from "./permissions";

const ME = "me";
const ctxOf = (o: Partial<{ isAdmin: boolean; isHead: boolean; canPostNotice: boolean }>) => ({
  userId: ME,
  isAdmin: false,
  isHead: false,
  canPostNotice: false,
  ...o,
});
const evOf = (o: Partial<{ event_type: "academic" | "task" | "notice"; created_by: string | null; owner_id: string | null }>) => ({
  event_type: "academic" as const,
  created_by: "someone",
  owner_id: "someone",
  ...o,
});

console.log("\n편집 권한");

check("작성자는 편집 가능", () => {
  assert.equal(canEditEvent(ctxOf({}), evOf({ created_by: ME })), true);
});
check("담당자(owner)는 편집 가능", () => {
  assert.equal(canEditEvent(ctxOf({}), evOf({ owner_id: ME })), true);
});
check("부장은 남의 일정도 편집 가능", () => {
  assert.equal(canEditEvent(ctxOf({ isHead: true }), evOf({})), true);
});
check("관리자도 편집 가능", () => {
  assert.equal(canEditEvent(ctxOf({ isAdmin: true }), evOf({})), true);
});
check("일반 교사는 남의 일정 편집 불가 ← 버튼이 보이면 안 됨", () => {
  assert.equal(canEditEvent(ctxOf({}), evOf({})), false);
});
check("공지: 부장이면 편집 가능", () => {
  assert.equal(
    canEditEvent(ctxOf({ isHead: true, canPostNotice: true }), evOf({ event_type: "notice" })),
    true
  );
});
check("공지: 작성자라도 부장이 아니면 불가", () => {
  assert.equal(
    canEditEvent(ctxOf({}), evOf({ event_type: "notice", created_by: ME })),
    false
  );
});
check("공지: 관리자라도 부장이 아니면 불가", () => {
  assert.equal(
    canEditEvent(ctxOf({ isAdmin: true }), evOf({ event_type: "notice" })),
    false
  );
});

console.log(`\n${passed}개 통과\n`);
