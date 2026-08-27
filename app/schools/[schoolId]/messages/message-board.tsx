"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, teacherColor } from "@/lib/format";

export interface Conversation {
  other_id: string;
  other_name: string;
  last_body: string;
  last_at: string;
  last_mine: boolean;
  unread: number;
}

export interface Note {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface Member {
  user_id: string;
  name: string;
  duty: string;
}

export default function MessageBoard({
  schoolId,
  meId,
  conversations,
  members,
  withId,
  thread,
}: {
  schoolId: string;
  meId: string;
  conversations: Conversation[];
  members: Member[];
  withId: string;
  thread: Note[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const other =
    conversations.find((c) => c.other_id === withId) ??
    (withId
      ? {
          other_id: withId,
          other_name: members.find((m) => m.user_id === withId)?.name ?? "—",
        }
      : null);

  // 새 쪽지가 오면 맨 아래로
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, withId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !withId) return;

    setBusy(true);
    setError("");

    const { error } = await createClient().from("messages").insert({
      school_id: schoolId,
      sender_id: meId,
      recipient_id: withId,
      body,
    });

    setBusy(false);
    if (error) {
      setError("보내지 못했습니다. " + error.message);
      return;
    }
    setText("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* 대화 목록 */}
      <aside className="w-full shrink-0 lg:w-64">
        <button
          onClick={() => setPicking((v) => !v)}
          className="mb-2 w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white"
        >
          {picking ? "닫기" : "+ 새 쪽지"}
        </button>

        {picking && (
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
            {members.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-slate-400">
                다른 교직원이 없습니다.
              </li>
            )}
            {members.map((m) => (
              <li key={m.user_id}>
                <Link
                  href={`?with=${m.user_id}`}
                  onClick={() => setPicking(false)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${teacherColor(m.user_id).dot}`}
                  />
                  <span className="font-medium">{m.name}</span>
                  {m.duty && (
                    <span className="truncate text-xs text-slate-400">{m.duty}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {conversations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
            주고받은 쪽지가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.other_id}>
                <Link
                  href={`?with=${c.other_id}`}
                  className={`block rounded-lg border px-3 py-2 transition ${
                    c.other_id === withId
                      ? "border-slate-900 bg-white"
                      : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${teacherColor(c.other_id).dot}`}
                    />
                    <span className="flex-1 truncate text-sm font-medium">
                      {c.other_name}
                    </span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.last_mine && <span className="text-slate-400">나: </span>}
                    {c.last_body}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatDateTime(c.last_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* 대화 내용 */}
      <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white">
        {!other ? (
          <p className="px-4 py-16 text-center text-sm text-slate-400">
            왼쪽에서 대화를 고르거나 <b>새 쪽지</b>로 시작하세요.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span
                className={`h-3 w-3 rounded-full ${teacherColor(other.other_id).dot}`}
              />
              <span className="font-semibold">{other.other_name}</span>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto px-4 py-4">
              {thread.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  첫 쪽지를 보내보세요.
                </p>
              )}
              {thread.map((n) => {
                const mine = n.sender_id === meId;
                return (
                  <div
                    key={n.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div className="max-w-[75%]">
                      <div
                        className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "bg-slate-900 text-white"
                            : "bg-slate-100 text-slate-900"
                        }`}
                      >
                        {n.body}
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] text-slate-400 ${
                          mine ? "text-right" : ""
                        }`}
                      >
                        {formatDateTime(n.created_at)}
                        {mine && n.read_at && " · 읽음"}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={send}
              className="flex gap-2 border-t border-slate-200 px-4 py-3"
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="쪽지를 입력하세요"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              <button
                disabled={busy || !text.trim()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                보내기
              </button>
            </form>

            {error && (
              <p className="px-4 pb-3 text-sm text-rose-700">{error}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
