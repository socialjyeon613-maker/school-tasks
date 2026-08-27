"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ParticipationStatus } from "@/lib/types";

interface Student {
  student_id: string;
  number: number;
  name: string;
}

type Marks = Record<string, { status: string; reason: string }>;

const NEXT: Record<ParticipationStatus, ParticipationStatus> = {
  pending: "attended",
  attended: "absent",
  absent: "pending",
};

const STYLE: Record<ParticipationStatus, string> = {
  pending: "bg-white text-slate-400 border-slate-300",
  attended: "bg-emerald-100 text-emerald-800 border-emerald-300",
  absent: "bg-rose-100 text-rose-800 border-rose-300",
};

const LABEL: Record<ParticipationStatus, string> = {
  pending: "미입력",
  attended: "참여",
  absent: "불참",
};

export default function ParticipationGrid({
  eventId,
  classroomId,
  classroomName,
  students,
  initial,
  onDate,
  isDaily,
  allDates,
}: {
  eventId: string;
  classroomId: string;
  classroomName: string;
  students: Student[];
  initial: Marks;
  /** 입력 대상 날짜 (매일 체크가 아니면 일정 시작일) */
  onDate: string;
  isDaily: boolean;
  /** 매일 체크일 때 이 일정의 모든 날짜 */
  allDates: string[];
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Marks>(initial);
  const [dirty, setDirty] = useState(false);

  /*
    서버가 새 데이터를 내려주면(날짜 탭 이동, 반 전환, 'N일 전체 참여' 후 refresh)
    화면을 그것에 맞춥니다. 아직 저장하지 않은 편집이 있으면 덮어쓰지 않습니다.
  */
  const serverKey = `${onDate}|${classroomId}|${JSON.stringify(initial)}`;
  const [loadedKey, setLoadedKey] = useState(serverKey);
  if (loadedKey !== serverKey) {
    setLoadedKey(serverKey);
    if (!dirty) setMarks(initial);
  }
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const statusOf = (id: string) =>
    (marks[id]?.status ?? "pending") as ParticipationStatus;

  const counts = students.reduce(
    (acc, s) => {
      acc[statusOf(s.student_id)]++;
      return acc;
    },
    { pending: 0, attended: 0, absent: 0 } as Record<ParticipationStatus, number>
  );

  function toggle(id: string) {
    setMarks((m) => ({
      ...m,
      [id]: { status: NEXT[statusOf(id)], reason: m[id]?.reason ?? "" },
    }));
    setDirty(true);
    setMessage("");
  }

  function setReason(id: string, reason: string) {
    setMarks((m) => ({ ...m, [id]: { status: m[id]?.status ?? "absent", reason } }));
    setDirty(true);
  }

  /** 매일 체크 일정에서 모든 날짜를 한 번에 처리 (수련회 3일 전원 참석 깔기) */
  async function markEveryDate(status: ParticipationStatus) {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_classroom_participation", {
      p_event: eventId,
      p_classroom: classroomId,
      p_status: status,
      p_overwrite: true,
      p_all_dates: true,
    });

    if (error) {
      setMessage(
        error.message.includes("FORBIDDEN")
          ? "이 반을 입력할 권한이 없습니다."
          : "저장에 실패했습니다."
      );
      return;
    }
    setDirty(false);
    setMessage(`${allDates.length}일 전체를 처리했습니다.`);
    startTransition(() => router.refresh());
  }

  function markAll(status: ParticipationStatus) {
    setMarks((m) => {
      const next = { ...m };
      for (const s of students)
        next[s.student_id] = { status, reason: m[s.student_id]?.reason ?? "" };
      return next;
    });
    setDirty(true);
    setMessage("");
  }

  async function save() {
    const supabase = createClient();
    const rows = students.map((s) => ({
      student_id: s.student_id,
      status: statusOf(s.student_id),
      reason: marks[s.student_id]?.reason ?? "",
    }));

    const { error } = await supabase.rpc("save_participations", {
      p_event: eventId,
      p_rows: rows,
      p_on_date: onDate,
    });

    if (error) {
      setMessage(
        error.message.includes("FORBIDDEN")
          ? "이 반을 입력할 권한이 없습니다."
          : "저장에 실패했습니다."
      );
      return;
    }

    setDirty(false);
    setMessage("저장했습니다.");
    startTransition(() => router.refresh());
  }

  if (students.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {classroomName} 학생 명단이 없습니다. 관리 화면에서 먼저 등록하세요.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => markAll("attended")}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800"
        >
          {isDaily ? "이 날 전체 참여" : "전체 참여"}
        </button>
        {isDaily && allDates.length > 1 && (
          <button
            onClick={() => markEveryDate("attended")}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 font-medium text-emerald-800"
          >
            {allDates.length}일 전체 참여
          </button>
        )}
        <button
          onClick={() => markAll("pending")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600"
        >
          초기화
        </button>
        <span className="text-slate-500">
          참여 {counts.attended} · 불참 {counts.absent} · 미입력 {counts.pending}
        </span>

        <button
          onClick={save}
          disabled={!dirty || pending}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 font-medium text-white disabled:opacity-40"
        >
          {dirty ? "저장" : "저장됨"}
        </button>
      </div>

      {message && (
        <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p>
      )}

      <p className="mb-2 text-xs text-slate-500">
        이름을 누르면 미입력 → 참여 → 불참 순서로 바뀝니다.
      </p>

      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {students.map((s) => {
          const st = statusOf(s.student_id);
          return (
            <li key={s.student_id}>
              <button
                onClick={() => toggle(s.student_id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${STYLE[st]}`}
              >
                <span className="w-6 shrink-0 tabular-nums opacity-60">
                  {s.number}
                </span>
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-xs opacity-70">{LABEL[st]}</span>
              </button>

              {st === "absent" && (
                <input
                  value={marks[s.student_id]?.reason ?? ""}
                  onChange={(e) => setReason(s.student_id, e.target.value)}
                  placeholder="불참 사유"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-900"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
