import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
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
  const canEdit =
    ctx.canCreateEvent ||
    ev.created_by === ctx.userId ||
    ev.owner_id === ctx.userId;
  if (!canEdit) redirect(`/schools/${schoolId}/events/${eventId}`);

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
    dueAt: ev.due_at,
    classroomIds: (targets ?? []).map((t) => t.classroom_id).filter(Boolean) as string[],
    gradeIds: (targets ?? []).map((t) => t.grade_id).filter(Boolean) as string[],
    participationCount: participationCount ?? 0,
    attachmentPaths: (attachments ?? [])
      .map((a) => a.file_path)
      .filter(Boolean) as string[],
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
        initial={initial}
      />
    </main>
  );
}
