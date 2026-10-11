# Security headers

OPS #4, 2026-10-08. What the browser is told about each page and answer,
where it is set, and how it was proven not to break anything.

## Two places, two mechanisms

**The game's pages (GitHub Pages).** Pages sends no header a site chooses.
The only control is a `<meta http-equiv="Content-Security-Policy">`, which
the Pages workflow writes into the pages pilots open (`scripts/csp.js`,
after `scripts/stamp-version.js`): index.html, landing.html, admin.html,
privacy.html, terms.html, src/share/orbit.html and vids/index.html.
Developer pages (dev/, tools/, tests/, the track builder's page) are left
as they are.

What Pages therefore cannot have, and does not:

- `frame-ancestors`: a meta policy ignores it, so the game can be framed by
  another site. Only a header stops that; Pages has no way to send one.
- Report-Only, `report-uri`, `report-to`: header only. Violations were
  collected before enforcing by sending the same policy as a
  `Content-Security-Policy-Report-Only` header from the checks' own server
  (below).
- `Referrer-Policy`: a `<meta name="referrer">` exists, but the default
  (`strict-origin-when-cross-origin`) is already what we want, so nothing is
  added.
- `X-Content-Type-Options`, `Permissions-Policy`, `Strict-Transport-Security`:
  header only. `curl -I` on the live site on 2026-10-08 shows Pages sends
  none of them (only `Server: GitHub.com`). The microphone (voice chat) and
  the gamepad stay allowed by default, which the game needs.
- To have every header on the game itself, the site would need a front
  that sets headers (Caddy on the VM, or a CDN in front of Pages). That is
  a hosting decision, not done here.

**The VM (Caddy, `deploy/vm/Caddyfile`).** Every answer from the tracks
server, the rooms server, the films and the board carries:

| Header | Value | Why |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | every answer is typed (JSON, GIF, MP4, the board's JS, HTML, images) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | the browser default, made explicit |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb off | nothing served from the VM uses them; the game's own page (Pages) is not affected |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | the APIs answer data, never a page; nothing may frame them |
| `Content-Security-Policy` on `/board/*` | its own: self only, inline style, data:/blob: images, `frame-ancestors 'none'` | the board's pages and admin are pages; no inline script, every request to its own origin |
| `Server` | removed | |

## The game's policy

`scripts/csp.js` `pagePolicy`. Each source and the code that needs it:

| Directive | Sources | Needed by |
| --- | --- | --- |
| `script-src` | `'self'`, `'wasm-unsafe-eval'`, cdn.jsdelivr.net, accounts.google.com/gsi/, a sha256 per inline script | the modules; `WebAssembly.compile` of sim.wasm; three.js and the muxers; Google sign in; the stamped import map and the pages' inline module scripts |
| `style-src` | `'self'`, `'unsafe-inline'`, accounts.google.com/gsi/ | the shell's inline `<style>` and style attributes in markup (a style cannot run code); Google's button |
| `img-src` | `'self'`, data:, blob:, the API, fdflabs.github.io, *.googleusercontent.com | canvases turned into pictures, the gallery, Yellowstone tiles, Google avatars |
| `media-src` | `'self'`, data:, blob:, the API | music, voice lines, clips, the films on the VM |
| `connect-src` | `'self'`, data:, blob:, the API over https and wss, cdn.jsdelivr.net, fdflabs.github.io, accounts.google.com/gsi/ | tracks, rooms, the board, the tiles, sign in |
| `worker-src` | `'self'`, blob: | |
| `frame-src` | `'self'`, accounts.google.com/gsi/ | the orbit preview iframe, Google's sign in frame |
| `object-src`, `base-uri`, `form-action` | none, self, self | |

WebRTC (voice chat, the TURN relay) is not governed by CSP.

## How it was proven

Run on 2026-10-08 and 09 through ~/.cache/run-check-slot.sh:

| Run | Result |
| --- | --- |
| `csp:selftest` | 30 passed |
| `csp:report` | gallery 17/17, gallery admin 9/9, rooms two page 15/15, voice chat 24/24, landing, privacy, terms, films: 0 violations |
| `csp:enforce` | the control (an injected inline script) refused and reported; the same checks all green; a stamped copy with the deployed meta boots and flies; 0 violations |
| `caddy:headers report` | 22 passed; it first caught a real fault in the Caddyfile (below) |
| `caddy:headers enforce` | 23 passed: every header on /api, /v2, /vids, /board, /board/api; CORS; a WebSocket through Caddy; the board's two pages draw with no violation and the injected control is reported; the board's admin signs in; rooms two page through Caddy with the game's policy on, no violation |

The fault the report run caught: Caddy applies a `header` block that
deletes a field (`-Server`) as the answer is written, after the board's
own `header`, so the APIs' `default-src 'none'` replaced the board's
policy and would have blanked the board. The APIs' policy is now a
default (`?Content-Security-Policy`) that a policy already set keeps.

In the enforce run with the deployed meta, the one refused request was
the page reaching for a board on 127.0.0.1, which only exists in the
check; the deployed policy names the API origin, where the board lives.

- `npm run csp:selftest` (CI): on a stamped copy, each page has one policy
  right after its charset, every inline script and no other is allowed by
  hash, no loopback source, nothing a meta cannot carry.
- `npm run csp:report`, then `npm run csp:enforce` (local, browser): the
  test server sends the policy as a header (`SIM_CSP`, tests/lib/server.js;
  loopback stands in for the API), and the gallery, its admin, two pilots in
  a room flying, voice chat between them, and the static pages run under it.
  Every violation is a `csp-violation:` line.
- `npm run caddy:headers -- report|enforce` (local; `CADDY`, `FDFPV_BOARD`):
  the VM's Caddyfile in front of the real tracks, rooms and board servers on
  loopback; every header on every route, a WebSocket through it, the
  board's pages in Chromium with no violation, and the rooms two page check
  through Caddy with the game's own policy on.
