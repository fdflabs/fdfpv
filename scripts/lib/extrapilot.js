/*
 * extrapilot.js: the scripted pilots extra-owner.js and hover-video.js fly
 * the Extra with in the page, once a frame on __craftState(). PILOT(mode,
 * th) is the source to evaluate in the page; th is
 * tests/extra-thresholds.json.
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

/*
 * The pilot, in the page, once a frame. Three.js space: y is up. The body
 * axes are fwd (plant x), up (plant z) and left = up x fwd (plant y); the
 * rates are the plant's body rates, p right wing down, q nose down and r
 * nose left positive. Nose up stick is a negative q, right rudder a
 * negative r, right aileron a positive p.
 */
export const PILOT = (mode, th) => `
window.__T = { log: [], done: false };
(() => {
  const T = window.__T;
  const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const axes = (c) => ({ fwd: c.fwd, up: c.up, left: cross(c.up, c.fwd) });
  const pitchOf = (c) => Math.asin(clamp(c.fwd.y));
  const bankOf = (c) => { const a = axes(c); return Math.atan2(a.left.y, a.up.y); };
  const psiOf = (c) => Math.atan2(-c.fwd.z, c.fwd.x);
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  const alphaOf = (c) => { const a = axes(c); return Math.atan2(-dot(c.vel, a.up), dot(c.vel, a.fwd)); };
  const betaOf = (c) => { const a = axes(c); const v = Math.max(0.1, Math.hypot(c.vel.x, c.vel.y, c.vel.z)); return -dot(c.vel, a.left) / v; };
  const c0 = window.__craftState();
  const psi0 = psiOf(c0), y0 = c0.worldY;
  let phase = 'roll', tPhase = c0.simS, prevS = c0.simS, airS = 0;
  let iT = 0.6, iP = 0, iB = 0, iA = 0, iH = 0, hT = 0, psiT = 0;
  let sum = {};
  const acc = (k, v) => { sum[k] = (sum[k] || 0) + v; };
  const enter = (p, now) => { phase = p; tPhase = now; sum = {}; };
  /* Level at a height and a speed: the pitch from the height, the
   * throttle from the speed, the wings level, the heading held. */
  const level = (c, dt, vT) => {
    const pitchT = clamp(0.03 * (hT - c.worldY) - 0.05 * c.vel.y, -0.3, 0.3);
    const pitch = clamp(1.5 * (pitchT - pitchOf(c)) + 0.15 * c.rates.q);
    const roll = clamp(-0.6 * bankOf(c) - 0.06 * c.rates.p);
    const yaw = clamp(1.0 * wrap(psiOf(c) - psiT) + 0.2 * c.rates.r);
    iT = clamp(iT + 0.05 * (vT - c.speed) * dt, 0, 1);
    return [roll, pitch, yaw, clamp(iT + 0.1 * (vT - c.speed), 0, 1)];
  };
  /* The throttle that holds the height, extra-gates.js heightHold per second. */
  const hold = (c, dt) => {
    const vz = clamp(0.5 * (hT - c.worldY), -2, 2) - c.vel.y;
    iT = clamp(iT + 0.2 * vz * dt, 0, 1);
    return clamp(iT + 0.08 * vz, 0, 1);
  };
  /* extra-gates.js hangSticks: the nose onto world up on the elevator and
   * the rudder, the error taken into the body's axes. Its gains, 10 and
   * 0.8, close at the plant's 250 Hz; once a frame, 17 to 50 ms of the
   * plant's time, they ring, so the page's are lower, with an integral
   * as a pilot's hands find the stick that holds it. The integral is kept
   * in the world's axes and read into the body's each frame, so it turns
   * with the airframe through a torque roll rather than trimming the
   * elevator for where the rudder was a quarter turn ago. */
  const KP = 5, KR = 0.3, KI = 1.5;
  /* The person: hover-probe.js's limits and one of its pilots. */
  const LAG = 0.2, EVERY = 0.1, SETTLE = 3, H = '${mode}'.startsWith('video')
    /* The video runs' person flies each mode with the gains that hold it
     * steadiest in hover-probe's grid, as a pilot settles into an
     * aircraft: gentle on the gyro, firmer in Manual. */
    ? ('${mode}'.includes('as3x') ? { kp: 0.2, kd: 0.1, kr: 0.1, kv: 0.1, kt: 0.05 } : { kp: 0.4, kd: 0.2, kr: 0.3, kv: 0.2, kt: 0.05 })
    : { kp: 1, kd: 0.2, kr: 0.1, kv: 0.3, kt: 0.1 };
  const Y = { x: 0, y: 1, z: 0 };
  const q = (x) => clamp(Math.round(x * 50) / 50);
  const seen = [];
  let lastAct = -1, base = 0.6, trim = 0, hs = [0, 0, 0, 0.6];
  const iW = { x: 0, y: 0, z: 0 };
  const hang = (c, rollStick, rollRate, dt) => {
    const a = axes(c);
    const cw = cross(c.fwd, { x: 0, y: 1, z: 0 });
    const e1 = dot(cw, a.left), e2 = dot(cw, a.up);
    for (const k of ['x', 'y', 'z']) iW[k] = clamp(iW[k] - KI * cw[k] * dt, -0.8, 0.8);
    const pitch = clamp(-KR * (KP * e1 - c.rates.q) + dot(iW, a.left));
    const yaw = clamp(-KR * (KP * e2 - c.rates.r) + dot(iW, a.up));
    const roll = rollRate == null ? rollStick : clamp(0.5 * (rollRate - c.rates.p));
    return [roll, pitch, yaw];
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd || !c.vel || !c.rates) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const t = now - tPhase;
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      /* extra-gates.js extraTakeoffSticks: the tail up and off at 10 m/s. */
      const pitchT = (c.speed < 5 ? 6 : (c.speed < 10 ? 2 : 8)) * Math.PI / 180;
      s = [clamp(-0.6 * bankOf(c) - 0.06 * c.rates.p), clamp(1.5 * (pitchT - pitchOf(c)) + 0.12 * c.rates.q), clamp(1.5 * wrap(psiOf(c) - psi0) + 0.2 * c.rates.r), 1];
      airS = c.groundClearance < 0.5 ? 0 : airS + dt;
      if (airS > 1) { T.lift = { speed: +c.speed.toFixed(2) }; hT = y0 + 80; psiT = psi0; iT = 0.8; enter('climb', now); }
      if (t > 30) phase = 'end';
    } else if (phase === 'climb') {
      s = level(c, dt, 16);
      if (Math.abs(c.worldY - hT) < 3 && t > 8) enter('${mode}' === 'hang' || '${mode}'.startsWith('human') || '${mode}'.startsWith('video') ? 'pull' : 'settle', now);
      if (t > 60) phase = 'end';
    } else if (phase === 'settle') {
      const vT = '${mode}' === 'harrier' ? 12 : ${th.e12_knife_edge.speed};
      s = level(c, dt, vT);
      if (t > 8) { iT = '${mode}' === 'harrier' ? 0.55 : iT; iP = 0; iB = 0; iA = 0; iH = 0; hT = c.worldY; psiT = psiOf(c); enter('${mode}', now); }
    } else if (phase === 'pull') {
      /* Up to the vertical at full throttle, then hanging. */
      const human = '${mode}'.startsWith('human') || '${mode}'.startsWith('video');
      /* The person takes over hanging on the prop, not mid zoom: up at
       * full throttle, then held vertical at half while the climb dies. */
      const up = pitchOf(c) > 1.3;
      s = [...hang(c, 0, 0, dt), human && (up || T.up) ? 0.5 : 1];
      if (up) T.up = true;
      if (up && (!human || c.vel.y < 3)) { hT = c.worldY; iT = 0.62; enter(human ? 'human' : 'hover', now); }
      if (t > 10) phase = 'end';
    } else if (phase === 'hover') {
      const thr = hold(c, dt);
      s = [...hang(c, 0, 0, dt), thr];
      if (t > 8) { acc('thr', thr); acc('n', 1); T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY); }
      if (t > 12) { T.hover = { thr: sum.thr / sum.n, drift: T.yMax - T.yMin, nose: pitchOf(c) * 180 / Math.PI }; enter('torque', now); }
    } else if (phase === 'torque') {
      s = [...hang(c, 0, null, dt), hold(c, dt)];
      if (t > 3) { acc('p', c.rates.p); acc('n', 1); }
      if (t > 6) { T.torque = { p: sum.p / sum.n * 180 / Math.PI, nose: pitchOf(c) * 180 / Math.PI }; phase = 'end'; }
    } else if (phase === 'human') {
      /* What the pilot sees, kept by the plant's clock; it acts on the
       * sample LAG old, every EVERY of the plant's time. */
      seen.push({ t: now, ep: dot(Y, axes(c).up), ey: dot(Y, axes(c).left), p: c.rates.p, vz: c.vel.y, h: c.worldY - hT,
        lu: c.up.x * c.vel.x + c.up.z * c.vel.z, ll: axes(c).left.x * c.vel.x + axes(c).left.z * c.vel.z });
      const off = Math.acos(clamp(c.fwd.y)) * 180 / Math.PI;
      if (T.heldS === undefined) { T.heldS = SETTLE; T.worst = 0; T.bearing = []; }
      /* The height is judged from where the person has caught it, not
       * from the hand over mid climb. */
      if (t >= SETTLE && T.hJudge === undefined) { T.hJudge = c.worldY; hT = c.worldY; }
      if (t >= SETTLE && T.heldS >= t - 0.05 && off < 20 && Math.abs(c.worldY - T.hJudge) < 10) {
        T.heldS = t;
        T.worst = Math.max(T.worst, off);
        T.bearing.push(Math.atan2(c.camera.z - c.worldZ, c.camera.x - c.worldX));
      }
      if (t - lastAct >= EVERY) {
        lastAct = t;
        const d = [...seen].reverse().find((x) => x.t <= now - LAG);
        const was = d && [...seen].reverse().find((x) => x.t <= d.t - 0.1);
        if (d && was) {
          const dt2 = d.t - was.t;
          base = Math.max(0, clamp(base - EVERY * (0.05 * d.h + 0.1 * d.vz)));
          /* The video's way (3D-VIDEO-LESSONS 5b): the ailerons keep the
           * torque roll at a slow 75 deg/s to the left, not at nothing. */
          const pT = '${mode}'.startsWith('video') ? -75 * Math.PI / 180 : 0;
          /* On the gyro the person leaves the torque to its heading term and
           * trims nothing; in Manual they learn to hold it on the stick. */
          trim = '${mode}'.includes('as3x') ? 0 : clamp(trim - 0.3 * EVERY * (d.p - pT));
          const lean = (v) => clamp(H.kv * v, -0.3, 0.3);
          hs = [q(trim - H.kr * (d.p - pT)), q(H.kp * (d.ep - lean(d.lu)) + H.kd * (d.ep - was.ep) / dt2),
            q(-H.kp * (d.ey - lean(d.ll)) - H.kd * (d.ey - was.ey) / dt2), Math.max(0, q(base - H.kt * d.vz))];
        }
      }
      s = hs;
      (T.sticks = T.sticks || []).push([+t.toFixed(3), ...hs, +(c.rates.p * 180 / Math.PI).toFixed(1), +off.toFixed(1)]);
      if (t > SETTLE + 10) {
        let swing = 0;
        const b0 = T.bearing[0] ?? 0;
        let path = 0;
        for (let i = 0; i < T.bearing.length; i += 1) {
          swing = Math.max(swing, Math.abs(wrap(T.bearing[i] - b0)));
          if (i > 0) path += Math.abs(wrap(T.bearing[i] - T.bearing[i - 1]));
        }
        T.path = path * 180 / Math.PI;
        T.human = { held: T.heldS - SETTLE, worst: T.worst, swing: swing * 180 / Math.PI, path: T.path, thr: hs[3] };
        phase = 'end';
      }
    } else if (phase === 'harrier') {
      const target = ${th.e11_harrier.alphaDeg} * Math.PI / 180;
      const alpha = alphaOf(c), bank = bankOf(c);
      const at = Math.min(target, 0.1 + target * t / 5);
      iP = clamp(iP + 1.5 * (at - alpha) * dt);
      iB = clamp(iB - 1.0 * bank * dt, -0.5, 0.5);
      const pitch = clamp(1.5 * (at - alpha) + 0.15 * c.rates.q + iP);
      const thr = hold(c, dt);
      s = [clamp(-0.6 * bank - 0.06 * c.rates.p + iB), pitch, clamp(1.0 * wrap(psiOf(c) - psiT) + 0.2 * c.rates.r), thr];
      if (t > 15) {
        acc('v', c.speed); acc('thr', thr); acc('e', pitch); acc('a', alpha); acc('n', 1);
        T.bank = Math.max(T.bank ?? 0, Math.abs(bank) * 180 / Math.PI);
        T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY);
      }
      if (t > 20) { T.harrier = { v: sum.v / sum.n, thr: sum.thr / sum.n, e: sum.e / sum.n, alpha: sum.a / sum.n * 180 / Math.PI, bank: T.bank, drift: T.yMax - T.yMin }; phase = 'end'; }
    } else if (phase === 'knife') {
      const vT = ${th.e12_knife_edge.speed};
      const bank = bankOf(c), bankT = Math.min(Math.PI / 2, t * 3);
      iA = clamp(iA - 1.0 * (bank - bankT) * dt, -0.5, 0.5);
      const roll = clamp(-0.8 * (bank - bankT) - 0.05 * c.rates.p + iA);
      const vz = clamp(0.3 * (hT - c.worldY), -2, 2) - c.vel.y;
      iH = clamp(iH + 0.2 * vz * dt, -0.3, 0.9);
      const betaT = 0.3 + 0.2 * vz + iH;
      const beta = betaOf(c);
      iB = clamp(iB + 3 * (betaT - beta) * dt);
      const yaw = t < 0.3 ? 0 : clamp(-3 * (betaT - beta) - iB + 0.3 * c.rates.r);
      const pitch = clamp(0.8 * wrap(psiOf(c) - psiT) + 0.15 * c.rates.q);
      iT = clamp(iT + 0.125 * (vT - c.speed) * dt, 0, 1);
      const thr = clamp(iT + 0.1 * (vT - c.speed), 0, 1);
      s = [roll, pitch, yaw, thr];
      if (t > 10) {
        acc('b', beta); acc('thr', thr); acc('r', yaw); acc('n', 1);
        T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY);
        T.bankOff = Math.max(T.bankOff ?? 0, Math.abs(bank * 180 / Math.PI - 90));
      }
      if (t > 15) { T.knife = { beta: sum.b / sum.n * 180 / Math.PI, thr: sum.thr / sum.n, r: sum.r / sum.n, bankOff: T.bankOff, drift: T.yMax - T.yMin }; phase = 'end'; }
    }
    if (c.crashed) phase = 'end';
    if (phase === 'end') {
      T.done = true;
      T.res = { lift: T.lift, crashed: c.crashed, hover: T.hover, human: T.human, torque: T.torque, harrier: T.harrier, knife: T.knife, at: T.at };
      window.__stick(0, 0, 0, 0);
      return;
    }
    T.at = phase;
    if (now - (T.lastLog ?? -1) > 0.5) { T.lastLog = now; T.log.push([phase, +t.toFixed(2), +dt.toFixed(4), +(c.worldY - y0).toFixed(1), +c.vel.y.toFixed(2), +c.speed.toFixed(1), +(pitchOf(c) * 57.3).toFixed(0), +(c.rates.p * 57.3).toFixed(0), ...s.map((x) => +x.toFixed(2))]); }
    window.__stick(...s);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;
