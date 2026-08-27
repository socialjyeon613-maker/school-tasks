"use client";

import { useState } from "react";
import {
  BOOL_CELL,
  EVENT_COLUMNS,
  TYPE_TO_LABEL,
  encodeClassNos,
  type EventRow,
} from "@/lib/excel-schema";

export default function ExportEvents({
  rows,
  fileName,
}: {
  rows: EventRow[];
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);

    // exceljs 는 이 화면에서만 쓰므로 눌렀을 때 불러옵니다.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("일정");

    ws.columns = EVENT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of rows) {
      ws.addRow({
        type: TYPE_TO_LABEL[r.type] ?? r.type,
        category: r.category,
        title: r.title,
        start_date: r.start_date,
        end_date: r.end_date === r.start_date ? "" : r.end_date,
        all_day: BOOL_CELL(r.all_day),
        period_from: r.period_from ?? "",
        period_to: r.period_to ?? "",
        start_time: r.start_time,
        location: r.location,
        grade_no: r.grade_no ?? "",
        class_nos: encodeClassNos(r.class_nos),
        requires_participation: BOOL_CELL(r.requires_participation),
        daily_participation: BOOL_CELL(r.daily_participation),
        due_at: r.due_at,
        assignee_emails: r.assignee_emails.join(", "),
        description: r.description,
      });
    }

    // 날짜 열은 문자열로 두어야 다시 읽을 때 어긋나지 않습니다.
    ws.getColumn("start_date").alignment = { horizontal: "left" };
    ws.getColumn("end_date").alignment = { horizontal: "left" };

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={download}
        disabled={busy || rows.length === 0}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "만드는 중…" : "엑셀로 내려받기"}
      </button>
      {rows.length === 0 && (
        <span className="text-sm text-slate-500">내보낼 일정이 없습니다.</span>
      )}
    </div>
  );
}
