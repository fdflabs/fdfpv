import { readFileSync } from 'node:fs';
import { planeSim, rowOf, receiverOf, emulatedSim, AS3X } from './lib/as3xloop.js';
import { PROGRAMS, harrierFlight, kickIae } from './lib/harrierkick.js';
const src = readFileSync('src/native/plant_wing.c', 'utf8');
const [name, ...khs] = process.argv.slice(2);
const khRule = khs.map(Number);
const body = rowOf(src, name);
const rx = receiverOf(body);
const sim = await planeSim(AS3X[name].sim, 4.1);
const prog = PROGRAMS[AS3X[name].kick]();
const manual = prog.t11.kickStick.map((st) => { const rate = harrierFlight(sim, prog, 0, st).pKick; return { rate, m: kickIae(sim, prog, 0, rate) }; });
const ratios = (kh) => { const em = emulatedSim(sim, rx, [1, 1, 1], kh); return manual.map(({ rate, m }) => (kickIae(em, prog, 3, rate) / m).toFixed(3)).join(' '); };
console.log(name, 'zero', ratios([0, 0, 0]));
for (let ax = 0; ax < 3; ax++) {
  const row = [];
  for (const sc of [0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1]) row.push(`${sc}:${ratios([0, 1, 2].map((a) => (a === ax ? sc * khRule[a] : 0)))}`);
  console.log(name, 'axis', ax, row.join('  '));
}
