"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ASSIGNMENT_LABEL, ASSIGNMENT_STYLE, type AssignmentStatus } from "@/lib/types";

/**
 * '내 할 일' 에서 바로 완료 처리할 수 있게 합니다.
 * 상세 화면까지 들어가야 한다면 아무도 안 누릅니다.
 */
export default function MyAssignment({
  schoolId,
  eventId,
  userId,
  title,
  status: initial,
  due,
  dueText,
  submittedText,
}: {
  schoolId: string;
  eventId: string;
  userId: string;
  title: string;
  status: AssignmentStatus;
  due: { text: string; tone: "urgent" | "over" | "normal" } | null;
  dueText: string;
  submittedText: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    const next: AssignmentStatus = status === "done" ? "in_progress" : "done";
    setBusy(true);

    const { error } = await createClient()
      .from("event_assignments")
      .update({
        status: next,
        submitted_at: next === "done" ? new Date().toISOString() : null,
      })
      .eq("event_id", eventId)
      // user_id 조건이 빠지면 부장 권한으로 전원의 상태가 바뀝니다.
      .eq("user_id", userId);

    setBusy(false);
    if (error) return;

    setStatus(next);
    startTransition(() => router.refresh());
  }

  const done = status === "done";

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 ${
        done ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={done ? "완료 취소" : "완료로 표시"}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 hover:border-slate-900"
        }`}
      >
        {done ? "✓" : ""}
      </button>

      <Link
        href={`/schools/${schoolId}/events/${eventId}`}
        className={`flex-1 font-medium hover:underline ${done ? "line-through" : ""}`}
      >
        {title}
      </Link>

      <span
        className={`rounded border px-2 py-0.5 text-xs ${ASSIGNMENT_STYLE[status]}`}
      >
        {ASSIGNMENT_LABEL[status]}
      </span>

      {done
        ? submittedText && (
            <span className="text-xs text-slate-400">{submittedText} 완료</span>
          )
        : due && (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                due.tone === "over"
                  ? "bg-rose-100 text-rose-800"
                  : due.tone === "urgent"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {dueText} · {due.text}
            </span>
          )}
    </li>
  );
}
