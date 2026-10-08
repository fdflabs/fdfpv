/*
 * campaign.js: Defend the Paraná, the paid campaign's state. Act 1 is seven
 * Defend Itaipu missions flown in order, each worth up to three stars and
 * some credits, and a shop that spends the credits on the loadout a pilot
 * takes into the war (docs/WARFARE-PLAN.md; the war itself is the room's,
 * edge/rooms/war.js).
 *
 * THE STATE is { v: 1, missions, earned, owned, equipped, films, flags }:
 *
 *   missions  { missionId: { stars 0..3, won, credits } }, the best of
 *             every result the room gave for that mission: most stars, won
 *             once is won, the largest single payout
 *   earned    credits the room has paid, in total, ever
 *   owned     { upgradeId: credits paid for it }
 *   equipped  { warhead, speed }: the warhead carried and whether the
 *             faster airframe is on. Every rack upgrade owned is always
 *             carried, so the rack is not a choice.
 *   films     { filmId: version }: the newest cut of each intro film this
 *             pilot has watched to its end (src/share/war/film.js), which
 *             makes it skippable (docs/campaign/INTROS.md section 3)
 *   flags     { NAME: true | string }: the story flags an ops mission's
 *             result set (The Interior's M1_SYMBOL_CAPTURED and the rest,
 *             docs/campaign/interior/MISSIONS.md 1.10), which later
 *             missions and the endings read
 *
 * CREDITS TO SPEND are earned less what owned cost: spending is not a
 * number of its own but the prices paid, so two computers that bought
 * different things cannot disagree about what was spent. The price paid
 * is kept, not looked up, so a price changed later changes nothing
 * already bought.
 *
 * THE MERGE (mergeCampaign) is what a signed in pilot's two computers do
 * with two copies: the most stars per mission, the higher earned total,
 * the union of owned upgrades, the newer seen cut of each film, every
 * flag either has (true stays true; a word flag, the final choice, keeps
 * the incoming copy's, as equipped does). Two computers that each spent the same
 * credits on different things keep both: the balance goes below zero and
 * nothing more can be bought until it is earned back, which is the one
 * outcome that loses neither purchase. An earned total is the higher of
 * the two rather than a sum, because a sum would pay the same war twice
 * each time the same blob met itself.
 *
 * Pure and DOM free: src/ui/campaign.js draws it, and
 * scripts/campaign-selftest.js runs it in Node. It is kept in the pilot's
 * settings (createCampaignStore), and the account's progress blob carries
 * that section, merged by mergeCampaign (src/share/progressmerge.js).
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

/* Act 1, in the order it is flown (docs/campaign/MISSIONS.md section 2).
 * `free` is the one mission a pilot without the campaign may fly. The ids
 * are the room's mission ids (src/share/war/missions/index.js).
 *
 * `release` is whether a pilot may fly it at all (the owner, 2026-10-04:
 * "only make the first mission available, until its 100% correct, then
 * only when storyline, videos, etc. of mission 2 is done do you make that
 * available"): 'available' is offered and started; 'development' has code
 * in the build and is shown Under Development; 'soon' is only planned, has
 * no mission file, and is shown Coming Soon. The room refuses to start
 * anything but 'available' (edge/rooms/war.js start), so this row is the
 * gate, not the screen. A mission is made available here and nowhere else.
 * First Light went back to 'development' on 2026-10-07 (the owner: it has
 * no narration, nothing of what Mission 1 of The Interior has; under
 * construction until it is as finished); the owner's own account still
 * flies it (DEV_ACCOUNTS, devHost). */
export const ACT1 = [
  { id: 'itaipu-1', key: 'intakes', free: true, release: 'development' },
  { id: 'itaipu-2', key: 'spillway', free: false, release: 'development' },
  { id: 'itaipu-3', key: 'switchyard', free: false, release: 'development' },
  { id: 'itaipu-4', key: 'night', free: false, release: 'development' },
  { id: 'itaipu-5', key: 'river', free: false, release: 'soon' },
  { id: 'itaipu-6', key: 'corridor', free: false, release: 'soon' },
  { id: 'itaipu-7', key: 'breach', free: false, release: 'soon' },
];

/* Whether mission `id` may be started. A mission outside Act 1 (the
 * drill, itaipu-drill.js, which no screen offers, and the checks' own) is
 * not the campaign's to hold back. `dev` also lets through what is in
 * development, for the checks that fly missions 2 to 4 and for a
 * developer's own rooms server (edge/rooms/node.js DEV_MISSIONS); what is
 * only planned has nothing to fly either way. */
export function released(id, dev = false) {
  const m = ACT1.find((x) => x.id === id) ?? INTERIOR.find((x) => x.id === id);
  return !m || m.release === 'available' || (dev && m.release === 'development');
}

/*
 * The Interior, the second campaign (docs/campaign/interior/PLAN.md),
 * flown in order, its missions the room's ops missions
 * (src/share/ops/missions.js). The same gate as Act 1: Mission 1 is
 * 'development' until it is 100 % and the owner has flown it, then
 * 'available' here and nowhere else; Mission 2 has its mission file and
 * is held the same way; 3 to 5 have none yet, so
 * 'soon' in the gate's meaning, and `label` is the word the card shows
 * instead of the release's own: the owner asked for Under development
 * on all four (PLAN.md section 3; TECH-NEEDS.md F6 records the choice).
 * No credits and no shop: platforms unlock by mission. `consent`: the
 * campaign shows armed conflict, so its card asks the war's consent
 * first (PLAN.md section 9 A; the screen is VIEW's to build).
 */
export const INTERIOR_CAMPAIGN = Object.freeze({ id: 'interior', consent: true });
export const INTERIOR = [
  { id: 'interior-1', key: 'oldwar', release: 'development' },
  { id: 'interior-2', key: 'forest', release: 'development' },
  { id: 'interior-3', key: 'nomansland', release: 'soon', label: 'development' },
  { id: 'interior-4', key: 'otherwar', release: 'soon', label: 'development' },
  { id: 'interior-5', key: 'lastcolumn', release: 'soon', label: 'development' },
];

/* The word a mission's card shows: its label, else its release. */
export function cardLabel(m) {
  return m.label ?? m.release;
}

export const MAX_STARS = 3;

/* The loadout the war takes (edge/rooms/war.js clamps it per seat):
 * rack 4 to 6, a warhead by name, speedMul 1 to 1.15. */
export const BASE_RACK = 4;
export const FAST_SPEED_MUL = 1.15;
export const WARHEADS = ['standard', 'wide', 'penetrator', 'emp'];

/*
 * The shop. PRICED SO ACT 1 AT TWO STARS BUYS ABOUT HALF OF IT: the room
 * pays 100 credits a star and 10 a team kill (edge/rooms/war.js, branch
 * war-act1), and mission 1 flown alone sends 27 attackers, so a two star
 * win is taken as 20 kills (TWO_STAR_KILLS): 400 a mission, 1 600 for
 * the act, against 3 400 here. The kills are the guess; a bigger squad
 * meets more attackers and earns faster.
 * `needs` is an upgrade that must be owned first: the second rack slot
 * stacks on the first, and the war's rack stops at 6. `later` is shown
 * and not sold, with the act it comes in: the hunter warning needs
 * markers and radar the war does not have yet, and the loadout has no
 * field for it.
 */
export const UPGRADES = [
  { id: 'wide', kind: 'warhead', price: 500 },
  { id: 'penetrator', kind: 'warhead', price: 600 },
  { id: 'emp', kind: 'warhead', price: 800 },
  { id: 'rack-1', kind: 'rack', price: 400 },
  { id: 'rack-2', kind: 'rack', price: 600, needs: 'rack-1' },
  { id: 'speed', kind: 'speed', price: 500 },
  { id: 'warning', kind: 'warning', later: 2 },
];

export const TWO_STAR_KILLS = 20;

/* What the room pays for one result: the number the shop's prices were
 * balanced against. The client never pays itself this; it records what
 * the room's result says (src/share/campaignwar.js). */
export function expectedCredits(stars, teamKills) {
  return stars * 100 + teamKills * 10;
}

/*
 * THE FULL GAME GATE. Mission 1 is free; the rest of Act 1 and the shop
 * are the campaign's. Everything stays open until payment exists: this is
 * the one place that will ask whether the pilot bought it.
 */
export function campaignOwned() {
  return true;
}

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id) ?? null;
}

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function whole(n, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
}

/* A plausible id: a later build's missions and upgrades are kept, not
 * dropped, so an older computer syncing never erases them. */
const ID = /^[a-z0-9-]{1,40}$/;

export function emptyCampaign() {
  return {
    v: 1, missions: {}, earned: 0, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {},
  };
}

/* A plausible flag: the script's names (M1_SYMBOL_CAPTURED), and a word
 * value of the same shape (EXECUTE). */
const FLAG = /^[A-Z0-9_]{1,40}$/;
const flagValue = (v) => v === true || (typeof v === 'string' && FLAG.test(v));

/* A state with the right shape and nothing else, from anything: storage,
 * the account, a hand edit. */
export function cleanCampaign(raw) {
  const out = emptyCampaign();
  if (!isRecord(raw)) {
    return out;
  }
  if (isRecord(raw.missions)) {
    for (const [id, m] of Object.entries(raw.missions)) {
      if (ID.test(id) && isRecord(m)) {
        out.missions[id] = { stars: whole(m.stars, MAX_STARS), won: m.won === true, credits: whole(m.credits) };
      }
    }
  }
  out.earned = whole(raw.earned);
  if (isRecord(raw.owned)) {
    for (const [id, paid] of Object.entries(raw.owned)) {
      if (ID.test(id)) {
        out.owned[id] = whole(paid);
      }
    }
  }
  out.equipped = equippable(out.owned, isRecord(raw.equipped) ? raw.equipped : {});
  if (isRecord(raw.films)) {
    for (const [id, version] of Object.entries(raw.films)) {
      if (ID.test(id)) {
        out.films[id] = whole(version);
      }
    }
  }
  if (isRecord(raw.flags)) {
    for (const [name, v] of Object.entries(raw.flags)) {
      if (FLAG.test(name) && flagValue(v)) {
        out.flags[name] = v;
      }
    }
  }
  return out;
}

/* Whether this pilot has watched cut `version` of film `id` to its end. */
export function seenFilm(state, id, version) {
  return (state.films[id] ?? -1) >= version;
}

/* The state with film `id`'s cut `version` watched. */
export function markSeen(state, id, version) {
  const out = cleanCampaign(state);
  out.films[id] = Math.max(out.films[id] ?? 0, whole(version));
  return out;
}

/* An equipped choice that only names what is owned. */
function equippable(owned, e) {
  const warhead = WARHEADS.includes(e.warhead) && (e.warhead === 'standard' || Object.hasOwn(owned, e.warhead)) ? e.warhead : 'standard';
  return { warhead, speed: e.speed === true && Object.hasOwn(owned, 'speed') };
}

export function spent(state) {
  return Object.values(state.owned).reduce((a, b) => a + b, 0);
}

/* Credits to spend; below zero only after a merge (THE MERGE, above). */
export function credits(state) {
  return state.earned - spent(state);
}

export function starsOf(state, missionId) {
  return state.missions[missionId]?.stars ?? 0;
}

export function totalStars(state) {
  return ACT1.reduce((n, m) => n + starsOf(state, m.id), 0);
}

/* Act 1 opens in order: a mission is open once the one before is won. */
export function unlocked(state, index) {
  return index === 0 || state.missions[ACT1[index - 1].id]?.won === true;
}

/* Whether the full game gate lets the pilot at a mission, or the shop
 * (index null). */
export function gateOpen(index) {
  return (index !== null && ACT1[index].free) || campaignOwned();
}

/* The state after one result the room gave, { stars, credits, won,
 * flags? }: an ops mission's result carries its flags (edge/rooms/ops.js),
 * kept as the merge keeps them, a true flag never lost. */
export function applyResult(state, missionId, result) {
  const next = cleanCampaign(state);
  const was = next.missions[missionId] ?? { stars: 0, won: false, credits: 0 };
  const paid = whole(result.credits);
  next.missions[missionId] = {
    stars: Math.max(was.stars, whole(result.stars, MAX_STARS)),
    won: was.won || result.won === true,
    credits: Math.max(was.credits, paid),
  };
  next.earned += paid;
  for (const [name, v] of Object.entries(isRecord(result.flags) ? result.flags : {})) {
    if (FLAG.test(name) && flagValue(v) && !(next.flags[name] === true && v !== true)) {
      next.flags[name] = v;
    }
  }
  return next;
}

/* Why an upgrade cannot be bought now, or null when it can. */
export function cannotBuy(state, id) {
  const u = upgradeById(id);
  if (!u || u.later) {
    return 'later';
  }
  if (!gateOpen(null)) {
    return 'gate';
  }
  if (Object.hasOwn(state.owned, id)) {
    return 'owned';
  }
  if (u.needs && !Object.hasOwn(state.owned, u.needs)) {
    return 'needs';
  }
  if (credits(state) < u.price) {
    return 'credits';
  }
  return null;
}

/* The state after buying `id`, which cannotBuy said yes to. What is
 * bought is equipped: a warhead replaces the one carried, the faster
 * airframe goes on. */
export function buy(state, id) {
  if (cannotBuy(state, id)) {
    throw new Error(`campaign: cannot buy ${id}: ${cannotBuy(state, id)}`);
  }
  const u = upgradeById(id);
  const next = cleanCampaign(state);
  next.owned[id] = u.price;
  if (u.kind === 'warhead') {
    next.equipped.warhead = id;
  } else if (u.kind === 'speed') {
    next.equipped.speed = true;
  }
  return next;
}

/* The state with a warhead carried, or the faster airframe on or off.
 * Only what is owned can be equipped; anything else is refused. */
export function equip(state, slot, value) {
  const next = cleanCampaign(state);
  const want = { ...next.equipped, [slot]: value };
  const got = equippable(next.owned, want);
  if (got[slot] !== value) {
    throw new Error(`campaign: cannot equip ${slot} ${value}`);
  }
  next.equipped = got;
  return next;
}

/* The loadout the war takes, from what is owned and equipped. */
export function loadoutOf(state) {
  const racks = UPGRADES.filter((u) => u.kind === 'rack' && Object.hasOwn(state.owned, u.id)).length;
  return {
    rack: BASE_RACK + racks,
    warhead: state.equipped.warhead,
    speedMul: state.equipped.speed ? FAST_SPEED_MUL : 1,
  };
}

/*
 * One state from two (THE MERGE, above). `incoming` is the copy just
 * sent, `held` the one already kept; the incoming side's equipped choice
 * wins, being the computer the pilot last touched.
 */
export function mergeCampaign(incoming, held) {
  const a = cleanCampaign(incoming);
  const b = cleanCampaign(held);
  const out = emptyCampaign();
  /* Ids in order, so two computers merging the same pair write the same
   * bytes, and a byte compare (progressmerge.js stampChanges) sees no
   * change where there is none. */
  for (const id of [...new Set([...Object.keys(a.missions), ...Object.keys(b.missions)])].sort()) {
    const x = a.missions[id] ?? { stars: 0, won: false, credits: 0 };
    const y = b.missions[id] ?? { stars: 0, won: false, credits: 0 };
    out.missions[id] = { stars: Math.max(x.stars, y.stars), won: x.won || y.won, credits: Math.max(x.credits, y.credits) };
  }
  out.earned = Math.max(a.earned, b.earned);
  for (const id of [...new Set([...Object.keys(a.owned), ...Object.keys(b.owned)])].sort()) {
    out.owned[id] = Math.max(a.owned[id] ?? 0, b.owned[id] ?? 0);
  }
  /* Always allowed: the incoming side owned what it equipped, and the
   * union owns at least that. */
  out.equipped = equippable(out.owned, a.equipped);
  for (const id of [...new Set([...Object.keys(a.films), ...Object.keys(b.films)])].sort()) {
    out.films[id] = Math.max(a.films[id] ?? 0, b.films[id] ?? 0);
  }
  for (const name of [...new Set([...Object.keys(a.flags), ...Object.keys(b.flags)])].sort()) {
    const x = a.flags[name];
    const y = b.flags[name];
    out.flags[name] = x === true || y === true ? true : (x ?? y);
  }
  return out;
}

/*
 * The one place the campaign is read and written: the `campaign` section
 * of the pilot's settings (ui.settings), which persist() keeps in local
 * storage, a guest's only store, and which the account's progress blob
 * carries for a signed in pilot (src/share/progressmerge.js). Read fresh
 * each time, since a sync may have replaced the section since.
 */
export function createCampaignStore(settings, persist) {
  return {
    load() {
      return cleanCampaign(settings.campaign);
    },
    save(state) {
      settings.campaign = cleanCampaign(state);
      persist();
    },
  };
}
