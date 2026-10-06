/*
 * playground.js: the page side of tests/browser/playground.html.
 *
 * Loads the game's stylesheet from index.html, where every rule lives
 * inline, and draws the tokens and then every component of
 * playground-components.js in each of its states. The sheet is read at
 * run time rather than copied so the playground cannot drift from the
 * game: what it shows is what the screens wear today. Once the sheet moves
 * to a file of its own (docs/redesign/PLAN.md, phase 2) this becomes a
 * <link>.
 *
 * window.__playground reports what was drawn, for a headless look.
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

import { preferredLocale, useLocale } from '../../src/strings/index.js';

/* The locale before the components module, whose markup is built from
 * the string table when it is imported, the way boot.js does it for the
 * shell. */
await useLocale(preferredLocale());
const { COMPONENTS, KINDS, styleOf, tokensIn } = await import('./playground-components.js');

const main = document.getElementById('pg-main');
const nav = document.getElementById('pg-nav');

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

function section(id, title) {
  const s = node('section', 'pg-section');
  s.id = id;
  s.append(node('h2', null, title));
  const a = node('a', null, title);
  a.href = `#${id}`;
  nav.append(a);
  main.append(s);
  return s;
}

/* A component's markup inside its context chain, outermost first. */
function framed(context, html) {
  const frame = node('div', 'pg-frame');
  let at = frame;
  for (const cls of context) {
    const box = node('div', cls);
    at.append(box);
    at = box;
  }
  /* The pictures are named from the site's root, as the game names them;
   * this page is two folders down. */
  at.insertAdjacentHTML('beforeend', html.replace(/(src="|url\(')assets\//g, '$1/assets/'));
  return frame;
}

function drawTokens(css) {
  const s = section('tokens', 'Tokens');
  const root = getComputedStyle(document.documentElement);
  const groups = new Map();
  for (const tok of tokensIn(css)) {
    if (!groups.has(tok.group)) {
      groups.set(tok.group, []);
    }
    groups.get(tok.group).push(tok.name);
  }
  for (const [group, names] of groups) {
    const g = node('div', 'pg-group');
    g.append(node('h3', null, group));
    const grid = node('div', 'pg-tokens');
    for (const name of names) {
      const value = root.getPropertyValue(name).trim();
      const cell = node('div', 'pg-token');
      const swatch = node('div', 'pg-swatch');
      /* A colour or a gradient paints; a font or a length leaves the
       * swatch empty and the value says what it is. */
      swatch.style.background = `var(${name})`;
      const text = node('div', 'pg-token-text', name);
      text.append(node('span', null, value || '(set on a screen, not on the root)'));
      cell.append(swatch, text);
      grid.append(cell);
    }
    g.append(grid);
    s.append(g);
  }
  return groups;
}

function drawComponent(host, c) {
  const box = node('div', 'pg-comp');
  box.id = `c-${c.id}`;
  const head = node('div', 'pg-comp-head');
  head.append(node('span', 'pg-comp-name', c.name), node('span', 'pg-comp-meta', c.gap ? c.id : `${c.id}  ${c.source}`));
  box.append(head);
  if (c.gap) {
    const gap = node('div', 'pg-gap');
    gap.append(node('b', null, 'gap'), document.createTextNode(c.gap));
    box.append(gap);
  } else {
    const states = node('div', 'pg-states');
    for (const [label, html] of c.states) {
      const st = node('div', 'pg-state');
      st.append(node('div', 'pg-state-label', label), framed(c.context, html));
      states.append(st);
    }
    box.append(states);
  }
  host.append(box);
}

async function draw() {
  const page = await (await fetch('/index.html')).text();
  const css = styleOf(page);
  const sheet = node('style');
  /* The sheet names its pictures relative to index.html, at the root. */
  sheet.textContent = css.replace(/url\((['"]?)assets\//g, 'url($1/assets/');
  /* Before the playground's own block, so its frame rules win a tie. */
  document.head.prepend(sheet);
  const groups = drawTokens(css);
  /* Each component once, under the first kind it answers, in KINDS order. */
  const drawn = new Set();
  for (const kind of KINDS) {
    const these = COMPONENTS.filter((c) => c.kinds[0] === kind && !drawn.has(c.id));
    if (!these.length) {
      continue;
    }
    const s = section(`k-${kind}`, kind.replace('-', ' '));
    for (const c of these) {
      drawComponent(s, c);
      drawn.add(c.id);
    }
  }
  window.__playground = {
    components: [...drawn],
    gaps: COMPONENTS.filter((c) => c.gap).map((c) => c.id),
    tokens: [...groups.values()].flat().length,
  };
}

draw().catch((e) => {
  main.append(node('p', 'pg-error', `${e && e.stack ? e.stack : e}`));
  window.__playground = { error: String(e) };
});
