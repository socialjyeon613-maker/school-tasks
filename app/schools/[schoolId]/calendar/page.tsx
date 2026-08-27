import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { compactClassLabel, firstOf, monthDates, teacherColor, toISODate, weekday } from "@/lib/format";
import { buildTargetIndex, matchesGrade, packRows, rowCells } from "@/lib/calendar";
import { categoryStyle, type EventOnDate } from "@/lib/types";
import MonthNav from "./month-nav";
import NoticeList, { type NoticeItem } from "./notice-list";

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

  // 공지는 달력 격자에 넣지 않고 왼쪽 목록으로 뺍니다.
  const { data: noticeRows } = await supabase
    .from("events")
    .select("id, title, description, start_date, end_date, author:profiles!events_created_by_fkey(name)")
    .eq("academic_year_id", ctx.year.id)
    .eq("event_type", "notice")
    .neq("status", "canceled")
    .lte("start_date", last)
    .gte("end_date", first)
    .order("start_date", { ascending: false });

  const notices: NoticeItem[] = (noticeRows ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    description: n.description,
    start_date: n.start_date,
    end_date: n.end_date,
    author: firstOf(n.author)?.name ?? "",
  }));

  const events = ((rawEvents ?? []) as EventOnDate[]).filter(
    (e) => e.event_type !== "notice"
  );
  const eventIds = [...new Set(events.map((e) => e.event_id))];

  const { data: targetRows } = eventIds.length
    ? await supabase
        .from("event_targets")
        .select("event_id, grade_id, department_id, user_id, classroom:classrooms(class_no, grade_id)")
        .in("event_id", eventIds)
    : { data: [] };

  // 업무 일정의 담당자 — 달력에서 선생님별 색으로 구분합니다.
  const { data: assignRows } = eventIds.length
    ? await supabase
        .from("event_assignments")
        .select("event_id, user_id, status, profile:profiles(name)")
        .in("event_id", eventIds)
    : { data: [] };

  const assignees = new Map<string, Array<{ id: string; name: string; done: boolean }>>();
  for (const a of assignRows ?? []) {
    const list = assignees.get(a.event_id) ?? [];
    list.push({
      id: a.user_id,
      name: firstOf(a.profile)?.name ?? "—",
      done: a.status === "done",
    });
    assignees.set(a.event_id, list);
  }

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

  // 이 달 업무 일정의 담당자 범례 (색이 누구 것인지)
  const visibleIds = new Set(visible.map((e) => e.event_id));
  const legend = new Map<string, string>();
  for (const [eventId, list] of assignees)
    if (visibleIds.has(eventId)) for (const a of list) legend.set(a.id, a.name);

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <NoticeList
          schoolId={schoolId}
          notices={notices}
          today={toISODate(new Date())}
          canPost={ctx.isHead || ctx.isAdmin}
        />

        <div className="min-w-0 flex-1">
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
              // 업무는 교시를 쓰지 않으므로 그리드 대신 오른쪽 열에 모읍니다.
              const isSide = (e: EventOnDate) =>
                e.event_type === "task" || e.category_lane === "side";
              const grid = all.filter((e) => !isSide(e));
              const side = all.filter(isSide);
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
                          assignees={assignees.get(cell.placed.event.event_id) ?? []}
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
                          assignees={assignees.get(e.event_id) ?? []}
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
        </div>
      </div>

      {legend.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-slate-500">업무 담당:</span>
          {[...legend].map(([id, name]) => (
            <span key={id} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-full ${teacherColor(id).dot}`} />
              {name}
            </span>
          ))}
        </div>
      )}

      <p className="no-print mt-3 text-xs text-slate-500">
        일정을 누르면 상세 · 댓글 · 첨부 · 학생 참여 현황으로 이동합니다.
        브라우저 인쇄(Ctrl+P)로 표만 출력됩니다.
      </p>
    </main>
  );
}

interface Assignee {
  id: string;
  name: string;
  done: boolean;
}

function EventChip({
  schoolId,
  event,
  classNos,
  assignees,
}: {
  schoolId: string;
  event: EventOnDate;
  classNos: number[];
  assignees: Assignee[];
}) {
  const label = classNos.length ? compactClassLabel(classNos) : "";
  const isTask = event.event_type === "task";

  // 업무는 담당자 색으로, 학사일정은 분류 색으로 구분합니다.
  // 담당자가 여럿이면 첫 사람 색을 테두리로 쓰고 이름은 모두 적습니다.
  const color = teacherColor(assignees[0]?.id);
  const doneCount = assignees.filter((a) => a.done).length;

  return (
    <Link
      href={`/schools/${schoolId}/events/${event.event_id}`}
      className={
        isTask
          ? `block border-l-4 ${color.border} ${color.chip} rounded-r px-1 py-0.5 text-left leading-tight`
          : `block rounded border px-1 py-0.5 leading-tight ${categoryStyle(event.category_color)}`
      }
    >
      <span className="font-medium">{event.title}</span>
      {!isTask && label && <span className="opacity-70"> ({label})</span>}

      {isTask && assignees.length > 0 && (
        <span className="block text-[11px] opacity-80">
          {assignees.map((a) => a.name).join(", ")}
          {assignees.length > 1 && ` · ${doneCount}/${assignees.length}`}
          {assignees.length === 1 && doneCount === 1 && " ✓"}
        </span>
      )}

      {!isTask && event.location && (
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
