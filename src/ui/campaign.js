/*
 * campaign.js: Defend the Paraná's screens, and the campaign's half of a
 * war room. The state and its rules are src/game/campaign.js; what goes to
 * the room and comes back is src/share/campaignwar.js.
 *
 *   the screen   Act 1's seven missions, their stars and best result, a
 *                Play each, or why not (one not released says Under
 *                development or Coming soon, and keeps its stars); and
 *                the shop. Drawn on the shell's one overlay
 *                (ui.nameDialog, the node askConfirm uses), so the menu's
 *                keys are already held while it is open and closing it is
 *                closeNameDialog, as for every other dialog.
 *   Play         remembers the mission and goes through the Defend Itaipu
 *                card's own way in (enterWarRoom: its consent, a private
 *                Itaipu room, this pilot its host, the start row under the
 *                cursor). The start row then starts that mission with this
 *                pilot's loadout (startSelected), in that room only.
 *   the watch    every POLL_MS: a room the pilot has left forgets the
 *                mission; a loadout the room would take is said before
 *                the go; a result the room gives is recorded, once.
 *
 * A RESULT IS RECORDED ONCE, and only for a war this page watched go
 * undecided: a war first seen already decided (a reload after the end) is
 * one this pilot has already been paid for, or never flew.
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

import {
  ACT1, MAX_STARS, UPGRADES, applyResult, buy, cannotBuy, createCampaignStore, credits, equip, gateOpen, loadoutOf,
  released, starsOf, totalStars, unlocked,
} from '../game/campaign.js';
import { loadoutDue, loadoutMessage, resultOf, startMessage } from '../share/campaignwar.js';
import { str } from '../strings/index.js';

const POLL_MS = 250;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function button(cls, text, onClick, disabled = false) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function starRow(n) {
  const row = el('span', 'campaign-stars');
  row.setAttribute('aria-label', str('campaign.stars_of', { n, of: MAX_STARS }));
  for (let i = 0; i < MAX_STARS; i += 1) {
    row.append(el('span', i < n ? 'campaign-star on' : 'campaign-star', i < n ? '★' : '☆'));
  }
  return row;
}

/* A key for strings: upgrade ids have hyphens, string keys may not. */
const skey = (id) => id.replace(/-/g, '_');

/*
 * ui: the shell's UI (ui.js), whose settings keep the campaign.
 * devMissions: offer the missions in development too (campaign.js
 * released), for the checks against a rooms server that starts them.
 * enterWarRoom(mission): the Defend Itaipu
 * card's way in, for that mission, resolving the code of the room it made,
 * or null. send(obj): the room's socket. view(): the war view
 * (roomWar.view()). room(): { phase, code, seat }.
 */
export function createCampaignScreen({
  ui, devMissions = false, enterWarRoom, send, view, room, craftWarhead = null,
}) {
  const store = createCampaignStore(ui.settings, () => ui.persistSettings());
  /* Read fresh each time: an account sync may replace the section. */
  const cur = () => store.load();
  /* A developer's page tests a mission in development without winning
   * the ones before it first (the owner, 2026-10-06: the dev link showed
   * The Spillway as "Win mission 1 first"). */
  const flyable = (i) => devMissions || unlocked(cur(), i);
  /* The loadout the room is told: the campaign's, with the warhead the
   * seated aircraft carries when it carries one, a combat quad's payload
   * (docs/COMBAT-DRONES.md section 3). craftWarhead(allowed, equipped) is
   * the shell's; allowed is what this pilot owns, and the standard. */
  const loadoutNow = () => {
    const st = cur();
    const l = loadoutOf(st);
    if (!craftWarhead) {
      return l;
    }
    const allowed = ['standard', ...UPGRADES.filter((u) => u.kind === 'warhead' && Object.hasOwn(st.owned, u.id)).map((u) => u.id)];
    const w = craftWarhead(allowed, l.warhead);
    return w ? { ...l, warhead: w } : l;
  };
  let page = null;
  /* The mission Play chose: { mission, code (the room made for it) },
   * or null. */
  let pending = null;
  /* `${code}:${war id}` -> whether its result is already accounted for. */
  const watched = new Map();
  /* The last loadout said, as `${code}:${war id}:${json}`, so a room that
   * clamps it to something else is not told again four times a second. */
  let loadoutSaid = null;
  let last = null;

  function commit(change) {
    store.save(change(cur()));
    draw();
  }

  function isOpen() {
    return page !== null && !ui.nameDialog.hidden;
  }

  function open(to = 'missions') {
    if (!ui.nameDialog.hidden && page === null) {
      return;
    }
    page = to;
    if (ui.nameDialog.hidden) {
      ui.nameWait = null;
      ui.nameKeyHandler = (e) => {
        if (e.key !== 'Escape') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (page === 'shop') {
          open('missions');
        } else {
          close();
        }
      };
      ui.nameDialog.addEventListener('keydown', ui.nameKeyHandler, true);
    }
    draw(true);
    const first = ui.nameDialog.querySelector('button.on:not(:disabled)') || ui.nameDialog.querySelector('button:not(:disabled)');
    if (first) {
      first.focus();
    }
  }

  function close() {
    if (page === null) {
      return;
    }
    page = null;
    ui.closeNameDialog(null);
  }

  function head(box, title) {
    box.append(el('div', 'campaign-eyebrow', str('campaign.act1')));
    box.append(el('h2', null, title));
    const bank = el('div', 'campaign-bank');
    bank.append(el('span', 'campaign-credits', str('campaign.credits', { n: credits(cur()) })));
    bank.append(el('span', null, str('campaign.stars_total', { n: totalStars(cur()), of: ACT1.length * MAX_STARS })));
    box.append(bank);
  }

  function missionCard(m, i) {
    const card = el('div', 'campaign-mission');
    card.dataset.mission = m.id;
    card.dataset.release = m.release;
    const top = el('div', 'campaign-mission-top');
    top.append(el('span', 'campaign-n', str('campaign.mission_n', { n: i + 1 })));
    top.append(el('span', m.free ? 'campaign-tag free' : 'campaign-tag', str(m.free ? 'campaign.free' : 'campaign.tag')));
    top.append(starRow(starsOf(cur(), m.id)));
    card.append(top);
    card.append(el('div', 'campaign-name', str(`campaign.m.${m.key}`)));
    card.append(el('div', 'campaign-line', str(`campaign.m.${m.key}_blurb`)));
    const best = cur().missions[m.id];
    card.append(el('div', 'campaign-best', best
      ? str(best.won ? 'campaign.best_won' : 'campaign.best_lost', { n: best.credits })
      : str('campaign.not_flown')));
    let why = null;
    if (!released(m.id, devMissions)) {
      why = str(`campaign.release_${m.release}`);
    } else if (!flyable(i)) {
      why = str('campaign.locked', { n: i });
    } else if (!gateOpen(i)) {
      why = str('campaign.tag');
    }
    card.append(button('name-dialog-btn on campaign-play', why || str('campaign.play'), () => play1(i), why !== null));
    return card;
  }

  function drawMissions(box) {
    head(box, str('campaign.card'));
    box.append(el('p', 'lede', str('campaign.act1_lede')));
    const list = el('div', 'campaign-list');
    ACT1.forEach((m, i) => list.append(missionCard(m, i)));
    box.append(list);
    if (last) {
      box.append(el('p', 'campaign-last', last));
    }
    const row = el('div', 'name-dialog-row');
    row.append(button('name-dialog-btn', str('campaign.back'), close));
    row.append(button('name-dialog-btn campaign-to-shop', str('campaign.shop'), () => open('shop'), !gateOpen(null)));
    box.append(row);
  }

  function upgradeAction(u) {
    if (u.later) {
      return { label: str('campaign.later', { n: u.later }), disabled: true };
    }
    const owned = Object.hasOwn(cur().owned, u.id);
    if (owned && u.kind === 'warhead') {
      const on = cur().equipped.warhead === u.id;
      return on
        ? { label: str('campaign.equipped'), go: () => commit((s) => equip(s, 'warhead', 'standard')), on: true }
        : { label: str('campaign.equip'), go: () => commit((s) => equip(s, 'warhead', u.id)) };
    }
    if (owned && u.kind === 'speed') {
      const on = cur().equipped.speed;
      return on
        ? { label: str('campaign.equipped'), go: () => commit((s) => equip(s, 'speed', false)), on: true }
        : { label: str('campaign.equip'), go: () => commit((s) => equip(s, 'speed', true)) };
    }
    if (owned) {
      return { label: str('campaign.carried'), disabled: true, on: true };
    }
    const no = cannotBuy(cur(), u.id);
    if (no === 'needs') {
      return { label: str('campaign.needs', { name: str(`campaign.u.${skey(u.needs)}`) }), disabled: true };
    }
    return { label: str('campaign.buy', { n: u.price }), go: () => commit((s) => buy(s, u.id)), disabled: no !== null };
  }

  function drawShop(box) {
    head(box, str('campaign.shop'));
    box.append(el('p', 'lede', str('campaign.shop_lede')));
    const list = el('div', 'campaign-list');
    for (const u of UPGRADES) {
      const row = el('div', 'campaign-item');
      row.dataset.upgrade = u.id;
      const text = el('div', 'campaign-item-text');
      text.append(el('div', 'campaign-name', str(`campaign.u.${skey(u.id)}`)));
      text.append(el('div', 'campaign-line', str(`campaign.u.${skey(u.id)}_note`)));
      row.append(text);
      const a = upgradeAction(u);
      row.append(button(`name-dialog-btn campaign-buy${a.on ? ' on' : ''}`, a.label, a.go || (() => {}), Boolean(a.disabled)));
      list.append(row);
    }
    box.append(list);
    const l = loadoutOf(cur());
    box.append(el('p', 'campaign-loadout', str('campaign.loadout', {
      rack: l.rack,
      warhead: str(`campaign.u.${l.warhead}`),
      speed: str(l.speedMul > 1 ? 'campaign.speed_fast' : 'campaign.speed_normal'),
    })));
    const row = el('div', 'name-dialog-row');
    row.append(button('name-dialog-btn', str('campaign.missions'), () => open('missions')));
    box.append(row);
  }

  /* Redraw the open screen; `opening` also puts it up. A screen some
   * other dialog closed stays closed. */
  function draw(opening = false) {
    if (!opening && !isOpen()) {
      page = null;
      return;
    }
    const focused = document.activeElement && ui.nameDialog.contains(document.activeElement)
      ? document.activeElement.closest('[data-upgrade], [data-mission]') : null;
    const box = el('div', 'name-dialog-box campaign-box');
    box.dataset.page = page;
    if (page === 'shop') {
      drawShop(box);
    } else {
      drawMissions(box);
    }
    ui.nameDialog.textContent = '';
    ui.nameDialog.append(box);
    ui.nameDialog.hidden = false;
    /* The same row keeps the focus across a redraw, so Buy then Equip is
     * two presses of Enter, not a hunt for the button again. */
    if (focused) {
      const again = box.querySelector(`[data-upgrade="${focused.dataset.upgrade}"] button, [data-mission="${focused.dataset.mission}"] button`);
      if (again) {
        again.focus();
      }
    }
  }

  async function play1(i) {
    const m = ACT1[i];
    close();
    pending = null;
    /* The mission is the room's that was made for it, by its code: never
     * a room that opens later, which is how a Play declined at the
     * consent, or one whose room never opened, used to start in a room
     * made by hand. */
    const code = await enterWarRoom(m.id);
    pending = code ? { mission: m.id, code } : null;
  }

  /* The start row's press, in the room Play made: that mission, this
   * pilot's loadout. False when the row is not the campaign's, and the
   * Defend Itaipu start goes ahead as ever. */
  function startSelected() {
    const r = room();
    bind(r);
    if (!pending || r.code !== pending.code) {
      return false;
    }
    send(startMessage(pending.mission, loadoutNow()));
    return true;
  }

  function observe(v, code) {
    if (!v || v.id == null) {
      return;
    }
    const key = `${code}:${v.id}`;
    const res = resultOf(v);
    if (!watched.has(key)) {
      watched.set(key, res !== null);
      return;
    }
    if (watched.get(key)) {
      return;
    }
    const i = ACT1.findIndex((m) => m.id === v.mission);
    /* A room without results (main before the war's Act 1) ends a
     * mission won or lost with none: say quietly that stars are coming,
     * pay nothing, and keep watching in case the result follows. */
    if (!res) {
      const later = str('campaign.result_later', { n: i + 1 });
      if (i >= 0 && (v.state === 'won' || v.state === 'lost') && last !== later) {
        last = later;
        draw();
      }
      return;
    }
    watched.set(key, true);
    if (i < 0) {
      return;
    }
    last = str(res.won ? 'campaign.result_won' : 'campaign.result_lost', { n: i + 1, stars: res.stars, credits: res.credits });
    commit((s) => applyResult(s, v.mission, res));
  }

  /* Forgets Play's mission once the pilot is in another room than the
   * one made for it. */
  function bind(r) {
    if (pending && r.code !== pending.code) {
      pending = null;
    }
  }

  /* The mission number (1 based) the start row starts in this room: the
   * one Play chose, else `fallback`, the room's own. */
  function selectedNumber(fallback = 1) {
    const r = room();
    bind(r);
    const i = pending && pending.code === r.code ? ACT1.findIndex((m) => m.id === pending.mission) : -1;
    return i >= 0 ? i + 1 : fallback;
  }

  function poll() {
    const r = room();
    bind(r);
    if (r.phase !== 'open') {
      return;
    }
    const v = view();
    observe(v, r.code);
    const l = loadoutNow();
    const said = `${r.code}:${v.id}:${JSON.stringify(l)}`;
    if (said !== loadoutSaid && loadoutDue(v, r.seat, l)) {
      loadoutSaid = said;
      send(loadoutMessage(l));
    }
  }

  setInterval(poll, POLL_MS);

  return {
    open,
    close,
    startSelected,
    selectedNumber,
    /* The missions this pilot may start, in order: released, open (the
     * one before won) and inside the full game's gate (Make a room's
     * Mission row, src/ui/roombrowser.js, and the lobby's). */
    playable: () => ACT1.filter((m, i) => released(m.id, devMissions) && flyable(i) && gateOpen(i)).map((m) => m.id),
    /* For the checks. */
    observe,
    state: cur,
    pending: () => (pending ? { ...pending } : null),
    page: () => page,
  };
}
