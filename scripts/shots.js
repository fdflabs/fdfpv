/*
 * shots.js: open the real shell in headless Chromium, run a list of steps
 * against it and write the frames it is told to capture. Every rendering
 * bug in this project was found by looking at a frame, so producing frames
 * is one command:
 *
 *     node scripts/shots.js [--option=value ...] step [step ...]
 *
 * Options (all apply to the whole run, wherever they appear):
 *   --out=DIR        output directory, default .loop/shots. Relative is
 *                    against the repo root, absolute is used as given.
 *   --w=N --h=N      window and image size in CSS px, default 1600x900.
 *   --url=PATH       page opened on the local server, default /index.html.
 *   --touch=1        touch emulation, so the thumb sticks mount.
 *   --jpeg=Q         every capture a JPEG at quality Q (.jpg); 0 is PNG.
 *   --graphics=P     the quality preset P, seeded as chosen.
 *   --course=FILE    a track built in a world, seeded and raced in Track mode.
 *   --airframe=ID    seat aircraft ID, first-run aircraft question answered.
 *
 * Steps (kind:argument, run in order):
 *   wait:MS          sleep MS milliseconds.
 *   shot:NAME        capture to <out>/NAME.png (or .jpg) plus NAME.json.
 *   tap:CODE         press and release a key (KeyboardEvent.code).
 *   down:CODE        press and hold a key.   up:CODE   release it.
 *   eval:EXPR        evaluate EXPR (promises awaited) and print the value.
 *   until:EXPR       poll EXPR until truthy, 20 s at most; a timeout is an error.
 *   expect:EXPR      EXPR must be truthy now; otherwise an error.
 *   tstart:ID,X,Y    touch point ID down at X,Y.
 *   tmove:ID,X,Y     touch point ID moves to X,Y.
 *   tend:ID          touch point ID lifts.
 *   click:X,Y        left mouse click at X,Y.
 *   move:X,Y         mouse moves to X,Y.
 *   throttle:KBPS    network limited to KBPS with 40 ms latency; 0 lifts it.
 *
 * The run ends with the console tally (errors, warnings, harness faults)
 * and exits 0 when both errors and faults are zero, 1 when not, 2 when the
 * run itself could not go on. Callers parse stdout, so every printed line
 * is a contract.
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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage, keyInfo } from '../tests/lib/page.js';
/* Imported, not copied: the key belongs to ui.js, and the import also keeps
 * ui.js importable in Node. Should it ever gain a browser-only top-level
 * import, this harness fails at startup instead of seeding a key nothing
 * reads. */
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* A wait in milliseconds is evidence of nothing: on the software
 * rasteriser a frame takes about 120 ms, so a key followed by a short wait
 * can capture the screen from before the key under a name that lies. A
 * capture of a named state asserts that state with until: or expect:. */
const UNTIL_MS = 20000;
const POLL_MS = 120;
const TAP_HOLD_MS = 30;
const CLICK_PAUSE_MS = 60;
const THROTTLE_LATENCY_MS = 40;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function parseArgs(argv) {
  const opts = {};
  const steps = [];
  for (const arg of argv) {
    const m = arg.match(/^--([a-z]+)=(.*)$/s);
    if (!m) {
      steps.push(arg);
      continue;
    }
    opts[m[1]] = /^\d+$/.test(m[2]) ? Number(m[2]) : m[2];
  }
  return { opts, steps };
}

/* Every seed reads and writes the settings object the pilot's own settings
 * live in, so a later seed keeps an earlier one's fields. */
function settingsSeed(body) {
  return `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    ${body}
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the app boots on its defaults. */ }`;
}

async function loadCourse(file) {
  const doc = JSON.parse(await readFile(isAbsolute(file) ? file : join(root, file), 'utf8'));
  if (!(doc.schemaVersion >= 4 && doc.map)) {
    throw new Error(`--course ${file} is not a track built in a world`);
  }
  return doc;
}

/*
 * The scripts that run before the first line of the app, through the same
 * storage the pilot uses rather than a test-only hook.
 */
async function buildSeeds(opts) {
  /* A capture is not a visit: the stats beacon would post to a board that
   * is not running, a refused connection is a console error, and the exit
   * code is the console's. The timing buffer is enlarged because verify's
   * map-isolation check counts modules from it: the default 250 entries
   * overflowed 15 times on an Alps boot plus a Swiss valley swap
   * (2026-09-28), so new shell modules read as valley modules missing. */
  const seeds = [
    `try { localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true })); } catch (e) { /* Storage refused: nothing to opt out of. */ }`,
    'performance.setResourceTimingBufferSize(100000);',
  ];
  let url = opts.url ?? '/index.html';
  /* Pinned like --w/--h pin the window: boot lowers a DETECTED preset to
   * Low on a CPU rasteriser, which headless Chrome always is, so a world's
   * cost would be measured at Low here and at High on a GPU machine.
   * graphicsAuto false is what marks the value as chosen. */
  if (opts.graphics) {
    seeds.push(settingsSeed(`s.graphics = ${JSON.stringify(String(opts.graphics))}; s.graphicsAuto = false;`));
  }
  if (opts.course) {
    const doc = await loadCourse(String(opts.course));
    const wing = Boolean(opts.airframe) && airframeById(String(opts.airframe)).fixedWing;
    const seat = wing ? 'webfpv.share.import.wing.v1' : 'webfpv.share.import.v1';
    const entry = { id: doc.id, name: doc.name, author: '', board: '', document: doc, local: true };
    seeds.push(settingsSeed(`localStorage.setItem(${JSON.stringify(seat)}, ${JSON.stringify(JSON.stringify(entry))}); s.map = 'track';`));
    /* The seat alone is not enough: a page that names no world opens on the
     * title's own valley (src/boot.js) and the track stays unbuilt until
     * Fly. A url that already names a map wins. */
    if (!/[?&]map=/.test(url)) {
      url += `${url.includes('?') ? '&' : '?'}map=track`;
    }
  }
  /* The first-run aircraft question is modal, so a capture past it would
   * photograph the question. Seated through the shell's own function from
   * the aircraft the shell starts on, so tune, pack, rates and camera come
   * along exactly as the pilot's own answer writes them. */
  if (opts.airframe) {
    const start = { airframe: 'interceptor', rates: airframeById('interceptor').rates };
    const fragment = seatAirframe(start, String(opts.airframe));
    seeds.push(settingsSeed(`Object.assign(s, ${JSON.stringify(fragment)}); s.airframeAsked = true;`));
  }
  return { seeds, url };
}

const SIDECAR_EXPR = `JSON.stringify({
  mode: window.__mode ?? null,
  screen: window.__screen ?? null,
  viewport: { w: innerWidth, h: innerHeight },
  nextGate: typeof window.__nextGate === 'function' ? window.__nextGate() : null,
  quad: typeof window.__quadScreen === 'function' ? window.__quadScreen() : null,
})`;

const fixed = (v, dp) => Number(v).toFixed(dp);

function targetLine(next) {
  const g = next.gates[0];
  let line = `  target: race gate ${next.raceNext} (scene ${g.sceneIndex}, plate ${g.flyOrder})`
    + ` at ${fixed(g.distance, 1)} m depth ${fixed(g.depth, 1)} m,`
    + ` screen ${fixed(g.screen.x, 0)},${fixed(g.screen.y, 0)}`;
  if (g.screen.mirrored) {
    line += ' MIRRORED, behind the camera';
  }
  line += g.centreInFrame ? ', centre in frame' : ', centre NOT in frame';
  line += g.aperturePx == null ? ', aperture refused' : `, aperture ${fixed(g.aperturePx, 1)} px`;
  line += `, glow sampled ${fixed(g.glowGainSampled, 2)}`;
  return line;
}

function parsePoint(arg) {
  const [id, x, y] = arg.split(',').map(Number);
  return { id, x, y };
}

/*
 * The interpreter: one handler per step kind, sharing the run's state.
 */
function makeRun(page, opts, out) {
  const { cdp, sessionId } = page;
  const send = (method, params) => cdp.send(method, params, sessionId);
  /* Harness faults are counted apart from console errors: one total for
   * both made "errors 0" two gates wearing one number, and D3 is about the
   * console. A failed until:/expect: is a console error, as it always has
   * been, because that is what the exit code and errors= count mean. */
  const faults = [];
  /* The protocol wants the WHOLE set of points that are down on every
   * touch event, so the set lives here. Undeclared, it once made every
   * touch step die with a ReferenceError the first time anyone used one. */
  const touches = new Map();
  const jpeg = Boolean(opts.jpeg);

  /* A tolerated CDP failure reads as no answer, but a dead socket is the
   * end of the run, not a falsy value to poll for twenty seconds. */
  async function tolerant(promise) {
    try {
      return await promise;
    } catch (e) {
      if (cdp.dead) {
        throw e;
      }
      return null;
    }
  }

  async function check(kind, expr, deadlineMs) {
    const deadline = Date.now() + deadlineMs;
    let value;
    for (;;) {
      const r = await tolerant(send('Runtime.evaluate', { expression: expr, returnByValue: true }));
      value = r && !r.exceptionDetails ? r.result.value : undefined;
      if (value) {
        console.log(`${kind} ${expr} ok`);
        return;
      }
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(POLL_MS);
    }
    const json = JSON.stringify(value);
    console.log(`  FAIL ${kind} ${expr} = ${json}`);
    page.errors.push(`${kind} failed: ${expr} was ${json}`);
  }

  /* Each capture records which gate the race wants and where it is on
   * screen, so a G3 measurement is taken against the real target rather
   * than whichever ring is bright. G3 stayed unsettled for a whole loop
   * for lack of this. */
  async function sidecar(name) {
    const r = await tolerant(send('Runtime.evaluate', { expression: SIDECAR_EXPR, returnByValue: true }));
    const text = r && !r.exceptionDetails ? r.result.value : undefined;
    if (typeof text !== 'string') {
      faults.push(`shot ${name}: the aim sidecar could not be evaluated`);
      return;
    }
    await writeFile(join(out, `${name}.json`), `${text}\n`);
    const next = JSON.parse(text).nextGate;
    if (next && Array.isArray(next.gates) && next.gates.length > 0) {
      console.log(targetLine(next));
      return;
    }
    /* A freestyle map has no gates and that is an answer. The opt-out is
     * the page's own report, never a flag: a flag can be passed on a raced
     * track by habit or by a copied command line, and a raced track can
     * never report itself gateless. */
    if (next && next.gateless === true) {
      console.log(`  target: none, ${next.mapId} is a ${next.mapMode} map with no gates`);
      return;
    }
    faults.push(`shot ${name}: window.__nextGate returned nothing, so the capture cannot support a G3 claim`);
  }

  async function touch(type) {
    await send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.values()] });
  }

  const mouse = (type, arg) => {
    const [x, y] = arg.split(',').map(Number);
    return send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };

  const handlers = {
    wait: (arg) => sleep(Number(arg)),
    /* PNG unless asked: a frame inspected for a rendering bug must not
     * carry compression artefacts. --jpeg is for the generators that ship
     * a frame into the repo, where a cel-shaded frame is four to six times
     * smaller. The extension follows the format, so no run can write a
     * JPEG named .png. */
    async shot(name) {
      const params = jpeg ? { format: 'jpeg', quality: opts.jpeg } : { format: 'png' };
      const { data } = await send('Page.captureScreenshot', params);
      const file = join(out, `${name}.${jpeg ? 'jpg' : 'png'}`);
      await writeFile(file, Buffer.from(data, 'base64'));
      console.log(`shot ${file}`);
      await sidecar(name);
    },
    async tap(code) {
      const info = keyInfo(code);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...info });
      await sleep(TAP_HOLD_MS);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...info });
    },
    down: (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', ...keyInfo(code) }),
    up: (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyInfo(code) }),
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        console.log(`eval ${expr} threw: ${JSON.stringify(d.exception ?? d.text)}`);
        return;
      }
      console.log(`eval ${expr} = ${JSON.stringify(r.result.value)}`);
    },
    until: (expr) => check('until', expr, UNTIL_MS),
    expect: (expr) => check('expect', expr, 0),
    tstart(arg) {
      const p = parsePoint(arg);
      touches.set(p.id, p);
      return touch('touchStart');
    },
    tmove(arg) {
      const p = parsePoint(arg);
      touches.set(p.id, p);
      return touch('touchMove');
    },
    tend(arg) {
      touches.delete(Number(arg));
      return touch('touchEnd');
    },
    async click(arg) {
      await mouse('mouseMoved', arg);
      await sleep(CLICK_PAUSE_MS);
      await mouse('mousePressed', arg);
      await mouse('mouseReleased', arg);
    },
    move: (arg) => mouse('mouseMoved', arg),
    /* For checking a loading screen against the case it exists for,
     * network-bound rather than CPU-bound. KNOWN LIMIT: CDN requests are
     * fulfilled from the local cache through the Fetch domain and never
     * touch the network stack, so this does not reach three.js. It reaches
     * what the local server answers: the page, dist/sim.wasm and the map
     * module graph (for the Swiss valley, 49 files of its own besides the
     * Alps modules it builds through). */
    async throttle(arg) {
      const kbps = Number(arg);
      await send('Network.enable', {});
      if (kbps > 0) {
        const bytes = (kbps * 1024) / 8;
        await send('Network.emulateNetworkConditions', {
          offline: false, latency: THROTTLE_LATENCY_MS, downloadThroughput: bytes, uploadThroughput: bytes,
        });
        console.log(`throttle ${kbps} kbps, ${THROTTLE_LATENCY_MS} ms latency`);
        return;
      }
      await send('Network.emulateNetworkConditions', {
        offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      });
      console.log('throttle off');
    },
  };

  async function step(text) {
    const at = text.indexOf(':');
    const kind = at < 0 ? null : text.slice(0, at);
    if (!Object.hasOwn(handlers, kind)) {
      throw new Error(`unknown step ${text}`);
    }
    await handlers[kind](text.slice(at + 1));
  }

  return { step, faults };
}

/* Console errors and warnings are collected through the whole run and
 * printed here, so the run that produces the frames also answers the
 * console gate. */
function report(page, faults) {
  console.log(`console errors=${page.errors.length} warnings=${page.warnings.length} harness faults=${faults.length}`);
  for (const f of faults) {
    console.log(`  FAULT ${f}`);
  }
  for (const e of page.errors) {
    console.log(`  ERR ${e}`);
  }
  for (const w of page.warnings) {
    console.log(`  WARN ${w}`);
  }
  return page.errors.length === 0 && faults.length === 0 ? 0 : 1;
}

async function main() {
  const { opts, steps } = parseArgs(process.argv.slice(2));
  /* An absolute --out is used as given. It was once pasted onto the repo
   * root, which is how scratch screenshots got committed under tmp/. */
  const out = resolve(root, String(opts.out ?? '.loop/shots'));
  await mkdir(out, { recursive: true });
  const { seeds, url } = await buildSeeds(opts);
  let page = null;
  try {
    page = await openPage({
      root,
      width: opts.w ?? 1600,
      height: opts.h ?? 900,
      url,
      touch: opts.touch !== undefined && opts.touch !== 0,
      seed: seeds,
    });
    const run = makeRun(page, opts, out);
    for (const text of steps) {
      await run.step(text);
    }
    const code = report(page, run.faults);
    await page.close();
    return code;
  } catch (e) {
    /* Closed on the failure path too: a step that threw once left Chromium
     * running, and three leaked SwiftShader Chromiums loaded the container
     * to 16 and failed an unrelated check. */
    if (page) {
      await page.close().catch(() => {});
    }
    throw e;
  }
}

try {
  process.exit(await main());
} catch (e) {
  process.stderr.write(`shots: ${e.message}\n`);
  process.exit(2);
}
