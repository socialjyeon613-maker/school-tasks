"use client";

import Link from "next/link";

export default function MonthNav({
  year,
  month,
  gradeId,
}: {
  year: number;
  month: number;
  gradeId: string;
}) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const link = (y: number, m: number) => `?month=${y}-${m}&grade=${gradeId}`;

  return (
    <div className="flex items-center gap-1">
      <Link
        href={link(prev.y, prev.m)}
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
      >
        ←
      </Link>
      <Link
        href={link(next.y, next.m)}
        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
      >
        →
      </Link>
      <button
        onClick={() => window.print()}
        className="ml-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        인쇄
      </button>
    </div>
  );
}
