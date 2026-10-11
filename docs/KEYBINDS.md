# Key remapping (OPS #3)

Contract for Settings > Controls, 2026-10-08. Builds on
docs/redesign/COMPLETENESS.md items 20 (input abstraction) and 40
(accessibility: remapping).

## What the pilot sees

Settings has a Controls row (under the sticks). It opens a page listing
every flight action with its key: Reset (R), Unstick (X), Flip over, hold
(T), Launch or launch control (L), Parachute (P), Flaps (F), Landing gear
(G), Smoke (O), Change view (C). Press a row (Enter or a click), then the
new key. Escape cancels, Backspace puts that row's default back. The
first row, Keys for, chooses Every aircraft or the seated aircraft; a key
set for one aircraft shows "(this aircraft)" and wins over the every
aircraft key on it only. Reset all to defaults puts every key back for
every aircraft. Everything is in English and Spanish.

Refused, with the reason on the page:

- a key another action already has where both apply ("N is already
  Reset. Move that one first."), including an every-aircraft key that an
  aircraft's own binding would collide with;
- a key the game reads in flight for something not in the table (the
  stick keys W A S D Z Q E and the arrows, Shift, Ctrl, Escape, Tab, the
  brackets, Space, Enter, Backspace, the backquote, the avionics and
  camera ball keys H J K I U Y M Period Equal Minus PageUp PageDown, the
  builder's B and V, F3, F8).

## How it works

`src/input/keybinds.js` holds the actions as rows keyed by the default
code main.js already compares against. `InputManager.keyDown` asks
`translateKey` first; main.js sets it, in flight only, to
`translate(settings.keybinds, runAirframe, code)`: the chosen key arrives
as the default code, a moved default key arrives as nothing, any other
key is itself. The held set (`input.keys`) holds the translated code and
a release lets go of the code its press went down as. No reader of a key
changed. With no bindings the translation is the identity, so every
default and every key golden is unchanged.

A new aircraft's key (the Hercules lane's O and P, the Night Timber's
light toggles) is one more row in `ACTIONS`, read by main.js at its
default code like the others.

## Storage and sync

`settings.keybinds = { v: 1, all: { action: code }, by: { airframe: {
action: code } } }`, only moved actions, and absent while nothing is
moved (so profiles and goldens are byte identical until a pilot moves a
key). `normaliseKeybinds` repairs a stored or synced value entry by entry
(unknown actions, reserved or invalid keys, defaults, clashes dropped; an
old profile without the field reads as none). Synced as a `whole`
section (src/share/progressmerge.js). The server keeps a new section only
once it runs this progressmerge.js: **needs a VM deploy** for the sync;
until then the bindings stay on the computer that made them.

## What it does not do

- Gamepad and radio buttons. The pad's action buttons are read at fixed
  indices in several modules (main.js ballPad, src/ui/voiceui.js push to
  talk, src/input/menus.js, src/input/padpick.js), and padmap.js maps
  axes only. Moving them needs item 20's action table across those
  readers first; it overlaps FOUNDATIONS #9 (radio and gamepad profile
  library), so it is left to that item.
- Menu keys and the keys in the builder, crash cam and avionics HUD.
- Two keys for one action.

## Checks

- `npm run keybinds:selftest` (CI): the table, the identity, binding,
  clashes, reserved keys, per aircraft scope, resets, the stored shape
  and its repair, the synced section, and InputManager.keyDown's
  translation of presses, repeats and releases.
- `npm run keybinds:check` (local, browser): the real Settings page with
  the pointer and keys; a moved Reset resets a flight and R stops; a clash
  is refused naming the action; an aircraft-only binding works on the
  Timber and not on the Cub; Reset all restores R.
- Unchanged: keys:golden, settings:golden, actions:golden,
  menucontrols:golden, ways:golden, nav:golden, rows:golden. items:golden
  is re-recorded: the one new row, Controls, on the Settings page.
