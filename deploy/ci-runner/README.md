# Self-hosted CI runners

The `node` job of `.github/workflows/checks.yml` runs on runners on the
owner's desktop, not on GitHub's two core machines, where it took an hour
of runtime (63 min for merge_group run 38092961715) and up to two hours of
wall clock with the queue. Nothing else runs here: preview.yml and pages.yml
hold Cloudflare secrets and stay on `ubuntu-latest`.

| File | What |
|---|---|
| `Dockerfile` | the runner image: runner agent, Node 22 in the tool cache, Chrome, python3, rsync |
| `entrypoint.sh` | inside the container: register one ephemeral runner, take one job, exit |
| `run-slot.sh` | on the host: mint a registration token, start one container with it |
| `fdfpv-ci@.service` | systemd `--user` template; `fdfpv-ci@1`, `fdfpv-ci@2` |
| `install.sh` | build the image, install the units, roll idle slots onto the new image |

## Who runs where

- Runners carry one label, `fdfpv-ci` (`--no-default-labels`), so a workflow
  asking for `self-hosted` or `linux` never lands here. Names are
  `fdfpv-ci-1` and `fdfpv-ci-2`, stable per slot.
- checks.yml sends a pull request from a fork to `ubuntu-latest`:
  `github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository && 'ubuntu-latest' || 'fdfpv-ci'`.
  Every other run (push, merge_group, a pull request from a branch of this
  repository) goes to `fdfpv-ci`.
- **That expression routes an honest fork only.** A `pull_request` run uses
  the workflow file from the fork's own head, so a fork can rewrite
  `runs-on: fdfpv-ci` and reach this machine. The real gate is the
  repository's fork approval setting, `all_external_contributors`: a fork's
  run waits until a maintainer approves it. **Never approve a run for a fork
  pull request that touches `.github/`.** Read the diff of every fork pull
  request before approving its run.

## Isolation

- One container per job: `--ephemeral` registration, `docker run --rm`, the
  next job gets a new container.
- No Docker socket, no host directory, no secret. The only volume is the npm
  cache, `fdfpv-ci-npm`. The container runs as uid 1001 with every
  capability dropped and `no-new-privileges`; there is no sudo in the image.
- The durable credential is the host's `gh` login and it never enters a
  container. `run-slot.sh` mints a registration token (repository scoped,
  an hour long) and hands it to the container on stdin, so it is never in
  the container's environment. What a job can read is the runner's own
  session credential for its single registration, as on any self-hosted
  runner.
- Residual: the container is on Docker's default bridge, so a job can reach
  services the desktop listens on at 0.0.0.0 (the Postgres containers, for
  instance). Only organisation members' branches run here.

## Limits and measurements

The job is serial, so a runner's peak is its heaviest step. Measured in this
image, over the full job of `687618f2` from a fresh clone, as `run-slot.sh`
starts it (`--cpus 10`, no cpuset), 2026-10-10, desktop under its usual
agent load (load average 5 to 20):

| | measured | limit |
|---|---|---|
| memory (cgroup `memory.peak`) | 4.01 GiB, at version:reload | 4750m (peak x1.15), no swap |
| processes (`pids.peak`) | 263 | 530 (peak x2) |
| wall clock, the 229 steps | 45 min (2694 s), every step passed | |

CPU is a quota of 10 per slot, not a cpuset. The job is Chrome drawing with
SwiftShader on the CPU, and it uses every core it may: `results:layout`
alone took 98 s unlimited (905 cpu-s), 107 s at `--cpus 10`, 164 s pinned to
five P-cores and 264 s pinned to two P-cores and three E-cores, against
199 s on GitHub's two cores. The first full measurement, at five pinned
cores, took 86.5 min: slower than GitHub.

`midair:harness` and `tag:harness` start `os.availableParallelism() / 2`
workers. That call sees all 20 cores whatever the quota, so they start 10,
which is the quota. Change one, change the other.

Memory budget on this 60G machine: desktop about 8G, a Claude session about
16G, the FDFPV job pool (`fdfpv-jobs.slice`) 36G, these two slots 2 x 4.6G.
That sums over 60G. The ceiling to trade is the pool's: its highest
observed use is 24.1G (fdfpv-health, 2026-10-07), so 28G (x1.15) would
cover it. The BurnLedger runner containers on the same machine carry about
74G of ceilings of their own and are idle most of the time; no budget here
counts them.

## Capacity

Two slots run two jobs at a time, about 45 minutes each while the desktop
is busy, so about 2.7 jobs an hour. GitHub ran this job up to 20 at a time.
On 2026-10-10 the workflow started 15 to 21 runs an hour during lane work
(pull requests, pushes to main, merge queue entries), merge_group alone up
to 7 an hour, and the merge queue builds up to 5 entries at once and drops
an entry whose check has not answered in 120 minutes. Every slot more takes
10 of the 20 cores from a machine that already runs at a load average of 15
before any CI. Read the queue (`gh run list -w checks -s queued`) before
adding slots or routing more here.

## Install and update

From a checkout of the commit to run:

    deploy/ci-runner/install.sh

It builds `fdfpv-ci-runner:current`, installs `run-slot.sh` to
`~/.local/lib/fdfpv-ci/` and the unit to `~/.config/systemd/user/`, and
enables `fdfpv-ci@1` and `fdfpv-ci@2`. A slot whose container is idle is
replaced at once; a slot with a job (a `Runner.Worker` process in
`docker top`) finishes it on the old image and starts its next cycle on the
new one. Never `docker rm -f` or `systemctl --user stop` a slot that has a
job: it cancels the job.

Check the pool:

    gh api repos/fdflabs/fdfpv/actions/runners -q '.runners[]|[.name,.status,.busy,([.labels[].name]|join(","))]|@tsv'
    systemctl --user status 'fdfpv-ci@*'
    journalctl --user -u fdfpv-ci@1 -f

Never delete offline registrations to clean up. A runner is offline between
registering and opening its session; deleting offline runners on start is how
the BurnLedger pool emptied itself on 2026-09-12. A dead slot's registration
is replaced by `--replace` under the same name on its next start.

## The Chrome reaper

`~/.local/bin/fdfpv-health` (run every 5 min by `fdfpv-health.timer`) kills
headless Chromes that have profiles under `~/.cache/fdfpv-*`, are outside
the job pool and are 45+ min old. Since 2026-10-10 it reaps only processes
of the desktop user under `/user.slice/user-1000.slice/`. A runner's Chrome
lives in `system.slice/docker-*.scope`, and one check can take 20 minutes
there, so the reaper never touches it. `fdfpv-health orphans [secs]` lists
what it would reap without killing anything.

Proved with the real timer: at 22:33:14 it reaped a control Chrome started
on the host at 21:47 with a matching profile, and left alone a Chrome of the
same age, profile path and uid running in a container of this image.
