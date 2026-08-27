# 학교 업무관리

학사일정 · 업무 분장 · 학생 참여를 한 곳에서 관리합니다.
현재 엑셀/구글시트로 하는 **학년 일정표 + 반별 출석부**를 대체하는 것이 1차 목표입니다.

- 설계 근거: [SPEC-일정-참여.md](SPEC-일정-참여.md)
- 요구사항 리뷰: [REQUIREMENTS-REVIEW.md](REQUIREMENTS-REVIEW.md)
- DB 스키마: [supabase/README.md](supabase/README.md)

기술 스택: Next.js 16 (App Router) · Supabase (Postgres / Auth / RLS) · Tailwind CSS v4

폰 홈화면에 추가하면 앱처럼 씁니다 (PWA). 카카오톡 등에 링크를 붙이면
[OG 이미지](app/opengraph-image.png)가 함께 보입니다.

## 핵심 흐름

```
부장이 일정 등록 (날짜 · 교시 · 대상 반 · 참여체크 on)
  → 담임이 반별로 참여 / 불참 입력
    → 반별 집계 · 학년 총원 · 불참자 명단 · 미입력 반  (자동)
```

## 화면

| 경로 | 화면 | 비고 |
|---|---|---|
| `/login`, `/signup` | 로그인 · 가입 | |
| `/invite/[token]` | 초대 수락 | 학교 이메일 도메인 검증 |
| `/schools` | 학교 선택 · 생성 | |
| `/schools/[id]/calendar` | **날짜 × 교시 일정 그리드** | 인쇄 가능. 1순위 화면 |
| `/schools/[id]/events/new` | 일정 등록 | 교시 범위 · 반 다중선택(`1~5반`) |
| `/schools/[id]/events/[id]` | 일정 상세 | 참여 현황 + 체크 그리드 + **업무 담당** + 첨부 + 댓글 |
| `/schools/[id]/my` | 내 할 일 | 내가 맡은 업무(바로 완료 처리) + 내 반·학년·부서 일정 |
| `/schools/[id]/tasks` | 업무 현황 | 부장·관리자. 업무별 진행률과 **미완료자 이름** |
| `/schools/[id]/messages` | 쪽지 | 교직원 1:1, 당사자만 열람 |
| `/schools/[id]/notifications` | 알림 | 쪽지·배정·댓글·공지·마감·미입력 |
| `/schools/[id]/search` | 검색 | 일정 · 첨부파일 · 학생(담당 반만) |
| `/schools/[id]/audit` | 변경 이력 · 휴지통 | 관리자만 |
| `/schools/[id]/participation` | 참여 현황 내보내기 | 반별 · 총원 · 불참 엑셀 |
| `/schools/[id]/transfer` | 일정 내보내기 · 가져오기 | 엑셀 왕복. 새 학년도로 옮기기 |
| `/schools/[id]/admin` | 관리 | 학년·반 편성, 학생 명단, 초대, 보직 배정 |

같은 일정 상세 화면이 **역할에 따라 다르게 보입니다.** 부장에게는 학년 전체 집계가,
담임에게는 자기 반 체크 그리드만 나타납니다. 이 분기는 화면 코드가 아니라
**DB의 RLS**가 결정합니다.

## 시작하기

### 1. Supabase

프로젝트를 만들고 SQL Editor 에서 [supabase/](supabase/) 의 SQL 3개를 순서대로 실행합니다.
자세한 순서와 첫 세팅 쿼리는 [supabase/README.md](supabase/README.md) 참고.

**Authentication > Sign In / Providers > Email** 에서 빠르게 시작하려면
`Confirm email` 을 끄세요.

### 2. 로컬 실행

```bash
npm install
```

`.env.local` 을 실제 값으로 채웁니다 (Supabase 대시보드 > Settings > API):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> 배포 후 OG 이미지가 카카오톡 등에서 안 보이면 `NEXT_PUBLIC_SITE_URL` 에
> 배포 주소를 넣으세요. Vercel 은 보통 자동으로 잡힙니다.

```bash
npm run dev
```

### 3. 첫 세팅 순서

1. 가입 → **새 학교 만들기** (만든 사람이 관리자가 됩니다)
2. 관리 화면에서 **학년 · 반 편성** (예: 3학년 1~10반)
3. **학생 명단** — 엑셀에서 복사해 붙여넣기 (`1⇥강OO` 형식)
4. **초대 링크**를 만들어 선생님들에게 전달
5. **보직 배정** — 담임/부장을 지정해야 그 선생님에게 학생이 보입니다
6. 부장 계정으로 **일정 등록**

### 4. Vercel 배포

GitHub 에 push → Vercel 에서 import → 환경변수 2개 추가 → Deploy.
배포 후 Supabase > **Authentication > URL Configuration** 에서 Site URL 을 배포 주소로 설정하세요.

## 검증

```bash
npm test          # 일정 그리드 배치 · 반 표기 (스샷 재현 확인)
npm run test:rls  # RLS 권한 격리 (PGlite, Supabase 계정 불필요)
```

`npm test` 는 스샷의 실제 행(11/8 · 11/11 · 에듀투어 종일)을 넣어
셀 병합과 줄 분리가 재현되는지 확인합니다.
`npm run test:rls` 는 담임 · 부장 · 비담임이 각각 몇 명의 학생을 보는지 실제 Postgres 로 검사합니다.

## 아직 없는 것

반복 일정, 진급 처리, 실시간 갱신, 주간/간트 보기.

## 업무 일정

일정 등록에서 유형을 **업무**로 고르면 마감일이 생기고, 상세 화면에서 담당자를 배정합니다.

**일정 하나에 상태 하나면 쓸모가 없습니다.**
"3학년 담임 12명이 각자 제출" → 일정 1개, `event_assignments` 행 12개.
부장에게 필요한 건 합계가 아니라 **누가 아직 안 냈는지** 라서, 화면마다 미완료자 이름을 그대로 보여줍니다.

- 배정·해제: 부장 · 관리자 (`○학년 담임 전원` 빠른 배정)
- 상태 변경: **담당자 본인만** (미확인 → 진행중 → 완료)
- 미완료자 **이름 복사** 버튼 — 메신저로 독촉할 때
- `/my` 에서 체크 한 번으로 완료 처리

## 첨부 파일

비공개 버킷 `attachments` 를 쓰고, 경로는 `{school_id}/{event_id}/{uuid}.{확장자}` 입니다.
앞의 두 폴더가 Storage RLS 정책의 검사 대상이라 **순서를 바꾸면 접근이 막힙니다.**
한글 파일명은 스토리지 키로 쓰지 않고 DB의 `file_name` 에만 보관합니다.

- 조회·업로드: 같은 학교 구성원
- 삭제: 올린 사람 또는 그 일정을 편집할 수 있는 사람(부장·관리자)
- 열기: 매번 60초짜리 서명 URL 을 발급 (버킷이 비공개라 직접 링크가 없습니다)
- 파일당 50MB (Supabase 무료 플랜 기준). 늘리려면 대시보드에서 버킷 설정을 바꾸세요.

## 개인정보

학생은 이 사이트에 로그인하지 않습니다. **이름과 번호만** 저장하고
주민번호 · 주소 · 연락처는 저장하지 마세요.
담임은 자기 반, 학년부장은 자기 학년, 교장 · 교감만 전교가 보입니다 (RLS 강제).
Supabase 프로젝트 리전은 **서울**로 두세요.
