import type { SchoolContext, SchoolEvent } from "@/lib/types";

/**
 * 이 일정을 수정 · 삭제할 수 있는가.
 *
 * DB의 can_edit_event() 와 같은 규칙을 화면용으로 옮긴 것입니다.
 * 최종 판정은 언제나 DB가 하고, 이 함수는 **할 수 없는 일을 보여주지 않기**
 * 위한 것입니다. 두 곳이 어긋나면 버튼을 눌렀을 때 FORBIDDEN 만 나옵니다.
 *
 *   can_edit_event():  작성자 · 담당자 · 부장 · 관리자
 *   + 공지는 update_event() 가 can_post_notice() 도 요구합니다.
 */
export function canEditEvent(
  ctx: Pick<SchoolContext, "userId" | "isAdmin" | "isHead" | "canPostNotice">,
  ev: Pick<SchoolEvent, "event_type" | "created_by" | "owner_id">
) {
  const base =
    ev.created_by === ctx.userId ||
    ev.owner_id === ctx.userId ||
    ctx.isAdmin ||
    ctx.isHead;

  if (ev.event_type === "notice") return base && ctx.canPostNotice;
  return base;
}
