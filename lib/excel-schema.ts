/**
 * 일정 엑셀의 열 정의 — 내보내기와 가져오기가 같은 이 파일을 봅니다.
 * 한 쪽만 고치면 왕복이 깨지므로 열을 늘릴 때는 여기만 고치세요.
 *
 * id 가 아니라 사람이 읽는 값(분류 이름 · 학년 번호 · 담당자 이메일)으로
 * 적습니다. 그래야 엑셀에서 고칠 수 있고, 새 학년도로 넣을 때도 맞습니다.
 */

export const EVENT_COLUMNS = [
  { key: "type", header: "유형", width: 10 },
  { key: "category", header: "분류", width: 14 },
  { key: "title", header: "제목", width: 30 },
  { key: "start_date", header: "시작일", width: 12 },
  { key: "end_date", header: "종료일", width: 12 },
  { key: "all_day", header: "종일", width: 7 },
  { key: "period_from", header: "시작교시", width: 9 },
  { key: "period_to", header: "끝교시", width: 8 },
  { key: "start_time", header: "시각", width: 8 },
  { key: "location", header: "장소", width: 20 },
  { key: "grade_no", header: "대상학년", width: 9 },
  { key: "class_nos", header: "대상반", width: 14 },
  { key: "requires_participation", header: "학생참여", width: 9 },
  { key: "daily_participation", header: "매일출석", width: 9 },
  { key: "due_at", header: "마감", width: 16 },
  { key: "assignee_emails", header: "담당자이메일", width: 26 },
  { key: "description", header: "내용", width: 40 },
] as const;

export type EventColumnKey = (typeof EVENT_COLUMNS)[number]["key"];

export const TYPE_TO_LABEL: Record<string, string> = {
  academic: "학사일정",
  task: "업무",
  notice: "공지",
};

export const LABEL_TO_TYPE: Record<string, string> = {
  학사일정: "academic",
  업무: "task",
  공지: "notice",
};

/** 엑셀에 적을 한 줄 */
export interface EventRow {
  type: string;
  category: string;
  title: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  period_from: number | null;
  period_to: number | null;
  start_time: string;
  location: string;
  grade_no: number | null;
  class_nos: number[];
  requires_participation: boolean;
  daily_participation: boolean;
  due_at: string;
  assignee_emails: string[];
  description: string;
}

/** [1,2,3,5] → "1,2,3,5" (엑셀에서 직접 고치기 쉬운 형태) */
export function encodeClassNos(nos: number[]) {
  return nos.length ? [...nos].sort((a, b) => a - b).join(",") : "";
}

/** "1,2,3" / "1~5" / "1-5" 를 모두 받습니다 */
export function decodeClassNos(v: string): number[] {
  if (!v?.trim()) return [];
  const out = new Set<number>();

  for (const part of v.split(/[,·\s]+/)) {
    const chunk = part.trim().replace(/반$/, "");
    if (!chunk) continue;

    const range = chunk.match(/^(\d+)\s*[~\-–]\s*(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const n = Number(chunk);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** 엑셀 셀 값이 무엇으로 오든 'YYYY-MM-DD' 로 */
export function toDateString(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}

/** 'O' 'Y' 'true' '예' 등을 모두 참으로 */
export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return ["o", "y", "yes", "true", "1", "예", "참", "v"].includes(s);
}

export const BOOL_CELL = (b: boolean) => (b ? "O" : "");

/**
 * 새 학년도로 옮길 때 날짜를 미는 방법.
 *
 * 학교 일정은 요일에 묶인 것이 많습니다(매주 월요일 회의, 금요일 동아리).
 * 그래서 '같은 날짜'보다 '같은 요일'이 맞는 경우가 잦아, 364일(=52주)을
 * 밀면 요일이 그대로 유지됩니다.
 */
export type ShiftMode = "none" | "sameDate" | "sameWeekday";

export function shiftDate(iso: string, mode: ShiftMode, years: number): string {
  if (!iso || mode === "none" || years === 0) return iso;
  const d = new Date(iso + "T00:00:00");

  if (mode === "sameWeekday") {
    d.setDate(d.getDate() + 364 * years);
  } else {
    d.setFullYear(d.getFullYear() + years);
  }

  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
