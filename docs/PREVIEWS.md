# A flyable preview of every pull request

Foundations item 2, 2026-10-08. The owner should be able to fly a pull
request before it merges, without waiting for main to deploy it.

## Where it lives

GitHub Pages publishes one site per repository: `actions/deploy-pages`
replaces the whole site, so a pull request cannot add `/preview/pr-N/` without
redeploying production, and a path on the game's own origin would share the
game's storage and servers. So previews go to Cloudflare Pages (free: 20,000
files and 25 MiB per file; the staged site is about 2,700 files, 75 MB, the
largest under 20 MB), project `fdfpv-preview`, one branch alias per pull
request:

    https://pr-<n>.fdfpv-preview.pages.dev/

`.github/workflows/preview.yml` runs on every push to a pull request from this
repository (forks get no secrets and are skipped). It stages the merge of the
pull request into main with `scripts/stage-site.sh`, the same script
`pages.yml` now stages main with, stamps it with the head commit (so the
new-version bar works on a preview too), publishes it with
`wrangler pages deploy`, and edits one comment on the pull request with the
link (`scripts/preview-comment.js`).

## What a preview talks to: nothing (solo only)

A preview runs a build nobody merged, so it must not reach real data.

- Rooms: the page asks no rooms server off `SITE_HOSTS` (src/share/rooms.js),
  and the rooms server refuses any other origin (edge/rooms/front.js).
- Tracks and accounts: the tracks server answers every origin, so the page
  itself asks it nothing off `SITE_HOSTS` (src/share/cloud.js). No accounts
  means no sign-in gate: the owner flies straight away, and a build with
  changed account code never writes a real account.
- Board: off `SITE_HOSTS` the page has no board (src/share/board.js), so no
  preview lap reaches the real leaderboard.

Settings and progress on a preview live in that host's own storage. The
`?rooms=`, `?tracks=` and `?board=` overrides still outrank all of this, for
a developer pointing a preview at a local stack on purpose.

## Setup (the lead or the owner, once)

1. Cloudflare dashboard, the account that holds the old fdfretes workers:
   create an API token with "Cloudflare Pages: Edit" only.
2. Create the project once, from any machine logged in to that account:
   `npx wrangler@4 pages project create fdfpv-preview --production-branch main`.
3. Repository secrets: `CLOUDFLARE_API_TOKEN` (the token) and
   `CLOUDFLARE_ACCOUNT_ID` (the account id).

Until the secrets exist the job stages and stamps (so the staging stays
proven) and warns that there is nowhere to publish.

## Not done

Old previews are not deleted when a pull request closes. Free plans keep
unlimited preview deployments, so nothing costs anything; add a cleanup when
the list gets in the way.

## Checks

- `npm run domain:selftest` (CI): on a preview host, no rooms, tracks,
  accounts or board, and the rooms server refuses the preview origin.
- `npm run preview:check` (CI): the staged, stamped site boots from a host
  that is not the game's, offers no sign-in, and sends no request to the API.
