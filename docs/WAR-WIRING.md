# The war client in src/main.js: what to call, and where

Package C (docs/WARFARE-PLAN.md section 5.2) built the client's three
modules and left `src/main.js` to the lead. This is every call main.js
makes, at the place it goes, against `main` with #197 (the room) merged.
Line numbers are from this branch merged with `main` at 570722ed and will
drift; the function named beside each is the anchor.

`scripts/war-twopage-wire.js` is the same wiring outside main.js, for the
two page check; where the two differ, this file is the one to follow
(the check has no plant, so it leaves out steps 7 to 10).

## 1. Imports

Beside the other room imports (`createRoomTag`, line 95; `createRoomCombat`,
line 113):

```js
import { createRoomWar } from './share/roomwar.js';
import { createAttackers } from './render/attackers.js';
import { createWarHud } from './ui/warhud.js';
```

Once #196 (src/game/signal.js) is in, from it: `signalQuality`,
`stationPoint`, `snowFor`, `linkDegradeFor`, `LinkWatch`.

## 2. Construction

Next to `const roomTag = createRoomTag(...)` (line 1958), before
`createRoomLink`, since the handlers close over it:

```js
/* Defend Itaipu (src/share/roomwar.js), wired below at DEFEND ITAIPU. */
const roomWar = createRoomWar((obj) => roomLinkState.send(obj));
```

After `const debris = createDebris()` (line 5893), since it takes the
debris, and where `groundAt` is in scope:

```js
const warAttackers = createAttackers({ debris, floorAt: (x, z) => groundAt(x, z) });
shell.keepAcrossMaps(warAttackers.group);
const warHud = createWarHud(roomSeatName);
```

`warAttackers.group` goes into the scene the way `debris.group` does at
`roomHit` (line 2693): `if (scene && warAttackers.group.parent !== scene)
scene.add(warAttackers.group)` once a frame in step 5.

## 3. The room link's handlers (`createRoomLink({ ... })`, line 1959)

- `onWelcome` (line 1960): add `roomWar.onWelcome(w);` after
  `roomTag.onWelcome(w);`. The welcome carries `war` (edge/rooms/core.js
  hello, `...this.war.welcome(this)`), and a pilot seated mid game gets
  every live attacker as a `born` right after it (war.js `join`).
- `onMessage` (line 2032): chain it after tag's, so the line reads

  ```js
  if (roomRace.onMessage(m) || roomTag.onMessage(m) || roomWar.onMessage(m)) {
    ui.refreshFriends();
  }
  ```

- `onBinary` (line 2046): first, before combat's, since AGENTS is the one
  binary the war sends and it comes 30 times a second:

  ```js
  if (roomWar.onBinary(bytes) || roomCombat.onBinary(bytes)) {
    return;
  }
  ```

- `onState` (line 2059), in the `idle`/`failed` branch beside
  `roomTag.clear()`:

  ```js
  roomWar.clear();
  warAttackers.clear();
  warHud.update(null);
  ```

## 4. The frame: `roomFrame(wallMs, dt)` (line 2417)

After `roomTagFrame(now, wallMs);` (line 2441), where `now` is the room
clock, a call to a new `roomWarFrame(now, wallMs, dt)` beside
`roomTagFrame` (line 3449):

```js
let warHudAt = 0;
function roomWarFrame(now, wallMs, dt) {
  const scene = shell.quad.parent;
  if (scene && warAttackers.group.parent !== scene) {
    scene.add(warAttackers.group);
  }
  for (const ev of roomWar.takeEvents()) {
    if (ev.type === 'dead') {
      warAttackers.dead(ev);
    } else if (ev.type === 'boom') {
      warAttackers.boom(ev.p);
      if (ev.mine) {
        warBoomMine(ev);            /* step 8 */
      }
    } else if (ev.type === 'state') {
      warDamage(ev.to);             /* step 7 */
    }
    warHud.events([ev]);
  }
  warAttackers.update(roomWar.attackersAt(now), dt);
  if (wallMs < warHudAt) {
    return;
  }
  warHudAt = wallMs + 250;
  const m = roomWar.mission();
  warHud.update(mode === 'flight' && ui.screen === 'flight' ? roomWar.view() : null,
    roomWar.seat(), now, warSignal, m ? m.output : 0);
}
```

`roomFrame` returns early while the link is not open, so the attackers
stop with it; `onState` clears them (step 3). Every attacker is drawn at
`now`: a scripted one is computed there exactly, and a hunter is
interpolated between its AGENTS samples or carried on from the newest for
at most 250 ms (src/game/peer.js EXTRAP_MAX_MS), which covers the near
interest band's 33 ms and a network's lag. A far hunter (1 Hz past
1.5 km) steps; it is under a pixel there.

`roomFrame` runs after the aircraft is posed (its own comment), so the
attackers are posed before the render like the peers.

## 5. The HUD

`warHud.update(view, me, roomNow, signal, full)` as in step 4, a few times a
second. `signal` is `{ q, snow, degraded, lost }` from step 9, or null to
hide the bar; `full` is the mission's output at the go. Hide it off the
flight screen by passing null, as tag's HUD does.

## 6. The host's menu

Out of this package: the war's row in the host's game menu (section 9:
private rooms on the Itaipu map only; a first time consent screen) calls
`roomWar.start('itaipu-1')` and `roomWar.end()`. `roomWar.error()` holds
the room's refusal (`'private'`, `'busy'`, `'map'`, `'mission'`), and core.js
refuses a public room's start with `{ type: 'refused', why: 'private' }`,
which `roomRefused` (onMessage) already shows.

## 7. Damage mode on for the war (section 6.3)

`applyCrashMode(s)` (line 6060) sets the run's damage mode from
`s.crashDamage` between runs. During a war it must be on whatever the
setting says, and the setting must come back after:

```js
/* Between runs: a war forces damage on (WARFARE-PLAN 6.3). */
const want = damage.available && (s.crashDamage !== false || roomWar.on());
```

and in `warDamage(to)` (step 4), on `to === 'live'` or `'countdown'` and on
the end states, call `applyCrashMode(ui.settings)` so it takes effect now.
The pilot's own `crashDamage` setting is never written, so it is the
pilot's again the moment `roomWar.on()` is false. `damage.setMode` resets
the crash state, so do it between runs only (the countdown is one:
`roomTag` puts a pilot on the slot with `ui.onAction('restart')` there,
and the war should do the same at its start, as tag does in
`roomTagFrame`).

## 8. The warhead breaks this craft (section 6.3, sim_abi.h:1178)

On a `boom` event with `mine: true`:

```js
function warBoomMine(ev) {
  const n = sim.e.sim_parts_count();
  for (let i = 1; i < n; i += 1) {
    const code = sim.e.sim_part_break(i);
    if (code !== SIM_OK) {
      throw new Error(`war boom: sim_part_break(${i}) ${simErrorName(code)}`);
    }
  }
}
```

Part 0 is the root and is refused (SIM_ERR_BAD_ARG), so the loop starts at
1; a part already gone with its parent returns SIM_OK
(crash.c crash_part_break, `!attached(part)`). SIM_ERR_BAD_STATE means
damage mode is off, which step 7 makes impossible in a war, so it throws
rather than being skipped. The breaks raise the wreck flags, and the frame
after goes through `enterWreck` and the normal respawn, which the room
counts: the boom took the rack slot, and the crash that follows takes
nothing more (war.js, "A DEFENDER THAT WENT OFF"). The burst is
`warAttackers.boom(ev.p)`, already called in step 4.

## 9. The signal (#196), fpvFail and the link

Once a frame for the local craft, in a war only (`roomWar.live()`), with
the station from `stationPoint(stationFor(view.spawn, roomSlot),
terrain.finestAt, waterAt)`:

```js
const jammers = roomWar.attackersAt(now).filter((a) => a.kind === 'jammer')
  .map((a) => ({ x: a.p[0], y: a.p[1], z: a.p[2] }));
const { q } = signalQuality({ station, craft, relays, jammers, finestAt, waterAt, waterTop: 219 });
linkWatch.update(q, simTimeMs);
const snow = snowFor(q);
const deg = linkDegradeFor(q, linkWatch.lost);
fpvFail.signal(snow);
link.setSignal(deg.delayMs, deg.lossPpm, planeFailsafeRc, simTimeMs);
warSignal = { q, snow: snow > 0, degraded: deg.lossPpm > 0, lost: linkWatch.lost };
```

`fpvFail.signal(snow)` goes beside `fpvFail.set` in the crash frame (line
6750). `fpvFail.update(nowWall, runDamage && ...)` (line 6918) already
runs with damage on, which step 7 guarantees in a war. Outside a war,
`fpvFail.signal(0)` and `warSignal = null`.

## 10. The lost airframe (section 6.4)

A link lost for 3 s is a lost airframe, and the room takes it off the
rack when this pilot says so:

- a quad: once D2 (#201) is in, `sim_rx_signal(linkUp)` returns the
  failsafe state; call `roomWar.sendLost(runCount)` the first frame
  `linkWatch.airframeLost` is true while the returned state still has
  `SIM_RX_ARMED` (0x20), or on the frame that bit drops (stage 2 dropped
  the quad): whichever comes first. The ARMED bit is what says the quad
  is still a flying airframe the room has not already counted as a wreck.
- a plane: `linkWatch.airframeLost`.

`sendLost(life)` sends once per `life`: pass anything that changes on a
respawn (the run counter `resetCraft` bumps), so a second loss after a
respawn is sent and a repeat in one life is not. The room refuses it
('spawning', 'wreck', 'off') where it would count twice.

## 11. The harness hooks

For the next two page check to run against main.js instead of the wire
module, the same three `scripts/war-twopage-wire.js` exposes:

```js
window.__war = () => ({ seat, view, error, drawn: { ...warAttackers.drawn(), at }, hud: warHud.shown(), said: warHud.said(), log });
window.__warAt = (t) => roomWar.attackersAt(t);
window.__warDo = (op, arg) => ...;   /* 'start', 'end', 'lost' */
```

with `log` the events of step 4 as they were taken.
