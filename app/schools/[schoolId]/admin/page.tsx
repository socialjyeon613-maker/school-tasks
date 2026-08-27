import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { ROLE_LABEL, type MemberRole } from "@/lib/types";
import GradeSetup from "./grade-setup";
import StudentImport from "./student-import";
import InviteLink from "./invite-link";
import StaffRoles from "./staff-roles";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();
  if (!ctx.isAdmin) redirect(`/schools/${schoolId}/calendar`);

  const supabase = await createClient();
  const [{ data: grades }, { data: classrooms }, { data: members }, { data: roles }] =
    await Promise.all([
      supabase.from("grades").select("id, grade_no, name").eq("academic_year_id", ctx.year.id).order("grade_no"),
      supabase.from("classrooms").select("id, grade_id, class_no, name").eq("academic_year_id", ctx.year.id).order("class_no"),
      supabase.from("school_members").select("user_id, role, profile:profiles(name, email)").eq("academic_year_id", ctx.year.id),
      supabase.from("staff_roles").select("id, user_id, role, grade_id, classroom_id, department_id").eq("academic_year_id", ctx.year.id),
    ]);

  // 반별 학생 수 (RLS 상 관리자는 전교가 보입니다)
  const { data: studentRows } = await supabase
    .from("students")
    .select("classroom_id")
    .eq("academic_year_id", ctx.year.id)
    .eq("status", "enrolled");

  const counts = new Map<string, number>();
  for (const s of studentRows ?? [])
    counts.set(s.classroom_id, (counts.get(s.classroom_id) ?? 0) + 1);

  const memberList = (members ?? []).map((m) => ({
    user_id: m.user_id,
    role: m.role as MemberRole,
    name: (m.profile as unknown as { name: string } | null)?.name ?? "—",
    email: (m.profile as unknown as { email: string } | null)?.email ?? "",
  }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-bold">관리</h1>

      <Section title="1. 학년 · 반 편성">
        <GradeSetup yearId={ctx.year.id} />
        {(grades ?? []).length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {(grades ?? []).map((g) => (
              <li key={g.id}>
                <span className="font-medium">{g.name}</span>
                <span className="ml-2 text-slate-500">
                  {classrooms?.filter((c) => c.grade_id === g.id).length ?? 0}개 반
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="2. 학생 명단">
        <StudentImport
          classrooms={(classrooms ?? []).map((c) => ({
            ...c,
            count: counts.get(c.id) ?? 0,
          }))}
        />
      </Section>

      <Section title="3. 교직원 초대">
        <InviteLink schoolId={schoolId} yearId={ctx.year.id} />
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="border border-slate-200 px-3 py-1.5">이름</th>
              <th className="border border-slate-200 px-3 py-1.5">이메일</th>
              <th className="border border-slate-200 px-3 py-1.5">신분</th>
            </tr>
          </thead>
          <tbody>
            {memberList.map((m) => (
              <tr key={m.user_id}>
                <td className="border border-slate-200 px-3 py-1.5 font-medium">{m.name}</td>
                <td className="border border-slate-200 px-3 py-1.5 text-slate-600">{m.email}</td>
                <td className="border border-slate-200 px-3 py-1.5">{ROLE_LABEL[m.role]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="4. 보직 배정 (담임 · 부장)">
        <p className="mb-3 text-sm text-slate-500">
          담임을 배정해야 그 선생님에게 해당 반 학생이 보입니다. 배정 전에는 아무 학생도 보이지 않습니다.
        </p>
        <StaffRoles
          schoolId={schoolId}
          yearId={ctx.year.id}
          members={memberList}
          grades={grades ?? []}
          classrooms={classrooms ?? []}
          existing={roles ?? []}
        />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
