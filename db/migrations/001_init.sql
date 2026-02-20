create extension if not exists pgcrypto;
create extension if not exists vector;

create table app_user (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'admin' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table profile (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  headline text,
  bio text,
  location text,
  resume_url text,
  updated_at timestamptz not null default now()
);

create table project (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text not null,
  problem text,
  approach text,
  outcome text,
  stack text[] not null default '{}',
  tags text[] not null default '{}',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_asset (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  asset_type text not null check (asset_type in ('image', 'video', 'link', 'pdf')),
  url text not null,
  caption text,
  sort_order int not null default 0
);

create table city_recommendation (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  country text,
  category text not null,
  title text not null,
  recommendation text not null,
  tags text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table blog_post (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body_md text not null,
  seo_title text,
  seo_description text,
  keywords text[] not null default '{}',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table kb_document (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('project', 'resume', 'city', 'blog', 'manual')),
  source_id uuid,
  title text not null,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table kb_chunk (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references kb_document(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int,
  embedding vector(1536),
  metadata jsonb not null default '{}',
  unique (document_id, chunk_index)
);

create index kb_chunk_embedding_idx
  on kb_chunk using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index kb_chunk_document_idx on kb_chunk(document_id);

create table chat_session (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  mode text not null check (mode in ('projects', 'experience', 'city')),
  created_at timestamptz not null default now()
);

create table chat_message (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_session(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table rental_unit (
  id uuid primary key default gen_random_uuid(),
  unit_name text not null,
  location text not null default 'West Vancouver, BC',
  meter_type text not null check (meter_type in ('electricity', 'gas', 'water')),
  notes text,
  created_at timestamptz not null default now()
);

create table meter_reading (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references rental_unit(id) on delete cascade,
  image_url text not null,
  reading_value numeric(12,3) not null,
  reading_unit text not null,
  captured_at timestamptz not null,
  parsed_at timestamptz not null default now(),
  parser_confidence numeric(5,4),
  parse_status text not null default 'pending_review' check (parse_status in ('pending_review', 'approved', 'rejected')),
  source text not null default 'upload' check (source in ('upload', 'manual')),
  weather_day date generated always as (date(captured_at)) stored,
  created_at timestamptz not null default now()
);

create index meter_reading_unit_time_idx on meter_reading(unit_id, captured_at desc);

create table weather_daily (
  id uuid primary key default gen_random_uuid(),
  weather_date date not null unique,
  location text not null default 'West Vancouver, BC',
  temp_min_c numeric(5,2),
  temp_max_c numeric(5,2),
  temp_avg_c numeric(5,2),
  precipitation_mm numeric(8,2),
  humidity_avg numeric(5,2),
  hdd numeric(8,2),
  cdd numeric(8,2),
  source text not null,
  created_at timestamptz not null default now()
);
