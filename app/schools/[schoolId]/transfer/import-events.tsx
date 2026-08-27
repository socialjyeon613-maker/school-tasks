"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import {
  EVENT_COLUMNS,
  LABEL_TO_TYPE,
  TYPE_TO_LABEL,
  decodeClassNos,
  shiftDate,
  toBool,
  toDateString,
  type EventRow,
  type ShiftMode,
} from "@/lib/excel-schema";

interface Result {
  created: number;
  total: number;
  errors: Array<{ row: number; title?: string; message: string }>;
  warnings: Array<{ row: number; title?: string; message: string }>;
}

export default function ImportEvents({
  schoolId,
  yearId,
  yearLabel,
  sourceYear,
  targetYear,
}: {
  schoolId: string;
  yearId: string;
  yearLabel: string;
  sourceYear: number;
  targetYear: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [shift, setShift] = useState<ShiftMode>(
    targetYear > sourceYear ? "sameWeekday" : "none"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const years = targetYear - sourceYear;

  async function read(file: File) {
    setError("");
    setResult(null);
    setBusy(true);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());

      const ws = wb.worksheets[0];
      if (!ws) throw new Error("시트를 찾을 수 없습니다.");

      // 1행이 머리글. 열 순서가 바뀌어도 머리글 이름으로 찾습니다.
      const header: Record<string, number> = {};
      ws.getRow(1).eachCell((cell, col) => {
        header[String(cell.value ?? "").trim()] = col;
      });

      const missing = ["제목", "시작일"].filter((h) => !header[h]);
      if (missing.length)
        throw new Error(`머리글에 ${missing.join(", ")} 열이 없습니다.`);

      const get = (row: number, key: string) => {
        const col = header[EVENT_COLUMNS.find((c) => c.key === key)!.header];
        if (!col) return "";
        const v = ws.getRow(row).getCell(col).value;
        // 하이퍼링크/수식 셀은 객체로 옵니다.
        if (v && typeof v === "object" && "text" in v) return String(v.text);
        if (v && typeof v === "object" && "result" in v)
          return String((v as { result: unknown }).result ?? "");
        return v ?? "";
      };

      const parsed: EventRow[] = [];
      for (let i = 2; i <= ws.rowCount; i++) {
        const title = String(get(i, "title") ?? "").trim();
        if (!title) continue;

        const start = toDateString(get(i, "start_date"));
        const end = toDateString(get(i, "end_date")) || start;

        parsed.push({
          type: LABEL_TO_TYPE[String(get(i, "type") ?? "").trim()] ?? "academic",
          category: String(get(i, "category") ?? "").trim(),
          title,
          start_date: start,
          end_date: end,
          all_day: toBool(get(i, "all_day")),
          period_from: Number(get(i, "period_from")) || null,
          period_to: Number(get(i, "period_to")) || null,
          start_time: String(get(i, "start_time") ?? "").trim().slice(0, 5),
          location: String(get(i, "location") ?? "").trim(),
          grade_no: Number(get(i, "grade_no")) || null,
          class_nos: decodeClassNos(String(get(i, "class_nos") ?? "")),
          requires_participation: toBool(get(i, "requires_participation")),
          daily_participation: toBool(get(i, "daily_participation")),
          due_at: String(get(i, "due_at") ?? "").trim(),
          assignee_emails: String(get(i, "assignee_emails") ?? "")
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          description: String(get(i, "description") ?? "").trim(),
        });
      }

      if (parsed.length === 0) throw new Error("읽을 수 있는 줄이 없습니다.");

      setRows(parsed);
      setFileName(file.name);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const shifted = (r: EventRow) => ({
    ...r,
    start_date: shiftDate(r.start_date, shift, years),
    end_date: shiftDate(r.end_date, shift, years),
  });

  async function commit() {
    if (!rows) return;
    setBusy(true);
    setError("");

    const { data, error } = await createClient().rpc("import_events", {
      p_year_id: yearId,
      p_rows: rows.map(shifted),
    });

    setBusy(false);
    if (error) {
      setError("가져오기에 실패했습니다. " + error.message);
      return;
    }

    setResult(data as Result);
    setRows(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const preview = rows?.slice(0, 5).map(shifted) ?? [];
  const badDates = rows?.filter((r) => !r.start_date).length ?? 0;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
      />

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {rows && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm">
            <b>{fileName}</b> — {rows.length}건을 읽었습니다.
            {badDates > 0 && (
              <span className="ml-1 text-rose-700">
                (시작일이 없는 {badDates}건은 건너뜁니다)
              </span>
            )}
          </p>

          {years !== 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-sm font-medium">
                날짜를 {years > 0 ? `${years}년 뒤로` : `${-years}년 앞으로`} 옮기기
              </p>
              <div className="space-y-1.5">
                {(
                  [
                    ["sameWeekday", "같은 요일로 (364일 이동)", "매주 월요일 회의처럼 요일이 중요한 일정에 맞습니다"],
                    ["sameDate", "같은 날짜로", "3월 2일 개학처럼 날짜가 정해진 일정에 맞습니다"],
                    ["none", "옮기지 않음", "엑셀에서 날짜를 이미 고쳤을 때"],
                  ] as Array<[ShiftMode, string, string]>
                ).map(([v, label, hint]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setShift(v)}
                    className={`block w-full rounded-lg border px-3 py-2 text-left ${
                      shift === v ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {shift === v ? "● " : "○ "}
                      {label}
                    </span>
                    <span className="block pl-4 text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mb-1 text-xs font-medium text-slate-500">
            미리보기 (앞 5건)
          </p>
          <ul className="mb-3 space-y-0.5 text-xs">
            {preview.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-24 shrink-0 text-slate-500">
                  {r.start_date ? formatDate(r.start_date) : "날짜 없음"}
                </span>
                <span className="truncate">
                  [{TYPE_TO_LABEL[r.type]}] {r.title}
                  {r.grade_no && (
                    <span className="text-slate-400">
                      {" "}
                      · {r.grade_no}학년
                      {r.class_nos.length > 0 && ` ${r.class_nos.join(",")}반`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setRows(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              취소
            </button>
            <button
              onClick={commit}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "넣는 중…" : `${yearLabel}에 ${rows.length}건 넣기`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm">
          <p className="font-medium">
            {result.total}건 중 <b className="text-emerald-700">{result.created}건</b>{" "}
            등록했습니다.
          </p>

          {result.warnings?.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                확인 필요 {result.warnings.length}건
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-600">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    {w.row}행 {w.title && `"${w.title}"`} — {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {result.errors?.length > 0 && (
            <details className="mt-2" open>
              <summary className="cursor-pointer text-rose-700">
                실패 {result.errors.length}건
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-rose-700">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.row}행 {e.title && `"${e.title}"`} — {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
