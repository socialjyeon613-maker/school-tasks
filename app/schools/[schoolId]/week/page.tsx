import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { compactClassLabel, firstOf, teacherColor, toISODate, weekday } from "@/lib/format";
import { buildTargetIndex, matchesGrade } from "@/lib/calendar";
import { clusterByPeriod, shiftDays, slotsFor, weekDates, weekStart } from "@/lib/week";
import { categoryStyle, type EventOnDate } from "@/lib/types";
import ViewSwitch from "../view-switch";

/**
 * 주간 보기 — 세로가 교시, 가로가 요일.
 * 선생님들이 늘 보는 시간표와 같은 모양이라 이번 주에 무엇이 있는지
 * 한눈에 들어옵니다.
 */
export default async function WeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ start?: string; grade?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const start = weekStart(sp.start ?? toISODate(new Date()));
  const days = weekDates(start);
  const last = days[6];

  const [{ data: periods }, { data: grades }] = await Promise.all([
    supabase.from("periods").select("id, no, name").eq("academic_year_id", ctx.year.id).order("no"),
    supabase.from("grades").select("id, grade_no, name").eq("academic_year_id", ctx.year.id).order("grade_no"),
  ]);

  const maxPeriod = periods?.length ? Math.max(...periods.map((p) => p.no)) : 7;
  const gradeId = sp.grade ?? grades?.[0]?.id ?? "";

  const { data: raw } = await supabase
    .from("v_events_by_date")
    .select("*")
    .eq("academic_year_id", ctx.year.id)
    .gte("on_date", start)
    .lte("on_date", last)
    .neq("status", "canceled");

  const all = ((raw ?? []) as EventOnDate[]).filter((e) => e.event_type !== "notice");
  const ids = [...new Set(all.map((e) => e.event_id))];

  const [{ data: targetRows }, { data: assignRows }] = ids.length
    ? await Promise.all([
        supabase
          .from("event_targets")
          .select("event_id, grade_id, department_id, user_id, classroom:classrooms(class_no, grade_id)")
          .in("event_id", ids),
        supabase
          .from("event_assignments")
          .select("event_id, user_id, profile:profiles(name)")
          .in("event_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const targets = buildTargetIndex(
    (targetRows ?? []).map((t) => ({
      event_id: t.event_id,
      grade_id: t.grade_id,
      department_id: t.department_id,
      user_id: t.user_id,
      classroom: firstOf(t.classroom),
    }))
  );

  const owner = new Map<string, { id: string; name: string }>();
  for (const a of assignRows ?? [])
    if (!owner.has(a.event_id))
      owner.set(a.event_id, { id: a.user_id, name: firstOf(a.profile)?.name ?? "—" });

  const visible = gradeId
    ? all.filter((e) => matchesGrade(targets.get(e.event_id), gradeId))
    : all;

  const byDay = new Map<string, EventOnDate[]>();
  for (const e of visible) byDay.set(e.on_date, [...(byDay.get(e.on_date) ?? []), e]);

  // 주말에 아무것도 없으면 열을 숨깁니다 (평일만 보는 게 보통입니다)
  const weekendHas = days.slice(5).some((d) => (byDay.get(d) ?? []).length > 0);
  const shown = weekendHas ? days : days.slice(0, 5);

  const slotsByDay = shown.map((d) =>
    slotsFor(clusterByPeriod(byDay.get(d) ?? [], maxPeriod), maxPeriod)
  );
  const allDayByDay = shown.map((d) => (byDay.get(d) ?? []).filter((e) => e.all_day));
  const hasAllDay = allDayByDay.some((l) => l.length > 0);

  const gradeName = grades?.find((g) => g.id === gradeId)?.name ?? "";
  const nav = (d: number) => `?start=${shiftDays(start, d)}&grade=${gradeId}`;
  const today = toISODate(new Date());

  function Chip({ e }: { e: EventOnDate }) {
    const info = targets.get(e.event_id);
    const label = info?.classNos.length ? compactClassLabel(info.classNos) : "";
    const who = owner.get(e.event_id);
    const isTask = e.event_type === "task";
    const color = teacherColor(who?.id);

    return (
      <Link
        href={`/schools/${schoolId}/events/${e.event_id}`}
        className={
          isTask
            ? `block border-l-4 ${color.border} ${color.chip} rounded-r px-1.5 py-1 text-left leading-tight`
            : `block rounded border px-1.5 py-1 leading-tight ${categoryStyle(e.category_color)}`
        }
      >
        <span className="font-medium">{e.title}</span>
        {label && <span className="opacity-70"> ({label})</span>}
        {isTask && who && (
          <span className="block text-[11px] opacity-80">{who.name}</span>
        )}
        {!isTask && e.location && (
          <span className="block text-[11px] opacity-70">{e.location}</span>
        )}
        {e.requires_participation && (
          <span className="block text-[11px] font-medium opacity-80">참여체크</span>
        )}
      </Link>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">
          {start.slice(0, 4)}. {Number(start.slice(5, 7))}.{Number(start.slice(8))} ~{" "}
          {Number(last.slice(5, 7))}.{Number(last.slice(8))} {gradeName}
        </h1>

        <ViewSwitch schoolId={schoolId} current="week" query={`grade=${gradeId}`} />

        <div className="flex gap-1">
          {(grades ?? []).map((g) => (
            <Link
              key={g.id}
              href={`?start=${start}&grade=${g.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                g.id === gradeId ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Link href={nav(-7)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">←</Link>
          <Link href={`?start=${toISODate(new Date())}&grade=${gradeId}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">이번 주</Link>
          <Link href={nav(7)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">→</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-center text-[13px] print-tight">
          <thead>
            <tr className="bg-amber-50">
              <th className="w-16 border border-slate-300 px-1 py-2">교시</th>
              {shown.map((d) => {
                const wd = weekday(d);
                return (
                  <th
                    key={d}
                    className={`border border-slate-300 px-1 py-2 ${
                      d === today ? "bg-amber-100" : ""
                    } ${wd === "일" ? "text-rose-600" : ""}`}
                  >
                    {Number(d.slice(5, 7))}/{Number(d.slice(8))} ({wd})
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hasAllDay && (
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-1 py-2 text-xs font-medium text-slate-500">
                  종일
                </th>
                {shown.map((d, i) => (
                  <td key={d} className="space-y-0.5 border border-slate-300 p-0.5 align-top">
                    {allDayByDay[i].map((e) => (
                      <Chip key={e.event_id} e={e} />
                    ))}
                  </td>
                ))}
              </tr>
            )}

            {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((no) => (
              <tr key={no}>
                <th className="border border-slate-300 bg-slate-50 px-1 py-2 text-xs font-medium text-slate-500">
                  {no}교시
                </th>
                {shown.map((d, di) => {
                  const slot = slotsByDay[di][no - 1];
                  if (slot.kind === "covered") return null;
                  if (slot.kind === "empty")
                    return <td key={d} className="h-12 border border-slate-300" />;
                  return (
                    <td
                      key={d}
                      rowSpan={slot.span}
                      className="space-y-0.5 border border-slate-300 p-0.5 align-top"
                    >
                      {slot.cluster.events.map((e) => (
                        <Chip key={e.event_id} e={e} />
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">이번 주에 등록된 일정이 없습니다.</p>
      )}
    </main>
  );
}
