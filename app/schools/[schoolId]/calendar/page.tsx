import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { compactClassLabel, firstOf, monthDates, weekday } from "@/lib/format";
import { buildTargetIndex, matchesGrade, packRows, rowCells } from "@/lib/calendar";
import { categoryStyle, type EventOnDate } from "@/lib/types";
import MonthNav from "./month-nav";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ month?: string; grade?: string }>;
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
  const first = dates[0];
  const last = dates[dates.length - 1];

  const [{ data: periods }, { data: grades }] = await Promise.all([
    supabase
      .from("periods")
      .select("id, no, name")
      .eq("academic_year_id", ctx.year.id)
      .order("no"),
    supabase
      .from("grades")
      .select("id, grade_no, name")
      .eq("academic_year_id", ctx.year.id)
      .order("grade_no"),
  ]);

  const maxPeriod = periods?.length ? Math.max(...periods.map((p) => p.no)) : 7;
  const gradeId = sp.grade ?? grades?.[0]?.id ?? "";

  const { data: rawEvents } = await supabase
    .from("v_events_by_date")
    .select("*")
    .eq("academic_year_id", ctx.year.id)
    .gte("on_date", first)
    .lte("on_date", last)
    .neq("status", "canceled");

  const events = (rawEvents ?? []) as EventOnDate[];
  const eventIds = [...new Set(events.map((e) => e.event_id))];

  const { data: targetRows } = eventIds.length
    ? await supabase
        .from("event_targets")
        .select("event_id, grade_id, department_id, user_id, classroom:classrooms(class_no, grade_id)")
        .in("event_id", eventIds)
    : { data: [] };

  const targets = buildTargetIndex(
    (targetRows ?? []).map((t) => ({
      event_id: t.event_id,
      grade_id: t.grade_id,
      department_id: t.department_id,
      user_id: t.user_id,
      classroom: firstOf(t.classroom),
    }))
  );

  // 선택한 학년에 해당하는 일정만
  const visible = gradeId
    ? events.filter((e) => matchesGrade(targets.get(e.event_id), gradeId))
    : events;

  const byDate = new Map<string, EventOnDate[]>();
  for (const e of visible) {
    const list = byDate.get(e.on_date) ?? [];
    list.push(e);
    byDate.set(e.on_date, list);
  }

  const gradeName = grades?.find((g) => g.id === gradeId)?.name ?? "";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">
          {y}년 {m}월 {gradeName} 학사일정
        </h1>

        <div className="flex gap-1">
          {(grades ?? []).map((g) => (
            <Link
              key={g.id}
              href={`?month=${y}-${m}&grade=${g.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                g.id === gradeId
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-600"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>

        <MonthNav year={y} month={m} gradeId={gradeId} />

        <div className="ml-auto flex gap-2">
          {ctx.canCreateEvent && (
            <Link
              href={`/schools/${schoolId}/events/new?date=${first}&grade=${gradeId}`}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white"
            >
              + 일정 등록
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
        <table className="w-full border-collapse text-center text-[13px] print-tight">
          <thead>
            <tr className="bg-amber-50">
              <th className="w-10 border border-slate-300 px-1 py-2">일</th>
              <th className="w-10 border border-slate-300 px-1 py-2">요일</th>
              {(periods ?? []).map((p) => (
                <th key={p.id} className="border border-slate-300 px-1 py-2">
                  {p.name}
                </th>
              ))}
              <th className="w-44 border border-slate-300 px-1 py-2">
                전형 · 업무 일정
              </th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const all = byDate.get(date) ?? [];
              const grid = all.filter((e) => e.category_lane !== "side");
              const side = all.filter((e) => e.category_lane === "side");
              const rows = packRows(grid, maxPeriod);
              const rowCount = Math.max(rows.length, 1);
              const wd = weekday(date);
              const weekend = wd === "토" || wd === "일";

              return (rows.length ? rows : [[]]).map((row, ri) => (
                <tr key={`${date}-${ri}`} className={weekend ? "bg-slate-50" : ""}>
                  {ri === 0 && (
                    <>
                      <td
                        rowSpan={rowCount}
                        className="border border-slate-300 px-1 py-1 align-middle"
                      >
                        {Number(date.slice(8, 10))}
                      </td>
                      <td
                        rowSpan={rowCount}
                        className={`border border-slate-300 px-1 py-1 align-middle ${
                          wd === "일" ? "text-rose-600" : ""
                        }`}
                      >
                        {wd}
                      </td>
                    </>
                  )}

                  {rowCells(row, maxPeriod).map((cell, ci) =>
                    cell.placed ? (
                      <td
                        key={ci}
                        colSpan={cell.span}
                        className="border border-slate-300 p-0.5"
                      >
                        <EventChip
                          schoolId={schoolId}
                          event={cell.placed.event}
                          classNos={targets.get(cell.placed.event.event_id)?.classNos ?? []}
                        />
                      </td>
                    ) : (
                      <td
                        key={ci}
                        colSpan={cell.span}
                        className="border border-slate-300"
                      />
                    )
                  )}

                  {ri === 0 && (
                    <td
                      rowSpan={rowCount}
                      className="space-y-0.5 border border-slate-300 p-0.5 align-top"
                    >
                      {side.map((e) => (
                        <EventChip
                          key={e.event_id}
                          schoolId={schoolId}
                          event={e}
                          classNos={targets.get(e.event_id)?.classNos ?? []}
                        />
                      ))}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <p className="no-print mt-3 text-xs text-slate-500">
        일정을 누르면 상세 · 댓글 · 첨부 · 학생 참여 현황으로 이동합니다.
        브라우저 인쇄(Ctrl+P)로 표만 출력됩니다.
      </p>
    </main>
  );
}

function EventChip({
  schoolId,
  event,
  classNos,
}: {
  schoolId: string;
  event: EventOnDate;
  classNos: number[];
}) {
  const label = classNos.length ? compactClassLabel(classNos) : "";

  return (
    <Link
      href={`/schools/${schoolId}/events/${event.event_id}`}
      className={`block rounded border px-1 py-0.5 leading-tight ${categoryStyle(
        event.category_color
      )}`}
    >
      <span className="font-medium">{event.title}</span>
      {label && <span className="opacity-70"> ({label})</span>}
      {event.location && (
        <span className="block text-[11px] opacity-70">
          {event.location}
          {event.start_time ? ` / ${event.start_time.slice(0, 5)}` : ""}
        </span>
      )}
      {event.requires_participation && (
        <span className="block text-[11px] font-medium opacity-80">참여체크</span>
      )}
    </Link>
  );
}
