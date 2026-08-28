"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import StageList, { stageProblem, type StageDraft } from "../stage-list";

export interface Stage {
  stage_id: string;
  stage_name: string;
  stage_kind: "active" | "success" | "fail";
  stage_position: number;
  count: number;
}

export interface RosterRow {
  student_id: string;
  student_name: string;
  classroom_name: string;
  class_no: number;
  student_no: number;
  stage_id: string | null;
  stage_name: string | null;
  stage_kind: string | null;
  note: string;
  updated_at: string;
  can_edit: boolean;
}

interface Candidate {
  id: string;
  name: string;
  classroom_name: string;
  number: number;
}

/** 단계 묶음 미리 만들어 둔 것 — 해마다 반복되는 것들 */
const PRESETS: Array<{ label: string; stages: Array<[string, Stage["stage_kind"]]> }> = [
  {
    label: "고입 진학",
    stages: [
      ["준비", "active"], ["서류제출", "active"], ["1차합격", "active"],
      ["면접", "active"], ["최종합격", "success"], ["불합격", "fail"],
    ],
  },
  {
    label: "대회 출전",
    stages: [
      ["신청", "active"], ["예선", "active"], ["본선", "active"],
      ["수상", "success"], ["미수상", "fail"],
    ],
  },
  {
    label: "제출물 관리",
    stages: [["미제출", "active"], ["제출", "success"], ["면제", "fail"]],
  },
];

const KIND_STYLE: Record<string, string> = {
  active: "bg-sky-100 text-sky-800 border-sky-300",
  success: "bg-emerald-100 text-emerald-800 border-emerald-300",
  fail: "bg-rose-100 text-rose-800 border-rose-300",
};

/** DB 가 올린 표시를 사람 말로 옮깁니다 */
function readable(msg: string) {
  const stuck = msg.match(/STAGE_IN_USE:(.+?):(\d+)/);
  if (stuck) {
    return `‘${stuck[1]}’ 단계에 학생 ${stuck[2]}명이 남아 있어 지울 수 없습니다. 먼저 다른 단계로 옮기세요.`;
  }
  if (msg.includes("NO_STAGES")) return "단계를 하나도 남기지 않을 수는 없습니다.";
  if (msg.includes("EMPTY_NAME")) return "이름이 빈 단계가 있습니다.";
  if (msg.includes("FORBIDDEN")) return "권한이 없습니다.";
  return "처리하지 못했습니다. " + msg;
}

export default function RosterBoard({
  eventId,
  schoolId,
  stages,
  rows,
  canManage,
  canSetVisibility,
  visibility,
}: {
  eventId: string;
  schoolId: string;
  stages: Stage[];
  rows: RosterRow[];
  canManage: boolean;
  canSetVisibility: boolean;
  visibility: "assignees" | "school";
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const [, startTransition] = useTransition();
  // 단계 고치기 — 열면 지금 단계를 그대로 담아 시작합니다
  const [editing, setEditing] = useState<StageDraft[] | null>(null);
  // 메모는 칸을 떠날 때 저장합니다. 한 글자마다 부르면 너무 잦습니다.
  const [notes, setNotes] = useState<Record<string, string>>({});

  const total = rows.length;
  const done = rows.filter((r) => r.stage_kind !== "active" && r.stage_kind).length;

  /** supabase 빌더는 thenable 이라 PromiseLike 로 받습니다 */
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(readable(error.message));
      return false;
    }
    setPicked([]);
    startTransition(() => router.refresh());
    return true;
  }

  const move = (students: string[], stageId: string | null) =>
    run(() =>
      createClient().rpc("set_roster_stage", {
        p_event: eventId,
        p_students: students,
        p_stage: stageId,
        p_note: null,
      })
    );

  /** 학생이 남아 있는 단계는 지울 수 없습니다 — × 를 미리 막아 둡니다 */
  const stagesInUse = new Set(
    rows.map((r) => r.stage_id).filter((id): id is string => Boolean(id))
  );

  async function saveStages() {
    if (!editing) return;
    if (stageProblem(editing)) return setError(stageProblem(editing));

    const ok = await run(() =>
      createClient().rpc("update_event_stages", {
        p_event: eventId,
        p_stages: editing.map((st) => ({
          id: st.id ?? null,
          name: st.name.trim(),
          kind: st.kind,
        })),
      })
    );
    if (ok) setEditing(null);
  }

  async function saveNote(studentId: string, next: string) {
    const before = rows.find((r) => r.student_id === studentId)?.note ?? "";
    if (next.trim() === before.trim()) return;
    await run(() =>
      createClient().rpc("set_roster_note", {
        p_event: eventId,
        p_student: studentId,
        p_note: next,
      })
    );
  }

  const remove = () =>
    run(() =>
      createClient().rpc("remove_roster_students", {
        p_event: eventId,
        p_students: picked,
      })
    );

  /**
   * 학년 단위로 찾습니다.
   * students 테이블을 직접 읽으면 자기 반만 나오므로,
   * 학년 범위를 검사하는 RPC 를 씁니다.
   */
  async function search(text: string) {
    setQ(text);
    if (text.trim().length < 1) return setFound([]);

    const { data, error } = await createClient().rpc("search_roster_candidates", {
      p_event: eventId,
      p_q: text.trim(),
    });

    if (error) {
      setError("학생을 찾지 못했습니다. " + error.message);
      return setFound([]);
    }
    setFound(
      (data ?? []).map(
        (s: {
          student_id: string;
          student_name: string;
          classroom_name: string;
          student_no: number;
        }) => ({
          id: s.student_id,
          name: s.student_name,
          number: s.student_no,
          classroom_name: s.classroom_name,
        })
      )
    );
  }

  async function add(id: string) {
    const ok = await run(() =>
      createClient().rpc("add_roster_students", {
        p_event: eventId,
        p_students: [id],
      })
    );
    if (ok) {
      setFound((f) => f.filter((x) => x.id !== id));
      setQ("");
    }
  }

  async function applyPreset(preset: (typeof PRESETS)[number]) {
    await run(() =>
      createClient().rpc("set_event_stages", {
        p_event: eventId,
        p_stages: preset.stages.map(([name, kind]) => ({ name, kind })),
      })
    );
  }

  /* ── 단계가 아직 없을 때 ─────────────────────────────── */
  if (stages.length === 0) {
    if (!canManage) return null;
    return (
      <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 font-semibold">진행 명단</h2>
        <p className="mb-4 text-sm text-slate-500">
          반을 가로질러 학생을 골라 담고, 단계별로 진행 상황을 관리합니다.
          <br />
          예) 2027 과학고 진학 — 준비 → 서류제출 → 면접 → 합격
        </p>
        <p className="mb-2 text-sm font-medium">단계 묶음을 고르세요</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-3 py-2 text-left text-sm disabled:opacity-50"
            >
              <span className="block font-medium">{p.label}</span>
              <span className="block text-xs text-slate-500">
                {p.stages.map(([n]) => n).join(" → ")}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      </section>
    );
  }

  return (
    <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">진행 명단</h2>
        <span className="text-sm text-slate-500">
          {total}명{total > 0 && ` · 마무리 ${done}`}
        </span>

        {canSetVisibility && (
          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-slate-400">공개</span>
            {(
              [
                ["assignees", "담당자만"],
                ["school", "전 교직원"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() =>
                  run(() =>
                    createClient().rpc("set_roster_visibility", {
                      p_event: eventId,
                      p_mode: v,
                    })
                  )
                }
                disabled={busy}
                className={`rounded px-2 py-1 ${
                  visibility === v
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mb-4 text-xs text-slate-500">
        {visibility === "school"
          ? "이 명단은 학교 교직원 전체가 볼 수 있습니다."
          : "담당자 · 부장 · 관리자만 명단 전체를 봅니다. 담임에게는 자기 반 학생만 보입니다."}
      </p>

      {/* 단계 고치기 */}
      {editing ? (
        <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <StageList
            value={editing}
            onChange={setEditing}
            lockedIds={stagesInUse}
          />
          <p className="mt-2 text-xs text-slate-500">
            이름을 고쳐도 그 단계에 있던 학생은 그대로 남습니다. 학생이 있는 단계는
            지울 수 없으니, 먼저 다른 단계로 옮기세요.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setEditing(null);
                setError("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
            >
              취소
            </button>
            <button
              onClick={saveStages}
              disabled={busy || Boolean(stageProblem(editing))}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "단계 저장"}
            </button>
          </div>
        </div>
      ) : null}

      {/* 파이프라인 요약 */}
      <ol className="mb-4 flex flex-wrap items-center gap-1">
        {stages.map((s, i) => (
          <li key={s.stage_id} className="flex items-center gap-1">
            <button
              onClick={() => picked.length > 0 && move(picked, s.stage_id)}
              disabled={picked.length === 0 || busy || !canManage}
              title={picked.length > 0 ? `선택한 ${picked.length}명을 여기로` : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${KIND_STYLE[s.stage_kind]} ${
                picked.length > 0 && canManage
                  ? "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-slate-900"
                  : "cursor-default"
              }`}
            >
              {s.stage_name} <b className="ml-0.5">{s.count}</b>
            </button>
            {i < stages.length - 1 && <span className="text-slate-300">›</span>}
          </li>
        ))}
        {canManage && !editing && (
          <li className="ml-2">
            <button
              onClick={() =>
                setEditing(
                  stages.map((st) => ({
                    id: st.stage_id,
                    name: st.stage_name,
                    kind: st.stage_kind,
                  }))
                )
              }
              className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-900"
            >
              단계 고치기
            </button>
          </li>
        )}
      </ol>

      {picked.length > 0 && canManage && (
        <p className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
          {picked.length}명 선택됨 — 위 단계를 누르면 한 번에 옮깁니다.
          <button
            onClick={remove}
            disabled={busy}
            className="ml-3 rounded border border-white/40 px-2 py-0.5 text-xs"
          >
            명단에서 빼기
          </button>
          <button
            onClick={() => setPicked([])}
            className="ml-1 rounded px-2 py-0.5 text-xs text-white/70"
          >
            선택 해제
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          아직 담은 학생이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                {canManage && (
                  <th className="w-8 border border-slate-200 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={picked.length === rows.length && rows.length > 0}
                      onChange={(e) =>
                        setPicked(e.target.checked ? rows.map((r) => r.student_id) : [])
                      }
                    />
                  </th>
                )}
                <th className="border border-slate-200 px-3 py-1.5">반</th>
                <th className="border border-slate-200 px-3 py-1.5">이름</th>
                <th className="border border-slate-200 px-3 py-1.5">단계</th>
                <th className="border border-slate-200 px-3 py-1.5">최근 변경</th>
                <th className="border border-slate-200 px-3 py-1.5">메모</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id} className={picked.includes(r.student_id) ? "bg-slate-50" : ""}>
                  {canManage && (
                    <td className="border border-slate-200 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={picked.includes(r.student_id)}
                        onChange={(e) =>
                          setPicked((v) =>
                            e.target.checked
                              ? [...v, r.student_id]
                              : v.filter((x) => x !== r.student_id)
                          )
                        }
                      />
                    </td>
                  )}
                  <td className="border border-slate-200 px-3 py-1.5 text-slate-500">
                    {r.classroom_name}
                  </td>
                  <td className="border border-slate-200 px-3 py-1.5 font-medium">
                    {r.student_no}. {r.student_name}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5">
                    {canManage ? (
                      <select
                        value={r.stage_id ?? ""}
                        onChange={(e) => move([r.student_id], e.target.value || null)}
                        disabled={busy}
                        className={`w-full rounded border px-2 py-1 text-sm outline-none ${
                          KIND_STYLE[r.stage_kind ?? "active"]
                        }`}
                      >
                        <option value="">단계 없음</option>
                        {stages.map((s) => (
                          <option key={s.stage_id} value={s.stage_id}>
                            {s.stage_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`rounded border px-2 py-0.5 text-xs ${
                          KIND_STYLE[r.stage_kind ?? "active"]
                        }`}
                      >
                        {r.stage_name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-200 px-3 py-1.5 text-xs text-slate-400">
                    {formatDateTime(r.updated_at)}
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    {canManage ? (
                      <input
                        value={notes[r.student_id] ?? r.note}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [r.student_id]: e.target.value }))
                        }
                        onBlur={(e) => saveNote(r.student_id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            setNotes((n) => ({ ...n, [r.student_id]: r.note }));
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="—"
                        className="w-full rounded border border-transparent px-2 py-1 text-xs outline-none hover:border-slate-200 focus:border-slate-900"
                      />
                    ) : (
                      <span className="block px-2 py-1 text-xs text-slate-600">{r.note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="mt-3">
          {adding ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <input
                autoFocus
                value={q}
                onChange={(e) => search(e.target.value)}
                placeholder="학생 이름으로 찾기 (같은 학년)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                {found.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => add(s.id)}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="w-12 text-slate-400">{s.classroom_name}</span>
                      <span className="font-medium">
                        {s.number}. {s.name}
                      </span>
                      <span className="ml-auto text-xs text-slate-400">+ 담기</span>
                    </button>
                  </li>
                ))}
                {q.trim() && found.length === 0 && (
                  <li className="px-2 py-3 text-center text-xs text-slate-400">
                    찾는 학생이 없습니다. 같은 학년 학생만 검색됩니다.
                  </li>
                )}
              </ul>
              <button
                onClick={() => {
                  setAdding(false);
                  setQ("");
                  setFound([]);
                }}
                className="mt-1 text-xs text-slate-500"
              >
                닫기
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              + 학생 추가
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
