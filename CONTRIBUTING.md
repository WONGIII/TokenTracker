# Contributing

This is a personal fork of [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker).
It follows upstream's shape but carries its own backend, its own identity — `ttzzh://`,
port **17890**, `TokenTrackerZzH`, its own AppData folder — and a set of fixes upstream
does not have. Issues and pull requests are welcome here; if what you are fixing is not
fork-specific, it is worth sending upstream as well.

## Setup

```bash
git clone https://github.com/WONGIII/TokenTrackerZzH.git
cd TokenTrackerZzH
npm install
cd dashboard && npm install && npm run build && cd ..
```

Node 20 or newer. The dashboard build is not optional: the CLI serves `dashboard/dist`,
so without it `serve` has nothing to hand the browser.

## Running it

```bash
node bin/tracker.js            # local dashboard on http://localhost:17890
node bin/tracker.js sync       # parse logs into the queue
node bin/tracker.js status     # per-provider hook status
node bin/tracker.js doctor     # health check
```

Port 17890 rather than upstream's 7680, so the two can run side by side.

## Tests

```bash
npm test                                   # the full suite (node --test)
node --test test/rollout-parser.test.js    # one file
npm run ci:local                           # everything CI runs, dashboard build included
```

The validators are part of CI and are cheap to run on their own:

```bash
npm run validate:copy          # every user-facing string lives in the copy registry
npm run validate:locale        # zh / zh-TW coverage of those strings
npm run validate:ui-hardcode   # no hardcoded colours or text in the dashboard
npm run validate:guardrails    # architecture rules
npm run validate:versions      # every managed version file agrees
```

`test/fork-identity.test.js` is what keeps this repository a fork: no upstream backend URL,
no upstream anon key, no PostHog key, no `tokentracker://` scheme, and the Windows app
keeping its own AppData folder. **Do not weaken it.** If a change makes it fail, the change
is wrong.

## Changing the database

Schema and data fixes go in `migrations/`, one timestamped file per change, written to be
idempotent — `if not exists`, `add column if not exists`, guarded `do` blocks — because
they are applied to databases that already hold data. Two things that will bite:

- **PostgREST caches the schema.** After adding a column or a table, send
  `notify pgrst, 'reload schema'`, or every write fails with *column ... in the schema cache*.
- **Privileges are not part of the table.** A new object needs its grants, or the service
  client cannot touch it.

## Changing a cloud function

`dashboard/edge-patches/*.ts` is the source. The runtime does not take ES modules: the
functions are transpiled into its contract (`new Function(...)`, `module.exports = handler`),
and a deployed row must be `status = 'active'` in `functions.definitions` — a row marked
`deployed` answers 404 to every call.

## Adding an AI tool

The most common contribution. Roughly:

1. A parser in `src/lib/rollout.js` that normalises the tool's logs into the queue row
   (`hour_start`, `source`, `model`, the five token columns, `total_tokens`,
   `conversation_count`), with dedup keyed the way that tool identifies a message.
2. A hook installer in `src/commands/init.js` and its removal in `uninstall.js`.
3. A line in `src/commands/status.js` so users can see whether it is capturing.
4. A test with a fixture that proves the dedup, not just the happy path.

Token counts must stay disjoint: `input_tokens` excludes cache reads and writes, and cost
is computed from the five columns — never from `total_tokens`. Getting this wrong inflates
cost several-fold, and it is the single easiest mistake to make here.

## Pull requests

- [ ] `npm test` passes
- [ ] New user-facing strings are in `dashboard/src/content/copy.csv`, with zh and zh-TW
- [ ] Database changes are a migration rather than a one-off SQL run
- [ ] Conventional commit subjects: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`,
      `ci:`, `test:`
- [ ] The description says why, not only what

Anything under `src/` or `dashboard/` reaches users only through a release, because both
are bundled into the desktop apps. Bumping the version and dispatching
`release (macOS + Windows + Linux)` is documented in `CLAUDE.md`.

## Security

See [`SECURITY.md`](./SECURITY.md). Never open a public issue for a security report, and
never paste a key into a pull request.
