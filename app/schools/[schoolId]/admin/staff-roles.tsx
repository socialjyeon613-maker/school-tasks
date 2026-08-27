"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Member { user_id: string; name: string; email: string }
interface Grade { id: string; name: string }
interface Classroom { id: string; grade_id: string; class_no: number; name: string }
interface Existing {
  id: string;
  user_id: string;
  role: string;
  grade_id: string | null;
  classroom_id: string | null;
  department_id: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  head: "부장",
  homeroom: "담임",
  co_homeroom: "부담임",
  member: "부원",
  subject: "교과",
};

export default function StaffRoles({
  schoolId,
  yearId,
  members,
  grades,
  classrooms,
  existing,
}: {
  schoolId: string;
  yearId: string;
  members: Member[];
  grades: Grade[];
  classrooms: Classroom[];
  existing: Existing[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(members[0]?.user_id ?? "");
  const [kind, setKind] = useState<"homeroom" | "head">("homeroom");
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.name ?? "—";
  const scopeOf = (r: Existing) =>
    classrooms.find((c) => c.id === r.classroom_id)?.name ??
    grades.find((g) => g.id === r.grade_id)?.name ??
    "부서";

  async function add() {
    setBusy(true);
    setError("");

    const { error } = await createClient().from("staff_roles").insert({
      school_id: schoolId,
      academic_year_id: yearId,
      user_id: userId,
      role: kind,
      classroom_id: kind === "homeroom" ? classroomId : null,
      grade_id: kind === "head" ? gradeId : null,
    });

    setBusy(false);
    if (error) {
      setError("배정에 실패했습니다. " + error.message);
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    await createClient().from("staff_roles").delete().eq("id", id);
    router.refresh();
  }

  if (members.length === 0) {
    return <p className="text-sm text-slate-500">먼저 교직원을 초대하세요.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">교직원</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">보직</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "homeroom" | "head")}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="homeroom">담임</option>
            <option value="head">학년부장</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">
            {kind === "homeroom" ? "반" : "학년"}
          </span>
          {kind === "homeroom" ? (
            <select
              value={classroomId}
              onChange={(e) => setClassroomId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
        </label>

        <button
          onClick={add}
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          배정
        </button>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {existing.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {existing.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-medium">{nameOf(r.user_id)}</span>
              <span className="text-slate-500">
                {scopeOf(r)} {ROLE_LABEL[r.role] ?? r.role}
              </span>
              <button
                onClick={() => remove(r.id)}
                className="ml-auto text-xs text-slate-400 hover:text-rose-600"
              >
                해제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
