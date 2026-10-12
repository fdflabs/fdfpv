/*
 * rooms-deploy-dryrun.js: deploy/vm/rooms-deploy.sh run against a fake VM.
 *
 *   CADDY=/path/to/caddy node scripts/rooms-deploy-dryrun.js
 *                                                 (npm run rooms:deploy-dryrun)
 *
 * The script and lib.sh are copied with every /etc/ and /opt/ path moved
 * under a scratch directory, and run with systemctl, curl and journalctl
 * replaced by stubs that keep each unit's state in files and log every
 * call; caddy validate is the real caddy's. Four deploys in a row, as
 * the VM will see them:
 *
 *   1. from today's one unit fdfpv-rooms on 8797: fdfpv-rooms@8798 starts
 *      on its own copy of the code, Caddy names 8798, rooms-live says
 *      8798, fdfpv-rooms is kept from restarting (Restart=no) and sent
 *      SIGUSR2, and only @8798 is enabled,
 *   2. while fdfpv-rooms still drains: it is stopped and its unit file
 *      removed, @8797 starts, Caddy names 8797, @8798 drains,
 *   3. while @8798 still drains: it is stopped first, then the same,
 *   4. a new instance that answers another commit: the deploy fails, the
 *      new instance is stopped, rooms-live, Caddy and the live instance
 *      are as they were.
 *
 * It proves the order of the steps and what each leaves on disk, not
 * systemd's or Caddy's own behaviour: rooms:drain and rooms:deploy-caddy
 * prove those parts locally, and the VM's first deploy proves the rest.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const CADDY = process.env.CADDY || 'caddy';
if (spawnSync(CADDY, ['version']).status !== 0) {
  console.error(`rooms-deploy-dryrun: no caddy at ${CADDY} (set CADDY=/path/to/caddy)`);
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const S = mkdtempSync(join(tmpdir(), 'fdfpv-vm-'));
const vmDir = join(S, 'opt/fdfpv/deploy/vm');
const state = join(S, 'state');
const bin = join(S, 'bin');
for (const d of [vmDir, state, bin, join(S, 'etc/fdfpv'), join(S, 'etc/systemd/system'), join(S, 'etc/caddy')]) {
  mkdirSync(d, { recursive: true });
}

/* The VM's files, their absolute paths under S. */
const moved = (text) => text.replace(/(^|[\s"'=:])\/(etc|opt)\//g, `$1${S}/$2/`);
for (const f of ['lib.sh', 'rooms-deploy.sh', 'Caddyfile', 'fdfpv-rooms@.service', 'rooms-8797.env', 'rooms-8798.env']) {
  const text = readFileSync(join(root, 'deploy/vm', f), 'utf8');
  writeFileSync(join(vmDir, f), f.endsWith('.sh') ? moved(text) : text);
}

const stub = (name, body) => {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
};
/* Each unit's state is a file: state/<unit>.active, .enabled; every call
 * is a line in state/log. */
stub('systemctl', `
ST='${state}'
echo "systemctl $*" >> "$ST/log"
q=0; now=0; args=()
for a in "$@"; do
  case $a in -q) q=1 ;; --now) now=1 ;; -s) ;; SIG*) sig=$a ;; *) args+=("$a") ;; esac
done
verb=\${args[0]}; units=("\${args[@]:1}")
case $verb in
  daemon-reload) ;;
  is-active)
    rc=0
    for u in "\${units[@]}"; do
      if [[ -f $ST/$u.active ]]; then [[ $q == 1 ]] || echo active; else [[ $q == 1 ]] || echo inactive; rc=3; fi
    done
    exit $rc ;;
  start)
    for u in "\${units[@]}"; do
      if [[ $u == fdfpv-rooms@* && ! -d '${S}/opt/fdfpv-rooms/'\${u#fdfpv-rooms@} ]]; then echo "no code for $u" >&2; exit 1; fi
      touch "$ST/$u.active"; rm -f "$ST/$u.signals"
    done ;;
  stop) for u in "\${units[@]}"; do rm -f "$ST/$u.active"; done ;;
  restart|reload) for u in "\${units[@]}"; do touch "$ST/$u.active"; done ;;
  enable) for u in "\${units[@]}"; do touch "$ST/$u.enabled"; [[ $now == 1 ]] && touch "$ST/$u.active"; done; true ;;
  disable) for u in "\${units[@]}"; do rm -f "$ST/$u.enabled"; [[ $now == 1 ]] && rm -f "$ST/$u.active"; done; true ;;
  kill) for u in "\${units[@]}"; do echo "$sig" >> "$ST/$u.signals"; done ;;
  *) echo "systemctl stub: $verb" >&2; exit 1 ;;
esac`);
/* An instance answers the commit its own copy of the code holds, or
 * WRONG_COMMIT's when that file exists. */
stub('curl', `
url=\${@: -1}
port=\${url#http://127.0.0.1:}; port=\${port%%/*}
[[ -f '${state}'/fdfpv-rooms@$port.active ]] || exit 7
c=$(cut -d' ' -f1 '${S}'/opt/fdfpv-rooms/$port/REVISION)
[[ -f '${state}'/WRONG_COMMIT ]] && c=$(cat '${state}'/WRONG_COMMIT)
printf '{"commit":"%s","dirty":false}' "$c"`);
stub('journalctl', 'echo "journal of $*"');
stub('caddy', `
if [[ $1 == validate ]]; then exec '${CADDY}' "$@"; fi
echo "caddy $*" >> '${state}/log'`);
stub('sleep', 'exec /bin/sleep 0.01');

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
const at = (p) => join(S, p);
const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : null);
const active = (u) => existsSync(join(state, `${u}.active`));
const enabled = (u) => existsSync(join(state, `${u}.enabled`));
const signals = (u) => (existsSync(join(state, `${u}.signals`)) ? readFileSync(join(state, `${u}.signals`), 'utf8').trim().split('\n') : []);
const caddyPort = () => (read('etc/caddy/Caddyfile') || '').match(/reverse_proxy 127\.0\.0\.1:(879\d)/)?.[1];

function deployCommit(commit) {
  writeFileSync(at('opt/fdfpv/REVISION'), `${commit}\n`);
  writeFileSync(join(state, 'log'), '');
  const r = spawnSync('bash', [join(vmDir, 'rooms-deploy.sh')], { env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr, log: readFileSync(join(state, 'log'), 'utf8') };
}

try {
  /* Today's VM: the one unit, enabled and running on 8797, Caddy on it. */
  writeFileSync(at('etc/systemd/system/fdfpv-rooms.service'), '[Service]\nRestart=always\n');
  writeFileSync(join(state, 'fdfpv-rooms.active'), '');
  writeFileSync(join(state, 'fdfpv-rooms.enabled'), '');
  writeFileSync(join(state, 'caddy.active'), '');
  writeFileSync(at('etc/caddy/Caddyfile'), readFileSync(join(root, 'deploy/vm/Caddyfile')));

  console.log('1. the first deploy, from the one unit fdfpv-rooms');
  const c1 = '1'.repeat(40);
  const d1 = deployCommit(c1);
  check('it succeeds', d1.code === 0, d1.out);
  check('@8798 runs its own copy of the code, of this commit', active('fdfpv-rooms@8798') && read('opt/fdfpv-rooms/8798/REVISION')?.trim() === c1);
  check('Caddy names 8798 and was reloaded', caddyPort() === '8798' && /systemctl reload caddy/.test(d1.log), `${caddyPort()}`);
  check('rooms-live says 8798', read('etc/fdfpv/rooms-live')?.trim() === '8798');
  check('fdfpv-rooms may not restart, then drains', /Restart=no/.test(read('etc/systemd/system/fdfpv-rooms.service.d/drain.conf') || '')
    && signals('fdfpv-rooms').join() === 'SIGUSR2' && active('fdfpv-rooms'), d1.log);
  check('the drop-in came before the signal', d1.log.indexOf('daemon-reload', d1.log.lastIndexOf('reload caddy')) < d1.log.indexOf('kill'), d1.log);
  check('only @8798 starts at boot', enabled('fdfpv-rooms@8798') && !enabled('fdfpv-rooms'));
  check('Caddy flipped after @8798 answered, the drain after the flip',
    d1.log.indexOf('start fdfpv-rooms@8798') < d1.log.indexOf('reload caddy') && d1.log.indexOf('reload caddy') < d1.log.indexOf('kill'), d1.log);
  check('the peers: 8798 names 8797', /ROOMS_PEER=127\.0\.0\.1:8797/.test(read('etc/fdfpv/rooms-8798.env') || ''));

  console.log('2. the next deploy, fdfpv-rooms still draining');
  const c2 = '2'.repeat(40);
  const d2 = deployCommit(c2);
  check('it succeeds', d2.code === 0, d2.out);
  check('fdfpv-rooms is stopped and its unit removed', !active('fdfpv-rooms') && !existsSync(at('etc/systemd/system/fdfpv-rooms.service'))
    && !existsSync(at('etc/systemd/system/fdfpv-rooms.service.d')), d2.log);
  check('@8797 runs this commit, Caddy names it, rooms-live says it', active('fdfpv-rooms@8797') && read('opt/fdfpv-rooms/8797/REVISION')?.trim() === c2
    && caddyPort() === '8797' && read('etc/fdfpv/rooms-live')?.trim() === '8797');
  check('@8798 drains on its own code, untouched', signals('fdfpv-rooms@8798').join() === 'SIGUSR2' && active('fdfpv-rooms@8798')
    && read('opt/fdfpv-rooms/8798/REVISION')?.trim() === c1);
  check('only @8797 starts at boot', enabled('fdfpv-rooms@8797') && !enabled('fdfpv-rooms@8798'));

  console.log('3. the next, @8798 still draining');
  const c3 = '3'.repeat(40);
  const d3 = deployCommit(c3);
  check('it succeeds', d3.code === 0, d3.out);
  check('@8798 is stopped before it starts again', d3.log.indexOf('stop fdfpv-rooms@8798') >= 0 && d3.log.indexOf('stop fdfpv-rooms@8798') < d3.log.indexOf('start fdfpv-rooms@8798'), d3.log);
  check('@8798 runs this commit, Caddy names it, @8797 drains', read('opt/fdfpv-rooms/8798/REVISION')?.trim() === c3 && caddyPort() === '8798'
    && signals('fdfpv-rooms@8797').join() === 'SIGUSR2');

  console.log('4. a deploy whose new instance answers another commit');
  writeFileSync(join(state, 'WRONG_COMMIT'), '9'.repeat(40));
  const before = { live: read('etc/fdfpv/rooms-live'), caddy: read('etc/caddy/Caddyfile') };
  const d4 = deployCommit('4'.repeat(40));
  rmSync(join(state, 'WRONG_COMMIT'));
  check('it fails, saying why', d4.code !== 0 && /did not answer \/v2\/version/.test(d4.out), d4.out);
  check('the new instance is stopped', !active('fdfpv-rooms@8797'), d4.log);
  check('rooms-live and Caddy are as they were, and Caddy was not reloaded', read('etc/fdfpv/rooms-live') === before.live
    && read('etc/caddy/Caddyfile') === before.caddy && !/reload caddy/.test(d4.log));
  check('the live instance was not told to drain', signals('fdfpv-rooms@8798').length === 0 && active('fdfpv-rooms@8798'));
} catch (e) {
  check('the dry run ran to its end', false, e && e.stack ? e.stack : String(e));
} finally {
  rmSync(S, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
