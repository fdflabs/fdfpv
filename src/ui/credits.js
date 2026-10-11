import { str } from '../strings/index.js';
/*
 * credits.js: who made this, who flew it, and whose work it stands on.
 *
 * Built as a DOM tree so the simulator overlay and the public board can
 * share the same roll. The live address is this page at #credits. The
 * board points there rather than keeping a second copy.
 *
 * WHY A PILOT ROW SAYS NOTHING ABOUT THE PILOT. It carries a name, a
 * slot and a link out, and that is all. Anything written under one of
 * these names is somebody describing a person who is not in the room to
 * be asked, and no line of it is worth as much as the name being spelled
 * right and the link going to the right place.
 *
 * WHY THE CARD IS THE HIT TARGET BUT THE NAME IS THE LINK. A pilot card
 * is one thing about one person, so a click anywhere on it should land
 * on their channel. Wrapping the whole card in an <a> would make the
 * accessible name of that link the whole card rather than the name on
 * it. So the heading holds the anchor and the anchor's ::after is
 * stretched over the card.
 * The project cards below could not be wrapped anyway: their copy
 * already carries links, and an <a> inside an <a> is not a document.
 *
 * Marks live in assets/credits (sim) or credits/ (board). The three
 * project marks are the official ones: TrackDraw's dark-background
 * colour mark, Grok's 2025 wordmark, Claude's starburst. The faces are
 * the channels' own pictures, at the size YouTube serves them. All of them are used only to name the work.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

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

function link(href, text) {
  const a = el('a', null, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/*
 * A project's official mark. A <span> and not a <div> because the mark
 * is the card's heading now, and a div inside an <h4> is not a document.
 *
 * A mark that spells the name is the label, so it takes role=img and the
 * name. A mark that sits beside the name in type is decorative, and
 * labelling it as well would have the card announce itself twice.
 */
function logo(src, alt, well, decorative) {
  const box = el('span', well === 'light' ? 'credit-logo light' : 'credit-logo');
  if (decorative) {
    box.setAttribute('aria-hidden', 'true');
  } else {
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', alt);
  }
  /*
   * Inline the SVG instead of <img src>. The local static server has no
   * MIME table for images unless it is restarted, and Chrome will not
   * paint an SVG <img> served as application/octet-stream. fetch() still
   * reads the bytes, and an inline <svg> does not care about the type.
   */
  fetch(src)
    .then((r) => {
      if (!r.ok) {
        throw new Error(String(r.status));
      }
      return r.text();
    })
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        throw new Error('bad svg');
      }
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('aria-hidden', 'true');
      box.append(svg);
    })
    .catch(() => {
      box.append(el('span', 'credit-logo-fallback', alt));
    });
  return box;
}

/*
 * A project card: the mark across the top, and copy under it.
 *
 * THE MARK IS THE HEADING. TrackDraw's wordmark says TrackDraw, so a
 * card that showed the wordmark and then wrote the name underneath said
 * it twice, which is what the roll used to do. The mark carries the
 * link and `alt` carries the accessible name, so a screen reader still
 * hears one title and a broken fetch still shows one, in the fallback.
 *
 * `wordmark: false` is for a mark that is a symbol rather than a name.
 * Claude's starburst is a lovely thing and it does not spell anything,
 * so that card gets the symbol and the word beside it. Three lines of
 * flag beats a heading that only some readers can read.
 *
 * WHY THIS CARD IS NOT A LINK THE WAY A PERSON CARD IS. Its copy
 * already carries two or three links of its own, and a hit target
 * stretched over the card would swallow every one of them.
 */
function projectCard({ src, alt, well, title, href, body, wordmark = true }) {
  const n = el('article', 'credit project');
  const h = el('h4', 'credit-title');
  const parts = [logo(src, alt || title, well, !wordmark)];
  if (!wordmark) {
    parts.push(el('span', 'credit-title-text', title));
  }
  if (href) {
    const a = link(href, null);
    a.append(...parts);
    h.append(a);
  } else {
    h.append(...parts);
  }
  n.append(h);
  const copy = el('div', 'credit-copy');
  if (typeof body === 'string') {
    copy.append(el('p', null, body));
  } else if (body) {
    copy.append(body);
  }
  n.append(copy);
  return n;
}

function section(kicker, heading) {
  const n = el('section', 'credit-block');
  const k = el('div', 'credit-kicker');
  k.append(el('span', null, kicker));
  n.append(k);
  if (heading) {
    n.append(el('h3', null, heading));
  }
  return n;
}

/**
 * Fill `host` with the credits roll. assetBase is the directory that
 * holds the marks and the faces, with no trailing slash.
 */
export function fillCredits(host, { assetBase = 'assets/credits' } = {}) {
  const src = (name) => new URL(`${assetBase}/${name}`, document.baseURI).href;
  host.textContent = '';

  const by = el('p', 'credits-lede');
  by.append(
    document.createTextNode(str('credits.fdfpv_by')),
    link('https://fdflabs.com', 'fdflabs.com'),
  );
  host.append(by);

  const lede = el('p', 'credits-lede', str('credits.a_browser_fpv_racing_simulator_the'));
  host.append(lede);

  /*
   * The controller's GPLv3 attribution, and the only place in the game
   * that names it (the owner's rule, 2 Oct 2026, held by npm run
   * lint:bf): its name, its notice as upstream states it (the sources
   * carry no copyright holder line, only "part of Cleanflight and
   * Betaflight"), the licence, and the corresponding source, which is
   * this repository's pinned vendor/betaflight with patches/. No mark.
   */
  const controller = section(str('credits.the_controller'), '');
  const notice = el('p', 'credit-room');
  notice.append(
    document.createTextNode(str('credits.betaflight_notice')),
    link('https://github.com/fdflabs/fdfpv', 'github.com/fdflabs/fdfpv'),
  );
  const noticeList = el('div', 'credit-rooms');
  noticeList.append(notice);
  controller.append(noticeList);
  host.append(controller);

  const tracks = section(str('credits.the_track_language'), '');
  const tdBody = el('p');
  tdBody.append(
    document.createTextNode(str('credits.the_track_builder_is_inspired_by')),
    link('https://trackdraw.app/', str('credits.track_draw')),
    document.createTextNode(str('credits.from_the_dutch_drone_gods_at')),
    link('https://dutchdronesquad.nl/', str('credits.dutch_drone_squad')),
    document.createTextNode(str('credits.real_field_scale_real_obstacles_a')),
  );
  tracks.append(projectCard({
    src: src('trackdraw.svg'),
    alt: 'TrackDraw',
    title: str('credits.track_draw'),
    href: 'https://trackdraw.app/',
    body: tdBody,
  }));
  host.append(tracks);

  /*
   * Itaipu is built from open data under four licences, each of which
   * asks for its notice where the map is shown (docs/ITAIPU-PLAN.md
   * section 15). The notices are given as their licensors wrote them.
   */
  const dam = section(str('credits.itaipu'), str('credits.itaipu_heading'));
  const damList = el('div', 'credit-rooms');
  /* And the war mode's music on that map, CC BY, whose licences ask for
   * the same (assets/audio/war/CREDITS.md); and its explosions, CC0, which
   * asks nothing, credited because JangaFX ask it as a favour
   * (tools/explosions/README.md). */
  for (const key of ['credits.it_anadem', 'credits.it_glo30', 'credits.it_sentinel', 'credits.it_osm',
    'credits.it_music_intro', 'credits.it_music_combat', 'credits.it_explosions']) {
    damList.append(el('p', 'credit-room', str(key)));
  }
  dam.append(damList);
  host.append(dam);

  const horde = section(str('credits.the_horde'), str('credits.written_with_grok_built_with_claude'));
  const ai = el('div', 'credit-row pair');
  const grokBody = el('p');
  grokBody.append(
    document.createTextNode(str('credits.xai_s_grok_a_lot_of')),
  );
  const claudeBody = el('p');
  claudeBody.append(
    document.createTextNode(str('credits.anthropic_s_claude_the_other_half')),
  );
  ai.append(
    projectCard({
      src: src('grok.svg'),
      alt: 'Grok',
      well: 'light',
      title: str('credits.grok'),
      href: 'https://grok.com',
      body: grokBody,
    }),
    projectCard({
      src: src('claude.svg'),
      alt: 'Claude',
      title: str('credits.claude'),
      wordmark: false,
      href: 'https://claude.ai',
      body: claudeBody,
    }),
  );
  horde.append(ai);
  host.append(horde);

  const legal = el('p', 'credits-legal');
  legal.append(
    document.createTextNode(str('credits.betaflight_track_draw_grok_claude_dutch')),
    link('https://www.gnu.org/licenses/gpl-3.0.html', 'GPLv3'),
    document.createTextNode('.'),
  );
  host.append(legal);
}
