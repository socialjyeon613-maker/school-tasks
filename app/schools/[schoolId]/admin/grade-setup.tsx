"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GradeSetup({ yearId }: { yearId: string }) {
  const router = useRouter();
  const [gradeNo, setGradeNo] = useState(3);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { error } = await createClient().rpc("create_classrooms", {
      p_year_id: yearId,
      p_grade_no: gradeNo,
      p_class_count: count,
    });

    setBusy(false);
    if (error) {
      setError("생성에 실패했습니다. " + error.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block font-medium">학년</span>
        <input
          type="number"
          min={1}
          max={6}
          value={gradeNo}
          onChange={(e) => setGradeNo(Number(e.target.value))}
          className="w-20 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">반 수</span>
        <input
          type="number"
          min={1}
          max={30}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-20 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>
      <button
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "생성 중…" : `${gradeNo}학년 1~${count}반 만들기`}
      </button>
      {error && <p className="w-full text-sm text-rose-700">{error}</p>}
    </form>
  );
}
