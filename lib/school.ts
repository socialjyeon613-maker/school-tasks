import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";
import type { MemberRole, SchoolContext } from "@/lib/types";

/**
 * 현재 사용자가 속한 학교 목록 (현재 학년도 기준).
 * RLS 때문에 자기가 속한 학교만 돌아옵니다.
 */
export async function listMySchools() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_members")
    .select("role, school:schools(id, name, kind), year:academic_years!inner(id, year, name, is_current)")
    .eq("status", "active")
    .eq("academic_years.is_current", true);

  return (data ?? []) as unknown as Array<{
    role: MemberRole;
    school: { id: string; name: string; kind: string };
    year: { id: string; year: number; name: string; is_current: boolean };
  }>;
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

  const { data: roles } = await supabase
    .from("staff_roles")
    .select("role, grade_id, classroom_id, department_id")
    .eq("academic_year_id", year.id)
    .eq("user_id", user.id);

  const homeroomClassroomIds = (roles ?? [])
    .filter((r) => r.classroom_id && (r.role === "homeroom" || r.role === "co_homeroom"))
    .map((r) => r.classroom_id as string);

  const headGradeIds = (roles ?? [])
    .filter((r) => r.role === "head" && r.grade_id)
    .map((r) => r.grade_id as string);

  const isHead = (roles ?? []).some((r) => r.role === "head");
  const isAdmin = ["principal", "vice_principal", "admin"].includes(member.role);

  return {
    school,
    year,
    userId: user.id,
    role: member.role as MemberRole,
    homeroomClassroomIds,
    headGradeIds,
    canCreateEvent: isHead || isAdmin,
    isAdmin,
  };
}
