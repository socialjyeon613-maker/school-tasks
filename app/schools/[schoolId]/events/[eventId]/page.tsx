import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { firstOf, formatDate, periodLabel } from "@/lib/format";
import { getSessionUser } from "@/lib/supabase/auth";
import { categoryStyle } from "@/lib/types";
import type {
  Absentees,
  ClassroomParticipation,
  ParticipationSummary,
  SchoolEvent,
} from "@/lib/types";
import ParticipationGrid from "./participation-grid";
import Assignments from "./assignments";
import Attachments from "./attachments";
import Comments from "./comments";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string; eventId: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { schoolId, eventId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const me = await getSessionUser(supabase);

  const { data: event } = await supabase
    .from("events")
    .select("*, category:event_categories(name, color, lane)")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const ev = event as SchoolEvent & {
    category: { name: string; color: string; lane: string } | null;
  };

  const { data: targetRows } = await supabase
    .from("event_targets")
    .select("grade:grades(name), classroom:classrooms(name), department:departments(name), profile:profiles(name)")
    .eq("event_id", eventId);

  const targetNames = (targetRows ?? [])
    .map(
      (t) =>
        firstOf(t.grade)?.name ??
        firstOf(t.classroom)?.name ??
        firstOf(t.department)?.name ??
        firstOf(t.profile)?.name
    )
    .filter(Boolean) as string[];

  // ── 학생 참여 ────────────────────────────────────────────
  let summary: ParticipationSummary | null = null;
  let byClass: ClassroomParticipation[] = [];
  let absentees: Absentees[] = [];
  let students: Array<{ student_id: string; classroom_id: string; number: number; name: string }> = [];
  let marks: Record<string, { status: string; reason: string }> = {};
  let classrooms: Array<{ id: string; name: string }> = [];

  if (ev.requires_participation) {
    const [s, c, a, st] = await Promise.all([
      supabase.from("v_participation_summary").select("*").eq("event_id", eventId).maybeSingle(),
      supabase.from("v_participation_by_classroom").select("*").eq("event_id", eventId).order("classroom_name"),
      supabase.from("v_absentees").select("*").eq("event_id", eventId).order("classroom_name"),
      // RLS 때문에 내가 볼 수 있는 학생만 돌아옵니다.
      supabase.from("v_event_students").select("*").eq("event_id", eventId).order("number"),
    ]);

    summary = s.data as ParticipationSummary | null;
    byClass = (c.data ?? []) as ClassroomParticipation[];
    absentees = (a.data ?? []) as Absentees[];
    students = (st.data ?? []) as typeof students;

    const ids = [...new Set(students.map((x) => x.classroom_id))];
    if (ids.length) {
      const { data: cls } = await supabase
        .from("classrooms")
        .select("id, name")
        .in("id", ids)
        .order("class_no");
      classrooms = cls ?? [];

      const { data: parts } = await supabase
        .from("participations")
        .select("student_id, status, reason")
        .eq("event_id", eventId);
      for (const p of parts ?? [])
        marks[p.student_id] = { status: p.status, reason: p.reason };
    }
  }

  const selectedClass =
    classrooms.find((c) => c.id === sp.class) ?? classrooms[0] ?? null;

  // ── 업무 배정 후보 (교직원 + 담임 정보) ──────────────────
  const [{ data: memberRows }, { data: roleRows }, { data: gradeRows }] =
    await Promise.all([
      supabase
        .from("school_members")
        .select("user_id, profile:profiles(name, email)")
        .eq("academic_year_id", ctx.year.id)
        .eq("status", "active"),
      supabase
        .from("staff_roles")
        .select("user_id, role, classroom:classrooms(name, grade_id)")
        .eq("academic_year_id", ctx.year.id)
        .in("role", ["homeroom", "co_homeroom"]),
      supabase
        .from("grades")
        .select("id, name")
        .eq("academic_year_id", ctx.year.id)
        .order("grade_no"),
    ]);

  const homeroomBy = new Map<string, { name: string; gradeId: string }>();
  for (const r of roleRows ?? []) {
    const c = firstOf(r.classroom);
    if (c) homeroomBy.set(r.user_id, { name: c.name, gradeId: c.grade_id });
  }

  const candidates = (memberRows ?? []).map((m) => {
    const p = firstOf(m.profile);
    const hr = homeroomBy.get(m.user_id);
    return {
      user_id: m.user_id,
      name: p?.name ?? "—",
      email: p?.email ?? "",
      homeroomOf: hr?.name ?? null,
      gradeId: hr?.gradeId ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href={`/schools/${schoolId}/calendar?month=${ev.start_date.slice(0, 4)}-${Number(ev.start_date.slice(5, 7))}`}
        className="no-print text-sm text-slate-500"
      >
        ← 학사일정
      </Link>

      {/* 일정 정보 */}
      <section className="mt-3 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-2">
          {ev.category && (
            <span
              className={`rounded border px-2 py-0.5 text-xs font-medium ${categoryStyle(ev.category.color)}`}
            >
              {ev.category.name}
            </span>
          )}
          {ev.event_type === "task" && (
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs text-white">
              업무
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="text-xl font-bold">{ev.title}</h1>
          {(ctx.canCreateEvent ||
            ev.created_by === ctx.userId ||
            ev.owner_id === ctx.userId) && (
            <Link
              href={`/schools/${schoolId}/events/${eventId}/edit`}
              className="no-print ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
            >
              편집
            </Link>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="일자">
            {formatDate(ev.start_date)}
            {ev.end_date !== ev.start_date && ` ~ ${formatDate(ev.end_date)}`}
          </Row>
          <Row label="교시">
            {periodLabel(ev.all_day, ev.period_from, ev.period_to)}
            {ev.start_time && ` · ${ev.start_time.slice(0, 5)}`}
          </Row>
          <Row label="장소">{ev.location || "—"}</Row>
          <Row label="대상">
            {targetNames.length ? targetNames.join(", ") : "전교"}
          </Row>
        </dl>

        {ev.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
            {ev.description}
          </p>
        )}
      </section>

      {/* 부장 현황판 */}
      {ev.requires_participation && summary && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 font-semibold">학생 참여 현황</h2>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="대상" value={summary.total} />
            <Stat label="참여" value={summary.attended} tone="emerald" />
            <Stat label="불참" value={summary.absent} tone="rose" />
            <Stat label="미입력" value={summary.pending} tone="amber" />
          </div>

          {summary.pending_classrooms && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              아직 입력하지 않은 반: <b>{summary.pending_classrooms}</b>
              <span className="ml-1 text-amber-600">
                ({summary.classroom_done}/{summary.classroom_count}개 반 완료)
              </span>
            </p>
          )}

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="border border-slate-200 px-3 py-1.5">반</th>
                <th className="border border-slate-200 px-3 py-1.5 text-right">대상</th>
                <th className="border border-slate-200 px-3 py-1.5 text-right">참여</th>
                <th className="border border-slate-200 px-3 py-1.5 text-right">불참</th>
                <th className="border border-slate-200 px-3 py-1.5">불참자</th>
              </tr>
            </thead>
            <tbody>
              {byClass.map((c) => {
                const abs = absentees.find((a) => a.classroom_id === c.classroom_id);
                return (
                  <tr key={c.classroom_id}>
                    <td className="border border-slate-200 px-3 py-1.5 font-medium">
                      {c.classroom_name}
                      {!c.is_complete && (
                        <span className="ml-1 text-xs text-amber-600">미입력</span>
                      )}
                    </td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.total}</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.attended}</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.absent}</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-600">
                      {abs?.names ?? "없음"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* 담임 체크 그리드 */}
      {ev.requires_participation && selectedClass && (
        <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">참여 체크</h2>
            {classrooms.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {classrooms.map((c) => (
                  <Link
                    key={c.id}
                    href={`?class=${c.id}`}
                    className={`rounded px-2.5 py-1 text-sm ${
                      c.id === selectedClass.id
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 text-slate-600"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <ParticipationGrid
            eventId={eventId}
            classroomId={selectedClass.id}
            classroomName={selectedClass.name}
            students={students.filter((s) => s.classroom_id === selectedClass.id)}
            initial={marks}
          />
        </section>
      )}

      <Assignments
        eventId={eventId}
        meId={me?.id ?? ""}
        canEdit={ctx.canCreateEvent}
        dueAt={ev.due_at}
        candidates={candidates}
        grades={gradeRows ?? []}
      />

      <Attachments schoolId={schoolId} eventId={eventId} meId={me?.id ?? ""} />

      <Comments eventId={eventId} meId={me?.id ?? ""} />
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-12 shrink-0 text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "rose" | "amber";
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-slate-900";

  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
