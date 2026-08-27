"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface StageDraft {
  name: string;
  kind: "active" | "success" | "fail";
}

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

/** 해마다 반복되는 단계 묶음 — 고른 뒤 이름을 고쳐 쓰면 됩니다 */
const PRESETS: Array<{ label: string; stages: StageDraft[] }> = [
  {
    label: "고입 진학",
    stages: [
      { name: "준비", kind: "active" },
      { name: "서류제출", kind: "active" },
      { name: "1차합격", kind: "active" },
      { name: "면접", kind: "active" },
      { name: "최종합격", kind: "success" },
      { name: "불합격", kind: "fail" },
    ],
  },
  {
    label: "대회 출전",
    stages: [
      { name: "신청", kind: "active" },
      { name: "예선", kind: "active" },
      { name: "본선", kind: "active" },
      { name: "수상", kind: "success" },
      { name: "미수상", kind: "fail" },
    ],
  },
  {
    label: "제출물 관리",
    stages: [
      { name: "미제출", kind: "active" },
      { name: "제출", kind: "success" },
      { name: "면제", kind: "fail" },
    ],
  },
];

const KIND_LABEL: Record<StageDraft["kind"], string> = {
  active: "진행",
  success: "성공",
  fail: "실패",
};

const KIND_STYLE: Record<string, string> = {
  active: "bg-sky-100 text-sky-800 border-sky-300",
  success: "bg-emerald-100 text-emerald-800 border-emerald-300",
  fail: "bg-rose-100 text-rose-800 border-rose-300",
};

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

  const setStage = (i: number, patch: Partial<StageDraft>) =>
    set({ stages: value.stages.map((s, n) => (n === i ? { ...s, ...patch } : s)) });

  const removeStage = (i: number) =>
    set({ stages: value.stages.filter((_, n) => n !== i) });

  /** 위/아래 단추로 순서를 바꿉니다 — 폰에서 끌어 옮기는 것보다 정확합니다 */
  function moveStage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.stages.length) return;
    const next = [...value.stages];
    [next[i], next[j]] = [next[j], next[i]];
    set({ stages: next });
  }

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

  const emptyStage = value.stages.some((s) => !s.name.trim());
  const dupStage =
    new Set(value.stages.map((s) => s.name.trim())).size !== value.stages.length;

  return (
    <div className="space-y-4 rounded-lg border border-slate-300 bg-white p-4">
      {/* ── 단계 ─────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">단계</p>
          <span className="text-xs text-slate-500">
            위에서 아래 순서로 진행됩니다
          </span>
          <div className="ml-auto flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ stages: p.stages.map((s) => ({ ...s })) })}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="space-y-1.5">
          {value.stages.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-center text-xs text-slate-400">
                {i + 1}
              </span>
              <input
                value={s.name}
                onChange={(e) => setStage(i, { name: e.target.value })}
                placeholder="단계 이름"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900"
              />
              <select
                value={s.kind}
                onChange={(e) =>
                  setStage(i, { kind: e.target.value as StageDraft["kind"] })
                }
                className={`shrink-0 rounded-lg border px-2 py-1.5 text-xs ${KIND_STYLE[s.kind]}`}
                title="성공 · 실패는 마무리 단계입니다"
              >
                {(["active", "success", "fail"] as const).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => moveStage(i, -1)}
                disabled={i === 0}
                aria-label="위로"
                className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveStage(i, 1)}
                disabled={i === value.stages.length - 1}
                aria-label="아래로"
                className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeStage(i)}
                aria-label="삭제"
                className="shrink-0 rounded px-1.5 py-1 text-xs text-slate-400 hover:text-rose-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => set({ stages: [...value.stages, { name: "", kind: "active" }] })}
          className="mt-2 text-sm text-slate-500 hover:text-slate-900"
        >
          + 단계 추가
        </button>

        {value.stages.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {value.stages.map((s) => s.name.trim() || "…").join(" → ")}
          </p>
        )}
        {emptyStage && (
          <p className="mt-1 text-xs text-rose-700">이름이 빈 단계가 있습니다.</p>
        )}
        {dupStage && (
          <p className="mt-1 text-xs text-rose-700">같은 이름의 단계가 있습니다.</p>
        )}
      </div>

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
