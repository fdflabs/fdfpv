/*
 * music.js: encode the music crate for the wire (npm run gen:music).
 *
 * The masters are mp3s at a mastering bitrate, around 189 kbps VBR and
 * 5.75 MB each, and on an ordinary connection the first record fights the
 * map load exactly when the player wants to fly. Every record of both
 * crates in src/render/tracks.js, flight then menu, is written to
 * assets/music/<id>.webm (Opus 80 kbps VBR, what almost everyone gets) and
 * assets/music/<id>.mp3 (LAME V7, about 110 kbps VBR, the fallback).
 *
 * Two formats because Opus at 80 kbps is about half the bytes of the
 * smallest shippable mp3 and loses nothing measurable to 17 kHz, but Safari
 * before 14.1 (desktop) and 17.4 (phone) cannot open WebM; src/render/music.js
 * asks canPlayType and drops the session to mp3 when a WebM fails to load.
 * 80 kbps is margin: at 72 Opus already holds every octave to 17 kHz within
 * 0.3 dB of the master (PROGRESS.md has the numbers). V7 rather than V6 costs
 * 1.2 dB at 16 kHz on the densest record and saves another 11 percent; only
 * browsers too old for WebM ever fetch it, likelier old phones on mobile
 * data, and Opus at 80 holds 16 kHz within 1.0 dB where V6 loses 2.9 and V7
 * 4.1, in a third fewer bytes.
 *
 * No loudness processing at all, no limiter, loudnorm or gain: the mix in
 * src/render/audio.js is balanced against the records as mastered. Each
 * output must hold integrated loudness within 0.5 LU of its master, tight
 * enough to catch a stray filter and loose enough for the gate's block
 * quantisation across two codecs. True peak is reported, never gated: some
 * masters already clip and a codec cannot un-clip them.
 *
 * Masters live in assets/music-src by default, which is NOT in the
 * repository. Nine of the fourteen flight masters can be recovered as they
 * stood at commit f9e0804, for example
 *   git show f9e0804:"assets/music/Tarmac Pulse.mp3" > out.mp3
 * The other five (Driving Tension, Gritty Breakbeats, Hypnotic Acid Loop,
 * Prop Wash, Ground Effect, which arrived 2026-09-17 at 4.2 to 5.9 MB) and
 * both menu masters ('Neon Gate.mp3' 5.5 MB, 'Neon Gate take 2.mp3' 7.1 MB)
 * were only ever in the repository as encoded output. All seven are 48 kHz
 * stereo mp3 at 177 to 195 kbps with cover art, and any of them needed again
 * must be supplied again: worth knowing before bumping MUSIC_REV expecting
 * a free re-encode.
 *
 * Needs ffmpeg (with libopus and libmp3lame) and ffprobe on PATH, the way
 * scripts/build-wasm.sh needs emcc. It is not an npm dependency and the
 * page never needs it, because the output is committed.
 *
 * Usage: node scripts/music.js [--src=DIR] [--only=id] [--dry]
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

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKS, MENU_TRACKS } from '../src/render/tracks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'assets', 'music');

const LUFS_TOLERANCE = 0.5;
const SECONDS_TOLERANCE = 0.5;
/*
 * A master that already clips stays clipped: Neon Horizon is +0.6 dBFS true
 * peak, its Opus +1.4 and its mp3 +0.5. The bus runs at 0.5 x MUSIC_BUS, so
 * +1.4 dBFS lands about 10 dB below full scale. Move MUSIC_BUS and read the
 * notes again.
 */
const PEAK_NOTE_DB = 1.0;

const MASTER = /\.(mp3|wav|flac|m4a|aiff?|ogg|opus)$/i;

/*
 * +bitexact on demuxer, encoder and muxer: without it Matroska writes a
 * random SegmentUID and the libavformat version, so two encodes of one
 * master differ and a re-encode becomes a 30 MB unreviewable diff.
 * -map_metadata -1 because an ID3 frame on a bed nobody tags is bytes on the
 * wire and a tool name in a public deploy; -vn because masters with cover
 * art would carry the jpeg into both outputs. 48 kHz on the mp3 too, so it
 * is a codec change and not also a resample, and both measure against the
 * master on one grid. -write_xing 1 so the element knows a VBR mp3's
 * duration from its first frame. The argument order is part of the
 * contract: it keeps the output byte identical to the committed files.
 */
const ENCODINGS = [
  ['webm', ['-c:a', 'libopus', '-b:a', '80k', '-vbr', 'on', '-compression_level', '10', '-application', 'audio']],
  ['mp3', ['-c:a', 'libmp3lame', '-q:a', '7', '-write_xing', '1']],
];

function encodeArgs(master, codec, file) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', master,
    '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', '48000',
    ...codec,
    '-fflags', '+bitexact', '-flags:a', '+bitexact', file,
  ];
}

function ffmpeg(args) {
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`ffmpeg failed: ${args.join(' ')}\n${run.stderr || ''}`);
  }
  return run.stderr;
}

const runs = (tool) => spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0;

/*
 * ebur128 prints a running I: every frame and the first is -70 LUFS, the
 * silence gate, so a regex over the whole log compares -70 with -70 and
 * passes anything. That bug was real once: only the block after the last
 * Summary: counts. Duration comes from ffprobe, not file size, because a
 * VBR file's length is not its duration.
 */
function measure(file) {
  const log = ffmpeg(['-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const at = log.lastIndexOf('Summary:');
  const summary = at < 0 ? '' : log.slice(at);
  const figure = (re) => {
    const m = summary.match(re);
    return m ? Number(m[1]) : NaN;
  };
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  return {
    lufs: figure(/I:\s*(-?[\d.]+)\s*LUFS/),
    peak: figure(/Peak:\s*(-?[\d.]+)\s*dBFS/),
    seconds: probe.status === 0 ? Number(probe.stdout.trim()) : NaN,
    bytes: statSync(file).size,
  };
}

/* 'Neon Gate take 2.mp3' -> 'neon-gate-take-2': the id is the file name,
 * so there is no lookup table to fall out of step. */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

const argv = process.argv.slice(2);
const valueOf = (prefix) => argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
const src = valueOf('--src=') ?? join(root, 'assets', 'music-src');
const only = valueOf('--only=');
const dry = argv.includes('--dry');

if (!runs('ffmpeg') || !runs('ffprobe')) {
  console.error('music: ffmpeg and ffprobe are not both on PATH. See the header of this file.');
  process.exit(1);
}
if (!existsSync(src)) {
  console.error(`music: no master directory at ${src}. See the header of this file.`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const masters = new Map();
for (const name of readdirSync(src)) {
  if (MASTER.test(name)) {
    masters.set(slug(name), join(src, name));
  }
}

const work = [...TRACKS, ...MENU_TRACKS].filter((t) => only === undefined || t.id === only);
if (work.length === 0) {
  console.error(`music: no track matches --only=${only}`);
  process.exit(1);
}

const MB = (bytes, places) => (bytes / 1048576).toFixed(places);
const failures = [];
const total = { in: 0, webm: 0, mp3: 0 };

for (const { id } of work) {
  const master = masters.get(id);
  if (!master) {
    failures.push(`${id}: no master in ${src} whose name slugs to ${id}`);
    continue;
  }
  const before = measure(master);
  total.in += before.bytes;
  if (dry) {
    console.log(`${id.padEnd(24)} would encode from ${basename(master)}`);
    continue;
  }
  const after = ENCODINGS.map(([label, codec]) => {
    const file = join(out, `${id}.${label}`);
    ffmpeg(encodeArgs(master, codec, file));
    return [label, file];
  }).map(([label, file]) => {
    const m = measure(file);
    total[label] += m.bytes;
    return [label, m];
  });
  for (const [label, m] of after) {
    if (!Number.isFinite(m.lufs) || Math.abs(m.lufs - before.lufs) > LUFS_TOLERANCE) {
      failures.push(`${id} ${label}: ${m.lufs} LUFS against the master's ${before.lufs}`);
    }
    if (!Number.isFinite(m.seconds) || Math.abs(m.seconds - before.seconds) > SECONDS_TOLERANCE) {
      failures.push(`${id} ${label}: ${m.seconds} s against the master's ${before.seconds}`);
    }
  }
  const [[, a], [, b]] = after;
  console.log(`${id.padEnd(24)} ${MB(before.bytes, 2)} MB -> webm ${MB(a.bytes, 2)} MB, mp3 ${MB(b.bytes, 2)} MB  (${before.seconds.toFixed(0)} s, ${before.lufs} LUFS)`);
  for (const [label, m] of after) {
    if (m.peak > 0 && m.peak - before.peak > PEAK_NOTE_DB) {
      console.log(`  note ${label} true peak ${m.peak} dBFS against the master's ${before.peak}. Not a failure, see PEAK_NOTE_DB.`);
    }
  }
}

if (!dry) {
  const share = (bytes) => (bytes / total.in * 100).toFixed(0);
  console.log(`\ncrate ${MB(total.in, 1)} MB -> ${MB(total.webm, 1)} MB webm + ${MB(total.mp3, 1)} MB mp3  (a visitor pays one of the two: ${share(total.webm)}% of the old bytes on Opus, ${share(total.mp3)}% on the fallback)`);
}

if (failures.length > 0) {
  console.error('\nmusic: FAILED');
  for (const f of failures) {
    console.error(`  ${f}`);
  }
  process.exit(1);
}
