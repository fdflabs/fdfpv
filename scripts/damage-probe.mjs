import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS, waveTarget } from '../src/share/war/missions/index.js';
import { blast, attackerCharge } from '../src/share/war/damage.js';
import S from '../src/share/war/itaipu-chunks.js';

const seen = new Map();
for (const m of Object.values(MISSIONS)) {
  for (const w of m.waves) {
    if (!w.target) continue;
    const n = Array.isArray(w.target) ? w.target.length : 1;
    for (let k = 0; k < n; k += 1) {
      const target = waveTarget(w, k);
      if (!S[target]) continue;
      const key = `${w.kind} ${target.split('-')[0]} ${w.route}`;
      if (seen.has(key)) continue;
      const plan = planAgent(m, { id: 1, kind: w.kind, route: w.route, t0: 0, k: 0, n: 1, err: 0, target });
      const p = poseAt(plan, plan.tEnd).p;
      const wreck = {};
      let hits = 0;
      let opened = null;
      const log = [];
      while (hits < 30 && !opened) {
        hits += 1;
        for (const r of blast({ [target]: S[target] }, wreck, p, attackerCharge(w.kind), hits)) {
          log.push(`${hits}:${r.chunks.length}${r.fell.length ? `(fell ${r.fell.length})` : ''}`);
          if (r.openings.length || r.down) opened = r;
        }
      }
      seen.set(key, `${hits} hits  ${log.join(' ')}  ${opened ? JSON.stringify(opened.openings[0] ?? {}).slice(0, 140) : ''}`);
      console.log(key.padEnd(40), seen.get(key), 'p', p.map((v) => v.toFixed(1)).join(','));
    }
  }
}
