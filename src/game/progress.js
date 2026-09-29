/*
 * progress.js: what a pilot has earned, what it opens, and the challenges.
 *
 * The owner wants plane racing casual, finishable by a small child. So
 * there is one number, XP, earned by finishing things, and a level it
 * makes; each level opens something: a plane, a power option, a paint
 * scheme, or anything another module registers. And there is a short list
 * of challenges, each a small story about one plane or one setup ("round a
 * course on the small tank before the engine quits"), worth a lump of XP.
 *
 * THE CURVE IS GENTLE AND FAST AT THE START. A new pilot has three planes
 * that forgive everything (the Timber, the Cub, the Slow Stick). One lap
 * of any course is worth a level at first: level 2 is 60 XP and a first
 * lap on a course is 40 plus a 40 bonus the first time on that course, so
 * the first lap ever opens the Kadet. The levels then stretch, but a
 * challenge is worth two or three laps, so a child who flies for twenty
 * minutes has seen most of the hangar. UNLOCK ALL (settings, and the top
 * of the hangar's Challenges tab) opens everything for anyone who wants it
 * now; a profile from before progression existed starts with it on, so no
 * pilot loses a plane they were already flying.
 *
 * WHAT IS LOCKED is gathered, not listed by hand: every plane but the
 * starters (PLANE_LEVELS), every power option after a plane's stock one
 * (configs/power.js), every paint scheme after a plane's first two
 * (configs/liveries.js), every prop after a plane's stock one and every
 * add-on a plane takes (configs/hangar-parts.js), the paint shop's
 * finishes and decals after the first few (configs/paint.js; the palette
 * and the kit's own finish are always free), and anything another
 * module adds, by exporting
 * UNLOCKABLES from configs/power.js or configs/liveries.js or by calling
 * registerUnlockables() with a list of { kind, id, airframe?, level?,
 * name? }. An item not in the build is not in the list, so a part or a
 * decal that has not merged simply does not appear.
 *
 * THE CHALLENGES are judged by RunWatch from what the shell already
 * knows: a gate passed, a rim or a gate touched, a lap closed, the plant's
 * pack and tank, the OSD's LOW BATTERY, the crash flag and whether the
 * craft is on the ground. It reads no clock; it is told the sim time.
 *
 * Pure: no DOM, no three.js, so scripts import it in Node.
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

import { AIRFRAMES, airframeById } from '../../configs/airframes.js';
import * as powerConfig from '../../configs/power.js';
import * as liveryConfig from '../../configs/liveries.js';
import { ADDON_ORDER, PROPS, addonsFor } from '../../configs/hangar-parts.js';
import { DECAL_KIND_IDS, FINISHES } from '../../configs/paint.js';

const { POWER } = powerConfig;
const { liveryKey, schemesFor } = liveryConfig;

/* The XP each level starts at: level n needs LEVEL_XP[n - 1]. Past the
 * table every level costs LEVEL_TAIL more. */
export const LEVEL_XP = [0, 60, 180, 360, 600, 900, 1300, 1800, 2400, 3100];
const LEVEL_TAIL = 800;

/* XP for a lap closed, by the kind of course, and once more the first
 * time a lap closes on a course. */
export const LAP_XP = { casual: 50, built: 40, map: 40 };
export const FIRST_LAP_XP = 40;

/* The planes a new pilot has, and the level each other one opens at.
 * Float planes go with their land plane. Quads are never locked. */
export const STARTER_PLANES = ['timber1500', 'cub1400', 'slowstick1180'];
/* The Ugly Stik at 3, with the Skyhunter: the step after the Kadet, as
 * the sport plane has always been the second model after the trainer.
 * The first on the curve with ailerons that does not fly itself (RCM:
 * "no hands off inherent stability like a J-3 Cub", "not a beginner's
 * trainer"), but on RCM's travel limits it rolls at under 100 deg/s,
 * stalls straight and lands on a tricycle at 11 m/s: nothing it does
 * needs the P-51's rudder or the aerobats' hands. The Wot 4 at 4, with the
 * Bombshell and the Zagi: the Stik's British counterpart, but a
 * taildragger that rolls a quarter faster (pb/2V 0.094 against 0.074 on
 * the manual's throws) and spins on its big rudder; forgiving, its stall
 * mushes wings level and the spin stops when the sticks are let go
 * (docs/WOT4-STAGE1.md). The Quickie 500 at 7,
 * with the P-51: Spickler's "I don't consider the Quicky 500 a trainer,
 * but anyone who has advanced to the aileron stage shouldn't have any
 * problems", and FM's "not intended for the beginner ... someone who has
 * passed the trainer stage". It handles as gently as the Stik and stalls
 * as straight, but at nearly twice its speed, rolling at 400 deg/s, on a
 * taildragger with no steerable wheel: the pace, not the handling, is the
 * step, and 6 already holds the Bramor and the NRJ. The P-51 at 7: it has the heaviest wing loading here but one (65 N/m^2
 * against the Timber's 46 and the Kadet's 36), it swings on the take off
 * roll until the pilot's rudder holds it, and it drops a wing at the
 * stall; FMS rate it for an intermediate pilot. The Pitts at 8: E-flite's
 * own intermediate rating, a short coupled biplane whose half stick yank
 * is past its stall and snaps it with a boot of rudder, and which swerves
 * on the ground without the pilot's feet, at a trainer's speeds on a
 * foam airframe (docs/PITTS-STAGE1.md). The Extra at 9: a hover
 * held on every stick at once, and a torque roll the ailerons must hold,
 * on a foam airframe that forgives the ground. The Edge at 10: an
 * unlimited aerobat at 3D throws rolls past 600 deg/s and snaps when
 * yanked (docs/EDGE-STAGE1.md). The F-16 last: the fastest here, the
 * hottest landing, and a fan whose thrust has to be planned ahead of the
 * stick; Motion RC sells the 6S version "for skilled intermediate or
 * advanced pilots with experience flying at least two EDFs", the only
 * kit here whose maker asks for experience on its own kind. The Zagi
 * with the Bombshell: past the trainers and the Skyhunter, because it has
 * no rudder, rolls fast and answers the smallest touch in pitch, but
 * before the Radian's thermals and the heavier machines, because it is
 * light, slow to stall, and slides in on its belly anywhere; Zagi sold it
 * to beginners as much as to combat pilots. The NRJ at 6, beside the
 * Bramor: the Radian at 5 teaches the thermals with a motor to climb back
 * on, and the discus launch glider takes the motor away. It is gentle to
 * fly (docs/DLG-STAGE1.md) and hard to keep up, which is a soaring skill
 * and not a stick one, so it sits after the Radian and ahead of the fast
 * and the aerobatic. Shared rather than slotted in, so no plane a pilot
 * already has goes back behind a lock. */
export const PLANE_LEVELS = { kadet1981: 2, sky1800: 3, uglystik1567: 3, bombshell1118: 4, zagi1219: 4, wot41334: 4, radian2000: 5, bramor2300: 6, nrj1490: 6, p51d1450: 7, quickie1293: 7, pitts850: 8, extra1308: 9, edge1524: 10, f16878: 11 };

/* A scheme past this many in a plane's list is locked, one level each. */
const FREE_SCHEMES = 2;
/* The decals free from the start: a number, a stripe, a checker. */
const FREE_DECALS = 3;
/* An item another module registers without a level. */
const DEFAULT_LEVEL = 3;

/* Gates that a touch counts against: a gate's pipe, a wide gate, a
 * pylon, a sky hoop's rim (src/game/collide.js KINDS). */
export const RIM_KINDS = ['gate', 'banner', 'pylon', 'hoop'];

/* How long the craft must be off the ground to count as flying, and on
 * it, whole and still in one piece, to count as landed: sim ms. */
const AIRBORNE_MS = 2000;
const LANDED_MS = 1000;
/* Hoops in a row for the clean streak. */
export const STREAK_HOOPS = 10;

/*
 * THE CHALLENGES. `plane` is the plane (by family) it is flown on, or
 * null for any; `power` narrows it to a kind of power. The words are
 * progress.challenge.<id> and progress.challenge.<id>_note.
 */
export const CHALLENGES = [
  { id: 'first_course', plane: null, xp: 40 },
  { id: 'timber_clean', plane: 'timber1500', xp: 120 },
  { id: 'hoops_10', plane: null, xp: 150 },
  { id: 'slowstick_three', plane: 'slowstick1180', xp: 120 },
  { id: 'kadet_small_tank', plane: 'kadet1981', power: 'glow', xp: 200 },
  { id: 'deadstick', plane: null, power: 'electric', xp: 200 },
  { id: 'bombshell_glide', plane: 'bombshell1118', power: 'glow', xp: 200 },
];

export function challengeById(id) {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

export function levelStart(n) {
  if (n <= LEVEL_XP.length) {
    return LEVEL_XP[Math.max(0, n - 1)];
  }
  return LEVEL_XP[LEVEL_XP.length - 1] + (n - LEVEL_XP.length) * LEVEL_TAIL;
}

export function levelOf(xp) {
  let n = 1;
  while (levelStart(n + 1) <= xp) {
    n += 1;
  }
  return n;
}

/* The level and how far into it: `from` and `to` are the XP it starts
 * and ends at, `frac` the share done. */
export function levelInfo(xp) {
  const level = levelOf(xp);
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { level, xp, from, to, frac: (xp - from) / (to - from) };
}

/* A fresh pilot's progress. `unlockAll` is the switch that opens it all. */
export function freshProgress(unlockAll = false) {
  return { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, casual: {}, unlockAll };
}

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function flags(o, max) {
  const out = {};
  if (!isRecord(o)) {
    return out;
  }
  for (const [k, v] of Object.entries(o).slice(0, max)) {
    if (typeof k === 'string' && k.length <= 120 && v === true) {
      out[k] = true;
    }
  }
  return out;
}

/*
 * Stored progress made safe: XP a finite whole number, the course,
 * challenge, seen and casual track maps of true flags only, and unlockAll
 * a boolean.
 * Nothing stored and `existing` (the browser had a profile from before
 * progression) is a pilot who already flew everything: unlocked.
 */
export function normaliseProgress(stored, { existing = false } = {}) {
  if (!isRecord(stored)) {
    return freshProgress(existing);
  }
  const xp = Number.isFinite(stored.xp) ? Math.max(0, Math.min(1e7, Math.floor(stored.xp))) : 0;
  return {
    v: 1,
    xp,
    courses: flags(stored.courses, 2000),
    challenges: flags(stored.challenges, 200),
    seen: flags(stored.seen, 2000),
    casual: flags(stored.casual, 500),
    unlockAll: typeof stored.unlockAll === 'boolean' ? stored.unlockAll : existing,
  };
}

/* Other modules' items: registerUnlockables([{ kind, id, airframe, level, name }]). */
const REGISTERED = [];

export function registerUnlockables(list) {
  if (!Array.isArray(list)) {
    throw new Error('registerUnlockables takes a list');
  }
  for (const it of list) {
    if (!it || typeof it.kind !== 'string' || typeof it.id !== 'string') {
      throw new Error(`unlockable ${JSON.stringify(it)} needs a kind and an id`);
    }
    REGISTERED.push(it);
  }
}

export function itemKey(kind, id, airframe = null) {
  return airframe ? `${kind}:${liveryKey(airframe)}:${id}` : `${kind}:${id}`;
}

function planeLevel(id) {
  const fam = liveryKey(id);
  if (!airframeById(fam).fixedWing || STARTER_PLANES.includes(fam)) {
    return 1;
  }
  return PLANE_LEVELS[fam] ?? DEFAULT_LEVEL;
}

/*
 * Everything that can be locked, each { key, kind, id, airframe, level,
 * name }: `name` a string key or a function giving the words, or null.
 * An item on a plane is never open before its plane is.
 */
export function unlockables() {
  const out = [];
  const seen = new Set();
  const add = (it) => {
    if (!seen.has(it.key)) {
      seen.add(it.key);
      out.push(it);
    }
  };
  for (const af of AIRFRAMES) {
    if (af.id !== liveryKey(af.id) || !af.fixedWing) {
      continue;
    }
    const lv = planeLevel(af.id);
    if (lv > 1) {
      add({ key: itemKey('plane', af.id), kind: 'plane', id: af.id, airframe: null, level: lv, name: () => af.name });
    }
  }
  for (const [id, list] of Object.entries(POWER)) {
    if (!AIRFRAMES.some((a) => a.id === id)) {
      continue;
    }
    list.forEach((o, i) => {
      if (i === 0) {
        return;
      }
      add({ key: itemKey('power', o.id, id), kind: 'power', id: o.id, airframe: liveryKey(id), level: Math.max(planeLevel(id), 1 + i), name: o.name });
    });
  }
  for (const af of AIRFRAMES) {
    if (af.id !== liveryKey(af.id)) {
      continue;
    }
    schemesFor(af.id).forEach((sc, i) => {
      if (i < FREE_SCHEMES) {
        return;
      }
      add({ key: itemKey('scheme', sc.id, af.id), kind: 'scheme', id: sc.id, airframe: af.id, level: Math.max(planeLevel(af.id), i), name: `livery.scheme.${af.id}.${sc.id}` });
    });
  }
  /* The Parts tab's (src/ui/hangar-parts.js): a prop after the stock one
   * a level each, like a power option; an add-on by its place in the
   * list, the tyres and the camera pod early and the smoke last. Repairs
   * and tape are never locked: a broken plane is always mendable. */
  for (const [id, props] of Object.entries(PROPS)) {
    if (id !== liveryKey(id)) {
      continue;
    }
    props.forEach((p, i) => {
      if (i === 0) {
        return;
      }
      add({
        key: itemKey('prop', p.id, id), kind: 'prop', id: p.id, airframe: id, level: Math.max(planeLevel(id), 1 + i), name: { key: 'parts.prop.apc', vars: { d: p.propIn, p: p.pitchIn } },
      });
    });
    for (const a of addonsFor(id)) {
      add({
        key: itemKey('addon', a, id), kind: 'addon', id: a, airframe: id, level: Math.max(planeLevel(id), 2 + ADDON_ORDER.indexOf(a)), name: `parts.addon.${a}`,
      });
    }
  }
  /* The paint shop's (src/ui/hangar-paint.js), on every plane alike: the
   * first finish and the first few decals are free, so a new pilot can
   * paint a number and a stripe on the first day, and the rest open two a
   * level. A saved livery or a shared code is worn whatever it uses: it is
   * the pilot's own work or a friend's. */
  FINISHES.forEach((f, i) => {
    if (i > 0) {
      add({ key: itemKey('finish', f), kind: 'finish', id: f, airframe: null, level: 1 + i, name: `hangar.finish_${f}` });
    }
  });
  DECAL_KIND_IDS.forEach((k, i) => {
    if (i >= FREE_DECALS) {
      add({ key: itemKey('decal', k), kind: 'decal', id: k, airframe: null, level: 2 + Math.floor((i - FREE_DECALS) / 2), name: `hangar.decal_${k}` });
    }
  });
  const extra = [
    ...(Array.isArray(powerConfig.UNLOCKABLES) ? powerConfig.UNLOCKABLES : []),
    ...(Array.isArray(liveryConfig.UNLOCKABLES) ? liveryConfig.UNLOCKABLES : []),
    ...REGISTERED,
  ];
  for (const it of extra) {
    const airframe = it.airframe ? liveryKey(it.airframe) : null;
    const own = Number.isInteger(it.level) && it.level >= 1 ? it.level : DEFAULT_LEVEL;
    add({
      key: itemKey(it.kind, it.id, airframe),
      kind: it.kind,
      id: it.id,
      airframe,
      level: airframe ? Math.max(planeLevel(airframe), own) : own,
      name: it.name ?? null,
    });
  }
  return out;
}

/* The lockable item a card names: the plane's own, or one every plane
 * shares (a finish, a decal); null when it was never lockable. */
export function findItem(kind, id, airframe = null) {
  const all = unlockables();
  return all.find((it) => it.key === itemKey(kind, id, airframe)) ?? (airframe ? all.find((it) => it.key === itemKey(kind, id)) : null) ?? null;
}

/* Why an item is locked: { level } while it is, null once it is open or
 * was never lockable. */
export function lockOf(progress, kind, id, airframe = null) {
  if (!progress || progress.unlockAll) {
    return null;
  }
  const level = kind === 'plane' ? planeLevel(id) : (findItem(kind, id, airframe) ?? { level: 1 }).level;
  return levelOf(progress.xp) >= level ? null : { level };
}

/* The items that open at exactly level n, in catalogue order. */
export function opensAt(n) {
  return unlockables().filter((it) => it.level === n);
}

/*
 * XP added to progress, in place: what it opened comes back as events,
 * the level first, then each item, in catalogue order. `why` is what the
 * XP is for: { kind: 'lap', course } or { kind: 'challenge', id }.
 */
export function addXp(progress, xp, why) {
  const before = levelOf(progress.xp);
  progress.xp += xp;
  const after = levelOf(progress.xp);
  const events = [{ type: 'xp', xp, why, total: progress.xp }];
  for (let n = before + 1; n <= after; n += 1) {
    events.push({ type: 'level', level: n });
    if (!progress.unlockAll) {
      for (const it of opensAt(n)) {
        events.push({ type: 'unlock', item: it });
      }
    }
  }
  return events;
}

/*
 * A lap closed on a course: `course` is { key, kind } with kind 'casual',
 * 'built' or 'map'. Its XP, and the first lap's bonus once per course.
 */
export function awardLap(progress, course) {
  const base = LAP_XP[course.kind] ?? LAP_XP.map;
  const first = course.key && !progress.courses[course.key];
  if (first) {
    progress.courses[course.key] = true;
  }
  return addXp(progress, base + (first ? FIRST_LAP_XP : 0), { kind: 'lap', course, first: Boolean(first) });
}

/* A challenge done: its XP once, and nothing the second time. */
export function awardChallenge(progress, id) {
  const c = challengeById(id);
  if (!c || progress.challenges[id]) {
    return [];
  }
  progress.challenges[id] = true;
  return [{ type: 'challenge', id }, ...addXp(progress, c.xp, { kind: 'challenge', id })];
}

/*
 * The kind of track a lap was closed on, from its id: a casual sky track
 * (My tracks' one click starter, src/builder/course.js casualCourse),
 * whose id progression recorded when it was made, since the document
 * carries no mark of it; any other built track; no id, the world's own.
 */
export function courseKind(id, progress) {
  if (!id) {
    return 'map';
  }
  return progress && progress.casual && progress.casual[id] ? 'casual' : 'built';
}

/* Whether challenge c can be flown with the plane and power in ctx. */
export function fits(c, ctx) {
  if (!ctx || !ctx.fixedWing && (c.plane || c.power)) {
    return false;
  }
  if (c.plane && liveryKey(ctx.airframe) !== c.plane) {
    return false;
  }
  return !c.power || ctx.power === c.power;
}

/*
 * THE JUDGE, one per run. start() seats it; the shell tells it what
 * happens and it hands back the ids of the challenges that just came
 * true, which may include ones already done (awardChallenge ignores
 * those). ctx is { airframe, fixedWing, power: 'electric' | 'glow' | null,
 * smallestPack }.
 */
export class RunWatch {
  constructor() {
    this.start(null);
  }

  start(ctx) {
    this.ctx = ctx;
    this.laps = 0;
    this.lapClean = true;
    this.streak = 0;
    this.engineOut = false;
    this.lowBattery = false;
    /* Whether the craft broke since the event a landing is judged after. */
    this.brokeSince = false;
    this.crashed = false;
    this.airSince = null;
    this.flew = false;
    this.downSince = null;
  }

  can(id) {
    return fits(challengeById(id), this.ctx);
  }

  /* A gate or hoop flown through. */
  gatePass() {
    this.streak += 1;
    return this.streak >= STREAK_HOOPS && this.can('hoops_10') ? ['hoops_10'] : [];
  }

  /* The craft touched something of kind `kind` (collide.js KINDS). */
  touch(kind) {
    if (RIM_KINDS.includes(kind)) {
      this.streak = 0;
      this.lapClean = false;
    }
  }

  /* A lap closed on the course. */
  lap() {
    this.laps += 1;
    const out = ['first_course'];
    if (this.lapClean && this.can('timber_clean')) {
      out.push('timber_clean');
    }
    if (this.laps >= 3 && this.can('slowstick_three')) {
      out.push('slowstick_three');
    }
    if (this.ctx && this.ctx.smallestPack && !this.engineOut && this.can('kadet_small_tank')) {
      out.push('kadet_small_tank');
    }
    this.lapClean = true;
    return out.filter((id) => id === 'first_course' || this.can(id));
  }

  /*
   * Once a frame in flight: `simMs` the sim clock, `crashed` the shell's
   * crash flag, `grounded` whether the craft is on a surface, `power` the
   * plant's pack and tank (null on a quad), `battery` the OSD's state,
   * 'ok', 'warning' or 'critical'.
   */
  tick({ simMs, crashed, grounded, power, battery }) {
    const out = [];
    if (crashed && !this.crashed) {
      this.streak = 0;
      this.lapClean = false;
      this.brokeSince = true;
      this.flew = false;
      this.airSince = null;
      this.downSince = null;
    }
    this.crashed = Boolean(crashed);
    if (crashed) {
      return out;
    }
    if (power && power.tankM3 > 0 && !power.running && !this.engineOut) {
      this.engineOut = true;
      this.brokeSince = false;
    }
    if (battery && battery !== 'ok' && !this.lowBattery && this.ctx && this.ctx.power === 'electric') {
      this.lowBattery = true;
      this.brokeSince = false;
    }
    if (!grounded) {
      this.downSince = null;
      if (this.airSince == null) {
        this.airSince = simMs;
      }
      if (simMs - this.airSince >= AIRBORNE_MS) {
        this.flew = true;
      }
      return out;
    }
    this.airSince = null;
    if (!this.flew) {
      return out;
    }
    if (this.downSince == null) {
      this.downSince = simMs;
    }
    if (simMs - this.downSince < LANDED_MS) {
      return out;
    }
    /* Down, whole, for LANDED_MS after a real flight: a landing. */
    this.flew = false;
    this.downSince = null;
    if (!this.brokeSince && this.lowBattery && this.can('deadstick')) {
      out.push('deadstick');
    }
    if (!this.brokeSince && this.engineOut && this.can('bombshell_glide')) {
      out.push('bombshell_glide');
    }
    return out;
  }
}
