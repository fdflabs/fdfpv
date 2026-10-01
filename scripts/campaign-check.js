/*
 * campaign-check.js: Defend the Paraná through the real shell, in one
 * page, against a local rooms server (never the live one):
 *
 *   npm run campaign:check                  starts its own on port 8823
 *   npm run campaign:check -- http://127.0.0.1:8797 [outdir]
 *
 * The gate draws six cards, the campaign's last, inside the window at
 * 1280x720, 390x844 and 360x640, with the rooms panel above them and
 * clear of them. Its card opens the campaign screen:
 * mission 1 playable and free, missions 2 to 4 marked Campaign. The shop,
 * with credits seeded in the stored settings' campaign section (the
 * guest's store, which the account syncs for a signed in pilot):
 * buy the wide blast warhead and Rack +1, equip and unequip, the loadout
 * line following. Play on mission 1: the Defend Itaipu card's consent and
 * private Itaipu room, and its start row starts mission 1 with the
 * loadout in the start message (the room on main ignores the field and
 * starts the war anyway, and no loadout op goes to a room that does not
 * echo loadouts). A mission end with no result, as main gives: nothing
 * paid, a quiet note. A mocked room result, since the room gives
 * none yet: stars and credits on the screen follow it.
 *
 * No page error. Pictures in outdir, not in the repository.
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
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[3] || join(root, 'build', 'campaign');

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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'campaign-rooms-'));
  const port = 8823;
  const proc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
    env: { ...process.env, ROOMS_DB: join(dir, 'rooms.db'), PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`${url}/v2/rooms`);
      return { url, stop };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await stop();
  throw new Error(`rooms server did not come up on ${url}`);
}

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
}

async function click(page, selector) {
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

const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    return {
      name: c.querySelector('.gate-card-name').textContent,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(c.querySelector('.gate-card-facts').getBoundingClientRect().bottom),
    };
  }),
  panel: (() => {
    const n = document.querySelector('.screen-title .gate-rooms');
    if (!n || n.hidden) {
      return null;
    }
    const r = n.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  })(),
}))()`;

function laidOut(v) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  /* The rooms panel (src/ui/ui.js renderTitleRooms): in the window, above the cards. */
  const p = v.panel;
  const panel = Boolean(p) && p[0] >= 0 && p[1] >= 0 && p[2] <= v.w && c.every((x) => p[3] <= x.box[1]);
  return c.length === 6 && inside && apart && panel && v.sw <= v.w;
}

/* What the campaign screen shows, read off the DOM. */
const SCREEN = `(() => {
  const box = document.querySelector('.campaign-box');
  if (!box || document.querySelector('.name-dialog').hidden) { return null; }
  return {
    page: box.dataset.page,
    credits: (box.querySelector('.campaign-credits') || {}).textContent || null,
    missions: [...box.querySelectorAll('.campaign-mission')].map((m) => ({
      id: m.dataset.mission,
      stars: m.querySelectorAll('.campaign-star.on').length,
      tag: m.querySelector('.campaign-tag').textContent,
      best: m.querySelector('.campaign-best').textContent,
      play: m.querySelector('.campaign-play').textContent,
      playable: !m.querySelector('.campaign-play').disabled,
    })),
    items: Object.fromEntries([...box.querySelectorAll('.campaign-item')].map((i) => [i.dataset.upgrade, {
      label: i.querySelector('button').textContent, disabled: i.querySelector('button').disabled,
    }])),
    loadout: (box.querySelector('.campaign-loadout') || {}).textContent || null,
    last: (box.querySelector('.campaign-last') || {}).textContent || null,
  };
})()`;

/* Every text message the page puts on a socket, from before the app runs. */
const SOCKET_TAP = `(() => {
  window.__sent = [];
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    if (typeof data === 'string') { try { window.__sent.push(JSON.parse(data)); } catch (e) { window.__sent.push(data); } }
    return send.call(this, data);
  };
})();`;

/* Once per profile: a reload keeps what the page since bought. */
const SEED = `(() => {
  const s = JSON.parse(localStorage.getItem('webfpv.settings.v3') || '{}');
  if (!s.campaign) {
    localStorage.setItem('webfpv.settings.v3', JSON.stringify({ ...s, campaign: { v: 1, earned: 1000 } }));
  }
})();`;

const server = await roomsServer();
console.log(`Defend the Paraná, rooms at ${server.url}`);
const page = await openPage({
  root, url: `/index.html?rooms=${encodeURIComponent(server.url)}`, width: 1280, height: 720, seed: [SOCKET_TAP, SEED],
});
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 6", 60000).catch(() => {});

  /* THE CARD. */
  for (const [w, h] of [[390, 844], [360, 640], [1280, 720]]) {
    await resize(page, w, h);
    const v = await page.evaluate(LAYOUT);
    check(`${w} by ${h}: six cards, the campaign last, inside the window, clear of the bar, the rooms panel above them`,
      laidOut(v) && v.cards[5].name === 'Defend the Paraná', `${v.cards.map((x) => `${x.name} ${x.box} ${x.facts}`).join(' | ')} bar ${v.bar} scroll ${v.sw} panel ${v.panel}`);
    await shot(page, `gate-${w}x${h}`);
  }

  await click(page, '.gate-card-campaign');
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  const first = await page.evaluate(SCREEN);
  check('the card opens the campaign on its missions', first && first.page === 'missions' && first.missions.length === 4, JSON.stringify(first));
  check('mission 1: free, playable, not flown; 2 to 4 marked Campaign',
    first.missions[0].tag === 'Free' && first.missions[0].playable && first.missions[0].best === 'Not flown yet'
    && first.missions.slice(1).every((m) => m.tag === 'Campaign' && !m.playable), JSON.stringify(first.missions));
  check('the seeded credits show', first.credits === 'Credits: 1000', first.credits);
  await shot(page, 'missions');

  /* THE SHOP. */
  await click(page, '.campaign-to-shop');
  let shop = await page.evaluate(SCREEN);
  check('the shop: the hunter warning is coming in Act 2, rack +2 needs rack +1',
    shop.page === 'shop' && shop.items.warning.label === 'Coming in Act 2' && shop.items.warning.disabled
    && shop.items['rack-2'].label === 'Needs Rack +1', JSON.stringify(shop.items));
  await click(page, '[data-upgrade="wide"] button');
  await click(page, '[data-upgrade="rack-1"] button');
  shop = await page.evaluate(SCREEN);
  check('bought the wide blast and rack +1: 100 credits left, wide equipped',
    shop.credits === 'Credits: 100' && shop.items.wide.label === 'Equipped' && shop.items['rack-1'].label === 'Carried', JSON.stringify(shop));
  check('what is left costs more than 100', shop.items.emp.disabled && shop.items.speed.disabled);
  await click(page, '[data-upgrade="wide"] button');
  const off = await page.evaluate(SCREEN);
  await click(page, '[data-upgrade="wide"] button');
  shop = await page.evaluate(SCREEN);
  check('Equipped takes it off, Equip puts it back', off.items.wide.label === 'Equip' && /Standard warhead/.test(off.loadout)
    && shop.items.wide.label === 'Equipped', `${off.loadout} / ${shop.items.wide.label}`);
  check('the loadout line: a rack of 5, wide blast', shop.loadout === 'Your loadout: a rack of 5, Wide blast warhead, standard airframe.', shop.loadout);
  check('bought survives a reload of the store', await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('webfpv.settings.v3')).campaign;
    return s.owned.wide === 500 && s.owned['rack-1'] === 400 && s.equipped.warhead === 'wide';
  })()`));
  await shot(page, 'shop');

  /* PLAY MISSION 1. */
  await click(page, '.campaign-box .name-dialog-row button');
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  await page.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && /Defend Itaipu/.test(d.textContent); })()", 10000).catch(() => {});
  check('Play asks the Defend Itaipu consent first', await page.evaluate("/Defend Itaipu/.test(document.querySelector('.name-dialog h2').textContent)"));
  await page.sleep(700);
  await page.tap('Enter');
  await page.until("window.__rooms().phase === 'open' && window.__ui.items().some((it) => it.action === 'friends-war-start')", 60000).catch(() => {});
  await page.sleep(600);
  const room = await page.evaluate(`(() => {
    const r = window.__rooms();
    return { code: r.code, public: r.public, host: r.host === r.seat, map: window.__ui.settings.map, pending: window.__campaign.pending() };
  })()`);
  check('a private Itaipu room, this pilot its host, the mission remembered for it',
    !room.public && room.host && room.map === 'itaipu' && room.pending && room.pending.mission === 'itaipu-1' && room.pending.code === room.code,
    JSON.stringify(room));
  await page.evaluate("(() => { window.__sent.length = 0; window.__ui.act('friends-war-start'); return true; })()");
  await page.until("window.__war && window.__war().view.state === 'briefing'", 15000).catch(() => {});
  const start = await page.evaluate("window.__sent.find((m) => m && m.type === 'war' && m.op === 'start') || null");
  check('the start row starts mission 1 with the loadout',
    start && start.mission === 'itaipu-1' && start.intro === true
    && JSON.stringify(start.loadout) === JSON.stringify({ rack: 5, warhead: 'wide', speedMul: 1 }), JSON.stringify(start));
  const war = await page.evaluate("(() => { const w = window.__war().view; return { state: w.state, mission: w.mission }; })()");
  check('the room took it: mission 1 briefing', war.state === 'briefing' && war.mission === 'itaipu-1', JSON.stringify(war));

  /* The room echoes the loadout the start carried, and it is not sent
   * again on its own. A mission that ends with no result (a room from
   * before results) pays nothing and says so quietly. */
  await page.sleep(1500);
  const echo = await page.evaluate(`(() => {
    const v = window.__war().view;
    return {
      mine: v.loadouts ? v.loadouts[window.__rooms().seat] : null,
      sent: window.__sent.filter((m) => m && m.type === 'war' && m.op === 'loadout').length,
    };
  })()`);
  check('the room echoes the loadout, and no loadout op is sent on its own',
    echo.mine && echo.mine.warhead === 'wide' && echo.mine.rack === 5 && echo.sent === 0, JSON.stringify(echo));
  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'ended'", 10000).catch(() => {});
  const before = await page.evaluate("JSON.stringify(window.__campaign.state())");
  await page.evaluate(`(() => {
    const code = window.__rooms().code;
    window.__campaign.observe({ id: 901, mission: 'itaipu-1', state: 'live' }, code);
    window.__campaign.observe({ id: 901, mission: 'itaipu-1', state: 'won' }, code);
    window.__campaign.open();
    return true;
  })()`);
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  const bare = await page.evaluate(SCREEN);
  check('a mission 1 end with no result: no stars, no credits, a quiet note',
    (await page.evaluate("JSON.stringify(window.__campaign.state())")) === before && bare.missions[0].stars === 0
    && bare.credits === 'Credits: 100' && bare.last === 'Mission 1 over. Stars and credits are coming soon.', JSON.stringify(bare));
  await page.evaluate('window.__campaign.close()');

  /* A MOCKED RESULT: the room computes none yet. First seen undecided,
   * then decided, as a war this page watched. */
  await page.evaluate(`(() => {
    const code = window.__rooms().code;
    window.__campaign.observe({ id: 900, mission: 'itaipu-1', state: 'live', result: null }, code);
    window.__campaign.observe({ id: 900, mission: "itaipu-1", state: "won", result: { won: true, stars: 2, credits: 225, criteria: [{ id: "held", met: true }, { id: "noLosses", met: false }, { id: "output", met: true, need: 7000 }] } }, code);
    window.__campaign.observe({ id: 900, mission: "itaipu-1", state: "won", result: { won: true, stars: 2, credits: 225, criteria: [{ id: "held", met: true }, { id: "noLosses", met: false }, { id: "output", met: true, need: 7000 }] } }, code);
    window.__campaign.open();
    return true;
  })()`);
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  const after = await page.evaluate(SCREEN);
  check('after the result: two stars on mission 1, 225 more credits, paid once',
    after.missions[0].stars === 2 && after.credits === 'Credits: 325' && after.missions[0].best === 'Best: won, 225 credits', JSON.stringify(after));
  check('the result is said on the screen', after.last === 'Mission 1 won: 2 of 3 stars, 225 credits.', after.last);
  check('mission 2 unlocked and playable', after.missions[1].play === 'Play' && after.missions[1].playable, after.missions[1].play);
  await shot(page, 'after-result');

  /* PLAY MISSION 2: its own room, whose start row names it and starts it
   * (the owner saw "Start mission 1" there, 2026-09-30). */
  const firstCode = await page.evaluate('window.__rooms().code');
  await click(page, '[data-mission="itaipu-2"] .campaign-play');
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code !== ${JSON.stringify(firstCode)}
    && window.__ui.items().some((it) => it.action === 'friends-war-start')`, 60000).catch(() => {});
  await page.sleep(600);
  const row2 = await page.evaluate("(window.__ui.items().find((it) => it.action === 'friends-war-start') || {}).label || null");
  check('the mission 2 room\'s start row says Start mission 2', row2 === 'Start mission 2', row2);
  await page.evaluate("(() => { window.__sent.length = 0; window.__ui.act('friends-war-start'); return true; })()");
  await page.until("window.__war && window.__war().view.mission === 'itaipu-2'", 15000).catch(() => {});
  const start2 = await page.evaluate("window.__sent.find((m) => m && m.type === 'war' && m.op === 'start') || null");
  check('and it starts mission 2', start2 && start2.mission === 'itaipu-2', JSON.stringify(start2));
  /* Mission 2's room is a new room, so its war is that room's war 1, as
   * mission 1's was in its own: the shell took it for the war whose
   * intro it had played, played none, and left the pilot in the briefing
   * with no word of what came next (the owner, 2026-10-01). */
  await page.until("window.__war().view.state === 'briefing' && window.__warIntro() !== null", 15000).catch(() => {});
  const brief2 = await page.evaluate("(() => { const v = window.__war().view; return { id: v.id, state: v.state, intro: window.__warIntro() !== null }; })()");
  check('mission 2\'s briefing plays the intro, though its war id is mission 1\'s', brief2.state === 'briefing' && brief2.intro, JSON.stringify(brief2));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
