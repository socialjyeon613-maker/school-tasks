import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { DailySummary } from "@/lib/types";

/**
 * 매일 출석 체크 일정의 날짜 탭.
 * 어느 날이 아직 안 끝났는지 한눈에 보이도록 미입력 수를 같이 띄웁니다.
 */
export default function DateTabs({
  days,
  onDate,
  classId,
}: {
  days: DailySummary[];
  onDate: string;
  classId?: string;
}) {
  if (days.length < 2) return null;

  return (
    <div className="no-print mb-4">
      <p className="mb-1.5 text-xs text-slate-500">
        날짜마다 따로 출석을 받는 일정입니다. 날짜를 골라 입력하세요.
      </p>
      <div className="flex flex-wrap gap-1">
        {days.map((d) => {
          const active = d.on_date === onDate;
          return (
            <Link
              key={d.on_date}
              href={`?date=${d.on_date}${classId ? `&class=${classId}` : ""}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : d.is_complete
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 text-slate-600"
              }`}
            >
              {formatDate(d.on_date)}
              <span className="ml-1 text-xs opacity-70">
                {d.is_complete ? "완료" : `미입력 ${d.pending}`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
