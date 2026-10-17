/*
 * briefcard.js: the mission brief card, shown in a room's briefing after
 * the mission's film and before its countdown (the owner, 2026-10-16:
 * w50). A skipped film comes straight to it; the host's Deploy, or the
 * room's countdown at the end of the card's span (src/share/war/intro.js
 * CARD_MS, edge/rooms/war.js and ops.js), closes it.
 *
 * Every word on it comes from the mission's own data, so it cannot say
 * what the game does not do:
 *   header      the mission's number and title, its operation, where and
 *               when (Defend the Paraná: the film's slate; The Interior:
 *               its clock's start), its estimatedMinutes, the pilots
 *   situation   two lines of the story: Defend the Paraná's campaign blurb
 *               and the slate's stakes; The Interior's from its
 *               MISSIONS.md briefing (ops.interior.mN.situation_1, _2)
 *   objectives  every stage's objectives in order, a seeded turn's (a
 *               stage reached by a `pick` exit) as one line of choices;
 *               The Interior's primaries and its rules
 *   stars       the war's three criteria (edge/rooms/war.js resultOf, the
 *               mission's starMw); The Interior's `stars`, worded as its
 *               debrief words them (debrief.js starText)
 *   threats     the war's attacker kinds its stages spawn; The Interior's
 *               ways its mission is lost (`lost`)
 *   your role   the aircraft (the war's `aircraft`; The Interior's role
 *               held, or the roles dealt), the war's loadout, and who is
 *               on the radio: the speakers of the mission's line ids
 *               (assets/audio/war/lines.json), the most heard first
 *   map         the mission's routes and targets (war), items (Interior)
 *   win, lose   the war's floor; The Interior's last stage's primaries and
 *               its `lost` whys
 *
 * cardOf is pure and scripts/briefcard-selftest.js holds it whole for
 * every playable mission in en and es. BriefCard draws it.
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

import { MISSIONS as WAR_MISSIONS, missionTime } from '../share/war/missions/index.js';
import { MISSIONS as OPS_MISSIONS } from '../share/ops/missions.js';
import { ROWS as OPS_ROWS } from '../share/ops/rows.js';
import { ACT1, BASE_RACK } from '../game/campaign.js';
import { airframeById } from '../../configs/airframes.js';
import { PILOTS } from './briefing.js';
import { starText } from './debrief.js';
import { plural, str } from '../strings/index.js';
import { mw } from './warhud.js';

/* The radio's speakers a card names, by lines.json speaker: the voices on
 * the net. The archive voices are the Interior prologue film's, never on
 * a mission's radio, and IBARRA's guide lines are IBARRA. */
const NET = {
  crest: 'crest', mirador: 'mirador', taller: 'taller', despacho: 'despacho', carancho: 'carancho',
  vega: 'vega', ibarra: 'ibarra', 'ibarra-guide': 'ibarra', rojas: 'rojas', ferrer: 'ferrer',
};

/* The playable missions a card is drawn for: Act 1 and The Interior's
 * flown rows, in order. The drill and the practice have no film and no
 * briefing (edge/rooms/gamelobby.js briefed), so no card. */
export const CARD_MISSIONS = Object.freeze([
  ...ACT1.filter((m) => m.release !== 'soon').map((m) => m.id),
  ...OPS_ROWS.filter((r) => r.release !== 'soon').map((r) => r.id),
]);

const skey = (id) => String(id).toLowerCase().replace(/[^a-z0-9_.]/g, '_');
const unique = (list) => [...new Set(list)];

/* Every string anywhere in the mission's data. */
function strings(o, out = []) {
  if (typeof o === 'string') {
    out.push(o);
  } else if (Array.isArray(o)) {
    o.forEach((x) => strings(x, out));
  } else if (o && typeof o === 'object') {
    Object.values(o).forEach((x) => strings(x, out));
  }
  return out;
}

/* The speakers of the mission's line ids, the most heard first.
 * speakerOf(id) is lines.json's speaker of a line id, or undefined. */
function radioOf(mission, speakerOf) {
  const count = new Map();
  for (const s of strings(mission)) {
    const who = NET[speakerOf(s)];
    if (who) {
      count.set(who, (count.get(who) ?? 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([who]) => str(`brief.radio.${who}`));
}

/* Points [east, north] as a box 100 wide, north up. */
function boxed(points, lines) {
  const all = [...points, ...lines.flat()];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const span = Math.max(Math.max(...xs) - x0, y1 - Math.min(...ys), 1);
  const k = 100 / span;
  const at = ([e, n]) => [Math.round((e - x0) * k * 10) / 10, Math.round((y1 - n) * k * 10) / 10];
  return {
    w: Math.round((Math.max(...xs) - x0) * k * 10) / 10,
    h: Math.round((y1 - Math.min(...ys)) * k * 10) / 10,
    points: points.map(at),
    lines: lines.map((l) => l.map(at)),
  };
}

/* An ops position: a list, or a dial's map of lists. */
function opsPoints(at) {
  if (Array.isArray(at)) {
    return [at];
  }
  return at && at.map ? Object.values(at.map).filter(Array.isArray) : [];
}

function warCard(mission, ctx) {
  const row = ACT1.find((m) => m.id === mission.id);
  const slate = (k) => str(`war.slate.${skey(mission.id)}.${k}`);
  const stages = mission.stages ?? [];
  /* Stages a `pick` exit draws between: the seeded turn. */
  const picked = new Set(stages.flatMap((s) => (s.exits ?? []).flatMap((e) => (e.to && Array.isArray(e.to.pick) ? e.to.pick : []))));
  const plain = unique(stages.filter((s) => !picked.has(s.id)).flatMap((s) => (s.objectives ?? []).map((o) => str(o.text))));
  const turns = unique(stages.filter((s) => picked.has(s.id)).flatMap((s) => (s.objectives ?? []).map((o) => str(o.text))));
  const kinds = unique(stages.flatMap((s) => (s.spawns ?? []).flatMap((w) => (w.mix ? w.mix.map(([k]) => k) : [w.kind]))));
  const loadout = ctx.loadout ?? { rack: BASE_RACK, warhead: 'standard', speedMul: 1 };
  const time = missionTime(mission);
  return {
    title: str('brief.card.mission', { n: mission.order, title: str(mission.title) }),
    facts: [
      { label: str('brief.card.operation'), value: str('campaign.card') },
      { label: str('brief.where'), value: slate('place') },
      { label: str('brief.card.when'), value: time ? `${slate('when')} · ${str(`daytime.${time}`)}` : slate('when') },
      ...commonFacts(mission, ctx, str('brief.pilots_value', { low: PILOTS[0], high: PILOTS[1] })),
    ],
    situation: [str(`campaign.m.${row.key}_blurb`), slate('stakes')],
    objectives: [...plain, ...(turns.length ? [str('brief.card.one_of', { list: turns.join(' / ') })] : [])],
    stars: [
      str('brief.star.held'),
      str('brief.star.no_losses'),
      str('brief.star.output', { mw: mw(mission.starMw ?? mission.floorMw) }),
    ],
    threats: kinds.map((k) => str(`brief.threat.${k}`)),
    role: [
      { label: str('brief.aircraft'), value: str('brief.aircraft_value', { names: mission.aircraft.map((a) => airframeById(a).name).join(', '), n: mission.airframes }) },
      {
        label: str('brief.card.loadout'),
        value: str('brief.card.loadout_value', {
          rack: loadout.rack, warhead: str(`campaign.u.${loadout.warhead}`), speed: str(loadout.speedMul > 1 ? 'campaign.speed_fast' : 'campaign.speed_normal'),
        }),
      },
      { label: str('brief.card.radio'), value: radioOf(mission, ctx.speakerOf).join('; ') },
    ],
    map: boxed(
      Object.values(mission.targets ?? {}).map((t) => [t.at[0], -t.at[2]]),
      Object.values(mission.routes ?? {}).map((r) => r.map((p) => [p[0], -p[2]])),
    ),
    win: str('brief.card.win_war', { mw: mw(mission.floorMw) }),
    lose: str('brief.card.lose_war', { mw: mw(mission.floorMw) }),
  };
}

function opsCard(mission, ctx) {
  const row = OPS_ROWS.find((r) => r.id === mission.id);
  const n = row.order;
  const stages = mission.stages ?? [];
  const tiered = (tier, list = stages) => unique(list.flatMap((s) => (s.objectives ?? []).filter((o) => o.tier === tier).map((o) => str(o.text))));
  const whys = unique((mission.lost ?? []).map((l) => skey(l.why)));
  const hour = mission.clock.startHour;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  const roleId = ctx.role ?? null;
  const roleDef = roleId ? mission.roles.find((r) => r.id === roleId) : null;
  const craft = (r) => r.platforms.map((p) => airframeById(p).name).join(', ');
  return {
    title: str(mission.title),
    facts: [
      { label: str('brief.card.operation'), value: str(`ops.campaign.${skey(mission.campaign)}.card`) },
      { label: str('brief.where'), value: str(`brief.map_${mission.map}`) },
      { label: str('brief.card.when'), value: str('brief.card.when_clock', { time: clock }) },
      ...commonFacts(mission, ctx, str(`ops.campaign.${skey(mission.campaign)}.card_roles`)),
    ],
    situation: [str(`ops.interior.m${n}.situation_1`), str(`ops.interior.m${n}.situation_2`)],
    objectives: [...tiered('primary'), ...tiered('rule').map((t) => str('brief.card.rule', { text: t }))],
    stars: (mission.stars ?? []).map((s) => starText(mission, s)),
    threats: whys.map((w) => str(`brief.threat.ops.${w}`)),
    role: [
      {
        label: str('brief.card.role'),
        value: roleDef
          ? str('brief.card.role_value', { role: str(`ops.role.${roleDef.id}`), aircraft: craft(roleDef) })
          : str('brief.card.roles_open', { roles: mission.roles.map((r) => str('brief.card.role_value', { role: str(`ops.role.${r.id}`), aircraft: craft(r) })).join('; ') }),
      },
      { label: str('brief.card.radio'), value: radioOf(mission, ctx.speakerOf).join('; ') },
    ],
    map: boxed((mission.items ?? []).flatMap((it) => opsPoints(it.at)).map((p) => [p[0], p[1]]), []),
    win: tiered('primary', stages.slice(-1)).join('; '),
    lose: whys.map((w) => str(`ops.why.${w}`)).join('; '),
  };
}

/* The rows both campaigns have: the length and the pilots, those in the
 * room or, with none, the campaign's own words (anyPilots). */
function commonFacts(mission, ctx, anyPilots) {
  const minutes = mission.estimatedMinutes;
  return [
    { label: str('brief.length'), value: minutes ? str('brief.minutes', { low: minutes[0], high: minutes[1] }) : str('brief.length_open') },
    {
      label: str('brief.pilots'),
      value: ctx.pilots ? plural('count.brief_card_pilots', ctx.pilots) : anyPilots,
    },
  ];
}

/*
 * The card of mission `id`, in the current locale, or null for an id
 * that has none (the drill, the practice, a mission no file holds).
 * ctx: { speakerOf(lineId), pilots (in the room, or null), loadout (the
 * war's, this pilot's), role (The Interior's, this pilot's) }.
 */
export function cardOf(id, ctx = {}) {
  const c = { speakerOf: () => undefined, ...ctx };
  if (!CARD_MISSIONS.includes(id)) {
    return null;
  }
  return Object.hasOwn(WAR_MISSIONS, id) ? warCard(WAR_MISSIONS[id], c) : opsCard(OPS_MISSIONS[id], c);
}

const CSS = `
.briefcard { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 9002;
  background: rgba(3, 5, 6, 0.72); font-family: ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace; pointer-events: auto; }
.briefcard.open { display: flex; }
.briefcard-box { width: min(72em, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
  color: rgba(236, 244, 240, 0.92); padding: 1.1em 1.4em 0; border: 1px solid rgba(236, 244, 240, 0.3);
  background: rgba(8, 12, 14, 0.94); font-size: clamp(10px, 1.5vh, 15px); letter-spacing: 0.03em; line-height: 1.4; }
.briefcard-eyebrow { color: rgba(236, 244, 240, 0.55); letter-spacing: 0.3em; font-size: 0.85em; }
.briefcard-box h2 { margin: 0.15em 0 0.5em; font-weight: normal; letter-spacing: 0.16em; font-size: 1.4em; }
.briefcard-facts { display: flex; flex-wrap: wrap; gap: 0.3em 1.6em; margin: 0 0 0.6em; }
.briefcard-facts span { color: rgba(236, 244, 240, 0.55); margin-right: 0.5em; }
.briefcard-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24em, 100%), 1fr)); gap: 0 2em; }
.briefcard h3 { margin: 0.7em 0 0.3em; font-weight: normal; font-size: 0.85em; letter-spacing: 0.3em; color: #f2d48a; }
.briefcard ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.25em; }
.briefcard li::before { content: '\\25b8'; color: rgba(236, 244, 240, 0.45); margin-right: 0.6em; }
.briefcard li.star::before { content: '\\2605'; color: #f2d48a; }
.briefcard-note { color: rgba(236, 244, 240, 0.6); margin-top: 0.3em; }
.briefcard-role { display: grid; grid-template-columns: auto 1fr; gap: 0.25em 1em; margin: 0; }
.briefcard-role dt { color: rgba(236, 244, 240, 0.55); }
.briefcard-role dd { margin: 0; }
.briefcard-map { display: block; width: 100%; max-height: 7em; margin-top: 0.3em; background: rgba(236, 244, 240, 0.04);
  border: 1px solid rgba(236, 244, 240, 0.15); }
.briefcard-ends { display: grid; grid-template-columns: auto 1fr; gap: 0.2em 1em; margin: 0 0 0.4em; padding-bottom: 0.6em;
  border-bottom: 1px solid rgba(236, 244, 240, 0.18); }
.briefcard-ends dt { letter-spacing: 0.2em; }
.briefcard-ends dt.win { color: #8dffb5; }
.briefcard-ends dt.lose { color: #ffc04a; }
.briefcard-ends dd { margin: 0; }
.briefcard-pilots { display: flex; flex-wrap: wrap; gap: 0.3em 1.2em; flex: 1 1 100%; }
.briefcard-pilots:empty { display: none; }
.briefcard-pilot.ready b { color: #8dffb5; }
.briefcard-pilot b { font-weight: normal; letter-spacing: 0.14em; color: rgba(236, 244, 240, 0.5); margin-left: 0.5em; }
.briefcard-row { display: flex; align-items: center; justify-content: flex-end; gap: 0.8em; flex-wrap: wrap;
  position: sticky; bottom: 0; padding: 0.6em 0 0.8em; margin-top: 0.6em; background: rgba(8, 12, 14, 0.97);
  border-top: 1px solid rgba(236, 244, 240, 0.18); }
.briefcard-status { flex: 1 1 18em; color: rgba(236, 244, 240, 0.75); }
.briefcard-keys { color: rgba(236, 244, 240, 0.45); font-size: 0.85em; }
.briefcard-btn { font: inherit; letter-spacing: 0.14em; color: #fff; background: transparent; border: 1px solid rgba(236, 244, 240, 0.5);
  padding: 0.55em 1.1em; min-height: 44px; min-width: 44px; cursor: pointer; }
.briefcard-btn.deploy { background: rgba(141, 255, 181, 0.14); border-color: #8dffb5; }
.briefcard-btn:focus-visible { outline: 2px solid #f2d48a; outline-offset: 2px; }
`;

function el(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  if (parent) {
    parent.append(n);
  }
  return n;
}

const SVG = 'http://www.w3.org/2000/svg';
function mapSvg(map) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'briefcard-map');
  svg.setAttribute('viewBox', `-4 -4 ${map.w + 8} ${map.h + 8}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', str('brief.card.map'));
  for (const line of map.lines) {
    const p = document.createElementNS(SVG, 'polyline');
    p.setAttribute('points', line.map((q) => q.join(',')).join(' '));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'rgba(255, 192, 74, 0.7)');
    p.setAttribute('stroke-width', '0.5');
    svg.append(p);
  }
  for (const [x, y] of map.points) {
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', '0.9');
    c.setAttribute('fill', 'rgba(141, 255, 181, 0.85)');
    svg.append(c);
  }
  return svg;
}

/*
 * The card on screen. act: { deploy(), replay() }. show(card, key) draws
 * a card (once per key: a match and a locale); state(s) each frame says
 * what changes under it: { pilots: [{ name, ready, host }] or [] alone,
 * deployed (this pilot pressed it), host, left (s to the countdown),
 * waiting (the host must wait for the film's end) }.
 *
 * Keys while open, ahead of the game's: Space or Enter deploys, V
 * replays the film; the pad's A and View do the same (main.js reads the
 * pad, pad(a, x)). Tab moves between the two buttons.
 */
export class BriefCard {
  constructor(root, act) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.act = act;
    this.el = el('div', 'briefcard', root);
    this.el.id = 'brief-card';
    this.box = el('div', 'briefcard-box', this.el);
    this.box.setAttribute('role', 'dialog');
    this.isOpen = false;
    this.key = null;
    this.shown = '';
    this.padWas = { a: true, x: true };
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) {
        return;
      }
      const deploy = e.code === 'Space' || (e.code === 'Enter' && document.activeElement !== this.replayBtn);
      if (!deploy && e.code !== 'KeyV') {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      /* A key held since before the card (the film's hold to skip)
       * repeats: never a press. */
      if (e.repeat) {
        return;
      }
      this.pressed = true;
      (deploy ? this.deployBtn : this.replayBtn).click();
    }, true);
    /* A key held down before the card opened (Space held to skip the
     * film) must not press the focused Deploy as it comes up. */
    window.addEventListener('keyup', (e) => {
      if (this.isOpen && !this.pressed && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    window.__briefCard = () => ({
      open: this.isOpen,
      /* What the pilot sees: open, and not hidden by anything over it. */
      shown: this.isOpen && getComputedStyle(this.el).visibility === 'visible' && getComputedStyle(this.el).display !== 'none',
      key: this.key,
      title: this.isOpen ? this.box.querySelector('h2').textContent : null,
      sections: this.isOpen ? Object.fromEntries([...this.box.querySelectorAll('section')].map((s) => [s.dataset.part, s.querySelectorAll('li, dd').length])) : null,
      text: this.isOpen ? this.box.textContent : null,
      status: this.isOpen ? this.status.textContent : null,
      pilots: this.isOpen ? [...this.pilots.children].map((p) => p.textContent) : null,
    });
  }

  show(card, key) {
    if (this.key === key) {
      this.open();
      return;
    }
    this.key = key;
    this.shown = '';
    const box = this.box;
    box.textContent = '';
    el('div', 'briefcard-eyebrow', box, str('brief.card.eyebrow'));
    el('h2', '', box, card.title);
    const facts = el('div', 'briefcard-facts', box);
    for (const f of card.facts) {
      const d = el('div', '', facts);
      el('span', '', d, f.label);
      d.append(f.value);
    }
    /* Win and lose under the header: the two lines a pilot must not miss. */
    const ends = el('dl', 'briefcard-ends', box);
    el('dt', 'win', ends, str('brief.card.win'));
    el('dd', '', ends, card.win);
    el('dt', 'lose', ends, str('brief.card.lose'));
    el('dd', '', ends, card.lose);
    const cols = el('div', 'briefcard-cols', box);
    const left = el('div', '', cols);
    const right = el('div', '', cols);
    const list = (parent, part, title, items, cls = '') => {
      const s = el('section', '', parent);
      s.dataset.part = part;
      el('h3', '', s, title);
      const ul = el('ul', '', s);
      items.forEach((t) => el('li', cls, ul, t));
      return s;
    };
    list(left, 'situation', str('brief.card.situation'), card.situation);
    list(left, 'objectives', str('brief.card.objectives'), card.objectives);
    const stars = list(left, 'stars', str('brief.card.stars'), card.stars, 'star');
    el('div', 'briefcard-note', stars, str('brief.card.stars_note'));
    list(right, 'threats', str('brief.card.threats'), card.threats);
    const role = el('section', '', right);
    role.dataset.part = 'role';
    el('h3', '', role, str('brief.card.role'));
    const dl = el('dl', 'briefcard-role', role);
    for (const r of card.role) {
      el('dt', '', dl, r.label);
      el('dd', '', dl, r.value);
    }
    /* Under the stars, the shorter column, so the card fits a 720 line
     * screen without scrolling to its buttons. */
    const map = el('section', '', left);
    map.dataset.part = 'map';
    el('h3', '', map, str('brief.card.map'));
    map.append(mapSvg(card.map));
    /* The room's pilots and the buttons stay in sight at the foot, the
     * card's words scrolling over them on a short screen. */
    const row = el('div', 'briefcard-row', box);
    this.pilots = el('div', 'briefcard-pilots', row);
    this.status = el('div', 'briefcard-status', row);
    el('div', 'briefcard-keys', row, str('brief.card.keys'));
    this.replayBtn = el('button', 'briefcard-btn', row, str('brief.card.replay'));
    this.replayBtn.type = 'button';
    this.replayBtn.dataset.act = 'replay';
    this.replayBtn.addEventListener('click', () => this.act.replay());
    this.deployBtn = el('button', 'briefcard-btn deploy', row, str('brief.deploy'));
    this.deployBtn.type = 'button';
    this.deployBtn.dataset.act = 'deploy';
    this.deployBtn.addEventListener('click', () => this.act.deploy());
    this.open();
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.el.classList.add('open');
    /* Over a film, which hides the body's other children with a rule
     * appended at each play (warintro.js), so only an inline one wins:
     * the card is the one thing shown over its orbit or last frame. */
    this.el.style.setProperty('visibility', 'visible', 'important');
    /* A pad button held as the card opens (the film's hold to skip) is
     * not a press on it. */
    this.padWas = { a: true, x: true };
    this.pressed = false;
    this.deployBtn.focus({ preventScroll: true });
  }

  hide() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.el.classList.remove('open');
    this.el.style.removeProperty('visibility');
    if (this.box.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  /* The pad's Deploy and replay buttons (A and View), each a press on
   * its rising edge. */
  pad(a, x) {
    if (this.isOpen && a && !this.padWas.a) {
      this.deployBtn.click();
    }
    if (this.isOpen && x && !this.padWas.x) {
      this.replayBtn.click();
    }
    this.padWas = { a, x };
  }

  state(s) {
    if (!this.isOpen) {
      return;
    }
    const status = [
      s.waiting ? str('brief.card.unwatched') : null,
      s.left != null ? str('brief.card.deploy_in', { s: s.left }) : null,
      s.pilots.length > 1 ? str(s.deployed && !s.host ? 'brief.card.you_deployed' : 'brief.card.host_deploys') : null,
    ].filter(Boolean).join(' · ');
    const pilots = s.pilots.length > 1 ? s.pilots.map((p) => `${p.name}${p.host ? ` (${str('lobby.host')})` : ''}|${p.ready}`).join(';') : '';
    const shown = `${status}#${pilots}#${Boolean(s.waiting)}`;
    if (shown === this.shown) {
      return;
    }
    this.shown = shown;
    this.status.textContent = status;
    /* The room would refuse it ('unwatched') until the film's end. */
    this.deployBtn.disabled = Boolean(s.waiting);
    this.pilots.textContent = '';
    if (s.pilots.length > 1) {
      for (const p of s.pilots) {
        const d = el('div', `briefcard-pilot${p.ready ? ' ready' : ''}`, this.pilots, p.host ? `${p.name} (${str('lobby.host')})` : p.name);
        el('b', '', d, str(p.ready ? 'brief.card.ready' : 'brief.card.reading'));
      }
    }
  }
}
