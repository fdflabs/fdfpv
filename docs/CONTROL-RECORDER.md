# Control recorder and hover viewer

Contract, 2026-10-09 (w34 control feel lane). The owner's own hover attempts are the calibration the
person-paced pilot in `scripts/hover-probe.js` lacks: its count is relative (it moves 8 to 96 of 336
pilots on its delay alone), and only real flying says how hard the sim is against reality.

## What the pilot sees

- Settings, Pilot, Diagnostics: the existing **Flight log** switch now also runs the control recorder.
  No new setting.
- A new row under it, **Download control recording**, saves a CSV of the last minute of flight.
- Each run that ends (a restart, which a crash leads to) is kept in this browser as the **last flight**,
  so an attempt that ended in the ground can still be opened and sent.
- `/dev/hover.html` opens a saved CSV or the last flight. It plots the sticks against the nose off
  vertical and the roll rate, and prints the thumb numbers below.

## Data

One row per 1 ms plant step, in flight (not on the launch stand or a perch). Columns
(`src/share/controlrec.js` COLUMNS):

| Column | Meaning |
|---|---|
| t_s | sim time of the step's end, s |
| frame, frame_wall_ms, frame_dt_ms, steps | the frame that stepped it: its count, its start (performance.now ms), the wall time it stepped, how many steps |
| stick_wall_ms | when the shell's poll read the stick sample in force for this step |
| roll, pitch, yaw, throttle | the channels sim_input was handed for the step (after the stick map, the 1.2 % deadband and the 250 Hz RC grid) |
| ail_l, ail_r, elev, rud | the control surfaces after the controller (AS3X, stabiliser, mixes), radians; 0 on a quad |
| x y z, vx vy vz, qw qx qy qz, p q r | the plant state block (sim_abi.h): world position and velocity, attitude, body rates |

- Held in a preallocated Float64Array ring of 60 000 rows (60 s, about 13 MB, allocated only when the
  switch is on), so the flight loop allocates nothing for it.
- The last flight is stored in IndexedDB (`fdfpv-controlrec`), not localStorage: a minute is past
  localStorage's quota. Only this browser; nothing syncs and nothing goes to a server.
- `src/share/flightlog.js` (the blackbox CSV, one row per frame) is unchanged: other tools read its
  columns.

## Thumb numbers (thumbStats)

The same numbers `scripts/hover-video.js` prints for the probe's pilots, so the owner's flying and the
probe's can be laid side by side:
- per stick: mean and peak absolute deflection (throttle about its mean), stick rate peak and 95th
  percentile (travel per second), reversals per second (half turns, as hover-video counts them);
- the sticks are judged on a 50 Hz grid and a reversal needs 1 % of travel, so a radio's last bit of
  noise is not counted as a thumb changing its mind;
- latency: per frame, its start less the newest stick reading it stepped; and the frame interval.
  Median, p95, p99, worst;
- hover: the longest stretch with the nose within 20 degrees of vertical, the probe's hold criterion.

## Builds on

The flight log switch and the Diagnostics rows (`src/ui/items.js`), `downloadText`, `stampSticks` (the
RC slots) and `stepInAir` (the per step loop) in `src/main.js`, `sim_plane_surfaces`.

## Does not

Change physics, the RC grid or what reaches sim_input (recordings and war:legacy stay bit identical).
Upload anything. Record when the switch is off. Replace the flight log.

## Checks

- `npm run controlrec:selftest` (CI): row alignment with the RC slots, the ring, the CSV round trip,
  and thumbStats on a known sine with radio noise.
- `npm run controlrec:check` (browser, run-check-slot): the real shell, flight log on, a hover with the
  roll stick stepping; one row per step, rolls equal to the stick given, unit quaternions; the Download
  row pressed with a pointer hands over a CSV that parses; a restart keeps the last flight; the viewer's
  Last flight button, pressed with a pointer, shows it.
- `npm run actions:golden`, `npm run war:legacy`: unchanged.
