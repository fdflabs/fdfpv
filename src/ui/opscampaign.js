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
 * progress (applyResult: stars and the script's flags), once per match.
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
  MAX_STARS, applyResult, cardLabel, createCampaignStore, released, starsOf,
} from '../game/campaign.js';
import { str } from '../strings/index.js';

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
  /* Matches whose result is in the progress already. */
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
    play(m);
  }

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
    /* A finished match of one of this campaign's missions, once: its
     * stars and flags into the synced progress. */
    record(key, view) {
      if (recorded.has(key) || !view || !view.result || !missions.some((m) => m.id === view.mission)) {
        return;
      }
      recorded.add(key);
      store.save(applyResult(cur(), view.mission, {
        won: view.result.won === true, stars: view.result.stars ?? 0, credits: 0, flags: view.result.flags ?? {},
      }));
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
