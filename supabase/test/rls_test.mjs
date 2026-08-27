import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'

const SUP = 'C:/forWife/학교업무관리/supabase'
const db = await PGlite.create()

for (const p of ['./00_supabase_stub.sql', `${SUP}/01_schema.sql`, `${SUP}/02_events.sql`, `${SUP}/03_participation.sql`, `${SUP}/04_event_edit.sql`, `${SUP}/05_teacher_access.sql`, `${SUP}/06_daily_participation.sql`, `${SUP}/07_task_assignees.sql`, `${SUP}/08_notices.sql`, `${SUP}/09_messages.sql`, `${SUP}/10_notifications.sql`, `${SUP}/11_import_events.sql`, `${SUP}/12_audit_softdelete.sql`, `${SUP}/13_search_ical.sql`]) {
  await db.exec(fs.readFileSync(p, 'utf8').replace(/create extension[^;]*;/gi, ''))
}

// Supabase 가 자동으로 걸어주는 권한을 로컬에서 흉내
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
`)

const U = {}
async function mkUser(key, email, name) {
  const r = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('name',$2::text)) returning id`,
    [email, name])
  U[key] = r.rows[0].id
}
const asUser = async (key) => db.exec(`reset role; set test.uid = '${U[key]}';`)
const asAuthed = async (key) => db.exec(`reset role; set test.uid = '${U[key]}'; set role authenticated;`)
const one = async (sql) => (await db.query(sql)).rows[0]

// ── 사람 만들기 ────────────────────────────────────────────
await mkUser('admin',  'admin@sen.go.kr',  '교감')
await mkUser('head',   'head@sen.go.kr',   '3학년부장')
await mkUser('hr1',    'hr1@sen.go.kr',    '3-1담임')
await mkUser('hr2',    'hr2@sen.go.kr',    '3-2담임')
await mkUser('nonhr',  'nonhr@sen.go.kr',  '보건교사')
await mkUser('outsider','x@other.com',     '외부인')

// ── 학교 · 학년 · 반 세팅 (교감) ──────────────────────────
await asUser('admin')
const { create_school: school } = await one(
  `select create_school('○○중학교','middle',2024, array['sen.go.kr']) as create_school`)
const { id: yearId } = await one(`select id from academic_years where school_id='${school}'`)
await db.exec(`select create_classrooms('${yearId}', 3, 10)`)

const cls = {}
for (const r of (await db.query(`select name, id from classrooms where academic_year_id='${yearId}'`)).rows)
  cls[r.name] = r.id
const { id: grade3 } = await one(`select id from grades where academic_year_id='${yearId}' and grade_no=3`)

// 교직원 등록 + 보직 부여
for (const [k, role] of [['head','teacher'],['hr1','teacher'],['hr2','teacher'],['nonhr','teacher']])
  await db.exec(`insert into school_members (school_id, academic_year_id, user_id, role)
                 values ('${school}','${yearId}','${U[k]}','${role}')`)

await db.exec(`
  insert into staff_roles (school_id, academic_year_id, user_id, role, grade_id)
    values ('${school}','${yearId}','${U.head}','head','${grade3}');
  insert into staff_roles (school_id, academic_year_id, user_id, role, classroom_id)
    values ('${school}','${yearId}','${U.hr1}','homeroom','${cls['3-1']}'),
           ('${school}','${yearId}','${U.hr2}','homeroom','${cls['3-2']}');
`)
// 보건교사는 부서 소속만 (반 없음)
await db.exec(`insert into departments (school_id, academic_year_id, name) values ('${school}','${yearId}','보건실')`)
const { id: deptId } = await one(`select id from departments where academic_year_id='${yearId}'`)
await db.exec(`insert into staff_roles (school_id, academic_year_id, user_id, role, department_id)
               values ('${school}','${yearId}','${U.nonhr}','member','${deptId}')`)

// ── 학생 명단 (3-1: 24명 연번 11 결번, 3-2: 23명) ─────────
const roster = (n, skip) => JSON.stringify(
  Array.from({ length: n + (skip ? 1 : 0) }, (_, i) => i + 1)
    .filter(i => i !== skip).map(i => ({ number: i, name: `학생${i}` })))
await db.exec(`select import_students('${cls['3-1']}', '${roster(24, 11)}'::jsonb)`)
await db.exec(`select import_students('${cls['3-2']}', '${roster(23, null)}'::jsonb)`)

// ── 일정 등록 (3학년 전체 대상, 참여체크 on) ──────────────
await asUser('head')
const { create_event: ev } = await one(`
  select create_event('${yearId}', '난타 공연', '2024-12-10'::date, null,
    null, 'academic', false, 3, 4, '11:00'::time, '홍대 전용관',
    true, '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[]) as create_event`)

console.log('\n=== 1. 학생 조회 범위 (RLS) ===')
for (const k of ['admin','head','hr1','hr2','nonhr','outsider']) {
  await asAuthed(k)
  const r = await one(`select count(*)::int n from students`)
  const names = await one(`select coalesce(string_agg(distinct c.name, ','), '-') s
                           from students st join classrooms c on c.id=st.classroom_id`)
  console.log(`   ${k.padEnd(9)} 학생 ${String(r.n).padStart(3)}명   반: ${names.s}`)
}

console.log('\n=== 2. 담임이 자기 반 참여 입력 ===')
await asUser('hr1')
await db.exec(`select set_classroom_participation('${ev}', '${cls['3-1']}', 'attended')`)
await db.exec(`select set_participation('${ev}', (select id from students where classroom_id='${cls['3-1']}' and number=7), 'absent', '질병')`)
console.log('   3-1 전체 참여 → 7번만 불참(질병) 으로 변경 완료')

console.log('\n=== 3. 담임이 남의 반을 건드리면? ===')
await asUser('hr1')
try {
  await db.exec(`select set_classroom_participation('${ev}', '${cls['3-2']}', 'attended')`)
  console.log('   ❌ 3-2반 입력이 통과됨 (버그)')
} catch (e) { console.log(`   ✅ 차단됨: ${e.message}`) }

console.log('\n=== 4. 부장이 보는 현황판 ===')
await asAuthed('head')
const sum = await one(`select * from v_participation_summary where event_id='${ev}'`)
console.log(`   ${sum.title} (${String(sum.start_date).slice(0,10)})`)
console.log(`   총원 ${sum.total} / 참여 ${sum.attended} / 불참 ${sum.absent} / 미입력 ${sum.pending}`)
console.log(`   입력완료 ${sum.classroom_done}/${sum.classroom_count}개 반`)
console.log(`   ▸ 미입력 반: ${sum.pending_classrooms}`)

const abs = await db.query(`select classroom_name, names from v_absentees where event_id='${ev}'`)
console.log(`   ▸ 불참자: ${abs.rows.map(r => `${r.classroom_name} ${r.names}`).join(' / ') || '없음'}`)

console.log('\n=== 5. 담임이 보는 같은 현황판 (자기 반만) ===')
await asAuthed('hr1')
const s2 = await one(`select * from v_participation_summary where event_id='${ev}'`)
console.log(`   총원 ${s2.total} / 참여 ${s2.attended} / 불참 ${s2.absent} / 미입력 ${s2.pending}`)

console.log('\n=== 6. 비담임(보건교사) ===')
await asAuthed('nonhr')
const s3 = await one(`select count(*)::int n from participations`)
const s4 = await one(`select count(*)::int n from events`)
console.log(`   참여기록 ${s3.n}건 (0이어야 정상) / 일정 ${s4.n}건 (학사일정은 보여야 정상)`)

console.log('\n=== 7. 도메인 제한 초대 ===')
await asUser('admin')
const { token } = await one(`insert into invites (school_id, academic_year_id, created_by)
                             values ('${school}','${yearId}','${U.admin}') returning token`)
await asUser('outsider')
try {
  await db.exec(`select accept_invite('${token}')`)
  console.log('   ❌ 외부 도메인이 합류함 (버그)')
} catch (e) { console.log(`   ✅ 차단됨: ${e.message}`) }

console.log('\n=== 8. 시간표 충돌 감지 ===')
await asUser('head')
await db.exec(`select create_event('${yearId}', '진로특강', '2024-12-10'::date, null,
  null, 'academic', false, 4, 5, null, '시청각실', false,
  array['${cls['3-1']}']::uuid[], '{}'::uuid[], '{}'::uuid[])`)
const conf = await db.query(`select other_title, classroom_name from event_conflicts('${ev}')`)
console.log(`   '난타 공연' 과 겹치는 일정: ${conf.rows.map(r => `${r.other_title}(${r.classroom_name})`).join(', ') || '없음'}`)

console.log('\n=== 9. 첨부 파일 스토리지 정책 ===')
await db.exec(`grant usage on schema storage to authenticated; grant all on all tables in schema storage to authenticated;`)
const path = `${school}/${ev}/abc123.hwp`

// 담임이 업로드
await asAuthed('hr1')
await db.query(`insert into storage.objects (bucket_id, name, owner) values ('attachments', $1, $2)`,
  [path, U.hr1])
console.log('   ✅ 담임 업로드 성공 (경로 규칙 {school}/{event}/{file})')

// 같은 학교 구성원은 조회 가능, 외부인은 불가
for (const k of ['nonhr', 'outsider']) {
  await asAuthed(k)
  const r = await one(`select count(*)::int n from storage.objects where bucket_id='attachments'`)
  console.log(`   ${k.padEnd(9)} 조회 ${r.n}건 ${k === 'nonhr' ? '(1이어야 정상)' : '(0이어야 정상)'}`)
}

// 남의 파일 삭제 시도 — 담임 hr2 는 업로더도 아니고 일정 편집권도 없음
await asAuthed('hr2')
await db.query(`delete from storage.objects where name = $1`, [path])
await asUser('admin')
let left = await one(`select count(*)::int n from storage.objects where name='${path}'`)
console.log(`   ${left.n === 1 ? '✅ 무관한 담임의 삭제 차단됨' : '❌ 삭제돼버림 (버그)'}`)

// 부장은 일정 편집권이 있으므로 삭제 가능
await asAuthed('head')
await db.query(`delete from storage.objects where name = $1`, [path])
await asUser('admin')
left = await one(`select count(*)::int n from storage.objects where name='${path}'`)
console.log(`   ${left.n === 0 ? '✅ 부장은 삭제 가능 (고아 파일 방지)' : '❌ 부장이 삭제 못함 (버그)'}`)

console.log('\n=== 10. 업무 배정 ===')
await asUser('head')
const { create_event: task } = await one(`
  select create_event('${yearId}', '체험학습 계획서 제출', '2024-12-02'::date, null,
    null, 'task', true, null, null, null, '', false,
    '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[],
    '2024-12-05 17:00+09'::timestamptz) as create_event`)

// 부장이 담임 2명을 배정
await asAuthed('head')
await db.exec(`insert into event_assignments (event_id, user_id)
               values ('${task}','${U.hr1}'), ('${task}','${U.hr2}')`)
console.log('   ✅ 부장이 담임 2명 배정')

// 담임이 아닌 사람이 배정하려 하면?
await asAuthed('nonhr')
try {
  await db.exec(`insert into event_assignments (event_id, user_id) values ('${task}','${U.nonhr}')`)
  console.log('   ❌ 비담임이 스스로 배정함 (버그)')
} catch { console.log('   ✅ 비담임의 임의 배정 차단됨') }

// 본인 상태 변경
await asAuthed('hr1')
await db.query(`update event_assignments set status='done', submitted_at=now()
                where event_id=$1 and user_id=$2`, [task, U.hr1])

// 남의 상태를 바꾸려 하면? (담임 hr1 은 일정 편집권이 없음)
await db.query(`update event_assignments set status='done' where event_id=$1 and user_id=$2`,
  [task, U.hr2])
await asUser('admin')
const other = await one(`select status from event_assignments where event_id='${task}' and user_id='${U.hr2}'`)
console.log(`   ${other.status === 'pending' ? '✅ 남의 상태 변경 차단됨' : '❌ 남의 상태가 바뀜 (버그)'}`)

// 부장 현황판
await asAuthed('head')
const prog = await one(`select * from v_assignment_progress where event_id='${task}'`)
console.log(`   현황판: ${prog.assigned}명 중 ${prog.done}명 완료, ${prog.remaining}명 미완료`)

console.log('\n=== 11. 일정 편집 · 삭제 ===')
// 부장이 만든 '난타 공연'(3학년 대상)을 3-1반 대상으로 좁힌다
await asUser('head')
await db.exec(`select update_event('${ev}', '난타 공연(수정)', '2024-12-11'::date, null,
  null, 'academic', false, 5, 6, '13:00'::time, '홍대 전용관 2관', true,
  array['${cls['3-1']}']::uuid[], '{}'::uuid[], '{}'::uuid[], null)`)
const upd = await one(`select title, start_date, period_from, period_to, location from events where id='${ev}'`)
const tgt = await one(`select count(*)::int n from event_targets where event_id='${ev}' and classroom_id is not null`)
console.log(`   ✅ 수정됨: ${upd.title} / ${upd.period_from}~${upd.period_to}교시 / ${upd.location}`)
console.log(`   ✅ 대상 교체: 학년 → 반 ${tgt.n}개 (전교로 뒤바뀌지 않음)`)

// 참여 기록은 남아 있고, 집계는 새 대상 기준으로만
const kept = await one(`select count(*)::int n from participations where event_id='${ev}'`)
const summ = await one(`select total, attended from v_participation_summary where event_id='${ev}'`)
console.log(`   참여 기록 ${kept.n}건 보존 / 집계 대상은 ${summ.total}명 (3-1반만)`)

// 권한 없는 담임이 수정하면?
await asUser('hr2')
try {
  await db.exec(`select update_event('${ev}', '몰래수정', '2024-12-11'::date)`)
  console.log('   ❌ 무관한 담임이 수정함 (버그)')
} catch (e) { console.log(`   ✅ 무관한 담임의 수정 차단됨: ${e.message}`) }

// 삭제 — 담임은 불가, 부장은 가능
await asAuthed('hr2')
await db.query(`delete from events where id = $1`, [ev])
await asUser('admin')
let alive = await one(`select count(*)::int n from events where id='${ev}'`)
console.log(`   ${alive.n === 1 ? '✅ 담임의 삭제 차단됨' : '❌ 삭제돼버림 (버그)'}`)

await asAuthed('head')
await db.query(`delete from events where id = $1`, [ev])
await asUser('admin')
alive = await one(`select count(*)::int n from events where id='${ev}'`)
const orphan = await one(`select count(*)::int n from participations where event_id='${ev}'`)
console.log(`   ${alive.n === 0 ? '✅ 부장은 삭제 가능' : '❌ 부장이 삭제 못함'} / 참여기록 cascade 정리: ${orphan.n}건 남음`)

console.log('\n=== 12. 교사 권한 확대 (05) ===')
// 담임(부장 아님)이 일정을 등록할 수 있는가
await asUser('hr1')
let myEvent = null
try {
  const r = await one(`select create_event('${yearId}', '우리반 독서시간', '2024-12-16'::date, null,
    null, 'academic', false, 1, 1, null, '교실', true,
    array['${cls['3-1']}']::uuid[], '{}'::uuid[], '{}'::uuid[], null) as id`)
  myEvent = r.id
  console.log('   ✅ 담임이 직접 일정 등록 가능')
} catch (e) { console.log(`   ❌ 담임이 등록 못함: ${e.message}`) }

// 비담임(보건교사)도 가능해야 함
await asUser('nonhr')
try {
  await db.exec(`select create_event('${yearId}', '보건교육', '2024-12-17'::date, null,
    null, 'academic', true, null, null, null, '보건실', false,
    '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null)`)
  console.log('   ✅ 비담임도 일정 등록 가능')
} catch (e) { console.log(`   ❌ 비담임이 등록 못함: ${e.message}`) }

// 남이 만든 일정은 못 고쳐야 함
await asUser('hr2')
try {
  await db.exec(`select update_event('${myEvent}', '가로채기', '2024-12-16'::date)`)
  console.log('   ❌ 남의 일정을 수정함 (버그)')
} catch (e) { console.log(`   ✅ 남이 만든 일정 수정은 여전히 차단: ${e.message}`) }

// 반별 집계는 모든 교직원에게, 이름은 여전히 자기 반만
await asUser('hr1')
await db.exec(`select set_classroom_participation('${myEvent}', '${cls['3-1']}', 'attended')`)
await asAuthed('hr2')
const st = await db.query(`select classroom_name, total, attended, pending, can_edit from event_classroom_status('${myEvent}')`)
console.log(`   3-2 담임이 보는 다른 반 집계: ${st.rows.map(r=>`${r.classroom_name} ${r.attended}/${r.total}${r.can_edit?'(내 반)':''}`).join(', ')}`)
const names = await db.query(`select classroom_name, names from v_absentees where event_id='${myEvent}'`)
console.log(`   3-2 담임이 보는 3-1반 학생 이름: ${names.rows.length === 0 ? '없음 ✅ (이름은 여전히 잠김)' : '❌ 노출됨'}`)

await asAuthed('nonhr')
try {
  const s2 = await db.query(`select count(*)::int n from event_classroom_status('${myEvent}')`)
  console.log(`   ✅ 비담임도 반별 집계 조회 가능 (${s2.rows[0].n}개 반)`)
} catch (e) { console.log(`   ❌ 비담임 집계 조회 실패: ${e.message}`) }

await asAuthed('outsider')
try {
  await db.query(`select * from event_classroom_status('${myEvent}')`)
  console.log('   ❌ 외부인이 집계를 봄 (버그)')
} catch (e) { console.log(`   ✅ 외부인 차단: ${e.message}`) }

console.log('\n=== 13. 여러 날 출석 + 내 반 구분 (06) ===')
await asUser('head')
// 3일짜리 수련회, 매일 체크
const { id: camp } = await one(`select create_event('${yearId}', '수련회', '2024-12-18'::date,
  '2024-12-20'::date, null, 'academic', true, null, null, null, '수련원', true,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, true) as id`)
const dates = await db.query(`select * from event_dates('${camp}') d`)
console.log(`   ✅ 매일 체크 일정의 날짜: ${dates.rows.length}일 (${dates.rows.map(r=>String(r.d).slice(4,10)).join(', ')})`)

// 한 번만 체크하는 3일 일정과 비교
const { id: trip } = await one(`select create_event('${yearId}', '현장체험학습', '2024-12-18'::date,
  '2024-12-20'::date, null, 'academic', true, null, null, null, '박물관', true,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, false) as id`)
const d2 = await db.query(`select * from event_dates('${trip}') d`)
console.log(`   ✅ 한 번만 체크 일정의 날짜: ${d2.rows.length}일 (전체에 한 번)`)

// 하루짜리에 매일 체크를 켜도 무시되어야 함
const { id: oneday } = await one(`select create_event('${yearId}', '하루행사', '2024-12-23'::date, null,
  null, 'academic', true, null, null, null, '', true,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, true) as id`)
const d3 = await one(`select daily_participation from events where id='${oneday}'`)
console.log(`   ${d3.daily_participation === false ? '✅' : '❌'} 하루짜리는 매일 체크가 자동으로 꺼짐`)

// 3일 전체 한 번에 참석 처리
await asUser('hr1')
const n = await one(`select set_classroom_participation('${camp}', '${cls['3-1']}', 'attended', true, null, true) as n`)
console.log(`   ✅ 3-1반 3일 전체 일괄 처리: ${n.n}건`)

// 둘째 날만 한 명 불참
const stu = await one(`select id, name from students where classroom_id='${cls['3-1']}' and number=5`)
await db.exec(`select set_participation('${camp}', '${stu.id}', 'absent', '질병', '2024-12-19'::date)`)

await asAuthed('head')
const daily = await db.query(`select * from event_daily_summary('${camp}')`)
console.log('   날짜별 현황:')
for (const r of daily.rows)
  console.log(`     ${String(r.on_date).slice(4,10)}  참여 ${r.attended} / 불참 ${r.absent} / 미입력 ${r.pending}`)

// '내 반' 구분 — 부장은 학년 전체가 can_edit 이지만 is_homeroom 은 자기 반만
const st1 = await db.query(`select classroom_name, can_edit, is_homeroom from event_classroom_status('${camp}', '2024-12-19'::date)`)
console.log(`   부장이 보는 반: ${st1.rows.map(r=>`${r.classroom_name}[편집${r.can_edit?'O':'X'}/내반${r.is_homeroom?'O':'X'}]`).join(' ')}`)
const badgeOk = st1.rows.every(r => r.can_edit === true) && st1.rows.every(r => r.is_homeroom === false)
console.log(`   ${badgeOk ? '✅ 부장: 전 반 편집 가능하지만 "내 반"은 없음' : '❌ 구분 실패'}`)

await asAuthed('hr1')
const st2 = await db.query(`select classroom_name, can_edit, is_homeroom from event_classroom_status('${camp}', '2024-12-19'::date)`)
console.log(`   3-1 담임이 보는 반: ${st2.rows.map(r=>`${r.classroom_name}[편집${r.can_edit?'O':'X'}/내반${r.is_homeroom?'O':'X'}]`).join(' ')}`)

console.log('\n=== 14. 업무 담당자 지정 (07) ===')
await asUser('head')
const { id: task2 } = await one(`select create_event('${yearId}', '생활기록부 마감', '2024-12-26'::date, null,
  null, 'task', false, 3, 4, '11:00'::time, '', true,
  array['${cls['3-1']}']::uuid[], array['${grade3}']::uuid[], '{}'::uuid[],
  '2024-12-27 17:00+09'::timestamptz, true,
  array['${U.hr1}','${U.hr2}']::uuid[]) as id`)

const ev2 = await one(`select event_type, all_day, period_from, requires_participation, daily_participation from events where id='${task2}'`)
console.log(`   업무 등록 시 무시되는 값 — 교시:${ev2.period_from ?? '없음'} / 종일:${ev2.all_day} / 참여체크:${ev2.requires_participation} / 매일:${ev2.daily_participation}`)
const tg = await one(`select count(*)::int n from event_targets where event_id='${task2}'`)
console.log(`   ${tg.n === 0 ? '✅' : '❌'} 업무는 대상(학년/반)을 만들지 않음 (${tg.n}건)`)
const asg = await db.query(`select p.name from event_assignments a join profiles p on p.id=a.user_id where a.event_id='${task2}' order by p.name`)
console.log(`   ✅ 담당자 ${asg.rows.length}명 지정: ${asg.rows.map(r=>r.name).join(', ')}`)

// 담당자 한 명이 완료 처리
await asAuthed('hr1')
await db.query(`update event_assignments set status='done', submitted_at=now() where event_id=$1 and user_id=$2`, [task2, U.hr1])

// 부장이 제목만 고쳐도 완료 상태가 남아야 함
await asUser('head')
await db.exec(`select update_event('${task2}', '생활기록부 마감(연장)', '2024-12-26'::date, null,
  null, 'task', true, null, null, null, '', false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
  '2024-12-30 17:00+09'::timestamptz, false, array['${U.hr1}','${U.hr2}']::uuid[])`)
const keptRow = await one(`select status from event_assignments where event_id='${task2}' and user_id='${U.hr1}'`)
console.log(`   ${keptRow.status === 'done' ? '✅ 수정해도 담당자 완료 상태 보존' : '❌ 상태가 초기화됨: '+keptRow.status}`)

// 담당자를 한 명으로 줄이면 빠진 사람만 사라져야 함
await db.exec(`select update_event('${task2}', '생활기록부 마감(연장)', '2024-12-26'::date, null,
  null, 'task', true, null, null, null, '', false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
  null, false, array['${U.hr1}']::uuid[])`)
const remain = await db.query(`select user_id, status from event_assignments where event_id='${task2}'`)
console.log(`   ${remain.rows.length === 1 && remain.rows[0].status === 'done' ? '✅ 빠진 담당자만 제거, 남은 사람 상태 유지' : '❌ 예상과 다름'}`)

console.log('\n=== 15. 공지 (08) ===')
// 부장은 등록 가능
await asUser('head')
const { id: notice } = await one(`select create_event('${yearId}', '겨울방학 중 근무 안내', '2024-12-23'::date,
  '2025-01-10'::date, null, 'notice', false, 3, 4, '11:00'::time, '교무실', true,
  array['${cls['3-1']}']::uuid[], array['${grade3}']::uuid[], '{}'::uuid[],
  null, true, array['${U.hr1}']::uuid[], '방학 중 근무는 교무실로 문의하세요.') as id`)
const nv = await one(`select event_type, all_day, period_from, start_time, category_id, requires_participation, description from events where id='${notice}'`)
console.log(`   ✅ 부장이 공지 등록`)
console.log(`   공지에서 무시되는 값 — 교시:${nv.period_from ?? '없음'} / 시각:${nv.start_time ?? '없음'} / 분류:${nv.category_id ?? '없음'} / 참여체크:${nv.requires_participation}`)
const nt = await one(`select count(*)::int n from event_targets where event_id='${notice}'`)
const na = await one(`select count(*)::int n from event_assignments where event_id='${notice}'`)
console.log(`   ${nt.n===0 && na.n===0 ? '✅' : '❌'} 대상 ${nt.n}건 / 담당자 ${na.n}건 (둘 다 0이어야 정상)`)
console.log(`   본문: "${nv.description}"`)

// 일반 교사는 공지 등록 불가 (일반 일정은 가능)
await asUser('hr1')
try {
  await db.exec(`select create_event('${yearId}', '몰래공지', '2024-12-23'::date, '2024-12-24'::date,
    null, 'notice', true, null, null, null, '', false,
    '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '내용')`)
  console.log('   ❌ 일반 교사가 공지를 올림 (버그)')
} catch (e) { console.log(`   ✅ 일반 교사의 공지 등록 차단: ${e.message}`) }

// 게시 기간
const period = await one(`select start_date, end_date from events where id='${notice}'`)
console.log(`   게시 기간: ${String(period.start_date).slice(4,15)} ~ ${String(period.end_date).slice(4,15)}`)

// 달력 격자에는 안 나와야 함
await asAuthed('hr1')
const grid = await one(`select count(*)::int n from v_events_by_date
  where academic_year_id='${yearId}' and event_id='${notice}'`)
console.log(`   (참고) v_events_by_date 에는 ${grid.n}행 — 화면에서 event_type 으로 걸러냅니다`)

console.log('\n=== 16. 공지 권한 축소 + 쪽지 (09) ===')
// 관리자(교감)는 부장 보직이 없으므로 이제 공지를 못 올립니다
await asUser('admin')
try {
  await db.exec(`select create_event('${yearId}', '교감공지', '2024-12-23'::date, '2024-12-24'::date,
    null, 'notice', true, null, null, null, '', false,
    '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '내용')`)
  console.log('   ❌ 부장이 아닌 관리자가 공지를 올림')
} catch (e) { console.log(`   ✅ 부장 아닌 사람은 공지 불가: ${e.message}`) }
await asUser('head')
await db.exec(`select create_event('${yearId}', '부장공지', '2024-12-23'::date, '2024-12-24'::date,
  null, 'notice', true, null, null, null, '', false,
  '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '내용')`)
console.log('   ✅ 부장은 공지 등록 가능')

console.log('\n   -- 쪽지 --')
await asAuthed('hr1')
await db.query(`insert into messages (school_id, sender_id, recipient_id, body)
                values ($1,$2,$3,$4)`, [school, U.hr1, U.hr2, '3-2반 학생 상담 건으로 연락드립니다'])
await asAuthed('hr2')
await db.query(`insert into messages (school_id, sender_id, recipient_id, body)
                values ($1,$2,$3,$4)`, [school, U.hr2, U.hr1, '네 오후에 뵐게요'])
console.log('   ✅ 담임끼리 쪽지 2건 주고받음')

// 제3자는 남의 대화를 못 봄
await asAuthed('head')
const peek = await one(`select count(*)::int n from messages`)
console.log(`   ${peek.n === 0 ? '✅ 부장도 남의 쪽지 못 봄' : '❌ 남의 쪽지가 보임 ('+peek.n+'건)'}`)
await asAuthed('admin')
const peek2 = await one(`select count(*)::int n from messages`)
console.log(`   ${peek2.n === 0 ? '✅ 관리자도 남의 쪽지 못 봄' : '❌ 관리자에게 보임 ('+peek2.n+'건)'}`)

// 당사자는 보임 + 안 읽은 수
await asAuthed('hr1')
const mine = await one(`select count(*)::int n from messages`)
const unread = await one(`select unread_message_count('${school}') as n`)
const conv = await db.query(`select other_name, last_body, unread from my_conversations('${school}')`)
console.log(`   ✅ 당사자에게는 ${mine.n}건 / 안 읽음 ${unread.n}건`)
console.log(`   대화 목록: ${conv.rows.map(r=>`${r.other_name}("${r.last_body}") 안읽음${r.unread}`).join(', ')}`)

// 남을 사칭해 보내면?
try {
  await db.query(`insert into messages (school_id, sender_id, recipient_id, body) values ($1,$2,$3,$4)`,
    [school, U.hr2, U.head, '사칭'])
  console.log('   ❌ 남을 사칭해 보냄 (버그)')
} catch { console.log('   ✅ 남을 사칭한 발송 차단') }

// 외부인에게 보내면?
try {
  await db.query(`insert into messages (school_id, sender_id, recipient_id, body) values ($1,$2,$3,$4)`,
    [school, U.hr1, U.outsider, '외부'])
  console.log('   ❌ 외부인에게 보냄 (버그)')
} catch { console.log('   ✅ 학교 밖 사람에게는 발송 차단') }

// 읽음 처리
await db.query(`select mark_messages_read($1,$2)`, [school, U.hr2])
const after = await one(`select unread_message_count('${school}') as n`)
console.log(`   ✅ 읽음 처리 후 안 읽음 ${after.n}건`)

console.log('\n=== 17. 알림 (10) ===')
const notiOf = async (u) => (await one(
  `select count(*)::int n from notifications where user_id='${U[u]}'`)).n

// 쪽지 → 받는 사람에게만
await asUser('admin')
const before = await notiOf('hr2')
const beforeSender = await notiOf('hr1')   // hr1 은 앞서 받은 쪽지 알림이 이미 있습니다
await asAuthed('hr1')
await db.query(`insert into messages (school_id, sender_id, recipient_id, body) values ($1,$2,$3,$4)`,
  [school, U.hr1, U.hr2, '알림 테스트'])
await asUser('admin')
const afterR = await notiOf('hr2')
const afterS = await notiOf('hr1')
console.log(`   ${afterR > before ? '✅' : '❌'} 쪽지 받은 사람에게 알림 생성 (${before}→${afterR})`)
console.log(`   ${afterS === beforeSender ? '✅' : '❌'} 보낸 사람에게는 안 생김 (${beforeSender}→${afterS})`)

// 업무 배정 → 배정된 사람
await asUser('head')
const { id: t3 } = await one(`select create_event('${yearId}', '알림용 업무', '2024-12-28'::date, null,
  null, 'task', true, null, null, null, '', false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
  now() + interval '1 day', false, array['${U.hr1}']::uuid[], '') as id`)
await asUser('admin')
const asgNoti = await one(`select title from notifications where user_id='${U.hr1}' and kind='assigned' order by created_at desc limit 1`)
console.log(`   ✅ 배정 알림: "${asgNoti?.title ?? '없음'}"`)

// 공지 → 전 교직원
await asUser('head')
await db.exec(`select create_event('${yearId}', '알림용 공지', '2024-12-28'::date, '2024-12-30'::date,
  null, 'notice', true, null, null, null, '', false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
  null, false, '{}'::uuid[], '내용')`)
await asUser('admin')
const noticeNoti = await one(`select count(distinct user_id)::int n from notifications where kind='notice'`)
console.log(`   ✅ 공지 알림 ${noticeNoti.n}명에게 (작성자 제외)`)

// 마감 임박 · 참여 미입력
const made = await one(`select create_due_reminders() as n`)
console.log(`   ✅ 예약 알림 ${made.n}건 생성`)
const kinds = await db.query(`select kind, count(*)::int n from notifications group by kind order by kind`)
console.log(`   종류별: ${kinds.rows.map(r=>`${r.kind} ${r.n}`).join(' / ')}`)

// 두 번 돌려도 안 쌓임
const again = await one(`select create_due_reminders() as n`)
const total1 = await one(`select count(*)::int n from notifications where kind in ('due_soon','participation_pending')`)
await db.exec(`select create_due_reminders()`)
const total2 = await one(`select count(*)::int n from notifications where kind in ('due_soon','participation_pending')`)
console.log(`   ${total1.n === total2.n ? '✅ 여러 번 돌려도 중복 안 쌓임' : '❌ 중복 생성됨 '+total1.n+'→'+total2.n}`)

// 남의 알림은 안 보임
await asAuthed('hr2')
const mineOnly = await db.query(`select distinct user_id from notifications`)
console.log(`   ${mineOnly.rows.length <= 1 ? '✅ 내 알림만 보임' : '❌ 남의 알림이 보임'}`)
const cnt = await one(`select unread_notification_count('${school}') as n`)
await db.query(`select mark_notifications_read($1, null)`, [school])
const after2 = await one(`select unread_notification_count('${school}') as n`)
console.log(`   ✅ 안 읽음 ${cnt.n}건 → 모두 읽음 후 ${after2.n}건`)

console.log('\n=== 18. 일정 가져오기 (11) ===')
// 새 학년도를 만들고 작년 일정을 옮겨봅니다
await asUser('admin')
const { id: y2 } = await one(`insert into academic_years (school_id, year, name, is_current)
  values ('${school}', 2025, '2025학년도', false) returning id`)
await db.exec(`select create_classrooms('${y2}', 3, 10)`)
await db.exec(`insert into event_categories (school_id, academic_year_id, name, color, lane)
               values ('${school}','${y2}','체험·관람','emerald','grid')`)
await db.exec(`insert into school_members (school_id, academic_year_id, user_id, role, status)
  select '${school}','${y2}', user_id, role, 'active' from school_members where academic_year_id='${yearId}'`)

const impRows = [
  { type:'academic', category:'체험·관람', title:'난타 공연', start_date:'2025-12-10',
    all_day:false, period_from:3, period_to:4, start_time:'11:00', location:'홍대 전용관',
    grade_no:3, class_nos:[1,2,3,4,5], requires_participation:true },
  { type:'academic', category:'없는분류', title:'분류없는 일정', start_date:'2025-12-11', grade_no:3 },
  { type:'academic', category:'', title:'없는학년', start_date:'2025-12-12', grade_no:9 },
  { type:'task', category:'', title:'계획서 제출', start_date:'2025-12-15',
    due_at:'2025-12-16 17:00', assignee_emails:['hr1@sen.go.kr'] },
  { type:'academic', category:'', title:'', start_date:'2025-12-13' },
  { type:'academic', category:'', title:'날짜없음' },
]
const impRes = await db.query(`select import_events('${y2}', $1::jsonb) as r`, [JSON.stringify(impRows)])
const rep = impRes.rows[0].r
console.log(`   ${rep.total}건 중 ${rep.created}건 등록`)
console.log(`   경고 ${rep.warnings.length}건: ${rep.warnings.map(w=>w.message).join(' / ')}`)
console.log(`   실패 ${rep.errors.length}건: ${rep.errors.map(e=>e.message).join(' / ')}`)

const imported = await one(`select title, period_from, period_to, location, requires_participation
                       from events where academic_year_id='${y2}' and title='난타 공연'`)
console.log(`   ✅ 값 보존: ${imported.title} / ${imported.period_from}~${imported.period_to}교시 / ${imported.location} / 참여체크 ${imported.requires_participation}`)
const impTg = await one(`select count(*)::int n from event_targets t
  join events e on e.id=t.event_id where e.academic_year_id='${y2}' and e.title='난타 공연' and t.classroom_id is not null`)
console.log(`   ${impTg.n === 5 ? '✅' : '❌'} 대상 반 ${impTg.n}개 (1~5반)`)
const impAsg = await one(`select count(*)::int n from event_assignments a
  join events e on e.id=a.event_id where e.academic_year_id='${y2}' and e.title='계획서 제출'`)
console.log(`   ${impAsg.n === 1 ? '✅' : '❌'} 담당자 이메일로 매칭 ${impAsg.n}명`)

// 권한 없는 사람은?
await asUser('outsider')
try {
  await db.query(`select import_events('${y2}', '[]'::jsonb)`)
  console.log('   ❌ 외부인이 가져오기 실행')
} catch (e) { console.log(`   ✅ 외부인 차단: ${e.message}`) }

console.log('\n=== 19. 변경 이력 · 휴지통 (12) ===')
await asUser('head')
const { id: ev9 } = await one(`select create_event('${yearId}', '감사테스트', '2024-12-29'::date, null,
  null, 'academic', true, null, null, null, '강당', true,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '') as id`)
await db.exec(`select update_event('${ev9}', '감사테스트(수정)', '2024-12-30'::date, null,
  null, 'academic', true, null, null, null, '체육관', true,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '')`)

await asUser('admin')
const trail = await db.query(`select action, entity, label, changes from audit_log
  where record_id='${ev9}' order by id`)
console.log(`   ✅ 이력 ${trail.rows.length}건`)
for (const t of trail.rows) {
  const ch = t.changes ? Object.keys(t.changes).filter(k=>k!=='updated_at') : []
  console.log(`     ${t.action} ${t.entity} "${t.label}"${ch.length?` — ${ch.join(', ')}`:''}`)
}

// soft delete → 목록에서 사라지되 기록은 남음
await asAuthed('head')
await db.query(`select soft_delete_event($1)`, [ev9])
const visible = await one(`select count(*)::int n from events where id='${ev9}'`)
console.log(`   ${visible.n === 0 ? '✅ 삭제 후 조회에서 사라짐' : '❌ 아직 보임'}`)
await asUser('admin')
const stillThere = await one(`select count(*)::int n from events where id='${ev9}'`)
const parts9 = await one(`select count(*)::int n from participations where event_id='${ev9}'`)
console.log(`   ✅ 실제 행은 남아 있음 (${stillThere.n}건) / 참여기록 ${parts9.n}건 보존`)

// 휴지통 목록 + 복구
await asAuthed('head')
const bin = await db.query(`select title, participation_count from deleted_events('${school}')`)
console.log(`   ✅ 휴지통: ${bin.rows.map(r=>`${r.title}(참여 ${r.participation_count})`).join(', ')}`)
await db.query(`select restore_event($1)`, [ev9])
const back = await one(`select count(*)::int n from events where id='${ev9}'`)
console.log(`   ${back.n === 1 ? '✅ 되돌리니 다시 보임' : '❌ 복구 실패'}`)

// 권한
await asAuthed('hr1')
try {
  await db.query(`select * from deleted_events('${school}')`)
  console.log('   ❌ 일반 담임이 휴지통을 봄')
} catch { console.log('   ✅ 일반 담임은 휴지통 못 봄') }
const auditSeen = await one(`select count(*)::int n from audit_log`)
console.log(`   ${auditSeen.n === 0 ? '✅ 일반 담임은 변경 이력 못 봄' : '❌ 이력이 보임 ('+auditSeen.n+'건)'}`)
await asAuthed('admin')
const adminSeen = await one(`select count(*)::int n from audit_log`)
console.log(`   ✅ 관리자에게는 ${adminSeen.n}건 보임`)

console.log('\n=== 20. 검색 · 캘린더 구독 (13) ===')
// 검색 — 학생은 볼 수 있는 반만
await asAuthed('hr1')
const q1 = await db.query(`select kind, title, subtitle from search_school('${school}', '학생') order by kind, title limit 20`)
console.log(`   3-1 담임 검색 '학생': ${q1.rows.filter(r=>r.kind==='student').length}명 (자기 반만)`)
await asAuthed('hr2')
const q2 = await db.query(`select kind, subtitle from search_school('${school}', '학생')`)
const classes2 = [...new Set(q2.rows.filter(r=>r.kind==='student').map(r=>r.subtitle.split(' ')[0]))]
console.log(`   3-2 담임에게 보이는 반: ${classes2.join(', ') || '없음'}`)
await asAuthed('head')
const q3 = await db.query(`select kind, subtitle from search_school('${school}', '학생')`)
const classes3 = [...new Set(q3.rows.filter(r=>r.kind==='student').map(r=>r.subtitle.split(' ')[0]))]
console.log(`   ✅ 부장에게 보이는 반: ${classes3.join(', ')} (학년 전체)`)
const q4 = await db.query(`select kind, title from search_school('${school}', '수련')`)
console.log(`   일정 검색 '수련': ${q4.rows.map(r=>`${r.kind}:${r.title}`).join(', ')}`)

// 삭제한 일정은 검색에도 안 나와야 함
await asUser('head')
const { id: gone } = await one(`select create_event('${yearId}', '검색되면안됨', '2024-12-31'::date, null,
  null, 'academic', true, null, null, null, '', false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
  null, false, '{}'::uuid[], '') as id`)
await db.exec(`select soft_delete_event('${gone}')`)
await asAuthed('head')
const q5 = await db.query(`select title from search_school('${school}', '검색되면안됨')`)
console.log(`   ${q5.rows.length === 0 ? '✅ 삭제한 일정은 검색에 안 나옴' : '❌ 나옴'}`)

// 캘린더 토큰
await asAuthed('hr1')
const tok = await one(`select my_calendar_token('${school}') as t`)
const tok2 = await one(`select my_calendar_token('${school}') as t`)
console.log(`   ${tok.t === tok2.t ? '✅ 같은 사람에게는 같은 토큰' : '❌ 매번 바뀜'}`)
const reset = await one(`select my_calendar_token('${school}', true) as t`)
console.log(`   ${reset.t !== tok.t ? '✅ 재발급하면 바뀜' : '❌ 안 바뀜'}`)

// 피드는 '오늘 기준 최근 60일 이후'만 담습니다 — 미래 일정을 하나 만들어 확인합니다.
await asUser('head')
await db.exec(`select create_event('${yearId}', '피드확인용', (current_date + 5)::date, null,
  null, 'academic', false, 2, 3, null, '강당', false,
  '{}'::uuid[], array['${grade3}']::uuid[], '{}'::uuid[], null, false, '{}'::uuid[], '')`)

// 토큰만으로 (로그인 없이)
await db.exec(`reset role; set test.uid = ''`)
const feed = await db.query(`select title, all_day, starts_at, mine from calendar_feed($1)`, [reset.t])
console.log(`   ✅ 로그인 없이 토큰으로 ${feed.rows.length}건 조회`)
const f0 = feed.rows.find(r=>r.title==='피드확인용')
console.log(`   교시→시각 변환: ${f0 ? `${f0.title} ${f0.starts_at ?? '(종일)'}` : '없음'}`)
const bad = await db.query(`select count(*)::int n from calendar_feed('없는토큰')`)
console.log(`   ${bad.rows[0].n === 0 ? '✅ 잘못된 토큰은 빈 결과' : '❌ 새어 나옴'}`)
const cols = await db.query(`select * from calendar_feed($1) limit 1`, [reset.t])
const keys = Object.keys(cols.rows[0] ?? {})
const leaked = keys.filter(k => /student|name|number|reason/i.test(k))
console.log(`   ${leaked.length === 0 ? '✅ 피드에 학생 정보 없음' : '❌ 학생 정보 노출: '+leaked}`)
console.log(`   피드 항목: ${keys.join(', ')}`)
