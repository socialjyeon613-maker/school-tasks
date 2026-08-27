/**
 * 활성 보직을 쿠키에 기억합니다.
 *
 * 이 값은 **화면 기본값**일 뿐 권한이 아닙니다.
 * 사용자가 쿠키를 임의로 바꿔도 볼 수 있는 데이터는 달라지지 않습니다 —
 * 실제 판정은 전부 DB의 RLS 가 합니다. 그래서 httpOnly 가 아니어도 됩니다.
 */
import { ACTIVE_ROLE_COOKIE } from "@/lib/types";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function setActiveRole(schoolId: string, roleId: string) {
  document.cookie = `${ACTIVE_ROLE_COOKIE(schoolId)}=${roleId}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
