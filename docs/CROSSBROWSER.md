# Firefox and WebKit

OPS #6, 2026-10-08. Every other browser check drives Chromium over the
DevTools protocol (tests/lib/page.js). Firefox dropped that protocol and
WebKit never had it, so `scripts/xbrowser-check.js` drives all three
engines through Playwright (`playwright`, a dev dependency, Apache-2.0)
over the same four steps:

1. **boot**: index.html reaches a ready shell (`__shellReady`), and which
   WebGL the engine gives,
2. **menus**: ArrowRight moves the title's cursor, Enter on Flight Club opens
   the hub, Escape returns to the gate,
3. **flight**: Fly starts a flight, frames are drawn, and a craft lifted
   40 m falls a metre (sim.wasm stepping),
4. **rooms**: two pages make and join a private room on a local rooms
   server and each sees the other.

```sh
npx playwright install firefox webkit      # once; Linux also needs `npx playwright install-deps`
npm run xbrowser:check                     # firefox and webkit
npm run xbrowser:check -- chromium firefox # chromium is the control: this machine's Chrome
```

## Where it runs

Not in checks.yml: the engines boot on a runner with no GPU, so each
takes minutes, and checks.yml already takes 30 to 55. The workflow
`.github/workflows/crossbrowser.yml` runs Firefox and WebKit as two jobs
nightly (07:30 UTC, 04:30 in Asuncion), by hand (Actions, crossbrowser,
Run workflow), and on any pull request that changes the check or the
workflow. A red run names the engine and the step.

## What is broken where (2026-10-08)

| Engine | boot | menus | flight | rooms | Notes |
| --- | --- | --- | --- | --- | --- |
| Chromium 151 (control, this machine's GPU) | pass, 15 s | pass | pass, 39 fps | pass | |
| Firefox 157 (headless, this machine) | pass, 16 s, WebGL 2 | pass | pass, **1.6 fps** | pass | headless Firefox draws in software here; the sim steps per frame, so it runs slow, not wrong |
| WebKit (Playwright build) | not run here | | | | this machine lacks libavif16 and libmanette-0.2-0 (a sudo install); see the CI run in the pull request |

Nothing found broken in Firefox's behaviour. The frame rate is the
headless software renderer, not the game: the same machine's Chromium on
SwiftShader is in the same range. Whether a real Firefox with a GPU is
smooth is a "fly it" question for a person.

Errors seen in every engine, environment only: the page asks for a board
at 127.0.0.1:3180 that the check does not start (connection refused).
