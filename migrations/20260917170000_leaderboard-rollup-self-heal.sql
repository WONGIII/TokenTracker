-- Self-healing leaderboard rollup.
--
-- The incremental advance only moves the watermark forward, so usage that arrives after
-- it has passed is never aggregated. A new user's back-history is exactly that case —
-- their first sync uploads months of rows whose dates are already below the watermark —
-- and their leaderboard entry read 0 until the rollup was rebuilt by hand. This function
-- detects the condition and rebuilds the whole range in one go.
--
-- It runs from tokentracker-leaderboard-refresh (every fifteen minutes, before the
-- advance), so a fresh account appears with its full history on the next tick. The
-- detection is a single aggregate over the rollup against the source table, and the
-- rebuild no-ops when they agree.
--
-- NOTE: after applying this, notify PostgREST of the schema change or the edge function's
-- rpc() call fails with a cache miss — and a swallowed error there looks identical to
-- "nothing to repair". That is how this was first deployed and it hid the failure.

create or replace function public.leaderboard_rollup_repair_if_needed()
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_missing bigint;
begin
    -- Pre-today usage the rollup does not account for. The rollup must hold every
    -- complete day, so any shortfall means rows arrived below the watermark.
    select count(*) into v_missing
      from (
        select h.user_id,
               sum(h.total_tokens) as hourly_tokens,
               coalesce((select sum(r.total_tokens)
                           from public.tokentracker_leaderboard_rollup_daily_v2 r
                          where r.user_id = h.user_id), 0) as rolled_tokens
          from public.tokentracker_hourly h
         where h.hour_start < date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         group by h.user_id
      ) gap
     where gap.hourly_tokens > gap.rolled_tokens + 1;

    if v_missing = 0 then
        return false;
    end if;

    perform public.leaderboard_rollup_daily_replace_v3('2020-01-01'::timestamptz, now());
    -- today belongs to the live tail, never to the rollup
    delete from public.tokentracker_leaderboard_rollup_daily_v2 where day >= current_date;
    delete from public.tokentracker_leaderboard_rollup_total_v2;
    insert into public.tokentracker_leaderboard_rollup_total_v2 (
        user_id, source, model, pricing_tier, total_tokens, input_tokens, output_tokens,
        cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
    )
    select user_id, source, model, pricing_tier, sum(total_tokens), sum(input_tokens),
           sum(output_tokens), sum(cached_input_tokens), sum(cache_creation_input_tokens),
           sum(reasoning_output_tokens)
      from public.tokentracker_leaderboard_rollup_daily_v2 group by 1, 2, 3, 4;
    update public.tokentracker_leaderboard_rollup_meta_v2
       set through = date_trunc('day', now() at time zone 'utc') at time zone 'utc',
           rebuilt_at = now()
     where id = 1;
    return true;
end
$fn$;

notify pgrst, 'reload schema';
