# Golden checks: record what the scenario is about

Foundations item 4, 2026-10-09. The ask: split the giant goldens
(actions, uirest, settings, session and the like) into per-feature files,
because they were touched by most pull requests and caused most red mains
on 2026-10-08.

## What the history says

For the last re-recording commits of each golden on main (2026-10-04 to
10-08), how many scenarios each commit changed, and whether they were the
feature's own:

| golden | changed per commit | what changed |
|---|---|---|
| actions | 59 to 88 of 184 scenario groups (2,050 of 7,749 steps for one new setting) | `store.webfpv.settings.v3`: a hash of the whole stored settings, in every step that saved settings |
| settings | up to 1,700 of 1,749 records | every `hashed` record hashes a whole settings object |
| session | 2 of 42, always `constructor` | the Ui's whole settings object in every constructor case |
| dialogs | 6 of 30, always yawTip, bugForm, feelOffer | the whole stored settings JSON |
| items | 4 to 52 of 226 | the feature's own rows (a Spanish pass touched every Spanish row) |
| uirest | 2 to 4 of 14, `drawn` and `craft` | the kit and aircraft lists, which the feature changed |

So the failure was not two pull requests editing the same file: these
records are one line per scenario or indented JSON, and git merges disjoint
lines on its own. It was semantic. Pull request A adds a setting and
re-records every hash; pull request B adds another and re-records them
again; each is green alone, and main, holding both settings, matches
neither record. Splitting the files would have changed nothing: the same
records would conflict, in more files.

## The fix: a record holds only what its scenario is about

- A settings object is recorded as its difference from `DEFAULTS`
  (`tests/lib/golden-settings.js`: `settingsDelta`, `storeView`).
  `DEFAULTS` + the record is the whole object, so nothing is lost, and
  `DEFAULTS` themselves are held by settings:golden's `constants` record.
  Used by session:golden (the Ui's settings, the store) and dialogs:golden
  (the store).
- actions:golden records a stored JSON object field by field, so a step's
  `changed` names the fields it wrote, plus `(removed)` for a field a step
  deleted (the old hash showed a deleted track only as a new hash).

Proof, with one test setting added to `DEFAULTS`: actions, session,
dialogs, uirest and items are identical; before this change actions showed
2,050 differing steps, session and dialogs their 8 scenarios.

Migration proof (one-shot scripts, output in the pull request): every
re-recorded scenario equals the old one with only the settings
representation changed; for session, all 126 settings objects round-trip
to the old object exactly.

## Not done here, deliberately

- settings:golden still hashes whole objects; adding a setting rewrites it.
  It is the check whose subject is the settings, so it is the one place a
  new setting should show, but it should show in the records about that
  setting only. Its own pull request, next.
- items and uirest churn with their features (a new kit is in the kit
  list). That is the record doing its job.
- No file split: see above.

## The rule (also in wave34/BRIEF.md)

A golden records what its scenario is about. Re-record only the scenarios
your change is about; a re-record that touches another feature's scenario
needs a sentence in the pull request saying why, or a fix to the golden so
it stops recording global state.
