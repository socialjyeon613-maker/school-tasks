"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ClassroomRow {
  id: string;
  name: string;
  class_no: number;
  count: number;
}

/**
 * 붙여넣기 한 줄 = 학생 한 명.
 *   "1  강OO"  /  "1,강OO,F"  /  "강OO"(연번 자동)
 * 연번을 건너뛰면 결번으로 남습니다 (전출 자리).
 */
function parse(text: string) {
  const rows: Array<{ number: number; name: string; gender?: string }> = [];
  let auto = 1;

  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;

    const parts = t.split(/[\t,]|\s{2,}|\s+/).filter(Boolean);
    const first = Number(parts[0]);

    if (Number.isFinite(first) && parts.length >= 2) {
      rows.push({ number: first, name: parts[1], gender: parts[2] });
      auto = first + 1;
    } else {
      rows.push({ number: auto, name: parts[0], gender: parts[1] });
      auto += 1;
    }
  }
  return rows;
}

export default function StudentImport({ classrooms }: { classrooms: ClassroomRow[] }) {
  const router = useRouter();
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const parsed = parse(text);

  async function submit() {
    setBusy(true);
    setMessage("");

    const { data, error } = await createClient().rpc("import_students", {
      p_classroom: classroomId,
      p_rows: parsed,
    });

    setBusy(false);
    if (error) {
      setMessage(
        error.message.includes("FORBIDDEN")
          ? "이 반에 학생을 등록할 권한이 없습니다."
          : "등록에 실패했습니다. " + error.message
      );
      return;
    }
    setMessage(`${data}명 등록했습니다.`);
    setText("");
    router.refresh();
  }

  if (classrooms.length === 0) {
    return <p className="text-sm text-slate-500">먼저 학년 · 반을 만드세요.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {classrooms.map((c) => (
          <button
            key={c.id}
            onClick={() => setClassroomId(c.id)}
            className={`rounded border px-2.5 py-1 text-sm ${
              classroomId === c.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300"
            }`}
          >
            {c.name}
            <span className="ml-1 text-xs opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"엑셀에서 복사해 붙여넣으세요.\n1\t강OO\n2\t김OO\n3\t김OO"}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-slate-900"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || parsed.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "등록 중…" : `${parsed.length}명 등록`}
        </button>
        {parsed.length > 0 && (
          <span className="text-sm text-slate-500">
            미리보기: {parsed.slice(0, 3).map((p) => `${p.number} ${p.name}`).join(" / ")}
            {parsed.length > 3 && " …"}
          </span>
        )}
      </div>

      {message && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p>
      )}

      <p className="text-xs text-slate-500">
        학생은 이 사이트에 로그인하지 않습니다. 이름과 번호만 저장하고,
        주민번호 · 주소 · 연락처는 저장하지 마세요.
      </p>
    </div>
  );
}
