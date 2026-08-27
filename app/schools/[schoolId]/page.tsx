import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSchoolContext } from "@/lib/school";
import { ACTIVE_ROLE_COOKIE } from "@/lib/types";

export default async function SchoolHome({
  params,
}: {
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const ctx = await getSchoolContext(schoolId);

  // 부장이면서 담임처럼 보직이 여럿인데 아직 고른 적이 없으면 한 번 물어봅니다.
  if (ctx && ctx.roles.length > 1) {
    const saved = (await cookies()).get(ACTIVE_ROLE_COOKIE(schoolId))?.value;
    if (!saved) redirect(`/schools/${schoolId}/role`);
  }

  redirect(`/schools/${schoolId}/calendar`);
}
