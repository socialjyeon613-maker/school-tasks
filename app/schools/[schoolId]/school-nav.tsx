"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

/**
 * 학교 메뉴.
 *
 * 늘 쓰는 것만 내놓고, 드물게 쓰는 것(관리 · 도움말)은 ⋯ 안으로 넣습니다.
 * 주간 · 간트는 여기 없습니다 — 학사일정 안의 월간 · 주간 · 간트 토글에
 * 이미 있어서, 두 군데에 두면 같은 곳으로 가는 길이 둘이 됩니다.
 *
 * 지금 보고 있는 곳을 굵게 표시합니다. 어디에 있는지 모르면 메뉴가
 * 실제보다 많아 보입니다.
 */
export default function SchoolNav({
  items,
  more,
}: {
  items: NavItem[];
  more: NavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  /** /schools/x/calendar 아래의 주간 · 간트도 '학사일정' 으로 칩니다 */
  const isHere = (href: string) => {
    if (href === "/help") return pathname === "/help";
    if (href.endsWith("/calendar"))
      return ["/calendar", "/week", "/timeline", "/events"].some((p) =>
        pathname.startsWith(href.replace("/calendar", p))
      );
    return pathname.startsWith(href);
  };

  const moreActive = more.some((m) => isHere(m.href));

  return (
    <nav className="-mx-4 mt-1.5 flex gap-1 overflow-x-auto px-4 pb-0.5 lg:mx-0 lg:mt-0 lg:overflow-visible lg:px-0">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isHere(n.href) ? "page" : undefined}
          className={`flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
            isHere(n.href)
              ? "bg-slate-900 font-medium text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {n.label}
          {(n.badge ?? 0) > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {n.badge}
            </span>
          )}
        </Link>
      ))}

      {more.length > 0 && (
        <div ref={box} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="더 보기"
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              moreActive
                ? "bg-slate-900 font-medium text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            ⋯
          </button>
          {open && (
            <div className="absolute right-0 z-30 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {more.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`block px-3 py-2 text-sm hover:bg-slate-50 ${
                    isHere(m.href) ? "font-medium text-slate-900" : "text-slate-600"
                  }`}
                >
                  {m.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
