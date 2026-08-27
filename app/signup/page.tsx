"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });

    if (error) {
      setError(
        error.message.includes("already")
          ? "이미 가입된 이메일입니다."
          : "가입에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
      setBusy(false);
      return;
    }

    const next = params.get("next");
    router.push(next?.startsWith("/") ? next : "/schools");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">이름</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          placeholder="김선생"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">이메일</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          placeholder="teacher@sen.go.kr"
        />
        <p className="mt-1 text-xs text-slate-500">
          학교에 합류하려면 초대 링크가 필요합니다.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">비밀번호</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {busy ? "가입 중…" : "가입하기"}
      </button>

      <p className="text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-slate-900 underline">
          로그인
        </Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-bold">가입</h1>
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  );
}
