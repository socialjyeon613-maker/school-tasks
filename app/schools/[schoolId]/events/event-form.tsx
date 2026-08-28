"use client";

import { useMemo, useState } from "react";
import DeleteEvent from "./delete-event";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compactClassLabel, teacherColor } from "@/lib/format";
import { categoryStyle } from "@/lib/types";
import RosterSetup, { type RosterDraft } from "./roster-setup";
import StageList, { stageProblem, type StageDraft } from "./stage-list";

interface Grade { id: string; grade_no: number; name: string }
interface Classroom { id: string; grade_id: string; class_no: number; name: string }
interface Category { id: string; name: string; color: string; lane: string }
interface Period { id: string; no: number; name: string }
export interface Member { user_id: string; name: string; email: string; duty: string }

type Scope = "school" | "grade" | "classroom";
type Kind = "academic" | "task" | "notice";

/** 편집 모드에서 넘겨주는 기존 값 */
export interface EventInitial {
  id: string;
  title: string;
  categoryId: string | null;
  eventType: Kind;
  startDate: string;
  endDate: string;
  allDay: boolean;
  periodFrom: number | null;
  periodTo: number | null;
  startTime: string | null;
  location: string;
  requiresParticipation: boolean;
  dailyParticipation: boolean;
  description: string;
  dueAt: string | null;
  classroomIds: string[];
  gradeIds: string[];
  /** 이미 입력된 참여 기록 수 — 대상을 바꾸면 어긋나므로 경고에 씁니다 */
  participationCount: number;
  attachmentPaths: string[];
  assigneeIds: string[];
  /** 이미 붙은 진행 명단 — 단계가 없으면 아직 안 쓰는 일정입니다 */
  stages: StageDraft[];
  /** 학생이 남아 있는 단계 id — 이 단계는 지울 수 없습니다 */
  stagesInUse: string[];
  rosterVisibility: "assignees" | "school";
}

/** 명단 쪽 DB 표시를 사람 말로 */
function rosterMessage(msg: string) {
  const stuck = msg.match(/STAGE_IN_USE:(.+?):(\d+)/);
  if (stuck) {
    return `‘${stuck[1]}’ 단계에 학생 ${stuck[2]}명이 남아 있어 지울 수 없습니다. 명단 화면에서 먼저 옮기세요.`;
  }
  if (msg.includes("NO_STAGES")) return "단계를 하나도 남기지 않을 수는 없습니다.";
  if (msg.includes("VISIBILITY_FORBIDDEN"))
    return "공개 범위를 전 교직원으로 넓히는 것은 부장 · 관리자만 할 수 있습니다.";
  if (msg.includes("FORBIDDEN")) return "진행 명단을 고칠 권한이 없습니다.";
  return "진행 명단을 저장하지 못했습니다. " + msg;
}

export default function EventForm({
  schoolId,
  yearId,
  defaultDate,
  defaultGradeId,
  defaultClassroomId = "",
  grades,
  classrooms,
  categories,
  periods,
  members,
  canPostNotice,
  canOpenRoster,
  defaultKind = "academic",
  initial,
}: {
  schoolId: string;
  yearId: string;
  defaultDate: string;
  defaultGradeId: string;
  /** 담임이면 자기 반을 기본 대상으로 */
  defaultClassroomId?: string;
  grades: Grade[];
  classrooms: Classroom[];
  categories: Category[];
  periods: Period[];
  /** 업무 담당자로 지정할 수 있는 교직원 */
  members: Member[];
  /** 공지 등록 권한 (부장 · 관리자) */
  canPostNotice: boolean;
  /** 명단 공개 범위를 전 교직원으로 넓힐 수 있는가 (부장 · 관리자) */
  canOpenRoster: boolean;
  defaultKind?: Kind;
  /** 없으면 등록 모드, 있으면 편집 모드 */
  initial?: EventInitial;
}) {
  const isEdit = Boolean(initial);
  const router = useRouter();
  const maxPeriod = periods.length ? Math.max(...periods.map((p) => p.no)) : 7;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? categories[0]?.id ?? ""
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(
    initial && initial.endDate !== initial.startDate ? initial.endDate : ""
  );
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [periodFrom, setPeriodFrom] = useState(initial?.periodFrom ?? 1);
  const [periodTo, setPeriodTo] = useState(initial?.periodTo ?? initial?.periodFrom ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [requiresParticipation, setRequiresParticipation] = useState(
    initial?.requiresParticipation ?? false
  );
  const [dailyParticipation, setDailyParticipation] = useState(
    initial?.dailyParticipation ?? false
  );
  const [eventType, setEventType] = useState<Kind>(initial?.eventType ?? defaultKind);
  const [description, setDescription] = useState(initial?.description ?? "");
  // datetime-local 은 'YYYY-MM-DDTHH:mm' 형식만 받습니다.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assigneeIds ?? []
  );
  const [useRoster, setUseRoster] = useState(false);
  // 이미 명단이 붙어 있으면 단계와 공개 범위를 여기서 고칩니다.
  const hasRoster = isEdit && initial!.stages.length > 0;
  const [stages, setStages] = useState<StageDraft[]>(initial?.stages ?? []);
  const [rosterVis, setRosterVis] = useState<"assignees" | "school">(
    initial?.rosterVisibility ?? "assignees"
  );
  const [roster, setRoster] = useState<RosterDraft>({
    stages: [],
    visibility: "assignees",
    students: [],
  });
  const [dueAt, setDueAt] = useState(
    initial?.dueAt ? toLocalInput(initial.dueAt) : ""
  );

  const initialScope: Scope = initial
    ? initial.classroomIds.length
      ? "classroom"
      : initial.gradeIds.length
        ? "grade"
        : "school"
    : defaultClassroomId
      ? "classroom"
      : defaultGradeId
        ? "grade"
        : "school";

  // 편집 모드면 기존 대상에서, 아니면 URL 기본값에서 학년을 정합니다.
  const initialGradeId =
    initial?.gradeIds[0] ??
    (initial?.classroomIds.length
      ? classrooms.find((c) => c.id === initial.classroomIds[0])?.grade_id
      : undefined) ??
    (defaultGradeId ||
      classrooms.find((c) => c.id === defaultClassroomId)?.grade_id ||
      grades[0]?.id ||
      "");

  const [scope, setScope] = useState<Scope>(initialScope);
  const [gradeId, setGradeId] = useState(initialGradeId);
  const [classIds, setClassIds] = useState<string[]>(
    initial?.classroomIds ?? (defaultClassroomId ? [defaultClassroomId] : [])
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 일정은 만들어졌는데 명단 설정만 실패한 경우 — 다시 등록하면 중복이 생깁니다
  const [createdId, setCreatedId] = useState("");
  /*
    흔한 일정은 '이름 · 날짜 · 교시' 로 끝납니다. 기간 · 시각 · 장소까지
    늘 펼쳐 두면 칸이 열한 개라 처음 보는 사람이 주눅 듭니다. 접어 두되,
    고칠 때 값이 들어 있으면 자동으로 펴서 사라진 것처럼 보이지 않게 합니다.
  */
  /*
    펼침 여부는 '화면에 실제로 값이 보이는가' 로 판단합니다.
      - end_date 는 not null 이라 하루짜리도 시작일과 같은 값이 들어갑니다.
        그대로 보면 모든 일정이 늘 펼쳐집니다. 여러 날일 때만 셉니다.
      - 집합 시각은 학사일정에만 그리므로, 업무에서는 값이 남아 있어도
        보이지 않아 세지 않습니다.
  */
  const [showExtra, setShowExtra] = useState(
    Boolean(
      (initial && initial.endDate !== initial.startDate) ||
        initial?.location ||
        (initial?.eventType === "academic" && initial?.startTime)
    )
  );

  const isTask = eventType === "task";
  const isNotice = eventType === "notice";
  const isPlain = eventType === "academic";
  const isMultiDay = Boolean(endDate && endDate > startDate);

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
    if (isPlain && scope === "classroom" && classIds.length === 0) {
      setError("대상 반을 하나 이상 선택하세요.");
      return;
    }
    if (hasRoster && stageProblem(stages)) {
      setError(stageProblem(stages));
      return;
    }
    if (!isEdit && useRoster) {
      const names = roster.stages.map((st) => st.name.trim());
      if (names.length === 0) {
        setError("진행 명단을 쓰려면 단계를 하나 이상 만드세요.");
        return;
      }
      if (names.some((n) => !n)) {
        setError("이름이 빈 단계가 있습니다.");
        return;
      }
      if (new Set(names).size !== names.length) {
        setError("같은 이름의 단계가 있습니다.");
        return;
      }
    }

    setBusy(true);
    setError("");

    const supabase = createClient();
    const shared = {
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
      p_classroom_ids: isPlain && scope === "classroom" ? classIds : [],
      p_grade_ids: isPlain && scope === "grade" ? [gradeId] : [],
      p_department_ids: [],
      p_due_at: eventType === "task" && dueAt ? new Date(dueAt).toISOString() : null,
      p_daily_participation: isMultiDay && requiresParticipation && dailyParticipation,
      p_assignee_ids: isTask ? assigneeIds : [],
      p_description: description,
    };

    try {
      const { data, error } = isEdit
        ? await supabase.rpc("update_event", { p_event: initial!.id, ...shared })
        : await supabase.rpc("create_event", { p_year_id: yearId, ...shared });

      if (error) {
        setError(
          error.message.includes("FORBIDDEN")
            ? "이 일정을 수정할 권한이 없습니다. (작성자 · 담당자 · 부장 · 관리자만 가능)"
            : `${isEdit ? "수정" : "등록"}에 실패했습니다. ${error.message}`
        );
        return;
      }

      const eventId = isEdit ? initial!.id : (data as string);

      // 이미 붙은 명단은 단계와 공개 범위만 여기서 고칩니다.
      // 학생을 담고 빼는 것은 명단 화면에서 합니다 — 여기선 학생이 안 보입니다.
      if (hasRoster) {
        const changed =
          JSON.stringify(stages) !== JSON.stringify(initial!.stages);
        if (changed) {
          const { error: sErr } = await supabase.rpc("update_event_stages", {
            p_event: eventId,
            p_stages: stages.map((st) => ({
              id: st.id ?? null,
              name: st.name.trim(),
              kind: st.kind,
            })),
          });
          if (sErr) {
            setError(rosterMessage(sErr.message));
            return;
          }
        }
        if (rosterVis !== initial!.rosterVisibility) {
          const { error: vErr } = await supabase.rpc("set_roster_visibility", {
            p_event: eventId,
            p_mode: rosterVis,
          });
          if (vErr) {
            setError(rosterMessage(vErr.message));
            return;
          }
        }
      }

      // 진행 명단은 일정이 만들어진 뒤에 붙입니다.
      // 여기서 실패해도 일정은 남으므로, 상세 화면에서 이어서 설정할 수 있습니다.
      if (!isEdit && useRoster && roster.stages.length > 0) {
        const { error: rErr } = await supabase.rpc("setup_roster", {
          p_event: eventId,
          p_stages: roster.stages.map((st) => ({
            name: st.name.trim(),
            kind: st.kind,
          })),
          p_visibility: roster.visibility,
          p_students: roster.students.map((st) => st.id),
        });
        if (rErr) {
          // 여기서 화면을 옮기면 이유를 못 보고, 다시 등록하면 일정이 중복됩니다.
          // 그래서 머무른 채 알리고, 만들어진 일정으로 갈 길만 열어 둡니다.
          setCreatedId(eventId);
          setError(
            `일정 "${title}" 은 등록됐지만 진행 명단 설정에 실패했습니다. ` +
              `아래 단추로 이동해 상세 화면에서 이어서 설정하세요. (${rErr.message})`
          );
          return;
        }
      }

      router.push(`/schools/${schoolId}/events/${eventId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }



  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <Field label="유형">
        <div className="flex gap-1">
          {(
            [
              ["academic", "학사일정", "언제 무엇이 있다"],
              ["task", "업무", "누가 언제까지 무엇을 한다"],
              ...(canPostNotice
                ? ([["notice", "공지", "기간 동안 알리는 글"]] as Array<
                    [Kind, string, string]
                  >)
                : []),
            ] as Array<[Kind, string, string]>
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
        <Field label={isNotice ? "게시 시작일" : "시작일"}>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </Field>
        {/* 공지는 언제까지 붙일지가 핵심이라 늘 내놓습니다 */}
        {(isNotice || showExtra) && (
          <Field label={isNotice ? "게시 종료일" : "종료일 (기간 일정만)"}>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            />
          </Field>
        )}
      </div>

      {!isNotice && !showExtra && (
        <button
          type="button"
          onClick={() => setShowExtra(true)}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ＋ 기간 · {isPlain ? "집합 시각 · 장소" : "비고"}
        </button>
      )}

      {isPlain && (
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
      )}

      <div
        className={`grid gap-4 ${isPlain ? "sm:grid-cols-2" : ""} ${
          isNotice || showExtra ? "" : "hidden"
        }`}
      >
        {isPlain && (
        <Field label="집합 시각 (선택)">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </Field>
        )}
        {!isNotice && (
        <Field label={isTask ? "비고 (선택)" : "장소"}>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder={isTask ? "제출처 · 참고사항" : "홍대 전용관"}
          />
        </Field>
        )}
      </div>

      {isPlain && (
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
      )}

      {isNotice && (
        <Field label="내용">
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="선생님들께 알릴 내용을 적으세요."
          />
          <p className="mt-1 text-xs text-slate-500">
            게시 기간 동안 학사일정 화면 왼쪽에 표시됩니다.
          </p>
        </Field>
      )}

      {isTask && (
        <Field
          label={`담당자 ${assigneeIds.length > 0 ? `— ${assigneeIds.length}명` : ""}`}
        >
          {members.length === 0 ? (
            <p className="text-sm text-slate-500">
              아직 다른 교직원이 없습니다. 관리 화면에서 초대하세요.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                지정한 사람마다 완료 여부가 따로 관리되고, 각자의 「내 할 일」에 나타납니다.
              </p>
              <ul className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                {members.map((m) => {
                  const on = assigneeIds.includes(m.user_id);
                  const color = teacherColor(m.user_id);
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() =>
                          setAssigneeIds((v) =>
                            v.includes(m.user_id)
                              ? v.filter((x) => x !== m.user_id)
                              : [...v, m.user_id]
                          )
                        }
                        className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-sm ${
                          on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{m.name}</span>
                          {m.duty && (
                            <span className="ml-1 text-xs opacity-60">{m.duty}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Field>
      )}

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

      {isPlain && (
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
      )}

      {isPlain && requiresParticipation && isMultiDay && (
        <div className="rounded-lg border border-slate-300 bg-white p-4">
          <p className="mb-2 text-sm font-medium">
            {startDate.slice(5).replace("-", "/")} ~ {endDate.slice(5).replace("-", "/")} · 여러 날 일정입니다
          </p>
          <div className="space-y-2">
            {(
              [
                [false, "한 번만 체크", "일정 전체에 한 번. 현장체험학습처럼 하루 단위로 참여 여부가 정해지는 경우."],
                [true, "매일 출석 체크", "날짜마다 따로 받습니다. 수련회 · 캠프 · 방과후 강좌처럼 날마다 달라지는 경우."],
              ] as Array<[boolean, string, string]>
            ).map(([v, label, hint]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setDailyParticipation(v)}
                className={`block w-full rounded-lg border px-3 py-2.5 text-left ${
                  dailyParticipation === v
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200"
                }`}
              >
                <span className="block text-sm font-medium">
                  {dailyParticipation === v ? "● " : "○ "}
                  {label}
                </span>
                <span className="block pl-4 text-xs text-slate-500">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasRoster && (
        <div className="rounded-lg border border-slate-300 bg-white p-4">
          <p className="mb-1 text-sm font-bold">진행 명단</p>
          <p className="mb-3 text-xs text-slate-500">
            학생을 담고 빼거나 단계를 옮기는 것은 일정 화면의 명단에서 합니다.
            여기서는 단계와 공개 범위만 고칩니다.
          </p>

          <StageList
            value={stages}
            onChange={setStages}
            lockedIds={new Set(initial!.stagesInUse)}
          />
          <p className="mt-2 text-xs text-slate-500">
            이름을 고쳐도 그 단계에 있던 학생은 그대로 남습니다. 학생이 있는 단계는
            지울 수 없으니, 명단 화면에서 먼저 옮기세요.
          </p>

          <p className="mb-1.5 mt-4 text-sm font-medium">누가 명단을 볼 수 있나</p>
          <div className="space-y-1.5">
            {(
              [
                [
                  "assignees",
                  "담당자만",
                  "담당자 · 부장 · 관리자만 명단 전체를 봅니다. 담임에게는 자기 반 학생만 보입니다.",
                ],
                ["school", "전 교직원", "그 학교 선생님 누구나 명단 전체를 봅니다."],
              ] as Array<["assignees" | "school", string, string]>
            ).map(([v, label, hint]) => {
              const blocked = v === "school" && !canOpenRoster;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={blocked}
                  onClick={() => setRosterVis(v)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left disabled:opacity-40 ${
                    rosterVis === v ? "border-slate-900 bg-slate-50" : "border-slate-200"
                  }`}
                >
                  <span className="block text-sm font-medium">
                    {rosterVis === v ? "● " : "○ "}
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
      )}

      {!isNotice && !isEdit && (
        <div>
          <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={useRoster}
              onChange={(e) => {
                setUseRoster(e.target.checked);
                if (e.target.checked && roster.stages.length === 0)
                  setRoster((r) => ({
                    ...r,
                    stages: [
                      { name: "준비", kind: "active" },
                      { name: "진행", kind: "active" },
                      { name: "완료", kind: "success" },
                    ],
                  }));
              }}
              className="mt-0.5"
            />
            <span>
              <b>진행 명단</b>
              <span className="block text-xs text-slate-500">
                반을 가로질러 학생을 골라 담고 단계별로 관리합니다.
                예) 2027 과학고 진학 — 준비 → 서류제출 → 면접 → 합격
              </span>
            </span>
          </label>

          {useRoster && (
            <div className="mt-2">
              <RosterSetup
                schoolId={schoolId}
                value={roster}
                onChange={setRoster}
                canOpenToSchool={canOpenRoster}
              />
            </div>
          )}
        </div>
      )}

      {isEdit && initial!.participationCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          이 일정에는 이미 <b>{initial!.participationCount}건</b>의 참여 기록이 있습니다.
          대상 학년 · 반을 바꾸면 새 대상의 학생은 <b>미입력</b> 상태가 되고,
          빠진 반의 기록은 집계에서 제외됩니다. (기록 자체는 지워지지 않습니다.)
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {createdId ? (
        <button
          type="button"
          onClick={() => {
            router.push(`/schools/${schoolId}/events/${createdId}`);
            router.refresh();
          }}
          className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white"
        >
          만들어진 일정으로 이동
        </button>
      ) : (
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
            {busy ? "저장 중…" : isEdit ? "저장" : "등록"}
          </button>
        </div>
      )}

      {isEdit && (
        <div className="border-t border-slate-200 pt-4">
          <DeleteEvent
            schoolId={schoolId}
            eventId={initial!.id}
            title={title}
            participationCount={initial!.participationCount}
            variant="link"
          />
        </div>
      )}
    </form>
  );
}

/** ISO 문자열 → datetime-local 이 받는 로컬 시각 'YYYY-MM-DDTHH:mm' */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
