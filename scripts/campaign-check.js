/*
 * campaign-check.js: Defend the Paraná through the real shell, in one
 * page, against a local rooms server (never the live one):
 *
 *   npm run campaign:check                  starts its own on a free port
 *   npm run campaign:check -- http://127.0.0.1:8797 [outdir]
 *
 * The gate draws five cards, the campaign's last, inside the window at
 * 1280x720, 390x844 and 360x640, with the rooms panel above them and
 * clear of them. Its card is one click onto the campaign's page (the
 * owner, 2026-10-03), before any consent or room: Act 1's seven missions
 * with their stars, mission 1 free and playable, missions 2 to 7 marked
 * Campaign, 2 to 4 each waiting on the one before, 5 to 7 Coming soon
 * (the owner released 1 to 4 on 2026-10-15; a campaign mission held in
 * development is The Interior's rows below, since a page cannot be given
 * a hold). The shop, with
 * credits seeded in the stored settings' campaign section (the guest's
 * store, which the account syncs for a signed in pilot): buy the wide
 * blast warhead and Rack +1, equip and unequip, the loadout line
 * following. Then, reloaded as any pilot's page (no ?missions=dev): Play
 * on mission 1: the Defend the Paraná consent first,
 * asked once (Back: no room, the campaign's page again), then the
 * briefing of a public Itaipu room made for mission 1 (released, so
 * src/main.js openSession makes it public), named for this
 * pilot, which Escape leaves for the campaign's page; Play again, and
 * Start now starts it with the loadout in the start
 * message. The room's own result for the ended war taken first; then a
 * mission end with no result, as a room from before results gives:
 * nothing paid, a quiet note. A mocked room result, a won one the check
 * can choose: stars and credits on the screen follow it; without
 * ?missions=dev, back in the room, mission 2, open by the win, is Play,
 * mission 1 too. Then ?missions=dev (this check's own server starts
 * missions in development, DEV_MISSIONS): play mission 2 from the lobby's
 * Campaign row: the lobby says mission 2 and Start now starts it, its
 * intro played.
 *
 * Then the owner's unlock, on a fresh profile signed in through this
 * check's own accounts server, against a rooms server of its own that
 * checks sessions there and has the owner's account as DEV_ACCOUNTS, as
 * the VM's does (a server named on the command line is not used for
 * these rows): with mission 1 never won, a pilot not on the list sees
 * mission 2 Win mission 1 first with ?missions=dev; the owner without
 * ?missions=dev has 1 to 4 to play, released; with it, Play, whose
 * press makes a public war room for mission 2 that starts it.
 *
 * CONTINUE (docs/redesign/COMPLETENESS.md item 57): mission 1's Play
 * records the war as the last activity; after the win and a reload home's
 * Continue stands in Defend the Paraná's link and goes on with mission 2.
 * On another computer, a fresh profile signed in as the owner, the sync
 * brings the last activity and the stars, and one click on Continue asks
 * the consent and makes mission 2's room. There The Interior's mission 1
 * Play, its consent given, makes The Interior the last activity, Continue
 * its mission 1, and its mission 2 once mission 1 is won.
 *
 * No page error. Pictures in outdir, not in the repository.
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
import { roomsServer } from '../tests/lib/roomsserver.js';
import { seedSignedIn, startAccounts } from '../tests/lib/account.js';
import { ACCOUNT_KEY } from '../src/share/pilot.js';
import { KEY_STORAGE } from '../src/share/identity.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { filmFor } from '../src/share/war/films/index.js';

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

async function resize(page, width, height) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, page.sessionId);
  await page.until(`window.innerWidth === ${width} && window.innerHeight === ${height}`, 10000);
  await page.sleep(600);
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

const LAYOUT = `(() => ({
  w: window.innerWidth, h: window.innerHeight, sw: document.documentElement.scrollWidth,
  bar: document.querySelector('.frame-bot').getBoundingClientRect().top,
  cards: [...document.querySelectorAll('.screen-title .gate-card')].map((c) => {
    const r = c.getBoundingClientRect();
    return {
      name: c.querySelector('.gate-card-name').textContent,
      links: [...c.querySelectorAll('.gate-link')].map((l) => l.textContent),
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      facts: Math.round(Math.max(...[...c.querySelectorAll('.gate-card-facts, .gate-link')].map((n) => n.getBoundingClientRect().bottom))),
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

function laidOut(v, n, home = false) {
  const c = v.cards;
  const inside = c.every((x) => x.box[0] >= 0 && x.box[1] >= 0 && x.box[2] <= v.w && x.box[3] <= v.h && x.facts <= v.bar);
  const apart = c.every((a, i) => c.slice(i + 1).every((b) => a.box[2] <= b.box[0] || b.box[2] <= a.box[0]
    || a.box[3] <= b.box[1] || b.box[3] <= a.box[1]));
  /* The rooms panel is home's, above the cards and clear of them (the
   * owner, 2026-10-03), and Flight Club's; Operations has none. */
  const panel = home ? Boolean(v.panel) && c.every((x) => v.panel[3] <= x.box[1]) : v.panel === null;
  return c.length === n && inside && apart && panel && v.sw <= v.w;
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
      starSlots: m.querySelectorAll('.campaign-star').length,
      tag: m.querySelector('.campaign-tag').textContent,
      best: m.querySelector('.campaign-best').textContent,
      play: m.querySelector('.campaign-play').textContent,
      playable: !m.querySelector('.campaign-play').disabled,
      release: m.dataset.release,
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

const CONSENT = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && !document.querySelector('.campaign-box') && /Defend the Paraná/.test(d.textContent); })()";
const IN_LOBBY = "window.__rooms().phase === 'open' && window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
/* Home's Continue links, from the hubs as drawn, and the stored last
 * activity (docs/redesign/COMPLETENESS.md item 57). */
const CONTINUE_LINK = `(() => {
  const links = window.__ui.hubCards(true).flatMap((c) => c.links).filter((l) => l.continue);
  return { stored: JSON.parse(localStorage.getItem('webfpv.settings.v3')).lastActivity, links: links.map((l) => ({ key: l.key, action: l.action, mission: l.mission ?? null, title: l.title ?? null })) };
})()`;

const server = await roomsServer(process.argv[2], 'campaign', { devMissions: true });
const pageUrl = `/index.html?rooms=${encodeURIComponent(server.url)}`;
const devUrl = `${pageUrl}&missions=dev`;
console.log(`Defend the Paraná, rooms at ${server.url}`);
const page = await openPage({
  root, url: pageUrl, width: 1280, height: 720, seed: [SOCKET_TAP, SEED],
});
try {
  await page.until('window.__shellReady === true', 300000);
  await page.until("window.__ui.onGate() && document.querySelectorAll('.screen-title .gate-card').length === 3", 60000).catch(() => {});

  /* THE CARD: Operations is home's second hub, Defend the Paraná its
   * first link and The Interior (docs/campaign/interior/, N20) beside it,
   * then the war's field hangar (2bc31815e), and inside Operations their
   * three cards. */
  for (const [w, h] of [[390, 844], [360, 640], [1280, 720]]) {
    await resize(page, w, h);
    const v = await page.evaluate(LAYOUT);
    check(`${w} by ${h}: home's three hubs inside the window, clear of the bar, the rooms panel above them, Operations second with Defend the Paraná, The Interior and the field hangar its links`,
      laidOut(v, 3, true) && v.cards[1].name === 'Operations' && v.cards[1].links.join() === 'Defend the Paraná,The Interior,Field hangar',
      `${v.cards.map((x) => `${x.name} ${x.box} ${x.facts} ${x.links}`).join(' | ')} bar ${v.bar} scroll ${v.sw} panel ${v.panel}`);
    await shot(page, `gate-${w}x${h}`);
  }
  await click(page, '.gate-card-hub-ops .gate-card-name');
  await page.until("window.__ui.hub === 'ops'", 10000).catch(() => {});
  const ops = await page.evaluate(LAYOUT);
  check('Operations holds Defend the Paraná, The Interior beside it and the field hangar, inside the window', laidOut(ops, 3)
    && ops.cards.map((x) => x.name).join() === 'Defend the Paraná,The Interior,Field hangar',
    ops.cards.map((x) => `${x.name} ${x.box}`).join(' | '));
  await shot(page, 'operations');

  /* THE INTERIOR'S CARD: its first press plays the campaign's prologue
   * (docs/campaign/interior/FILMS.md, once per pilot, unskippable the
   * first time) over the Interior's world, then its page: five missions,
   * Mission 1 held until release and 2 to 5 Under development (the
   * owner's words), no consent asked and no room made by the card. */
  await click(page, '.gate-card-interior .gate-card-name');
  const INTERIOR_PAGE = `(() => {
    const box = document.querySelector('.ops-campaign-box');
    if (!box || document.querySelector('.name-dialog').hidden) { return null; }
    return [...box.querySelectorAll('.campaign-mission')].map((m) => ({ id: m.dataset.mission, play: m.querySelector('.campaign-play').textContent, on: !m.querySelector('.campaign-play').disabled }));
  })()`;
  const PROLOGUE = "(window.__warIntro() || {}).for === 'ops:interior-prologue'";
  await page.until(PROLOGUE, 600000).catch(() => {});
  const prologue = await page.evaluate(`({ playing: ${PROLOGUE}, page: ${INTERIOR_PAGE} !== null, map: window.__map().id })`);
  check('The Interior\'s first press plays its prologue over the Interior\'s world, before its page', prologue.playing && !prologue.page && prologue.map === 'interior', JSON.stringify(prologue));
  await page.until(`!(${PROLOGUE})`, 300000).catch(() => {});
  await page.until(`${INTERIOR_PAGE} !== null`, 10000).catch(() => {});
  const interior = await page.evaluate(INTERIOR_PAGE);
  const iUnasked = await page.evaluate("({ phase: window.__rooms().phase, consent: window.__ui.settings.interiorConsent === true })");
  check('The Interior: its page lists interior-1 to interior-5, Missions 1 to 3 held until release, 4 and 5 Under development, none playable, no consent, no room',
    interior && interior.map((m) => m.id).join() === 'interior-1,interior-2,interior-3,interior-4,interior-5'
    && interior.slice(0, 3).every((m) => m.play === 'Held until release') && interior.slice(3).every((m) => m.play === 'Under development') && interior.every((m) => !m.on)
    && iUnasked.phase === 'idle' && !iUnasked.consent, JSON.stringify({ interior, iUnasked }));
  await shot(page, 'interior');
  await page.tap('Escape');
  await page.until(`${INTERIOR_PAGE} === null`, 10000).catch(() => {});
  await page.tap('Escape');
  await page.until('window.__ui.hub === null', 10000).catch(() => {});

  /* ONE CLICK ONTO THE CAMPAIGN'S PAGE: no consent, no room yet. */
  await click(page, '.gate-card-campaign');
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  const first = await page.evaluate(SCREEN);
  const unasked = await page.evaluate("({ phase: window.__rooms().phase, consent: window.__ui.settings.warConsent === true })");
  check('the card opens the campaign\'s page: Act 1\'s seven missions, each with its three stars, no room, nothing asked',
    first && first.page === 'missions' && first.missions.length === 7 && first.missions.every((m) => m.starSlots === 3)
    && first.missions.map((m) => m.id).join() === 'itaipu-1,itaipu-2,itaipu-3,itaipu-4,itaipu-5,itaipu-6,itaipu-7' && unasked.phase === 'idle' && !unasked.consent,
    JSON.stringify({ first, unasked }));
  check('mission 1: free, not flown, released to every pilot (the owner, 2026-10-15) and playable; 2 to 7 marked Campaign, none playable yet',
    first.missions[0].tag === 'Free' && first.missions[0].best === 'Not flown yet' && first.missions[0].playable
    && first.missions.slice(1).every((m) => m.tag === 'Campaign' && !m.playable), JSON.stringify(first.missions));
  check('1 to 4 available, 1 says Play and 2 to 4 Win the one before first, 5 to 7 Coming soon',
    first.missions.slice(0, 4).every((m) => m.release === 'available') && first.missions[0].play === 'Play'
    && first.missions.slice(1, 4).every((m, i) => m.play === `Win mission ${i + 1} first`)
    && first.missions.slice(4).every((m) => m.play === 'Coming soon' && m.release === 'soon'), JSON.stringify(first.missions.map((m) => m.play)));
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

  /* PLAY MISSION 1, on any pilot's page (no ?missions=dev), released
   * (the owner, 2026-10-15). Its consent first, asked once, then the
   * briefing of a room made for it, public, as a released mission's is
   * (src/main.js openSession). */
  await click(page, '.campaign-box .name-dialog-row button');
  await page.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await page.cdp.send('Page.navigate', { url: `${page.origin}${pageUrl}` }, page.sessionId);
  await page.until('window.__beforeReload !== true && window.__shellReady === true', 300000);
  await page.evaluate('(() => { window.__campaign.open(); return true; })()');
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  const devFirst = await page.evaluate(SCREEN);
  check('reloaded, no ?missions=dev: mission 1 Play and playable, the shop\'s spend kept',
    devFirst && devFirst.missions[0].play === 'Play' && devFirst.missions[0].playable && devFirst.credits === 'Credits: 100',
    JSON.stringify(devFirst && { m1: devFirst.missions[0], credits: devFirst.credits }));
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  await page.until(CONSENT, 10000).catch(() => {});
  check('Play mission 1 asks the Defend the Paraná consent first', await page.evaluate(CONSENT));
  await page.sleep(700);
  await page.tap('Escape');
  await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
  await page.sleep(500);
  const declined = await page.evaluate(`({ phase: window.__rooms().phase, page: (${SCREEN} || {}).page || null, consent: window.__ui.settings.warConsent === true })`);
  check('Back on it: no room, the campaign\'s page again, nothing stored', declined.phase === 'idle' && declined.page === 'missions' && !declined.consent,
    JSON.stringify(declined));
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  await page.until(CONSENT, 10000).catch(() => {});
  await page.sleep(700);
  await page.tap('Enter');
  await page.until(`${IN_LOBBY} && /Mission 1: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 60000).catch(() => {});
  await page.sleep(600);
  const ROOM = `(() => {
    const r = window.__rooms();
    return { code: r.code, public: r.public, host: r.host === r.seat, mode: r.mode, name: r.name, map: window.__ui.settings.map,
      title: (document.querySelector('.war-lobby-title') || {}).textContent || '',
      line: (document.querySelector('.war-lobby-mission') || {}).textContent || '',
      facts: [...document.querySelectorAll('.war-brief-facts dt')].map((d) => d.textContent),
      rows: window.__ui.items().map((it) => it.action), pending: window.__campaign.pending() };
  })()`;
  const room = await page.evaluate(ROOM);
  check('Continue: the BRIEFING of a public Itaipu room made for mission 1 (released), named for this pilot, its host, a Campaign row',
    room.public === true && room.host && room.mode === 'war' && room.map === 'itaipu' && /, Paraná$/.test(room.name || '')
    && room.title === 'BRIEFING' && /Mission 1: /.test(room.line) && room.facts.length > 0
    && room.rows.includes('friends-lobby-campaign') && room.pending && room.pending.mission === 'itaipu-1' && room.pending.code === room.code,
    JSON.stringify(room));
  /* Back undoes the press: Escape leaves the room Play made, for the page. */
  await page.tap('Escape');
  await page.until(`window.__rooms().phase === 'idle' && ${SCREEN} !== null`, 10000).catch(() => {});
  const undone = await page.evaluate(`({ phase: window.__rooms().phase, page: (${SCREEN} || {}).page || null })`);
  check('Escape on that briefing: out of the room, the campaign\'s page again', undone.phase === 'idle' && undone.page === 'missions', JSON.stringify(undone));
  await click(page, '[data-mission="itaipu-1"] .campaign-play');
  await page.until(`${IN_LOBBY} && /Mission 1: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 60000).catch(() => {});
  await page.sleep(600);
  const played = await page.evaluate(ROOM);
  check('Play again: no second consent, a new room\'s briefing, mission 1 remembered for it',
    played.code && played.code !== room.code && played.title === 'BRIEFING' && played.pending && played.pending.mission === 'itaipu-1'
    && played.pending.code === played.code, JSON.stringify(played));
  await page.evaluate("(() => { window.__sent.length = 0; window.__ui.act('friends-war-start'); return true; })()");
  await page.until("window.__war && window.__war().view.state === 'briefing'", 15000).catch(() => {});
  const start = await page.evaluate("window.__sent.find((m) => m && m.type === 'war' && m.op === 'start') || null");
  check('Start now starts mission 1 with the loadout',
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

  /* A COMBAT QUAD'S PAYLOAD IS ITS WARHEAD (docs/COMBAT-DRONES.md section
   * 3). The 7 inch chosen with the EMP, which this pilot does not own,
   * goes as the wide it has equipped, so nothing new is said; chosen with
   * the standard, which every pilot owns, the briefing's loadout becomes
   * it and the room echoes it. */
  const LOADOUT_NOW = `(() => {
    const v = window.__war().view;
    const sent = window.__sent.filter((m) => m && m.type === 'war' && m.op === 'loadout');
    return { mine: v.loadouts ? v.loadouts[window.__rooms().seat] : null, sent: sent.map((m) => m.loadout.warhead) };
  })()`;
  await page.evaluate("(() => { window.__sent.length = 0; const s = window.__ui.settings; s.airframe = '7inch'; s.combat = { '7inch': { payload: 'emp', accessories: [] } }; return true; })()");
  await page.sleep(1200);
  const unowned = await page.evaluate(LOADOUT_NOW);
  check('a combat quad\'s payload it does not own goes to war as the equipped warhead',
    unowned.mine && unowned.mine.warhead === 'wide' && unowned.sent.length === 0, JSON.stringify(unowned));
  await page.evaluate("(() => { window.__ui.settings.combat = { '7inch': { payload: 'standard', accessories: [] } }; return true; })()");
  await page.until("(() => { const v = window.__war().view; const l = v.loadouts && v.loadouts[window.__rooms().seat]; return Boolean(l) && l.warhead === 'standard'; })()", 10000).catch(() => {});
  const owned = await page.evaluate(LOADOUT_NOW);
  check('and one it owns is the loadout\'s warhead, echoed by the room',
    owned.mine && owned.mine.warhead === 'standard' && owned.mine.rack === 5 && owned.sent.includes('standard'), JSON.stringify(owned));
  /* The interceptor carries one payload, the standard warhead's, so with
   * the wide equipped and none chosen it goes as the standard, and the room
   * is told so. Back on the wide first, so the change is seen. */
  await page.evaluate("(() => { window.__ui.settings.combat = { '7inch': { payload: 'emp', accessories: [] } }; return true; })()");
  await page.until("(() => { const v = window.__war().view; const l = v.loadouts && v.loadouts[window.__rooms().seat]; return Boolean(l) && l.warhead === 'wide'; })()", 10000).catch(() => {});
  await page.evaluate("(() => { window.__sent.length = 0; const s = window.__ui.settings; s.airframe = 'interceptor'; s.combat = { interceptor: { payload: 'none', accessories: [] } }; return true; })()");
  await page.until("(() => { const v = window.__war().view; const l = v.loadouts && v.loadouts[window.__rooms().seat]; return Boolean(l) && l.warhead === 'standard'; })()", 10000).catch(() => {});
  const fast = await page.evaluate(LOADOUT_NOW);
  check('the interceptor goes to war with its proximity payload, the standard warhead, whatever is equipped',
    fast.mine && fast.mine.warhead === 'standard' && fast.mine.rack === 5 && fast.sent.includes('standard'), JSON.stringify(fast));
  await page.evaluate("(() => { const s = window.__ui.settings; s.airframe = 'interceptor'; s.combat = {}; return true; })()");
  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'ended'", 10000).catch(() => {});
  /* The room gives the ended war its own result now (lost, nothing paid),
   * which the campaign's poll (POLL_MS, 250 ms) takes and says. Taken
   * once before the mocks below, or a poll held up by a busy frame says
   * it after them and its line replaces theirs. */
  await page.until('window.__war().view.result != null', 10000).catch(() => {});
  await page.sleep(1000);
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

  /* A MOCKED RESULT, a win the check chooses. First seen undecided,
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
  await shot(page, 'after-result');

  /* THE PUBLIC VIEW AFTER THE WIN: the same page without ?missions=dev,
   * back in its room (a reload rejoins it, docs/FLOW-AUDIT.md rule 6). */
  const reloadInRoom = async (url) => {
    await page.evaluate('(() => { window.__beforeReload = true; return true; })()');
    await page.cdp.send('Page.navigate', { url: `${page.origin}${url}` }, page.sessionId);
    await page.until('window.__beforeReload !== true && window.__shellReady === true', 300000);
    await page.until(IN_LOBBY, 60000).catch(() => {});
    await page.evaluate('(() => { window.__campaign.open(); return true; })()');
    await page.until(`${SCREEN} !== null`, 10000).catch(() => {});
    return page.evaluate(SCREEN);
  };
  const pub = await reloadInRoom(pageUrl);
  check('without ?missions=dev, back in the room: mission 2, open by the win and released, is Play and playable, and so is mission 1; 3 waits on 2',
    pub && pub.missions[1].play === 'Play' && pub.missions[1].playable && pub.missions[0].play === 'Play' && pub.missions[0].playable
    && pub.missions[2].play === 'Win mission 2 first' && !pub.missions[2].playable,
    JSON.stringify(pub && pub.missions.map((m) => m.play)));
  check('and the stars won on mission 1 stay, 5 to 7 still Coming soon', pub && pub.missions[0].stars === 2 && pub.missions.slice(4).every((m) => m.play === 'Coming soon' && !m.playable),
    JSON.stringify(pub && pub.missions.map((m) => [m.stars, m.play])));

  /* THE DEV PATH again, back in its room, against this check's server,
   * which starts missions in development. */
  const dev = await reloadInRoom(devUrl);
  check('with ?missions=dev, back in the room: mission 2 playable, 5 to 7 still Coming soon', dev && dev.missions[1].play === 'Play' && dev.missions[1].playable
    && dev.missions.slice(4).every((m) => m.play === 'Coming soon' && !m.playable), JSON.stringify(dev && dev.missions.map((m) => m.play)));
  /* CONTINUE (docs/redesign/COMPLETENESS.md item 57): mission 1's Play
   * recorded the war as the last activity, kept across the reload, and
   * with mission 1 won home's Continue goes on with mission 2. */
  const cont = await page.evaluate(CONTINUE_LINK);
  check('after mission 1 won and a reload: the war is the last activity, and Continue stands in Defend the Paraná\'s link with mission 2, The Spillway, its title',
    cont.stored === 'war' && JSON.stringify(cont.links) === JSON.stringify([{ key: 'campaign', action: 'continue-mission', mission: 'itaipu-2', title: 'The Spillway' }]), JSON.stringify(cont));

  /* PLAY MISSION 2, from the lobby's Campaign row: the lobby says mission
   * 2 (the owner saw "Start mission 1" there, 2026-09-30) and Start now
   * starts it. */
  await click(page, '[data-mission="itaipu-2"] .campaign-play');
  await page.until(`${IN_LOBBY} && /Mission 2: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 15000).catch(() => {});
  await page.sleep(600);
  const row2 = await page.evaluate("(window.__ui.items().find((it) => it.action === 'friends-war-start') || {}).label || null");
  const lobby2 = await page.evaluate("(document.querySelector('.war-lobby-mission') || {}).textContent || null");
  check('the lobby says mission 2, and its host has Start now', /Mission 2: /.test(lobby2 || '') && row2 === 'Start now', `${lobby2} / ${row2}`);
  await page.evaluate("(() => { window.__sent.length = 0; window.__ui.act('friends-war-start'); return true; })()");
  await page.until("window.__war && window.__war().view.mission === 'itaipu-2'", 15000).catch(() => {});
  const start2 = await page.evaluate("window.__sent.find((m) => m && m.type === 'war' && m.op === 'start') || null");
  check('and it starts mission 2', start2 && start2.mission === 'itaipu-2', JSON.stringify(start2));
  await page.until("window.__war().view.state === 'briefing' && window.__warIntro() !== null", 15000).catch(() => {});
  const brief2 = await page.evaluate("(() => { const v = window.__war().view; const i = window.__warIntro(); return { id: v.id, state: v.state, intro: i !== null, film: i && i.film }; })()");
  check('mission 2\'s briefing plays the intro', brief2.state === 'briefing' && brief2.intro, JSON.stringify(brief2));
  check('and the intro is its own film, The Spillway\'s, not First Light\'s', brief2.film === filmFor(MISSIONS['itaipu-2']).id && brief2.film === 'spillway', JSON.stringify(brief2));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}

/*
 * THE OWNER, AND NOBODY ELSE, SKIPS THE WIN FIRST LOCK (the owner,
 * 2026-10-06: "always make it so that you need to win it first to
 * continue, EXCEPT for the admin account"). A fresh profile, signed in,
 * against a rooms server of this check's own that checks sessions with
 * this check's accounts server and has the owner's account as its
 * DEV_ACCOUNTS, as the VM's does. Mission 1 is never won here. A pilot
 * not on the list, with ?missions=dev, still has mission 2 locked; the
 * owner has it to play, with or without ?missions=dev now that 1 to 4
 * are released (2026-10-15).
 */
const accounts = await startAccounts();
const tag = `${process.pid}-${Date.now()}`;
const pilot = await accounts.signUp(`campaign-pilot-${tag}`, 'Pilot');
const owner = await accounts.signUp(`campaign-owner-${tag}`, 'Owner');
const ownerId = (await accounts.api('GET', '/api/account', undefined, owner.session)).id;
const signed = await roomsServer('', 'campaign-signed', { accountsOrigin: accounts.origin, devAccounts: String(ownerId) });
const devOf = async (who) => (await (await fetch(`${signed.url}/v2/dev`, { headers: { authorization: `Bearer ${who.session}` } })).json()).dev;
check('the rooms server says the owner is on its list and the pilot is not', (await devOf(owner)) === true && (await devOf(pilot)) === false);
/* Every answer the page gets from GET /v2/dev, so a row reads the page
 * after the server has answered it, not before. */
const DEV_TAP = `(() => {
  window.__devAnswers = [];
  const f = window.fetch;
  window.fetch = function (input, init) {
    const got = f.call(this, input, init);
    if (/\\/v2\\/dev$/.test(String(input && input.url ? input.url : input))) {
      got.then((r) => r.clone().json()).then((b) => window.__devAnswers.push(b), () => window.__devAnswers.push(null));
    }
    return got;
  };
})();`;
/* Holds every PUT of the account's progress back by window.__slowSync
 * ms once it is set, so a check can land a result while a sync is out. */
const SLOW_SYNC = `(() => {
  window.__slowSync = 0;
  const f = window.fetch;
  window.fetch = function (input, init) {
    const got = f.call(this, input, init);
    const hold = window.__slowSync;
    if (hold > 0 && init && init.method === 'PUT' && /\\/api\\/account\\/progress$/.test(String(input && input.url ? input.url : input))) {
      return got.then((r) => new Promise((done) => { setTimeout(() => done(r), hold); }));
    }
    return got;
  };
})();`;
const signedUrl = `/index.html?rooms=${encodeURIComponent(signed.url)}`;
const page2 = await openPage({
  root, url: `${signedUrl}&missions=dev`, width: 1280, height: 720, seed: [DEV_TAP, SLOW_SYNC, seedSignedIn(accounts.origin, pilot)],
});
const openCampaign = async () => {
  await page2.until('window.__shellReady === true', 300000);
  await page2.evaluate('(() => { window.__campaign.open(); return true; })()');
  await page2.until(`${SCREEN} !== null && window.__devAnswers.length > 0`, 15000).catch(() => {});
  await page2.sleep(300);
  return page2.evaluate(`({ screen: ${SCREEN}, answers: window.__devAnswers })`);
};
let page2Closed = false;
const reload = async (url) => {
  await page2.evaluate('(() => { window.__beforeReload = true; return true; })()');
  await page2.cdp.send('Page.navigate', { url: `${page2.origin}${url}` }, page2.sessionId);
  await page2.until('window.__beforeReload !== true', 60000);
};
try {
  const asPilot = await openCampaign();
  const pm = asPilot.screen && asPilot.screen.missions;
  check('a pilot not on the list, ?missions=dev, mission 1 not won: mission 2 says Win mission 1 first and is not playable',
    pm && pm[0].best === 'Not flown yet' && pm[1].play === 'Win mission 1 first' && !pm[1].playable
    && JSON.stringify(asPilot.answers) === '[{"dev":false}]', JSON.stringify(asPilot));
  check('and the lobby\'s and Make a room\'s missions are mission 1 alone',
    (await page2.evaluate('JSON.stringify(window.__campaign.playable())')) === '["itaipu-1"]');
  await shot(page2, 'locked-pilot');

  /* The same profile signed in as the owner instead. */
  await page2.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(ACCOUNT_KEY)}, ${JSON.stringify(JSON.stringify({
    session: owner.session, callsign: owner.callsign, publicKey: owner.publicKey, keyIsAccounts: true,
  }))});
    localStorage.setItem(${JSON.stringify(KEY_STORAGE)}, ${JSON.stringify(owner.identity)});
    return true;
  })()`);
  await reload(signedUrl);
  const plain = await openCampaign();
  const nm = plain.screen && plain.screen.missions;
  check('the owner without ?missions=dev: 1 to 4 released and playable, mission 1 never won (the win first lock lifted for the owner), 5 to 7 Coming soon',
    nm && nm.slice(0, 4).every((m) => m.play === 'Play' && m.playable) && nm.slice(4).every((m) => m.play === 'Coming soon' && !m.playable),
    JSON.stringify(nm && nm.map((m) => m.play)));

  await reload(`${signedUrl}&missions=dev`);
  const asOwner = await openCampaign();
  const om = asOwner.screen && asOwner.screen.missions;
  check('the owner, ?missions=dev, mission 1 never won: mission 2 is Play and playable',
    om && om[0].best === 'Not flown yet' && om[0].stars === 0 && om[1].play === 'Play' && om[1].playable
    && JSON.stringify(asOwner.answers) === '[{"dev":true}]', JSON.stringify(asOwner));
  check('and 3 and 4 too, 5 to 7 still Coming soon', om && om.slice(2, 4).every((m) => m.play === 'Play' && m.playable)
    && om.slice(4).every((m) => m.play === 'Coming soon' && !m.playable), JSON.stringify(om && om.map((m) => m.play)));
  await shot(page2, 'unlocked-owner');

  /* AND PLAY WORKS, against a server shaped as the VM's (no DEV_MISSIONS):
   * the room made for mission 2 is public, as a released mission's is,
   * and it starts it for the owner, its host, past the win first lock. */
  await click(page2, '[data-mission="itaipu-2"] .campaign-play');
  await page2.until(CONSENT, 10000).catch(() => {});
  await page2.sleep(700);
  await page2.tap('Enter');
  await page2.until(`${IN_LOBBY} && /Mission 2: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 60000).catch(() => {});
  await page2.sleep(600);
  const made = await page2.evaluate(`(() => {
    const r = window.__rooms();
    return { phase: r.phase, public: r.public, host: r.host === r.seat, mode: r.mode, pending: window.__campaign.pending(),
      line: (document.querySelector('.war-lobby-mission') || {}).textContent || '' };
  })()`);
  check('the owner\'s Play on mission 2: a public war room made for it (released), its host, mission 2 remembered',
    made.phase === 'open' && made.public === true && made.host && made.mode === 'war' && /Mission 2: /.test(made.line)
    && made.pending && made.pending.mission === 'itaipu-2', JSON.stringify(made));
  await page2.evaluate("(() => { window.__ui.act('friends-war-start'); return true; })()");
  await page2.until("window.__war && window.__war().view.mission === 'itaipu-2'", 15000).catch(() => {});
  const took = await page2.evaluate("(() => { const v = window.__war().view; return { state: v.state, mission: v.mission, error: v.error ?? null }; })()");
  check('and Start now starts mission 2 there', took.mission === 'itaipu-2' && ['briefing', 'countdown', 'live'].includes(took.state), JSON.stringify(took));

  /* A RESULT RECORDED WHILE A SYNC IS OUT, then a reload at the result
   * card: the sync's answer is from before the result, and put over it
   * the stars were gone from the page, its storage and the account. A
   * result the check chooses, on a war of its own, first seen undecided. */
  const MISSION1 = "JSON.stringify((window.__ui.settings.campaign.missions || {})['itaipu-1'] || null)";
  const STARS3 = JSON.stringify({ stars: 3, won: true, credits: 330 });
  const outSync = await page2.evaluate(`(async () => {
    window.__slowSync = 1500;
    const out = window.__accountSync();
    await new Promise((done) => { setTimeout(done, 300); });
    window.__campaign.observe({ id: 9901, mission: 'itaipu-1', state: 'live', result: null }, 'SYNCRACE');
    window.__campaign.observe({ id: 9901, mission: 'itaipu-1', state: 'won', result: { won: true, stars: 3, credits: 330 } }, 'SYNCRACE');
    const during = ${MISSION1};
    await out;
    window.__slowSync = 0;
    return { during, after: ${MISSION1}, stored: JSON.stringify((JSON.parse(localStorage.getItem('webfpv.settings.v3')).campaign.missions || {})['itaipu-1'] || null) };
  })()`);
  check('three stars recorded while a sync is out are still there when its answer lands, here and in storage',
    outSync.during === STARS3 && outSync.after === STARS3 && outSync.stored === STARS3, JSON.stringify(outSync));
  await reload(signedUrl);
  const back = await openCampaign();
  check('and after a reload the campaign page shows them', back.screen && back.screen.missions[0].stars === 3, JSON.stringify(back.screen && back.screen.missions[0]));
  const heldBy = async () => ((await accounts.api('GET', '/api/account/progress', undefined, owner.session)).progress.data.campaign?.missions || {})['itaipu-1'] || null;
  for (let i = 0; i < 40 && (await heldBy())?.stars !== 3; i += 1) {
    await page2.sleep(250);
  }
  check('and the account holds them', JSON.stringify(await heldBy()) === STARS3, JSON.stringify(await heldBy()));

  const errs = page2.errors.filter((e) => !e.startsWith('network:'));
  check('no page error, signed in', errs.length === 0, errs.slice(0, 3).join(' | '));

  /* Done with this page: closed before the next opens, inside the
   * check's memory ceiling (two pages and three servers were OOM killed
   * at 4G, 2026-10-14). */
  await page2.close();
  page2Closed = true;

  /* CONTINUE ON ANOTHER COMPUTER (docs/redesign/COMPLETENESS.md item 57):
   * the owner's Play recorded the war as the last activity, and the
   * account holds it beside mission 1's stars; a fresh profile signed in
   * as the owner is given both by the sync, and home's Continue, one
   * click, is mission 2's Play: the consent (asked on each computer),
   * then a war room made for mission 2. */
  const lastHeld = async () => (await accounts.api('GET', '/api/account/progress', undefined, owner.session)).progress.data.lastActivity ?? null;
  for (let i = 0; i < 40 && (await lastHeld()) !== 'war'; i += 1) {
    await page2.sleep(250);
  }
  check('the account holds the war as the owner\'s last activity', (await lastHeld()) === 'war', JSON.stringify(await lastHeld()));
  const page3 = await openPage({
    root, url: `${signedUrl}&missions=dev`, width: 1280, height: 720, seed: [seedSignedIn(accounts.origin, owner)],
  });
  try {
    await page3.until('window.__shellReady === true', 300000);
    await page3.until("!!document.querySelector('.gate-card-continue[data-mission]')", 30000).catch(() => {});
    const link = await page3.evaluate("(() => { const b = document.querySelector('.gate-card-continue'); return b ? { text: b.textContent, mission: b.dataset.mission || null, title: b.title, card: [...b.classList].find((c) => c.startsWith('gate-card-') && c !== 'gate-card-continue') } : null; })()");
    check('another computer, signed in: home\'s Continue in Defend the Paraná\'s link, mission 2 its mission',
      link && link.text === 'Continue' && link.mission === 'itaipu-2' && link.title === 'The Spillway' && link.card === 'gate-card-campaign', JSON.stringify(link));
    await click(page3, '.gate-card-continue');
    await page3.until(CONSENT, 10000).catch(() => {});
    const asked = await page3.evaluate(CONSENT);
    check('one click on it asks the Defend the Paraná consent', asked);
    await page3.sleep(700);
    await page3.tap('Enter');
    await page3.until(`${IN_LOBBY} && /Mission 2: /.test((document.querySelector('.war-lobby-mission') || {}).textContent || '')`, 60000).catch(() => {});
    const made3 = await page3.evaluate("(() => { const r = window.__rooms(); return { phase: r.phase, mode: r.mode, pending: window.__campaign.pending(), line: (document.querySelector('.war-lobby-mission') || {}).textContent || '' }; })()");
    check('then a war room made for mission 2, mission 2 remembered for it',
      made3.phase === 'open' && made3.mode === 'war' && /Mission 2: /.test(made3.line) && made3.pending && made3.pending.mission === 'itaipu-2', JSON.stringify(made3));
    await shot(page3, 'continue-other-computer');

    /* THE INTERIOR'S CONTINUE: its mission 1's Play, through its consent,
     * records The Interior as the last activity; Continue then goes on with
     * its mission 1 until that is won, then mission 2. On the other
     * computer, in mission 2's lobby. */
    const opsPlayable = await page3.evaluate("JSON.stringify(window.__opsCampaign.playable())");
    await page3.evaluate("(() => { window.__opsCampaign.playMission('interior-1'); return true; })()");
    await page3.until("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden && /The Interior/.test(d.textContent); })()", 10000).catch(() => {});
    const opsAsked = await page3.evaluate("(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? d.textContent.slice(0, 60) : null; })()");
    await page3.sleep(700);
    await click(page3, '.name-dialog .name-dialog-btn.on');
    await page3.until("window.__ui.settings.lastActivity === 'interior'", 10000).catch(() => {});
    const ops1 = await page3.evaluate(CONTINUE_LINK);
    check('The Interior\'s Play, consent given: The Interior is the last activity, Continue in its link with its mission 1, The Old War',
      ops1.stored === 'interior' && JSON.stringify(ops1.links) === JSON.stringify([{ key: 'interior', action: 'continue-mission', mission: 'interior-1', title: 'The Old War' }]), JSON.stringify({ ...ops1, opsPlayable, opsAsked }));
    await page3.evaluate("(() => { window.__opsCampaign.record('CHECK-INT', { uid: 'check-interior-1', mission: 'interior-1', result: { won: true, stars: 2, flags: {} } }); return true; })()");
    const ops2 = await page3.evaluate(CONTINUE_LINK);
    check('and once it is won, Continue goes on with mission 2, Eyes in the Forest',
      JSON.stringify(ops2.links) === JSON.stringify([{ key: 'interior', action: 'continue-mission', mission: 'interior-2', title: 'Eyes in the Forest' }]), JSON.stringify(ops2));
    const errs3 = page3.errors.filter((e) => !e.startsWith('network:'));
    check('no page error, another computer', errs3.length === 0, errs3.slice(0, 3).join(' | '));
  } finally {
    await page3.close();
  }
} finally {
  if (!page2Closed) {
    await page2.close();
  }
  await signed.stop();
  await accounts.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
