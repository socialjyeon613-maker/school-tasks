import { notFound, redirect } from "next/navigation";
import { getSchoolContext } from "@/lib/school";
import RolePicker from "./role-picker";

/**
 * 보직이 둘 이상인 선생님이 처음 들어왔을 때 어느 시점으로 볼지 고르는 화면.
 * 예) 3학년 부장이면서 3-2 담임.
 *
 * ※ 여기서 고른 값은 화면 기본값만 바꿉니다.
 *   권한은 언제나 DB의 RLS 가 정하므로, 어느 쪽을 골라도 할 수 있는 일은 같습니다.
 */
export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();

  // 고를 게 없으면 그냥 넘어갑니다.
  if (ctx.roles.length < 2) redirect(`/schools/${schoolId}/calendar`);

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-bold">어느 보직으로 보시겠어요?</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        {ctx.school.name}에서 {ctx.roles.length}개의 보직을 맡고 계십니다.
        <br />
        화면 기본값만 바뀌고, 할 수 있는 일은 어느 쪽을 고르셔도 같습니다.
      </p>

      <RolePicker
        schoolId={schoolId}
        roles={ctx.roles}
        activeRoleId={ctx.activeRole?.id ?? ""}
        next={sp.next?.startsWith("/") ? sp.next : `/schools/${schoolId}/calendar`}
      />
    </main>
  );
}
