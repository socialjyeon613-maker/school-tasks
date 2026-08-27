/**
 * 서버·클라이언트 양쪽에서 쓰는 순수 헬퍼.
 * next/headers 에 의존하는 코드는 lib/school.ts 에만 둡니다
 * (섞으면 클라이언트 번들로 끌려가 빌드가 깨집니다).
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 'YYYY-MM-DD' → '12/10(화)' */
export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function weekday(iso: string) {
  return WEEKDAYS[new Date(iso + "T00:00:00").getDay()];
}

/** 교시 범위를 '3~4교시' 로 */
export function periodLabel(
  allDay: boolean,
  from: number | null,
  to: number | null
) {
  if (allDay) return "종일";
  if (from == null) return "";
  if (to == null || to === from) return `${from}교시`;
  return `${from}~${to}교시`;
}

/** [1,2,3,5] → '1~3, 5반' — 스샷의 '경제배움터(1~5반)' 표기 */
export function compactClassLabel(nos: number[]) {
  if (nos.length === 0) return "";
  const sorted = [...nos].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}~${prev}`);
    start = prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}~${prev}`);
  return parts.join(", ") + "반";
}

/** 'YYYY-MM-DD' 로컬 기준 (toISOString 은 UTC 라 하루 밀릴 수 있음) */
export function toISODate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 그 달의 모든 날짜 */
export function monthDates(year: number, month1: number) {
  const out: string[] = [];
  const last = new Date(year, month1, 0).getDate();
  for (let d = 1; d <= last; d++) out.push(toISODate(new Date(year, month1 - 1, d)));
  return out;
}

/**
 * Supabase 조인 결과 정규화.
 * to-one 관계인데도 타입 추론이 배열로 나오는 경우가 있어 첫 원소를 꺼냅니다.
 */
export function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** 1536 → '1.5 KB' */
export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/** 확장자에 따른 표시용 아이콘. 학교 문서는 대부분 한글(hwp)입니다. */
export function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["hwp", "hwpx"].includes(ext)) return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽";
  if (ext === "pdf") return "📕";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "🖼";
  if (["zip", "7z", "rar"].includes(ext)) return "🗜";
  return "📎";
}

/** 마감까지 남은 기간 — 'D-3' / '오늘 마감' / '3일 지남' */
export function dueLabel(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  const due = new Date(iso);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);

  if (days === 0) return { text: "오늘 마감", tone: "urgent" as const };
  if (days < 0) return { text: `${-days}일 지남`, tone: "over" as const };
  if (days <= 3) return { text: `D-${days}`, tone: "urgent" as const };
  return { text: `D-${days}`, tone: "normal" as const };
}

/** '12/10 15:00' */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------------
   선생님별 색상

   달력에서 업무 일정이 누구 것인지 한눈에 보이도록 담당자마다 색을 줍니다.
   DB에 색을 저장하지 않고 id 로부터 계산합니다 — 설정 화면이 필요 없고,
   교직원이 바뀌어도 각자의 색은 그대로 유지됩니다.
   Tailwind 는 동적 클래스를 빌드에서 지우므로 반드시 정적 문자열이어야 합니다.
------------------------------------------------------------------ */

const TEACHER_COLORS = [
  { dot: "bg-rose-500", border: "border-l-rose-500", chip: "bg-rose-50 text-rose-900" },
  { dot: "bg-sky-500", border: "border-l-sky-500", chip: "bg-sky-50 text-sky-900" },
  { dot: "bg-emerald-500", border: "border-l-emerald-500", chip: "bg-emerald-50 text-emerald-900" },
  { dot: "bg-amber-500", border: "border-l-amber-500", chip: "bg-amber-50 text-amber-900" },
  { dot: "bg-violet-500", border: "border-l-violet-500", chip: "bg-violet-50 text-violet-900" },
  { dot: "bg-teal-500", border: "border-l-teal-500", chip: "bg-teal-50 text-teal-900" },
  { dot: "bg-orange-500", border: "border-l-orange-500", chip: "bg-orange-50 text-orange-900" },
  { dot: "bg-fuchsia-500", border: "border-l-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-900" },
  { dot: "bg-lime-600", border: "border-l-lime-600", chip: "bg-lime-50 text-lime-900" },
  { dot: "bg-cyan-500", border: "border-l-cyan-500", chip: "bg-cyan-50 text-cyan-900" },
  { dot: "bg-indigo-500", border: "border-l-indigo-500", chip: "bg-indigo-50 text-indigo-900" },
  { dot: "bg-pink-500", border: "border-l-pink-500", chip: "bg-pink-50 text-pink-900" },
];

const NO_TEACHER = {
  dot: "bg-slate-400",
  border: "border-l-slate-400",
  chip: "bg-slate-50 text-slate-700",
};

/** uuid → 팔레트 index (같은 사람은 언제나 같은 색) */
export function teacherColor(userId: string | null | undefined) {
  if (!userId) return NO_TEACHER;
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return TEACHER_COLORS[Math.abs(h) % TEACHER_COLORS.length];
}
