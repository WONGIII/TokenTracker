-- AstrBot (github.com/AstrBotDevs/AstrBot) writes source "astrbot" into
-- tokentracker_hourly. Without its own snapshot column the leaderboard refresh
-- folded that usage into other_tokens, so a user whose main agent is AstrBot
-- saw the generic "Other" column as their biggest provider while the dashboard
-- listed AstrBot by name.
--
-- Only public.tokentracker_leaderboard_snapshots carries one column per
-- provider. The v2 rollups (tokentracker_leaderboard_rollup_daily_v2 and
-- tokentracker_leaderboard_rollup_total_v2) are keyed by
-- (user_id, source, model, pricing_tier), so they need no new column: astrbot
-- rows already aggregate through the source dimension like every other
-- provider, and leaderboard_usage_grouped() reads them from there.
--
-- Mirrors how deepseek_harness_tokens was added in
-- 00000000000000_base-schema.sql, and stays idempotent so re-running the file
-- converges on the same schema.

alter table public.tokentracker_leaderboard_snapshots
    add column if not exists astrbot_tokens bigint not null default 0;
