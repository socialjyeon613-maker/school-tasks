import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "도움말",
  description:
    "학교 업무관리 시스템 사용법 — 담임 · 부장 · 관리자가 각각 무엇을 하면 되는지.",
};

/* ------------------------------------------------------------------
   도움말은 로그인 없이 볼 수 있습니다.
   선생님들께 링크만 보내 미리 읽어보게 할 수 있어야 하니까요.
------------------------------------------------------------------ */

const SECTIONS = [
  { id: "start", label: "시작하기" },
  { id: "calendar", label: "학사일정 보기" },
  { id: "views", label: "주간 · 간트" },
  { id: "add", label: "일정 등록" },
  { id: "participation", label: "학생 참여 체크" },
  { id: "roster", label: "진행 명단" },
  { id: "task", label: "업무와 담당자" },
  { id: "my", label: "내 할 일 · 알림" },
  { id: "talk", label: "쪽지 · 검색" },
  { id: "excel", label: "엑셀로 주고받기" },
  { id: "admin", label: "관리자용" },
  { id: "phone", label: "폰에서 쓰기" },
  { id: "privacy", label: "개인정보" },
];

function Shot({
  src,
  alt,
  caption,
  width = 1100,
  height = 650,
}: {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure className="my-4">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="w-full rounded-xl border border-slate-300 shadow-sm"
      />
      {caption && (
        <figcaption className="mt-1.5 text-xs text-slate-500">{caption}</figcaption>
      )}
    </figure>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-slate-200 pt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      {lead && <p className="mt-1 text-slate-600">{lead}</p>}
      <div className="mt-3 space-y-3 leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

/** 역할 뱃지 */
function Who({ children }: { children: string }) {
  return (
    <span className="mr-1 rounded bg-slate-900 px-2 py-0.5 align-middle text-xs font-medium text-white">
      {children}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </p>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Image src="/icons/icon-192.png" alt="" width={32} height={32} className="rounded-lg" />
          <div className="min-w-0">
            <p className="font-bold leading-tight">학교 업무관리 시스템</p>
            <p className="text-xs text-slate-500">도움말</p>
          </div>
          <Link
            href="/login"
            className="ml-auto shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            로그인
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">무엇을 하는 시스템인가요</h1>
        <p className="mt-2 leading-relaxed text-slate-700">
          지금 엑셀과 종이로 하시는 <b>학년 일정표</b>와 <b>반별 참여 명단</b>을
          한 곳에서 처리합니다. 부장님이 일정을 올리면 담임 선생님이 반별로
          참여를 체크하고, 집계와 미입력 반은 자동으로 나옵니다.
        </p>

        <nav className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-semibold">차례</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-600 hover:text-slate-900 hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-8 space-y-8">
          <Section
            id="start"
            title="시작하기"
            lead="초대 링크를 받아 가입하면 됩니다."
          >
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>관리자에게 받은 <b>초대 링크</b>를 엽니다.</li>
              <li>이름 · 이메일 · 비밀번호로 가입합니다.</li>
              <li>합류하면 바로 학사일정이 보입니다.</li>
            </ol>
            <p>
              부장이면서 담임처럼 <b>보직이 둘 이상</b>이면 처음 들어올 때 어느
              시점으로 볼지 한 번 고릅니다. 나중에 화면 위쪽에서 언제든 바꿀 수
              있고, <b>고른 것과 관계없이 할 수 있는 일은 같습니다</b> — 어느 반이
              먼저 열릴지 같은 기본값만 바뀝니다.
            </p>
          </Section>

          <Section
            id="calendar"
            title="학사일정 보기"
            lead="종이 일정표와 같은 모양입니다. 세로가 날짜, 가로가 교시."
          >
            <Shot
              src="/help/calendar.png"
              alt="학사일정 화면 — 날짜 × 교시 표와 왼쪽 공지 목록"
              caption="학년 단추로 학년을 바꾸고, 화살표로 달을 넘깁니다. 오른쪽 열은 교시와 무관한 전형·업무 일정입니다."
            />
            <ul className="list-disc space-y-1.5 pl-5">
              <li>색은 <b>분류</b>입니다 — 시험, 체험·관람, 진로, 특별활동, 휴업.</li>
              <li>일정 이름 옆 <b>(1~5반)</b>은 대상 반입니다.</li>
              <li><b>참여체크</b>가 붙은 일정은 담임이 참여 여부를 입력해야 합니다.</li>
              <li>왼쪽 <b>공지</b>는 게시 기간이 있는 알림글입니다. 기본 5개가 보이고 더 보기로 펼칩니다.</li>
              <li><b>인쇄</b> 단추를 누르면 표만 깔끔하게 출력됩니다.</li>
            </ul>
          </Section>

          <Section
            id="views"
            title="주간 · 간트로 보기"
            lead="같은 일정을 다른 방식으로 봅니다. 화면 위 월간 · 주간 · 간트로 오갑니다."
          >
            <Shot
              src="/help/week.png"
              alt="주간 보기 — 교시 × 요일 시간표"
              caption="세로가 교시, 가로가 요일. 늘 보시는 시간표와 같은 모양입니다. 여러 교시에 걸친 일정은 칸이 합쳐집니다."
              height={619}
            />
            <p>
              <b>주간</b>은 이번 주에 우리 학년이 무엇을 하는지 볼 때 씁니다.
              주말에 아무 일정이 없으면 토 · 일 칸은 아예 나오지 않습니다.
            </p>
            <Shot
              src="/help/timeline.png"
              alt="간트 보기 — 기간 일정을 가로 막대로"
              caption="공지 · 학사일정 · 업무로 묶여 나옵니다. 세로 붉은 선이 오늘입니다."
              height={619}
            />
            <p>
              <b>간트</b>는 <b>여러 날에 걸친 일정</b>이 서로 어떻게 겹치는지 볼 때
              씁니다. 원서접수 기간과 수련회가 겹치는지, 공지 게시 기간이 언제
              끝나는지 같은 것이 한눈에 보입니다. 달 밖으로 이어지는 일정은
              ◀ ▶ 로 표시됩니다.
            </p>
          </Section>

          <Section
            id="add"
            title="일정 등록"
            lead="선생님 누구나 등록할 수 있습니다. 고치고 지우는 것은 만든 사람 · 담당자 · 부장 · 관리자."
          >
            <Shot
              src="/help/event-new.png"
              alt="일정 등록 화면 — 유형, 분류, 날짜, 교시, 대상 선택"
              caption="교시는 단추를 눌러 범위로 고릅니다. 대상은 전교 · 학년 · 반 지정 중에 고르고, 반은 앞반 · 뒷반 같은 빠른 선택이 있습니다."
            />
            <p>
              <b>유형</b>에 따라 입력할 것이 달라집니다.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <b>학사일정</b> — 언제 무엇이 있다. 교시 · 장소 · 대상 반을 정합니다.
              </li>
              <li>
                <b>업무</b> — 누가 언제까지 한다. 교시와 대상 대신 <b>마감</b>과{" "}
                <b>담당자</b>를 정합니다.
              </li>
              <li>
                <b>공지</b> — 기간 동안 알리는 글. <Who>부장</Who>만 올릴 수 있습니다.
              </li>
            </ul>
            <Note>
              여러 날짜에 걸친 일정에 참여 체크를 켜면 <b>매일 출석 체크</b> 선택지가
              나옵니다. 수련회처럼 날마다 달라지면 &lsquo;매일&rsquo;, 현장체험학습처럼
              하루 단위로 정해지면 &lsquo;한 번만&rsquo;을 고르세요.
            </Note>

            <h3 className="pt-2 text-base font-bold">고치기 · 지우기</h3>
            <Shot
              src="/help/event-delete.png"
              alt="일정 상세 화면 오른쪽 위의 편집 · 삭제 단추와 삭제 확인 창"
              caption="일정을 열면 오른쪽 위에 편집과 삭제가 있습니다."
              height={640}
            />
            <p>
              일정을 열면 오른쪽 위 <b>편집</b> · <b>삭제</b>로 바로 갑니다. 두 단추는
              고칠 수 있는 사람에게만 보입니다.
            </p>
            <p>
              삭제해도 <b>바로 없어지지 않습니다.</b> 휴지통으로 갑니다. 댓글 · 첨부파일 ·
              참여기록 · 진행 명단이 그대로 남아 있어, 관리 화면의{" "}
              <b>변경 이력 · 휴지통</b>에서 <b>되돌리기</b>를 누르면 원래대로 돌아옵니다.
              잘못 지웠다고 다시 만들지 마세요.
            </p>
          </Section>

          <Section
            id="participation"
            title="학생 참여 체크"
            lead="담임은 자기 반을 입력하고, 부장은 반별 현황을 봅니다."
          >
            <Shot
              src="/help/event-detail.png"
              alt="일정 상세 — 반별 참여 현황표와 학생별 체크 그리드"
              caption="위쪽은 반별 집계, 아래쪽은 우리 반 학생 명단입니다."
              height={860}
            />
            <p>
              <Who>담임</Who> 학생 이름을 누르면{" "}
              <b>미입력 → 참여 → 불참</b> 순서로 바뀝니다. 대부분 참여하니{" "}
              <b>전체 참여</b>를 누른 뒤 빠지는 학생만 고치면 빠릅니다. 불참을
              고르면 사유를 적는 칸이 생깁니다. 다 하고 <b>저장</b>을 누르세요.
            </p>
            <p>
              <Who>모든 선생님</Who> 다른 반의 <b>인원수</b>도 볼 수 있습니다. 다만
              입력과 <b>학생 이름</b>은 담당하는 반만 열립니다.
              내가 담임인 반에는 <b>내 반</b> 표시가 붙습니다.
            </p>
            <p>
              <Who>부장</Who> <b>미입력</b> 칸을 보면 어느 반이 아직인지 바로 보입니다.
              &lsquo;아직 입력하지 않은 반&rsquo; 줄에 반 이름이 그대로 나옵니다.
            </p>
            <Note>
              <b>미입력</b>과 <b>불참</b>은 다릅니다. 엑셀에서는 둘 다 빈칸이거나 0이라
              구분이 안 됐지만, 여기서는 &lsquo;아직 안 넣은 것&rsquo;과 &lsquo;참여하지
              않은 것&rsquo;이 따로 집계됩니다.
            </Note>
          </Section>

          <Section
            id="roster"
            title="진행 명단"
            lead="반이 섞인 학생들을 단계별로 따라갑니다."
          >
            <p>
              &ldquo;2027 과학고 진학&rdquo; 처럼 <b>여러 반에서 몇 명씩 모인</b> 일은
              출석부로 관리하기 어렵습니다. 1반 셋, 2반 하나가 각각 다른 단계에 있고,
              그 단계도 학교마다 다릅니다. 진행 명단은 이런 일을 위한 것입니다.
            </p>

            <h3 className="pt-2 text-base font-bold">등록할 때 한 번에 정합니다</h3>
            <Shot
              src="/help/roster-setup.png"
              alt="일정 등록 화면의 진행 명단 설정 — 단계 목록, 공개 범위, 학생 검색"
              caption="단계 · 공개 범위 · 학생을 한 화면에서 정합니다."
              height={1200}
            />
            <p>
              일정 등록 화면에서 <b>진행 명단</b>에 체크하면 아래 설정이 펼쳐집니다.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <b>단계</b> — 이름을 직접 씁니다. <b>↑ ↓</b>로 순서를 바꾸고,{" "}
                <b>×</b>로 지우고, <b>+ 단계 추가</b>로 늘립니다. 오른쪽 위{" "}
                <b>고입 진학 · 대회 출전 · 제출물 관리</b>를 누르면 흔한 묶음이
                채워지니, 그걸 고쳐 쓰는 편이 빠릅니다.
              </li>
              <li>
                <b>진행 · 성공 · 실패</b> — 마지막에 어떻게 끝났는지 구분하는 표시입니다.
                합격은 <b>성공</b>, 불합격은 <b>실패</b>로 두면 &lsquo;마무리&rsquo; 인원이
                따로 집계됩니다.
              </li>
              <li>
                <b>학생</b> — 이름으로 찾아 <b>+ 담기</b>를 누릅니다.{" "}
                <b>같은 학년</b>이면 다른 반 학생도 찾아집니다. 지금 담지 않고 나중에
                추가해도 됩니다.
              </li>
            </ul>
            <Note>
              <b>단계는 등록할 때 정해집니다.</b> 만든 뒤에는 이름과 순서를 바꿀 수
              없으니, 처음에 조금 넉넉하게 잡아 두세요.
            </Note>

            <h3 className="pt-2 text-base font-bold">누가 볼 수 있나</h3>
            <p>
              진학 · 상담처럼 민감한 일이 많아 기본은 <b>담당자만</b>입니다. 담당자 ·
              부장 · 관리자만 명단 전체를 보고, 담임에게는 <b>자기 반 학생만</b>{" "}
              보입니다. 숨길 일이 아니라면 <b>전 교직원</b>으로 열 수 있는데, 이것은{" "}
              <Who>부장</Who> <Who>관리자</Who>만 고를 수 있습니다.
            </p>

            <h3 className="pt-2 text-base font-bold">단계 옮기기</h3>
            <Shot
              src="/help/roster.png"
              alt="진행 명단 — 단계별 인원 요약과 학생 목록"
              caption="위쪽 단계 줄의 숫자가 지금 인원입니다."
              height={404}
            />
            <p>
              한 명만 바꿀 때는 <b>단계</b> 칸에서 고르면 바로 저장됩니다.
            </p>
            <p>
              여럿을 한꺼번에 옮길 때는 왼쪽 <b>네모칸</b>을 체크한 뒤, 위쪽 단계 줄에서
              보낼 곳을 누르세요. 맨 위 네모칸을 누르면 전체가 선택됩니다. 면접 대상자를
              한 번에 넘길 때 편합니다.
            </p>
            <p>
              <b>메모</b> 칸에는 학생마다 한 줄씩 적어 둘 수 있습니다. 누가 언제 단계를
              바꿨는지도 남습니다.
            </p>
          </Section>

          <Section
            id="task"
            title="업무와 담당자"
            lead="일정 하나에 상태 하나가 아니라, 담당자마다 따로 관리됩니다."
          >
            <Shot
              src="/help/task-detail.png"
              alt="업무 일정 상세 — 담당자별 진행 상태와 미완료자 목록"
              caption="담당자마다 완료 여부가 따로 남습니다."
              height={620}
            />
            <p>
              &ldquo;3학년 담임 전원이 생활기록부 마감&rdquo; 같은 업무는 일정은 하나지만
              해야 할 사람은 여럿입니다. 담당자로 지정되면 각자{" "}
              <b>미확인 → 진행중 → 완료</b>를 직접 바꿉니다.
            </p>
            <Shot
              src="/help/tasks.png"
              alt="업무 현황 화면 — 업무별 진행률과 미완료자 이름"
              caption="업무 현황에서는 진행률과 함께 아직 안 낸 사람 이름이 그대로 보입니다."
              height={447}
            />
          </Section>

          <Section
            id="my"
            title="내 할 일 · 알림"
            lead="학교의 모든 일정이 아니라 나와 관련된 것만 모입니다."
          >
            <Shot
              src="/help/my.png"
              alt="내 할 일 화면 — 맡은 업무와 참여 입력이 필요한 일정"
              caption="맡은 업무는 동그라미를 눌러 바로 완료 처리할 수 있습니다."
              height={550}
            />
            <p>
              내 반 · 내 학년 · 내 부서에 걸린 일정과, 나에게 배정된 업무가 모입니다.
              마감이 가까우면 <b>D-3</b> 처럼 표시됩니다.
            </p>
            <Shot
              src="/help/notifications.png"
              alt="알림 목록 — 쪽지, 배정, 댓글, 공지, 마감"
              caption="쪽지 · 업무 배정 · 댓글 · 새 공지는 즉시, 마감 임박과 참여 미입력은 매일 아침에 알려 줍니다."
              height={481}
            />
            <p>
              화면 위쪽 <b>🔔</b>에 안 읽은 개수가 뜹니다. 알림을 누르면 해당 화면으로
              바로 갑니다.
            </p>
          </Section>

          <Section id="talk" title="쪽지 · 검색">
            <Shot
              src="/help/messages.png"
              alt="쪽지 화면 — 대화 목록과 대화창"
              caption="같은 학교 선생님끼리 1:1로 주고받습니다."
              height={481}
            />
            <p>
              쪽지는 <b>주고받은 두 사람만</b> 볼 수 있습니다. 부장도 관리자도 남의
              대화는 볼 수 없습니다.
            </p>
            <Shot
              src="/help/search.png"
              alt="검색 결과 — 일정, 첨부파일, 학생"
              caption="일정 · 첨부 파일 이름 · 학생 이름을 한 번에 찾습니다."
              height={447}
            />
            <p>학생은 담당하는 반만 검색됩니다.</p>
          </Section>

          <Section
            id="excel"
            title="엑셀로 주고받기"
            lead="쓰던 엑셀을 버리지 않아도 됩니다."
          >
            <p>
              <b>참여 현황 내보내기</b> — 반별 명렬표 · 총원 · 불참자 명단을 한 파일로
              받습니다. 지금 쓰시는 시트와 같은 구성이라 그대로 보고에 쓸 수 있습니다.
              (반별 탭은 1=참여, 0=불참, 빈칸=미입력)
            </p>
            <Shot
              src="/help/transfer.png"
              alt="일정 내보내기 · 가져오기 화면"
              caption="작년 일정을 받아 고친 뒤 새 학년도에 넣습니다."
              height={602}
            />
            <p>
              <Who>부장</Who> <b>일정 내보내기 · 가져오기</b> — 학교 일정은 해마다
              대부분 반복됩니다. 작년 것을 엑셀로 받아 날짜만 고쳐 올리면 처음부터
              입력할 일이 없습니다.
            </p>
            <Note>
              날짜를 옮길 때 <b>같은 요일로</b>를 고르면 364일(52주)을 밀어 요일이
              그대로 유지됩니다. 매주 월요일 회의처럼 요일이 중요한 일정에 맞습니다.
              3월 2일 개학처럼 날짜가 정해진 것은 <b>같은 날짜로</b>를 고르세요.
            </Note>
          </Section>

          <Section id="admin" title="관리자용">
            <Shot
              src="/help/admin.png"
              alt="관리 화면 — 학년·반 편성, 학생 명단, 교직원 초대, 보직 배정"
              caption="처음 한 번만 해두면 됩니다."
              height={670}
            />
            <ol className="list-decimal space-y-1.5 pl-5">
              <li><b>학년 · 반 편성</b> — 예: 3학년 1~10반을 한 번에 만듭니다.</li>
              <li><b>학생 명단</b> — 엑셀에서 복사해 붙여넣습니다. 번호를 건너뛰면 결번으로 남습니다.</li>
              <li><b>교직원 초대</b> — 초대 링크를 만들어 전달합니다.</li>
              <li>
                <b>보직 배정</b> — 담임을 배정해야 그 선생님에게 해당 반 학생이
                보입니다. 배정 전에는 아무 학생도 보이지 않습니다.
              </li>
            </ol>
            <Shot
              src="/help/audit.png"
              alt="변경 이력과 휴지통 화면"
              caption="누가 언제 무엇을 바꿨는지 남고, 지운 일정은 되돌릴 수 있습니다."
              height={550}
            />
            <p>
              일정을 삭제해도 바로 없어지지 않고 <b>휴지통</b>으로 갑니다. 댓글 · 첨부 ·
              참여기록이 그대로 남아 있어 되돌리면 원래대로 돌아옵니다.
            </p>
          </Section>

          <Section id="phone" title="폰에서 쓰기">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="sm:flex-1">
                <p className="mb-2">
                  <b>홈화면에 추가</b> — 폰 브라우저 메뉴에서 &lsquo;홈 화면에
                  추가&rsquo;를 누르면 앱처럼 열립니다.
                </p>
                <p>
                  <b>폰 캘린더에 띄우기</b> — 내 할 일 화면 아래에서 구독 주소를 만들어
                  폰 캘린더 앱에 등록하면 학사일정이 자동으로 보입니다. 나에게 걸린
                  일정에는 1시간 전 알림이 붙습니다.
                </p>
                <Note>
                  구독 주소를 아는 사람은 누구나 학사일정을 볼 수 있습니다
                  (학생 정보는 들어 있지 않습니다). 실수로 알려졌다면 같은 화면에서
                  재발급하세요 — 이전 주소는 즉시 끊깁니다.
                </Note>
              </div>
              <Image
                src="/help/mobile.png"
                alt="폰에서 본 내 할 일 화면"
                width={260}
                height={520}
                className="mx-auto w-[200px] rounded-xl border border-slate-300 shadow-sm sm:mx-0"
              />
            </div>
          </Section>

          <Section
            id="privacy"
            title="개인정보"
            lead="학생 정보는 필요한 사람만 봅니다."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="border border-slate-200 px-3 py-2">역할</th>
                    <th className="border border-slate-200 px-3 py-2">학생 이름</th>
                    <th className="border border-slate-200 px-3 py-2">참여 입력</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["담임", "자기 반", "자기 반"],
                    ["학년부장", "자기 학년", "자기 학년"],
                    ["교장 · 교감", "전교", "전교"],
                    ["비담임 (전담 · 보건 등)", "없음", "없음"],
                  ].map(([a, b, c]) => (
                    <tr key={a}>
                      <td className="border border-slate-200 px-3 py-2 font-medium">{a}</td>
                      <td className="border border-slate-200 px-3 py-2">{b}</td>
                      <td className="border border-slate-200 px-3 py-2">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              이 제한은 화면에서 가리는 것이 아니라 <b>데이터베이스가 막습니다.</b>{" "}
              주소를 직접 입력해도 볼 수 없습니다.
            </p>
            <p>
              학생은 이 사이트에 로그인하지 않습니다. 저장하는 것은 <b>이름과 번호</b>{" "}
              뿐이고, 주민번호 · 주소 · 연락처는 넣지 마세요.
            </p>
          </Section>
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            더 궁금한 점은 학교 관리자 선생님께 문의하세요.
          </p>
          <Link
            href="/login"
            className="mt-3 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            시작하기
          </Link>
        </div>
      </main>
    </div>
  );
}
