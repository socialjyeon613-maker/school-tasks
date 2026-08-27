-- ============================================================
-- 학교 업무관리 시스템 — 01. 기본 스키마 (조직 · 사람 · 학생)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 실행 순서: 01_schema.sql → 02_events.sql → 03_participation.sql
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

-- 교직원 프로필 (auth.users 와 1:1, 가입 시 트리거로 자동 생성)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- 학교
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'middle' check (kind in ('elementary', 'middle', 'high')),
  -- 가입을 허용할 이메일 도메인. null/빈 배열이면 제한 없음 (예: {'sen.go.kr'})
  allowed_domains text[],
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- 학년도 — 학년/반/부서/학생/일정이 모두 여기에 종속됩니다.
-- 매년 3월 반이 재편성되므로, 이 축이 없으면 작년 담임이 올해 학생을 계속 보게 됩니다.
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  year int not null,                       -- 2026 (= 2026학년도)
  name text not null default '',           -- '2026학년도'
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, year)
);

-- 학교당 '현재 학년도'는 하나뿐
create unique index uniq_current_academic_year
  on public.academic_years (school_id) where is_current;

-- 학년 (1~3학년)
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  grade_no int not null check (grade_no between 1 and 6),
  name text not null default '',           -- '3학년'
  created_at timestamptz not null default now(),
  unique (academic_year_id, grade_no)
);

-- 반 (3-1 ~ 3-10)
create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  grade_id uuid not null references public.grades (id) on delete cascade,
  class_no int not null check (class_no > 0),
  name text not null default '',           -- '3-1'
  created_at timestamptz not null default now(),
  unique (grade_id, class_no)
);

-- 부서 (업무분장) — 교무부 / 연구부 / 생활인권부 …
-- 비담임(전담·보건·영양·사서·상담)이 소속될 자리이자, 일정이 만들어지는 축입니다.
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (academic_year_id, name)
);

-- 학교 멤버십 — 학년도별 기본 신분
create table public.school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'teacher'
    check (role in ('principal', 'vice_principal', 'teacher', 'staff', 'admin')),
  status text not null default 'active'
    check (status in ('pending', 'active', 'inactive')),   -- pending = 승인 대기
  joined_at timestamptz not null default now(),
  unique (academic_year_id, user_id)
);

-- 보직 — 한 교사가 동시에 여러 개를 가집니다.
--   예) 3-2반 담임(classroom) + 생활인권부 부원(department)
--       3학년 부장이면 role='head', grade_id=<3학년>
create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null
    check (role in ('head', 'homeroom', 'co_homeroom', 'member', 'subject')),
  -- 아래 셋 중 정확히 하나만 채웁니다.
  grade_id uuid references public.grades (id) on delete cascade,
  classroom_id uuid references public.classrooms (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint staff_roles_one_scope
    check (num_nonnulls(grade_id, classroom_id, department_id) = 1)
);

-- 학생 — 이 사이트에 로그인하지 않습니다. 담임이 대신 입력합니다.
-- 최소 정보만 저장합니다. 주민번호 · 주소 · 연락처는 저장하지 마세요.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  number int not null,                     -- 연번. 전출로 인한 결번을 허용합니다.
  name text not null,
  gender text check (gender in ('M', 'F')),
  status text not null default 'enrolled'
    check (status in ('enrolled', 'left')),  -- left = 전출/자퇴 (삭제하지 않고 상태만 변경)
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (classroom_id, number)
);

-- 학생 부가 속성 — 출석부의 '지원 대상 3' 처럼 참여 여부와 별개로 붙는 표시
create table public.student_flags (
  student_id uuid not null references public.students (id) on delete cascade,
  flag text not null,                      -- '지원대상', '알레르기', '차량이용' …
  note text not null default '',
  primary key (student_id, flag)
);

-- 초대 링크 — 아무나 가입하지 못하도록 초대 + 도메인 검증으로만 합류
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  role text not null default 'teacher'
    check (role in ('vice_principal', 'teacher', 'staff')),
  max_uses int,                            -- null = 무제한
  used_count int not null default 0,
  expires_at timestamptz,                  -- null = 무기한
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index idx_years_school on public.academic_years (school_id);
create index idx_grades_year on public.grades (academic_year_id);
create index idx_classrooms_year on public.classrooms (academic_year_id);
create index idx_classrooms_grade on public.classrooms (grade_id);
create index idx_departments_year on public.departments (academic_year_id);
create index idx_members_user on public.school_members (user_id);
create index idx_members_year on public.school_members (academic_year_id);
create index idx_staff_roles_user on public.staff_roles (user_id);
create index idx_staff_roles_classroom on public.staff_roles (classroom_id);
create index idx_staff_roles_grade on public.staff_roles (grade_id);
create index idx_staff_roles_department on public.staff_roles (department_id);
create index idx_students_classroom on public.students (classroom_id);
create index idx_students_year on public.students (academic_year_id);
create index idx_invites_school on public.invites (school_id);

-- ------------------------------------------------------------
-- 2. 가입 시 프로필 자동 생성
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. 권한 헬퍼 (RLS 재귀를 피하려면 반드시 security definer)
-- ------------------------------------------------------------

-- 현재 로그인 사용자가 이 학교의 활성 구성원인가
create or replace function public.is_school_member(p_school uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from school_members
    where school_id = p_school and user_id = auth.uid() and status = 'active'
  );
$$;

-- 현재 학년도 기준 학교 내 신분
create or replace function public.school_role(p_school uuid)
returns text
language sql stable
security definer set search_path = public
as $$
  select m.role
  from school_members m
  join academic_years y on y.id = m.academic_year_id
  where m.school_id = p_school
    and m.user_id = auth.uid()
    and m.status = 'active'
    and y.is_current
  limit 1;
$$;

-- 교장 · 교감 · 시스템관리자 = 전교 열람 / 설정 권한
create or replace function public.is_school_admin(p_school uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.school_role(p_school) in ('principal', 'vice_principal', 'admin');
$$;

-- 부장(학년부장 / 부서부장) 여부 — 일정 등록 권한의 기준
create or replace function public.is_head(p_school uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from staff_roles r
    join academic_years y on y.id = r.academic_year_id
    where r.school_id = p_school
      and r.user_id = auth.uid()
      and r.role = 'head'
      and y.is_current
  );
$$;

-- 이 반의 학생을 '입력 · 수정' 할 수 있는가
--   담임 / 부담임 / 해당 학년부장 / 교장 · 교감 · 관리자
create or replace function public.can_manage_classroom(p_classroom uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from classrooms c
    where c.id = p_classroom
      and (
        public.is_school_admin(c.school_id)
        or exists (
          select 1 from staff_roles r
          where r.user_id = auth.uid()
            and r.classroom_id = c.id
            and r.role in ('homeroom', 'co_homeroom')
        )
        or exists (
          select 1 from staff_roles r
          where r.user_id = auth.uid()
            and r.grade_id = c.grade_id
            and r.role = 'head'
        )
      )
  );
$$;

-- 이 반의 학생을 '조회' 할 수 있는가 = 관리 권한 + 해당 반 교과담당
create or replace function public.can_view_classroom(p_classroom uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select public.can_manage_classroom(p_classroom)
      or exists (
        select 1 from staff_roles r
        where r.user_id = auth.uid()
          and r.classroom_id = p_classroom
          and r.role = 'subject'
      );
$$;

-- ------------------------------------------------------------
-- 4. RLS 정책
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.academic_years enable row level security;
alter table public.grades enable row level security;
alter table public.classrooms enable row level security;
alter table public.departments enable row level security;
alter table public.school_members enable row level security;
alter table public.staff_roles enable row level security;
alter table public.students enable row level security;
alter table public.student_flags enable row level security;
alter table public.invites enable row level security;

-- 프로필: 로그인 사용자는 조회 가능(담당자 이름 표시용), 본인 것만 수정
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid());

-- 학교: 구성원만 조회, 생성은 RPC(create_school), 설정 변경은 관리자
create policy "schools_select" on public.schools
  for select to authenticated using (public.is_school_member(id));
create policy "schools_update" on public.schools
  for update to authenticated using (public.is_school_admin(id));

-- 학년도 · 학년 · 반 · 부서: 구성원 조회, 관리자만 편성
create policy "years_select" on public.academic_years
  for select to authenticated using (public.is_school_member(school_id));
create policy "years_write" on public.academic_years
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "grades_select" on public.grades
  for select to authenticated using (public.is_school_member(school_id));
create policy "grades_write" on public.grades
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "classrooms_select" on public.classrooms
  for select to authenticated using (public.is_school_member(school_id));
create policy "classrooms_write" on public.classrooms
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

create policy "departments_select" on public.departments
  for select to authenticated using (public.is_school_member(school_id));
create policy "departments_write" on public.departments
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

-- 멤버십: 같은 학교 구성원끼리 조회. 합류는 RPC(accept_invite)로만.
create policy "members_select" on public.school_members
  for select to authenticated using (public.is_school_member(school_id));
create policy "members_write" on public.school_members
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

-- 보직: 구성원 조회(누가 몇 반 담임인지는 모두 알아야 함), 편성은 관리자
create policy "staff_roles_select" on public.staff_roles
  for select to authenticated using (public.is_school_member(school_id));
create policy "staff_roles_write" on public.staff_roles
  for all to authenticated
  using (public.is_school_admin(school_id))
  with check (public.is_school_admin(school_id));

-- ★ 학생: 담임은 자기 반, 학년부장은 자기 학년, 교장 · 교감은 전교.
--   비담임 교사에게는 아무 행도 보이지 않습니다.
create policy "students_select" on public.students
  for select to authenticated using (public.can_view_classroom(classroom_id));
create policy "students_insert" on public.students
  for insert to authenticated with check (public.can_manage_classroom(classroom_id));
create policy "students_update" on public.students
  for update to authenticated
  using (public.can_manage_classroom(classroom_id))
  with check (public.can_manage_classroom(classroom_id));
create policy "students_delete" on public.students
  for delete to authenticated using (public.can_manage_classroom(classroom_id));

create policy "student_flags_select" on public.student_flags
  for select to authenticated
  using (exists (select 1 from students s
                 where s.id = student_id and public.can_view_classroom(s.classroom_id)));
create policy "student_flags_write" on public.student_flags
  for all to authenticated
  using (exists (select 1 from students s
                 where s.id = student_id and public.can_manage_classroom(s.classroom_id)))
  with check (exists (select 1 from students s
                 where s.id = student_id and public.can_manage_classroom(s.classroom_id)));

-- 초대: 관리자만 발급/조회. 수락은 RPC.
create policy "invites_select" on public.invites
  for select to authenticated using (public.is_school_admin(school_id));
create policy "invites_insert" on public.invites
  for insert to authenticated
  with check (public.is_school_admin(school_id) and created_by = auth.uid());
create policy "invites_delete" on public.invites
  for delete to authenticated using (public.is_school_admin(school_id));

-- ------------------------------------------------------------
-- 5. RPC — 학교 생성 (학년도 · 교시 · 분류 기본값까지 한 번에)
--   ※ periods / event_categories 는 02_events.sql 에서 만들어집니다.
--     따라서 이 함수는 02 까지 실행한 뒤에 호출하세요.
-- ------------------------------------------------------------

create or replace function public.create_school(
  p_name text,
  p_kind text default 'middle',
  p_year int default null,
  p_domains text[] default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_year_id uuid;
  v_year int;
  v_domains text[];
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  -- 3월 이전이면 아직 전 학년도로 봅니다.
  v_year := coalesce(
    p_year,
    case when extract(month from current_date) >= 3
         then extract(year from current_date)::int
         else extract(year from current_date)::int - 1 end
  );

  select array_agg(d) into v_domains
  from (
    select lower(trim(both ' @' from x)) as d
    from unnest(coalesce(p_domains, '{}')) x
    where trim(both ' @' from x) <> ''
  ) t;

  insert into schools (name, kind, allowed_domains, created_by)
  values (trim(p_name), p_kind, v_domains, auth.uid())
  returning id into v_school;

  insert into academic_years (school_id, year, name, is_current, starts_on, ends_on)
  values (v_school, v_year, v_year || '학년도', true,
          make_date(v_year, 3, 1), make_date(v_year + 1, 2, 28))
  returning id into v_year_id;

  -- 만든 사람을 관리자로 등록
  insert into school_members (school_id, academic_year_id, user_id, role, status)
  values (v_school, v_year_id, auth.uid(), 'admin', 'active');

  -- 기본 교시 1~7 (시각은 학교에 맞게 수정하세요)
  insert into periods (school_id, academic_year_id, no, name, starts_at, ends_at)
  select v_school, v_year_id, n, n || '교시',
         (time '09:00' + ((n - 1) * interval '55 minutes')),
         (time '09:45' + ((n - 1) * interval '55 minutes'))
  from generate_series(1, 7) n;

  -- 기본 일정 분류 (스샷의 색 구분을 그대로 옮겼습니다)
  insert into event_categories (school_id, academic_year_id, name, color, lane, position)
  values
    (v_school, v_year_id, '체험·관람',     'emerald', 'grid', 1),
    (v_school, v_year_id, '시험·평가',     'sky',     'grid', 2),
    (v_school, v_year_id, '진로 프로그램', 'violet',  'grid', 3),
    (v_school, v_year_id, '특별 활동',     'amber',   'grid', 4),
    (v_school, v_year_id, '휴업·전교행사', 'orange',  'grid', 5),
    (v_school, v_year_id, '고입 전형',     'rose',    'side', 6),
    (v_school, v_year_id, '업무 마감',     'slate',   'side', 7);

  return v_school;
end;
$$;

-- ------------------------------------------------------------
-- 6. RPC — 학년 · 반 일괄 생성
-- ------------------------------------------------------------

-- 예) select create_classrooms('<year_id>', 3, 10);  → 3학년 1~10반 생성
create or replace function public.create_classrooms(
  p_year_id uuid,
  p_grade_no int,
  p_class_count int
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_school uuid;
  v_grade uuid;
begin
  select school_id into v_school from academic_years where id = p_year_id;
  if v_school is null then
    raise exception 'YEAR_NOT_FOUND';
  end if;
  if not public.is_school_admin(v_school) then
    raise exception 'FORBIDDEN';
  end if;

  insert into grades (school_id, academic_year_id, grade_no, name)
  values (v_school, p_year_id, p_grade_no, p_grade_no || '학년')
  on conflict (academic_year_id, grade_no) do update set name = excluded.name
  returning id into v_grade;

  insert into classrooms (school_id, academic_year_id, grade_id, class_no, name)
  select v_school, p_year_id, v_grade, n, p_grade_no || '-' || n
  from generate_series(1, p_class_count) n
  on conflict (grade_id, class_no) do nothing;

  return v_grade;
end;
$$;

-- ------------------------------------------------------------
-- 7. RPC — 학생 명단 일괄 등록 (CSV 업로드용)
-- ------------------------------------------------------------

-- p_rows 예: '[{"number":1,"name":"강OO","gender":"F"}, {"number":3,"name":"김OO"}]'
-- 연번은 결번을 허용합니다 (전출 학생 자리).
create or replace function public.import_students(p_classroom uuid, p_rows jsonb)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_class classrooms%rowtype;
  v_count int;
begin
  select * into v_class from classrooms where id = p_classroom;
  if not found then
    raise exception 'CLASSROOM_NOT_FOUND';
  end if;
  if not public.can_manage_classroom(p_classroom) then
    raise exception 'FORBIDDEN';
  end if;

  insert into students (school_id, academic_year_id, classroom_id, number, name, gender)
  select v_class.school_id, v_class.academic_year_id, p_classroom,
         (r ->> 'number')::int,
         trim(r ->> 'name'),
         nullif(r ->> 'gender', '')
  from jsonb_array_elements(p_rows) r
  where coalesce(trim(r ->> 'name'), '') <> ''
  on conflict (classroom_id, number)
    do update set name = excluded.name, gender = excluded.gender;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------
-- 8. RPC — 초대 조회 / 수락
-- ------------------------------------------------------------

create or replace function public.get_invite_info(p_token text)
returns table (school_id uuid, school_name text, allowed_domains text[], status text)
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_invite invites%rowtype;
  v_school schools%rowtype;
begin
  select * into v_invite from invites where token = p_token;
  if not found then
    return query select null::uuid, null::text, null::text[], 'NOT_FOUND'::text;
    return;
  end if;

  select * into v_school from schools where id = v_invite.school_id;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return query select v_school.id, v_school.name, v_school.allowed_domains, 'EXPIRED'::text;
  elsif v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    return query select v_school.id, v_school.name, v_school.allowed_domains, 'EXHAUSTED'::text;
  else
    return query select v_school.id, v_school.name, v_school.allowed_domains, 'VALID'::text;
  end if;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite invites%rowtype;
  v_domains text[];
  v_email text;
  v_domain text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_invite from invites where token = p_token;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    raise exception 'INVITE_EXHAUSTED';
  end if;

  -- 이미 합류했으면 그대로 통과
  if exists (
    select 1 from school_members
    where academic_year_id = v_invite.academic_year_id and user_id = auth.uid()
  ) then
    return v_invite.school_id;
  end if;

  -- 학교 이메일 도메인 검증
  select allowed_domains into v_domains from schools where id = v_invite.school_id;
  if v_domains is not null and array_length(v_domains, 1) > 0 then
    select email into v_email from profiles where id = auth.uid();
    v_domain := lower(split_part(coalesce(v_email, ''), '@', 2));
    if not exists (select 1 from unnest(v_domains) d where lower(d) = v_domain) then
      raise exception 'DOMAIN_NOT_ALLOWED';
    end if;
  end if;

  insert into school_members (school_id, academic_year_id, user_id, role, status)
  values (v_invite.school_id, v_invite.academic_year_id, auth.uid(), v_invite.role, 'active');

  update invites set used_count = used_count + 1 where id = v_invite.id;

  return v_invite.school_id;
end;
$$;
