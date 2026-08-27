import Link from "next/link";

/** 월간 · 주간 · 간트 — 같은 일정을 다른 방식으로 보는 것이라 함께 묶습니다 */
export default function ViewSwitch({
  schoolId,
  current,
  query = "",
}: {
  schoolId: string;
  current: "month" | "week" | "timeline";
  query?: string;
}) {
  const views = [
    { key: "month", label: "월간", href: `/schools/${schoolId}/calendar` },
    { key: "week", label: "주간", href: `/schools/${schoolId}/week` },
    { key: "timeline", label: "간트", href: `/schools/${schoolId}/timeline` },
  ] as const;

  return (
    <div className="no-print flex gap-1 rounded-lg bg-slate-100 p-0.5">
      {views.map((v) => (
        <Link
          key={v.key}
          href={v.href + (query ? `?${query}` : "")}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            v.key === current
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
