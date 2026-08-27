"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveRole } from "@/lib/active-role";
import type { MyStaffRole } from "@/lib/types";

/** 보직이 둘 이상일 때만 헤더에 나타나는 전환기 */
export default function RoleSwitcher({
  schoolId,
  roles,
  activeRoleId,
}: {
  schoolId: string;
  roles: MyStaffRole[];
  activeRoleId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = roles.find((r) => r.id === activeRoleId) ?? roles[0];

  function pick(id: string) {
    setActiveRole(schoolId, id);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
      >
        {active.label}
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫히도록 */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => pick(r.id)}
                  className={`block w-full px-4 py-2.5 text-left text-sm ${
                    r.id === active.id
                      ? "bg-slate-900 text-white"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
