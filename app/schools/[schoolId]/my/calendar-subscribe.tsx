"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 폰 기본 캘린더에 학사일정을 띄우는 구독 주소.
 * 주소 자체가 열쇠라 남에게 주면 그 사람도 봅니다 — 그래서 재발급을 둡니다.
 */
export default function CalendarSubscribe({ schoolId }: { schoolId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function issue(reset = false) {
    setBusy(true);
    setError("");
    setCopied(false);

    const { data, error } = await createClient().rpc("my_calendar_token", {
      p_school: schoolId,
      p_reset: reset,
    });

    setBusy(false);
    if (error || !data) {
      setError("주소를 만들지 못했습니다.");
      return;
    }
    setUrl(`${window.location.origin}/ical/${data}`);
  }

  return (
    <section className="no-print mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold">폰 캘린더에 띄우기</h2>
      <p className="mb-3 text-xs text-slate-500">
        아래 주소를 폰 캘린더 앱에 &lsquo;구독&rsquo;으로 등록하면 학사일정이 자동으로
        보입니다. 내게 걸린 일정에는 1시간 전 알림이 붙습니다.
      </p>

      {!url ? (
        <button
          onClick={() => issue(false)}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "구독 주소 만들기"}
        </button>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(url);
                setCopied(true);
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            이 주소를 아는 사람은 누구나 학사일정을 볼 수 있습니다 (학생 정보는
            들어 있지 않습니다). 유출됐다면{" "}
            <button
              onClick={() => issue(true)}
              className="underline hover:text-slate-900"
            >
              재발급
            </button>
            하세요 — 이전 주소는 즉시 끊깁니다.
          </p>
        </>
      )}

      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
