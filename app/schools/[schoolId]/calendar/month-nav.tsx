"use client";

import Link from "next/link";

/**
 * 달 넘기기 — 화살표 사이에 달을 둡니다.
 * 앞뒤 화살표가 떨어져 있으면 무엇을 넘기는 것인지 한눈에 안 잡힙니다.
 */
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
        aria-label="지난달"
        className="rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        ←
      </Link>
      <h1 className="min-w-[7.5rem] text-center text-lg font-bold">
        {year}년 {month}월
      </h1>
      <Link
        href={link(next.y, next.m)}
        aria-label="다음달"
        className="rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        →
      </Link>
    </div>
  );
}
