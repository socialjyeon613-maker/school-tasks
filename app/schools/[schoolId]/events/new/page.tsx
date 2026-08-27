import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import EventForm from "../event-form";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ date?: string; grade?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();
  if (!ctx.canCreateEvent) redirect(`/schools/${schoolId}/calendar`);

  const supabase = await createClient();
  const [{ data: grades }, { data: classrooms }, { data: categories }, { data: periods }] =
    await Promise.all([
      supabase.from("grades").select("id, grade_no, name").eq("academic_year_id", ctx.year.id).order("grade_no"),
      supabase.from("classrooms").select("id, grade_id, class_no, name").eq("academic_year_id", ctx.year.id).order("class_no"),
      supabase.from("event_categories").select("id, name, color, lane, position").eq("academic_year_id", ctx.year.id).order("position"),
      supabase.from("periods").select("id, no, name").eq("academic_year_id", ctx.year.id).order("no"),
    ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-lg font-bold">일정 등록</h1>
      <EventForm
        schoolId={schoolId}
        yearId={ctx.year.id}
        defaultDate={sp.date ?? ""}
        defaultGradeId={sp.grade ?? ""}
        grades={grades ?? []}
        classrooms={classrooms ?? []}
        categories={categories ?? []}
        periods={periods ?? []}
      />
    </main>
  );
}
