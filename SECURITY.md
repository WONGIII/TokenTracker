# Security Policy

## Supported versions

Only the latest release receives security fixes. This is a personal fork maintained by
one person, so please confirm you are on a current build before reporting.

## Reporting a vulnerability

**Please do not open a public issue for a security report.**

Private channels:

- **GitHub private vulnerability reporting** —
  [Report a vulnerability](https://github.com/WONGIII/TokenTrackerZzH/security/advisories/new)
- **Email** — `tokentracker-zzh@977744.xyz`

Please include what the issue is, how to reproduce it, the version or commit you tested,
your assessment of the impact, and a suggested fix if you have one.

Expect a first reply within a few days. This is a one-person project: a fix ships in the
next release, and the report is credited in its notes unless you ask otherwise.

## What this project is, security-wise

TokenTracker is local-first. The CLI reads AI-tool logs from your home directory, keeps
token counts in `~/.tokentracker/tracker`, and serves a dashboard on loopback. Everything
cloud is opt-in: no account, no sync, and nothing leaves the machine unless you sign in
and let it.

The parts worth attacking:

- **`src/lib/rollout.js`** — parses logs written by other tools. The rule is token counts
  and timestamps only; prompts, responses, file contents and tool arguments must never be
  retained, queued or uploaded. A parser that keeps message text is a security bug, not a
  feature request.
- **`src/lib/local-api.js`** — the local HTTP server. It binds `127.0.0.1:17890` and must
  never accept a connection from another host. It also serves `GET /api/avatar-proxy`,
  which fetches an image URL the user supplied; the private-address guard beside it is the
  reason that endpoint is safe, and a way around the guard is a reportable SSRF.
- **`src/lib/*-hook.js`, `init.js`, `uninstall.js`** — write into other tools'
  configuration. Anything that reads, overwrites or deletes files outside the paths it
  documents is a bug.
- **`dashboard/edge-patches/`** — the cloud functions this fork deploys. They run with a
  service-role database client, so an authorisation mistake there exposes every account on
  the deployment. Ownership checks, "may this caller see this row", and anything that
  trusts a client-supplied `user_id` belong in this bucket.
- **The desktop shells** (`TokenTrackerWin/`, `TokenTrackerBar/`, `TokenTrackerLinux/`)
  bundle a Node runtime and start a local server. They must keep it on loopback and must
  not widen what their webview can reach.

## Keys, and what is allowed to be public

- The **anon key** in `src/lib/runtime-config.js` is public by design: it ships in every
  build and only names the project. Finding it is not a vulnerability.
- The **service-role key**, the database password, the SMTP password and the leaderboard
  refresh secret must never appear in this repository, in a client bundle, or in a release
  artifact. If you find one, that is a critical report — say where, not what.
- The default backend URL points at this fork's own deployment. Sending data to it is a
  deliberate opt-in, and the ingest contract is documented in the README.

## Privacy

The foundational rule is unchanged: **token counts and timestamps, never prompt or
response content.** Two values this fork added are stored in the cloud, and they are worth
knowing about:

- **Avatar URL** — the image link you paste in Settings, stored with your profile and shown
  publicly while that profile is public.
- **Display name and GitHub handle** — same, and required for the leaderboard.

Both are opt-in (the profile has to be public), both are visible to anyone reading the
leaderboard, and both can be cleared from Settings at any time.

## Out of scope

- Anything that only reproduces after hand-editing files outside the documented data paths
- Already-disclosed dependency vulnerabilities — report those to the dependency
- Social engineering and other non-technical vectors
- Findings against the upstream project rather than this fork
