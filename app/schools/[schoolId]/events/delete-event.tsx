"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 일정 삭제 — 상세 화면과 편집 화면이 함께 씁니다.
 *
 * 지우지 않고 휴지통으로 보냅니다. 댓글 · 첨부 · 참여기록 · 진행 명단이
 * 그대로 남아 있어, 관리 화면의 휴지통에서 되돌리면 원래대로 돌아옵니다.
 */
export default function DeleteEvent({
  schoolId,
  eventId,
  title,
  participationCount = 0,
  rosterCount = 0,
  /** 상세 화면은 편집 옆의 단추, 편집 화면은 맨 아래 흐린 글씨 */
  variant = "button",
}: {
  schoolId: string;
  eventId: string;
  title: string;
  participationCount?: number;
  rosterCount?: number;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().rpc("soft_delete_event", {
        p_event: eventId,
      });
      if (error) {
        // 권한만 문제인 게 아닙니다. 이유를 감추면 고칠 수가 없습니다.
        setError(
          error.message.includes("FORBIDDEN")
            ? "이 일정을 삭제할 권한이 없습니다. 만든 사람 · 담당자 · 부장 · 관리자만 지울 수 있습니다."
            : `삭제하지 못했습니다. ${error.message}`
        );
        return;
      }
      router.push(`/schools/${schoolId}/calendar`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 지우는 일은 되돌리기 번거로우니 Esc 로 빠져나갈 길을 둡니다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const keeps = [
    "댓글 · 첨부파일",
    participationCount > 0 ? `참여기록 ${participationCount}건` : "",
    rosterCount > 0 ? `진행 명단 ${rosterCount}명` : "",
  ].filter(Boolean);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "button"
            ? "no-print rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-rose-300 hover:text-rose-700"
            : "text-sm text-slate-500 hover:text-rose-600"
        }
      >
        삭제
      </button>

      {/* 제목 줄 안에서 펼치면 옆 단추가 밀립니다. 화면 가운데에 띄웁니다. */}
      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-rose-300 bg-white p-5 shadow-xl"
          >
            <p className="mb-2 text-base font-bold text-rose-900">
              “{title}” 을 삭제할까요?
            </p>
            <p className="mb-4 text-sm text-slate-700">
              목록에서 사라집니다. {keeps.join(" · ")} 은 그대로 남아 있어, 관리
              화면의 <b>휴지통</b>에서 되돌릴 수 있습니다.
            </p>
            {error && (
              <p className="mb-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-900">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                autoFocus
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "삭제 중…" : "삭제합니다"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
