# Modifications

This repository is a modified copy of [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker),
distributed under the MIT License. The original `LICENSE` (Copyright (c) 2026 xiufengsun) is kept
verbatim; nothing here is endorsed by or contributed back to the upstream project.

Changes relative to upstream, all on top of upstream commit `5be67a4f3d8ec34fc328e42c259fc347d2865443`:

1. **DeepSeek V4.1 Flash pricing** — `src/lib/pricing/curated-overrides.json`
   adds `deepseek-v4.1-flash`, `deepseek-v4.1-flash-expires-on-0910`, `deepseek-flash`,
   `deepseek/deepseek-v4.1-flash` and `cmc/deepseek/deepseek-v4.1-flash` at the
   `deepseek-v4-flash` peak rates ($0.44 / $1.32 / $0.014 / $0.44 per MTok), plus a
   `fuzzy` rule so a rotated `deepseek-v4.1-flash-expires-on-<MMDD>` suffix keeps pricing.
   Upstream/LiteLLM carry none of these ids, so the rows previously priced at $0.

2. **Time-of-use for the new ids** — `src/lib/pricing/index.js`
   `DEEPSEEK_TIME_PRICED_MODELS` gains `deepseek-v4.1-flash` and `deepseek-flash`. The list is
   substring-matched, and neither id contains `deepseek-v4-flash`, so without these entries the
   new ids paid the peak rate around the clock (2x the real off-peak cost).

3. **Cloud pricing parity** — the two matcher lines and the off-peak gate were added to the
   canonical `dashboard/edge-patches/tokentracker-leaderboard-refresh.ts` block and copied
   verbatim into the other four edge files, keeping
   `test/edge-pricing-parity.test.js` green.

4. **Per-row pricing in the local model breakdown** — `src/lib/local-api.js`
   `usage-model-breakdown` used to sum a model's tokens and then price the aggregate. The
   aggregate has no `hour_start`, so `isDeepSeekOffPeak()` returned false and every DeepSeek
   row was billed at the peak rate: the detail modal read ~1.73x the dashboard headline for the
   same range. It now prices each row (mirroring `aggregateByDay()` and the cloud
   `account-model-breakdown` edge, which were already correct).

Sizes, endpoints and behaviours not listed above are unchanged from upstream.
