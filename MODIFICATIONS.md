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

5. **Update checks and release links point at this fork** — `TokenTrackerWin/UpdateChecker.cs`
   (repo slug), `TokenTrackerWin/Constants.cs`, `TokenTrackerBar/.../UpdateChecker.swift`
   (repo + release URL), the macOS GitHub links in `DynamicIslandView.swift` /
   `NativeBridge.swift` / `StatusBarController.swift`, `dashboard/src/lib/config.ts`
   (`REPO_URL`, plus the `RELEASES_URL` / `MAC_DMG_URL` / `WIN_SETUP_URL` /
   `PRIVACY_URL` derived from it) and the `package.json` repository metadata all resolve
   to `WONGIII/TokenTracker`. Upstream's README, docs, landing page
   (`dashboard/index.html`), Homebrew instructions and `LICENSE` are untouched, so
   attribution is preserved. This fork publishes no releases, so the updater now reports
   "up to date" instead of offering an upstream build.

6. **Default desktop pet: ZzH, and a pink pet page** — `dashboard/public/pets/zzh/`
   carries `spritesheet.webp` + `pet.json` copied from the author's local pet package.
   It is a **v2 atlas** (1536x2288 = 192x208 frames, 8 columns x 11 rows), which is what
   enables the 16-way look direction. `zzh` joined `PET_CHARACTER_IDS`
   (`dashboard/src/lib/pet-personality.js`), `BUILTIN_PETS`
   (`dashboard/src/lib/pets-api.js`) and `BUILTIN_IDS` (`src/lib/pet-packages.js`), so
   the id is reserved and cannot be shadowed by an imported package. It carries no
   `nameKey` — "ZzH" is a proper noun and ships as a literal, so no copy-registry or
   locale entry is needed. Defaults resolve to `zzh` when nothing is stored:
   `DEFAULTS.character` (`dashboard/src/hooks/use-pet-settings.js`), the `PetPage`
   fallbacks and `PetWindow.CurrentCharacter` on Windows; invalid or unsafe ids still
   sanitize to `clawd`. The Windows tray gained a `ZzH` entry (`TrayStrings.cs` +
   `TrayApplicationContext.cs`) so the pet stays reachable after switching away, and the
   pet preview stage is pink (`bg-pink-100 dark:bg-pink-950/50` in `PetPage.jsx`).
   `test/pet-assets.test.js` was split so the upstream v1 pets keep their web + macOS
   parity assertions while a new test pins zzh's v2 geometry; no macOS sprite ships for
   zzh because this fork only builds Windows/web.

7. **The Windows installer no longer collides with upstream** —
   `TokenTrackerWin/installer/TokenTracker.iss` gets a **new `AppId` GUID** (Inno treats a
   matching AppId as the same product and therefore forces an in-place upgrade over an
   existing upstream install, hiding the folder page in the process), a distinct
   `DefaultDirName` (`%LOCALAPPDATA%\Programs\TokenTrackerZzH`), `DisableDirPage=no` so the
   folder is always choosable, and its own display name `TokenTracker ZzH` for the
   Add/Remove Programs entry and the Start Menu / desktop shortcuts. `Constants.cs`
   `StartupRegistryValueName` moves to `TokenTrackerZzH` so the HKCU Run entry for
   launch-at-startup is not shared with an upstream install either.

8. **OAuth removed from the login UI** — `dashboard/src/components/LoginCard.jsx` drops
   the provider buttons, the `GOOGLE_ICON`/`GITHUB_ICON` artwork, `PROVIDER_ICONS` /
   `PROVIDER_LABELS` / `providerLabel`, the `signInWithOAuth` call, the
   `?native=1&provider=…` auto-trigger effect and the "continue with email" interstitial,
   leaving email + password as the only flow. `getPublicAuthConfig()` is still called, but
   only for `passwordMinLength`; its old fallback that invented a
   `["google","github"]` provider list when the config call failed is gone. The
   self-hosted InsForge this fork talks to has every provider slot empty, so
   `oAuthProviders` would have been empty anyway — and the fallback would have offered
   buttons that could not work.

Sizes, endpoints and behaviours not listed above are unchanged from upstream.
