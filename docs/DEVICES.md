# Devices flown

The device matrix of docs/redesign/COMPLETENESS.md item 70, phase 30 of
docs/redesign/PLAN.md: one row per real device and date that somebody flew
the simulator on, from what the repository records, 2026-10-13. A device
the repository does not record is not a row, and a cell it does not record
says so. Viewports are checked elsewhere (`lint:devices`, `modes:card`);
this table is real hardware in real hands.

The date is the day the repository records the run: the day of the flight
where the source gives it, otherwise the commit that wrote the report down,
and the flight was on or before it. The calibration key is
src/input/padprofiles.js `deviceKey`, the name a calibration is saved
under; the profile is the row of `PAD_PROFILES` the device meets, or
`aetr`, the guess flown until a calibration.

| Date | Device | Kind, link | Id the browser gives, calibration key, profile | Machine, OS, browser | Flown by | What happened | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05 | RadioMaster Pocket | radio, USB joystick (EdgeTX) | not recorded for this run; the Pocket's USB name elsewhere is `Radiomaster Pocket Joystick`, key `1209:4f54:Radiomaster Pocket Joystick`, profile `edgetx-usb` (not vouched, so `aetr` until calibrated) | not recorded; the same report's Bluetooth run was Chrome on macOS | the owner | "over USB it works" | commit 796a9c200 |
| 2026-10-05 | RadioMaster Pocket | radio, ExpressLRS Bluetooth joystick (ExpressLRS 3.x) | `ExpressLRS Joystick`, key `e502:bbab:ExpressLRS Joystick`, profile `elrs-bluetooth` (vouched) | a Mac, Chrome on macOS; model, GPU and display not recorded | the owner | "the axis are all flipped" and it "doesnt want to calibrate": throttle on axis 3, yaw on 4, an aux switch on 2. Measured live; the built in map and the wizard's resting throttle came from it | commit 796a9c200; src/input/padmap.js `ELRS_BLE_MAP` |
| 2026-09-29 | Xbox pad | gamepad, W3C standard mapping | not recorded; profile `standard` (vouched) | not recorded | the owner | "am having a hard time finding the order of sticks": flown through the AETR radio guess, left stick up pitched the nose up. A standard pad now flies the pilot's stick mode | commit 67b970687 |
| 2026-09-28 | RadioMaster Pocket | radio, USB joystick (EdgeTX), `/dev/input/js0` | `EdgeTX Radiomaster Pocket Joystick` as the joystick device names it; SDL reported `Radiomaster Pocket Joystick` for the same radio on 2026-09-12 | the Linux machine the checks run on, headless Chrome | nobody: shell checks, by accident | plugged into the host, it flew the P-51 and the Cub off their parking spots at three quarter throttle during `p51:shell`, and failed `lint:input`. Check pages now hide real gamepads | commit 95e024e45; docs/P51-STAGE1.md "Findings for the lead"; scripts/padprofiles-selftest.js |
| 2026-09-21 | FlySky FS-i6 | radio, link not recorded | not recorded; profile `aetr` | not recorded | a pilot, ticket bug-122503e9 | stuck on the wizard's Roll step: the throttle was not where the Centre step recorded it, which the wizard now allows | commit 7171cc36e |
| 2026-09-17 | RadioMaster Boxer | radio, link not recorded | not recorded | not recorded | a pilot's flight feel report | one of five feel reports (twitchy, stiff, twitchy, floppy, soft); the report form did not record the stick path, and now carries padHz, sample rate and fps | commit 1ba92c8f9 |
| 2026-09-17 | two phones | touch sticks (src/input/touchsticks.js), seeded thumb profile | none, a touch device | not recorded | two pilots' flight feel reports | two of the same five reports | commit 1ba92c8f9 |
| 2026-09-17 | a keyboard | keyboard | none | not recorded | a pilot's flight feel report | a held key stopped at 0.34 of stick; one of the same five reports | commit 1ba92c8f9 |
| 2026-08-17 | a laptop with no GPU | machine | input not recorded | GPU-less, so WebGL on the CPU; OS and browser not recorded | a pilot's report | "stick lag": the sticks were on time and the picture was late. A software renderer now gets the Low preset at boot | commit 99deaa11d |
| 2026-08-17 | a desktop with a GPU | machine | input not recorded | model, GPU, OS and browser not recorded | the same report | fine, by the same report | commit 99deaa11d |

## Not rows, and why

- The TX16S and the Xbox 360 id `045e:028e` in scripts/input-selftest.js,
  scripts/input-check.js and scripts/padprofiles-selftest.js are fixtures:
  names and ids from source code (Linux's xpad.c, EdgeTX's usbd_desc.c),
  not devices anybody flew. So are the ELRS 4.x id (`ELRS Joystick`) and
  every pad the browser checks stub.
- The owner's Windows machine ran `npm run verify` on 2026-08-17 (commit
  1724e764c), 15 of 16 and a bit identical build: a test run, not a
  flight.
- The check host's GPUs (two RTX 3060 Ti, docs/PERF.md) measure frame
  budgets in headless Chrome; nobody flies there. Its one flight is the
  Pocket row above.
- The Steam Deck is named in src/render/quality.js's handheld test,
  and the Android throttle reports of commit 7171cc36e name no device:
  neither records a device flown.

## Adding a row

When somebody flies a device, add a row at the top with the date of the
flight, and fill what is known: the device's name as Choose joystick
shows it and its USB ids where known, the machine, OS and browser, the
GPU, the display's refresh rate, who flew it, and what
happened. A cell nobody measured says "not recorded". The owner's
machines and the Pocket first (COMPLETENESS 70).
