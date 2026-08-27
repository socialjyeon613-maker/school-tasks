"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile: { name: string } | null;
}

export default function Comments({
  eventId,
  meId,
}: {
  eventId: string;
  meId: string;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("event_comments")
      .select("id, user_id, content, created_at, profile:profiles(name)")
      .eq("event_id", eventId)
      .order("created_at");
    setRows((data ?? []) as unknown as Comment[]);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);

    const supabase = createClient();
    await supabase
      .from("event_comments")
      .insert({ event_id: eventId, user_id: meId, content: text.trim() });

    setText("");
    setBusy(false);
    load();
  }

  async function remove(id: string) {
    await createClient().from("event_comments").delete().eq("id", id);
    load();
  }

  return (
    <section className="no-print mt-4 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 font-semibold">댓글 {rows.length > 0 && rows.length}</h2>

      <ul className="mb-4 space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{c.profile?.name ?? "—"}</span>
              <span className="text-xs text-slate-400">
                {new Date(c.created_at).toLocaleString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {c.user_id === meId && (
                <button
                  onClick={() => remove(c.id)}
                  className="text-xs text-slate-400 hover:text-rose-600"
                >
                  삭제
                </button>
              )}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{c.content}</p>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-slate-400">아직 댓글이 없습니다.</li>
        )}
      </ul>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="댓글 남기기"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          disabled={busy || !text.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          등록
        </button>
      </form>
    </section>
  );
}
