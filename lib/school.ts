import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import { firstOf } from "@/lib/format";
import { cookies } from "next/headers";
import {
  ACTIVE_ROLE_COOKIE,
  STAFF_ROLE_LABEL,
  type MemberRole,
  type MyStaffRole,
  type SchoolContext,
  type StaffRoleKind,
} from "@/lib/types";

/**
 * 현재 사용자가 속한 학교 목록 (현재 학년도 기준).
 *
 * ※ RLS 의 members_select 는 "같은 학교 구성원이면 조회 가능" 이라
 *   조건을 안 걸면 그 학교의 **모든 교직원 행**이 돌아옵니다.
 *   RLS 는 볼 수 있는 범위를 정할 뿐, 내 행만 골라주지 않습니다.
 *   반드시 user_id 로 좁혀야 합니다.
 */
export async function listMySchools() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return [];

  const { data } = await supabase
    .from("school_members")
    .select(
      "role, school:schools(id, name, kind), year:academic_years!inner(id, year, name, is_current)"
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .eq("academic_years.is_current", true);

  const rows = (data ?? []) as unknown as Array<{
    role: MemberRole;
    school: { id: string; name: string; kind: string };
    year: { id: string; year: number; name: string; is_current: boolean };
  }>;

  // 한 사람이 같은 학교에 여러 보직을 가질 수 있으므로 학교 단위로 한 번만.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (!r.school || seen.has(r.school.id)) return false;
    seen.add(r.school.id);
    return true;
  });

  // 각 학교에서 내가 맡은 보직 (3학년 부장 · 3-2 담임 …)
  const yearIds = unique.map((r) => r.year.id);
  const dutiesBySchool = new Map<string, string[]>();

  if (yearIds.length) {
    const { data: roles } = await supabase
      .from("staff_roles")
      .select(
        "role, academic_year_id, school_id, grade:grades(name), classroom:classrooms(name), department:departments(name)"
      )
      .eq("user_id", user.id)
      .in("academic_year_id", yearIds);

    for (const r of roles ?? []) {
      const scope =
        firstOf(r.classroom)?.name ??
        firstOf(r.grade)?.name ??
        firstOf(r.department)?.name ??
        "";
      const kind = r.role as StaffRoleKind;
      const label = `${scope} ${STAFF_ROLE_LABEL[kind] ?? r.role}`.trim();
      const list = dutiesBySchool.get(r.school_id) ?? [];
      list.push(label);
      dutiesBySchool.set(r.school_id, list);
    }
  }

  return unique.map((r) => ({
    ...r,
    duties: dutiesBySchool.get(r.school.id) ?? [],
  }));
}

/**
 * 학교 하나에 대한 현재 사용자의 맥락 — 신분, 담임 반, 부장 학년.
 * 권한의 최종 판정은 DB의 RLS 가 하고, 이 값은 화면을 그리기 위한 것입니다.
 */
export async function getSchoolContext(
  schoolId: string
): Promise<SchoolContext | null> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return null;

  const { data: year } = await supabase
    .from("academic_years")
    .select("id, school_id, year, name, is_current")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();
  if (!year) return null;

  const { data: school } = await supabase
    .from("schools")
    .select("id, name, kind, allowed_domains")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return null;

  const { data: member } = await supabase
    .from("school_members")
    .select("role")
    .eq("academic_year_id", year.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!member) return null;

  const { data: roleRows } = await supabase
    .from("staff_roles")
    .select(
      "id, role, grade_id, classroom_id, department_id, grade:grades(name), classroom:classrooms(name), department:departments(name)"
    )
    .eq("academic_year_id", year.id)
    .eq("user_id", user.id);

  const roles: MyStaffRole[] = (roleRows ?? []).map((r) => {
    const kind = r.role as StaffRoleKind;
    const scopeName =
      firstOf(r.classroom)?.name ??
      firstOf(r.grade)?.name ??
      firstOf(r.department)?.name ??
      "";
    return {
      id: r.id,
      role: kind,
      scopeName,
      label: `${scopeName} ${STAFF_ROLE_LABEL[kind] ?? kind}`.trim(),
      classroomId: r.classroom_id,
      gradeId: r.grade_id,
      departmentId: r.department_id,
    };
  });

  // 보직이 여럿이면 쿠키에 기억해 둔 것을, 없으면 첫 번째를 씁니다.
  // 어디까지나 화면 기본값이고 권한과는 무관합니다.
  const cookieStore = await cookies();
  const savedId = cookieStore.get(ACTIVE_ROLE_COOKIE(schoolId))?.value;
  const activeRole =
    roles.find((r) => r.id === savedId) ?? roles[0] ?? null;

  const homeroomClassroomIds = roles
    .filter((r) => r.classroomId && (r.role === "homeroom" || r.role === "co_homeroom"))
    .map((r) => r.classroomId as string);

  const headGradeIds = roles
    .filter((r) => r.role === "head" && r.gradeId)
    .map((r) => r.gradeId as string);

  const isHead = roles.some((r) => r.role === "head");
  const isAdmin = ["principal", "vice_principal", "admin"].includes(member.role);

  return {
    school,
    year,
    userId: user.id,
    role: member.role as MemberRole,
    roles,
    activeRole,
    homeroomClassroomIds,
    headGradeIds,
    isHead,
    // 일정 등록은 학교 구성원 누구나 (05_teacher_access.sql)
    canCreateEvent: true,
    isAdmin,
  };
}
