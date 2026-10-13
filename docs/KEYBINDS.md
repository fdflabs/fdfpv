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

- a key another action already has where both apply ("7 is already
  Reset. Move that one first."), including an every-aircraft key that an
  aircraft's own binding would collide with;
- a key the game reads in flight for something not in the table (the
  stick keys W A S D Z Q E and the arrows, Shift, Ctrl, Escape, Tab, the
  brackets, Space, Enter, Backspace, the backquote, the avionics and
  camera ball keys H J K I U Y M Period Equal Minus PageUp PageDown, the
  builder's B and V, push to talk's N, F3, F8). A profile saved before N
  was reserved loses a binding on N when it loads (console.warn).

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

## Pad buttons (phase 20)

The actions are one table, `src/input/actions.js`: each row has its
default key (the code the readers compare against) and its default button
on a pad the browser maps to the W3C standard layout. Every row may take
a pad button; the rows with no key (Open the replay, X; Push to talk, the
left trigger; Change aircraft, Y) are moved on the pad only. Stepping out
is B, held half a second.

Each Controls row shows the key and the button ("R, pad A"). An armed row
takes the next key or the next standard pad button; Backspace puts both
defaults back; Reset all clears both. The same rules as the keys
(`src/input/bindings.js` runs both tables): every aircraft or one, no two
actions on one button, and the buttons the shell reads for something else
are refused (Start pauses, Back enters the builder, the shoulders step the
aircraft swap, the d-pad, the right trigger and the stick clicks fly the
camera ball).

The camera ball zooms in on the right trigger and out on A. The left
trigger is push to talk only (it was the ball's zoom out too, so talking
in ball view zoomed the lens). A is the one standard button no action
holds by default, so it stays choosable: an action the pilot binds to A
takes it, and the ball then zooms out on the keys (- or Page Down) and
its touch buttons only.

In flight a pad button bound to an action with a key arrives as that key
(`InputManager.pollPadKeys`: held in `input.keys` while the button is,
heard once by `onKey`), so no key reader changed. The pad-only actions and
stepping out read their button by name (`input.padAction`). A radio's
switches are never bound or read by name. Off the flight screen no pad
button stands for a key.

`settings.padbinds`, the shape of `settings.keybinds` with button names
(`a`, `x`, `lt`) for codes, absent while nothing is moved, synced as a
`whole` section (needs the same VM deploy as keybinds for the sync).

No module outside `src/input` reads a device: `lint:input` fails first on
`getGamepads`, `.buttons[` or `.axes[` anywhere else under `src`.

## What it does not do

- Radio switches as action buttons.
- Menu keys and buttons, and the keys and buttons in the builder, crash
  cam and avionics HUD (read through src/input by name, not movable).
- Two keys, or two buttons, for one action.
- Exchanging two bound controls in one step: move one to a free control
  first, as with the keys.

## Checks

- `npm run keybinds:selftest` (CI): the table, the identity, binding,
  clashes, reserved keys, per aircraft scope, resets, the stored shape
  and its repair, the synced section, and InputManager.keyDown's
  translation of presses, repeats and releases.
- `npm run keybinds:check` (local, browser): the real Settings page with
  the pointer and keys; a moved Reset resets a flight and R stops; a clash
  is refused naming the action; an aircraft-only binding works on the
  Timber and not on the Cub; Reset all restores R. Then a standard pad: the
  Reset row takes A, A resets a flight, clashes and Start are refused,
  Reset all clears the pad.
- `npm run input:selftest` (CI): the table, pad binding rules, a bound
  button arriving as its key in flight and not elsewhere, the pad-only
  actions by name, a radio ignored, the turtle's keys per stick mode.
- `npm run lint:input` (local, browser): the device read grep, and a bound
  pad button in the real page.
- Unchanged: keys:golden, settings:golden, actions:golden,
  menucontrols:golden, ways:golden, nav:golden, rows:golden. items:golden
  is re-recorded: the one new row, Controls, on the Settings page.
