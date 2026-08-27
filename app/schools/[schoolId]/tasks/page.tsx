import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { dueLabel, firstOf, formatDateTime, toISODate } from "@/lib/format";
import type { AssignmentStatus } from "@/lib/types";

/**
 * 업무 현황 — 부장·관리자가 "누가 아직 안 냈나" 를 한눈에 보는 화면.
 * 합계가 아니라 미완료자 이름이 보여야 실제로 쓸모가 있습니다.
 */
export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const showAll = sp.all === "1";

  let query = supabase
    .from("events")
    .select("id, title, start_date, due_at, status")
    .eq("academic_year_id", ctx.year.id)
    .eq("event_type", "task")
    .neq("status", "canceled")
    .order("due_at", { nullsFirst: false });

  // 기본은 아직 안 지난 것만 — 지난 업무까지 다 쌓이면 안 봅니다.
  if (!showAll) query = query.gte("start_date", toISODate(new Date()));

  const { data: events } = await query;
  const ids = (events ?? []).map((e) => e.id);

  const { data: rows } = ids.length
    ? await supabase
        .from("event_assignments")
        .select("event_id, user_id, status, submitted_at, profile:profiles(name)")
        .in("event_id", ids)
    : { data: [] };

  const byEvent = new Map<
    string,
    Array<{ name: string; status: AssignmentStatus }>
  >();
  for (const r of rows ?? []) {
    const list = byEvent.get(r.event_id) ?? [];
    list.push({
      name: firstOf(r.profile)?.name ?? "—",
      status: r.status as AssignmentStatus,
    });
    byEvent.set(r.event_id, list);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">업무 현황</h1>
        <Link
          href={showAll ? "?" : "?all=1"}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
        >
          {showAll ? "예정된 것만" : "지난 업무까지"}
        </Link>
        {ctx.canCreateEvent && (
          <Link
            href={`/schools/${schoolId}/events/new`}
            className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white"
          >
            + 업무 등록
          </Link>
        )}
      </div>

      {(events ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          등록된 업무 일정이 없습니다.
          <br />
          일정 등록에서 유형을 <b>업무</b>로 선택하면 여기에 나타납니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {(events ?? []).map((e) => {
            const list = byEvent.get(e.id) ?? [];
            const done = list.filter((a) => a.status === "done");
            const remaining = list.filter((a) => a.status !== "done");
            const due = dueLabel(e.due_at);
            const pct = list.length ? (done.length / list.length) * 100 : 0;

            return (
              <li key={e.id}>
                <Link
                  href={`/schools/${schoolId}/events/${e.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.title}</span>
                    {due && (
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          due.tone === "over"
                            ? "bg-rose-100 text-rose-800"
                            : due.tone === "urgent"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {formatDateTime(e.due_at)} · {due.text}
                      </span>
                    )}
                    <span className="ml-auto text-sm text-slate-500">
                      {list.length > 0
                        ? `${list.length}명 중 ${done.length}명 완료`
                        : "담당자 미배정"}
                    </span>
                  </div>

                  {list.length > 0 && (
                    <>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {remaining.length > 0 && (
                        <p className="mt-2 text-sm text-amber-800">
                          미완료: {remaining.map((a) => a.name).join(", ")}
                        </p>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-500">
        상태는 담당자 본인이 바꾸고, 부장 · 관리자는 배정과 해제를 할 수 있습니다.
      </p>
    </main>
  );
}
