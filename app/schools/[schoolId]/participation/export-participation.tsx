"use client";

import { useState } from "react";

export interface Checkpoint {
  eventId: string;
  title: string;
  onDate: string;
}

export interface ClassSheet {
  classroomId: string;
  classroomName: string;
  students: Array<{
    studentId: string;
    number: number;
    name: string;
    /** checkpoints 와 같은 순서 */
    marks: Array<{ status: string; reason: string }>;
  }>;
}

/** '2026-12-10' → '12/10' */
const short = (iso: string) => iso.slice(5).replace("-", "/");

/**
 * 지금 쓰시는 구글시트와 같은 모양으로 뽑습니다.
 *   반별 탭 : 연번 · 이름 · 체크 지점마다 1(참여) / 0(불참) / 빈칸(미입력)
 *   총원    : 체크 지점별 참여 · 불참 · 미입력 합계
 *   불참    : 반 × 체크 지점별 불참자 이름
 */
export default function ExportParticipation({
  checkpoints,
  sheets,
  fileName,
}: {
  checkpoints: Checkpoint[];
  sheets: ClassSheet[];
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const headers = checkpoints.map((c) => `${short(c.onDate)} ${c.title}`);

    const bold = (row: import("exceljs").Row) => {
      row.font = { bold: true };
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
    };

    // ── 총원 ────────────────────────────────────────────────
    const total = wb.addWorksheet("총원");
    total.columns = [
      { header: "구분", key: "k", width: 10 },
      ...checkpoints.map((_, i) => ({ header: "", key: `c${i}`, width: 18 })),
    ];
    total.getRow(1).values = ["구분", ...headers];
    bold(total.getRow(1));
    total.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

    const countBy = (pick: (s: string) => boolean) =>
      checkpoints.map((_, i) =>
        sheets.reduce(
          (n, sh) =>
            n +
            sh.students.filter(
              (st) => st.marks[i].status !== "n/a" && pick(st.marks[i].status)
            ).length,
          0
        )
      );

    total.addRow(["참여자", ...countBy((s) => s === "attended")]);
    total.addRow(["불참자", ...countBy((s) => s === "absent")]);
    total.addRow(["미입력", ...countBy((s) => s === "pending")]);
    total.addRow(["대상", ...checkpoints.map((_, i) =>
      sheets.reduce(
        (n, sh) => n + sh.students.filter((st) => st.marks[i].status !== "n/a").length,
        0
      )
    )]);

    // ── 불참 ────────────────────────────────────────────────
    const absent = wb.addWorksheet("불참");
    absent.columns = [
      { header: "반", key: "c", width: 10 },
      ...checkpoints.map((_, i) => ({ header: "", key: `a${i}`, width: 28 })),
    ];
    absent.getRow(1).values = ["반", ...headers];
    bold(absent.getRow(1));
    absent.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

    for (const sh of sheets) {
      absent.addRow([
        sh.classroomName,
        ...checkpoints.map((_, i) => {
          const names = sh.students
            .filter((st) => st.marks[i].status === "absent")
            .map((st) =>
              st.marks[i].reason ? `${st.name}(${st.marks[i].reason})` : st.name
            );
          return names.length ? names.join(", ") : "없음";
        }),
      ]);
    }

    // ── 반별 ────────────────────────────────────────────────
    for (const sh of sheets) {
      const ws = wb.addWorksheet(sh.classroomName);
      ws.columns = [
        { header: "연번", key: "no", width: 6 },
        { header: "이름", key: "name", width: 12 },
        ...checkpoints.map((_, i) => ({ header: "", key: `m${i}`, width: 18 })),
      ];

      // 1행: 반 이름 + 체크 지점별 참여자 수
      ws.getRow(1).values = [
        sh.classroomName,
        "참여자 수",
        ...checkpoints.map(
          (_, i) => sh.students.filter((st) => st.marks[i].status === "attended").length
        ),
      ];
      bold(ws.getRow(1));

      // 2행: 머리글
      ws.getRow(2).values = ["연번", "이름", ...headers];
      bold(ws.getRow(2));
      ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];

      for (const st of sh.students) {
        ws.addRow([
          st.number,
          st.name,
          ...st.marks.map((m) =>
            m.status === "attended"
              ? 1
              : m.status === "absent"
                ? 0
                : "" // 미입력과 '대상 아님'은 빈칸
          ),
        ]);
      }

      ws.getColumn("no").alignment = { horizontal: "center" };
      for (let i = 0; i < checkpoints.length; i++)
        ws.getColumn(`m${i}`).alignment = { horizontal: "center" };
    }

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
    <div className="space-y-2">
      <button
        onClick={download}
        disabled={busy || sheets.length === 0}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {busy ? "만드는 중…" : "엑셀로 내려받기"}
      </button>
      <p className="text-xs text-slate-500">
        탭 구성: 총원 · 불참 · 반별. 반별 탭은 1=참여, 0=불참, 빈칸=미입력입니다.
      </p>
    </div>
  );
}
