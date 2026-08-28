import Link from "next/link";
import DeleteEvent from "../delete-event";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { firstOf, formatDate, periodLabel } from "@/lib/format";
import { getSessionUser } from "@/lib/supabase/auth";
import { canEditEvent } from "@/lib/permissions";
import { categoryStyle } from "@/lib/types";
import type {
  Absentees,
  DailySummary,
  ClassroomParticipation,
  ParticipationSummary,
  SchoolEvent,
} from "@/lib/types";
import ParticipationGrid from "./participation-grid";
import Assignments from "./assignments";
import RosterBoard, { type RosterRow, type Stage } from "./roster-board";
import Attachments from "./attachments";
import Comments from "./comments";
import DateTabs from "./date-tabs";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string; eventId: string }>;
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const { schoolId, eventId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();
  const me = await getSessionUser(supabase);

  // 대상은 일정 행을 기다릴 필요가 없습니다 — eventId 만 있으면 됩니다.
  const [{ data: event }, { data: targetRows }] = await Promise.all([
    supabase
      .from("events")
      .select("*, category:event_categories(name, color, lane)")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_targets")
      .select("grade:grades(name), classroom:classrooms(name), department:departments(name), profile:profiles(name)")
      .eq("event_id", eventId),
  ]);
  if (!event) notFound();

  const ev = event as SchoolEvent & {
    category: { name: string; color: string; lane: string } | null;
  };

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
  let dailyRows: DailySummary[] = [];
  let onDate = ev.start_date;

  if (ev.requires_participation) {
    if (ev.daily_participation) {
      const { data: ds } = await supabase.rpc("event_daily_summary", { p_event: eventId });
      dailyRows = (ds ?? []) as DailySummary[];
      const wanted = sp.date && dailyRows.some((d) => d.on_date === sp.date) ? sp.date : null;
      // 기본은 '아직 입력이 안 끝난 첫 날' — 오늘 할 일이 바로 열립니다.
      onDate =
        wanted ??
        dailyRows.find((d) => !d.is_complete)?.on_date ??
        dailyRows[0]?.on_date ??
        ev.start_date;
    }

    const [c, a, st] = await Promise.all([
      // 반별 집계는 '숫자만' 이라 학교 구성원 전체가 봅니다 (05_teacher_access.sql).
      supabase.rpc("event_classroom_status", { p_event: eventId, p_on_date: onDate }),
      // 불참자 '이름'은 그대로 잠겨 있습니다 — 자기 반 · 학년부장 · 교장/교감만.
      supabase.from("v_absentees").select("*").eq("event_id", eventId).eq("on_date", onDate).order("classroom_name"),
      // 참여 체크 그리드용. RLS 때문에 내가 볼 수 있는 학생만 돌아옵니다.
      supabase.from("v_event_students").select("*").eq("event_id", eventId).order("number"),
    ]);

    byClass = (c.data ?? []) as ClassroomParticipation[];
    absentees = (a.data ?? []) as Absentees[];

    // 학년/전교 총원은 위 집계를 그대로 합산합니다.
    if (byClass.length) {
      const incomplete = byClass.filter((x) => !x.is_complete);
      summary = {
        event_id: eventId,
        title: ev.title,
        start_date: ev.start_date,
        total: byClass.reduce((n, x) => n + x.total, 0),
        attended: byClass.reduce((n, x) => n + x.attended, 0),
        absent: byClass.reduce((n, x) => n + x.absent, 0),
        pending: byClass.reduce((n, x) => n + x.pending, 0),
        classroom_count: byClass.length,
        classroom_done: byClass.length - incomplete.length,
        pending_classrooms: incomplete.map((x) => x.classroom_name).join(", "),
      };
    }
    students = (st.data ?? []) as typeof students;

    const ids = [...new Set(students.map((x) => x.classroom_id))];
    if (ids.length) {
      const [{ data: cls }, { data: parts }] = await Promise.all([
        supabase
          .from("classrooms")
          .select("id, name")
          .in("id", ids)
          .order("class_no"),
        supabase
          .from("participations")
          .select("student_id, status, reason")
          .eq("event_id", eventId)
          .eq("on_date", onDate),
      ]);
      classrooms = cls ?? [];
      for (const p of parts ?? [])
        marks[p.student_id] = { status: p.status, reason: p.reason };
    }
  }

  // 기본 선택: URL 지정 → 활성 보직의 반 → 첫 번째
  const selectedClass =
    classrooms.find((c) => c.id === sp.class) ??
    classrooms.find((c) => c.id === ctx.activeRole?.classroomId) ??
    classrooms[0] ??
    null;

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

  const canEdit = canEditEvent(ctx, ev);

  // ── 진행 명단 (과학고 진학처럼 반을 가로지르는 학생 관리) ──
  const [{ data: stageRows }, { data: rosterRows }, { data: isAssignee }] =
    await Promise.all([
      supabase.rpc("event_roster_summary", { p_event: eventId }),
      supabase.rpc("event_roster_list", { p_event: eventId }),
      supabase
        .from("event_assignments")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    ]);

  const stages = (stageRows ?? []) as Stage[];
  const roster = (rosterRows ?? []) as RosterRow[];
  // 명단을 고칠 수 있는가 = 일정 편집권자 또는 이 일감 담당자 (DB의 can_manage_roster 와 같은 규칙)
  const canManageRoster = canEdit || Boolean(isAssignee);

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
          {ev.event_type === "notice" && (
            <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
              공지
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="text-xl font-bold">{ev.title}</h1>
          {canEdit && (
            <div className="no-print ml-auto flex shrink-0 gap-2">
              <Link
                href={`/schools/${schoolId}/events/${eventId}/edit`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                편집
              </Link>
              <DeleteEvent
                schoolId={schoolId}
                eventId={eventId}
                title={ev.title}
                rosterCount={roster.length}
              />
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label={ev.event_type === "notice" ? "게시" : "일자"}>
            {formatDate(ev.start_date)}
            {ev.end_date !== ev.start_date && ` ~ ${formatDate(ev.end_date)}`}
          </Row>
          {ev.event_type === "academic" && (
            <>
              <Row label="교시">
                {periodLabel(ev.all_day, ev.period_from, ev.period_to)}
                {ev.start_time && ` · ${ev.start_time.slice(0, 5)}`}
              </Row>
              <Row label="장소">{ev.location || "—"}</Row>
              <Row label="대상">
                {targetNames.length ? targetNames.join(", ") : "전교"}
              </Row>
            </>
          )}
          {ev.event_type === "task" && ev.location && (
            <Row label="비고">{ev.location}</Row>
          )}
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
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">학생 참여 현황</h2>
            <Link
              href={`/schools/${schoolId}/participation?event=${eventId}`}
              className="no-print ml-auto rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
            >
              엑셀 내보내기
            </Link>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            모든 반의 인원수를 볼 수 있습니다. 입력과 학생 이름은 담당 반만 열립니다.
          </p>

          {ev.daily_participation && (
            <DateTabs days={dailyRows} onDate={onDate} classId={selectedClass?.id} />
          )}

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
                <th className="border border-slate-200 px-3 py-1.5 text-right">미입력</th>
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
                      {c.is_homeroom ? (
                        <span className="ml-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          내 반
                        </span>
                      ) : c.can_edit ? (
                        <span className="ml-1 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500">
                          입력가능
                        </span>
                      ) : null}
                    </td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.total}</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.attended}</td>
                    <td className="border border-slate-200 px-3 py-1.5 text-right">{c.absent}</td>
                    <td
                      className={`border border-slate-200 px-3 py-1.5 text-right ${
                        c.pending > 0 ? "font-medium text-amber-700" : "text-slate-400"
                      }`}
                    >
                      {c.pending}
                    </td>
                    <td className="border border-slate-200 px-3 py-1.5 text-slate-600">
                      {/* 이름은 볼 수 있는 반만. 다른 반은 인원수까지만 보입니다. */}
                      {c.can_edit || abs
                        ? (abs?.names ?? "없음")
                        : c.absent > 0
                          ? `${c.absent}명`
                          : "없음"}
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
                    href={`?class=${c.id}${ev.daily_participation ? `&date=${onDate}` : ""}`}
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

          {ev.daily_participation && (
            <DateTabs days={dailyRows} onDate={onDate} classId={selectedClass.id} />
          )}

          <ParticipationGrid
            eventId={eventId}
            classroomId={selectedClass.id}
            classroomName={selectedClass.name}
            onDate={onDate}
            isDaily={ev.daily_participation}
            allDates={dailyRows.map((d) => d.on_date)}
            students={students.filter((s) => s.classroom_id === selectedClass.id)}
            initial={marks}
          />
        </section>
      )}

      {(stages.length > 0 || canManageRoster) && (
        <RosterBoard
          eventId={eventId}
          schoolId={schoolId}
          stages={stages}
          rows={roster}
          canManage={canManageRoster}
          canSetVisibility={ctx.isHead || ctx.isAdmin}
          visibility={(ev.roster_visibility ?? "assignees") as "assignees" | "school"}
        />
      )}

      <Assignments
        eventId={eventId}
        meId={me?.id ?? ""}
        canEdit={canEdit}
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
