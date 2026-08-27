"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, formatDateTime } from "@/lib/format";
import {
  ASSIGNMENT_LABEL,
  ASSIGNMENT_STYLE,
  type AssignmentStatus,
} from "@/lib/types";

interface Row {
  user_id: string;
  status: AssignmentStatus;
  submitted_at: string | null;
  note: string;
  profile: { name: string } | null;
}

export interface Candidate {
  user_id: string;
  name: string;
  email: string;
  /** 담임인 반 이름 — '3학년 담임 전원' 빠른 배정에 씁니다 */
  homeroomOf: string | null;
  gradeId: string | null;
}

interface GradeOption {
  id: string;
  name: string;
}

const FLOW: AssignmentStatus[] = ["pending", "in_progress", "done"];

/**
 * 업무 일정의 담당자별 진행 상태.
 *
 * 일정 하나에 상태 하나면 쓸모가 없습니다.
 * "3학년 담임 12명이 각자 제출" → 일정 1개, 이 행 12개.
 * 부장에게 필요한 건 합계가 아니라 **누가 아직 안 냈는지** 입니다.
 */
export default function Assignments({
  eventId,
  meId,
  canEdit,
  dueAt,
  candidates,
  grades,
}: {
  eventId: string;
  meId: string;
  canEdit: boolean;
  dueAt: string | null;
  candidates: Candidate[];
  grades: GradeOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("event_assignments")
      .select("user_id, status, submitted_at, note, profile:profiles(name)")
      .eq("event_id", eventId);
    setRows((data ?? []) as unknown as Row[]);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const mine = rows.find((r) => r.user_id === meId);
  const done = rows.filter((r) => r.status === "done");
  const remaining = rows.filter((r) => r.status !== "done");
  const due = dueLabel(dueAt);

  async function setStatus(userId: string, status: AssignmentStatus) {
    const { error } = await createClient()
      .from("event_assignments")
      .update({
        status,
        submitted_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("event_id", eventId)
      .eq("user_id", userId);

    if (error) {
      setError("상태를 바꿀 권한이 없습니다.");
      return;
    }
    setError("");
    load();
    router.refresh();
  }

  async function assign(userIds: string[]) {
    if (userIds.length === 0) return;

    const { error } = await createClient()
      .from("event_assignments")
      .upsert(
        userIds.map((user_id) => ({ event_id: eventId, user_id, due_at: dueAt })),
        { onConflict: "event_id,user_id", ignoreDuplicates: true }
      );

    if (error) {
      setError("배정에 실패했습니다. " + error.message);
      return;
    }
    setError("");
    setPicked([]);
    setAdding(false);
    load();
    router.refresh();
  }

  async function unassign(userId: string) {
    await createClient()
      .from("event_assignments")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);
    load();
    router.refresh();
  }

  /** 미완료자 이름만 뽑아 복사 — 메신저로 독촉할 때 씁니다 */
  function copyRemaining() {
    const names = remaining.map((r) => r.profile?.name ?? "—").join(", ");
    navigator.clipboard.writeText(names);
    setError("");
  }

  const assignedIds = new Set(rows.map((r) => r.user_id));
  const available = candidates.filter((c) => !assignedIds.has(c.user_id));

  return (
    <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">업무 담당</h2>
        {rows.length > 0 && (
          <span className="text-sm text-slate-500">
            {rows.length}명 중 <b className="text-slate-900">{done.length}명</b> 완료
          </span>
        )}
        {due && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              due.tone === "over"
                ? "bg-rose-100 text-rose-800"
                : due.tone === "urgent"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            마감 {formatDateTime(dueAt)} · {due.text}
          </span>
        )}
      </div>

      {/* 내 상태 — 배정받은 사람에게 가장 먼저 보여야 합니다 */}
      {mine && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-medium">내 진행 상태</p>
          <div className="flex flex-wrap gap-1.5">
            {FLOW.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(meId, s)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  mine.status === s
                    ? ASSIGNMENT_STYLE[s] + " ring-2 ring-slate-900"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {ASSIGNMENT_LABEL[s]}
              </button>
            ))}
            {mine.submitted_at && (
              <span className="self-center pl-2 text-xs text-slate-500">
                {formatDateTime(mine.submitted_at)} 완료
              </span>
            )}
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(done.length / rows.length) * 100}%` }}
            />
          </div>

          <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows
              .slice()
              .sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0))
              .map((r) => (
                <li key={r.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{r.profile?.name ?? "—"}</span>
                  <span
                    className={`rounded border px-2 py-0.5 text-xs ${ASSIGNMENT_STYLE[r.status]}`}
                  >
                    {ASSIGNMENT_LABEL[r.status]}
                  </span>
                  {r.submitted_at && (
                    <span className="text-xs text-slate-400">
                      {formatDateTime(r.submitted_at)}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => unassign(r.user_id)}
                      className="ml-auto text-xs text-slate-400 hover:text-rose-600"
                    >
                      해제
                    </button>
                  )}
                </li>
              ))}
          </ul>

          {remaining.length > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              아직 완료하지 않음:{" "}
              <b>{remaining.map((r) => r.profile?.name ?? "—").join(", ")}</b>
              <button
                onClick={copyRemaining}
                className="ml-2 rounded border border-amber-300 px-2 py-0.5 text-xs"
              >
                이름 복사
              </button>
            </p>
          )}
        </>
      ) : (
        <p className="mb-3 text-sm text-slate-500">아직 배정된 담당자가 없습니다.</p>
      )}

      {canEdit && (
        <div>
          {adding ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
                <span className="text-slate-500">빠른 배정:</span>
                {grades.map((g) => (
                  <button
                    key={g.id}
                    onClick={() =>
                      assign(
                        available
                          .filter((c) => c.gradeId === g.id && c.homeroomOf)
                          .map((c) => c.user_id)
                      )
                    }
                    className="rounded border border-slate-300 px-2 py-1"
                  >
                    {g.name} 담임 전원
                  </button>
                ))}
                <button
                  onClick={() => assign(available.map((c) => c.user_id))}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  전 교직원
                </button>
              </div>

              {available.length === 0 ? (
                <p className="text-sm text-slate-500">배정할 수 있는 교직원이 없습니다.</p>
              ) : (
                <ul className="mb-2 grid max-h-52 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                  {available.map((c) => (
                    <li key={c.user_id}>
                      <button
                        onClick={() =>
                          setPicked((v) =>
                            v.includes(c.user_id)
                              ? v.filter((x) => x !== c.user_id)
                              : [...v, c.user_id]
                          )
                        }
                        className={`w-full rounded border px-2 py-1.5 text-left text-sm ${
                          picked.includes(c.user_id)
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300"
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.homeroomOf && (
                          <span className="ml-1 text-xs opacity-60">{c.homeroomOf}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => assign(picked)}
                  disabled={picked.length === 0}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {picked.length}명 배정
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setPicked([]);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              + 담당자 배정
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
