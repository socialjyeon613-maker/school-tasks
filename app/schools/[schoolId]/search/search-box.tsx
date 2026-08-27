"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBox({
  schoolId,
  initial,
}: {
  schoolId: string;
  initial: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          `/schools/${schoolId}/search?q=${encodeURIComponent(q.trim())}`
        );
      }}
      className="flex gap-2"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="일정 · 첨부파일 · 학생 이름"
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
      />
      <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
        찾기
      </button>
    </form>
  );
}
