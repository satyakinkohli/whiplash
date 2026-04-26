-- whiplash · initial schema
-- Run via `pnpm migrate` (which invokes scripts/migrate.ts) or directly via
-- the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- artists: canonical artist table (Spotify enrichment populates this later)
-- ---------------------------------------------------------------------------
create table if not exists artists (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  name_normalized text not null unique,
  spotify_id      text unique,
  genres          text[] not null default '{}',
  popularity      int,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- venues: canonical venue table (populated lazily as events arrive)
-- ---------------------------------------------------------------------------
create table if not exists venues (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  name_normalized text not null unique,
  city            text not null,
  capacity_tier   text check (capacity_tier in ('stadium', 'arena', 'mid', 'club', 'cafe')),
  ingestion_tier  text check (ingestion_tier in ('1', '2', '3')), -- see README
  website         text,
  instagram       text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events: the canonical, deduped event row
-- ---------------------------------------------------------------------------
create table if not exists events (
  id              uuid primary key default uuid_generate_v4(),
  dedupe_key      text not null unique,

  artist_id       uuid references artists(id) on delete set null,
  artist_display  text not null,
  artist_normalized text not null,

  venue_id        uuid references venues(id) on delete set null,
  venue_display   text,
  venue_normalized text,

  city            text not null,
  date            date not null,
  end_date        date,
  type            text not null check (type in ('concert', 'festival')),
  ticket_url      text,
  genres          text[] not null default '{}',

  status          text not null default 'queued'
                    check (status in ('queued', 'approved', 'rejected', 'removed')),

  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  removed_at      timestamptz
);

create index if not exists events_city_date_idx on events (city, date);
create index if not exists events_status_idx on events (status);
create index if not exists events_first_seen_idx on events (first_seen_at);

-- ---------------------------------------------------------------------------
-- event_sources: provenance — which sources have seen this event
-- ---------------------------------------------------------------------------
create table if not exists event_sources (
  event_id        uuid not null references events(id) on delete cascade,
  source_id       text not null,
  external_id     text not null,
  source_url      text not null,
  confidence      numeric(3, 2) not null default 1.00,
  last_run_id     uuid not null,
  last_seen_at    timestamptz not null default now(),
  primary key (event_id, source_id)
);

create index if not exists event_sources_source_idx on event_sources (source_id);

-- ---------------------------------------------------------------------------
-- runs: pipeline run history for observability
-- ---------------------------------------------------------------------------
create table if not exists runs (
  id              uuid primary key default uuid_generate_v4(),
  started_at      timestamptz not null,
  finished_at     timestamptz,
  by_source       jsonb not null default '{}',
  total_new       int not null default 0,
  total_updated   int not null default 0,
  total_removed   int not null default 0,
  errors          text[] not null default '{}'
);
