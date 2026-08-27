"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERROR_MESSAGE: Record<string, string> = {
  INVITE_EXPIRED: "만료된 초대입니다.",
  INVITE_EXHAUSTED: "사용 횟수를 모두 소진한 초대입니다.",
  DOMAIN_NOT_ALLOWED: "이 학교가 허용한 이메일 도메인이 아닙니다.",
};

export default function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { data, error } = await supabase.rpc("accept_invite", {
      p_token: token,
    });

    if (error) {
      const key = Object.keys(ERROR_MESSAGE).find((k) =>
        error.message.includes(k)
      );
      setError(key ? ERROR_MESSAGE[key] : "합류에 실패했습니다.");
      setBusy(false);
      return;
    }

    router.push(`/schools/${data}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        onClick={accept}
        disabled={busy}
        className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {busy ? "합류 중…" : "합류하기"}
      </button>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
