-- Objects missing from this fork's reconstructed base schema.
--
-- The base schema (00000000000000_base-schema.sql) was rebuilt from the live
-- production database, and a few upstream objects were missed. The visible
-- symptom was that a fresh deployment answered
-- GET /functions/tokentracker-community-models with
--   {"error":"community stats snapshot is not ready"}   (503)
-- and the community builder itself failed with
--   relation "tokentracker_leaderboard_rollup_meta" does not exist
--   function leaderboard_hourly_dedup(timestamptz, timestamptz) does not exist
--
-- Everything here is idempotent so it can be applied to an existing database that
-- already has some of these objects.

-- ── community stats snapshot ────────────────────────────────────────────────
-- One row (id = 'total'), rewritten hourly by
-- refresh_tokentracker_community_stats() (scheduled with pg_cron).
create table if not exists public.tokentracker_community_stats (
    id                      text        primary key,
    total_tokens            bigint      not null,
    top_models              jsonb       not null default '[]'::jsonb,
    from_day                date        not null,
    to_day                  date        not null,
    generated_at            timestamptz not null,
    provider_breakdown      jsonb       not null default '[]'::jsonb,
    daily_growth            jsonb       not null default '[]'::jsonb,
    token_mix               jsonb       not null default '[]'::jsonb,
    user_distribution       jsonb       not null default '[]'::jsonb,
    platform_distribution   jsonb       not null default '[]'::jsonb,
    active_developers_total integer     not null default 0,
    active_developers_30d   integer     not null default 0,
    tokens_30d              bigint      not null default 0,
    token_growth_pct        numeric,
    developer_growth_pct    numeric,
    constraint tokentracker_community_stats_id_check check (id = 'total'),
    constraint tokentracker_community_stats_total_tokens_check check (total_tokens >= 0),
    constraint tokentracker_community_stats_developer_counts_check check (
        active_developers_total >= 0
        and active_developers_30d >= 0
        and active_developers_30d <= active_developers_total
        and tokens_30d >= 0
    )
);

-- ── rollup name alignment ───────────────────────────────────────────────────
-- Every rollup function writes the _v2 tables, but the community builder reads
-- the un-suffixed names. Rather than duplicate the data, expose the _v2 tables
-- under the old names as views; the columns are identical.
create or replace view public.tokentracker_leaderboard_rollup_meta as
    select id, through from public.tokentracker_leaderboard_rollup_meta_v2;

create or replace view public.tokentracker_leaderboard_rollup_daily as
    select user_id, source, model, day,
           total_tokens, input_tokens, output_tokens,
           cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
      from public.tokentracker_leaderboard_rollup_daily_v2;

create or replace view public.tokentracker_leaderboard_rollup_total as
    select * from public.tokentracker_leaderboard_rollup_total_v2;

-- ── hourly dedup helper ─────────────────────────────────────────────────────
-- Used by refresh_tokentracker_community_stats(), which unions it with
-- tokentracker_leaderboard_rollup_daily and then does
-- (d.hour_start AT TIME ZONE 'UTC')::date — so it must return HOUR level rows:
-- one per (user, source, model, hour_start), summed across the devices that
-- reported the same bucket.
create or replace function public.leaderboard_hourly_dedup(
    p_from timestamptz,
    p_to timestamptz
)
returns table (
    user_id                       uuid,
    source                        text,
    model                         text,
    hour_start                    timestamptz,
    total_tokens                  bigint,
    input_tokens                  bigint,
    output_tokens                 bigint,
    cached_input_tokens           bigint,
    cache_creation_input_tokens   bigint,
    reasoning_output_tokens       bigint
)
language sql
stable
security definer
set search_path = public
as $$
    select h.user_id,
           trim(h.source),
           trim(h.model),
           h.hour_start,
           sum(h.total_tokens)::bigint,
           sum(h.input_tokens)::bigint,
           sum(h.output_tokens)::bigint,
           sum(h.cached_input_tokens)::bigint,
           sum(h.cache_creation_input_tokens)::bigint,
           sum(h.reasoning_output_tokens)::bigint
      from public.tokentracker_hourly h
     where h.hour_start >= p_from
       and h.hour_start < p_to
     group by 1, 2, 3, 4;
$$;


-- ── one-time rollup backfill ────────────────────────────────────────────────
-- leaderboard_rollup_daily_advance_v3() folds at most SEVEN days per call — on
-- purpose, so each refresh stays a small transaction. A fresh install (or one
-- whose rollups were cleared) therefore needs ~78 refresh cycles, about 20 hours,
-- before a year of history is fully aggregated; until then every period reports
-- only the fraction that has been folded, which reads as "the leaderboard lost
-- my data". Backfill the whole history once here and the 15-minute advance keeps
-- up with new days afterwards.
--
-- Guarded on an empty daily rollup, so re-running it (or running it against a
-- live database) is a no-op.
do $backfill$
declare
    v_first date;
    v_target date := (now() at time zone 'utc')::date;
begin
    select (date_trunc('day', min(hour_start) at time zone 'utc'))::date
      into v_first
      from public.tokentracker_hourly;

    if v_first is null then
        return;                                    -- nothing tracked yet
    end if;

    if exists (select 1 from public.tokentracker_leaderboard_rollup_daily_v2) then
        return;                                    -- already backfilled
    end if;

    perform public.leaderboard_rollup_daily_replace_v3(
        v_first::timestamp at time zone 'utc',
        now()
    );

    -- The rollups must hold COMPLETE days only: the readers union them with a
    -- live tail that starts at the beginning of today, so a rollup row for today
    -- would count today twice.
    delete from public.tokentracker_leaderboard_rollup_daily_v2 where day >= current_date;

    -- The running total has no day column, so it has to be derived from the
    -- corrected daily rows rather than filtered afterwards.
    delete from public.tokentracker_leaderboard_rollup_total_v2;
    insert into public.tokentracker_leaderboard_rollup_total_v2 (
        user_id, source, model, pricing_tier,
        total_tokens, input_tokens, output_tokens,
        cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
    )
    select user_id, source, model, pricing_tier,
           sum(total_tokens), sum(input_tokens), sum(output_tokens),
           sum(cached_input_tokens), sum(cache_creation_input_tokens), sum(reasoning_output_tokens)
      from public.tokentracker_leaderboard_rollup_daily_v2
     group by 1, 2, 3, 4;

    -- Park the watermark on the start of today: everything before it is rolled
    -- up, and the live tail owns today.
    insert into public.tokentracker_leaderboard_rollup_meta_v2 (id, through, repair_from, rebuilt_at)
    values (1, date_trunc('day', now() at time zone 'utc') at time zone 'utc', v_first, now())
    on conflict (id) do update
        set through = excluded.through,
            rebuilt_at = now();
end
$backfill$;

-- After the backfill the total rollup must agree with the source table for every
-- complete day. A mismatch means the history is still partial.
do $verify$
declare
    v_rolled bigint;
    v_source bigint;
begin
    select coalesce(sum(total_tokens), 0) into v_rolled
      from public.tokentracker_leaderboard_rollup_daily_v2;
    select coalesce(sum(total_tokens), 0) into v_source
      from public.tokentracker_hourly
     where hour_start < current_date;
    if v_rolled <> v_source then
        raise warning 'leaderboard rollups cover % tokens but % are tracked before today', v_rolled, v_source;
    end if;
end
$verify$;
