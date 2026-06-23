create extension if not exists pgcrypto;

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_time text,
  location text,
  fee_text text,
  max_people integer not null default 0,
  custom_fields jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  child_name text not null,
  phone text not null,
  custom_answers jsonb not null default '{}'::jsonb,
  edit_token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists registrations_activity_id_idx on registrations(activity_id);
create index if not exists registrations_edit_token_idx on registrations(edit_token);

alter table activities enable row level security;
alter table registrations enable row level security;

-- 本项目通过 Next.js API 使用 service_role key 访问数据库。
-- 前端不会直接访问 Supabase，因此无需开放 anon 读写策略。
