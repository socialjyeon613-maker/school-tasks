import { createServerClient } from "@supabase/ssr";

/**
 * 캘린더 구독 피드 (.ics)
 *
 * 폰 기본 캘린더 앱은 로그인을 하지 못하므로, 사람마다 발급한 비밀 토큰이
 * 곧 열쇠입니다. 그래서 anon 키로 붙되 calendar_feed() 안에서 토큰이
 * 가리키는 사람의 범위만 돌려줍니다.
 *
 * 학생 개인정보는 한 줄도 나가지 않습니다 — 일정 제목 · 시간 · 장소뿐입니다.
 */
export const dynamic = "force-dynamic";

interface Feed {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  event_type: string;
  mine: boolean;
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
const day = (iso: string) => iso.replaceAll("-", "");

/** 종일 일정의 DTEND 는 다음 날이어야 그 날까지 칠해집니다. */
function nextDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return day(d.toISOString().slice(0, 10));
}

/** 줄바꿈·쉼표·세미콜론은 ics 에서 escape 해야 합니다 */
const esc = (s: string) =>
  (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

/** ics 는 한 줄이 75옥텟을 넘으면 접어야 합니다 */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 73) return line;

  const out: string[] = [];
  let buf = Buffer.alloc(0);
  for (const ch of [...line]) {
    const b = Buffer.from(ch, "utf8");
    if (buf.length + b.length > 73) {
      out.push(buf.toString("utf8"));
      buf = Buffer.alloc(0);
    }
    buf = Buffer.concat([buf, b]);
  }
  if (buf.length) out.push(buf.toString("utf8"));
  return out.join("\r\n ");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  // 쿠키를 쓰지 않는 익명 클라이언트입니다.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data } = await supabase.rpc("calendar_feed", { p_token: token });
  const rows = (data ?? []) as Feed[];

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//학교 업무관리//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:학사일정",
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  for (const e of rows) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@school-tasks`);
    lines.push(`DTSTAMP:${day(e.start_date)}T000000Z`);

    if (!e.all_day && e.starts_at) {
      const s = e.starts_at.slice(0, 5).replace(":", "");
      const t = (e.ends_at ?? e.starts_at).slice(0, 5).replace(":", "");
      lines.push(`DTSTART;TZID=Asia/Seoul:${day(e.start_date)}T${s}00`);
      lines.push(`DTEND;TZID=Asia/Seoul:${day(e.start_date)}T${t}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day(e.start_date)}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(e.end_date)}`);
    }

    const mark = e.event_type === "task" ? "[업무] " : e.event_type === "notice" ? "[공지] " : "";
    lines.push(fold(`SUMMARY:${esc(mark + e.title)}`));
    if (e.location) lines.push(fold(`LOCATION:${esc(e.location)}`));
    // 나에게 걸린 일정은 알림을 하나 붙입니다.
    if (e.mine) {
      lines.push("BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY",
                 "DESCRIPTION:일정 알림", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
      "Content-Disposition": 'inline; filename="school.ics"',
    },
  });
}
