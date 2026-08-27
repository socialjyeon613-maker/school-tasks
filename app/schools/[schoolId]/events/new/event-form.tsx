"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compactClassLabel } from "@/lib/format";
import { categoryStyle } from "@/lib/types";

interface Grade { id: string; grade_no: number; name: string }
interface Classroom { id: string; grade_id: string; class_no: number; name: string }
interface Category { id: string; name: string; color: string; lane: string }
interface Period { id: string; no: number; name: string }

type Scope = "school" | "grade" | "classroom";

export default function EventForm({
  schoolId,
  yearId,
  defaultDate,
  defaultGradeId,
  grades,
  classrooms,
  categories,
  periods,
}: {
  schoolId: string;
  yearId: string;
  defaultDate: string;
  defaultGradeId: string;
  grades: Grade[];
  classrooms: Classroom[];
  categories: Category[];
  periods: Period[];
}) {
  const router = useRouter();
  const maxPeriod = periods.length ? Math.max(...periods.map((p) => p.no)) : 7;

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(1);
  const [periodTo, setPeriodTo] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [requiresParticipation, setRequiresParticipation] = useState(false);
  const [eventType, setEventType] = useState<"academic" | "task">("academic");
  const [dueAt, setDueAt] = useState("");

  const [scope, setScope] = useState<Scope>(defaultGradeId ? "grade" : "school");
  const [gradeId, setGradeId] = useState(defaultGradeId || grades[0]?.id || "");
  const [classIds, setClassIds] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const gradeClassrooms = useMemo(
    () => classrooms.filter((c) => c.grade_id === gradeId),
    [classrooms, gradeId]
  );

  const selectedLabel = useMemo(() => {
    if (scope === "school") return "전교";
    if (scope === "grade") return grades.find((g) => g.id === gradeId)?.name ?? "";
    const nos = gradeClassrooms
      .filter((c) => classIds.includes(c.id))
      .map((c) => c.class_no);
    return nos.length ? compactClassLabel(nos) : "반을 선택하세요";
  }, [scope, gradeId, classIds, gradeClassrooms, grades]);

  function toggleClass(id: string) {
    setClassIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function selectRange(from: number, to: number) {
    setClassIds(
      gradeClassrooms
        .filter((c) => c.class_no >= from && c.class_no <= to)
        .map((c) => c.id)
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (scope === "classroom" && classIds.length === 0) {
      setError("대상 반을 하나 이상 선택하세요.");
      return;
    }
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_event", {
      p_year_id: yearId,
      p_title: title,
      p_start_date: startDate,
      p_end_date: endDate || null,
      p_category_id: categoryId || null,
      p_event_type: eventType,
      p_all_day: allDay,
      p_period_from: allDay ? null : periodFrom,
      p_period_to: allDay ? null : periodTo,
      p_start_time: startTime || null,
      p_location: location,
      p_requires_participation: requiresParticipation,
      p_classroom_ids: scope === "classroom" ? classIds : [],
      p_grade_ids: scope === "grade" ? [gradeId] : [],
      p_department_ids: [],
      p_due_at: eventType === "task" && dueAt ? new Date(dueAt).toISOString() : null,
    });

    if (error) {
      setError(
        error.message.includes("FORBIDDEN")
          ? "일정을 등록할 권한이 없습니다. (부장 또는 관리자만 가능)"
          : "등록에 실패했습니다. " + error.message
      );
      setBusy(false);
      return;
    }

    router.push(`/schools/${schoolId}/events/${data}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <Field label="유형">
        <div className="flex gap-1">
          {(
            [
              ["academic", "학사일정", "언제 무엇이 있다 (공지)"],
              ["task", "업무", "누가 언제까지 무엇을 한다"],
            ] as Array<["academic" | "task", string, string]>
          ).map(([v, l, hint]) => (
            <button
              key={v}
              type="button"
              onClick={() => setEventType(v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left ${
                eventType === v
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300"
              }`}
            >
              <span className="block text-sm font-medium">{l}</span>
              <span className="block text-xs opacity-60">{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="일정명">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          placeholder="난타 공연"
        />
      </Field>

      <Field label="분류">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`rounded border px-2.5 py-1 text-sm ${categoryStyle(c.color)} ${
                categoryId === c.id ? "ring-2 ring-slate-900" : ""
              }`}
            >
              {c.name}
              {c.lane === "side" && <span className="ml-1 text-[10px]">별도열</span>}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="시작일">
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </Field>
        <Field label="종료일 (기간 일정만)">
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </Field>
      </div>

      <Field label="교시">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          종일 (교시 전체)
        </label>

        {!allDay && (
          <div className="flex flex-wrap gap-1">
            {periods.map((p) => {
              const inRange = p.no >= periodFrom && p.no <= periodTo;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    // 첫 클릭은 시작, 두 번째 클릭은 끝
                    if (periodFrom === periodTo && p.no >= periodFrom) setPeriodTo(p.no);
                    else {
                      setPeriodFrom(p.no);
                      setPeriodTo(p.no);
                    }
                  }}
                  className={`w-14 rounded border py-1.5 text-sm ${
                    inRange
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300"
                  }`}
                >
                  {p.no}
                </button>
              );
            })}
            <span className="self-center pl-2 text-sm text-slate-500">
              {periodFrom === periodTo ? `${periodFrom}교시` : `${periodFrom}~${periodTo}교시`}
            </span>
          </div>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="집합 시각 (선택)">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </Field>
        <Field label="장소">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="홍대 전용관"
          />
        </Field>
      </div>

      <Field label={`대상 — ${selectedLabel}`}>
        <div className="mb-2 flex gap-1">
          {(
            [
              ["school", "전교"],
              ["grade", "학년"],
              ["classroom", "반 지정"],
            ] as Array<[Scope, string]>
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                scope === v ? "bg-slate-900 text-white" : "border border-slate-300"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {scope !== "school" && (
          <div className="mb-2 flex flex-wrap gap-1">
            {grades.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGradeId(g.id);
                  setClassIds([]);
                }}
                className={`rounded px-2.5 py-1 text-sm ${
                  gradeId === g.id ? "bg-slate-700 text-white" : "border border-slate-300"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {scope === "classroom" && (
          <>
            <div className="mb-2 flex flex-wrap gap-1 text-xs">
              <span className="self-center text-slate-500">빠른 선택:</span>
              <button type="button" onClick={() => selectRange(1, Math.ceil(gradeClassrooms.length / 2))}
                className="rounded border border-slate-300 px-2 py-1">앞반</button>
              <button type="button" onClick={() => selectRange(Math.ceil(gradeClassrooms.length / 2) + 1, 99)}
                className="rounded border border-slate-300 px-2 py-1">뒷반</button>
              <button type="button" onClick={() => selectRange(1, 99)}
                className="rounded border border-slate-300 px-2 py-1">전체</button>
              <button type="button" onClick={() => setClassIds([])}
                className="rounded border border-slate-300 px-2 py-1">해제</button>
            </div>

            <div className="flex flex-wrap gap-1">
              {gradeClassrooms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClass(c.id)}
                  className={`w-14 rounded border py-1.5 text-sm ${
                    classIds.includes(c.id)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300"
                  }`}
                >
                  {c.class_no}반
                </button>
              ))}
            </div>
          </>
        )}
      </Field>

      {eventType === "task" && (
        <Field label="마감">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
          <p className="mt-1 text-xs text-slate-500">
            등록 후 상세 화면에서 담당자를 배정하면, 담당자별로 완료 여부가 따로 관리됩니다.
          </p>
        </Field>
      )}

      <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={requiresParticipation}
          onChange={(e) => setRequiresParticipation(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <b>학생 참여 체크</b>
          <span className="block text-xs text-slate-500">
            켜면 담임이 반별로 참여/불참을 입력하고, 부장 화면에 반별 집계와
            불참자 명단이 나타납니다.
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
