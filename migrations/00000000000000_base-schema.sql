-- Reconstructed base schema for the self-hosted backend.
--
-- WHY THIS FILE EXISTS: the upstream project's migrations/ directory starts at
-- 2026-07-14 and contains DELTAS only. The tables the deltas alter
-- (tokentracker_hourly, _devices, _device_tokens, _device_codes,
-- _leaderboard_snapshots, _leaderboard_anomaly_flags, _user_settings,
-- _user_profiles, _public_views, _device_skill_inventories, _anticheat_config)
-- were created by hand in the hosted project and were never committed, so a
-- fresh self-hosted instance cannot be built from migrations/ alone.
--
-- Every column here was derived from the code that reads or writes it:
--   * tokentracker_hourly   -> scripts/ops/account-usage-grouped-rpc.sql (the
--                              authoritative SELECT list) and the ingest edge's
--                              onConflict key (user_id, device_id, hour_start,
--                              source, model).
--   * tokentracker_devices  -> tokentracker-device-token-issue.ts,
--                              tokentracker-account-devices.ts.
--   * the rest              -> the .select()/.eq()/.insert() usage in
--                              dashboard/edge-patches/*.ts.
-- Types are deliberately permissive (bigint/text/timestamptz/uuid); the delta
-- migrations narrow them where upstream did. Idempotent: safe to re-run.

create extension if not exists pgcrypto;

-- ── hourly usage buckets ────────────────────────────────────────────────────
create table if not exists public.tokentracker_hourly (
    user_id                       uuid        not null references auth.users (id) on delete cascade,
    device_id                     uuid        not null,
    hour_start                    timestamptz not null,
    source                        text        not null,
    model                         text        not null,
    total_tokens                  bigint      not null default 0,
    input_tokens                  bigint      not null default 0,
    output_tokens                 bigint      not null default 0,
    cached_input_tokens           bigint      not null default 0,
    cache_creation_input_tokens   bigint      not null default 0,
    reasoning_output_tokens       bigint      not null default 0,
    total_cost_usd                numeric     not null default 0,
    conversations                 bigint      not null default 0,
    updated_at                    timestamptz not null default now(),
    constraint tokentracker_hourly_pkey
        primary key (user_id, device_id, hour_start, source, model)
);
create index if not exists tokentracker_hourly_user_hour_idx
    on public.tokentracker_hourly (user_id, hour_start desc);

-- ── devices ─────────────────────────────────────────────────────────────────
create table if not exists public.tokentracker_devices (
    id                  uuid        primary key default gen_random_uuid(),
    user_id             uuid        not null references auth.users (id) on delete cascade,
    machine_id          text,
    device_name         text,
    default_device_name text,
    name_customized     boolean     not null default false,
    platform            text,
    created_at          timestamptz not null default now(),
    revoked_at          timestamptz
);
create index if not exists tokentracker_devices_user_idx
    on public.tokentracker_devices (user_id) where revoked_at is null;
create index if not exists tokentracker_devices_machine_idx
    on public.tokentracker_devices (user_id, machine_id) where revoked_at is null;
create unique index if not exists tokentracker_devices_legacy_name_idx
    on public.tokentracker_devices (user_id, platform, device_name)
    where revoked_at is null and machine_id is null;

-- ── ingest auth ─────────────────────────────────────────────────────────────
create table if not exists public.tokentracker_device_tokens (
    token_hash  text        primary key,
    user_id     uuid        not null references auth.users (id) on delete cascade,
    device_id   uuid        not null references public.tokentracker_devices (id) on delete cascade,
    created_at  timestamptz not null default now(),
    revoked_at  timestamptz
);
create index if not exists tokentracker_device_tokens_device_idx
    on public.tokentracker_device_tokens (device_id);
-- The upstream table also carries a surrogate id (20260719152022 selects t.id),
-- so add it for anyone whose revision of this file predates that discovery.
alter table public.tokentracker_device_tokens
    add column if not exists id uuid default gen_random_uuid();

-- ── device login flow ───────────────────────────────────────────────────────
create table if not exists public.tokentracker_device_codes (
    device_code text        primary key,
    user_code   text        not null,
    client_info text,
    machine_id  text,
    status      text        not null default 'pending',
    user_id     uuid        references auth.users (id) on delete set null,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    approved_at timestamptz
);
create index if not exists tokentracker_device_codes_user_code_idx
    on public.tokentracker_device_codes (user_code);

-- ── per-user profile / settings ─────────────────────────────────────────────
create table if not exists public.tokentracker_user_profiles (
    user_id      uuid        primary key references auth.users (id) on delete cascade,
    display_name text,
    avatar_url   text,
    updated_at   timestamptz not null default now()
);

create table if not exists public.tokentracker_user_settings (
    user_id                 uuid        primary key references auth.users (id) on delete cascade,
    display_name            text,
    avatar_url              text,
    github_url              text,
    show_github_url         boolean     not null default true,
    leaderboard_public      boolean     not null default false,
    leaderboard_anonymous   boolean     not null default false,
    token_hash              text,
    updated_at              timestamptz not null default now(),
    revoked_at              timestamptz
);

create table if not exists public.tokentracker_public_views (
    user_id      uuid        primary key references auth.users (id) on delete cascade,
    display_name text,
    token_hash   text,
    updated_at   timestamptz not null default now(),
    revoked_at   timestamptz
);

-- ── device skill inventory ──────────────────────────────────────────────────
create table if not exists public.tokentracker_device_skill_inventories (
    id          uuid        primary key default gen_random_uuid(),
    user_id     uuid        not null references auth.users (id) on delete cascade,
    device_id   uuid        not null,
    device_name text,
    platform    text,
    skills      jsonb       not null default '[]'::jsonb,
    scanned_at  timestamptz not null default now(),
    created_at  timestamptz not null default now(),
    revoked_at  timestamptz
);

-- ── leaderboard ─────────────────────────────────────────────────────────────
create table if not exists public.tokentracker_leaderboard_snapshots (
    id                      uuid        primary key default gen_random_uuid(),
    user_id                 uuid        not null references auth.users (id) on delete cascade,
    period                  text        not null,
    rank                    integer,
    total_tokens            bigint      not null default 0,
    estimated_cost_usd      numeric     not null default 0,
    gpt_tokens              bigint      not null default 0,
    claude_tokens           bigint      not null default 0,
    gemini_tokens           bigint      not null default 0,
    cursor_tokens           bigint      not null default 0,
    hermes_tokens           bigint      not null default 0,
    copilot_tokens          bigint      not null default 0,
    display_name            text,
    avatar_url              text,
    github_url              text,
    show_github_url         boolean     not null default false,
    leaderboard_anonymous   boolean     not null default false,
    is_public               boolean     not null default false,
    from_day                date,
    to_day                  date,
    generated_at            timestamptz not null default now(),
    unique (user_id, period)
);
create index if not exists tokentracker_leaderboard_snapshots_rank_idx
    on public.tokentracker_leaderboard_snapshots (period, rank);

create table if not exists public.tokentracker_leaderboard_anomaly_flags (
    id                          uuid        primary key default gen_random_uuid(),
    user_id                     uuid        not null references auth.users (id) on delete cascade,
    period                      text,
    from_day                    date,
    peak_tokens                 bigint,
    status                      text        not null default 'observed',
    detected_at                 timestamptz not null default now(),
    last_completed_at           timestamptz,
    last_queue_changed_at       timestamptz,
    last_response_completed_at  timestamptz,
    unique (user_id, period)
);

-- Key/value thresholds, read as
--   max(value) FILTER (WHERE key = 'exclude_peak_hard')
-- by scripts/audit/leaderboard-ban-review.sql, and updated in place by
-- 20260825063000_bound-anticheat-detector-window.sql (which RAISEs if the
-- lookback_days row is missing, so it has to be seeded here).
-- An earlier revision of THIS file created the wrong shape (id/config jsonb).
-- Drop it so re-running converges; it only ever held the seeded row.
do $gap$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tokentracker_anticheat_config'
      and column_name = 'id'
  ) then
    drop table public.tokentracker_anticheat_config;
  end if;
end
$gap$;

create table if not exists public.tokentracker_anticheat_config (
    key    text    primary key,
    value  numeric not null
);
insert into public.tokentracker_anticheat_config (key, value) values
    ('lookback_days',       1),
    ('exclude_cohort_ratio', 0),
    ('exclude_peak_hard',   0),
    ('exclude_peak_soft',   0),
    ('exclude_ratio',       0),
    ('review_peak',         0)
on conflict (key) do nothing;

-- One row per (target_user_id, liker_id) — see tokentracker-profile-likes.ts.
create table if not exists public.tokentracker_profile_likes (
    target_user_id uuid        not null references auth.users (id) on delete cascade,
    liker_id       uuid        not null references auth.users (id) on delete cascade,
    created_at     timestamptz not null default now(),
    primary key (target_user_id, liker_id)
);

-- Device -> machine-cluster mapping. Several leaderboard RPCs join it to collapse
-- one physical machine that drifted across device_ids (issue #187) onto a single
-- identity:  LEFT JOIN tokentracker_device_machine dm ON dm.device_id = h.device_id
create table if not exists public.tokentracker_device_machine (
    device_id          uuid primary key,
    machine_cluster_id text not null,
    updated_at         timestamptz not null default now()
);

-- Quarantine side of the ban flow (rows moved out of tokentracker_hourly).
create table if not exists public.tokentracker_hourly_quarantine (
    like public.tokentracker_hourly including defaults
);

-- ── columns the delta migrations add to the reconstructed bases ──────────────
-- (kept here so this file alone produces a schema the whole migration chain
--  applies cleanly against, without depending on which deltas already ran)
alter table public.tokentracker_leaderboard_anomaly_flags
    add column if not exists reviewed_at timestamptz;
alter table public.tokentracker_leaderboard_anomaly_flags
    add column if not exists cohort_ratio numeric;
alter table public.tokentracker_leaderboard_anomaly_flags
    add column if not exists peak_source text;
alter table public.tokentracker_leaderboard_anomaly_flags
    add column if not exists peak_model text;
alter table public.tokentracker_leaderboard_anomaly_flags
    add column if not exists note text;

-- Anonymous install heartbeat, written through
-- upsert_tokentracker_telemetry_daily(machine_hash, day, app_version, platform,
-- shell, seen_at) and read by the community-insights rollups.
create table if not exists public.tokentracker_telemetry_daily (
    machine_hash  text        not null,
    day           date        not null,
    app_version   text,
    platform      text,
    shell         text,
    first_seen_at timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    primary key (machine_hash, day)
);
alter table public.tokentracker_hourly
    add column if not exists pricing_tier text;
alter table public.tokentracker_leaderboard_rollup_daily_v2
    add column if not exists pricing_tier text not null default 'peak';
