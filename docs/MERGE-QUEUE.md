# The merge queue

Foundations item 3, 2026-10-09.

## Why

On 2026-10-08 most red mains came from two pull requests that were each
green against an older main and red together. The lead's land.sh merges
every pull request whose own check passed, so nothing ever tested the
combination before it was main. GitHub's merge queue does: each queued pull
request is merged onto the queue's head (main plus the pull requests ahead
of it) in a temporary `gh-readonly-queue/main/...` branch, `checks.yml` runs
there on the `merge_group` event, and only a green group lands.

Availability: the repository is public and owned by an organization, which
is where GitHub offers merge queues, so no equivalent has to be built.

## What this pull request changes

- `checks.yml` runs on `merge_group` as well (without it the queue would
  wait on `node` forever).
- `deploy/github/ruleset-main.json`: the ruleset to apply, kept in the tree
  so the setting is reviewed like code.
- `npm run mergequeue:selftest` (CI): every check the ruleset requires is a
  job in a workflow that runs on both `pull_request` and `merge_group`.

Nothing changes until the ruleset is applied: a workflow with a
`merge_group` trigger and no queue simply never sees that event.

## The settings (deploy/github/ruleset-main.json)

- Target: main. Required check: `node` (from GitHub Actions). A pull request
  must be green on its own before it can be queued, then green again as part
  of its group.
- Merge method MERGE: merge commits, as land.sh lands them today.
- Groups of up to 5, built 5 at a time, `ALLGREEN` (a group lands only when
  its own run is green), waiting at most 5 minutes for company.
- 120 minutes before a group's check counts as failed: checks.yml took 42 to
  69 minutes on 2026-10-08.
- Bypass: repository admins (role id 5), always. The lead can still push a
  fix straight to a red main or merge by hand.

The cost, said plainly: a pull request's CI runs twice, once on its branch
and once in its group, so the time from "green" to "merged" grows by one CI
run (about an hour). Groups of 5 keep that one hour for a burst of merges
rather than one hour each. When a group fails, the queue drops the failing
pull request and rebuilds the rest, one more run.

## Apply (the lead or the owner)

    gh api -X POST repos/fdflabs/fdfpv/rulesets --input deploy/github/ruleset-main.json
    gh api -X PATCH repos/fdflabs/fdfpv -f allow_auto_merge=true

Then land.sh queues instead of merging: replace its
`gh pr merge "$num" --merge --match-head-commit "$h"` with
`gh pr merge "$num" --auto --match-head-commit "$h"`, which adds a green pull
request to the queue (the method comes from the ruleset). The "hold" label
and the MAIN_RED gate keep working; the queue itself now stops a group that
would turn main red. The "VM DEPLOY NEEDED" report should then read merged
pull requests from main's history, as it already does (git diff from the
start commit).

Undo: `gh api repos/fdflabs/fdfpv/rulesets --jq '.[] | select(.name=="main: merge queue") | .id'`
then `gh api -X DELETE repos/fdflabs/fdfpv/rulesets/<id>`.

## Dry run, in this order

1. Merge this pull request the old way (it is the merge_group trigger and
   the selftest only). `node` keeps passing on push and pull_request.
2. Apply the ruleset. Check `gh api repos/fdflabs/fdfpv/rules/branches/main`
   lists `merge_queue` and `required_status_checks`.
3. Queue one small pull request (docs only): `gh pr merge <n> --auto`. Expect
   a checks.yml run with event `merge_group` on a
   `gh-readonly-queue/main/pr-<n>-...` ref, then the merge on main, then
   pages.yml on the push. `gh run list -R fdflabs/fdfpv --event merge_group`.
4. Queue two green pull requests that touch the same golden, the incident
   pattern. Expect the second group to fail and the second pull request to
   be removed from the queue with a comment, and main to stay green.
5. If any step misbehaves: delete the ruleset (Undo above); main is exactly
   as it was and land.sh works unchanged.

Watch the GitHub API budget: a queued pull request needs no polling; land.sh
can call `gh pr merge --auto` once per green pull request and stop.
