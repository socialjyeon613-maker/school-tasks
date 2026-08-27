import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'

const SUP = 'C:/forWife/학교업무관리/supabase'
const db = await PGlite.create()

for (const p of ['./00_supabase_stub.sql', `${SUP}/01_schema.sql`, `${SUP}/02_events.sql`, `${SUP}/03_participation.sql`, `${SUP}/04_event_edit.sql`, `${SUP}/05_teacher_access.sql`]) {
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
