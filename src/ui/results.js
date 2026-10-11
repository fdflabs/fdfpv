/*
 * results.js: the results screen and the title's record line, as Ui
 * methods installed onto the class at the end of ui.js.
 *
 * One screen serves three endings: a timed race (laps against the track
 * record), a room's race (rows the shell writes, because only it knows the
 * other pilots), and a freestyle run (the tricks that earned the score).
 * They share the hero block (kicker, headline, caption, big number, a meta
 * line) and the row idiom (label, figure, optional tag, optional bar), so
 * the three writers share the two helpers below and nothing else.
 *
 * `this` is the Ui. Callers are src/main.js and the Ui's own menus; the
 * names and arguments are theirs and must not change.
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

import { MAPS } from '../maps/registry.js';
import { activeCourseSummary } from '../share/summary.js';
import { inspectCourse } from '../share/listing.js';
import { writePendingTime } from '../share/session.js';
import { formatScore } from '../game/score.js';
import { str, plural } from '../strings/index.js';
import { withPosted } from '../game/debrief.js';
import { splitDuration } from '../share/flighttime.js';
import { formatDelta, formatRunClock, formatTime, lengthText } from './format.js';
import { el } from './widgets.js';
/* A cycle (ui.js installs these methods), so only read inside methods. */
import { lapCraftOf, seatIsRace } from './ui.js';

/* A freestyle run can name two dozen kinds of trick and the tail is
 * quarter rolls worth a few points. The screen answers "what earned", so
 * it lists the top ten and the note counts the rest. */
const TRICK_ROWS = 10;

const worldOf = (settings) => MAPS.find((m) => m.id === settings.map) ?? MAPS[0];

/* The seated course's own summary, or null when there is none or reading
 * it fails: a broken listing must never cost the pilot their times. */
function listingOrNull() {
  try {
    return inspectCourse();
  } catch (e) {
    return null;
  }
}

/* One results row. `mods` are the extra row classes (void, fastest,
 * total), `cells` the spans in reading order, `barPct` the bar's width or
 * null for no bar. */
function resultRow(mods, cells, barPct = null) {
  const row = el('div', ['result-row', ...mods.filter(Boolean)].join(' '));
  const main = el('div', 'result-main');
  main.append(...cells);
  row.append(main);
  if (barPct != null) {
    const bar = el('div', 'result-bar');
    const fill = el('div', 'result-bar-fill');
    fill.style.width = `${barPct}%`;
    bar.append(fill);
    row.append(bar);
  }
  return row;
}

const cell = (kind, text) => el('span', `result-${kind}`, text);

/* What a finished race says about the track record, from the record as the
 * run began (the live one may have moved during it). */
function verdictOf(fastest, recordAtStart) {
  if (fastest == null) {
    return 'none';
  }
  const prior = Number.isFinite(recordAtStart) ? recordAtStart : null;
  if (prior == null || fastest < prior) {
    return 'record';
  }
  return fastest === prior ? 'matched' : 'off';
}

/* Empties the screen's body and note, sets its two state classes and, for
 * a fresh arrival, restarts its entrance. */
function resetScreen(ui, record, empty, replay) {
  ui.resultsBody.textContent = '';
  ui.resultsNote.textContent = '';
  ui.resultsFacts.textContent = '';
  ui.resultsDebrief = null;
  const screen = ui.screens.results;
  screen.classList.toggle('is-record', record);
  screen.classList.toggle('is-empty', empty);
  if (replay) {
    replayEntrance(screen);
  }
}

function replayEntrance(screen) {
  screen.classList.remove('is-in');
  /* The read forces a style flush, so adding the class back replays the
   * animation instead of being folded into the removal. */
  void screen.offsetWidth;
  screen.classList.add('is-in');
}

const SVG = 'http://www.w3.org/2000/svg';
/* The route's square, in SVG units; the line is scaled into it less a
 * margin so the start and end dots are never clipped. */
const ROUTE_BOX = 100;
const ROUTE_PAD = 8;

function svg(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

/* The route seen from above, the same scale on both axes so a circle
 * stays round, start hollow and end filled. */
function routeSvg(route) {
  const xs = route.points.map((p) => p[0]);
  const zs = route.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const span = Math.max(Math.max(...xs) - x0, Math.max(...zs) - z0, 1);
  const k = (ROUTE_BOX - 2 * ROUTE_PAD) / span;
  const at = (p) => [ROUTE_PAD + (p[0] - x0) * k, ROUTE_PAD + (p[1] - z0) * k].map((v) => v.toFixed(1));
  const node = svg('svg', { viewBox: `0 0 ${ROUTE_BOX} ${ROUTE_BOX}`, class: 'results-route', role: 'img', 'aria-label': str('debrief.route') });
  node.append(svg('polyline', { points: route.points.map((p) => at(p).join(',')).join(' '), class: 'results-route-line' }));
  const [sx, sy] = at(route.points[0]);
  const [ex, ey] = at(route.points[route.points.length - 1]);
  node.append(svg('circle', { cx: sx, cy: sy, r: 3.5, class: 'results-route-start' }));
  node.append(svg('circle', { cx: ex, cy: ey, r: 3.5, class: 'results-route-end' }));
  return node;
}


function hoursText(s) {
  const { h, m } = splitDuration(s);
  if (h) {
    return str('debrief.hours', { h, m });
  }
  return m ? str('debrief.minutes', { m }) : str('debrief.seconds', { s: Math.floor(s) });
}

/* A record line's value in its own unit: a lap time, a board score or a
 * total flight time. */
function recordText(r) {
  if (r.what === 'debrief.aircraft_time') {
    return hoursText(r.now);
  }
  if (r.what === 'debrief.run_best' && r.improved) {
    return str('debrief.board_best_new', { now: formatScore(r.now) });
  }
  const unit = r.what === 'debrief.track_record' ? formatTime : formatScore;
  if (r.before == null) {
    return str('debrief.record_first', { now: unit(r.now) });
  }
  return r.improved ? str('debrief.record_beat', { now: unit(r.now), before: unit(r.before) }) : str('debrief.record_stands', { before: unit(r.before) });
}

/* The debrief's facts (src/game/debrief.js): every line the record has,
 * in the contract's order; the result is the screen's head and the next
 * actions its menu, so neither is repeated here. */
function factLines(d) {
  const lines = [[str('debrief.air_time'), formatRunClock(d.time.flightMs)]];
  if (d.route) {
    lines.push([str('debrief.distance'), lengthText(d.route.distanceM)]);
    lines.push([str('debrief.top'), str('debrief.top_value', { m: Math.max(0, Math.round(d.route.topM)) })]);
  }
  for (const a of d.accuracy) {
    lines.push([str(a.what), a.of == null ? String(a.n) : str('debrief.n_of', { n: a.n, of: a.of })]);
  }
  if (d.result.landed != null) {
    lines.push([str('debrief.landing'), str(d.result.landed ? 'debrief.landed' : 'debrief.not_landed')]);
  }
  for (const r of d.records) {
    lines.push([str(r.what), recordText(r), r.improved === true ? 'gain' : r.improved === false ? 'off' : '']);
  }
  return lines;
}

function fillFacts(box, d) {
  if (!d) {
    return;
  }
  if (d.route && d.route.points.length > 1) {
    box.append(routeSvg(d.route));
  }
  const list = el('dl', 'results-facts-list');
  for (const [label, value, tone] of factLines(d)) {
    list.append(el('dt', null, label), el('dd', tone || null, value));
  }
  box.append(list);
}

const RACE_HEADS = { record: 'ui.new_track_record', matched: 'ui.matched_the_record', off: 'ui.run_complete' };

export const resultsMethods = {
  /*
   * The title's record line, the strapline and the OSD's record, which
   * change together with the world: a freestyle world has no record and
   * the strapline must stop promising a time trial. `ms` undefined means
   * the seat has not been built yet, so the line speaks for what Fly would
   * launch and names no record.
   */
  setBest(ms, mode) {
    if (mode) {
      this.osdMode = mode;
    }
    this.lastBestMs = ms;
    const unbuilt = ms === undefined;
    const freestyle = unbuilt ? !seatIsRace(this.settings) : this.osdMode === 'freestyle';
    /* The score overlay hangs off the mode as well as the screen, and a map
     * swap changes the mode without a screen change. */
    this.syncScoreVisible();
    const seat = this.settings.map === 'track' ? activeCourseSummary() : null;
    const worldName = (seat && seat.name) || worldOf(this.settings).name;
    if (this.brandSub) {
      this.brandSub.textContent = str(freestyle ? 'ui.no_gates_2' : 'ui.time_trial', { worldName });
    }
    this.titleBest.textContent = '';
    if (freestyle) {
      /* The two minute clock exists only on a scored run; free flight and
       * scoring off have no clock and the line must not claim one. */
      this.titleBest.textContent = str(this.settings.freestyleScoring === 'scored'
        ? 'ui.no_gates_no_lap_two_minutes'
        : 'ui.no_gates_no_lap_no_clock');
      this.osdBest.textContent = '';
      return;
    }
    if (unbuilt) {
      this.osdBest.textContent = '';
      return;
    }
    if (ms == null) {
      this.titleBest.textContent = str('ui.no_lap_recorded_yet');
      this.osdBest.textContent = str('ui.no_record_yet');
      return;
    }
    this.titleBest.append(str('ui.track_record'), el('span', 'brand-best-time', formatTime(ms)));
    this.osdBest.textContent = str('ui.record', { formatTime: formatTime(ms) });
  },

  /* A settings commit can change what setBest wrote (the Scoring position,
   * the strapline), and only main.js calls setBest, on a world load or a
   * run's end. writeSettings and pick call this to redraw from what is
   * already known. */
  refreshBest() {
    if (this.titleBest) {
      this.setBest(this.lastBestMs);
    }
  },

  resultsCourseName() {
    if (this.share && this.share.name) {
      return this.share.name;
    }
    const listing = this.settings.map === 'track' ? listingOrNull() : null;
    return (listing && listing.name) || worldOf(this.settings).name;
  },

  /*
   * A race's results. `log` is every lap attempted, in order, voided ones
   * included with their own number (renumbering would describe a race the
   * pilot did not fly). `best` is the live record; `recordAtStart` the one
   * this run was chasing, which decides the headline.
   */
  showResults(log, best, recordAtStart, ghostNote = null, debrief = null) {
    this.roomResults = false;
    const laps = log.filter((l) => Number.isFinite(l.ms)).map((l) => l.ms);
    const fastest = laps.length ? Math.min(...laps) : null;
    const slowest = laps.length ? Math.max(...laps) : null;
    const verdict = verdictOf(fastest, recordAtStart);
    resetScreen(this, verdict === 'record', verdict === 'none', true);
    this.resultsDebrief = debrief;
    fillFacts(this.resultsFacts, debrief);
    this.resultsKicker.textContent = this.resultsCourseName();

    const meta = this.resultsHeroMeta;
    if (verdict === 'none') {
      this.resultsHead.textContent = str('ui.run_ended');
      this.resultsHeroTime.textContent = '';
      meta.textContent = '';
      meta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', str('ui.no_clean_lap_this_run_hitting')));
    } else {
      this.resultsHead.textContent = str(RACE_HEADS[verdict]);
      /* MultiGP scores a time trial on the best single lap, so that is the
       * big number. */
      this.resultsHeroCap.textContent = str(laps.length === 1 ? 'ui.lap_time' : 'ui.best_lap');
      this.resultsHeroTime.textContent = formatTime(fastest);
      let tone = 'gain';
      if (verdict === 'record' && Number.isFinite(recordAtStart)) {
        meta.textContent = str('ui.previous', { formatDelta: formatDelta(fastest - recordAtStart), formatTime: formatTime(recordAtStart) });
      } else if (verdict === 'record') {
        meta.textContent = str('ui.first_record_on_this_track');
      } else if (verdict === 'matched') {
        meta.textContent = str('ui.equals_the_record_2', { formatTime: formatTime(best) });
      } else {
        meta.textContent = str('ui.off_the_record_to_beat', { formatDelta: formatDelta(fastest - best), formatTime: formatTime(best) });
        tone = 'off';
      }
      meta.className = `results-hero-meta ${tone}`;
    }

    for (const lap of log) {
      const label = cell('label', str('ui.lap', { n: lap.n }));
      if (lap.ms == null) {
        const why = String(lap.reason || '').replace(/\n/g, ' ').toLowerCase();
        this.resultsBody.append(resultRow(['void'], [label, cell('time', 'void'), cell('why', why)]));
        continue;
      }
      const isFastest = lap.ms === fastest;
      const cells = [label, cell('time', formatTime(lap.ms))];
      /* A plane's lap carries points (src/game/race.js PLANE_REACH). */
      if (Number.isFinite(lap.score)) {
        cells.push(cell('tag', plural('count.points', lap.score)));
      }
      if (isFastest && laps.length > 1) {
        cells.push(cell('tag', 'fastest'));
      }
      /* Bars are relative to the slowest lap, floored so the quickest
       * still reads as a bar. */
      const bar = slowest > 0 ? Math.max(10, (lap.ms / slowest) * 100) : null;
      this.resultsBody.append(resultRow([isFastest && 'fastest'], cells, bar));
    }
    if (laps.length > 1) {
      const sum = laps.reduce((a, b) => a + b, 0);
      const label = str(laps.length === log.length ? 'ui.total' : 'ui.clean_laps_total');
      this.resultsBody.append(resultRow(['total'], [cell('label', label), cell('time', formatTime(sum))]));
    }
    const points = log.filter((l) => Number.isFinite(l.score)).map((l) => l.score);
    if (points.length) {
      const sum = points.reduce((a, b) => a + b, 0);
      this.resultsBody.append(resultRow(['total'], [cell('label', str('ui.run_score')), cell('time', plural('count.points', sum))]));
    }
    /* Only the shell knows whose ghost was chased, so it writes the line. */
    if (ghostNote) {
      this.resultsBody.append(el('p', 'results-ghost', ghostNote));
    }

    const listing = listingOrNull();
    /* The note is about the course that was flown, so it is only ever
     * about a seated track. */
    if (this.settings.map === 'track') {
      if (this.share && this.share.id) {
        const by = this.share.author ? str('ui.by_4', { author: this.share.author }) : '';
        this.resultsNote.textContent = str('ui.is_on_the_public_board_upload', { v1: this.share.name || str('ui.this_track'), by });
      } else if (listing && listing.kind === 'owned' && listing.layoutDrift) {
        this.resultsNote.textContent = str('ui.has_a_layout_that_is_not', { name: listing.name });
      }
    }
    this.timePosted = null;
    this.resultsFastest = fastest;
    /* Held for the upload row: the fastest lap, on a board track that can
     * take it. Storage may be unavailable, and the screen still shows. */
    if (fastest != null && listing && listing.canPostTime && listing.shareId) {
      try {
        writePendingTime({ trackId: listing.shareId, lapMs: fastest, craft: lapCraftOf(listing.doc, this.settings.airframe) });
      } catch (e) {
        /* Nothing held; the times are still on screen. */
      }
    }
    this.show('results');
    /* A first race can only finish here, so this is where the flight feel
     * question is offered unasked. */
    this.maybeOfferFeel();
  },

  /*
   * A room's race (src/share/roomrace.js), rewritten as the others finish.
   * v = { kicker, head, heroCap, heroTime, heroMeta, win, rows: [{ label,
   * time, tag, me, out }] }, all written by the shell. Nothing is posted.
   */
  showRoomResults(v, debrief = null) {
    this.roomResults = true;
    const first = this.screen !== 'results';
    resetScreen(this, Boolean(v.win), false, false);
    this.resultsDebrief = debrief;
    fillFacts(this.resultsFacts, debrief);
    this.resultsKicker.textContent = v.kicker;
    this.resultsHead.textContent = v.head;
    this.resultsHeroCap.textContent = v.heroCap;
    this.resultsHeroTime.textContent = v.heroTime;
    this.resultsHeroMeta.textContent = v.heroMeta;
    this.resultsHeroMeta.className = 'results-hero-meta';
    for (const r of v.rows) {
      const cells = [cell('label', r.label), cell('time', r.time)];
      if (r.tag) {
        cells.push(cell('tag', r.tag));
      }
      this.resultsBody.append(resultRow([r.out && 'void', r.me && 'fastest'], cells));
    }
    if (!first) {
      this.renderMenu();
      return;
    }
    replayEntrance(this.screens.results);
    this.show('results');
  },

  /* The freestyle board's answer to a posted run, so the results row can
   * report the outcome instead of repeating the verb. */
  markRunPosted(posted) {
    this.runPosted = posted || { ok: true };
    /* The board's answer is the freestyle record line (docs/DEBRIEF.md). */
    if (this.resultsDebrief && this.resultsDebrief.activity === 'free') {
      this.resultsDebrief = withPosted(this.resultsDebrief, posted);
      this.resultsFacts.textContent = '';
      fillFacts(this.resultsFacts, this.resultsDebrief);
    }
    if (this.screen === 'results') {
      this.renderMenu();
    }
  },

  /*
   * A freestyle run's end, on the race's screen: the score is the big
   * number, and the rows are the tricks landed, biggest earner first, each
   * barred against the top one.
   */
  showFreestyleResults(summary, debrief = null) {
    this.roomResults = false;
    this.freestyleRun = summary;
    this.runPosted = null;
    const clean = summary.crashes === 0 && summary.tricks > 0;
    resetScreen(this, clean, !summary.tricks, true);
    this.resultsDebrief = debrief;
    fillFacts(this.resultsFacts, debrief);
    const free = summary.timed === false;
    this.resultsKicker.textContent = str(free ? 'ui.freestyle_results_free_flight' : 'ui.freestyle_results');
    let head = 'ui.run_ended';
    if (summary.tricks) {
      head = clean ? 'ui.clean_run' : 'ui.run_complete';
    }
    this.resultsHead.textContent = str(head);
    this.resultsHeroCap.textContent = str('ui.score');
    this.resultsHeroTime.textContent = formatScore(summary.total);
    const meta = this.resultsHeroMeta;
    if (!summary.tricks) {
      meta.textContent = '';
      meta.className = 'results-hero-meta';
      this.resultsBody.append(el('p', 'results-empty', str(free
        ? 'ui.nothing_the_recogniser_could_name_a'
        : 'ui.two_minutes_and_nothing_the_recogniser')));
      this.show('results');
      return;
    }
    const facts = [str('ui.tricks_of_them_different', { tricks: summary.tricks, unique: summary.unique })];
    if (summary.bestCombo > 0) {
      facts.push(`best chain ${formatScore(summary.bestCombo)}`);
    }
    if (summary.bonus > 0) {
      facts.push(`variety bonus ${formatScore(summary.bonus)}`);
    }
    if (summary.crashes === 0) {
      facts.push(str('ui.no_crashes'));
    } else {
      facts.push(`${summary.crashes} ${summary.crashes === 1 ? 'crash' : 'crashes'}`);
    }
    meta.textContent = facts.join('  ·  ');
    meta.className = clean ? 'results-hero-meta gain' : 'results-hero-meta';

    const [lead] = summary.rows;
    const top = lead ? lead.points : 0;
    for (const trick of summary.rows.slice(0, TRICK_ROWS)) {
      const name = trick.count > 1 ? `${trick.name} x${trick.count}` : trick.name;
      const bar = top > 0 ? Math.max(4, Math.round((trick.points / top) * 100)) : null;
      this.resultsBody.append(resultRow([trick === lead && 'fastest'], [cell('label', name), cell('time', formatScore(trick.points))], bar));
    }
    const unlisted = summary.rows.length - TRICK_ROWS;
    if (unlisted === 1) {
      this.resultsNote.textContent = str('ui.and_one_more_kind_of_trick');
    } else if (unlisted > 1) {
      this.resultsNote.textContent = str('ui.and_more_kinds_of_trick_further', { hidden: unlisted });
    }
    this.show('results');
  },
};
