import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { toISODate } from "@/lib/format";
import ExportParticipation, {
  type Checkpoint,
  type ClassSheet,
} from "./export-participation";

/**
 * 참여 현황 엑셀 내보내기.
 *
 * 지금 쓰시는 구글시트(반별 탭 + 총원 + 불참)와 같은 모양으로 뽑습니다.
 * 익숙한 형태여야 인수인계와 대외 보고에 그대로 쓸 수 있습니다.
 *
 * ※ RLS 때문에 내가 볼 수 있는 반만 담깁니다.
 *   담임이 뽑으면 자기 반, 학년부장은 자기 학년, 교감은 전교.
 */
export default async function ParticipationPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ from?: string; to?: string; event?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();

  const now = new Date();
  const from = sp.from ?? toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = sp.to ?? toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  let q = supabase
    .from("events")
    .select("id, title, start_date, end_date, daily_participation")
    .eq("academic_year_id", ctx.year.id)
    .eq("requires_participation", true)
    .neq("status", "canceled")
    .order("start_date");

  if (sp.event) q = q.eq("id", sp.event);
  else q = q.gte("start_date", from).lte("start_date", to);

  const { data: events } = await q;
  const ids = (events ?? []).map((e) => e.id);

  // 체크 지점 = (일정, 날짜). 매일 출석이면 날짜마다 한 칸씩 생깁니다.
  const checkpoints: Checkpoint[] = [];
  for (const e of events ?? []) {
    if (e.daily_participation) {
      const d = new Date(e.start_date + "T00:00:00");
      const end = new Date(e.end_date + "T00:00:00");
      while (d <= end) {
        checkpoints.push({ eventId: e.id, title: e.title, onDate: toISODate(d) });
        d.setDate(d.getDate() + 1);
      }
    } else {
      checkpoints.push({ eventId: e.id, title: e.title, onDate: e.start_date });
    }
  }

  // RLS 상 내가 볼 수 있는 학생만 돌아옵니다.
  const [{ data: students }, { data: parts }] = ids.length
    ? await Promise.all([
        supabase
          .from("v_event_students")
          .select("event_id, student_id, classroom_id, number, name")
          .in("event_id", ids),
        supabase
          .from("participations")
          .select("event_id, student_id, on_date, status, reason")
          .in("event_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const classIds = [...new Set((students ?? []).map((s) => s.classroom_id))];
  const { data: classrooms } = classIds.length
    ? await supabase
        .from("classrooms")
        .select("id, name, class_no")
        .in("id", classIds)
        .order("class_no")
    : { data: [] };

  // 학생별 (일정,날짜) → 상태
  const markOf = new Map<string, { status: string; reason: string }>();
  for (const p of parts ?? [])
    markOf.set(`${p.event_id}|${p.student_id}|${p.on_date}`, {
      status: p.status,
      reason: p.reason ?? "",
    });

  const sheets: ClassSheet[] = (classrooms ?? []).map((c) => {
    // 같은 학생이 여러 일정에 걸쳐 나오므로 학생 단위로 접습니다.
    const roster = new Map<string, { number: number; name: string }>();
    for (const s of students ?? [])
      if (s.classroom_id === c.id)
        roster.set(s.student_id, { number: s.number, name: s.name });

    const list = [...roster.entries()]
      .map(([id, v]) => ({ studentId: id, ...v }))
      .sort((a, b) => a.number - b.number);

    return {
      classroomId: c.id,
      classroomName: c.name,
      students: list.map((s) => ({
        ...s,
        marks: checkpoints.map((cp) => {
          // 그 일정의 대상이 아닌 학생은 칸을 비웁니다.
          const isTarget = (students ?? []).some(
            (x) => x.event_id === cp.eventId && x.student_id === s.studentId
          );
          if (!isTarget) return { status: "n/a", reason: "" };
          return (
            markOf.get(`${cp.eventId}|${s.studentId}|${cp.onDate}`) ?? {
              status: "pending",
              reason: "",
            }
          );
        }),
      })),
    };
  });

  const monthLink = (offset: number) => {
    const base = new Date(from + "T00:00:00");
    base.setMonth(base.getMonth() + offset);
    const f = toISODate(new Date(base.getFullYear(), base.getMonth(), 1));
    const t = toISODate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    return `?from=${f}&to=${t}`;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold">참여 현황 내보내기</h1>
        <p className="mt-1 text-sm text-slate-500">
          반별 명렬표 · 총원 · 불참자 명단을 한 파일로 뽑습니다.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        {!sp.event && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Link
              href={monthLink(-1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              ←
            </Link>
            <span className="text-sm font-medium">
              {from.slice(0, 4)}년 {Number(from.slice(5, 7))}월
            </span>
            <Link
              href={monthLink(1)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
            >
              →
            </Link>
          </div>
        )}

        {checkpoints.length === 0 ? (
          <p className="text-sm text-slate-500">
            이 기간에 학생 참여 체크가 있는 일정이 없습니다.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm">
              일정 <b>{events?.length ?? 0}건</b> · 체크 지점{" "}
              <b>{checkpoints.length}칸</b> · 내가 볼 수 있는 반{" "}
              <b>{sheets.length}개</b>
            </p>
            <ul className="mb-4 space-y-0.5 text-xs text-slate-600">
              {checkpoints.slice(0, 8).map((c, i) => (
                <li key={i}>
                  {c.onDate.slice(5).replace("-", "/")} {c.title}
                </li>
              ))}
              {checkpoints.length > 8 && (
                <li className="text-slate-400">… 외 {checkpoints.length - 8}칸</li>
              )}
            </ul>

            <ExportParticipation
              checkpoints={checkpoints}
              sheets={sheets}
              fileName={`${ctx.school.name}_참여현황_${from.slice(0, 7).replace("-", "")}`}
            />

            {sheets.length === 0 && (
              <p className="mt-2 text-sm text-amber-700">
                담당하는 반이 없어 내보낼 명단이 없습니다.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
