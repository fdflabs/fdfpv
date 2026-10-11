# A plane's rates in the Rates row

The pause menu, Quad and Settings show a Rates row. On a plane it read the
quad's Betaflight rates ("Actual, 670 roll and pitch"), which a plane never
flies: a plane's sticks are its surfaces. This is the contract for showing
and editing the plane's own.

## What the player sees

- On a fixed wing with a tuning table (configs/tuning.js), the Rates row
  reads the rate in force and its throws at full stick, aileron, elevator
  and rudder: "High, 30° 20° 27°" on the Timber. Its note says the quad's
  rates do nothing on a plane.
- The row opens the plane's Rates screen (`planerates`): Rate (Low, Mid,
  High, each with its throws) and an expo per surface the plane has, 0 to
  100 in tens. Back returns where it came from, as the quad's Rates does.
- A change flies at once, mid run too, without a reset: the setup is
  seated again (sim_wing_set_tune) and only the throws and expo move. The
  flaps stay where the switch has them.
- On a quad nothing changes.

## Data and storage

Nothing new. The picks are `settings.tuning[airframeId].rate` and `.expo`,
the very fields the hangar's Tuning tab writes, normalised by
`normalizeEntry` (a stock pick drops out), so the two screens always
agree and the account sync carries them as it already does.

## Sources

The throws are configs/tuning.js's: the manual's high and low rates where
it publishes them, else low is 70 percent of high (E-flite's and
ParkZone's stated rule); Mid is halfway. The expo is the plant's cubic,
EdgeTX's.

## What it does not do

No new physics and no new stored field. It does not change the quad's
Rates screen. The flap and trim setup stay on the hangar's Tuning tab.

## Checks

`planerates:check` (browser, real pointer and keys): the Timber's row
shows its high throws, a click opens the screen, two presses left fly the
low throws in the plant at once, the aileron expo reaches the plant, Back
returns. items/nav/settings goldens re-recorded where the row changed.
