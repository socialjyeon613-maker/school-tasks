"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/format";

export interface NoticeItem {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  author: string;
}

const VISIBLE = 5;

/** 오늘 기준 게시 상태 */
function phaseOf(n: NoticeItem, today: string) {
  if (today < n.start_date) return { label: "예정", cls: "bg-slate-100 text-slate-500" };
  if (today > n.end_date) return { label: "종료", cls: "bg-slate-100 text-slate-400" };
  return { label: "게시중", cls: "bg-emerald-100 text-emerald-800" };
}

export default function NoticeList({
  schoolId,
  notices,
  today,
  canPost,
}: {
  schoolId: string;
  notices: NoticeItem[];
  today: string;
  canPost: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? notices : notices.slice(0, VISIBLE);
  const hidden = notices.length - shown.length;

  return (
    <aside className="w-full shrink-0 lg:w-64">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-bold">공지</h2>
        {notices.length > 0 && (
          <span className="text-xs text-slate-400">{notices.length}</span>
        )}
        {canPost && (
          <Link
            href={`/schools/${schoolId}/events/new?kind=notice`}
            className="no-print ml-auto text-xs text-slate-500 hover:text-slate-900"
          >
            + 등록
          </Link>
        )}
      </div>

      {notices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
          등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((n) => {
            const ph = phaseOf(n, today);
            return (
              <li key={n.id}>
                <Link
                  href={`/schools/${schoolId}/events/${n.id}`}
                  className="block rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-400"
                >
                  <div className="flex items-start gap-1.5">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ph.cls}`}
                    >
                      {ph.label}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                      {n.title}
                    </span>
                  </div>
                  {n.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {n.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDate(n.start_date)}
                    {n.end_date !== n.start_date && ` ~ ${formatDate(n.end_date)}`}
                    {n.author && ` · ${n.author}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {notices.length > VISIBLE && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="no-print mt-2 w-full rounded-lg border border-slate-300 py-1.5 text-xs font-medium text-slate-600"
        >
          {expanded ? "접기" : `더 보기 (${hidden})`}
        </button>
      )}
    </aside>
  );
}
