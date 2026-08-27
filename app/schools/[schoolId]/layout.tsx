import Link from "next/link";
import { notFound } from "next/navigation";
import { getSchoolContext } from "@/lib/school";
import { ROLE_LABEL } from "@/lib/types";
import RoleSwitcher from "./role-switcher";

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ schoolId: string }>;
}) {
  const { schoolId } = await params;
  const ctx = await getSchoolContext(schoolId);

  // 소속이 아니면 RLS 가 아무 행도 주지 않습니다 → 존재하지 않는 것으로 처리
  if (!ctx) notFound();

  const base = `/schools/${schoolId}`;
  const nav = [
    { href: `${base}/calendar`, label: "학사일정" },
    { href: `${base}/my`, label: "내 할 일" },
    ...(ctx.canCreateEvent ? [{ href: `${base}/tasks`, label: "업무 현황" }] : []),
    ...(ctx.isAdmin ? [{ href: `${base}/admin`, label: "관리" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3">
          <Link href="/schools" className="font-bold">
            {ctx.school.name}
          </Link>
          <span className="text-xs text-slate-400">{ctx.year.name}</span>

          <nav className="flex gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {ctx.roles.length > 1 && ctx.activeRole && (
              <RoleSwitcher
                schoolId={schoolId}
                roles={ctx.roles}
                activeRoleId={ctx.activeRole.id}
              />
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {ctx.roles.length === 1 ? ctx.roles[0].label : ROLE_LABEL[ctx.role]}
            </span>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
