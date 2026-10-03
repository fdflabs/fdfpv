/*
 * playground-components.js: every component the menus are built from, as
 * data, for the UI playground (tests/browser/playground.html) and its Node
 * check (scripts/playground-check.js).
 *
 * Each entry is one component with the markup the shell builds for it in
 * each of its states, copied from the builder it names in `source`, and
 * the ancestor classes the sheet scopes it under in `context`. The markup
 * carries only classes that index.html's style block defines, which the
 * check proves, so a class renamed in the sheet fails the check instead of
 * leaving the playground drawing a component that no longer exists.
 *
 * An entry with `gap` and no states is a component the design system
 * names and the game does not have yet (docs/redesign/PLAN.md section 4):
 * listed so the playground shows the hole, never drawn with invented CSS.
 *
 * The copy is the game's own, through the string table, so the playground
 * shows the lengths a screen really has to hold.
 *
 * Pure: no DOM, so Node imports it. The page turns the strings into nodes.
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

import { str } from '../../src/strings/index.js';

/* The kinds the owner's brief asks the playground to show, each of which
 * at least one entry must answer (scripts/playground-check.js). */
export const KINDS = ['type', 'button', 'row', 'control', 'dropdown', 'card', 'heading', 'navigation', 'lobby-slot', 'status', 'modal', 'tooltip'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function h(tag, cls, ...kids) {
  const attr = cls ? ` class="${esc(cls)}"` : '';
  return `<${tag}${attr}>${kids.map((k) => (k.startsWith('<') ? k : esc(k))).join('')}</${tag}>`;
}

function row(label, cls = '', value = null) {
  return h('div', `row${cls ? ` ${cls}` : ''}`, h('span', 'row-label', label), ...(value == null ? [] : [value]));
}

function seg(options, live) {
  return h('div', 'row-control row-switch', ...options.map((o) => h('button', `sw-seg${o === live ? ' on' : ''}`, o)));
}

function gateCard(cls, art, name, blurb, facts) {
  return h('div', `gate-card${cls ? ` ${cls}` : ''}`,
    h('div', 'gate-card-art', `<img class="gate-card-shot" src="${esc(art)}" alt="">`),
    h('div', 'gate-card-body', h('div', 'gate-card-name', name), h('p', 'gate-card-blurb', blurb),
      h('div', 'gate-card-facts', ...facts.map((f) => h('span', 'gate-card-fact', f)))));
}

/* The poster is a custom property on the card, as markPoster sets it in
 * ui.js, which the reel paints; the still and the tag are empty until a
 * clip is recorded or the world is the one flying. */
function worldCard(cls, poster, name, tag = '') {
  return `<div class="map-card has-poster${cls ? ` ${cls}` : ''}" style="--poster: url('${esc(poster)}')">`
    + h('div', 'map-reel') + h('div', 'map-card-still')
    + h('div', 'map-card-body', h('div', 'map-card-name', name), h('div', 'map-card-tag', tag)) + '</div>';
}

function pilot(name, craft, { ready = false, me = false, host = false } = {}) {
  const who = h('div', 'war-lobby-who', h('span', 'war-lobby-name', name),
    ...(host ? [h('span', 'war-lobby-host', str('lobby.host'))] : []), h('span', 'war-lobby-craft', craft));
  return h('div', `war-lobby-pilot${ready ? ' ready' : ''}${me ? ' me' : ''}`, who,
    h('span', 'war-lobby-flag', str(ready ? 'lobby.flag_ready' : 'lobby.flag_waiting')));
}

function wordmark() {
  return h('h1', 'wordmark lockup', h('span', 'lockup-slash'),
    h('span', 'lockup-over', h('span', 'py-flag', h('span', ''), h('span', ''), h('span', '')), 'Paraguayan'),
    ' ', h('span', 'lockup-name', h('span', '', 'Drone'), ' ', h('span', '', 'Combat')), ' ', h('span', 'lockup-under', 'Simulator'));
}

/*
 * The components. `kinds` says which of KINDS an entry answers; `states`
 * is [label, html] pairs; `context` is the ancestor chain, outermost first,
 * each a class list.
 */
export const COMPONENTS = [
  {
    id: 'type-wordmark',
    name: 'Wordmark lockup',
    kinds: ['type', 'heading'],
    source: 'src/ui/ui.js wordmark()',
    context: ['screen screen-title is-gate', 'brand'],
    states: [['title', wordmark()]],
  },
  {
    id: 'type-section',
    name: 'Section heading',
    kinds: ['type', 'heading'],
    source: 'src/ui/ui.js renderMenu, it.section',
    context: ['screen', 'menu'],
    states: [['rest', h('div', 'menu-section', str('ui.graphics'))]],
  },
  {
    id: 'type-lede',
    name: 'Lede, the readable face',
    kinds: ['type'],
    source: 'index.html .screen-lede, .lede',
    context: ['screen'],
    states: [['rest', h('p', 'screen-lede', str('campaign.card_blurb'))]],
  },
  {
    id: 'type-dialog-heading',
    name: 'Dialog heading',
    kinds: ['type', 'heading'],
    source: 'src/ui/ui.js askConfirm',
    context: ['name-dialog pg-static', 'name-dialog-box'],
    states: [['rest', h('h2', '', str('campaign.shop'))]],
  },
  {
    id: 'row',
    name: 'Menu row',
    kinds: ['row', 'button'],
    source: 'src/ui/ui.js renderMenu',
    context: ['screen', 'menu'],
    states: [
      ['rest', row(str('ui.settings'))],
      ['cursor', row(str('ui.settings'), 'on')],
      ['navigation', row(str('ui.rates'), 'row-nav')],
      ['link', row(str('roombrowser.all'), 'row-link')],
      ['primary', row(str('roombrowser.new'), 'row-primary')],
      ['primary, cursor', row(str('roombrowser.new'), 'row-primary on')],
      ['info', row(str('ui.the_world'), 'row-info', h('span', 'row-value', str('registry.swiss2')))],
      ['disabled', row(str('ui.quad'), 'row-grey', h('span', 'row-value', str('ui.cancel')))],
      ['warning', row(str('ui.expect_bugs_and_rough_edges_it'), 'row-warn')],
    ],
  },
  {
    id: 'control-switch',
    name: 'Switch',
    kinds: ['control'],
    source: 'src/ui/ui.js makeSwitch',
    context: ['screen', 'menu'],
    states: [['off', row(str('ui.sound'), '', seg(['Off', 'On'], 'Off'))], ['on', row(str('ui.sound'), 'on', seg(['Off', 'On'], 'On'))]],
  },
  {
    id: 'control-segments',
    name: 'Segments, named choices on the row',
    kinds: ['control'],
    source: 'src/ui/ui.js makeSegments',
    context: ['screen', 'menu'],
    states: [['rest', row(str('ui.flight_mode'), '', seg(['Acro', 'Angle'], 'Acro'))]],
  },
  {
    id: 'control-dropdown',
    name: 'Dropdown',
    kinds: ['control', 'dropdown'],
    source: 'src/ui/ui.js makeDrop, openDrop',
    context: ['screen', 'menu'],
    states: [
      ['closed', row(str('ui.language'), '', h('div', 'row-control', h('button', 'drop-btn', 'English')))],
      ['open', h('div', 'drop-list pg-static', h('button', 'drop-opt on', 'English'), h('button', 'drop-opt', 'Español'))],
    ],
  },
  {
    id: 'control-stepper',
    name: 'Stepper',
    kinds: ['control', 'button'],
    source: 'src/ui/ui.js makeStepper',
    context: ['screen', 'menu'],
    states: [['rest', row(str('ui.graphics'), '', h('div', 'row-control', h('span', 'row-value', 'High'),
      h('span', 'step-col', h('button', 'step', '▲'), h('button', 'step', '▼'))))]],
  },
  {
    id: 'control-slider',
    name: 'Slider with a typed number',
    kinds: ['control'],
    source: 'src/ui/ui.js makeSliderControl',
    context: ['screen', 'menu'],
    states: [['rest', row(str('ui.rates'), '', h('div', 'row-control row-slider',
      '<input type="range" class="row-range" min="0" max="100" value="62">',
      '<input type="text" class="row-num row-range-num" value="62">'))]],
  },
  {
    id: 'button-dialog',
    name: 'Dialog button',
    kinds: ['button'],
    source: 'src/ui/ui.js askConfirm, the calibrate screen',
    context: ['name-dialog pg-static', 'name-dialog-box', 'name-dialog-row'],
    states: [
      ['rest', h('button', 'name-dialog-btn', str('ui.cancel'))],
      ['primary', h('button', 'name-dialog-btn on', str('ui.save_mapping'))],
      ['danger', h('button', 'name-dialog-btn danger', str('ui.cancel'))],
    ],
  },
  {
    id: 'button-chip',
    name: 'Corner chip',
    kinds: ['button', 'status'],
    source: 'src/ui/ui.js pauseChip, swapChip',
    context: [],
    states: [['rest', h('button', 'bug-chip pg-static', str('ui.pause'))], ['aircraft', h('button', 'bug-chip pg-static', str('ui.aircraft'))]],
  },
  {
    id: 'card-mode',
    name: 'Mode card (the title gate)',
    kinds: ['card'],
    source: 'src/ui/ui.js renderTitleCards',
    context: ['screen screen-title is-gate', 'gate-cards'],
    states: [
      ['rest', gateCard('', 'assets/gate/combat.jpg', str('combat.card'), str('combat.card_blurb'), [str('combat.card_cut'), str('combat.card_rounds'), str('friends.card_code')])],
      ['cursor', gateCard('on', 'assets/gate/ace.jpg', str('roomtag.section'), str('roomtag.card_blurb'), [str('friends.card_code')])],
    ],
  },
  {
    id: 'card-world',
    name: 'World card',
    kinds: ['card'],
    source: 'src/ui/ui.js the maps screen',
    context: ['screen screen-maps', 'map-cards'],
    states: [
      ['rest', worldCard('', 'assets/posters/alps.jpg', str('registry.the_alps'))],
      ['cursor', worldCard('on', 'assets/posters/swiss2.jpg', str('registry.swiss2'), str('ui.flying_now'))],
      ['chosen', worldCard('chosen', 'assets/posters/itaipu.jpg', str('registry.itaipu'))],
    ],
  },
  {
    id: 'card-part',
    name: 'Hangar choice card',
    kinds: ['card', 'button'],
    source: 'src/ui/hangar-parts.js',
    context: ['hangar pg-static', 'hangar-cards hangar-cards-small'],
    states: [
      ['rest', h('button', 'hangar-card', h('span', 'hangar-card-name', str('campaign.u.wide')), h('span', 'hangar-card-detail', str('campaign.shop')))],
      ['chosen', h('button', 'hangar-card on', h('span', 'hangar-card-name', str('campaign.u.wide')), h('span', 'hangar-card-detail', str('campaign.shop')))],
    ],
  },
  {
    id: 'card-mission',
    name: 'Mission card',
    kinds: ['card', 'status'],
    source: 'src/ui/campaign.js missionCard',
    context: ['name-dialog pg-static', 'name-dialog-box campaign-box'],
    states: [['free, two stars', h('div', 'campaign-mission',
      h('div', 'campaign-mission-top', h('span', 'campaign-n', str('campaign.mission_n', { n: 1 })),
        h('span', 'campaign-tag free', str('campaign.free')),
        h('span', 'campaign-stars', h('span', 'campaign-star on', '★'), h('span', 'campaign-star on', '★'), h('span', 'campaign-star', '☆'))),
      h('div', 'campaign-name', str('campaign.m.intakes')), h('div', 'campaign-line', str('campaign.m.intakes_blurb')))]],
  },
  {
    id: 'nav-breadcrumb',
    name: 'Breadcrumb',
    kinds: ['navigation'],
    source: 'src/ui/ui.js CRUMBS, syncFrame',
    context: ['frame-top pg-static'],
    states: [['two deep', h('div', 'crumb', h('span', 'crumb-up', str('ui.settings')), h('span', 'crumb-sep', '/'), h('span', 'crumb-here', str('ui.rates')))]],
  },
  {
    id: 'nav-context-chip',
    name: 'Frame context chip',
    kinds: ['navigation', 'status'],
    source: 'src/ui/ui.js contextChips',
    context: ['frame-top pg-static'],
    states: [['rest', h('span', 'frame-chip', h('span', 'frame-chip-key', str('ui.aircraft')), h('b', '', str('ui.quad')))]],
  },
  {
    id: 'lobby-slot',
    name: 'Lobby pilot slot',
    kinds: ['lobby-slot', 'status'],
    source: 'src/ui/ui.js the war lobby view',
    context: ['screen', 'war-lobby', 'war-lobby-pilots'],
    states: [
      ['waiting', pilot('Clever Gecko 03', str('ui.quad'))],
      ['ready', pilot('Clever Gecko 03', str('ui.quad'), { ready: true })],
      ['me, host, ready', pilot('Fernando', str('ui.quad'), { ready: true, me: true, host: true })],
    ],
  },
  {
    id: 'lobby-status',
    name: 'Lobby status line',
    kinds: ['lobby-slot', 'status'],
    source: 'src/ui/ui.js the war lobby view',
    context: ['screen', 'war-lobby'],
    states: [
      ['waiting', h('div', 'war-lobby-status', str('lobby.waiting'))],
      ['counting down', h('div', 'war-lobby-status go', str('lobby.starting', { n: 5 }))],
    ],
  },
  {
    id: 'room-entry',
    name: 'Room entry (title rooms panel)',
    kinds: ['card', 'status'],
    source: 'src/ui/ui.js renderTitleRooms',
    context: ['screen screen-title is-gate', 'gate-rooms', 'gate-rooms-list'],
    states: [
      ['rest', h('div', 'gate-room', h('span', 'gate-room-name', 'Fernando'), h('span', 'gate-room-value', str('roombrowser.title')))],
      ['live', h('div', 'gate-room is-live', h('span', 'gate-room-name', 'Fernando'), h('span', 'gate-room-value', h('span', 'gate-room-join', str('combat.card'))))],
      ['cursor', h('div', 'gate-room gate-room-make on', h('span', 'gate-room-name', str('roombrowser.new')))],
    ],
  },
  {
    id: 'status-beta',
    name: 'Beta notice',
    kinds: ['status'],
    source: 'src/ui/ui.js the title brand',
    context: ['screen screen-title', 'brand'],
    states: [['rest', h('p', 'beta-note', h('span', 'beta-tag', str('ui.beta')), h('span', '', str('ui.expect_bugs_and_rough_edges_it')))]],
  },
  {
    id: 'modal-confirm',
    name: 'Confirm dialog',
    kinds: ['modal'],
    source: 'src/ui/ui.js askConfirm',
    context: ['name-dialog pg-static'],
    states: [['rest', h('div', 'name-dialog-box', h('h2', '', str('campaign.shop')), h('p', 'lede', str('campaign.u.wide_note')),
      h('div', 'name-dialog-row', h('button', 'name-dialog-btn', str('ui.cancel')), h('button', 'name-dialog-btn on', str('ui.save'))))]],
  },
  /* What the design system names and the game does not have. */
  {
    id: 'tooltip',
    name: 'Tooltip',
    kinds: ['tooltip'],
    gap: 'No hover tooltip in the game. A menu explains the row under the cursor in its help column (menu-help), an info row puts its full value in the native title, and the one floating hint is the first flight hint (osd-air-hint). Proposed: keep the help column; a tooltip only where a control has no row to explain it.',
  },
  {
    id: 'hub-card',
    name: 'Hub card (Operations, Flight Club, Hangar)',
    kinds: ['card'],
    gap: 'Proposed, PLAN.md phase 3. Built from the mode card with a hub tone.',
  },
  {
    id: 'session-visibility',
    name: 'Session visibility control',
    kinds: ['control'],
    gap: 'Proposed, PLAN.md phase 5. The segments control with three values.',
  },
  {
    id: 'briefing-panel',
    name: 'Mission briefing panel',
    kinds: ['card'],
    gap: 'Proposed, PLAN.md phase 4. Facts from the mode registry, in the monospace face.',
  },
];

/* Placeholders the markup carries for the playground's own layout, not
 * the game's: pg-static undoes the fixed and absolute positions overlays
 * have so a component can sit in the page's flow. */
export const PLAYGROUND_CLASSES = new Set(['pg-static']);

/* The classes in a piece of markup, for the check. */
export function classesIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      out.add(c);
    }
  }
  return out;
}

/*
 * The custom properties a stylesheet defines, grouped the way PLAN.md
 * section 4 groups them. A token no group claims is reported as 'other',
 * and the check fails on it, so a token added to the sheet without a
 * place in the system shows up rather than slipping in.
 */
export const TOKEN_GROUPS = [
  ['ground', /^--pdcs-(bg|ground|panel|scrim|plate|grid|grid-line|fine-grid)$/],
  ['line', /^--pdcs-line(-soft)?$/],
  ['text', /^--pdcs-(text|bright|muted|dim)$/],
  ['accent', /^--pdcs-(blue|blue-strong|blue-dim|blue-wash)$/],
  ['state', /^--pdcs-(green|green-live|green-dim|fail|warn)$/],
  ['flag', /^--py-(red|white|blue)$/],
  ['type', /^--pdcs-(mono|read)$/],
  ['layout', /^--(bar-top|bar-bot|bars|pdcs-gutter|banner-size)$/],
  ['flight display', /^--(cream|sakura|amber|mint|slate|deep|panel|ink|ui-font)$/],
  ['firmware bench', /^--bf-[a-z-]+$/],
  ['hangar motion', /^--hg-(spring|ease)$/],
];

export function tokensIn(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  for (const m of bare.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)) {
    names.add(m[1]);
  }
  return [...names].map((name) => {
    const g = TOKEN_GROUPS.find(([, re]) => re.test(name));
    return { name, group: g ? g[0] : 'other' };
  });
}

/* The classes a stylesheet defines a rule for. Comments go first, so a
 * class named only in a comment does not count. */
export function classesInSheet(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Set();
  for (const m of bare.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) {
    out.add(m[1]);
  }
  return out;
}

/* The style blocks of a page's source, joined. */
export function styleOf(page) {
  return [...page.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}
