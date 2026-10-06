/*
 * tag-bubble-two-page.js: Catch the Ace's bubble in two headless pages of
 * the real shell, one room on the Swiss valley. By hand, against a
 * running rooms server:
 *
 *   PORT=8871 ROOMS_DB=/some/scratch/rooms.db node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/tag-bubble-two-page.js http://127.0.0.1:8871 [outdir]
 *
 * SIM_GPU=1 (tests/lib/page.js) where the machine has a GPU: a pose goes
 * out once a frame and the room scores an Ace only across samples GAP_MS
 * (250 ms) apart or closer, so on a busy host the software rasteriser's
 * frames outrun it and the Ace can neither score nor be drawn. The run
 * prints each page's frame time so that is never a guess.
 *
 * A (a red Cub) makes the room, B (a blue Cub) joins, both fly, and A
 * starts a match. Both are held in the air 40 m apart. The hunter is held
 * with its nearest part 6.5 m from the Ace's centre, outside the bubble,
 * long enough that no protection is left: the crown must stay. Then it
 * flies in at 1 m/s, a held step every 100 ms, to 5.5 m, never within
 * 4 m of the Ace's own hull: the room must crown it once any part of it
 * is inside 6 m, and both screens must say so. Then A's crash cam opens
 * the replay: the bubble must be round A, its own craft, before the tag
 * and round B after, where each was held. Pictures of the bubble from the
 * hunter, from the Ace and in the replay go in outdir, which is not in
 * the repository.
 *
 * THE CROWN CHANGING HANDS (the owner: "almost gamelike...kaching"): at
 * the tag both screens ring the coin once (audio.coins), throw the gold
 * burst (src/render/acecrown.js) and put up the banner, gold round the
 * new Ace's screen and red round the old one's, and the replay has the
 * burst and the coin at the tag.
 *
 * THE CHASE BOOST: while the match is live the hunter's plant flies with
 * CHASE_BOOST and the Ace's with none, and the two swap at the tag.
 *
 * THE FREE ORB (the owner: "when a person crashes, their orb just stays
 * in that spot, nobody is ace, and whoever goes and catches it, is the new
 * ace"): the new Ace is thrown into the ground; both screens show nobody
 * the Ace and the free orb, crowned, where it went down, the loose line on
 * the scoreboard and the orb marked; the old Ace flies into it and has the
 * crown, with the coin, the burst and the banner on both screens; and a
 * replay shows the orb and the catch, and its exported soundtrack has the
 * coin in it.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { BUBBLE_M, CHASE_BOOST, PROTECT_MS } from '../src/share/roomtag.js';
import { hullDistance, hullFor } from '../src/game/midair.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8871';
const outDir = process.argv[3] || join(root, 'build', 'tag-bubble-two-page');

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

const GOAL = 60;
const UP = 60;
const AIR = 'cub1400';
/* A hold's attitude, yaw 90: nose toward -x, span along z. */
const HOLD_Q = { qx: 0, qy: Math.SQRT1_2, qz: 0, qw: Math.SQRT1_2 };
const hull = hullFor(AIR);
/* How far a held Cub dz beside a point, on z, is from it: the referee's
 * own measure, its nearest part box. */
const reachAt = (dz) => hullDistance(hull, { px: 0, py: 0, pz: dz, ...HOLD_Q }, 0, 0, 0);
/* The side offset that puts that at d, by bisection: it only grows. */
function offsetFor(d) {
  let lo = 0;
  let hi = 20;
  while (hi - lo > 1e-6) {
    const mid = (lo + hi) / 2;
    if (reachAt(mid) < d) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

function seedFor(colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIR);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.livery = { [AIR]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const tagOf = (p) => p.evaluate('window.__roomTag()');
const bubbles = (p) => p.evaluate('window.__aceBubbles()');
const hold = (p, at) => p.evaluate(`window.__crashThrow({ x: ${at.x}, y: ${at.y}, z: ${at.z}, yaw: 90, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, showCraft: true })`);
/* The crown's moment on a page: coins rung, bursts thrown, the banners
 * and flashes it showed. */
const moment = async (p) => {
  const t = await tagOf(p);
  return {
    coins: t.coin.struck, voice: t.coin.voice, plays: t.fx.plays, shouts: t.shouts, flashes: t.flashes,
  };
};
/* Shoot the moment `expr` holds on page p, polled every frame or so. */
async function shotWhen(p, expr, name) {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    if (await p.evaluate(expr).catch(() => false)) {
      await shot(p, name);
      return true;
    }
    await p.sleep(40);
  }
  return false;
}
const dist = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.y, p[2] - q.z);
const H = 'window.__crashCam.h()';

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`Catch the Ace's bubble in two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
const pages = [a, b];
const names = ['A', 'B'];
try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 400000);
    /* A key, the gesture a browser wants before it makes a sound, so the
     * coin has a voice to ring (scripts/combat-two-page.js does the same). */
    await p.tap('KeyZ');
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const seats = [await a.evaluate('window.__rooms().seat'), await b.evaluate('window.__rooms().seat')];
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  check('no bubble before a match', (await bubbles(a)).length === 0 && (await bubbles(b)).length === 0);

  await a.evaluate(`window.__roomTagDo('tag-start', ${GOAL})`);
  for (const p of pages) {
    await p.until("['ace', 'hunter'].includes(window.__roomTag().role)", 30000);
  }
  const go = await tagOf(a);
  check('the room judges by the bubble, and says how big', go.view.bubble === BUBBLE_M, String(go.view.bubble));
  /* Up, held, 40 m apart, straight after the go; the throws are
   * teleports, so both wait out the room's spawn protection, and the Ace
   * its own. Who the Ace is is read after that: on a slow rasteriser the
   * go's first seconds can pass with the two still side by side on their
   * slots, well inside 6 m, and the crown can change hands there. */
  const self = await a.evaluate('window.__craftState()');
  const heldAt = [{ x: self.worldX, y: self.worldY + UP, z: self.worldZ - 80 }];
  heldAt.push({ ...heldAt[0], z: heldAt[0].z + 40 });
  await hold(a, heldAt[0]);
  await hold(b, heldAt[1]);
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', 15000);
  }
  await a.sleep(Math.max(SPAWN_MS, PROTECT_MS) + 500);
  const settled = await tagOf(a);
  const aceIdx = seats.indexOf(settled.view.ace);
  check('held apart, one of the two is the Ace', aceIdx >= 0, JSON.stringify(settled.view.crowns));
  const ace = pages[aceIdx];
  const hunter = pages[1 - aceIdx];
  const aceName = names[aceIdx];
  const huntName = names[1 - aceIdx];
  const m = heldAt[aceIdx];
  const crownsAt = settled.view.crowns.length;
  console.log(`  info  seats A ${seats[0]}, B ${seats[1]}; ${aceName} is the Ace, ${crownsAt} crowns so far`);
  await hold(hunter, { ...m, z: m.z + 40 });
  /* A pose goes out once a frame, and the room scores the Ace only across
   * two samples GAP_MS (250 ms) or less apart: a page slower than that is
   * an Ace that cannot be caught, and scores nothing. Said, not assumed. */
  const frameMs = async (p) => p.evaluate(`new Promise((ok) => { const t = []; const f = (x) => { t.push(x); if (t.length < 21) { requestAnimationFrame(f); } else { ok((t[20] - t[0]) / 20); } }; requestAnimationFrame(f); })`);
  console.log(`  info  frame ${(await frameMs(ace)).toFixed(0)} ms on the Ace's page, ${(await frameMs(hunter)).toFixed(0)} ms on the hunter's`);
  const [liveA, liveH] = [await bubbles(ace), await bubbles(hunter)];
  check(`the Ace's own screen draws one bubble, ${BUBBLE_M} m, round its own craft`, liveA.length === 1 && liveA[0].r === BUBBLE_M && dist(liveA[0].at, m) < 0.05,
    liveA.map((x) => `${x.r} m at ${dist(x.at, m).toFixed(3)} m`).join());
  check('and the hunter\'s round the Ace as it draws it', liveH.length === 1 && liveH[0].r === BUBBLE_M && dist(liveH[0].at, m) < 0.5,
    liveH.map((x) => `${x.r} m at ${dist(x.at, m).toFixed(3)} m, level ${x.level.toFixed(2)}`).join());

  const [boostAce, boostHunter] = [await tagOf(ace), await tagOf(hunter)];
  check(`the chase boost: the hunter's plant flies with ${CHASE_BOOST}, the Ace's with none, and the hunter is told`,
    boostHunter.boost === CHASE_BOOST && boostAce.boost === 1 && boostHunter.hud && /Chase boost \+5%/.test(boostHunter.hud.chip) && !(boostAce.hud && boostAce.hud.chip),
    `hunter ${boostHunter.boost} "${boostHunter.hud && boostHunter.hud.chip}", Ace ${boostAce.boost}`);

  /* 6.5 m: held there past the room's teleport protection and more. */
  const out = { ...m, z: m.z + offsetFor(6.5) };
  await hold(hunter, out);
  const outAt = await hunter.evaluate('window.__rooms().roomNow');
  await hunter.sleep(SPAWN_MS + 3000);
  const still = await tagOf(a);
  check('a hunter held 6.5 m from the Ace\'s centre, 3 s past its own protection, takes nothing', still.view.ace === settled.view.ace && still.view.crowns.length === crownsAt,
    `${still.view.crowns.length} crowns, held ${Math.round((await a.evaluate('window.__rooms().roomNow')) - outAt)} ms`);
  const near = await bubbles(hunter);
  check('the bubble is brighter with the hunter at its edge than 40 m off', near.length === 1 && liveH.length === 1 && near[0].level > liveH[0].level * 1.3,
    `${liveH[0] && liveH[0].level.toFixed(2)} to ${near[0] && near[0].level.toFixed(2)}`);

  /* The pictures before the tag. From the hunter: behind it and a little
   * up, looking at the Ace through its bubble's edge. */
  await hunter.evaluate(`window.__setCam(${out.x + 9}, ${out.y + 3}, ${out.z + 9}, ${m.x}, ${m.y}, ${m.z}, 60); true`);
  await ace.evaluate(`window.__setCam(${m.x + 16}, ${m.y + 5}, ${m.z - 12}, ${m.x}, ${m.y}, ${m.z + 2}, 60); true`);
  await hunter.sleep(800);
  await shot(hunter, `1-hunter-${huntName}-sees-the-ace-bubble`);
  await shot(ace, `2-ace-${aceName}-sees-its-own-bubble`);
  await ace.evaluate('window.__setCam(null); true');
  await ace.sleep(500);
  await shot(ace, `3-ace-${aceName}-own-flight-view`);
  await hunter.evaluate('window.__setCam(null); true');

  /* In at 1 m/s, a held step every 100 ms, 6.5 m to 5.5 m, with the old
   * Ace's camera on where the hunter comes in, for the burst. */
  const before = [await moment(ace), await moment(hunter)];
  await ace.evaluate(`window.__setCam(${m.x + 14}, ${m.y + 4}, ${m.z - 10}, ${m.x}, ${m.y}, ${m.z + 4}, 60); true`);
  const steps = [];
  for (let dm = 64; dm >= 55; dm -= 1) {
    const d = dm / 10;
    const at = { ...m, z: m.z + offsetFor(d) };
    await hold(hunter, at);
    steps.push({ d, t: await hunter.evaluate('window.__rooms().roomNow'), at });
    await hunter.sleep(100);
  }
  const hunterSeat = seats[1 - aceIdx];
  const burstShot = await shotWhen(ace, 'window.__roomTag().fx.sparks && window.__roomTag().fx.ring',
    `4a-old-ace-${aceName}-sees-the-burst-and-banner`);
  await shotWhen(hunter, 'window.__roomTag().shout !== ""', `4b-new-ace-${huntName}-banner-gold-edge`);
  for (const p of pages) {
    await p.until(`window.__roomTag().view.ace === ${hunterSeat}`, 20000);
  }
  const after = await Promise.all(pages.map(tagOf));
  const crown = after[0].view.crowns.at(-1);
  const inside = steps.find((s) => s.d <= BUBBLE_M);
  const lastOut = steps.filter((s) => s.d > BUBBLE_M).at(-1);
  check('flying in, the hunter takes the crown once its nearest part is inside 6 m, not before',
    crown.why === 'tag' && crown.seat === hunterSeat && crown.t > lastOut.t && crown.t <= inside.t + 250,
    `tag ${Math.round(crown.t - inside.t)} ms after the step to ${inside.d.toFixed(1)} m, ${Math.round(crown.t - lastOut.t)} ms after the step to ${lastOut.d.toFixed(1)} m`);
  check('without touching: it never came nearer the Ace\'s own hull than 4 m, and no page got a mid air hit',
    reachAt(offsetFor(5.5)) - hull.hull.reach > 4 && (await a.evaluate('window.__rooms().hits.length')) === 0 && (await b.evaluate('window.__rooms().hits.length')) === 0,
    `nearest ${steps.at(-1).d.toFixed(1)} m from the centre`);
  check('both screens have the same crown at the same room time', JSON.stringify(after[0].view.crowns) === JSON.stringify(after[1].view.crowns));
  await a.sleep(400);
  const banners = await Promise.all(pages.map(tagOf));
  check('and each shows the tag, its own way', banners.every((t) => t.banner && t.banner.seat === hunterSeat),
    banners.map((t) => t.banner && t.banner.text).join(' | '));
  const [mAce, mHunter] = [await moment(ace), await moment(hunter)];
  check('the coin rang once on both screens at the tag', mAce.voice && mHunter.voice && mAce.coins === before[0].coins + 1 && mHunter.coins === before[1].coins + 1,
    `old Ace ${before[0].coins} to ${mAce.coins}, new Ace ${before[1].coins} to ${mHunter.coins}`);
  check('and both threw the gold burst, the old Ace\'s drawn in its picture', mAce.plays === before[0].plays + 1 && mHunter.plays === before[1].plays + 1 && burstShot,
    `${mAce.plays - before[0].plays} and ${mHunter.plays - before[1].plays} bursts`);
  check('the new Ace\'s banner says so, its screen edged gold; the old Ace\'s names who took it, edged red',
    /YOU ARE THE ACE/.test(mHunter.shouts.at(-1)) && mHunter.flashes.at(-1) === 'gold'
    && /TOOK YOUR CROWN/.test(mAce.shouts.at(-1)) && mAce.flashes.at(-1) === 'red',
    `"${mHunter.shouts.at(-1)}" ${mHunter.flashes.at(-1)} | "${mAce.shouts.at(-1)}" ${mAce.flashes.at(-1)}`);
  const [bAce, bHunter] = [await tagOf(ace), await tagOf(hunter)];
  check('the chase boost changes hands with the crown', bAce.boost === CHASE_BOOST && bHunter.boost === 1, `old Ace ${bAce.boost}, new Ace ${bHunter.boost}`);
  const moved = await bubbles(ace);
  const newAceAt = steps.at(-1).at;
  check('the bubble moves to the new Ace on the old Ace\'s screen', moved.length === 1 && dist(moved[0].at, newAceAt) < 0.5,
    moved.map((x) => `${dist(x.at, newAceAt).toFixed(3)} m off`).join());
  await ace.evaluate(`window.__setCam(${m.x + 16}, ${m.y + 5}, ${m.z - 12}, ${newAceAt.x}, ${newAceAt.y}, ${newAceAt.z}, 60); true`);
  await ace.sleep(300);
  await shot(ace, `4-old-ace-${aceName}-sees-the-crown-move`);
  /* The old Ace is inside the new one's bubble: away before its
   * protection is out, or it takes the crown straight back. */
  const bench = { ...m, x: m.x + 40 };
  await hold(ace, bench);
  await ace.evaluate('window.__setCam(null); true');
  await ace.sleep(PROTECT_MS + 1000);
  const kept = await tagOf(a);
  check('the old Ace, benched 40 m off, does not take it back', kept.view.ace === hunterSeat, `${kept.view.crowns.length} crowns`);

  /* The replay on the old Ace's page: before the tag the bubble is round
   * its own craft, after it round the hunter, each where it was held. */
  await ace.tap('KeyV');
  await ace.until('window.__crashCam.live()', 10000);
  const dur = (await ace.evaluate(`${H}.view()`)).dur;
  const seen = [];
  for (let t = 0; t <= dur; t += 0.5) {
    await ace.evaluate(`${H}.api.jumpTo(${t})`);
    await ace.until(`${H}.view().drawn === ${t}`, 30000);
    const bs = await bubbles(ace);
    seen.push({ t, b: bs[0] || null, n: bs.length });
  }
  const round = (s, at) => s.b && s.n === 1 && s.b.r === BUBBLE_M && dist(s.b.at, at) < 0.05;
  const onAce = seen.filter((s) => round(s, m));
  const onHunter = seen.filter((s) => s.b && s.n === 1 && s.b.r === BUBBLE_M && dist(s.b.at, newAceAt) < 0.25);
  const lastOnAce = onAce.at(-1);
  const firstOnHunter = onHunter[0];
  check('the replay draws the bubble round the old Ace, its own craft, then round the hunter, as the screen did',
    onAce.length >= 4 && onHunter.length >= 2 && lastOnAce.t < firstOnHunter.t && seen.every((s) => s.n <= 1),
    `round ${aceName}'s own craft ${onAce.length} times to ${lastOnAce && lastOnAce.t} s, round the hunter ${onHunter.length} times from ${firstOnHunter && firstOnHunter.t} s of ${dur.toFixed(1)} s`);
  const tBefore = lastOnAce ? Math.max(0, lastOnAce.t - 0.5) : dur / 2;
  /* The tripod stands where the flight camera was when the replay
   * opened, 40 m off on the bench: outside the bubble, looking in. */
  await ace.evaluate(`${H}.setRig('tripod', -1)`);
  await ace.evaluate(`${H}.api.jumpTo(${tBefore})`);
  await ace.until(`${H}.view().drawn === ${tBefore}`, 30000);
  await ace.sleep(800);
  await shot(ace, `5-replay-${aceName}-tripod-before-the-tag`);
  await ace.evaluate(`${H}.setRig('chase', -1)`);
  await ace.sleep(800);
  await shot(ace, `6-replay-${aceName}-chase-before-the-tag`);
  const evs1 = await ace.evaluate(`${H}.paperEvents()`);
  const tagCrown = evs1.find((e) => e.type === 'crown');
  check('the replay keeps the tag\'s burst and its coin', Boolean(tagCrown) && evs1.some((e) => e.type === 'coin' && Math.abs(e.t - tagCrown.t) < 0.05),
    evs1.map((e) => `${e.type} ${e.t.toFixed(2)}`).join(', '));
  await ace.evaluate(`${H}.api.jumpTo(${tagCrown.t + 0.15})`);
  await ace.until(`${H}.view().drawn === ${tagCrown.t + 0.15}`, 30000);
  const rBurst = await ace.evaluate(`${H}.paper()`);
  check('jumped to just after the tag, the burst is in the air again', rBurst && rBurst.crown && rBurst.crown.sparks && rBurst.crown.ring,
    JSON.stringify(rBurst && rBurst.crown));
  await ace.evaluate(`${H}.setRig('tripod', -1)`);
  await ace.sleep(600);
  await shot(ace, `7-replay-${aceName}-the-tag-burst`);
  await ace.tap('Escape');
  await ace.until("window.__craftState().mode === 'flight'", 30000);

  console.log('the free orb');
  /* The new Ace thrown nose down into the ground under where it was. */
  const gy = await hunter.evaluate(`window.__heightAt(${newAceAt.x}, ${newAceAt.z})`);
  await hold(ace, bench);
  await hunter.evaluate(`window.__crashThrow({ x: ${newAceAt.x}, y: ${gy + 4}, z: ${newAceAt.z}, yaw: 90, pitch: -70, roll: 0, vx: 0, vy: -28, vz: 0, showCraft: true }).ok`);
  await hunter.until('window.__crash().wrecked', 15000).catch(() => {});
  const wreck = await hunter.evaluate('window.__crash()');
  check('the new Ace is a wreck', wreck.wrecked, wreck.flagNames.join(' '));
  for (const p of pages) {
    await p.until('window.__roomTag().orb', 20000);
  }
  const loose = await Promise.all(pages.map(tagOf));
  const orb = loose[0].view.orb;
  check('the crown drops: nobody is the Ace on either screen, the same free orb on both, from the new Ace', loose.every((t) => t.view.ace === null && JSON.stringify(t.view.orb) === JSON.stringify(orb)) && orb.from === hunterSeat
    && Math.hypot(orb.px - newAceAt.x, orb.pz - newAceAt.z) < 6,
  `orb ${[orb.px, orb.py, orb.pz].map((x) => x.toFixed(1)).join(' ')}, ${Math.hypot(orb.px - newAceAt.x, orb.pz - newAceAt.z).toFixed(2)} m across from where it was held`);
  await ace.sleep(500);
  const orbSeen = await Promise.all(pages.map(bubbles));
  check('both screens draw the free orb where it went down, its crown inside', orbSeen.every((bs) => bs.length === 1 && bs[0].orb && dist(bs[0].at, { x: orb.px, y: orb.py, z: orb.pz }) < 0.05),
    orbSeen.map((bs) => bs.map((x) => `${x.orb ? 'orb' : 'bubble'} ${dist(x.at, { x: orb.px, y: orb.py, z: orb.pz }).toFixed(3)} m off`).join()).join(' | '));
  const aLoose = await tagOf(ace);
  const marks = await ace.evaluate('window.__peerMarks()');
  const orbMark = (marks.marks || marks).find ? (marks.marks || marks).find((mk) => mk.seat === 0) : null;
  check('the old Ace\'s scoreboard says the crown is loose, its marks point at the orb, and it flies boosted',
    aLoose.hud && /crown is loose/i.test(aLoose.hud.title) && orbMark && orbMark.role === 'ace' && aLoose.boost === CHASE_BOOST,
    `"${aLoose.hud && aLoose.hud.title}", mark ${JSON.stringify(orbMark && { role: orbMark.role, kind: orbMark.kind })}, boost ${aLoose.boost}`);
  const mDrop = await moment(hunter);
  check('the pilot who dropped it is told, edged red', /crown is loose/i.test(mDrop.shouts.at(-1)) && mDrop.flashes.at(-1) === 'red',
    `"${mDrop.shouts.at(-1)}" ${mDrop.flashes.at(-1)}`);
  await ace.evaluate(`window.__setCam(${orb.px + 16}, ${orb.py + 7}, ${orb.pz - 14}, ${orb.px}, ${orb.py}, ${orb.pz}, 60); true`);
  await ace.sleep(900);
  await shot(ace, `8-old-ace-${aceName}-sees-the-free-orb`);
  await ace.evaluate('window.__setCam(null); true');
  await ace.sleep(300);
  await shot(ace, `9-old-ace-${aceName}-flight-view-orb-marked`);

  console.log('the catch');
  const beforeCatch = [await moment(ace), await moment(hunter)];
  await hunter.evaluate(`window.__setCam(${orb.px - 14}, ${orb.py + 6}, ${orb.pz + 14}, ${orb.px}, ${orb.py + 2}, ${orb.pz}, 60); true`);
  /* The old Ace flies in from the bench at 20 m/s, a held step of 2 m
   * every 100 ms, to 4 m over the orb's centre. */
  const into = { x: orb.px, y: orb.py + 4, z: orb.pz };
  const from = bench;
  const legM = Math.hypot(into.x - from.x, into.y - from.y, into.z - from.z);
  for (let k = 1; k <= Math.ceil(legM / 2); k += 1) {
    const u = Math.min(1, (2 * k) / legM);
    await hold(ace, { x: from.x + (into.x - from.x) * u, y: from.y + (into.y - from.y) * u, z: from.z + (into.z - from.z) * u });
    await ace.sleep(100);
  }
  const catchShot = await shotWhen(hunter, 'window.__roomTag().fx.sparks', `10-crashed-${huntName}-sees-the-catch-burst`);
  for (const p of pages) {
    await p.until(`window.__roomTag().view.ace === ${seats[aceIdx]}`, 20000);
  }
  const caught = (await tagOf(a)).view.crowns.at(-1);
  const [cAce, cHunter] = [await moment(ace), await moment(hunter)];
  check('the old Ace flies into the orb and catches the crown', caught.why === 'catch' && caught.seat === seats[aceIdx] && caught.from === hunterSeat, JSON.stringify(caught));
  check('the coin and the burst on both screens at the catch', cAce.coins === beforeCatch[0].coins + 1 && cHunter.coins === beforeCatch[1].coins + 1
    && cAce.plays === beforeCatch[0].plays + 1 && cHunter.plays === beforeCatch[1].plays + 1 && catchShot,
  `coins ${cAce.coins - beforeCatch[0].coins} and ${cHunter.coins - beforeCatch[1].coins}, bursts ${cAce.plays - beforeCatch[0].plays} and ${cHunter.plays - beforeCatch[1].plays}`);
  check('the banner: you caught the crown, edged gold; the other screen names who did',
    /You caught the crown/.test(cAce.shouts.at(-1)) && cAce.flashes.at(-1) === 'gold' && /caught the crown/.test(cHunter.shouts.at(-1)),
    `"${cAce.shouts.at(-1)}" ${cAce.flashes.at(-1)} | "${cHunter.shouts.at(-1)}"`);
  const [dAce, dHunter] = [await tagOf(ace), await tagOf(hunter)];
  check('the catcher is the Ace and flies unboosted; the orb is gone', dAce.boost === 1 && dHunter.boost === CHASE_BOOST && dAce.view.orb === null,
    `${dAce.boost} ${dHunter.boost}`);
  await hunter.evaluate('window.__setCam(null); true');

  console.log('the orb and the catch in the replay');
  await ace.tap('KeyV');
  await ace.until('window.__crashCam.live()', 10000);
  const dur2 = (await ace.evaluate(`${H}.view()`)).dur;
  const evs2 = await ace.evaluate(`${H}.paperEvents()`);
  const catchCrown = evs2.filter((e) => e.type === 'crown').at(-1);
  const catchCoin = evs2.filter((e) => e.type === 'coin').at(-1);
  check('the replay keeps the catch\'s burst and coin', catchCrown && catchCoin && Math.abs(catchCoin.t - catchCrown.t) < 0.05,
    evs2.map((e) => `${e.type} ${e.t.toFixed(2)}`).join(', '));
  let orbRows = 0;
  for (let t = Math.max(0, catchCrown.t - 6); t < catchCrown.t - 0.1; t += 0.5) {
    const tt = Number(t.toFixed(3));
    await ace.evaluate(`${H}.api.jumpTo(${tt})`);
    await ace.until(`${H}.view().drawn === ${tt}`, 30000);
    const bs = await bubbles(ace);
    orbRows += bs.length === 1 && bs[0].orb && dist(bs[0].at, { x: orb.px, y: orb.py, z: orb.pz }) < 0.05 ? 1 : 0;
  }
  check('before the catch the replay draws the free orb, crowned, where it was', orbRows >= 3, `${orbRows} of the half seconds before it`);
  const tShow = Number((catchCrown.t + 0.15).toFixed(3));
  await ace.evaluate(`${H}.setRig('tripod', -1)`);
  await ace.evaluate(`${H}.api.jumpTo(${tShow})`);
  await ace.until(`${H}.view().drawn === ${tShow}`, 30000);
  await ace.sleep(600);
  await shot(ace, `11-replay-${aceName}-the-catch-burst`);
  const c0 = (await ace.evaluate(`${H}.paper()`)).coins;
  await ace.evaluate(`${H}.api.jumpTo(${Math.max(0, catchCrown.t - 0.3)})`);
  await ace.until(`${H}.view().drawn === ${Math.max(0, catchCrown.t - 0.3)}`, 30000);
  await ace.evaluate(`${H}.api.setSpeed(1)`);
  await ace.tap('Space');
  await ace.until(`${H}.view().t > ${catchCrown.t + 0.1}`, 30000).catch(() => {});
  await ace.tap('Space');
  const c1 = (await ace.evaluate(`${H}.paper()`)).coins;
  check('played through the catch at 1x the coin rings once', c1 === c0 + 1, `${c0} to ${c1}`);
  /* The exported movie's sound, rendered offline as the export renders
   * it: the E6 is there at the catch and not just before it. */
  const band = await ace.evaluate(`(async () => {
    const H = window.__crashCam.h();
    const clip = H.clip();
    const { renderSoundtrack, soundCues } = await import('/src/replay/soundtrack.js');
    const ed = await import('/src/replay/edit.js');
    const { defaults } = await import('/src/replay/cameras.js');
    const edit = ed.defaultEdit(clip.time[clip.n - 1], { rig: 'chase', target: -1, watch: 0, p: defaults('chase', clip.meta.size) });
    const plan = ed.planMovie(edit, 30);
    const cue = soundCues(clip, edit).filter((c) => c.type === 'coin').at(-1);
    const buf = await renderSoundtrack({ clip, edit, plan, audio: window.__audio });
    const d = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const tone = (t0, t1, f) => {
      let re = 0; let im = 0;
      for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i += 1) {
        re += d[i] * Math.cos(2 * Math.PI * f * i / sr);
        im += d[i] * Math.sin(2 * Math.PI * f * i / sr);
      }
      return Math.hypot(re, im) / ((t1 - t0) * sr);
    };
    return { m: cue ? cue.m : null, at: cue ? tone(cue.m + 0.1, cue.m + 0.3, 1319) : 0, pre: cue ? tone(cue.m - 0.3, cue.m - 0.1, 1319) : 0 };
  })()`);
  const lift = 20 * Math.log10((band.at + 1e-12) / (band.pre + 1e-12));
  check('the exported movie\'s soundtrack has the coin: its E6 at the catch, 20 dB over the moment before', band.m != null && lift > 20,
    `E6 at ${band.m != null ? band.m.toFixed(2) : 'none'} s, ${lift.toFixed(1)} dB over the 200 ms before`);
  console.log(`  info  replay ${dur2.toFixed(1)} s`);
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ tag: window.__roomTag(), bubbles: window.__aceBubbles(), mode: window.__craftState && window.__craftState().mode, crash: window.__crash && window.__crash().wrecked })').catch((x) => String(x));
    console.log(`  page ${names[i]}: ${st}`);
    console.log(`  page ${names[i]} errors: ${p.errors.slice(0, 5).join(' | ')}`);
    const rm = await p.evaluate('JSON.stringify({ rooms: (({ seat, spawning, roomNow, peers }) => ({ seat, spawning, roomNow, peers: peers.map((q) => ({ seat: q.seat, drawn: q.drawn, at: q.at })) }))(window.__rooms()), craft: window.__craftState() })').catch((x) => String(x));
    console.log(`  page ${names[i]} rooms: ${rm.slice(0, 1500)}`);
  }
  throw e;
} finally {
  for (const p of pages) {
    await p.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
