/*
 * film-world-check.js: mission 1's intro film plays in mission 1's world,
 * Itaipu, by every way a pilot comes to it, through the real shell and a
 * rooms server of its own (never the live one):
 *
 *   SIM_GPU=1 npm run film:world                 its own rooms server
 *   SIM_GPU=1 npm run film:world -- http://127.0.0.1:8797
 *   SIM_GPU=1 npm run film:world -- --mission=itaipu-2
 *
 * --mission plays another Act 1 mission's film the same three ways. One
 * still in development (src/game/campaign.js ACT1 release) is flown as
 * its developer flies it: the page with ?missions=dev, the check's own
 * rooms server starting missions in development, and the missions before
 * it won in the page's saved campaign, so its Play is offered.
 *
 * A local browser check: it drives headless Chromium, so it is not in
 * checks.yml. One browser, one page, three ways in:
 *
 *   1. PLAY. From home, the Defend the Paraná card, Play on mission 1,
 *      the consent, the room's briefing, Start now: the whole film.
 *   2. A RELOAD in that room while its next briefing's film plays.
 *   3. A JOINER. A room made for the war by another pilot (from node),
 *      joined by its link, the host starting mission 1.
 *
 * Each starts on the title's own world, the Swiss valley, which is what
 * the film used to fly over (the owner, 2026-10-04: "for mission 1 for
 * example in parana, the video actually shows swiss photoreal"). What
 * must hold, sampled a few times a second over every film:
 *   - the standing world is itaipu (window.__map().id, the view's own id,
 *     not the seat, which said itaipu all along), built, on every sample
 *     the film draws, its preload's black included
 *   - every shot is drawn
 *   - every shot's camera is above the ground under it and within
 *     NEAR_M of the dam: no camera inside the terrain or off the map
 *   - the terrain has leaves drawn on every sample
 *   - for PLAY, the world is already itaipu in the lobby, before the
 *     start: built under the lobby, not after the briefing began; and
 *     the host's Watch intro, pressed as the lobby opens, waits for it
 *   - for PLAY, the film starts at once: no rebuild after the lobby, and
 *     no room lead (WORLD_LEAD_MS) held for one, since the screen said
 *     its world stands
 *
 * No page error. No pictures.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { PROTO, ROOM_LEVEL, WAR_JOIN } from '../src/share/roomwire.js';
import { ACT1, released } from '../src/game/campaign.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { filmFor } from '../src/share/war/films/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const MAP = 'itaipu';
/* The dam's crest, scene metres (src/render/warintro.js DAM). */
const DAM = [59, 212, -1672];
/* Every camera of the film's ten shots sits within 2.2 km of the dam
 * (measured 2026-10-04, the farthest the dawn shot's); the map is 12 km
 * across, so a camera past this is not looking at Itaipu's works. */
const NEAR_M = 4000;
/* Above the surface under it (the map's height, the dam's deck where
 * the deck is), metres: the shell camera's near plane (src/render/
 * shell.js), inside which the surface is cut open. The deck shots sit
 * lowest on purpose, the props' close up 0.26 m over the deck. */
const CLEAR_M = 0.2;
/* The film's first frame on a screen whose world stood under the lobby:
 * the room's view reaching the page and a frame, never a rebuild's lead
 * (edge/rooms/war.js WORLD_LEAD_MS, 8 s). */
const LEAD_SLACK_MS = 1500;

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

async function click(page, selector) {
  await page.loaded();
  const at = await page.evaluate(`(() => {
    const n = document.querySelector(${JSON.stringify(selector)});
    if (!n) { return null; }
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!at) {
    throw new Error(`nothing to click at ${selector}`);
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x: at[0], y: at[1], button: 'left', clickCount: 1,
    }, page.sessionId);
  }
  await page.sleep(150);
}

const SAMPLE = `(() => {
  const m = window.__map();
  const i = window.__warIntro();
  const w = window.__war().view;
  return {
    map: m.id, ready: m.ready, war: w.state, match: w.id, briefAt: w.briefAt, leaves: m.terrain ? m.terrain.leaves : null,
    intro: i && { for: i.for, film: i.film, shot: i.shot, t: Math.round(i.t), ms: i.ms, n: i.shots.length, ids: i.shots.map((s) => s.id), camera: i.camera, ground: i.ground, orbit: Boolean(i.orbit) },
  };
})()`;

/* Every sample of one briefing's film, until the room leaves the
 * briefing or limitMs passes. */
async function watch(page, limitMs) {
  const samples = [];
  const end = Date.now() + limitMs;
  while (Date.now() < end) {
    const s = await page.evaluate(SAMPLE).catch(() => null);
    if (s) {
      samples.push(s);
      if (samples.some((x) => x.war === 'briefing' && x.intro) && s.war !== 'briefing') {
        break;
      }
    }
    await page.sleep(200);
  }
  return samples;
}

/* What every film must hold, from its samples. `whole` asks for every
 * shot, which a reload part way through cannot see. */
function judge(label, samples, whole) {
  const film = samples.filter((s) => s.intro && s.intro.for !== 'watch' && !s.intro.orbit);
  check(`${label}: the film played`, film.length > 0, `${samples.length} samples, last ${JSON.stringify(samples.at(-1))}`);
  if (!film.length) {
    return;
  }
  const own = filmFor(MISSIONS[MISSION]).id;
  const other = [...new Set(film.map((s) => s.intro.film).filter((f) => f !== own))];
  check(`${label}: the film is ${MISSION}'s own, ${own}`, other.length === 0, other.join(', '));
  const off = film.filter((s) => s.map !== MAP || !s.ready);
  check(`${label}: every sample of the film is drawn in ${MAP}, built`, off.length === 0,
    `${film.length} samples; off: ${off.slice(0, 3).map((s) => `${s.map} ready ${s.ready} shot ${s.intro.shot}`).join(' | ')}`);
  const shots = new Map();
  for (const s of film) {
    if (s.intro.shot >= 0) {
      const list = shots.get(s.intro.shot) ?? [];
      list.push(s);
      shots.set(s.intro.shot, list);
    }
  }
  const n = film[0].intro.n;
  const ids = film[0].intro.ids;
  if (whole) {
    const missing = ids.filter((id, k) => !shots.has(k));
    check(`${label}: all ${n} shots drawn`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : ids.join(', '));
  }
  const rows = [];
  let low = null;
  let far = null;
  for (const [k, list] of [...shots.entries()].sort((a, b) => a[0] - b[0])) {
    let clear = Infinity;
    let dist = 0;
    for (const s of list) {
      const [x, y, z] = s.intro.camera;
      clear = Math.min(clear, y - s.intro.ground);
      dist = Math.max(dist, Math.hypot(x - DAM[0], z - DAM[2]));
    }
    rows.push(`${ids[k]} clear ${clear.toFixed(1)} m, ${Math.round(dist)} m off the dam`);
    if (clear < CLEAR_M && !low) {
      low = `${ids[k]} ${clear.toFixed(2)} m`;
    }
    if (dist > NEAR_M && !far) {
      far = `${ids[k]} ${Math.round(dist)} m`;
    }
  }
  console.log(`    ${rows.join('\n    ')}`);
  check(`${label}: every shot's camera at least ${CLEAR_M} m above the ground under it`, !low, low || '');
  check(`${label}: every shot's camera within ${NEAR_M} m of the dam`, !far, far || '');
  const bare = film.filter((s) => !(s.leaves > 0));
  check(`${label}: the terrain drawn on every sample`, bare.length === 0, bare.length ? `${bare.length} samples with no leaves` : '');
}

const MISSION = (process.argv.find((a) => a.startsWith('--mission=')) ?? '--mission=itaipu-1').slice('--mission='.length);
const N = ACT1.findIndex((m) => m.id === MISSION) + 1;
if (N < 1) {
  throw new Error(`film-world-check: ${MISSION} is not an Act 1 mission`);
}
const DEV = !released(MISSION);
const DEV_Q = DEV ? '&missions=dev' : '';
/* The missions before it won, so the campaign offers its Play. */
const seed = [`(() => {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  if (!s.filmWorldSeeded) {
    const missions = Object.fromEntries(${JSON.stringify(ACT1.slice(0, N - 1).map((m) => m.id))}.map((id) => [id, { stars: 3, won: true, credits: 300 }]));
    localStorage.setItem('webfpv.settings.v3', JSON.stringify({ ...s, filmWorldSeeded: true, campaign: { ...(s.campaign || { v: 1 }), missions } }));
  }
})();`];
const server = await roomsServer(process.argv.slice(2).find((a) => !a.startsWith('--')), 'film-world', { devMissions: DEV });
console.log(`Mission ${N}'s film (${MISSION}${DEV ? ', in development' : ''}) in its world, rooms at ${server.url}`);
const page = await openPage({
  root, url: `/index.html?rooms=${encodeURIComponent(server.url)}${DEV_Q}`, width: 1280, height: 720, seed: N > 1 ? seed : undefined,
});
let host = null;
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelector('.gate-card-campaign')", 60000).catch(() => {});
  const boot = await page.evaluate('window.__map().id');
  check('the title stands on the Swiss valley, the world the film used to fly over', boot === 'swiss2', boot);

  /* 1. PLAY, from home. */
  await page.sleep(1000);
  await click(page, '.gate-card-campaign');
  await page.until(`document.querySelector('[data-mission="${MISSION}"] .campaign-play')`, 15000);
  await click(page, `[data-mission="${MISSION}"] .campaign-play`);
  await page.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && !document.querySelector('.campaign-box'); })()", 15000);
  await page.sleep(700);
  await page.tap('Enter');
  await page.until(`window.__rooms().phase === 'open' && window.__ui.screen === 'friends' && /Mission ${N}: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 60000);
  /* The host's Watch intro, pressed the moment the lobby is up: it waits
   * for the room's world, then plays in it. */
  await page.evaluate("window.__ui.act('friends-war-intro')");
  const early = [];
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    const s = await page.evaluate(SAMPLE);
    early.push(s);
    if (s.intro && s.intro.for === 'watch') {
      break;
    }
    await page.sleep(200);
  }
  const shown = early.filter((s) => s.intro);
  check('Watch intro pressed while the world is built waits for it, then plays in it',
    shown.length > 0 && shown.every((s) => s.map === MAP && s.ready), `${early.length} samples; first ${JSON.stringify(early[0])}; shown ${JSON.stringify(shown[0])}`);
  await page.until(`window.__map().id === '${MAP}' && window.__map().ready`, 180000).catch(() => {});
  const lobby = await page.evaluate("({ map: window.__map().id, ready: window.__map().ready, screen: window.__ui.screen, war: window.__war().view.state })");
  check('the room\'s world is built under its lobby, before the start, and the pilot is still on the room screen',
    lobby.map === MAP && lobby.ready && lobby.screen === 'friends' && lobby.war === 'lobby', JSON.stringify(lobby));
  const switches = await page.evaluate('window.__war().night.length');
  await page.evaluate("window.__ui.act('friends-war-start')");
  const played = await watch(page, 240000);
  judge('play', played, true);
  /* No black for a rebuild nobody needs: the world stood under the lobby
   * and the screen said so (op 'world'), so the room starts the film at
   * once, its preload's title the only black before the first shot. The
   * room's lead was eight seconds of black before every film (measured
   * -7.9 s on the first frame, 5 October). */
  const firstFilm = played.find((x) => x.intro && x.intro.for !== 'watch');
  check(`play: the film starts at once, with no lead for a rebuild (first frame's film clock over -${LEAD_SLACK_MS} ms)`,
    Boolean(firstFilm) && firstFilm.intro.t > -LEAD_SLACK_MS, firstFilm ? `t ${firstFilm.intro.t} ms, briefAt ${firstFilm.briefAt}` : 'no film');
  const rebuilt = (await page.evaluate('window.__war().night')).slice(switches);
  check('play: no world rebuilt between the lobby and the film', rebuilt.length === 0, JSON.stringify(rebuilt));

  /* 2. A RELOAD in the room, part way through the next briefing's film.
   * The war started above runs on; the host ends it, starts mission 1
   * again, and reloads ten seconds into its film. */
  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'lobby' || window.__war().view.state === 'ended'", 30000).catch(() => {});
  const code = await page.evaluate('window.__rooms().code');
  await page.until("window.__war().view.state === 'lobby'", 30000).catch(() => {});
  await page.evaluate("window.__ui.act('friends-war-start')");
  await page.until("window.__warIntro() && window.__warIntro().shot >= 1", 120000);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.sleep(1500);
  await page.until('window.__shellReady === true', 300000);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === '${code}'`, 60000).catch(() => {});
  judge('reload', await watch(page, 240000), false);

  /* 3. A JOINER: a room another pilot made for the war, by its link. */
  await page.evaluate("window.__warDo('end')");
  const made = await fetch(`${server.url}/v2/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      map: MAP, friendly: false, public: false, name: null, mode: 'war', mission: MISSION,
    }),
  }).then((r) => r.json());
  host = new WebSocket(`${server.url.replace(/^http/, 'ws')}/v2/room/${made.code}`, { headers: { origin: 'https://fdflabs.github.io' } });
  await new Promise((resolve, reject) => {
    host.on('open', resolve);
    host.on('error', reject);
  });
  host.send(JSON.stringify({
    type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, war: WAR_JOIN, name: [2, 2, 12],
    profile: { airframe: '7inch', map: MAP, figure: 0, livery: null, parts: null, game: 'war' },
  }));
  await page.cdp.send('Page.navigate', { url: `${page.origin}/index.html?rooms=${encodeURIComponent(server.url)}&room=${made.code}${DEV_Q}` }, page.sessionId);
  await page.sleep(1500);
  await page.until('window.__shellReady === true', 300000);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === '${made.code}'`, 60000);
  const joined = await page.evaluate("({ map: window.__map().id, host: window.__rooms().host === window.__rooms().seat })");
  check('the joiner is in the room, not its host', !joined.host, JSON.stringify(joined));
  host.send(JSON.stringify({ type: 'war', op: 'start', mission: MISSION, intro: true }));
  judge('joiner', await watch(page, 240000), true);

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  if (host) {
    host.close(1000);
  }
  await page.close();
  await server.stop();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
