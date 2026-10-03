/*
 * war-markers.js: the war's target markers on the real shell
 * (src/ui/warmarkers.js). One headless page makes a private room on the
 * Itaipu map, flies, and starts mission 1 alone:
 *
 *   SIM_GPU=1 npm run war:markers [-- outdir]
 *
 * What must hold:
 *   - outside a war nothing is drawn: before it, and after it ends
 *   - with the harness camera parked at a known pose, every live attacker
 *     has either a marker within MARK_PX of where this script projects it
 *     (its own arithmetic, not the module's) or an arrow on the edge
 *     within ARROW_DEG of the way to turn to it; one the script puts
 *     straight behind the camera gets the bottom edge's arrow
 *   - the pilot's own FPV camera: a marker or an arrow for every one
 *   - held up the gorge, a Hunter the room has on this seat (its
 *     Hunters' target, edge/rooms/warhunt.js) shows the warning, and the
 *     page heard that target on the wire (HUNTS, 0xA1)
 *   - a hunter's heard target decides the warning over its heading; with
 *     none heard the heading does
 *   - the overlay's cost with 60 attackers, update and paint, measured in
 *     the page over BENCH_FRAMES frames, is under COST_MS a frame
 *
 * Pictures of each case go in outdir (build/war-markers by default, not
 * in the repository).
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import itaipu1 from '../src/share/war/missions/itaipu-drill.js';
/* The drill: mission 1 as this check was written against, before First
 * Light made it a story (src/share/war/missions/itaipu-drill.js). */

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'war-markers');

const MARK_PX = 3;
const ARROW_DEG = 10;
const COST_MS = 0.5;
const BENCH_FRAMES = 600;
/* The camera's lens for the parked views, degrees vertical. */
const FOV = 60;
/* src/ui/warmarkers.js: a projected centre this far inside the edge is a
 * marker; the script only holds the classification where it is plain. */
const IN_PX = 24;
const BEHIND_TAN = 0.1;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

function seed() {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

/* A camera at c looking at l, y up, as three.js lookAt makes it: where a
 * world point lands on a w by h picture, or which way round it is. */
function viewOf(c, l, w, h, fovDeg) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a) => {
    const n = Math.hypot(...a);
    return [a[0] / n, a[1] / n, a[2] / n];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const back = norm(sub(c, l));
  const right = norm(cross([0, 1, 0], back));
  const up = cross(back, right);
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  return (p) => {
    const d = sub(p, c);
    const vx = dot(d, right);
    const vy = dot(d, up);
    const vz = dot(d, back);
    const out = { vx, vy, vz, angle: Math.atan2(vy, vx), behind: vz > 0 && vx * vx + vy * vy < BEHIND_TAN * BEHIND_TAN * vz * vz };
    if (vz < 0) {
      out.x = w / 2 + ((f / (w / h)) * vx / -vz) * (w / 2);
      out.y = h / 2 - (f * vy / -vz) * (h / 2);
    }
    return out;
  };
}
const degBetween = (a, b) => {
  let d = Math.abs(a - b) % (2 * Math.PI);
  d = d > Math.PI ? 2 * Math.PI - d : d;
  return (d * 180) / Math.PI;
};

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const throwTo = (p, at, fresh) => p.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh}, showCraft: true })`);
async function hold(p, at) {
  await throwTo(p, [at[0], at[1] + 40, at[2]], true);
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  await p.sleep(300);
  await throwTo(p, at, false);
}
const frames = (p, k) => p.evaluate(`new Promise((r) => { let n = 0; const f = () => (++n >= ${k} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/* The markers as the page last painted them, and the attackers at the ms
 * they were painted for. */
const markersOf = (p) => p.evaluate(`(() => {
  const m = window.__war().markers;
  return { m, live: m.at == null ? [] : window.__warAt(m.at), canvas: (() => { const c = document.querySelector('canvas.war-markers'); return c ? c.style.display : 'none'; })() };
})()`);

/*
 * Every attacker has its marker where the camera at c looking at l puts
 * it, or its arrow the way round. `behindId`, when given, is one the
 * script put straight behind. Returns a line for the log.
 */
function holdsView(what, got, c, l, behindId = null) {
  const { m, live } = got;
  const proj = viewOf(c, l, m.w, m.h, FOV);
  const marked = new Map(m.marks.map((k) => [k.id, k]));
  const arrowOf = new Map();
  for (const a of m.arrows) {
    for (const id of a.ids) {
      arrowOf.set(id, a);
    }
  }
  const bad = [];
  let worstPx = 0;
  let worstDeg = 0;
  for (const a of live) {
    /* A Hunter's pose is interpolated from what has come in by now, so
     * its marker is held to the pose it was drawn at. */
    const drawn = marked.get(a.id);
    const pr = proj(a.kind === 'hunter' && drawn ? drawn.p : a.p);
    const inside = pr.vz < -0.5 && pr.x >= IN_PX + 2 && pr.x <= m.w - IN_PX - 2 && pr.y >= IN_PX + 2 && pr.y <= m.h - IN_PX - 2;
    if (drawn) {
      const off = Math.hypot(drawn.x - pr.x, drawn.y - pr.y);
      worstPx = Math.max(worstPx, off);
      if (!(off <= MARK_PX)) {
        bad.push(`${a.kind} ${a.id} marked ${off.toFixed(1)} px off`);
      }
      continue;
    }
    const arrow = arrowOf.get(a.id);
    if (!arrow) {
      bad.push(`${a.kind} ${a.id} has neither marker nor arrow`);
      continue;
    }
    if (inside) {
      bad.push(`${a.kind} ${a.id} is in plain view at ${pr.x.toFixed(0)},${pr.y.toFixed(0)} but has an arrow`);
    }
    const want = pr.behind ? -Math.PI / 2 : pr.angle;
    const d = degBetween(arrow.angle, want);
    worstDeg = Math.max(worstDeg, d);
    if (!(d <= ARROW_DEG)) {
      bad.push(`${a.kind} ${a.id} arrow ${(arrow.angle * 180 / Math.PI).toFixed(1)} deg, its way ${(want * 180 / Math.PI).toFixed(1)}`);
    }
    if (a.id === behindId && !(pr.behind && Math.abs(arrow.y - (m.h - 46)) < 1)) {
      bad.push(`${a.kind} ${a.id} straight behind, arrow at ${arrow.x.toFixed(0)},${arrow.y.toFixed(0)}`);
    }
  }
  const listed = new Set([...marked.keys(), ...arrowOf.keys()]);
  const extra = [...listed].filter((id) => !live.some((a) => a.id === id));
  if (extra.length) {
    bad.push(`drawn but not live: ${extra}`);
  }
  check(`${what}: every live attacker has its marker within ${MARK_PX} px or its arrow within ${ARROW_DEG} deg`, live.length > 0 && bad.length === 0,
    `${live.length} live, ${m.marks.length} marked, ${m.arrows.length} arrows (${m.arrows.map((a) => a.n).join('+')}), worst ${worstPx.toFixed(2)} px, ${worstDeg.toFixed(2)} deg${bad.length ? `; ${bad.slice(0, 4).join('; ')}` : ''}`);
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-warmarks-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const roomWarOf = () => {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
  return room ? room.host.core.war : null;
};
console.log(`War markers on one page, rooms at ${rooms}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed: seed() });
const warOf = () => page.evaluate('window.__war()');
const nowOf = () => page.evaluate('window.__rooms().roomNow');

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  console.log(`  info  room ${code}, flying`);

  await frames(page, 10);
  const before = await markersOf(page);
  check('before the war nothing is drawn', !before.m.on && before.canvas === 'none', `on ${before.m.on}, canvas ${before.canvas}`);
  await shot(page, '0-before-the-war');

  await page.evaluate("window.__warDo('start', 'itaipu-drill')");
  await page.until("window.__war().view.state === 'live'", 30000);
  const goAt = (await warOf()).view.goAt;
  const seat = (await warOf()).seat;
  /* Up over the dam, out of every route's way, until the FPV swarm is up
   * the gorge: a scout, Strikers and the swarm alive at once. */
  const perch = [100, 520, -1300];
  await hold(page, perch);
  const t1 = goAt + (itaipu1.waves.find((w) => w.kind === 'fpv').at + 4) * 1000;
  await page.until(`window.__rooms().roomNow > ${t1}`, (t1 - (await nowOf())) + 30000);

  /* Parked 400 m from the nearest attacker, looking at it. */
  const live1 = await page.evaluate(`window.__warAt(window.__rooms().roomNow)`);
  console.log(`  info  live at go+${Math.round(((await nowOf()) - goAt) / 1000)} s: ${live1.map((a) => `${a.kind} ${a.id}`).join(', ')}`);
  const near = live1.reduce((b, a) => (Math.hypot(...a.p.map((v, i) => v - perch[i])) < Math.hypot(...b.p.map((v, i) => v - perch[i])) ? a : b));
  const dir = near.p.map((v, i) => perch[i] - v);
  const dn = Math.hypot(...dir);
  const cam = near.p.map((v, i) => v + (dir[i] / dn) * 400);
  const look = near.p;
  const setCam = (c, l) => page.evaluate(`window.__setCam(${c.join(', ')}, ${l.join(', ')}, ${FOV}); true`);
  /* The camera moves on the frame after; the markers are read two frames
   * on, and the look point is fixed while the attacker flies on. */
  await setCam(cam, look);
  await frames(page, 3);
  holdsView('parked facing a contact', await markersOf(page), cam, look);
  await shot(page, '1-parked-facing-a-contact');

  /* The same contact straight behind a camera 300 m off it, looking
   * away. It flies on, so the camera is re-parked on it each frame. */
  const behind = await page.evaluate(`(async () => {
    const id = ${near.id};
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    let c = null;
    let l = null;
    for (let k = 0; k < 4; k += 1) {
      const a = window.__warAt(window.__rooms().roomNow).find((x) => x.id === id);
      c = [a.p[0] + 300, a.p[1] + 20, a.p[2]];
      l = [c[0] + 300, c[1] + 20, c[2]];
      window.__setCam(...c, ...l, ${FOV});
      await frame();
    }
    return { c, l };
  })()`);
  /* Held still for the read: the contact's drift over three frames, a
   * few metres at 300 m, is well inside the behind cone. */
  await frames(page, 3);
  holdsView('a contact straight behind', await markersOf(page), behind.c, behind.l, near.id);
  await shot(page, '2-a-contact-straight-behind');

  /* The pilot's own camera: nothing parked. */
  await page.evaluate('window.__setCam(null); true');
  await frames(page, 4);
  const fpv = await markersOf(page);
  const fpvIds = new Set([...fpv.m.marks.map((k) => k.id), ...fpv.m.arrows.flatMap((a) => a.ids)]);
  check('the pilot\'s FPV camera: a marker or an arrow for every live attacker', fpv.live.length > 0 && fpv.live.every((a) => fpvIds.has(a.id)) && fpvIds.size === fpv.live.length,
    `${fpv.live.length} live, ${fpv.m.marks.length} marked, ${fpv.m.arrows.length} arrows`);
  await shot(page, '3-fpv-camera');
  const inWar = fpv.m.cost;
  console.log(`  info  in the war (${fpv.live.length} attackers): ${inWar.meanMs.toFixed(3)} ms mean, ${inWar.p95Ms.toFixed(3)} ms p95, ${inWar.worstMs.toFixed(3)} ms worst over ${inWar.frames} frames`);

  /* Up the gorge for the Hunters (edge/rooms/warhunt.js: the nearest
   * defender within TARGET_RANGE_M). */
  const hw = itaipu1.waves.find((w) => w.kind === 'hunter');
  const h0 = itaipu1.routes[hw.route][0];
  const gorge = [h0[0], h0[1] + 100, h0[2] - 400];
  /* The Hunters' round starts when the rounds before it end (war.js). */
  await page.until(`window.__war().view.round === ${(hw.round ?? 0) + 1} && window.__war().view.roundState === 'live'`, 600000);
  const hunterAt = (await nowOf()) + hw.at * 1000;
  await page.until(`window.__rooms().roomNow > ${hunterAt - 8000}`, (hunterAt - (await nowOf())) + 30000);
  await hold(page, gorge);
  let roomOnMe = null;
  let shownOnMe = null;
  let wireOnMe = null;
  let pictured = false;
  const deadline = hunterAt + 90000;
  while ((await nowOf()) < deadline && !pictured) {
    const w = roomWarOf();
    const hs = w && w.hunters ? w.hunters.save().hunters : [];
    const onMe = hs.filter((h) => h.target === seat);
    const got = await markersOf(page);
    const heard = got.live.find((a) => a.kind === 'hunter' && a.hunts === seat);
    if (heard && !wireOnMe) {
      wireOnMe = { id: heard.id, roomHas: onMe.some((h) => h.id === heard.id) };
    }
    if (onMe.length && !roomOnMe) {
      roomOnMe = { ids: onMe.map((h) => h.id), at: await nowOf() };
    }
    if (onMe.length && got.m.hunted && onMe.some((h) => h.id === got.m.hunted.id)) {
      shownOnMe = got.m.hunted;
      /* Seen from 60 m behind the pilot, the hunter's way in. */
      const h = got.live.find((a) => a.id === shownOnMe.id);
      const d = gorge.map((v, i) => v - h.p[i]);
      const n = Math.hypot(...d);
      const c = gorge.map((v, i) => v + (d[i] / n) * 60 + (i === 1 ? 10 : 0));
      await setCam(c, gorge);
      await frames(page, 3);
      await shot(page, '4-a-hunter-on-you');
      await page.evaluate('window.__setCam(null); true');
      await frames(page, 3);
      await shot(page, '5-a-hunter-on-you-fpv');
      pictured = true;
    }
    if ((await warOf()).log.some((e) => e.type === 'boom' && e.mine)) {
      break;
    }
    await page.sleep(250);
  }
  console.log(`  info  the room had a Hunter on seat ${seat}: ${roomOnMe ? `${roomOnMe.ids} from go+${Math.round((roomOnMe.at - goAt) / 1000)} s` : 'never'}`);
  check('a Hunter the room has on this pilot shows the warning', Boolean(roomOnMe && shownOnMe), shownOnMe ? `hunter ${shownOnMe.id} at ${Math.round(shownOnMe.dist)} m` : 'no warning while the room had one on this seat');
  check('the page heard the room\'s target for it on the wire (HUNTS), the hunter the room has on this seat', Boolean(wireOnMe && wireOnMe.roomHas), JSON.stringify(wireOnMe));

  /* The target heard beats the heading: a hunter nosed at the aircraft
   * but chasing another seat is no warning, one flying away but chasing
   * this seat is, and with nothing heard the heading decides. */
  const rule = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { createWarMarkers } = await import('/src/ui/warmarkers.js');
    const cam = new THREE.PerspectiveCamera(${FOV}, 1280 / 720, 0.1, 20000);
    cam.position.set(0, 400, 0);
    cam.lookAt(0, 380, -1000);
    cam.updateMatrixWorld();
    const mk = createWarMarkers(cam, { clientWidth: 1280, clientHeight: 720 });
    /* The paint is a microtask after update(), so shown() waits for it. */
    const at = async (hunts, q) => {
      const a = { id: 1, kind: 'hunter', p: [0, 400, -600], q };
      if (hunts !== undefined) {
        a.hunts = hunts;
      }
      mk.update([a], 0, null, null, 0, 400, 0, 3);
      await null;
      return mk.shown().hunted ? mk.shown().hunted.id : null;
    };
    const toMe = [0, 1, 0, 0];
    const away = [0, 0, 0, 1];
    const out = {
      nosedOther: await at(2, toMe), awayMine: await at(3, away), nosedNone: await at(null, toMe), nosedUnheard: await at(undefined, toMe), awayUnheard: await at(undefined, away),
    };
    mk.clear();
    return out;
  })()`);
  check('a heard target decides the warning over the heading; unheard, the heading does', rule.nosedOther === null && rule.awayMine === 1 && rule.nosedNone === null
    && rule.nosedUnheard === 1 && rule.awayUnheard === null, JSON.stringify(rule));
  /* Mission 3's decoys: marked as a Striker, tag and colour, until 300 m
   * (src/ui/warmarkers.js DECOY_M), and as a decoy inside it. */
  const decoy = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { createWarMarkers } = await import('/src/ui/warmarkers.js');
    const cam = new THREE.PerspectiveCamera(${FOV}, 1280 / 720, 0.1, 20000);
    cam.position.set(0, 400, 0);
    cam.lookAt(0, 400, -1000);
    cam.updateMatrixWorld();
    const mk = createWarMarkers(cam, { clientWidth: 1280, clientHeight: 720 });
    const q = [0, 0, 0, 1];
    const at = async (d) => {
      const list = [{ id: 1, kind: 'strike', p: [-40, 400, -d], q }, { id: 2, kind: 'decoy', p: [40, 400, -d], q }];
      mk.update(list, 0, [{ type: 'born', agents: list.map((a) => ({ id: a.id, kind: a.kind, target: null })) }], null, 0, 400, 0);
      await null;
      const m = mk.shown().marks;
      const s = m.find((k) => k.id === 1);
      const dc = m.find((k) => k.id === 2);
      return s && dc ? { strike: [s.tag, s.colour], decoy: [dc.tag, dc.colour] } : null;
    };
    const out = { far: await at(1000), near: await at(200) };
    mk.clear();
    return out;
  })()`);
  check('a decoy is marked exactly as a Striker until 300 m, and as a decoy inside it', decoy && decoy.far
    && JSON.stringify(decoy.far.strike) === JSON.stringify(decoy.far.decoy) && decoy.near && decoy.near.decoy[0] !== decoy.near.strike[0],
  JSON.stringify(decoy));
  const radio = (await warOf()).radio;
  console.log(`  info  the radio said: ${radio ? radio.said.join(', ') : 'no radio'}`);

  /* The cost: 60 attackers round a camera at the perch, a third of them
   * Hunters, some in view, most not, one pointed at the aircraft. */
  const bench = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { createWarMarkers } = await import('/src/ui/warmarkers.js');
    const cam = new THREE.PerspectiveCamera(${FOV}, 1280 / 720, 0.1, 20000);
    cam.position.set(0, 400, 0);
    cam.lookAt(0, 380, -1000);
    cam.updateMatrixWorld();
    const view = { clientWidth: 1280, clientHeight: 720 };
    const mk = createWarMarkers(cam, view);
    const kinds = ['hunter', 'strike', 'loiter', 'fpv', 'scout', 'boat'];
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const list = Array.from({ length: 60 }, (_, i) => {
      const a = rnd() * 2 * Math.PI;
      const d = 150 + rnd() * 2800;
      return { id: i + 1, kind: kinds[i % kinds.length], p: [Math.sin(a) * d, 250 + rnd() * 300, -Math.cos(a) * d], q: [0, 0, 0, 1] };
    });
    /* One Hunter nosed at the aircraft, so the warning draws too. */
    list[0].p = [0, 400, -600];
    list[0].q = [0, 1, 0, 0];
    const mission = ${JSON.stringify({ targets: itaipu1.targets })};
    const born = [{ type: 'born', agents: list.map((a) => ({ id: a.id, kind: a.kind, target: a.kind === 'strike' ? 'intake-3' : null })) }];
    mk.update(list, 0, born, mission, 0, 400, 0);
    await null;
    const t0 = performance.now();
    for (let f = 0; f < ${BENCH_FRAMES}; f += 1) {
      for (const a of list) {
        a.p[0] += 0.3;
      }
      mk.update(list, f * 16, null, mission, 0, 400, 0);
      await null;
    }
    const wall = performance.now() - t0;
    const shown = mk.shown();
    mk.clear();
    return { cost: shown.cost, wall, marks: shown.marks.length, arrows: shown.arrows.length, hunted: shown.hunted };
  })()`);
  check(`60 attackers cost under ${COST_MS} ms a frame, update and paint`, bench.cost.meanMs < COST_MS,
    `${bench.cost.meanMs.toFixed(3)} ms mean, ${bench.cost.p95Ms.toFixed(3)} ms p95, ${bench.cost.worstMs.toFixed(3)} ms worst over the last ${bench.cost.frames} of ${BENCH_FRAMES} frames; ${bench.marks} marked, ${bench.arrows} arrows, hunted ${JSON.stringify(bench.hunted)}`);

  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'ended'", 10000);
  await frames(page, 6);
  const after = await markersOf(page);
  check('after the war ends nothing is drawn', !after.m.on && after.canvas === 'none', `on ${after.m.on}, canvas ${after.canvas}`);
  await shot(page, '6-after-the-war');
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  const st = await page.evaluate('JSON.stringify({ war: window.__war && window.__war().view, markers: window.__war && window.__war().markers })').catch((x) => String(x));
  console.log(`  page: ${String(st).slice(0, 1500)}`);
  console.log(`  page errors: ${page.errors.slice(0, 5).join(' | ')}`);
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  await page.close();
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
