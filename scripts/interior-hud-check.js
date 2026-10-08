#!/usr/bin/env node
/*
 * interior-hud-check.js: `SIM_GPU=1 npm run interior:hud -- <outdir>`, the
 * quiet HUD (src/ui/opshud.js) and the role board (src/ui/rolesboard.js)
 * in the real shell (docs/campaign/interior/TECH-NEEDS.md N7, N16).
 *
 * First in Node, the rules as functions: what the HUD may mark of a
 * contact for every state the room can say, which cards a screen shows,
 * what the board offers a seat.
 *
 * Then one headless page: the Bramor on swiss2 looking through its ball,
 * shown room views (CONTRACT-P0.md 4.1) injected into the client with a
 * stand in world that puts contacts at known places in the picture, since
 * track WORLD's map is not on main yet:
 *   - an UNDISCOVERED contact in the middle of the picture gets only the
 *     spotting caret above it: no box, no chip, not one inked pixel of
 *     the HUD's canvas where it stands; the same probe finds ink round a
 *     discovered one, so it can see; once the room discovers it, it gets
 *     its box
 *   - a lost contact gets its last known position, not its place; the
 *     room's search area its circle; bearing hints point only at those
 *   - the stage's cards (a card scoped to another role is not shown), the
 *     mission rule banner, a classification change told as a card event
 *     and on the chip, the boundary warning, the stage's tutorial prompt
 *     cleared by its action (M opens the map)
 *   - the role board: your role and its guide, the free roles, a swap
 *     request with accept and decline, and its buttons send the room the
 *     contract's messages
 *   - the guide (src/share/ops/guide.js), stage by stage of Mission 1 as
 *     the room's view says it: the first flight's card once (keys from
 *     this page's bindings), its two lines, never again once dismissed;
 *     each stage's brief heard on the radio (its element playing); the
 *     objective line with the card's count, which moves when the count
 *     does; a caret on an objective in the picture, an edge chevron
 *     pointing at one off it (within 10 degrees of its direction in the
 *     camera's axes); a nudge after the idle wait; Mission guidance off hides
 *     the line and the marks and keeps the voice; a picture of each
 *     stage at 1280x720 and 390x844
 *   - pictures at every device size, the HUD's panels inside the window
 *     and clear of each other; no page errors
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outArg = process.argv[2];
if (!outArg) {
  throw new Error('interior-hud-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(outArg);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-hud-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

/* The rules, without a page. The HUD and board modules import the
 * strings, which import nothing of the DOM at load. */
console.log('the rules');
{
  const { markOf, cardShown, heldRolesOf } = await import('../src/ui/opshud.js');
  const { boardOf } = await import('../src/ui/rolesboard.js');
  const rows = [
    [{ state: 'undiscovered', cls: null, lkp: null }, null],
    [{ state: 'undiscovered', cls: null, lkp: [1, 2, 0] }, null],
    [{ state: 'seen', cls: null, lkp: null }, null],
    [{ state: 'seen', cls: 'unknown', lkp: [1, 2, 0] }, 'box'],
    [{ state: 'lost', cls: 'poi', lkp: [1, 2, 0] }, 'lkp'],
    [{ state: 'lost', cls: 'poi', lkp: null }, null],
    [{ state: 'vanished', cls: 'poi', lkp: [1, 2, 0] }, null],
  ];
  check('markOf: a mark only for what the room has discovered (seen: box, lost: last known position)', rows.every(([c, want]) => markOf(c) === want),
    rows.map(([c]) => `${c.state}/${c.cls}:${markOf(c)}`).join(' '));
  const view = { roles: { held: { 1: ['isr'], 2: ['tracker:1', 'tracker:2'] } } };
  check('heldRolesOf: role ids from keys', heldRolesOf(view, 2).join() === 'tracker' && heldRolesOf(view, 1).join() === 'isr' && heldRolesOf(view, 9).length === 0);
  check('cardShown: the squad\'s everywhere, a role\'s only where held', cardShown({ roles: null }, []) && cardShown({ roles: ['isr'] }, ['isr']) && !cardShown({ roles: ['tracker'] }, ['isr']));
  const roles = {
    defs: [{ id: 'isr', core: true, guide: 'IBARRA' }, { id: 'tracker', core: false, guide: 'IBARRA' }],
    held: { 1: ['isr'], 2: ['tracker:1'] },
    active: { 1: 'isr', 2: 'tracker:1' },
    locked: false,
    beat: null,
    swaps: [{
      id: 's1', from: 2, to: 1, give: 'tracker:1', take: 'isr', until: 1,
    }],
  };
  const b1 = boardOf(roles, 1);
  check('boardOf: my role, its guide, flown', b1.mine.length === 1 && b1.mine[0].key === 'isr' && b1.mine[0].guide === 'IBARRA' && b1.mine[0].active);
  check('boardOf: free roles are an unheld core role or a new scaling copy', b1.free.map((f) => f.id).join() === 'tracker' && boardOf(roles, 2).free.map((f) => f.id).join() === 'tracker');
  check('boardOf: a request to me with its id; the others\' roles', b1.incoming.length === 1 && b1.incoming[0].id === 's1' && b1.others.length === 1 && b1.others[0].seat === 2);
  check('boardOf: a locked beat or the host\'s lock is said', boardOf({ ...roles, beat: 'briefing' }, 1).why === 'briefing' && boardOf({ ...roles, locked: true }, 1).why === 'host' && !b1.locked);
}

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
Object.assign(seated, {
  map: 'swiss2', graphics: 'low', graphicsAuto: false, fpsCap: 0, airframeAsked: true, wingView: 'ball',
  /* The consent answered: a joiner's is interior:coop's to check. */
  interiorConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(seated)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
} catch (e) { /* storage refused */ }`];

const SIZES = [
  [1280, 720], [1920, 1080], [2560, 1080], [844, 390], [390, 844], [360, 640], [820, 1180], [1180, 820],
];
console.log('the page');
const page = await openPage({
  root, width: 1280, height: 720, url: '/index.html?rooms=off', seed,
});
async function shot(name) {
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
}
async function resize(w, h) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: w < 900,
  }, page.sessionId);
  await page.sleep(700);
}
/* Ink of the HUD's own canvas in a box round a CSS px point: how many
 * pixels are not transparent. */
const inkAt = (x, y, r = 14) => page.evaluate(`(() => {
  const c = document.querySelector('.ops canvas.ops-ink');
  const s = c.width / c.clientWidth;
  const g = c.getContext('2d');
  const x0 = Math.max(0, Math.round((${x} - ${r}) * s));
  const y0 = Math.max(0, Math.round((${y} - ${r}) * s));
  const d = g.getImageData(x0, y0, Math.round(${r} * 2 * s), Math.round(${r} * 2 * s)).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) { n += d[i] > 0 ? 1 : 0; }
  return n;
})()`);

try {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.until('window.__ops.ball() && window.__ops.ball().on', 60000);
  await page.sleep(500);
  /* 300 m up over where it stood, then the physics held (mode paused,
   * the flight screen up), so the picture holds still while the HUD is
   * read against it. */
  const placed = await page.evaluate(`(() => {
    const c = window.__ops.cam();
    const r = window.__placeCraft(c.p[0], c.p[2] + 300, -c.p[1]);
    window.__ui.act('pause');
    window.__ui.show('flight');
    return Boolean(r);
  })()`);
  await page.sleep(900);
  check('the Bramor held 300 m up, its ball the picture', placed && (await page.evaluate('window.__ops.ball().on && window.__ops.cam().p[2]')) > 250);

  /* Where the stand in world puts things: ground points under given
   * picture positions, and a world that walks nobody anywhere. */
  const SPOTS = {
    hidden: [0.15, 0.12], seen: [-0.42, -0.25], lost: [0.4, -0.45], search: [-0.45, 0.42], picked: [0.2, -0.15],
  };
  const spots = await page.evaluate(`(() => {
    const out = {};
    for (const [k, [x, y]] of Object.entries(${JSON.stringify(SPOTS)})) {
      out[k] = window.__ops.groundAtNdc(x, y);
    }
    return out;
  })()`);
  check('the stand in places are on the ground in the picture', Object.values(spots).every(Boolean), JSON.stringify(spots));
  await page.evaluate(`(() => {
    const at = ${JSON.stringify(spots)};
    window.__hudWorld = {
      canopyBlocks: () => false,
      groundAt: () => 0,
      poseOnRoute: (route) => (at[route] ? { x: at[route][0], y: at[route][1], z: at[route][2], heading: 0, action: 'stand' } : null),
    };
    window.__ops.useWorld(window.__hudWorld);
    return true;
  })()`);
  const contact = (id, state, cls, extra = {}) => ({
    id, kind: 'person', group: null, route: id, t0: 0, state, cls, label: null, lkp: null, seenAt: null, lostSince: null, by: [], hards: 0, ...extra,
  });
  const baseView = (over = {}) => ({
    state: 'live',
    id: 7,
    mission: 'interior-1',
    campaign: 'interior',
    goAt: 0,
    briefAt: null,
    f: 0,
    endAt: null,
    why: null,
    stage: {
      id: 'M1_CP_CONTACT_FOUND', n: 3, at: 1000, title: 'ops.interior.m1.s4', text: null, music: null, lockRoles: false,
    },
    cards: [
      {
        id: 'observe', text: 'ops.interior.m1.obj.observe', tier: 'primary', state: 'active', roles: null, star: false,
      },
      {
        id: 'picket', text: 'ops.interior.m1.obj.lookout', tier: 'optional', state: 'active', roles: ['tracker'], star: false,
      },
      {
        id: 'burned', text: 'ops.interior.m1.obj.burned', tier: 'optional', state: 'done', roles: null, star: true, progress: [1, 1],
      },
      {
        id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule', state: 'active', roles: null, star: false,
      },
    ],
    contacts: [
      contact('hidden', 'undiscovered', null),
      contact('seen', 'seen', 'unknown', { by: [1] }),
      contact('lost', 'lost', 'poi', { lkp: spots.lost }),
    ],
    sites: {},
    captures: [],
    flags: {},
    search: [{
      id: 'pair-search', at: [spots.search[0], spots.search[1]], r: 25, contact: 'pair',
    }],
    boundary: {},
    roles: {
      defs: [{
        id: 'isr', core: true, guide: 'IBARRA', platforms: ['bramor2300'],
      }, {
        id: 'tracker', core: false, guide: 'IBARRA', platforms: ['bramor2300'],
      }],
      held: { 1: ['isr'], 2: ['tracker:1'] },
      active: { 1: 'isr', 2: 'tracker:1' },
      locked: false,
      beat: null,
      swaps: [{
        id: 'sw1', from: 2, to: 1, give: 'tracker:1', take: 'isr', until: 99999999,
      }],
    },
    dials: {
      conceal: 'west', mark: 's1', road: 'north', firstOut: 'n',
    },
    result: null,
    checkpoint: null,
    restarted: null,
    ...over,
  });
  /* A click: the gesture a browser wants before sound, as a pilot's own
   * clicks into a room are, so the guide's lines can be heard. */
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.cdp.send('Input.dispatchMouseEvent', {
      type, x: 6, y: 300, button: 'left', clickCount: 1,
    }, page.sessionId);
  }
  await page.evaluate(`(window.__ops.welcome({ seat: 1, code: 'HUD000', ops: ${JSON.stringify(baseView())} }), true)`);
  await page.sleep(900);
  {
    const g = await page.evaluate('window.__ops.guide()');
    const card = (await page.evaluate('window.__opsHud()')).first || '';
    check('first flight: its card is up, with this page\'s own keys (W to throttle up in mode 2, C, Q E Y H, U, SPACE, M)',
      Boolean(g.first) && /FIRST FLIGHT/.test(card) && /THROTTLE UP \(W\) OR L/.test(card) && /Q E · Y H/.test(card) && /SPACE/.test(card),
      JSON.stringify({ card, first: g.first, said: g.said, errors: page.errors.slice(0, 3) }));
    await shot('guide-first-1280x720.png');
    await page.until("window.__audio.warRadio && window.__audio.warRadio.status().started.includes('int-g-first-1')", 15000).catch(() => {});
    const st = await page.evaluate('window.__audio.warRadio ? window.__audio.warRadio.status().started : []');
    check('first flight: the guide says it (int-g-first-1 playing on the radio)', st.includes('int-g-first-1'), JSON.stringify(st));
    await page.tap('Enter');
    await page.sleep(300);
    const after = await page.evaluate("({ g: window.__ops.guide(), card: window.__opsHud().first, seen: window.__ops.guide().firstSeen('interior'), stored: (JSON.parse(localStorage.getItem(" + JSON.stringify(SETTINGS_KEY) + ")).progress || {}).seen || {} })");
    check('first flight: Enter takes it down and the pilot\'s progress keeps it seen (synced progress.seen)',
      !after.g.first && !after.card && after.seen && after.stored['guide:first:interior'] === true, JSON.stringify(after.stored));
  }
  const hud = await page.evaluate('window.__opsHud()');
  const px = await page.evaluate(`(() => {
    const at = ${JSON.stringify(spots)};
    const out = {};
    for (const k of Object.keys(at)) { out[k] = window.__ops.project([at[k][0], at[k][1], at[k][2] + 0.85]); }
    return out;
  })()`);
  check('the HUD is up over an ops match', hud.on);
  const mineHidden = hud.marks.filter((m) => m.id === 'hidden');
  check('UNDISCOVERED: the spotting caret over it and nothing else, no box, no chip', mineHidden.length === 1 && mineHidden[0].kind === 'spot' && Math.hypot(mineHidden[0].x - px.hidden.x, mineHidden[0].y - px.hidden.y) < 3, JSON.stringify(mineHidden));
  /* The caret sits above the contact; where it stands, nothing is inked. */
  const inkHidden = await inkAt(px.hidden.x, px.hidden.y + 10, 6);
  check('UNDISCOVERED: not one inked HUD pixel where it stands', inkHidden === 0, `${inkHidden} px inked at ${Math.round(px.hidden.x)}, ${Math.round(px.hidden.y)}`);
  const inkCaret = await inkAt(px.hidden.x, px.hidden.y - 14, 6);
  check('UNDISCOVERED: the caret is inked over it', inkCaret > 0, `${inkCaret} px inked above ${Math.round(px.hidden.x)}, ${Math.round(px.hidden.y)}`);
  const boxSeen = hud.marks.find((m) => m.kind === 'contact' && m.id === 'seen');
  check('a discovered contact in a frame gets its box and chip', Boolean(boxSeen) && Math.hypot(boxSeen.x - px.seen.x, boxSeen.y - px.seen.y) < 3 && /UNKNOWN/.test(boxSeen.chip), JSON.stringify(boxSeen));
  const inkSeen = await inkAt(px.seen.x, px.seen.y);
  check('the probe sees the ink round a discovered one (so it can see)', inkSeen > 20, `${inkSeen} px`);
  check('a lost contact: its last known position, never a box', hud.marks.some((m) => m.kind === 'lkp' && m.id === 'lost') && !hud.marks.some((m) => m.kind === 'contact' && m.id === 'lost'));
  check('the room\'s search area is drawn', hud.marks.some((m) => m.kind === 'search' && m.id === 'pair-search'));
  const hints = hud.marks.filter((m) => m.kind === 'bearing');
  check('bearing hints only toward search areas and last known positions', hints.length === 2 && hints.every((h) => (h.of === 'search' && h.id === 'pair-search') || (h.of === 'lkp' && h.id === 'lost')), JSON.stringify(hints.map((h) => `${h.of}:${h.id}`)));
  check('cards: the squad\'s shown, a tracker\'s card not on an ISR\'s screen', hud.cards.some((c) => c.text === 'ops.interior.m1.obj.observe') && !hud.cards.some((c) => c.text === 'ops.interior.m1.obj.lookout'), JSON.stringify(hud.cards));
  check('cards: done and starred', hud.cards.some((c) => c.text === 'ops.interior.m1.obj.burned' && /done/.test(c.cls)));
  check('the mission rule banner', /ENGAGEMENT NOT AVAILABLE/.test(hud.rule || ''), hud.rule);
  check('the ball\'s readouts and the EO / IR / MAP / TGT / LRF row', Boolean(hud.read.gimbal && hud.read.zoom && hud.read.alt && hud.read.hdg) && Object.keys(hud.row).join() === 'eo,ir,map,tgt,lrf' && hud.row.eo.on);
  check('the IR inset is up under the ball', hud.inset);
  await shot('hud-1280x720.png');

  /* The room classifies, then discovers the hidden one. */
  const v2 = baseView({ contacts: [contact('hidden', 'undiscovered', null), contact('seen', 'seen', 'poi', { by: [1] }), contact('lost', 'lost', 'poi', { lkp: spots.lost })] });
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v2)} }), true)`);
  await page.sleep(500);
  const hud2 = await page.evaluate('window.__opsHud()');
  check('a classification change is told as a card event', hud2.events.some((e) => /CONTACT CLASSIFICATION UPDATED/.test(e) && /UNKNOWN > PERSON OF INTEREST/.test(e)), JSON.stringify(hud2.events));
  /* A cue's card may be the script's heading and its line. */
  await page.evaluate(`(window.__ops.inject({ type: 'ops', op: 'cue', cues: [{ at: 0, stage: 'M1_CP_CONTACT_FOUND', heard: 'all', card: ['card.intelligence_updated', 'card.possible_armed'] }] }), true)`);
  await page.sleep(500);
  const told = (await page.evaluate('window.__opsHud()')).events;
  check('a two line cue card is told as one card event, both lines', told.some((e) => /INTELLIGENCE UPDATED/.test(e) && /POSSIBLE ARMED PERSONNEL/.test(e)), JSON.stringify(told));
  check('and the chip changes with it', hud2.marks.some((m) => m.kind === 'contact' && m.id === 'seen' && /PERSON OF INTEREST/.test(m.chip)));
  const v3 = baseView({ contacts: [contact('hidden', 'seen', 'unknown', { by: [1] }), contact('seen', 'seen', 'poi', { by: [1] }), contact('lost', 'lost', 'poi', { lkp: spots.lost })] });
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v3)} }), true)`);
  await page.sleep(500);
  const hud3 = await page.evaluate('window.__opsHud()');
  check('once the room discovers it, the same contact gets its box where it stands', hud3.marks.some((m) => m.kind === 'contact' && m.id === 'hidden' && Math.hypot(m.x - px.hidden.x, m.y - px.hidden.y) < 3));
  check('and now the probe finds ink there', (await inkAt(px.hidden.x, px.hidden.y)) > 20);

  /* Boundary, then the first stage's tutorial. */
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView({ boundary: { 1: 'warning' } }))} }), true)`);
  await page.sleep(400);
  check('the boundary warning to the pilot crossing it', /BOUNDARY/.test((await page.evaluate('window.__opsHud()')).boundary || ''));
  /* The people below looking up (CONTRACT-SPOTTED.md): in the same place. */
  const looking = { value: 0.3, level: 'looking', at: { looking: 9000 }, worst: null, advice: null };
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView({ spot: { pair: looking } }))} }), true)`);
  await page.sleep(400);
  check('the people below looking up: "climb" where the boundary warns', /LOOKING UP: CLIMB/.test((await page.evaluate('window.__opsHud()')).boundary || ''));
  await shot('hud-spot-looking.png');
  const spotted = { ...looking, value: 1, level: 'spotted', at: { looking: 9000, spotted: 20000 } };
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView({ spot: { pair: looking, camp: spotted } }))} }), true)`);
  await page.sleep(400);
  check('two groups on alert: the HUD shows the higher (spotted over looking up)', /^SPOTTED$/.test((await page.evaluate('window.__opsHud()')).boundary || ''));
  const start = baseView({
    stage: {
      id: 'M1_CP_START', n: 1, at: 5000, title: 'ops.interior.m1.s1', text: null, music: null, lockRoles: false,
    },
    cards: [{
      id: 'launch', text: 'ops.interior.m1.obj.launch', tier: 'primary', state: 'active', roles: null, star: false,
    }],
  });
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(start)} }), true)`);
  await page.sleep(500);
  const t1 = (await page.evaluate('window.__opsHud()')).tutorial;
  check('stage 1: launching is done (airborne), so the next prompt is up: the climb', /CLIMB/.test(t1 || ''), t1);
  await page.tap('KeyM');
  await page.sleep(400);
  const h4 = await page.evaluate('window.__opsHud()');
  check('M opens the tactical map (MAP lit)', h4.mapOpen && h4.row.map.on);
  await page.tap('KeyM');
  await page.sleep(200);
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView())} }), true)`);
  await page.sleep(300);

  /* The role board. */
  await page.tap('Backquote');
  await page.sleep(500);
  const board = await page.evaluate('window.__rolesBoard()');
  check('` opens the role board', board.open);
  check('the board: your role and its guide', /ISR/.test(board.text) && /IBARRA/.test(board.text), board.text.slice(0, 160));
  const acts = board.buttons.map((b) => b.act);
  check('the board: take a free role, ask a swap, accept or decline a request, close', acts.includes('take:tracker') && acts.includes('swap:2:tracker:1') && acts.includes('accept:sw1') && acts.includes('decline:sw1') && acts.includes('close'), acts.join());
  await page.evaluate("(document.querySelector('.roles-box button[data-act=\"accept:sw1\"]').click(), true)");
  await page.evaluate("(document.querySelector('.roles-box button[data-act=\"take:tracker\"]').click(), true)");
  const sent = await page.evaluate('window.__ops.sent().slice(-2)');
  check('its buttons send the contract\'s messages', sent.length === 2 && sent[0].op === 'swapAccept' && sent[0].id === 'sw1' && sent[1].op === 'take' && sent[1].role === 'tracker', JSON.stringify(sent));
  await shot('roles-1280x720.png');
  await page.evaluate("(document.querySelector('.roles-box button[data-act=\"close\"]').click(), true)");

  /* THE GUIDE, stage by stage: Mission 1's views as the room would send
   * them, this page an ISR. */
  const stageView = (id, n, title, cards, over = {}) => baseView({
    id: 20 + n,
    stage: {
      id, n, at: 1000, title, text: null, music: null, lockRoles: false,
    },
    cards,
    contacts: [],
    search: [],
    roles: { ...baseView().roles, swaps: [] },
    ...over,
  });
  const card = (id, progress = null, state = 'active') => ({
    id, text: `ops.interior.m1.obj.${id}`, tier: 'primary', state, roles: null, star: false, ...(progress ? { progress } : {}),
  });
  const STAGES = [
    ['launch', stageView('M1_CP_START', 0, 'ops.interior.m1.s1', [card('launch')]), 'int1-g-launch', /^CLIMB ABOVE 500 M/],
    ['alpha', stageView('M1_CP_AIRBORNE', 1, 'ops.interior.m1.s2', [card('alpha', [0, 3])]), 'int1-g-alpha', /^CAPTURE: .* · 0\/3$/],
    ['bravo', stageView('M1_CP_AIRBORNE', 1, 'ops.interior.m1.s2', [card('alpha', [3, 3], 'done'), card('bravo', [0, 2])], {
      id: 22, captures: ['bridge', 'road', 'sheds'].map((item) => ({ item, seat: 1, t: 1, grade: 'clean' })),
    }), 'int1-g-bravo', /^CAPTURE: .* · 0\/2$/],
    ['charlie', stageView('M1_CP_BRAVO_COMPLETE', 2, 'ops.interior.m1.s3', [card('charlie')]), 'int1-g-charlie', /^FLY TO THE MARKER/],
    ['follow', stageView('M1_CP_CONTACT_FOUND', 3, 'ops.interior.m1.s4', [card('observe')], {
      search: [{ id: 'pair-lkp', at: [spots.search[0], spots.search[1]], r: 25, contact: 'pair' }],
    }), 'int1-g-follow', /^SEARCH THE CIRCLE/],
    ['camp', stageView('M1_CP_CAMP_FOUND', 4, 'ops.interior.m1.s5', [card('document', [0, 5])]), 'int1-g-camp', /^CAPTURE: .* · 0\/5$/],
    ['rtb', stageView('M1_CP_CAMP_FOUND', 4, 'ops.interior.m1.s5', [card('document', [5, 5], 'done'), card('rtb')], { id: 25 }), 'int1-g-rtb', /^RETURN TO BASE AND LAND$/],
  ];
  const DEG = 180 / Math.PI;
  for (const [name, v, brief, line] of STAGES) {
    /* This stage's brief, not one said before: the radio keeps its last 40
     * lines started, so count them. */
    const heardN = `(window.__audio.warRadio ? window.__audio.warRadio.status().started.filter((x) => x === ${JSON.stringify(brief)}).length : 0)`;
    const before = await page.evaluate(heardN);
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v)} }), true)`);
    await page.until(`${heardN} > ${before}`, 25000).catch(() => {});
    await page.sleep(400);
    const g = await page.evaluate('window.__ops.guide()');
    const h = await page.evaluate('window.__opsHud()');
    const started = await page.evaluate('window.__audio.warRadio ? window.__audio.warRadio.status().started : []');
    const words = await page.evaluate(`fetch('assets/audio/war/lines.json').then((r) => r.json()).then((j) => j.lines.find((l) => l.id === ${JSON.stringify(brief)}).en)`);
    check(`guide, ${name}: the brief ${brief} is heard now (the radio's element playing it) and its words are the subtitle`,
      (await page.evaluate(heardN)) > before && h.subtitle === words,
      JSON.stringify({ started: started.slice(-4), said: g.said.slice(-3), subtitle: h.subtitle }));
    check(`guide, ${name}: the objective line from the stage's data`, line.test(h.goal || ''), h.goal);
    const mark = h.marks.find((m) => m.kind === 'guide' || m.kind === 'edge');
    check(`guide, ${name}: a mark for it (on screen, or a chevron at the edge)`, g.target && (g.target.kind === 'climb' || Boolean(mark)), JSON.stringify({ target: g.target, mark }));
    /* An edge chevron points where the objective is: its angle on the
     * screen against the objective's direction in the camera's own axes,
     * worked out here from the camera the room is told of (its position
     * and look direction, no roll) and the ground under the objective. */
    if (mark && mark.kind === 'edge') {
      const cam = await page.evaluate('window.__ops.cam()');
      const z = await page.evaluate(`window.__heightAt(${g.target.at[0]}, ${-g.target.at[1]})`);
      const d = cam.dir;
      const n = Math.hypot(d[1], d[0]);
      const right = [d[1] / n, -d[0] / n, 0];
      const up = [right[1] * d[2] - right[2] * d[1], right[2] * d[0] - right[0] * d[2], right[0] * d[1] - right[1] * d[0]];
      const t = [g.target.at[0] - cam.p[0], g.target.at[1] - cam.p[1], z - cam.p[2]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const want = Math.atan2(-dot(t, up), dot(t, right));
      const off = Math.abs(((mark.angle - want) * DEG + 540) % 360 - 180);
      check(`guide, ${name}: the edge chevron points at the objective, within 10 degrees (${Math.round(off)})`, off <= 10,
        JSON.stringify({ angle: Math.round(mark.angle * DEG), want: Math.round(want * DEG), at: g.target.at, words: mark.words }));
    }
    if (mark && mark.kind === 'guide' && g.target.kind === 'search') {
      check(`guide, ${name}: the caret sits on the search area in the picture`, Math.hypot(mark.x - px.search.x, mark.y - px.search.y) < 40, JSON.stringify({ mark, at: px.search }));
    }
    await shot(`guide-${name}-1280x720.png`);
    await resize(390, 844);
    await page.sleep(300);
    const narrow = await page.evaluate('window.__opsHud()');
    check(`guide, ${name}: at 390x844 the objective line is inside the window`, narrow.rects.goal && narrow.rects.goal.x >= 0 && narrow.rects.goal.x + narrow.rects.goal.w <= 391, JSON.stringify(narrow.rects.goal));
    await shot(`guide-${name}-390x844.png`);
    await resize(1280, 720);
  }
  /* The edge arrow, glyph and label as one box, stays in the safe
   * frame: clear of the tape, the objective line, the readouts and every
   * other panel, at every stage and every device size. */
  for (const [w, h] of SIZES) {
    await resize(w, h);
    const hits = [];
    let arrows = 0;
    for (const [name, v] of STAGES) {
      await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v)} }), true)`);
      await page.sleep(1300);
      const hh = await page.evaluate('window.__opsHud()');
      const edge = hh.marks.find((m) => m.kind === 'edge');
      const placedTarget = (await page.evaluate('window.__ops.guide().target')) || {};
      /* An objective with a place and no mark in the picture must have
       * its arrow, whatever the panels leave free. */
      if (!edge) {
        if (placedTarget.at && !hh.marks.some((m) => m.kind === 'guide')) {
          hits.push(`${name}:no arrow`);
        }
        continue;
      }
      arrows += 1;
      const b = edge.box;
      const inWindow = b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;
      const on = Object.entries(hh.rects).filter(([, r]) => r && b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h).map(([k]) => k);
      if (!inWindow || on.length) {
        hits.push(`${name}:${on.join('+') || 'window'}`);
      }
    }
    check(`${w}x${h}: the edge arrow and its label, at every stage, drawn, inside the window and clear of every panel (${arrows} drawn)`, arrows > 0 && !hits.length, hits.join(', '));
    if (w === 1280 && h === 720) {
      await shot('guide-arrow-camp-1280x720.png');
    }
  }
  await resize(1280, 720);

  /* The count moves when the card's does. */
  {
    const v = STAGES[1][1];
    const moved = { ...v, captures: [{ item: 'bridge', seat: 1, t: 1, grade: 'clean' }], cards: [card('alpha', [1, 3])] };
    const before = await page.evaluate('window.__ops.guide().target');
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v)} }), true)`);
    await page.sleep(400);
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(moved)} }), true)`);
    await page.sleep(500);
    const g = await page.evaluate('window.__ops.guide()');
    check('guide: a capture in, the line counts 1/3 and the target is no longer the bridge', /· 1\/3$/.test(g.line) && g.target && g.target.item !== 'bridge', JSON.stringify({ line: g.line, target: g.target, before }));
    /* Nothing moves now: a nudge (lead, clock, distance) after the idle wait. */
    const t0 = Date.now();
    await page.until("window.__ops.guide().said.some((x) => x.startsWith('int-g-next+int-g-clock-'))", 45000).catch(() => {});
    const said = (await page.evaluate('window.__ops.guide()')).said;
    const nudge = said.find((x) => x.startsWith('int-g-next+int-g-clock-'));
    await page.until("window.__audio.warRadio && window.__audio.warRadio.status().started.includes('int-g-next')", 10000).catch(() => {});
    const started = await page.evaluate('window.__audio.warRadio ? window.__audio.warRadio.status().started : []');
    check(`guide: after the idle wait a nudge is said and heard (${Math.round((Date.now() - t0) / 1000)} s)`, Boolean(nudge) && /int-g-dist-/.test(nudge) && started.includes('int-g-next'), JSON.stringify({ nudge, started: started.slice(-4) }));
  }
  /* Mission guidance off: no line, no marks; the voice stays. */
  {
    await page.evaluate("(window.__ui.settings.missionGuidance = false, true)");
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(STAGES[3][1])} }), true)`);
    await page.sleep(600);
    const h = await page.evaluate('window.__opsHud()');
    check('Mission guidance off: no objective line and no guide marks', !h.goal && !h.marks.some((m) => m.kind === 'guide' || m.kind === 'edge'), JSON.stringify({ goal: h.goal, marks: h.marks.filter((m) => m.kind === 'guide' || m.kind === 'edge') }));
    await shot('guide-off-1280x720.png');
    const v = { ...STAGES[2][1], id: 40 };
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(v)} }), true)`);
    await page.until("window.__ops.guide().said.filter((x) => x === 'int1-g-bravo').length >= 2", 15000).catch(() => {});
    const g = await page.evaluate('window.__ops.guide()');
    check('Mission guidance off: the stage brief is still said', g.said.filter((x) => x === 'int1-g-bravo').length >= 2, JSON.stringify(g.said.slice(-3)));
    await page.evaluate("(window.__ui.settings.missionGuidance = true, true)");
  }
  /* A new match: the first flight's card never again. */
  {
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify({ ...STAGES[0][1], id: 41 })} }), true)`);
    await page.sleep(800);
    const g = await page.evaluate('window.__ops.guide()');
    check('first flight: a new match, and no card again', !g.first && !(await page.evaluate('window.__opsHud().first')), JSON.stringify(g.first));
  }
  await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView())} }), true)`);
  await page.sleep(300);

  for (const [w, h] of SIZES) {
    await resize(w, h);
    await page.evaluate(`(window.__ops.inject({ type: 'ops', ops: ${JSON.stringify(baseView())} }), true)`);
    await page.sleep(400);
    const r = (await page.evaluate('window.__opsHud()')).rects;
    const boxes = Object.entries(r).filter(([, b]) => b);
    const inside = boxes.every(([, b]) => b.x >= -1 && b.y >= -1 && b.x + b.w <= w + 1 && b.y + b.h <= h + 1);
    const clash = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [na, a] = boxes[i];
        const [nb, b] = boxes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          clash.push(`${na}/${nb}`);
        }
      }
    }
    check(`${w}x${h}: the HUD's panels inside the window and clear of each other`, inside && !clash.length, clash.join() || (inside ? '' : JSON.stringify(r)));
    await shot(`hud-${w}x${h}.png`);
  }
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
}
console.log(`\n${passed} passed, ${failed} failed (pictures in ${outDir})`);
process.exit(failed ? 1 : 0);
