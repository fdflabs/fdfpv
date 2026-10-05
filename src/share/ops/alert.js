/*
 * alert.js: how alert a site is to the aircraft over it (docs/campaign/
 * interior/TECH-NEEDS.md N17, CONTRACT-P0.md section 8). Campaign
 * agnostic: a SITE is mission data,
 *
 *   { id, at: [x, y], z0, r, below, reach, rise, fall, levels }
 *
 * metres and fractions a second: each aircraft within `reach` of `at`
 * that is inside `r`, or lower than `below` over the site's ground z0,
 * adds `rise` a second to the site's value; with none it falls by `fall`
 * a second; the value stays in [0, 1]. `levels` ({ wary: 0.5, high: 1 })
 * are each reached once, at a room ms. More aircraft close in raise it
 * faster, so a big squad keeps its discipline too (MISSIONS.md 1.5).
 *
 * The room steps it on its grid (ms of room time between steps), so the
 * same poses give the same value whenever they arrive.
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

/* A site's state, new. */
export function siteState() {
  return { value: 0, level: 'calm', at: {} };
}

/* How many of the aircraft (ops frame positions) are inside the site's
 * standoff. */
export function inside(site, ps) {
  let n = 0;
  for (const p of ps) {
    const d2 = (p[0] - site.at[0]) ** 2 + (p[1] - site.at[1]) ** 2;
    if (d2 <= site.reach * site.reach && (d2 <= site.r * site.r || p[2] - site.z0 < site.below)) {
      n += 1;
    }
  }
  return n;
}

/* The site after `ms` of room time ending at grid ms t with the aircraft
 * at `ps`. Returns the levels newly reached. */
export function stepSite(site, st, t, ms, ps) {
  const n = inside(site, ps);
  const dv = n > 0 ? n * site.rise * (ms / 1000) : -site.fall * (ms / 1000);
  /* Kept to the millionth, so a value is the same JSON after a restore. */
  st.value = Math.round(Math.min(1, Math.max(0, st.value + dv)) * 1e6) / 1e6;
  const out = [];
  for (const [name, at] of Object.entries(site.levels).sort((a, b) => a[1] - b[1])) {
    if (st.at[name] == null && st.value >= at) {
      st.at[name] = t;
      st.level = name;
      out.push(name);
    }
  }
  return out;
}
