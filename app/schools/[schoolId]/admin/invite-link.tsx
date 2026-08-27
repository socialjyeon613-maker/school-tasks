"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function InviteLink({
  schoolId,
  yearId,
}: {
  schoolId: string;
  yearId: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("로그인이 필요합니다.");
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("invites")
      .insert({
        school_id: schoolId,
        academic_year_id: yearId,
        created_by: auth.user.id,
        role: "teacher",
      })
      .select("token")
      .single();

    setBusy(false);
    if (error) {
      setError("초대 링크 생성에 실패했습니다.");
      return;
    }
    setUrl(`${window.location.origin}/invite/${data.token}`);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={create}
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "생성 중…" : "초대 링크 만들기"}
      </button>

      {url && (
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => navigator.clipboard.writeText(url)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            복사
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
