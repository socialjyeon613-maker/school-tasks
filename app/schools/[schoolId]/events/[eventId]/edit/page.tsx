import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext, listMembers } from "@/lib/school";
import { canEditEvent } from "@/lib/permissions";
import EventForm, { type EventInitial } from "../../event-form";
import type { SchoolEvent } from "@/lib/types";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ schoolId: string; eventId: string }>;
}) {
  const { schoolId, eventId } = await params;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const ev = event as SchoolEvent;

  // 최종 판정은 RPC 안의 can_edit_event() 가 합니다.
  // 여기서는 권한 없는 사람에게 폼을 보여주지 않기 위한 화면단 검사입니다.
  if (!canEditEvent(ctx, ev)) redirect(`/schools/${schoolId}/events/${eventId}`);

  const [
    { data: grades },
    { data: classrooms },
    { data: categories },
    { data: periods },
    { data: targets },
    { count: participationCount },
    { data: attachments },
  ] = await Promise.all([
    supabase.from("grades").select("id, grade_no, name").eq("academic_year_id", ctx.year.id).order("grade_no"),
    supabase.from("classrooms").select("id, grade_id, class_no, name").eq("academic_year_id", ctx.year.id).order("class_no"),
    supabase.from("event_categories").select("id, name, color, lane, position").eq("academic_year_id", ctx.year.id).order("position"),
    supabase.from("periods").select("id, no, name").eq("academic_year_id", ctx.year.id).order("no"),
    supabase.from("event_targets").select("classroom_id, grade_id").eq("event_id", eventId),
    supabase.from("participations").select("*", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("event_attachments").select("file_path").eq("event_id", eventId).eq("kind", "file"),
  ]);

  const [members, { data: assignees }, { data: stageRows }, { data: rosterRows }] =
    await Promise.all([
    listMembers(schoolId, ctx.year.id),
    supabase.from("event_assignments").select("user_id").eq("event_id", eventId),
    // 이미 붙은 명단이 있으면 편집 화면에서도 단계를 고칠 수 있어야 합니다.
    supabase
      .from("event_stages")
      .select("id, name, kind")
      .eq("event_id", eventId)
      .order("position"),
    // 어느 단계에 학생이 남아 있는지 — 그 단계만 못 지웁니다
    supabase.from("event_roster").select("stage_id").eq("event_id", eventId),
    ]);

  const initial: EventInitial = {
    id: ev.id,
    title: ev.title,
    categoryId: ev.category_id,
    eventType: ev.event_type,
    startDate: ev.start_date,
    endDate: ev.end_date,
    allDay: ev.all_day,
    periodFrom: ev.period_from,
    periodTo: ev.period_to,
    startTime: ev.start_time,
    location: ev.location,
    requiresParticipation: ev.requires_participation,
    dailyParticipation: ev.daily_participation,
    description: ev.description,
    dueAt: ev.due_at,
    classroomIds: (targets ?? []).map((t) => t.classroom_id).filter(Boolean) as string[],
    gradeIds: (targets ?? []).map((t) => t.grade_id).filter(Boolean) as string[],
    participationCount: participationCount ?? 0,
    assigneeIds: (assignees ?? []).map((a) => a.user_id),
    attachmentPaths: (attachments ?? [])
      .map((a) => a.file_path)
      .filter(Boolean) as string[],
    rosterVisibility: (ev.roster_visibility ?? "assignees") as "assignees" | "school",
    stages: (stageRows ?? []).map((st) => ({
      id: st.id as string,
      name: st.name as string,
      kind: st.kind as "active" | "success" | "fail",
    })),
    stagesInUse: (rosterRows ?? [])
      .map((r) => r.stage_id as string | null)
      .filter((id): id is string => Boolean(id)),
    rosterCount: (rosterRows ?? []).length,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href={`/schools/${schoolId}/events/${eventId}`}
        className="text-sm text-slate-500"
      >
        ← 일정으로 돌아가기
      </Link>
      <h1 className="mb-4 mt-2 text-lg font-bold">일정 편집</h1>

      <EventForm
        schoolId={schoolId}
        yearId={ctx.year.id}
        defaultDate={ev.start_date}
        defaultGradeId=""
        grades={grades ?? []}
        classrooms={classrooms ?? []}
        categories={categories ?? []}
        periods={periods ?? []}
        members={members}
        canPostNotice={ctx.canPostNotice}
        canOpenRoster={ctx.isHead || ctx.isAdmin}
        initial={initial}
      />
    </main>
  );
}
