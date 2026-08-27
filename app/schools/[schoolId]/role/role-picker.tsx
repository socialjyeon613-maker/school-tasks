"use client";

import { useRouter } from "next/navigation";
import { setActiveRole } from "@/lib/active-role";
import { STAFF_ROLE_LABEL, type MyStaffRole } from "@/lib/types";

const HINT: Partial<Record<MyStaffRole["role"], string>> = {
  head: "학년 전체 현황이 먼저 보입니다",
  homeroom: "담당 반이 먼저 열립니다",
  co_homeroom: "담당 반이 먼저 열립니다",
  member: "부서 일정이 먼저 보입니다",
  subject: "담당 반이 먼저 열립니다",
};

export default function RolePicker({
  schoolId,
  roles,
  activeRoleId,
  next,
}: {
  schoolId: string;
  roles: MyStaffRole[];
  activeRoleId: string;
  next: string;
}) {
  const router = useRouter();

  function pick(role: MyStaffRole) {
    setActiveRole(schoolId, role.id);
    router.push(next);
    router.refresh();
  }

  return (
    <ul className="space-y-2">
      {roles.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => pick(r)}
            className={`w-full rounded-xl border px-5 py-4 text-left transition ${
              r.id === activeRoleId
                ? "border-slate-900 bg-white"
                : "border-slate-200 bg-white hover:border-slate-400"
            }`}
          >
            <span className="block font-semibold">{r.label}</span>
            <span className="block text-sm text-slate-500">
              {HINT[r.role] ?? STAFF_ROLE_LABEL[r.role]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
