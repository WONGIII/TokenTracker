-- Achievements never worked in this fork: tokentracker_user_badges stayed empty
-- and the achievements page showed only the three badges the dashboard derives
-- from local data.
--
-- Two gaps from the reconstructed schema:
--
--   1. user_badges_refresh() opens with
--        IF public.leaderboard_refresh_try_claim('badges', 300) IS DISTINCT FROM true
--      and that primitive did not exist, so every refresh aborted before doing any
--      work — nothing was ever awarded.
--   2. Nothing scheduled the refresh even once. No pg_cron job mentioned badges.
--
-- Both are fixed here; the schedule is named, so re-running this migration updates
-- the existing job instead of creating duplicates.

-- ── the claim primitive ─────────────────────────────────────────────────────
create table if not exists public.leaderboard_refresh_claims (
    key        text primary key,
    claimed_at timestamptz not null default now()
);

-- True when the caller may run: nothing has claimed this key, or the previous
-- claim is older than p_seconds. INSERT..ON CONFLICT..WHERE returns a row only when
-- the claim was actually taken, so concurrent callers get false and the refresh is
-- skipped rather than duplicated (it is idempotent; the next tick catches up).
create or replace function public.leaderboard_refresh_try_claim(
    p_key text,
    p_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_claimed boolean;
begin
    insert into public.leaderboard_refresh_claims as c (key, claimed_at)
    values (p_key, now())
    on conflict (key) do update
       set claimed_at = now()
     where c.claimed_at < now() - make_interval(secs => greatest(coalesce(p_seconds, 0), 0))
    returning true into v_claimed;
    return coalesce(v_claimed, false);
end
$fn$;

-- ── award badges hourly ─────────────────────────────────────────────────────
do $cron$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.schedule(
            'refresh-user-badges',
            '23 * * * *',
            'SELECT public.user_badges_refresh()'
        );
    end if;
end
$cron$;

-- ── backfill once ───────────────────────────────────────────────────────────
-- The refresh is idempotent, so this only needs to run when nothing has been
-- awarded yet; it also proves the primitive works.
do $backfill$
begin
    if not exists (select 1 from public.tokentracker_user_badges) then
        perform public.user_badges_refresh();
    end if;
end
$backfill$;
