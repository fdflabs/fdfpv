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
