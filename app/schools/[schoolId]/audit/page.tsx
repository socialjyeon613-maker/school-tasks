import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSchoolContext } from "@/lib/school";
import { firstOf, formatDateTime } from "@/lib/format";
import Trash, { type DeletedEvent } from "./trash";

const ACTION_LABEL: Record<string, string> = {
  insert: "추가",
  update: "수정",
  delete: "삭제",
  restore: "복구",
};

const ACTION_STYLE: Record<string, string> = {
  insert: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  delete: "bg-rose-100 text-rose-800",
  restore: "bg-amber-100 text-amber-800",
};

const ENTITY_LABEL: Record<string, string> = {
  event: "일정",
  student: "학생",
  staff_role: "보직",
  member: "교직원",
};

/** 감사 기록에 굳이 보여줄 필요 없는 항목 */
const NOISE = new Set(["updated_at", "created_at", "id", "school_id", "academic_year_id"]);

const FIELD_LABEL: Record<string, string> = {
  title: "제목",
  start_date: "시작일",
  end_date: "종료일",
  period_from: "시작교시",
  period_to: "끝교시",
  location: "장소",
  status: "상태",
  deleted_at: "삭제",
  name: "이름",
  number: "연번",
  classroom_id: "반",
  role: "역할",
  due_at: "마감",
  requires_participation: "참여체크",
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ schoolId: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const { schoolId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(schoolId);
  if (!ctx) notFound();
  if (!ctx.isAdmin) redirect(`/schools/${schoolId}/calendar`);

  const supabase = await createClient();

  let q = supabase
    .from("audit_log")
    .select("id, action, entity, record_id, label, changes, created_at, actor:profiles(name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (sp.entity) q = q.eq("entity", sp.entity);

  const [{ data: rows }, { data: deleted }] = await Promise.all([
    q,
    supabase.rpc("deleted_events", { p_school: schoolId }),
  ]);

  const tabs = [
    { key: "", label: "전체" },
    { key: "event", label: "일정" },
    { key: "student", label: "학생" },
    { key: "staff_role", label: "보직" },
    { key: "member", label: "교직원" },
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-bold">변경 이력 · 휴지통</h1>
        <p className="mt-1 text-sm text-slate-500">
          누가 언제 무엇을 바꿨는지 남습니다. 교장 · 교감 · 관리자만 볼 수 있습니다.
        </p>
      </div>

      <Trash schoolId={schoolId} events={(deleted ?? []) as DeletedEvent[]} />

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 font-semibold">변경 이력</h2>

        <div className="mb-3 flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `?entity=${t.key}` : "?"}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                (sp.entity ?? "") === t.key
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-600"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {(rows ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => {
              const changes = Object.entries(
                (r.changes ?? {}) as Record<string, { from: unknown; to: unknown }>
              ).filter(([k]) => !NOISE.has(k));

              return (
                <li key={r.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ACTION_STYLE[r.action]}`}
                    >
                      {ACTION_LABEL[r.action] ?? r.action}
                    </span>
                    <span className="text-slate-500">
                      {ENTITY_LABEL[r.entity] ?? r.entity}
                    </span>
                    <span className="font-medium">{r.label || "—"}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {firstOf(r.actor)?.name ?? "—"} · {formatDateTime(r.created_at)}
                    </span>
                  </div>

                  {changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-2 text-xs text-slate-500">
                      {changes.slice(0, 5).map(([k, v]) => (
                        <li key={k}>
                          {FIELD_LABEL[k] ?? k}:{" "}
                          <span className="line-through opacity-60">
                            {String(v.from ?? "—")}
                          </span>{" "}
                          → <span className="text-slate-800">{String(v.to ?? "—")}</span>
                        </li>
                      ))}
                      {changes.length > 5 && (
                        <li className="opacity-60">외 {changes.length - 5}개</li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
