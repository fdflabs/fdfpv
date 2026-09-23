# Fixed wing: progress ledger

The stage list is in `docs/WING-PLAN.md`. This file is the state of play,
and the first thing to read when picking the work up: one row per stage,
the commit that closed it, and the check output that proved it. A stage
is DONE only when its check ran green in the same session that wrote it.

## How to resume, unattended

1. Read this file. The first stage not DONE is the current one.
2. Read `docs/WING-STAGE1.md` for the aircraft and the conventions.
3. Run `npm run verify` once at the start of a session that touches
   `src/native`, and after any change there. The quad's hash in check 2
   must not move; if it does, stop and find out why before anything else.
4. Every stage ends with its check green, one commit, a row here, a push.
5. A band is never widened to pass. Ten failed iterations on a stage is
   a finding: write it here under the stage and stop.

## Stages

| Stage | Status | Commit | Evidence |
| --- | --- | --- | --- |
| 0 Derivation | DONE | see git log | docs/WING-STAGE1.md: every number has a formula and a source, bands derived by the script at its end |
| 1 Deterministic maths | DONE | see git log | wing:math 9 of 9, 641,601 grid points within 1e-12 of the host; verify 16 of 16, quad hash de0401cd4266 unmoved |
| 2 Wing plant | pending | | |
| 3 Wing gates | pending | | |
| 4 Shell and input | pending | | |
| 5 Rendering and sound | pending | | |
| 6 Collision | pending | | |
| 7 Wing track class | pending | | |
| 8 Airfield | pending | | |
| 9 End to end, headless | pending | | |
| 10 Wiring and docs | pending | | |
| 11 Handover | pending | | |

## Findings

Nothing yet.
