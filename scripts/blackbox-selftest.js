/*
 * blackbox-selftest.js: the blackbox_decode CSV reader (tests/lib/blackbox.js)
 * pinned as a transcript.
 *
 *     node scripts/blackbox-selftest.js [--dump=<file>]   (npm run blackbox:selftest)
 *
 * Logs written by hand to cover what decoders vary on and what the reader
 * decides: comment lines before the header, quoted names with embedded
 * quotes, the column spellings of different decoder versions, a filtered
 * gyro and a GYRO_SCALED debug trace, DShot and PWM motor ranges, no
 * motors or pack voltage, short and blank rows, CRLF line ends, and every
 * refusal. Each parse is recorded with every number by its bits. Pinned
 * by digest (scripts/lib/transcript.js) on the reader before its rewrite.
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

import { parseBlackboxCsv, toBlackboxCsv } from '../tests/lib/blackbox.js';
import { toBlackboxCsv as writerItself } from '../src/share/flightlog.js';
import { seeded, transcript } from './lib/transcript.js';

const PINNED = 'd1237669b00539c1fda1ee54bdd5e8f967159841f6a214fd1a714e9c56cc4cf0';
const t = transcript();
const rand = seeded(9);

t.note('the writer is re-exported as it is', toBlackboxCsv === writerItself);

const row = (cells) => cells.join(', ');
const LOGS = {
  'the writer\'s own output': toBlackboxCsv(Array.from({ length: 6 }, (_, i) => ({
    tUs: 1000 + i * 4000.4, rc: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand()], gyroDps: [rand() * 900, -rand() * 900, rand()], motor: [0.1, 0.5, 0.9, 1], vbat: 16 - i * 0.1,
  }))),
  'comments, then quoted names with an embedded quote': [
    'H Product:Blackbox flight data recorder', '# a comment',
    '"loopIteration","time (us)","rcCommand[0]","rcCommand[1]","rcCommand[2]","rcCommand[3]","gyroADC[0]","gyroADC[1]","gyroADC[2]","motor[0]","motor[1]","motor[2]","motor[3]","vbatLatest (V)","odd ""name"", here"',
    row([0, 500000, 250, -125, 0, 1500, 10.5, -3.25, 0.5, 1100, 1200, 1300, 1400, 16.4, 7]),
    row([1, 502000, -500, 500, 500, 2000, 1, 2, 3, 1000, 2000, 1500, 1500, 16.3, 8]),
  ].join('\n'),
  'an older decoder\'s spellings, DShot motors, CRLF': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],gyroADCs[0],gyroADCs[1],gyroADCs[2],motor[0],motor[1],motor[2],motor[3],vbat',
    '100,0,0,0,1000,0,0,0,48,100,2047,0,15.0',
    '125,10,20,30,1250,4,5,6,60,120,1500,10,14.9',
    '',
    '150,1,2,3,1100,7,8,9',
    '175,1,2,3,1100,7,8,9,1,2,3,4,14.8',
  ].join('\r\n'),
  'a GYRO_SCALED trace and no filtered gyro': [
    'time (us),rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],debug[0],debug[1],debug[2],debug[3]',
    '0,0,0,0,1500,11,12,13,99',
    '1000,0,0,0,1500,21,22,23,99',
  ].join('\n'),
  'both gyros: the filtered one is read, the debug noted': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],gyroADC[0],gyroADC[1],gyroADC[2],debug[0],debug[1],debug[2]',
    '0,0,0,0,1500,1,2,3,4,5,6',
    '2000,0,0,0,1500,7,8,9,10,11,12',
  ].join('\n'),
  'no gyro, no motors, no pack': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3]',
    '10,1,2,3,1001',
  ].join('\n'),
  'motors that never report a number': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],motor[0],motor[1],motor[2],motor[3]',
    '0,0,0,0,1500,x,y,z,w',
    '5,0,0,0,1500,,,,',
  ].join('\n'),
  'a PWM range edge: 900 to 2100': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],motor[0],motor[1],motor[2],motor[3]',
    '0,0,0,0,1500,900,1000,2000,2100',
  ].join('\n'),
  'just past it: 899': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3],motor[0],motor[1],motor[2],motor[3]',
    '0,0,0,0,1500,899,1000,2000,2100',
  ].join('\n'),
  'a header line that only mentions time later': [
    'Field I name,looptime',
    'iteration, time, rcCommand[0], rcCommand[1], rcCommand[2], rcCommand[3]',
    '1, 5, 0, 0, 0, 1000',
  ].join('\n'),
  'non numbers in data': [
    'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3]',
    'a,b,c,d,e',
    '7,1,1,1,1100',
  ].join('\n'),
  'no header': 'loop,rcCommand[0]\n1,2',
  'a header whose time is not a column': '"timestamp",x\n1,2',
  'a missing rcCommand': 'time,rcCommand[0],rcCommand[1],rcCommand[2]\n1,2,3,4',
  'a header and no rows': 'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3]\n\n  \n',
  'rows all short': 'time,rcCommand[0],rcCommand[1],rcCommand[2],rcCommand[3]\n1,2,3',
};

const bitsOf = (v) => {
  if (typeof v !== 'number') return v;
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v);
  return `${v}|${b.getBigUint64(0).toString(16)}`;
};
const deep = (v) => (Array.isArray(v) ? v.map(deep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : bitsOf(v));

for (const [label, text] of Object.entries(LOGS)) {
  t.rec(label, () => deep(parseBlackboxCsv(text)));
}
t.rec('a number, not text', () => parseBlackboxCsv(12345));
t.rec('nothing', () => parseBlackboxCsv(''));
t.rec('round trip of the writer\'s output keeps the sticks', () => {
  const parsed = parseBlackboxCsv(LOGS['the writer\'s own output']);
  return parsed.rows.map((r) => r.rc.map((x) => Math.round(x * 1e9) / 1e9));
});

t.finish('blackbox.js', PINNED);
