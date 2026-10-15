/*
 * opscampaign.js: the screen of a campaign of ops missions, The Interior
 * first (docs/campaign/interior/TECH-NEEDS.md N20), beside Defend the
 * Paraná's (src/ui/campaign.js). Its card in Operations opens it; it lists
 * every mission of the campaign with its stars and its state, and a
 * released mission's Play asks the campaign's consent (it shows armed
 * conflict) before anything is made, as the war's card does
 * (docs/FLOW-AUDIT.md rule 9: at the room set up for it, never at the
 * card).
 *
 * The states are the release gate's (src/game/campaign.js released,
 * cardLabel): a mission in development is HELD until its release (a
 * developer's page, ?missions=dev, may play it); one only planned shows
 * its card label, Under development (the owner's words). No credits and
 * no shop: platforms unlock by mission.
 *
 * It also records a finished match's result into the synced campaign
 * progress (applyResult: stars and the script's flags), once per match:
 * by the room's id for it (the view's uid, edge/rooms/ops.js), kept in
 * the save (src/game/campaign.js payResult), so a reload, a reconnect or
 * a late join into the debrief pays a match this page never saw end, and
 * pays it once. The room decides who is paid: it sends the result only to
 * the seats whose pilot took part (ops.js took), never to a watcher or a
 * pilot first seated after the end. A room from before uid is paid as it
 * always was: once per match key, remembered in memory, and only from the
 * debrief a page saw the end of.
 *
 * Campaign agnostic: the campaign is a list of { id, key, release, label }
 * and its words are string keys under `ops.campaign.<campaign>`.
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

import {
  MAX_STARS, applyResult, cardLabel, createCampaignStore, paidWar, payResult, released, starsOf,
} from '../game/campaign.js';
import { str } from '../strings/index.js';
import { nextMission } from './continuity.js';

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

/* The states a match ends in (edge/rooms/ops.js finish). */
const ENDS = ['won', 'lost', 'ended'];

/* A match's identity in the log and the save: the room's uid for it, or
 * `key` (the room's code and match id) for a room from before uid. */
export function matchOf(key, view) {
  return view?.uid || key;
}

/* The word a mission's card shows: held while in development (the
 * owner flies it before it opens), else its card label or release. */
export function missionState(m, dev = false) {
  if (released(m.id, dev)) {
    return 'available';
  }
  return m.release === 'development' ? 'held' : cardLabel(m);
}

/*
 * ui: the shell's UI; campaign: { id, consent }; missions: its list;
 * devMissions: a developer's page offers what is in development;
 * consented(): resolves whether the pilot agreed to the campaign's
 * consent (asked once, kept); play(mission): what Play does once agreed.
 */
export function createOpsCampaignScreen({
  ui, campaign, missions, devMissions = false, consented, play,
}) {
  /* A result recorded may be a first (progress-ui.js checkFirsts). */
  const store = createCampaignStore(ui.settings, () => {
    ui.persistSettings();
    ui.progress.checkFirsts();
  });
  const cur = () => store.load();
  const k = (rest) => `ops.campaign.${campaign.id}.${rest}`;
  let isOpen = false;
  /* Matches whose result is in the progress already, by uid (or key, a
   * room from before uid): the save holds the uids, this spares a look
   * at it on every ops message (src/main.js opsPaid calls record on each
   * while a result shows). */
  const recorded = new Set();

  function close() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    ui.closeNameDialog(null);
  }

  async function go(m) {
    close();
    if (campaign.consent && !(await consented())) {
      /* Back on the consent: the campaign's page again, nothing made. */
      api.open();
      return;
    }
    /* Agreed: a session of this campaign, home's Continue holds it
     * (src/ui/continuity.js), the campaign's id its activity's. */
    ui.settings.lastActivity = campaign.id;
    ui.persistSettings();
    play(m);
  }

  const playable = () => missions.filter((m) => missionState(m, devMissions) === 'available').map((m) => m.id);

  function missionCard(m, i) {
    const card = el('div', 'campaign-mission');
    card.dataset.mission = m.id;
    card.dataset.release = m.release;
    const state = missionState(m, devMissions);
    card.dataset.state = state;
    const top = el('div', 'campaign-mission-top');
    top.append(el('span', 'campaign-n', str('campaign.mission_n', { n: i + 1 })));
    top.append(el('span', 'campaign-tag', str(`ops.campaign.state_${state}`)));
    top.append(starRow(starsOf(cur(), m.id)));
    card.append(top);
    card.append(el('div', 'campaign-name', str(k(`m.${m.key}`))));
    card.append(el('div', 'campaign-line', str(k(`m.${m.key}_blurb`))));
    const open = state === 'available';
    card.append(button('name-dialog-btn on campaign-play', open ? str('campaign.play') : str(`ops.campaign.state_${state}`), () => go(m), !open));
    return card;
  }

  function draw(note) {
    const box = el('div', 'name-dialog-box campaign-box ops-campaign-box');
    box.dataset.campaign = campaign.id;
    box.append(el('div', 'campaign-eyebrow', str(k('eyebrow'))));
    box.append(el('h2', null, str(k('card'))));
    box.append(el('p', 'lede', str(k('lede'))));
    const list = el('div', 'campaign-list');
    missions.forEach((m, i) => list.append(missionCard(m, i)));
    box.append(list);
    if (note) {
      box.append(el('p', 'campaign-last', note));
    }
    const row = el('div', 'name-dialog-row');
    row.append(button('name-dialog-btn', str('campaign.back'), close));
    box.append(row);
    ui.nameDialog.textContent = '';
    ui.nameDialog.append(box);
    ui.nameDialog.hidden = false;
  }

  const api = {
    /* note: a line under the missions (what a Play could not do). */
    open(note = null) {
      if (!ui.nameDialog.hidden) {
        return;
      }
      isOpen = true;
      ui.nameWait = null;
      ui.nameKeyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      };
      ui.nameDialog.addEventListener('keydown', ui.nameKeyHandler, true);
      draw(note);
      const first = ui.nameDialog.querySelector('button.on:not(:disabled)') || ui.nameDialog.querySelector('button:not(:disabled)');
      if (first) {
        first.focus();
      }
    },
    close,
    isOpen: () => isOpen && !ui.nameDialog.hidden,
    /*
     * A finished match: of one of this campaign's missions, paid once
     * per uid (key, the room's code and match id, for a room from before
     * uid), its stars and flags into the synced progress; and of any
     * mission, its result logged (src/game/events.js mission_end) where
     * this run's log has none for it, so its debrief reads it there
     * (src/game/debrief.js fromOps). One this entry did not pay (paid
     * before, by uid, or with no result for this seat) is logged unpaid,
     * which nothing counts.
     */
    record(key, view) {
      if (!view || !(view.result || ENDS.includes(view.state))) {
        return;
      }
      const id = matchOf(key, view);
      let paid = false;
      if (!recorded.has(id) && view.result && missions.some((m) => m.id === view.mission)) {
        recorded.add(id);
        paid = !(view.uid && paidWar(cur(), view.uid));
      }
      if (paid) {
        const res = {
          won: view.result.won === true, stars: view.result.stars ?? 0, credits: 0, flags: view.result.flags ?? {},
        };
        store.save(view.uid ? payResult(cur(), view.uid, view.mission, res) : applyResult(cur(), view.mission, res));
      } else if (ui.progress.runEvents().some((e) => e.type === 'mission_end' && e.match === id)) {
        return;
      }
      const won = view.result ? view.result.won === true : view.state === 'won';
      ui.progress.event('mission_end', {
        mission: view.mission,
        match: id,
        won,
        state: won ? 'won' : view.state === 'ended' ? 'ended' : 'lost',
        stars: view.result && Number.isFinite(view.result.stars) ? view.result.stars : 0,
        earned: view.result && Array.isArray(view.result.starIds) ? view.result.starIds.length : 0,
        paid,
        airframe: ui.progress.airframe,
      });
      ui.progress.foldFlight();
    },
    playable,
    /* Home's Continue (src/ui/continuity.js): the mission this pilot goes
     * on with, { id, name }, or null; and its Play, consent first. */
    nextMission() {
      const ids = playable();
      const m = nextMission(missions, cur(), (id) => ids.includes(id));
      return m ? { id: m.id, name: str(k(`m.${m.key}`)) } : null;
    },
    playMission(id) {
      const m = missions.find((x) => x.id === id);
      if (m && playable().includes(id)) {
        go(m);
      }
    },
    /* The mission after `id` in the campaign and the word its card shows,
     * or null at the end. */
    next(id) {
      const i = missions.findIndex((m) => m.id === id);
      const m = i >= 0 ? missions[i + 1] : null;
      return m ? { id: m.id, key: m.key, label: missionState(m, devMissions) } : null;
    },
  };
  return api;
}
