"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StageList, { type StageDraft } from "./stage-list";

export type { StageDraft };

export interface StudentPick {
  id: string;
  name: string;
  classroom_name: string;
  number: number;
}

export interface RosterDraft {
  stages: StageDraft[];
  visibility: "assignees" | "school";
  students: StudentPick[];
}

export default function RosterSetup({
  schoolId,
  value,
  onChange,
  canOpenToSchool,
}: {
  schoolId: string;
  value: RosterDraft;
  onChange: (v: RosterDraft) => void;
  /** 공개 범위를 '전 교직원'으로 넓히는 것은 부장 · 관리자만 */
  canOpenToSchool: boolean;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<StudentPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<RosterDraft>) => onChange({ ...value, ...patch });

  async function search(text: string) {
    setQ(text);
    setError("");
    if (text.trim().length < 1) return setFound([]);

    setSearching(true);
    const { data, error } = await createClient().rpc("search_students_for_roster", {
      p_school: schoolId,
      p_q: text.trim(),
      p_event: null,
    });
    setSearching(false);

    if (error) {
      setError("학생을 찾지 못했습니다. " + error.message);
      return setFound([]);
    }

    const picked = new Set(value.students.map((s) => s.id));
    setFound(
      (data ?? [])
        .map(
          (s: {
            student_id: string;
            student_name: string;
            classroom_name: string;
            student_no: number;
          }) => ({
            id: s.student_id,
            name: s.student_name,
            classroom_name: s.classroom_name,
            number: s.student_no,
          })
        )
        .filter((s: StudentPick) => !picked.has(s.id))
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-300 bg-white p-4">
      <StageList value={value.stages} onChange={(stages) => set({ stages })} />

      {/* ── 공개 범위 ────────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-sm font-medium">누가 명단을 볼 수 있나</p>
        <div className="space-y-1.5">
          {(
            [
              [
                "assignees",
                "담당자만",
                "담당자 · 부장 · 관리자만 명단 전체를 봅니다. 담임에게는 자기 반 학생만 보입니다.",
              ],
              [
                "school",
                "전 교직원",
                "그 학교 선생님 누구나 명단 전체를 봅니다.",
              ],
            ] as Array<[RosterDraft["visibility"], string, string]>
          ).map(([v, label, hint]) => {
            const blocked = v === "school" && !canOpenToSchool;
            return (
              <button
                key={v}
                type="button"
                disabled={blocked}
                onClick={() => set({ visibility: v })}
                className={`block w-full rounded-lg border px-3 py-2 text-left disabled:opacity-40 ${
                  value.visibility === v ? "border-slate-900 bg-slate-50" : "border-slate-200"
                }`}
              >
                <span className="block text-sm font-medium">
                  {value.visibility === v ? "● " : "○ "}
                  {label}
                  {blocked && (
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      (부장 · 관리자만)
                    </span>
                  )}
                </span>
                <span className="block pl-4 text-xs text-slate-500">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 학생 ────────────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-sm font-medium">
          학생 {value.students.length > 0 && `— ${value.students.length}명`}
        </p>

        {value.students.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1">
            {value.students.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    set({ students: value.students.filter((x) => x.id !== s.id) })
                  }
                  className="flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs"
                >
                  <span className="text-slate-400">{s.classroom_name}</span>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate-400">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="학생 이름으로 찾기 (같은 학년)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />

        {q.trim() && (
          <ul className="mt-1 max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1">
            {found.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    set({ students: [...value.students, s] });
                    setFound((f) => f.filter((x) => x.id !== s.id));
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="w-12 text-slate-400">{s.classroom_name}</span>
                  <span className="font-medium">
                    {s.number}. {s.name}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">+ 담기</span>
                </button>
              </li>
            ))}
            {!searching && found.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-slate-400">
                찾는 학생이 없습니다. 같은 학년 학생만 검색됩니다.
              </li>
            )}
          </ul>
        )}

        <p className="mt-1 text-xs text-slate-500">
          지금 담지 않아도 됩니다. 등록 후 상세 화면에서 언제든 추가할 수 있습니다.
        </p>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
