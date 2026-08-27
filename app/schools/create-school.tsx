"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SchoolKind } from "@/lib/types";

const KINDS: Array<{ value: SchoolKind; label: string }> = [
  { value: "elementary", label: "초등학교" },
  { value: "middle", label: "중학교" },
  { value: "high", label: "고등학교" },
];

export default function CreateSchool() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SchoolKind>("middle");
  const [domains, setDomains] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_school", {
      p_name: name,
      p_kind: kind,
      p_domains: domains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
    });

    if (error) {
      setError("학교 생성에 실패했습니다. " + error.message);
      setBusy(false);
      return;
    }

    router.push(`/schools/${data}/admin`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-400"
      >
        + 새 학교 만들기
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <h2 className="font-semibold">새 학교 만들기</h2>

      <div>
        <label className="mb-1 block text-sm font-medium">학교 이름</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          placeholder="○○중학교"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">학교급</label>
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={`flex-1 rounded-lg border py-2 text-sm ${
                kind === k.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          허용 이메일 도메인 <span className="text-slate-400">(선택)</span>
        </label>
        <input
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          placeholder="sen.go.kr"
        />
        <p className="mt-1 text-xs text-slate-500">
          지정하면 이 도메인 계정만 초대를 수락할 수 있습니다. 쉼표로 구분.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? "생성 중…" : "만들기"}
        </button>
      </div>
    </form>
  );
}
