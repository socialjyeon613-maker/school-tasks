/** supabase/*.sql 의 테이블·뷰와 1:1로 맞춘 타입 */

export type SchoolKind = "elementary" | "middle" | "high";
export type MemberRole =
  | "principal"
  | "vice_principal"
  | "teacher"
  | "staff"
  | "admin";
export type StaffRoleKind =
  | "head"
  | "homeroom"
  | "co_homeroom"
  | "member"
  | "subject";
export type EventType = "academic" | "task";
export type EventStatus = "planned" | "ongoing" | "done" | "canceled";
export type CategoryLane = "grid" | "side";
export type ParticipationStatus = "pending" | "attended" | "absent";
export type AssignmentStatus = "pending" | "in_progress" | "done" | "rejected";

export interface School {
  id: string;
  name: string;
  kind: SchoolKind;
  allowed_domains: string[] | null;
}

export interface AcademicYear {
  id: string;
  school_id: string;
  year: number;
  name: string;
  is_current: boolean;
}

export interface Grade {
  id: string;
  grade_no: number;
  name: string;
}

export interface Classroom {
  id: string;
  grade_id: string;
  class_no: number;
  name: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface Period {
  id: string;
  no: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  lane: CategoryLane;
  position: number;
}

export interface SchoolEvent {
  id: string;
  school_id: string;
  academic_year_id: string;
  category_id: string | null;
  title: string;
  description: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  all_day: boolean;
  period_from: number | null;
  period_to: number | null;
  start_time: string | null;
  location: string;
  note: string;
  status: EventStatus;
  requires_participation: boolean;
  due_at: string | null;
  owner_id: string | null;
  created_by: string | null;
}

/** v_events_by_date — 기간 일정이 날짜별로 펼쳐진 형태 */
export interface EventOnDate {
  event_id: string;
  on_date: string;
  title: string;
  event_type: EventType;
  all_day: boolean;
  period_from: number | null;
  period_to: number | null;
  start_time: string | null;
  location: string;
  status: EventStatus;
  requires_participation: boolean;
  category_name: string | null;
  category_color: string | null;
  category_lane: CategoryLane | null;
}

export interface Student {
  id: string;
  classroom_id: string;
  number: number;
  name: string;
  gender: "M" | "F" | null;
  status: "enrolled" | "left";
  note: string;
}

export interface Participation {
  event_id: string;
  student_id: string;
  classroom_id: string;
  status: ParticipationStatus;
  reason: string;
}

/** v_participation_by_classroom */
export interface ClassroomParticipation {
  event_id: string;
  classroom_id: string;
  classroom_name: string;
  grade_id: string;
  total: number;
  attended: number;
  absent: number;
  pending: number;
  is_complete: boolean;
}

/** v_participation_summary */
export interface ParticipationSummary {
  event_id: string;
  title: string;
  start_date: string;
  total: number;
  attended: number;
  absent: number;
  pending: number;
  classroom_count: number;
  classroom_done: number;
  pending_classrooms: string;
}

/** v_absentees */
export interface Absentees {
  event_id: string;
  classroom_id: string;
  classroom_name: string;
  absent_count: number;
  names: string;
}

/** 화면에서 쓰는 현재 사용자의 학교 내 위치 */
export interface SchoolContext {
  school: School;
  year: AcademicYear;
  /** 로그인한 교직원의 id */
  userId: string;
  role: MemberRole;
  /** 담임·부담임인 반 */
  homeroomClassroomIds: string[];
  /** 부장인 학년 */
  headGradeIds: string[];
  /** 부장 또는 관리자 — 일정을 등록할 수 있는가 */
  canCreateEvent: boolean;
  isAdmin: boolean;
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  principal: "교장",
  vice_principal: "교감",
  teacher: "교사",
  staff: "행정",
  admin: "관리자",
};

/** v_assignment_progress */
export interface AssignmentProgress {
  event_id: string;
  title: string;
  due_at: string | null;
  assigned: number;
  done: number;
  remaining: number;
}

export interface Assignment {
  event_id: string;
  user_id: string;
  status: AssignmentStatus;
  due_at: string | null;
  submitted_at: string | null;
  note: string;
}

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  pending: "미확인",
  in_progress: "진행중",
  done: "완료",
  rejected: "반려",
};

export const ASSIGNMENT_STYLE: Record<AssignmentStatus, string> = {
  pending: "bg-white text-slate-500 border-slate-300",
  in_progress: "bg-sky-100 text-sky-800 border-sky-300",
  done: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-rose-100 text-rose-800 border-rose-300",
};

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  pending: "미입력",
  attended: "참여",
  absent: "불참",
};

/** 분류 색상 — Tailwind 클래스를 정적 문자열로 매핑 (동적 클래스는 빌드에서 제거됨) */
export const CATEGORY_STYLE: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-900 border-emerald-300",
  sky: "bg-sky-100 text-sky-900 border-sky-300",
  violet: "bg-violet-100 text-violet-900 border-violet-300",
  amber: "bg-amber-100 text-amber-900 border-amber-300",
  orange: "bg-orange-100 text-orange-900 border-orange-300",
  rose: "bg-rose-100 text-rose-900 border-rose-300",
  slate: "bg-slate-100 text-slate-900 border-slate-300",
};

export function categoryStyle(color: string | null | undefined) {
  return CATEGORY_STYLE[color ?? "slate"] ?? CATEGORY_STYLE.slate;
}
