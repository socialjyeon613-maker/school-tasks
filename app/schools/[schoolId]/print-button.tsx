"use client";

/** 인쇄 — 자주 쓰지 않으니 조용한 글씨로 둡니다 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      인쇄
    </button>
  );
}
