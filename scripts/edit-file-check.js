/*
 * edit-file-check.js: the replay file's version 6 against the build before
 * it, and through the browser's IndexedDB.
 *
 * 1. In Node, the encoder of the last build that wrote version 5 (read out
 *    of git, --base=<ref>, 95b3e55e by default) and this one write the
 *    same bytes for every clip without a real edit: single player with
 *    and without keys, an odd frame count, a room of pilots, combat's
 *    paper, both together, and each of them again carrying a default edit.
 * 2. In Node, a room with paper and a real edit is version 6 and comes
 *    back with its peers, its paper and its edit.
 * 3. In headless Chromium (tests/lib/page.js): the page decodes the version
 *    6 files Node wrote, writes them again to the same bytes, puts them in
 *    My clips (src/replay/store.js putClip), and after a reload reads them
 *    back from IndexedDB with the same edit and the same bytes. A version 3
 *    file goes the same way beside them.
 *
 * Run: npm run edit:file
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { execFileSync } from 'node:child_process';
import { uptime, loadavg } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { PART_STATE_DOUBLES, STATE } from '../configs/parts.js';
import { PARTS_MAX, createRecorder } from '../src/replay/recorder.js';
import { createPeerRing } from '../src/replay/peers.js';
import { NODES_MAX, createPaperRing } from '../src/replay/paper.js';
import { defaults } from '../src/replay/cameras.js';
import {
  cut, defaultEdit, setCam, setEnter, setSpeed,
} from '../src/replay/edit.js';
import { decodeReplay, encodeReplay } from '../src/replay/file.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const base = (process.argv.find((a) => a.startsWith('--base=')) || '--base=95b3e55e').slice(7);

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

const version = (b) => new DataView(b).getUint32(4, true);
const same = (a, b) => Buffer.from(new Uint8Array(a)).equals(Buffer.from(new Uint8Array(b)));

/* The base build's file.js as a module, its relative imports pointed at
 * this tree's modules (none of which it depends on changed shape). */
async function baseEncoder() {
  const src = execFileSync('git', ['show', `${base}:src/replay/file.js`], { cwd: root, encoding: 'utf8' });
  if (!/export const FILE_VERSION = 5;/.test(src)) {
    throw new Error(`${base}'s file.js is not the version 5 writer`);
  }
  const dir = resolve(root, 'src/replay');
  const rewritten = src.replace(/from '(\.{1,2}\/[^']+)'/g, (m, rel) => `from '${pathToFileURL(resolve(dir, rel)).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`);
}

/* ---- clips, as scripts/crashcam-selftest.js builds them ---- */

const META = {
  created: 1790000000000, airframe: 'sky1800', livery: null, scale: 1, size: 1.8, duration: 0,
  parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
};

function soloClip(frames) {
  const r = createRecorder(256);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const ps = new Float64Array(24 * 3);
  const sp = r.spawnIndex(1, 2, 3, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < frames; f += 1) {
    const i = r.begin(f / 60, (f * 1000) / 60);
    pp.x = f * 0.37;
    pp.y = Math.sin(f);
    r.pose(i, pp, qq);
    r.drive(i, f, f, f, f, [0.1, -0.1, 0.2, 0], 0, f);
    st[1] = f * 1.1;
    r.plant(i, st);
    r.status(i, [9, 99], sp, f > 20 ? 256 : 0, f > 30, f, 0.5, 3);
    if (f > 20) {
      ps[24 + 2] = f;
      ps[24] = 1;
      r.parts(i, ps, 3);
    }
    if (f === 21) {
      r.event('off', { part: 1, label: 'wing right' });
      r.event('cue', { kind: 'crack', level: 0.8 });
    }
  }
  return r.clip({
    ...META,
    name: 'Wing off',
    map: 'alps',
    parts: [0, 1, 2].map((i) => ({
      kind: i === 1 ? 9 : 8, kindName: i === 1 ? 'wing' : 'fuselage', parent: i - 1, material: 2, cg: [0, i, 0], boxMin: [-1, -1, -1], boxMax: [1, 1, 1],
    })),
  });
}

function fakePeer(seat, airframe) {
  const pos = { x: 0, y: 0, z: 0 };
  const quat = { x: 0, y: 0, z: 0, w: 1 };
  const parts = new Float64Array(PARTS_MAX * PART_STATE_DOUBLES);
  const peer = {
    seat,
    profile: {
      airframe, map: 'swiss2', figure: seat % 12, livery: null, parts: null,
    },
    rig: {
      group: { visible: true, position: pos, quaternion: quat },
      label: () => `Pilot ${seat}`,
      gear: () => 0.25,
      smokeAt: () => null,
    },
    last: {
      flags: 0, c0: 0.1, c1: -0.1, c2: 0.2, c3: 0, motor: 900, flaps: 0.05, vx: 20, vy: 0, vz: 0,
    },
    wreck: null,
    wreckTable: null,
    figure: null,
    smoke: false,
    crash(table) {
      peer.wreckTable = table;
      peer.wreck = { drawn: () => parts, count: () => table.length };
      for (const i of [1, 2]) {
        const o = i * PART_STATE_DOUBLES;
        parts[o + STATE.status] = 1;
        parts[o + STATE.quat] = 1;
      }
    },
  };
  return peer;
}

const TABLE = [0, 1, 2].map((i) => ({
  kind: i === 0 ? 8 : 9, parent: i - 1, cg: [0, i * 0.3, 0], boxMin: [-0.5, -0.5, -0.1], boxMax: [0.5, 0.5, 0.1],
}));

function paperChain(links, x0, y0, z0, f, out = new Float64Array(NODES_MAX * 3)) {
  for (let k = 0; k <= links; k += 1) {
    out[k * 3] = x0 + 0.3 * Math.sin(k * 0.4 + f * 0.1);
    out[k * 3 + 1] = y0 - 0.002 * k * k - 0.1 * Math.cos(k * 0.3 + f * 0.05);
    out[k * 3 + 2] = z0 + k * 0.95;
  }
  return out;
}

/* 60 frames of a room: two other pilots, one wrecked at frame 40, and
 * (when `paper`) two streamers, one cut at frame 30. */
function roomClip(peers, paper) {
  const r = createRecorder(64);
  const ring = createPeerRing(64);
  const pr = createPaperRing(64);
  const A = fakePeer(2, 'cub1400');
  const B = fakePeer(3, 'p51d1450');
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < 60; f += 1) {
    ring.begin(-1);
    pr.begin(-1);
    const i = r.begin(f / 60, (f * 1000) / 60);
    ring.begin(i);
    pr.begin(i);
    pp.x = f;
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, f], sp, 0, false, 0, 0, 0);
    if (peers) {
      A.rig.group.position.x = f + 100;
      if (f === 40) {
        A.crash(TABLE);
      }
      ring.add(A);
      if (f >= 10 && f < 30) {
        B.rig.group.position.x = f + 200;
        ring.add(B);
      }
    }
    if (paper) {
      const own = f >= 30 ? [...Array(20).fill(1), ...Array(10).fill(2)] : Array(20).fill(1);
      const a1 = [f * 0.2, 40, 0];
      pr.draw(1, own, 0, paperChain(own.length, a1[0], 40, 0.5, f), own.length + 1, 1000 + f / 60, false, a1);
      if (f === 30) {
        pr.cut(r.now(), [20, 42, 19.5], '#2f6fe0', 1);
        pr.schwing(r.now(), 1);
      }
    }
  }
  const [first, n, t0, t1] = r.span();
  const clip = r.clip({ ...META, name: 'Room', map: 'swiss2' });
  clip.keys = [];
  if (peers) {
    clip.peers = ring.clip(first, n);
  }
  if (paper) {
    clip.paper = pr.clip(first, n, t0, t1);
  }
  return clip;
}

const chase = (size) => ({
  rig: 'chase', target: -1, watch: 0, p: defaults('chase', size),
});

function realEdit(clip, watch) {
  const dur = clip.time[clip.n - 1];
  let e = defaultEdit(dur, chase(1.8));
  e = cut(e, dur * 0.4);
  e = setCam(e, 1, {
    rig: 'orbit', target: -1, watch, p: defaults('orbit', 1.8),
  });
  e = setSpeed(e, 1, 0.25);
  e = setEnter(e, 1, { type: 'blend', d: 0.5 });
  e = cut(e, dur * 0.7);
  e = setCam(e, 2, {
    rig: 'free', target: -1, watch: 0, p: { pos: [4, 2, -7], yaw: 0.4, pitch: -0.1, fov: 70 },
  });
  return setEnter(e, 2, { type: 'glide' });
}

/* ---- 1 and 2: Node ---- */

async function node() {
  console.log(`1. the version 5 writer at ${base} and this one agree on every clip without a real edit`);
  const old = await baseEncoder();
  const keys = [{ t: 0.2, rig: 'orbit', target: -1, p: defaults('orbit', 1) }];
  const cases = [
    ['single player, no keys', { ...soloClip(40), keys: [] }, 3],
    ['single player, a key', { ...soloClip(40), keys }, 3],
    ['single player, 41 frames', { ...soloClip(41), keys: [] }, 3],
    ['a room', roomClip(true, false), 4],
    ['paper', roomClip(false, true), 5],
    ['a room and paper', roomClip(true, true), 5],
  ];
  for (const [name, clip, v] of cases) {
    const want = old.encodeReplay(clip);
    const got = encodeReplay(clip);
    const dur = clip.time[clip.n - 1];
    const withDefault = encodeReplay({ ...clip, edit: defaultEdit(dur, chase(clip.meta.size)) });
    /* An edit replaces the keys, so its clip is compared with the old
     * writer's same clip without them. */
    const wantNoKeys = old.encodeReplay({ ...clip, keys: [] });
    check(version(got) === v && same(got, want) && same(withDefault, wantNoKeys),
      `${name}: version ${v}, the same bytes, and the same again with a default edit`, `${got.byteLength} bytes`);
  }

  console.log('2. a room with paper and a real edit is version 6');
  const room = roomClip(true, true);
  const edit = realEdit(room, 2);
  const buf = encodeReplay({ ...room, edit });
  const back = decodeReplay(buf);
  check(version(buf) === 6 && JSON.stringify(back.edit) === JSON.stringify(edit) && back.peers.who.length === 2
    && same(back.paper.bytes, room.paper.bytes) && same(back.peers.cols.buffer, room.peers.cols.slice().buffer),
  'its edit, its pilots and its paper come back', `${buf.byteLength} bytes, watching pilot ${back.edit.shots[1].cam.watch} in shot 2`);
  const solo = soloClip(41);
  const soloEdit = realEdit(solo, 0);
  const soloBuf = encodeReplay({ ...solo, keys, edit: soloEdit });
  check(version(soloBuf) === 6 && decodeReplay(soloBuf).keys.length === 0, 'a single player clip with an edit is version 6 with no keys');
  return {
    files: [
      { name: 'room, paper and an edit', b64: Buffer.from(buf).toString('base64'), edit: JSON.stringify(edit), v: 6 },
      { name: 'single player and an edit', b64: Buffer.from(soloBuf).toString('base64'), edit: JSON.stringify(soloEdit), v: 6 },
      { name: 'single player, a key', b64: Buffer.from(encodeReplay({ ...soloClip(40), keys })).toString('base64'), edit: 'undefined', v: 3 },
    ],
  };
}

/* ---- 3: the browser ---- */

const PAGE_PUT = `(async (files) => {
  const file = await import('/src/replay/file.js');
  const store = await import('/src/replay/store.js');
  const out = [];
  for (const f of files) {
    const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)).buffer;
    const clip = file.decodeReplay(bytes);
    const again = new Uint8Array(file.encodeReplay(clip));
    const same = again.length === bytes.byteLength && again.every((x, i) => x === new Uint8Array(bytes)[i]);
    await store.putClip({ id: 'edit-check-' + out.length, name: f.name, created: 1790000000000 + out.length, bytes });
    out.push({ edit: String(JSON.stringify(clip.edit)), same, version: new DataView(bytes).getUint32(4, true) });
  }
  return out;
})`;

const PAGE_GET = `(async (n) => {
  const file = await import('/src/replay/file.js');
  const store = await import('/src/replay/store.js');
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const row = await store.getClip('edit-check-' + i);
    const clip = file.decodeReplay(row.bytes);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(row.bytes)));
    out.push({ edit: String(JSON.stringify(clip.edit)), b64, frozen: clip.edit ? Object.isFrozen(clip.edit.shots[0].cam.p) : null });
  }
  return out;
})`;

async function browser(files) {
  console.log('3. in the browser: decoded, written again, into My clips and back after a reload');
  const page = await openPage({ root, url: '/package.json' });
  try {
    await page.until('document.readyState === "complete"');
    const put = await page.evaluate(`${PAGE_PUT}(${JSON.stringify(files)})`);
    files.forEach((f, i) => {
      check(put[i].version === f.v && put[i].same && put[i].edit === f.edit,
        `${f.name}: version ${f.v}, the page reads the edit Node wrote and writes the same bytes`);
    });
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(300);
    await page.until('document.readyState === "complete"');
    const got = await page.evaluate(`${PAGE_GET}(${files.length})`);
    files.forEach((f, i) => {
      check(got[i].b64 === f.b64 && got[i].edit === f.edit && (f.v < 6 || got[i].frozen === true),
        `${f.name}: after a reload, IndexedDB gives back the same bytes and the same edit`);
    });
    check(page.errors.length === 0, 'no page errors', page.errors.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
}

const t0 = performance.now();
console.log(`uptime ${(uptime() / 3600).toFixed(1)} h, load ${loadavg().map((x) => x.toFixed(2)).join(' ')}`);
const { files } = await node();
await browser(files);
console.log(`     ${((performance.now() - t0) / 1000).toFixed(1)} s`);

if (failures) {
  console.log(`edit:file FAILED: ${failures}`);
  process.exit(1);
}
console.log('edit:file ok');
