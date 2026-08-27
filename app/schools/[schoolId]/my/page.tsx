import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { dueLabel, firstOf, formatDate, formatDateTime, periodLabel, toISODate } from "@/lib/format";
import { categoryStyle, type AssignmentStatus, type EventOnDate } from "@/lib/types";
import MyAssignment from "./my-assignment";
import CalendarSubscribe from "./calendar-subscribe";

/**
 * '내 할 일' — 전 교직원에게 모든 일정을 다 보여주면 아무도 안 봅니다.
 * 내 반 · 내 학년 · 내 부서에 걸린 것만 추립니다.
 */
export default async function MyPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const today = toISODate(new Date());
  const until = toISODate(new Date(Date.now() + 60 * 24 * 3600 * 1000));

  const { data: raw } = await supabase
    .from("v_events_by_date")
    .select("*")
    .eq("academic_year_id", ctx.year.id)
    .gte("on_date", today)
    .lte("on_date", until)
    .neq("status", "canceled")
    .order("on_date");

  const events = (raw ?? []) as EventOnDate[];

  // 날짜별로 펼쳐진 뷰라 같은 일정이 여러 번 나옵니다 — 첫 날짜만 남깁니다.
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.event_id)) return false;
    seen.add(e.event_id);
    return true;
  });

  const ids = unique.map((e) => e.event_id);
  const mine = new Set<string>();

  if (ids.length) {
    // is_my_event() 로 한 번에 거르기 위해 RPC 대신 대상 테이블을 읽습니다.
    const { data: targets } = await supabase
      .from("event_targets")
      .select("event_id, grade_id, classroom_id, department_id, user_id")
      .in("event_id", ids);

    // user_id 조건이 빠지면 전 교직원의 보직을 긁어와
    // 학교의 모든 일정이 '내 할 일'로 나옵니다. RLS 는 좁혀주지 않습니다.
    const { data: roles } = await supabase
      .from("staff_roles")
      .select("grade_id, classroom_id, department_id")
      .eq("academic_year_id", ctx.year.id)
      .eq("user_id", ctx.userId);

    const myGrades = new Set((roles ?? []).map((r) => r.grade_id).filter(Boolean));
    const myClasses = new Set((roles ?? []).map((r) => r.classroom_id).filter(Boolean));
    const myDepts = new Set((roles ?? []).map((r) => r.department_id).filter(Boolean));

    // 내 반이 속한 학년도 내 것으로 봅니다.
    if (myClasses.size) {
      const { data: cls } = await supabase
        .from("classrooms")
        .select("grade_id")
        .in("id", [...myClasses]);
      for (const c of cls ?? []) myGrades.add(c.grade_id);
    }

    const targeted = new Set((targets ?? []).map((t) => t.event_id));
    for (const id of ids) if (!targeted.has(id)) mine.add(id); // 대상 없음 = 전교

    for (const t of targets ?? []) {
      if (
        (t.grade_id && myGrades.has(t.grade_id)) ||
        (t.classroom_id && myClasses.has(t.classroom_id)) ||
        (t.department_id && myDepts.has(t.department_id))
      )
        mine.add(t.event_id);
    }
  }

  const list = unique.filter((e) => mine.has(e.event_id));
  const needsInput = list.filter((e) => e.requires_participation);

  // 나에게 배정된 업무 — RLS 로는 학교 전체가 보이므로 내 것만 추립니다.
  const { data: myRows } = await supabase
    .from("event_assignments")
    .select("event_id, status, submitted_at, event:events(id, title, due_at, status)")
    .eq("user_id", ctx.userId);

  const myTasks = (myRows ?? [])
    .map((r) => {
      const e = firstOf(r.event);
      return e && e.status !== "canceled"
        ? {
            eventId: e.id,
            title: e.title,
            dueAt: e.due_at as string | null,
            status: r.status as AssignmentStatus,
            submittedAt: r.submitted_at as string | null,
          }
        : null;
    })
    .filter(Boolean) as Array<{
      eventId: string;
      title: string;
      dueAt: string | null;
      status: AssignmentStatus;
      submittedAt: string | null;
    }>;

  // 마감 임박 순, 완료된 것은 뒤로
  myTasks.sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done"))
      return a.status === "done" ? 1 : -1;
    return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
  const openTasks = myTasks.filter((t) => t.status !== "done");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-lg font-bold">내 할 일</h1>
      <p className="mb-5 text-sm text-slate-500">
        앞으로 60일 안에 나와 관련된 일정입니다.
      </p>

      {myTasks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            내가 맡은 업무
            {openTasks.length > 0 && (
              <span className="ml-1 text-amber-700">· 미완료 {openTasks.length}건</span>
            )}
          </h2>
          <ul className="space-y-2">
            {myTasks.map((t) => (
              <MyAssignment
                key={t.eventId}
                schoolId={schoolId}
                eventId={t.eventId}
                userId={ctx.userId}
                title={t.title}
                status={t.status}
                due={dueLabel(t.dueAt)}
                dueText={formatDateTime(t.dueAt)}
                submittedText={formatDateTime(t.submittedAt)}
              />
            ))}
          </ul>
        </section>
      )}

      {needsInput.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-amber-700">
            참여 입력이 필요한 일정 {needsInput.length}건
          </h2>
          <ul className="space-y-2">
            {needsInput.map((e) => (
              <EventRow key={e.event_id} schoolId={schoolId} event={e} />
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold text-slate-600">
        전체 {list.length}건
      </h2>
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          예정된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <EventRow key={e.event_id} schoolId={schoolId} event={e} />
          ))}
        </ul>
      )}

      <CalendarSubscribe schoolId={schoolId} />
    </main>
  );
}

function EventRow({ schoolId, event }: { schoolId: string; event: EventOnDate }) {
  return (
    <li>
      <Link
        href={`/schools/${schoolId}/events/${event.event_id}`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-400"
      >
        <span className="w-20 shrink-0 text-sm font-medium text-slate-500">
          {formatDate(event.on_date)}
        </span>
        <span className="flex-1">
          <span className="font-medium">{event.title}</span>
          <span className="ml-2 text-xs text-slate-500">
            {periodLabel(event.all_day, event.period_from, event.period_to)}
            {event.location && ` · ${event.location}`}
          </span>
        </span>
        {event.requires_participation && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            참여체크
          </span>
        )}
        {event.category_name && (
          <span
            className={`rounded border px-2 py-0.5 text-xs ${categoryStyle(event.category_color)}`}
          >
            {event.category_name}
          </span>
        )}
      </Link>
    </li>
  );
}
