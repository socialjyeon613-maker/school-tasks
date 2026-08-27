import type { EventOnDate } from "@/lib/types";
import { toISODate } from "@/lib/format";

/** 그 주의 월요일 (한국 학교는 월요일 시작) */
export function weekStart(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const back = (d.getDay() + 6) % 7; // 일요일=6, 월요일=0
  d.setDate(d.getDate() - back);
  return toISODate(d);
}

export function shiftDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 월~일 7일 */
export function weekDates(startIso: string) {
  return Array.from({ length: 7 }, (_, i) => shiftDays(startIso, i));
}

/**
 * 교시를 차지하는 한 덩어리.
 * 겹치는 것들은 한 칸에 모아 쌓습니다 — 안 그러면 표가 어긋납니다.
 */
export interface Cluster {
  from: number;
  to: number;
  events: EventOnDate[];
}

/**
 * 하루치 일정을 교시 범위가 겹치는 것끼리 묶습니다.
 *
 * 같은 날 3~4교시와 4~5교시가 있으면 한 칸(3~5교시)에 둘 다 넣습니다.
 * 칸을 나눠 그리면 표의 행 높이가 어긋나므로 묶는 편이 안전합니다.
 */
export function clusterByPeriod(events: EventOnDate[], maxPeriod: number): Cluster[] {
  const blocks = events
    .filter((e) => !e.all_day)
    .map((e) => ({
      from: e.period_from ?? 1,
      to: e.period_to ?? e.period_from ?? 1,
      event: e,
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to);

  const out: Cluster[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && b.from <= last.to) {
      last.to = Math.max(last.to, Math.min(b.to, maxPeriod));
      last.events.push(b.event);
    } else {
      out.push({
        from: b.from,
        to: Math.min(b.to, maxPeriod),
        events: [b.event],
      });
    }
  }
  return out;
}

/**
 * 교시별로 "이 칸에서 시작하는 덩어리 / 위 칸에 덮여 있음 / 빈 칸" 중 무엇인지.
 * 표를 그릴 때 rowSpan 을 정하는 데 씁니다.
 */
export type Slot =
  | { kind: "start"; cluster: Cluster; span: number }
  | { kind: "covered" }
  | { kind: "empty" };

export function slotsFor(clusters: Cluster[], maxPeriod: number): Slot[] {
  const slots: Slot[] = Array.from({ length: maxPeriod }, () => ({ kind: "empty" }));
  for (const c of clusters) {
    const from = Math.max(1, c.from);
    const to = Math.min(maxPeriod, c.to);
    if (from > maxPeriod) continue;
    slots[from - 1] = { kind: "start", cluster: c, span: to - from + 1 };
    for (let p = from + 1; p <= to; p++) slots[p - 1] = { kind: "covered" };
  }
  return slots;
}

/* ------------------------------------------------------------------
   간트 — 기간 일정을 가로 막대로
------------------------------------------------------------------ */

export interface Bar {
  /** 0~1, 기간 안에서 시작 위치 */
  left: number;
  /** 0~1, 차지하는 길이 */
  width: number;
  /** 기간 밖으로 이어지는지 (화살표 표시용) */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** 일정의 시작~끝을 [from, to] 구간 안의 비율로 바꿉니다 */
export function barFor(
  start: string,
  end: string,
  from: string,
  to: string
): Bar | null {
  const day = 86400000;
  const f = new Date(from + "T00:00:00").getTime();
  const t = new Date(to + "T00:00:00").getTime() + day; // 마지막 날 포함
  const s = new Date(start + "T00:00:00").getTime();
  const e = new Date(end + "T00:00:00").getTime() + day;

  if (e <= f || s >= t) return null; // 기간과 안 겹침

  const total = t - f;
  const cs = Math.max(s, f);
  const ce = Math.min(e, t);

  return {
    left: (cs - f) / total,
    width: (ce - cs) / total,
    clippedStart: s < f,
    clippedEnd: e > t,
  };
}
