import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { ROLE_LABEL } from "@/lib/types";
import RoleSwitcher from "./role-switcher";
import SchoolNav, { type NavItem } from "./school-nav";

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

  const supabase = await createClient();
  const [{ data: unreadMsg }, { data: unreadNoti }] = await Promise.all([
    supabase.rpc("unread_message_count", { p_school: schoolId }),
    supabase.rpc("unread_notification_count", { p_school: schoolId }),
  ]);

  const base = `/schools/${schoolId}`;

  // 늘 쓰는 것만 내놓습니다.
  // 주간 · 간트는 학사일정 안의 토글에 이미 있어 여기서는 뺐습니다.
  const nav: NavItem[] = [
    { href: `${base}/calendar`, label: "학사일정" },
    { href: `${base}/my`, label: "내 할 일" },
    ...(ctx.canCreateEvent ? [{ href: `${base}/tasks`, label: "업무 현황" }] : []),
    {
      href: `${base}/messages`,
      label: "쪽지",
      badge: typeof unreadMsg === "number" && unreadMsg > 0 ? unreadMsg : 0,
    },
  ];

  // 어쩌다 한 번 쓰는 것 — ⋯ 안으로
  const more: NavItem[] = [
    ...(ctx.isAdmin ? [{ href: `${base}/admin`, label: "관리" }] : []),
    { href: "/help", label: "도움말" },
  ];

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        {/*
          폰(375px)에서는 한 줄에 다 못 들어갑니다.
          윗줄(학교 · 아이콘 · 보직)과 아랫줄(메뉴)로 나누고,
          메뉴는 자기 영역 안에서만 옆으로 넘깁니다 —
          페이지 전체가 가로로 밀리면 안 됩니다.
        */}
        <div className="mx-auto max-w-[1400px] px-4 py-2.5 lg:flex lg:items-center lg:gap-6">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/schools" className="truncate font-bold">
              {ctx.school.name}
            </Link>
            <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
              {ctx.year.name}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href={`${base}/search`}
              aria-label="검색"
              className="rounded-lg px-2 py-1.5 text-lg leading-none transition hover:bg-slate-100"
            >
              🔍
            </Link>
            <Link
              href={`${base}/notifications`}
              aria-label="알림"
              className="relative rounded-lg px-2 py-1.5 text-lg leading-none transition hover:bg-slate-100"
            >
              🔔
              {typeof unreadNoti === "number" && unreadNoti > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                  {unreadNoti > 99 ? "99+" : unreadNoti}
                </span>
              )}
            </Link>
            {/*
              보직이 여럿이면 전환기가 지금 보직을 이미 보여 줍니다.
              그 옆에 신분 딱지를 또 붙이면 뱃지가 둘이 되어 어수선합니다.
            */}
            {ctx.roles.length > 1 && ctx.activeRole ? (
              <RoleSwitcher
                schoolId={schoolId}
                roles={ctx.roles}
                activeRoleId={ctx.activeRole.id}
              />
            ) : (
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline">
                {ctx.roles[0]?.label ?? ROLE_LABEL[ctx.role]}
              </span>
            )}
            </div>
          </div>

          <SchoolNav items={nav} more={more} />
        </div>
      </header>

      {children}
    </div>
  );
}
