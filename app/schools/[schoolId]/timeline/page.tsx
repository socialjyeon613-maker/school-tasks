import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { firstOf, monthDates, teacherColor, toISODate, weekday } from "@/lib/format";
import { barFor } from "@/lib/week";
import { CATEGORY_STYLE, type EventType } from "@/lib/types";
import ViewSwitch from "../view-switch";

/**
 * 간트 보기 — 기간 일정을 가로 막대로.
 *
 * 월간 표는 하루 단위로 잘 보이지만, 원서접수 기간처럼 여러 날 이어지는
 * 것들이 서로 어떻게 겹치는지는 잘 안 보입니다. 그걸 보는 화면입니다.
 */
interface Row {
  id: string;
  title: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  color: string | null;
  requires_participation: boolean;
}

const TYPE_ORDER: Record<string, number> = { notice: 0, academic: 1, task: 2 };
const TYPE_LABEL: Record<string, string> = {
  notice: "공지",
  academic: "학사일정",
  task: "업무",
};

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const now = new Date();
  const [y, m] = (sp.month ?? `${now.getFullYear()}-${now.getMonth() + 1}`)
    .split("-")
    .map(Number);

  const dates = monthDates(y, m);
  const from = dates[0];
  const to = dates[dates.length - 1];

  // 이 달과 조금이라도 겹치는 일정
  const { data: raw } = await supabase
    .from("events")
    .select(
      "id, title, event_type, start_date, end_date, requires_participation, category:event_categories(color)"
    )
    .eq("academic_year_id", ctx.year.id)
    .neq("status", "canceled")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");

  const rows: Row[] = (raw ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    event_type: e.event_type as EventType,
    start_date: e.start_date,
    end_date: e.end_date,
    color: firstOf(e.category)?.color ?? null,
    requires_participation: e.requires_participation,
  }));

  const ids = rows.map((r) => r.id);
  const { data: assignRows } = ids.length
    ? await supabase
        .from("event_assignments")
        .select("event_id, user_id, profile:profiles(name)")
        .in("event_id", ids)
    : { data: [] };

  const owner = new Map<string, { id: string; name: string }>();
  for (const a of assignRows ?? [])
    if (!owner.has(a.event_id))
      owner.set(a.event_id, { id: a.user_id, name: firstOf(a.profile)?.name ?? "—" });

  // 종류별로 묶고, 그 안에서 시작일 순
  rows.sort(
    (a, b) =>
      (TYPE_ORDER[a.event_type] ?? 9) - (TYPE_ORDER[b.event_type] ?? 9) ||
      a.start_date.localeCompare(b.start_date) ||
      a.title.localeCompare(b.title, "ko")
  );

  const groups = ["notice", "academic", "task"]
    .map((t) => ({ type: t, items: rows.filter((r) => r.event_type === t) }))
    .filter((g) => g.items.length > 0);

  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const today = toISODate(new Date());
  const todayBar = barFor(today, today, from, to);

  /** 막대 배경색 — 학사일정은 분류색, 업무는 담당자색 */
  function barClass(r: Row) {
    if (r.event_type === "task") return teacherColor(owner.get(r.id)?.id).chip;
    if (r.event_type === "notice") return "bg-amber-100 text-amber-900";
    return (CATEGORY_STYLE[r.color ?? "slate"] ?? CATEGORY_STYLE.slate).replace(
      /border-\S+/,
      ""
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">
          {y}년 {m}월 기간 일정
        </h1>

        <ViewSwitch schoolId={schoolId} current="timeline" />

        <div className="flex items-center gap-1">
          <Link href={`?month=${prev.y}-${prev.m}`} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">←</Link>
          <Link href={`?month=${now.getFullYear()}-${now.getMonth() + 1}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">이번 달</Link>
          <Link href={`?month=${next.y}-${next.m}`} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">→</Link>
        </div>

        <span className="text-sm text-slate-500">{rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          이 달에 걸친 일정이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <div className="min-w-[900px]">
            {/* 날짜 눈금 */}
            <div className="sticky top-0 flex border-b border-slate-300 bg-amber-50">
              <div className="w-56 shrink-0 border-r border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500">
                일정
              </div>
              <div className="relative flex flex-1">
                {dates.map((d) => {
                  const wd = weekday(d);
                  return (
                    <div
                      key={d}
                      className={`flex-1 border-r border-slate-200 py-1.5 text-center text-[10px] last:border-r-0 ${
                        wd === "일" ? "text-rose-500" : "text-slate-500"
                      } ${d === today ? "bg-amber-200 font-bold" : ""}`}
                    >
                      {Number(d.slice(8))}
                    </div>
                  );
                })}
              </div>
            </div>

            {groups.map((g) => (
              <div key={g.type}>
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                  {TYPE_LABEL[g.type]} {g.items.length}
                </div>

                {g.items.map((r) => {
                  const bar = barFor(r.start_date, r.end_date, from, to);
                  const who = owner.get(r.id);
                  return (
                    <div key={r.id} className="flex border-b border-slate-100 last:border-b-0">
                      <div className="w-56 shrink-0 truncate border-r border-slate-300 px-3 py-1.5 text-xs">
                        <Link
                          href={`/schools/${schoolId}/events/${r.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.title}
                        </Link>
                        {who && <span className="ml-1 text-slate-400">{who.name}</span>}
                      </div>

                      <div className="relative flex-1 py-1.5">
                        {/* 오늘 선 */}
                        {todayBar && (
                          <div
                            className="pointer-events-none absolute inset-y-0 w-px bg-rose-400/70"
                            style={{ left: `${todayBar.left * 100}%` }}
                          />
                        )}
                        {bar && (
                          <Link
                            href={`/schools/${schoolId}/events/${r.id}`}
                            title={`${r.start_date} ~ ${r.end_date}`}
                            className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[10px] font-medium ${barClass(r)} ${
                              bar.clippedStart ? "rounded-l-none" : ""
                            } ${bar.clippedEnd ? "rounded-r-none" : ""}`}
                            style={{
                              left: `${bar.left * 100}%`,
                              width: `max(1.4rem, ${bar.width * 100}%)`,
                            }}
                          >
                            {bar.clippedStart && "◀"}
                            <span className="truncate">
                              {r.requires_participation ? "참여 " : ""}
                              {r.start_date === r.end_date
                                ? ""
                                : `${Number(r.start_date.slice(8))}–${Number(r.end_date.slice(8))}`}
                            </span>
                            {bar.clippedEnd && "▶"}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="no-print mt-3 text-xs text-slate-500">
        막대를 누르면 일정으로 갑니다. 세로 붉은 선이 오늘입니다.
        달 밖으로 이어지는 일정은 ◀ ▶ 로 표시됩니다.
      </p>
    </main>
  );
}
