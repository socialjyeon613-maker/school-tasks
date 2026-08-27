"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";

export interface DeletedEvent {
  id: string;
  title: string;
  event_type: string;
  start_date: string;
  deleted_at: string;
  participation_count: number;
}

const TYPE_LABEL: Record<string, string> = {
  academic: "학사일정",
  task: "업무",
  notice: "공지",
};

export default function Trash({
  schoolId,
  events,
}: {
  schoolId: string;
  events: DeletedEvent[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmPurge, setConfirmPurge] = useState("");
  const [, startTransition] = useTransition();

  async function run(id: string, rpc: "restore_event" | "purge_event") {
    setBusy(id);
    setError("");

    const { error } = await createClient().rpc(rpc, { p_event: id });

    setBusy("");
    setConfirmPurge("");
    if (error) {
      setError(
        rpc === "purge_event"
          ? "완전 삭제는 관리자만 할 수 있습니다."
          : "복구할 권한이 없습니다."
      );
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 font-semibold">휴지통</h2>
      <p className="mb-3 text-sm text-slate-500">
        삭제한 일정입니다. 댓글 · 첨부 · 참여기록이 그대로 남아 있어 되돌리면
        원래대로 돌아옵니다.
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          삭제한 일정이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {TYPE_LABEL[e.event_type] ?? e.event_type}
              </span>
              <span className="font-medium">{e.title}</span>
              <span className="text-xs text-slate-400">
                {formatDate(e.start_date)}
                {e.participation_count > 0 && ` · 참여기록 ${e.participation_count}건`}
              </span>
              <span className="ml-auto text-xs text-slate-400">
                {formatDateTime(e.deleted_at)} 삭제
              </span>

              {confirmPurge === e.id ? (
                <span className="flex gap-1">
                  <button
                    onClick={() => setConfirmPurge("")}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => run(e.id, "purge_event")}
                    disabled={busy === e.id}
                    className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    영구 삭제
                  </button>
                </span>
              ) : (
                <span className="flex gap-1">
                  <button
                    onClick={() => run(e.id, "restore_event")}
                    disabled={busy === e.id}
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    되돌리기
                  </button>
                  <button
                    onClick={() => setConfirmPurge(e.id)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:text-rose-600"
                  >
                    영구 삭제
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
