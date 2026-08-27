import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { firstOf } from "@/lib/format";
import { encodeClassNos, type EventRow } from "@/lib/excel-schema";
import ExportEvents from "./export-events";
import ImportEvents from "./import-events";

/**
 * 일정 내보내기 / 가져오기.
 *
 * 새 학년도를 시작할 때 작년 일정을 엑셀로 뽑아 고친 뒤 다시 넣는 흐름입니다.
 * 학교 일정은 해마다 대부분 반복되므로, 처음부터 다시 입력할 일이 없습니다.
 */
export default async function TransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  const supabase = await createClient();

  const { data: years } = await supabase
    .from("academic_years")
    .select("id, year, name, is_current")
    .eq("school_id", schoolId)
    .order("year", { ascending: false });

  const sourceYear =
    years?.find((y) => y.id === sp.year) ??
    years?.find((y) => y.is_current) ??
    years?.[0];

  // 내보낼 일정 — 선택한 학년도 전체
  const { data: rawEvents } = sourceYear
    ? await supabase
        .from("events")
        .select(
          "id, event_type, title, description, start_date, end_date, all_day, period_from, period_to, start_time, location, requires_participation, daily_participation, due_at, category:event_categories(name)"
        )
        .eq("academic_year_id", sourceYear.id)
        .neq("status", "canceled")
        .order("start_date")
    : { data: [] };

  const ids = (rawEvents ?? []).map((e) => e.id);

  const [{ data: targets }, { data: assigns }] = ids.length
    ? await Promise.all([
        supabase
          .from("event_targets")
          .select("event_id, grade:grades(grade_no), classroom:classrooms(class_no, grade:grades(grade_no))")
          .in("event_id", ids),
        supabase
          .from("event_assignments")
          .select("event_id, profile:profiles(email)")
          .in("event_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  // 일정별 대상 학년 / 반 번호
  const gradeOf = new Map<string, number>();
  const classesOf = new Map<string, number[]>();
  for (const t of targets ?? []) {
    const g = firstOf(t.grade);
    const c = firstOf(t.classroom);
    if (g) gradeOf.set(t.event_id, g.grade_no);
    if (c) {
      const cg = firstOf(c.grade);
      if (cg) gradeOf.set(t.event_id, cg.grade_no);
      classesOf.set(t.event_id, [...(classesOf.get(t.event_id) ?? []), c.class_no]);
    }
  }

  const emailsOf = new Map<string, string[]>();
  for (const a of assigns ?? []) {
    const email = firstOf(a.profile)?.email;
    if (email)
      emailsOf.set(a.event_id, [...(emailsOf.get(a.event_id) ?? []), email]);
  }

  const rows: EventRow[] = (rawEvents ?? []).map((e) => ({
    type: e.event_type,
    category: firstOf(e.category)?.name ?? "",
    title: e.title,
    start_date: e.start_date,
    end_date: e.end_date,
    all_day: e.all_day,
    period_from: e.period_from,
    period_to: e.period_to,
    start_time: e.start_time ? String(e.start_time).slice(0, 5) : "",
    location: e.location ?? "",
    grade_no: gradeOf.get(e.id) ?? null,
    class_nos: classesOf.get(e.id) ?? [],
    requires_participation: e.requires_participation,
    daily_participation: e.daily_participation,
    due_at: e.due_at ? String(e.due_at).slice(0, 16).replace("T", " ") : "",
    assignee_emails: emailsOf.get(e.id) ?? [],
    description: e.description ?? "",
  }));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold">일정 내보내기 · 가져오기</h1>
        <p className="mt-1 text-sm text-slate-500">
          학교 일정은 해마다 대부분 반복됩니다. 작년 것을 엑셀로 뽑아 날짜만
          고쳐서 새 학년도에 넣으면 처음부터 입력할 일이 없습니다.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 font-semibold">1. 내보내기</h2>
        <p className="mb-3 text-sm text-slate-500">
          {sourceYear?.name}의 일정 <b>{rows.length}건</b>
        </p>

        {(years?.length ?? 0) > 1 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {(years ?? []).map((y) => (
              <Link
                key={y.id}
                href={`?year=${y.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  y.id === sourceYear?.id
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-600"
                }`}
              >
                {y.name}
              </Link>
            ))}
          </div>
        )}

        <ExportEvents
          rows={rows}
          fileName={`${ctx.school.name}_${sourceYear?.year ?? ""}_일정`}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 font-semibold">2. 가져오기</h2>
        <p className="mb-3 text-sm text-slate-500">
          내보낸 파일을 고쳐서 올리면 <b>{ctx.year.name}</b>에 추가됩니다.
        </p>
        <ImportEvents
          schoolId={schoolId}
          yearId={ctx.year.id}
          yearLabel={ctx.year.name}
          sourceYear={sourceYear?.year ?? ctx.year.year}
          targetYear={ctx.year.year}
        />
      </section>
    </main>
  );
}
