# Dependency updates

OPS #5, 2026-10-08. Dependabot opens the update pull requests; CI decides
whether they are safe; the lead merges them like any other pull request.

## What is watched

`.github/dependabot.yml`, in this repository and in fdflabs/fdfpv-leaderboard:

| Repo | Ecosystem | What it covers | Where it runs |
| --- | --- | --- | --- |
| fdfpv | npm | `ws`, `nodemailer` (pinned exact) | the VM's rooms and tracks servers; CI |
| fdfpv | github-actions | checkout, setup-node, the Pages actions | CI and the Pages deploy |
| fdfpv-leaderboard | npm | `pg`, `ws` | the VM's board |
| fdfpv-leaderboard | github-actions | its checks.yml | CI |

Each is checked weekly, Monday 06:00 Asuncion, and all of an ecosystem's
updates come as ONE grouped pull request, so a week is at most two pull
requests per repository. Security updates are separate: GitHub opens them
as soon as an advisory lands, when "Dependabot security updates" is on in
the repository's settings (a setting, so the owner's or the lead's switch).

## What is deliberately not watched

- `vendor/betaflight`: changes are patch files against a pinned upstream
  (CLAUDE.md), never a moving submodule.
- `vendor/fdfpv` in the leaderboard: pinned on purpose; deploy-board.sh
  refuses a checkout whose pin moved without a commit.
- three.js and the muxers: they load from jsDelivr at exact versions named
  in the import maps (`index.html`, `src/share/orbit.html` and the other
  pages). Dependabot cannot see an import map. Moving three.js changes how
  every map draws, so it is a lane's job with pictures, not a weekly bump.
- Node itself (`node-version: 22` in the workflows, Node 24 on the VM from
  the Oracle Linux module, which `dnf-automatic` patches).

## How the lead merges one

1. Wait for `checks` on the pull request to go green. It is the same
   workflow every pull request runs, so a bump that breaks a selftest
   shows there. Dependabot's runs get a read only token and no secrets;
   checks.yml needs neither.
2. Read the grouped pull request's body: Dependabot lists each package with
   its release notes. A major version (the first number) gets read, not
   merged on green alone.
3. Merge it like any other pull request (land.sh refuses while main is red,
   as for every merge).
4. If it touched the npm group: the change reaches the VM only with the
   next deploy, `deploy/vm/deploy.sh` (fdfpv: rooms and tracks) or
   `deploy/vm/deploy-board.sh` (leaderboard: the board). Run the "Check it"
   list in deploy/vm/README.md after. Until that deploy the VM runs the old
   versions; the monitor's daily heartbeat says how far behind main the VM
   is.
5. A bump that fails CI: close it with a comment saying why, or fix the
   code on a branch of our own. Never merge it red. `@dependabot ignore
   this major version` (a comment on the pull request) stops it from
   coming back until the next major.
