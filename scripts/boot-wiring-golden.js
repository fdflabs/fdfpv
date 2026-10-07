/*
 * boot-wiring-golden.js: what the shell's boot wiring does, recorded once
 * against the code it pins and compared on every run after.
 *
 *     node scripts/boot-wiring-golden.js            compare
 *     node scripts/boot-wiring-golden.js --record   write the record (old code!)
 *
 * The middle of boot() in src/main.js, from the peer marks to the start
 * pose, is a run of small decisions that no other check reads as a
 * whole: the graphics preset a detected GPU lowers, a map named in the
 * address, the record line while the title shows its own world, a board
 * link's track and chase (?share=&ghost=), the online row of the loading
 * screen, the thumb sticks' pause and aircraft buttons, the words the
 * stats beacon carries, the activity a flight is filed under, a resize
 * applied once a frame, and the movie export's surface; and past the
 * motor audio, the music dock's skip, the tune boot flies and its fall
 * back to the first tune, what the PIDs screen is handed, and the floor
 * world a world that will not build gives way to. Each scenario
 * boots the real page and records what those decisions left behind, as
 * plain values, so a rewrite that decides one differently shows here.
 *
 * The board is a stub served by this script: it answers one track, its
 * times and its ghost, and 404s everything else, and every path asked of
 * it is recorded.
 *
 * Browser: run it through ~/.cache/run-check.sh.
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

import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY } from '../src/fc/dump.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'boot-wiring-golden.json');
const WAIT = 300000;
const recording = process.argv.includes('--record');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);

const TRACK_DOC = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'map-track-v4.json'), 'utf8'));
const TRACK_ID = 'trk-golden01';
const TIME_ID = 'tm-0123abcd';

/* The stub board. Paths are kept in the order asked, deduplicated later. */
const asked = [];
const board = createServer((req, res) => {
  const path = req.url.split('?')[0];
  asked.push(`${req.method} ${path}`);
  const send = (code, body) => {
    res.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') {
    send(204, {});
  } else if (path === `/api/tracks/${TRACK_ID}/document`) {
    send(200, { id: TRACK_ID, name: 'Golden', author: 'stub', document: TRACK_DOC });
  } else if (path === `/api/tracks/${TRACK_ID}`) {
    send(200, { id: TRACK_ID, times: [{ id: TIME_ID, name: 'stub', lapMs: 61234, hasGhost: true, craft: '' }] });
  } else {
    send(404, { error: 'not here' });
  }
});
await new Promise((done) => {
  board.listen(0, '127.0.0.1', done);
});
const BOARD = `http://127.0.0.1:${board.address().port}`;

/* A renderer string the page will read as its GPU's, through the debug
 * extension readGpuInfo asks first. */
function gpuSeed(name) {
  return `(() => {
    const UNMASKED_VENDOR = 0x9245;
    const UNMASKED_RENDERER = 0x9246;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      const real = C.prototype.getParameter;
      C.prototype.getParameter = function (p) {
        if (p === UNMASKED_RENDERER) return ${JSON.stringify(name)};
        if (p === UNMASKED_VENDOR) return 'Golden Vendor';
        return real.call(this, p);
      };
    }
  })();`;
}

function settingsSeed(extra) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: 'alps',
    graphics: 'low',
    graphicsAuto: false,
    perfMode: 'quality',
    flightMode: 'angle',
    sound: false,
    ...extra,
  };
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the record says what the page did. */ }`;
}

/* Every banner text the page shows, in order, and every beacon body. */
const WATCH = `(() => {
  window.__goldenBanners = [];
  window.__goldenBeacons = [];
  navigator.sendBeacon = (url, blob) => {
    blob.text().then((t) => window.__goldenBeacons.push(t));
    return true;
  };
  new MutationObserver(() => {
    const b = document.querySelector('.banner');
    const t = b ? b.textContent : '';
    const log = window.__goldenBanners;
    if (t && log[log.length - 1] !== t) log.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

const READ_SETTINGS = (keys) => `(() => {
  const s = window.__ui.settings;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}'); } catch (e) { stored = { unreadable: true }; }
  const pick = (o) => Object.fromEntries(${JSON.stringify(keys)}.map((k) => [k, o[k] === undefined ? '<undefined>' : o[k]]));
  return { live: pick(s), stored: pick(stored) };
})()`;

const ROWS = `(() => Object.fromEntries(['sys-online', 'sys-physics', 'sys-flight', 'sys-audio'].map((id) => {
  const n = document.getElementById(id);
  return [id, n && n.parentElement ? n.parentElement.dataset.state || '' : '<none>'];
})))()`;

const BEST = `(() => ({
  lastBestMs: window.__ui.lastBestMs === undefined ? '<undefined>' : window.__ui.lastBestMs,
  osdMode: window.__ui.osdMode === undefined ? '<undefined>' : window.__ui.osdMode,
  view: window.__map().id,
  viewMode: window.__map().mode,
}))()`;

const CANVAS = `(() => {
  const c = document.getElementById('view');
  return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight, dpr: window.devicePixelRatio };
})()`;

async function boot({ url = '/index.html', seed = [], touch = false, width = 1280, height = 720 }) {
  const page = await openPage({ root, width, height, url, touch, seed: [WATCH, ...seed] });
  await page.until('!!window.__shellReady', WAIT);
  await page.until('window.__map && window.__map().ready', WAIT);
  return page;
}

/* A few frames drawn, counted by the page's own frame counter. */
async function frames(page, n) {
  const at = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${at + n}`, 60000);
}

async function fly(page) {
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", WAIT);
}

/* Off the ground for a couple of seconds on the sticks, then a pause, which
 * commits the flight time. */
async function hop(page) {
  await fly(page);
  const y0 = await page.evaluate('window.__craftState().worldY');
  await page.evaluate('window.__stick(0, 0, 0, 0.75); true');
  /* An air start holds the craft for its countdown first. */
  await page.until(`!window.__craftState().landed && Math.abs(window.__craftState().worldY - ${y0}) > 0.5`, 60000).catch(() => {});
  /* Two and a half seconds of the plant's own clock, not the wall's: a
   * software rasteriser steps far fewer of them in a wall second. */
  const m0 = await page.evaluate('window.__stickPath().moduleMs');
  await page.until(`window.__stickPath().moduleMs >= ${m0 + 2500}`, 120000).catch(() => {});
  await page.evaluate('window.__stick(0, 0, 0, 0.5); true');
  await page.evaluate("window.__ui.act('pause'); true");
  await page.until("window.__craftState().mode === 'paused'", 10000).catch(() => {});
  await page.sleep(300);
}

/* Which aircraft and activities the flight time holds, without the device
 * id or the seconds, which are not the same from run to run. */
const FILED = `(() => {
  const rec = window.__ui.settings.flightTime || {};
  const out = [];
  for (const slot of Object.values(rec)) {
    for (const [craft, acts] of Object.entries(slot.by || {})) {
      for (const act of Object.keys(acts)) out.push(craft + '/' + act);
    }
  }
  return out.sort();
})()`;

const SCENARIOS = {};

/* THE GPU THE PAGE SEES lowers a detected preset, and only a detected one. */
const GPUS = {
  software: 'Google SwiftShader',
  integrated: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  discrete: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
};
for (const [kind, name] of Object.entries(GPUS)) {
  for (const [label, s] of Object.entries({
    'auto-high': { graphicsAuto: true, graphics: 'high' },
    'auto-medium': { graphicsAuto: true, graphics: 'medium' },
    'chosen-high': { graphicsAuto: false, graphics: 'high' },
  })) {
    SCENARIOS[`gpu-${kind}-${label}`] = async () => {
      const page = await boot({ url: '/index.html?map=alps', seed: [gpuSeed(name), settingsSeed(s)] });
      try {
        return {
          gpu: await page.evaluate('({ software: window.__gpu.software, integrated: window.__gpu.integrated })'),
          settings: await page.evaluate(READ_SETTINGS(['graphics', 'graphicsAuto'])),
          view: await page.evaluate('window.__map().graphics'),
        };
      } finally {
        await page.close();
      }
    };
  }
}

/* THE TITLE'S OWN WORLD, and the record line while it shows. */
SCENARIOS.title = async () => {
  const page = await boot({ seed: [settingsSeed({ map: 'alps' })] });
  try {
    return {
      best: await page.evaluate(BEST),
      settings: await page.evaluate(READ_SETTINGS(['map'])),
      rows: await page.evaluate(ROWS),
      banners: await page.evaluate('window.__goldenBanners.slice()'),
    };
  } finally {
    await page.close();
  }
};

/* A MAP NAMED IN THE ADDRESS wins over the stored one, and the menu is
 * redrawn to say so; the record line names the built world's mode. */
SCENARIOS['url-map'] = async () => {
  const page = await boot({ url: '/index.html?map=alps', seed: [settingsSeed({ map: 'swiss2' })] });
  try {
    const before = await page.evaluate(BEST);
    await fly(page);
    return {
      best: before,
      flown: await page.evaluate(BEST),
      settings: await page.evaluate(READ_SETTINGS(['map'])),
    };
  } finally {
    await page.close();
  }
};

/* A BOARD LINK: the track is fetched and seated before the world is built,
 * the online row says ready, and its chase is fetched and armed once the
 * course's times are known. The flight is filed as a race. */
SCENARIOS['share-ghost'] = async () => {
  asked.length = 0;
  const page = await boot({
    url: `/index.html?share=${TRACK_ID}&ghost=${TIME_ID}&board=${encodeURIComponent(BOARD)}`,
    seed: [settingsSeed({ map: 'alps' })],
  });
  try {
    const before = await page.evaluate(READ_SETTINGS(['map']));
    await hop(page);
    await page.until(`window.__ghost().choice === 'board:${TIME_ID}'`, 30000).catch(() => {});
    return {
      settings: before,
      seat: await page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('webfpv.share.import.v1') || 'null'); return s ? { id: s.id, name: s.name, board: s.board === " + JSON.stringify(BOARD) + ', map: s.document && s.document.map } : null; })()'),
      rows: await page.evaluate(ROWS),
      ghost: await page.evaluate('window.__ghost().choice'),
      view: await page.evaluate('({ id: window.__map().id, mode: window.__map().mode, gates: window.__map().gates })'),
      filed: await page.evaluate(FILED),
      asked: [...new Set(asked)].filter((p) => p.includes('/api/tracks')).sort(),
    };
  } finally {
    await page.close();
  }
};

/* A chase id that is not a board time id is never asked for. */
SCENARIOS['share-bad-ghost'] = async () => {
  asked.length = 0;
  const page = await boot({
    url: `/index.html?share=${TRACK_ID}&ghost=tm-NOTHEX!&board=${encodeURIComponent(BOARD)}`,
    seed: [settingsSeed({ map: 'alps' })],
  });
  try {
    await fly(page);
    await page.sleep(3000);
    return {
      ghost: await page.evaluate('window.__ghost().choice'),
      asked: [...new Set(asked)].filter((p) => p.includes('/api/tracks')).sort(),
    };
  } finally {
    await page.close();
  }
};

/* A board link to a track the board does not have: the online row fails
 * and the banner says why, and the seat is left as it was. */
SCENARIOS['share-missing'] = async () => {
  const page = await boot({
    url: `/index.html?share=trk-missing0&board=${encodeURIComponent(BOARD)}`,
    seed: [settingsSeed({ map: 'alps' })],
  });
  try {
    return {
      settings: await page.evaluate(READ_SETTINGS(['map'])),
      rows: await page.evaluate(ROWS),
      banners: await page.evaluate('window.__goldenBanners.slice(0, 1)'),
    };
  } finally {
    await page.close();
  }
};

/* THE STATS BEACON's words: the Track seat is spelled 'custom' for the
 * board, the input is the keyboard here, and the flight is free flight. */
SCENARIOS.stats = async () => {
  const page = await boot({ url: '/index.html', seed: [settingsSeed({ map: 'track' })] });
  try {
    await hop(page);
    await page.evaluate("window.dispatchEvent(new Event('pagehide')); true");
    await page.sleep(500);
    const beacons = await page.evaluate('window.__goldenBeacons.slice()');
    const words = [...new Set(beacons.map((b) => {
      const j = JSON.parse(b);
      return JSON.stringify({ kind: j.kind, craft: j.craft, map: j.map, input: j.input });
    }))].sort();
    return { words, filed: await page.evaluate(FILED) };
  } finally {
    await page.close();
  }
};

/* THE THUMB STICKS: Pause pauses and hides the overlay at once, Aircraft
 * opens the picker over the flight and hides it too. */
SCENARIOS.touch = async () => {
  const page = await boot({ url: '/index.html?map=alps', touch: true, seed: [settingsSeed({ map: 'alps' })] });
  try {
    await fly(page);
    await frames(page, 5);
    const flying = await page.evaluate('({ screen: window.__ui.screen, visible: window.__touch().visible })');
    const paused = await page.evaluate("(() => { document.querySelector('.touch-pause').click(); return { screen: window.__ui.screen, visible: window.__touch().visible }; })()");
    await page.evaluate("window.__ui.act('resume'); true");
    await page.until("window.__ui.screen === 'flight' && window.__touch().visible", 20000);
    const swapped = await page.evaluate("(() => { document.querySelector('.touch-swap').click(); return { screen: window.__ui.screen, visible: window.__touch().visible, picker: window.__ui.carousel.isOpen }; })()");
    return { flying, paused, swapped };
  } finally {
    await page.close();
  }
};

/* RESIZE AND THE MOVIE SURFACE. A resize lands within a few frames, at the
 * window's size and pixel ratio; while an export surface is set the canvas
 * is the movie's size, a resize waits, a second surface is refused, and the
 * restore puts the window's size back once. */
SCENARIOS.surface = async () => {
  /* High, whose pixel ratio cap lets a device pixel ratio of 2 show. */
  const page = await boot({ url: '/index.html?map=alps', seed: [settingsSeed({ map: 'alps', graphics: 'high' })] });
  const metrics = (w, h, dpr) => page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: dpr, mobile: false,
  }, page.sessionId);
  try {
    const out = { start: await page.evaluate(CANVAS) };
    await metrics(1000, 560, 1);
    await frames(page, 4);
    out.resized = await page.evaluate(CANVAS);
    /* Small enough that the pixel budget does not cap the ratio. */
    await metrics(480, 270, 2);
    await frames(page, 4);
    out.dpr2 = await page.evaluate(CANVAS);
    await metrics(1000, 560, 1);
    await frames(page, 4);
    out.dpr1 = await page.evaluate(CANVAS);
    out.set = await page.evaluate('(() => { window.__goldenRestore = window.__crashCam.exportSurface(640, 360, () => 0); const c = document.getElementById("view"); return { w: c.width, h: c.height, restore: typeof window.__goldenRestore }; })()');
    out.second = await page.evaluate('(() => { try { window.__crashCam.exportSurface(320, 180, () => 0); return "allowed"; } catch (e) { return e.message; } })()');
    await metrics(900, 500, 1);
    await frames(page, 4);
    out.heldThroughResize = await page.evaluate(CANVAS);
    out.restored = await page.evaluate('(() => { window.__goldenRestore(); const c = document.getElementById("view"); return { w: c.width, h: c.height }; })()');
    out.restoredTwice = await page.evaluate('(() => { const r = window.__goldenRestore(); const c = document.getElementById("view"); return { r: r === undefined ? "<undefined>" : r, w: c.width, h: c.height }; })()');
    await frames(page, 4);
    out.after = await page.evaluate(CANVAS);
    out.errors = page.errors.slice();
    return out;
  } finally {
    await page.close();
  }
};

/* THE TUNE AT BOOT, read back as the Tune and PIDs screens see it. A
 * stored choice of the pilot's own dump falls back to the first tune when
 * the dump is gone or the module refuses it, and the refused dump stays
 * stored for the pilot to fix. */
const TUNE_READ = `(() => {
  const t = window.__tune();
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}'); } catch (e) { stored = {}; }
  return {
    tune: { id: t.id, name: t.name, menu: t.menu },
    storedTune: stored.tune === undefined ? '<undefined>' : stored.tune,
    dump: localStorage.getItem(${JSON.stringify(FC_DUMP_KEY)}),
    pidsLive: JSON.parse(JSON.stringify(window.__ui.pidsLive)),
  };
})()`;
const dumpSeed = (body) => `try {
  localStorage.setItem(${JSON.stringify(FC_DUMP_KEY)}, ${JSON.stringify(body)});
  localStorage.setItem(${JSON.stringify(FC_DUMP_AIRFRAME_KEY)}, 'interceptor');
} catch (e) { /* Storage refused. */ }`;
for (const [name, extra, dump] of [
  ['tune-default', {}, null],
  ['tune-custom-missing', { tune: 'custom' }, null],
  ['tune-custom-dump', { tune: 'custom' }, 'set p_roll = 61\nset d_roll = 33\n'],
  ['tune-custom-clamped', { tune: 'custom' }, 'set p_roll = 99999\n'],
  /* A word for a numeric key: the module refuses the whole config. */
  ['tune-custom-refused', { tune: 'custom' }, 'set p_roll = lots\n'],
]) {
  SCENARIOS[name] = async () => {
    const page = await boot({ url: '/index.html?map=alps', seed: [settingsSeed({ map: 'alps', ...extra }), ...(dump == null ? [] : [dumpSeed(dump)])] });
    try {
      return { ...(await page.evaluate(TUNE_READ)), rows: await page.evaluate(ROWS) };
    } finally {
      await page.close();
    }
  };
}

/* A WORLD THAT WILL NOT BUILD at boot falls back to the Alps, with the
 * banner saying so. Named in the address, the seat moves to the Alps; as
 * the title's own world, the title world goes and the seat stays. */
for (const [name, url, refuse, map] of [
  ['floor-seat', '/index.html?map=itaipu', '/src/maps/itaipu.js', 'itaipu'],
  ['floor-title', '/index.html', '/src/maps/swiss2.js', 'swiss2'],
]) {
  SCENARIOS[name] = async () => {
    const page = await openPage({
      root, width: 1280, height: 720, url, seed: [WATCH, settingsSeed({ map })],
      override: { [refuse]: "throw new Error('golden: this world refuses to build');" },
    });
    try {
      await page.until('!!window.__shellReady', WAIT);
      await page.until('window.__map && window.__map().ready', WAIT);
      return {
        view: await page.evaluate('window.__map().id'),
        settings: await page.evaluate(READ_SETTINGS(['map'])),
        banners: await page.evaluate('window.__goldenBanners.slice(0, 1)'),
      };
    } finally {
      await page.close();
    }
  };
}

/* THE MUSIC DOCK: the bed follows the screen, and a skip pins the setting
 * only when what was skipped was a flight record and a record was pinned.
 * A skip wakes the audio, and a woken context in headless Chromium never
 * finishes a fade, so the title's skip has a page of its own. */
const MUSIC_NOW = "(() => { const st = window.__audio.musicStatus(); return { context: st && st.context, dock: window.__ui.musicNow ? window.__ui.musicNow.context : null, setting: window.__ui.settings.musicTrack }; })()";
SCENARIOS['music-title'] = async () => {
  const page = await boot({ url: '/index.html?map=alps', seed: [settingsSeed({ map: 'alps', sound: true })] });
  try {
    const title = await page.evaluate(MUSIC_NOW);
    await page.evaluate("window.__ui.settings.musicTrack = 'golden-pin'; window.__ui.onMusicSkip(1); true");
    return { title, afterSkip: await page.evaluate(MUSIC_NOW) };
  } finally {
    await page.close();
  }
};
/* With no records this build plays nothing, so a flight skip lands on id
 * '' and a pinned setting takes that, which is what shows the pin. */
for (const [name, pin] of [['music-rotation', 'rotation'], ['music-pinned', 'golden-pin']]) {
  SCENARIOS[name] = async () => {
    const page = await boot({ url: '/index.html?map=alps', seed: [settingsSeed({ map: 'alps', sound: true })] });
    try {
      await fly(page);
      await page.until("window.__audio.musicStatus().context === 'flight'", 15000).catch(() => {});
      await page.evaluate(`window.__ui.settings.musicTrack = ${JSON.stringify(pin)}; true`);
      const flight = await page.evaluate(MUSIC_NOW);
      await page.evaluate('window.__ui.onMusicSkip(1); true');
      return { flight, afterSkip: await page.evaluate(MUSIC_NOW) };
    } finally {
      await page.close();
    }
  };
}

const canon = (v) => JSON.stringify(v, null, 1);
const old = recording ? {} : JSON.parse(readFileSync(RECORD, 'utf8'));
const got = {};
let failed = 0;
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (only && !name.startsWith(only)) {
    continue;
  }
  const t0 = Date.now();
  /* eslint-disable-next-line no-await-in-loop */
  got[name] = await run();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (recording) {
    console.log(`recorded: ${name} (${secs} s)`);
    continue;
  }
  if (!(name in old)) {
    failed += 1;
    console.log(`FAILED: ${name}: not in the record`);
  } else if (canon(old[name]) !== canon(got[name])) {
    failed += 1;
    console.log(`FAILED: ${name}\n  record: ${canon(old[name])}\n  now:    ${canon(got[name])}`);
  } else {
    console.log(`ok: ${name} (${secs} s)`);
  }
}
board.close();
if (recording) {
  const merged = only && existsSync(RECORD) ? { ...JSON.parse(readFileSync(RECORD, 'utf8')), ...got } : got;
  writeFileSync(RECORD, `${JSON.stringify(merged, null, 1)}\n`);
  console.log(`wrote ${RECORD}`);
} else {
  console.log(failed ? `${failed} scenario(s) differ from the record` : 'all scenarios match the record');
}
process.exit(failed ? 1 : 0);
