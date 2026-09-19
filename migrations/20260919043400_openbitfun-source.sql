-- OpenBitFun (github.com/GCWing/OpenBitFun) writes source "openbitfun" into
-- tokentracker_hourly. Without its own snapshot column the leaderboard refresh
-- folded that usage into other_tokens, so a user whose main agent is OpenBitFun
-- saw the generic "Other" column as their biggest provider while the dashboard
-- listed OpenBitFun by name.
--
-- Only public.tokentracker_leaderboard_snapshots carries one column per
-- provider. The v2 rollups (tokentracker_leaderboard_rollup_daily_v2 and
-- tokentracker_leaderboard_rollup_total_v2) are keyed by
-- (user_id, source, model, pricing_tier), so they need no new column: openbitfun
-- rows already aggregate through the source dimension like every other
-- provider, and leaderboard_usage_grouped() reads them from there.
--
-- Mirrors 20260919003400_astrbot-source.sql, and stays idempotent so re-running
-- the file converges on the same schema.

alter table public.tokentracker_leaderboard_snapshots
    add column if not exists openbitfun_tokens bigint not null default 0;

-- PostgREST caches the schema, so a freshly added column stays invisible to the edge
-- functions' queries until it reloads. Applying this file without the notify makes the
-- leaderboard refresh fail with a schema-cache error that looks nothing like a missing
-- migration.
notify pgrst, 'reload schema';

