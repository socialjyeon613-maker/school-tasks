-- 로컬 검증용 Supabase 스텁 (실제 배포에는 사용하지 않음)
create schema if not exists auth;
create schema if not exists storage;
create role authenticated;
create role anon;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'
);

-- 세션 변수로 현재 사용자 흉내
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create table storage.buckets (
  id text primary key, name text, public boolean default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(p text) returns text[]
language sql immutable as $$
  select (string_to_array(p, '/'))[1:array_length(string_to_array(p, '/'), 1) - 1];
$$;

-- pgcrypto 대체 (PGlite 검증용). gen_random_uuid 는 PG13+ 코어에 이미 있음.
create or replace function public.gen_random_bytes(n int) returns bytea
language sql volatile as $fn$
  select decode(substring(repeat(md5(random()::text), (n / 16) + 2) from 1 for n * 2), 'hex');
$fn$;
