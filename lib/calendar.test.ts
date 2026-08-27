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


/* ------------------------------------------------------------------
   엑셀 왕복 — 내보낸 값을 다시 읽어 같은 값이 나오는지
------------------------------------------------------------------ */
import {
  decodeClassNos,
  encodeClassNos,
  shiftDate,
  toBool,
  toDateString,
} from "./excel-schema";

console.log("\n엑셀 왕복");

check("반 목록 왕복", () => {
  for (const nos of [[1, 2, 3, 4, 5], [3], [1, 3, 5], []]) {
    assert.deepEqual(decodeClassNos(encodeClassNos(nos)), nos);
  }
});
check("엑셀에서 손으로 고친 표기도 읽음", () => {
  assert.deepEqual(decodeClassNos("1~5"), [1, 2, 3, 4, 5]);
  assert.deepEqual(decodeClassNos("1-3, 7"), [1, 2, 3, 7]);
  assert.deepEqual(decodeClassNos("1,2,3반"), [1, 2, 3]);
  assert.deepEqual(decodeClassNos(" 4 , 5 "), [4, 5]);
});
check("중복·역순도 정리", () => {
  assert.deepEqual(decodeClassNos("5,3,3,1"), [1, 3, 5]);
  assert.deepEqual(decodeClassNos("5~3"), [3, 4, 5]);
});
check("날짜 — Date 객체와 문자열 모두", () => {
  assert.equal(toDateString(new Date(2026, 11, 10)), "2026-12-10");
  assert.equal(toDateString("2026-12-10"), "2026-12-10");
  assert.equal(toDateString("2026/12/9"), "2026-12-09");
  assert.equal(toDateString(""), "");
});
check("참/거짓 표기", () => {
  for (const v of ["O", "o", "Y", "예", "TRUE", "1"]) assert.equal(toBool(v), true);
  for (const v of ["", "X", "아니오", "0"]) assert.equal(toBool(v), false);
});

check("연도 이동 — 같은 날짜", () => {
  assert.equal(shiftDate("2025-12-10", "sameDate", 1), "2026-12-10");
});
check("연도 이동 — 같은 요일 (364일)", () => {
  // 2025-12-10 은 수요일. 364일 뒤도 수요일이어야 합니다.
  const moved = shiftDate("2025-12-10", "sameWeekday", 1);
  assert.equal(moved, "2026-12-09");
  assert.equal(
    new Date(moved + "T00:00:00").getDay(),
    new Date("2025-12-10T00:00:00").getDay()
  );
});
check("이동 안 함", () => {
  assert.equal(shiftDate("2025-12-10", "none", 1), "2025-12-10");
});


/* ------------------------------------------------------------------
   주간 · 간트
------------------------------------------------------------------ */
import { barFor, clusterByPeriod, slotsFor, weekDates, weekStart } from "./week";

console.log("\n주간 · 간트");

check("주 시작은 월요일", () => {
  assert.equal(weekStart("2026-12-10"), "2026-12-07"); // 목 → 월
  assert.equal(weekStart("2026-12-07"), "2026-12-07"); // 월 → 그대로
  assert.equal(weekStart("2026-12-13"), "2026-12-07"); // 일 → 그 주 월
});
check("한 주는 월~일 7일", () => {
  const d = weekDates("2026-12-07");
  assert.equal(d.length, 7);
  assert.equal(d[0], "2026-12-07");
  assert.equal(d[6], "2026-12-13");
});

check("겹치지 않으면 따로", () => {
  const c = clusterByPeriod([ev("A", 1, 2), ev("B", 5, 6)], 7);
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].from, c[0].to], [1, 2]);
  assert.deepEqual([c[1].from, c[1].to], [5, 6]);
});
check("겹치면 한 칸에 모음", () => {
  const c = clusterByPeriod([ev("A", 3, 4), ev("B", 4, 5)], 7);
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].from, c[0].to], [3, 5]);
  assert.equal(c[0].events.length, 2);
});
check("종일 일정은 교시 격자에서 제외", () => {
  assert.equal(clusterByPeriod([ev("종일", null, null, true)], 7).length, 0);
});
check("교시 수를 넘으면 잘라냄", () => {
  const c = clusterByPeriod([ev("A", 6, 9)], 7);
  assert.equal(c[0].to, 7);
});

check("rowSpan 계산", () => {
  const s = slotsFor(clusterByPeriod([ev("A", 3, 4)], 7), 7);
  assert.equal(s[0].kind, "empty");
  assert.equal(s[2].kind, "start");
  assert.equal(s[2].kind === "start" && s[2].span, 2);
  assert.equal(s[3].kind, "covered");
  // 칸 수는 언제나 교시 수와 같아야 표가 안 깨집니다
  assert.equal(s.length, 7);
});

check("간트 — 기간 안에 다 들어감", () => {
  const b = barFor("2026-12-08", "2026-12-09", "2026-12-01", "2026-12-31")!;
  assert.equal(Math.round(b.left * 31), 7);
  assert.equal(Math.round(b.width * 31), 2);
  assert.equal(b.clippedStart, false);
});
check("간트 — 하루짜리도 폭이 있음", () => {
  const b = barFor("2026-12-10", "2026-12-10", "2026-12-01", "2026-12-31")!;
  assert.ok(b.width > 0);
});
check("간트 — 앞뒤로 삐져나가면 표시", () => {
  const b = barFor("2026-11-20", "2027-01-10", "2026-12-01", "2026-12-31")!;
  assert.equal(b.left, 0);
  assert.equal(b.width, 1);
  assert.ok(b.clippedStart && b.clippedEnd);
});
check("간트 — 안 겹치면 null", () => {
  assert.equal(barFor("2026-11-01", "2026-11-05", "2026-12-01", "2026-12-31"), null);
});

console.log(`
${passed}개 통과
`);
