"use client";

/**
 * 단계 목록 편집 — 등록 화면 · 편집 화면 · 명단 화면이 함께 씁니다.
 *
 * id 가 있으면 이미 있는 단계입니다. 이름을 고쳐도 id 로 짝을 맞추므로
 * 거기 있던 학생이 떨어져 나가지 않습니다 (DB의 update_event_stages).
 */

export interface StageDraft {
  id?: string | null;
  name: string;
  kind: "active" | "success" | "fail";
}

/** 해마다 반복되는 단계 묶음 — 고른 뒤 이름을 고쳐 쓰면 됩니다 */
export const STAGE_PRESETS: Array<{ label: string; stages: StageDraft[] }> = [
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

/** 저장하기 전에 걸러야 할 것 — 화면과 저장 두 곳에서 같은 규칙을 씁니다 */
export function stageProblem(stages: StageDraft[]): string {
  if (stages.length === 0) return "단계를 하나 이상 만드세요.";
  if (stages.some((s) => !s.name.trim())) return "이름이 빈 단계가 있습니다.";
  const names = stages.map((s) => s.name.trim());
  if (new Set(names).size !== names.length) return "같은 이름의 단계가 있습니다.";
  return "";
}

export default function StageList({
  value,
  onChange,
  /** 학생이 남아 있어 지울 수 없는 단계 id — × 를 막고 이유를 보입니다 */
  lockedIds,
}: {
  value: StageDraft[];
  onChange: (v: StageDraft[]) => void;
  lockedIds?: Set<string>;
}) {
  const setStage = (i: number, patch: Partial<StageDraft>) =>
    onChange(value.map((s, n) => (n === i ? { ...s, ...patch } : s)));

  /** 위/아래 단추로 순서를 바꿉니다 — 폰에서 끌어 옮기는 것보다 정확합니다 */
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  const problem = stageProblem(value);
  // 묶음을 고르면 지금 단계를 통째로 갈아치웁니다. 학생이 붙어 있으면
  // 저장할 때 막히니, 아예 내놓지 않습니다.
  const showPresets = !lockedIds || lockedIds.size === 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">단계</p>
        <span className="text-xs text-slate-500">위에서 아래 순서로 진행됩니다</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {showPresets && STAGE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.stages.map((s) => ({ ...s })))}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-1.5">
        {value.map((s, i) => {
          const locked = Boolean(s.id && lockedIds?.has(s.id));
          return (
            <li key={s.id ?? `new-${i}`} className="flex items-center gap-1.5">
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
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="위로"
                className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === value.length - 1}
                aria-label="아래로"
                className="shrink-0 rounded border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, n) => n !== i))}
                disabled={locked}
                aria-label="삭제"
                title={locked ? "학생이 남아 있어 지울 수 없습니다" : undefined}
                className="shrink-0 rounded px-1.5 py-1 text-xs text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onChange([...value, { name: "", kind: "active" }])}
        className="mt-2 text-sm text-slate-500 hover:text-slate-900"
      >
        + 단계 추가
      </button>

      {value.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {value.map((s) => s.name.trim() || "…").join(" → ")}
        </p>
      )}
      {problem && <p className="mt-1 text-xs text-rose-700">{problem}</p>}
    </div>
  );
}
