"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";

export interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

const ICON: Record<string, string> = {
  message: "✉",
  assigned: "📋",
  comment: "💬",
  notice: "📢",
  due_soon: "⏰",
  participation_pending: "✅",
};

const TONE: Record<string, string> = {
  due_soon: "text-rose-700",
  participation_pending: "text-amber-700",
};

export default function NotificationList({
  schoolId,
  notifications,
}: {
  schoolId: string;
  notifications: Notice[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const unread = notifications.filter((n) => !n.read_at).length;

  /** 알림을 누르면 읽음 처리하고 그 화면으로 갑니다. */
  async function open(n: Notice) {
    const supabase = createClient();
    if (!n.read_at) {
      await supabase.rpc("mark_notifications_read", {
        p_school: schoolId,
        p_id: n.id,
      });
    }
    router.push(n.link || `/schools/${schoolId}/calendar`);
  }

  async function readAll() {
    setBusy(true);
    await createClient().rpc("mark_notifications_read", {
      p_school: schoolId,
      p_id: null,
    });
    setBusy(false);
    startTransition(() => router.refresh());
  }

  if (notifications.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-400">
        알림이 없습니다.
      </p>
    );
  }

  return (
    <>
      {unread > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-slate-500">안 읽음 {unread}건</span>
          <button
            onClick={readAll}
            disabled={busy}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
          >
            모두 읽음
          </button>
        </div>
      )}

      <ul className="space-y-1.5">
        {notifications.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => open(n)}
              className={`flex w-full gap-3 rounded-xl border px-4 py-3 text-left transition hover:border-slate-400 ${
                n.read_at
                  ? "border-slate-200 bg-white opacity-60"
                  : "border-slate-300 bg-white"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {ICON[n.kind] ?? "🔔"}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium ${TONE[n.kind] ?? ""}`}
                >
                  {n.title}
                </span>
                {n.body && (
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {n.body}
                  </span>
                )}
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {formatDateTime(n.created_at)}
                </span>
              </span>
              {!n.read_at && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
