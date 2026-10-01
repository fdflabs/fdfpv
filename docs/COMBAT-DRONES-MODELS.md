# Combat drone models: builders, parts, paint and decal surfaces

Written 2026-10-01 for the owner's request of that day: combat drones
"built with and without their accessories and differing payloads", and
the war's Striker rebuilt as the delta wing one way attacker of his
reference sheets, with a prop or a jet; and the owner's "ultra fast
interceptor drones", a third quad frame. `docs/COMBAT-DRONES.md` is the
interface for the quads, and this file
does not restate it: its ids are the ids here and its parts list is where
every part is drawn. This file is what the models give their callers, and
what they need from the integration side.

## 1. The quads: `src/render/combatcraft.js`

```js
buildCombatDrone({
  frame: '7in' | '10in' | 'interceptor',
  payload: 'none' | 'standard' | 'wide' | 'penetrator' | 'emp' | 'proximity',   // those the frame carries
  accessories: ['pack2', 'cage', 'lrantenna', 'gps'],   // any subset the frame offers
  name, fog, lite, worldScale, measure,                 // every builder's options
})
```

Through the shell it is `craftBuilderFor('7inch')`, `'10inch'` or
`'interceptor'` (`src/render/craft.js`), each on its airframe's
`combat.frame`, which takes a resolved choice as
`opts.combat = { payload, accessories }` and draws the doc's default
(`configs/combat.js` `combatChoice(airframe, null)`: the standard
warhead's payload, no accessories) when a caller passes none.
`buildCraft(airframeId, combat)`, the flown craft, takes the pilot's own
seated choice, `combatFor(airframeId)`, when its caller passes none, as
the shell's swap does. An unknown id, or an accessory the frame does not
offer (`pack2` on the 10 inch), throws.

The interceptor (`frame: 'interceptor'`, `craft.js` id `interceptor`,
docs/COMBAT-DRONES.md section 1a) is drawn to the owner's reference and
its parts list: a stretched X 7 inch (motors 120 mm fore and aft and 100
mm across of the CG), clear two blade props, an armoured carbon box round
the camera, one big pack strapped on top, two antennas at the back, legs
to the hull's 75 mm and no arm tape. It carries a light `proximity`
(45 by 160 mm: a slim olive tube, an ogive nose with a dark sensor ring,
no fins) and offers `lrantenna` and `gps`.

It returns every builder's contract (`group`, `discs`, `blades`,
`cameraMount`, `propSpin`, `stator`, `livery`) and `combat`:

| field | what it is |
| --- | --- |
| `frame`, `payload`, `accessories` | the answers as built, accessories in the doc's order |
| `parts.frame`, `parts.legs`, `parts.pack`, `parts.camera` | the bare machine's named groups |
| `parts.stockAntenna` | the stubby video antenna and short receiver tails, present when `lrantenna` is not |
| `parts.accessories[id]` | each chosen accessory's group (`lrantenna`'s is named `antenna`, which `scripts/craft-check.js` leaves out of the machine's size) |
| `parts.payload`, `parts.payloadBody` | the payload with its straps and pin, and the payload alone |
| `size` | the frame's measurements in the model frame, metres: motor offset, prop radius and height, belly, roof, body box, hull depth |
| `paint` | the garage's hook, section 3 |

The same arguments give the same machine, vertex for vertex: the flown
craft, the hangar's preview, a peer and a replay each build their own.

## 2. The Striker: `src/render/strikercraft.js`

```js
buildStrikerCraft({
  propulsion: 'prop' | 'jet',   // the pusher piston engine and wooden prop, or a small turbojet
  antenna: false | true,        // the whip on the fuselage
  name, fog, lite, worldScale,
})
```

It returns the shell's contract as the Zagi's does (four rotor slots,
`propSpin` `[1, 0, 0, 0]`, the prop turning about the fore and aft axis
on `blades[0].rotation.y`) and `combat = { propulsion, antenna, parts,
paint }`, the parts named `fuselage`, `wing`, `fins`, `skid`, `engine`
and `prop` or `jet`, `antenna`, and the four moving surfaces
`elevon-left`, `elevon-right`, `rudder-left`, `rudder-right`, each a group
on its hinge (`STRIKER_HINGES`). `setSurfaces(left, right, _, rudder)` moves
them in radians: positive elevon is trailing edge up, as the Zagi's,
positive rudder trailing edges left.

This is also the builder for a pilot's own Striker, the flyable airframe
another agent is adding: one aircraft seen close, so it is drawn rounder
than the war's (24 segments round against 16). When that airframe's id
lands in `docs/COMBAT-DRONES.md`, its `craft.js` entry is
`(opts) => buildStrikerCraft({ ...opts, ...choice })` with the choice's
propulsion and whip; a payload for it will need its ids and sizes in the
doc first, as the quads' did.

The war draws the same parts list (`strikerParts`) for the `strike` and
`decoy` kinds in `src/render/attackers.js`: one merged geometry with the
colours in its vertices, the panel texture, and the prop turned in the
vertex shader, so the kind is still one instanced draw call. Its size is
the one the war had: 2.5 m across, 2.8 m nose to prop. Only the look
changed; no route, speed, radius or rule did.

## 3. Paint and decals: `combat.paint`, `src/render/combatpaint.js`

Every combat model fills a `paintRegions` table (`src/render/livery.js`),
so `dressLivery`, `dressFinish` and `dressDecals` work on it as on every
paintable aircraft, and hands back:

```js
paint.regions    // region ids, each one colour as built
paint.finishes   // ['kit', 'gloss', 'matte', 'carbon', 'aluminium']
paint.surfaces   // [{ id, p, n, size, mirror }]
paint.set({ colours, finish, finishes, wear })
paint.read()     // what set() was last given
```

- `colours`: region id to `0xRRGGBB`. A region left out takes its finish's
  colour (carbon and aluminium bring one) or its own.
- `finish`: one finish for every region; `finishes`: region id to finish,
  over it. `kit` is the model as built; `carbon` is a clear coated dark
  weave colour under finish.js's gloss; `aluminium` bare metal under its
  metallic.
- `wear`: 0 as built to 1 scuffed: each region's colour drawn toward a
  dust and primer tint. A colour, not a texture, so it costs nothing a
  frame.
- An unknown region or finish, or a wear outside 0 to 1, throws.
- `set({})` puts back exactly the colours the model was built in.

Regions, in the order the hangar lists them. They are the aircraft's
paint in `configs/liveries.js` too (`striker2500`, `7inch`, `10inch`,
`interceptor`), so the garage's Colours tab, its schemes, finishes, decals
and wear, the picker, the flown model, a peer in a room and the war all
dress them through `dressLivery` as they dress a plane;
`scripts/combat-models-check.js` holds every build's regions and stock
colours to that file's.

| model | regions |
| --- | --- |
| quads | `frame` (the bottom plate and the camera mount; the standoffs follow it), `arms` (the lighter slot follows them), `top` (the top plate), `armour` (round the interceptor's camera), `tape` (where the arms are taped), `pack`, `payload`, `cage` (where the frame offers one), `legs`, `props` (where they are not clear) |
| Striker | `fuselage`, `wing` (the elevons and hatches follow it), `fins` (the rudders follow them), `nose_cap`, `nose_band`, `engine` (the piston engine and the spinner, or the turbojet, by the metal both carry) |

The Striker's wooden blades, skid, horns and whip, and a quad's metal,
glass, copper, wire and circuit board, are left as built.

The Striker's skin is a panel texture (seams and rivet rows, drawn in
code) multiplied by its colour, so a repaint keeps its panel lines.

Decal surfaces are a point on the skin and its outward normal in the
craft group's frame, and the largest decal height that stays on that
face: a `configs/paint.js` decal entry's `p`, `n` and `s`, so a decal on
one is `{ k, p, n, s, a, r, m, c, c2 }` with `s` up to `size`. `mirror`
says the face has a twin across x = 0 that the entry's `m` reaches.

| model | surfaces |
| --- | --- |
| quads | `pack-side` (mirror), `pack-top` (mirror on the 10 inch's pair), `payload-side` (mirror, when a payload is carried) |
| Striker | `nose`, `wing-top-left`, `wing-top-right`, `fin-left`, `fin-right`, `fuselage-left`, `fuselage-right` |

## 4. Checks

`npm run check:combat-models` (`scripts/combat-models-check.js`, on
`tests/browser/combat-preview.html`) builds every frame, payload and
accessory set twice and both Strikers' propulsions with and without the
whip, and asserts the budgets (no more draws than the five inch, no more
triangles than the heaviest aircraft shipped, the war's Striker one
geometry), the payloads' sizes and places, the legs at the hull's depth,
the props clear, no solid inside out, every build distinct and every build
the same twice, the Striker's size and its prop turning about the right
axis, and the paint hook: a decal printed on every surface, every finish
repainting, `set({})` restoring the build. `--shots` takes pictures from
the hangar's and the chase camera and of the war's Striker at 12 and 30 m.

## 5. What the models need from the integration side

These are requests, not edits: the files are the integration side's.
The flown craft's choice is settled: `buildCraft` reads `combatFor`, and
`npm run check:craft` seats each quad with its fullest loadout and finds
the drawn machine inside 6 mm of the fixed hull on every axis.

1. **Replays.** `src/replay/crashcam.js` builds its craft with
   `craftBuilderFor(af)(opts)` and no choice, so a replay draws the default
   loadout. For a replay to show the flown build, the clip's meta needs
   the choice and the replay needs to pass it as `opts.combat`.
2. **Peers.** `src/render/peers.js` builds with no choice too, which is the
   doc's `standard` outside a war; in a war it needs the seat's loadout
   warhead as `opts.combat.payload` (the payload ids and the war's warhead
   ids are the same words in the doc).
3. **The FPV camera.** The model's camera is where the parts list puts it,
   about the CG 78.3 mm forward and 16.7 mm down on the 7 inch, 98.4 mm and
   21.0 mm on the 10 inch. The FPV view is placed by `src/render/lens.js`
   (80 mm forward, 18 mm up, the five inch's). The near plane hides the
   difference in the picture, but the parallax a roll gives is the
   camera's height, so the view may want the combat quads' own mount.
4. **The hull's top.** Drawn with its fullest loadout the 7 inch reaches
   88.8 mm above the CG (the second pack's buckle) against the hull's
   85.0, and the 10 inch 49.7 mm (the GPS puck) against 55.0; bare, the
   7 inch's top is 46.8 mm. Inside craft-check's 6 mm, so nothing to do.
5. **A render liberty.** The long range antenna and the receiver whips
   stand 14 mm either side of the centreline, where the doc puts their
   mass on it, so the GPS mast between them stays clear. The lumped mass
   the plant flies is unaffected.
6. **The interceptor's interface.** Settled: its `combat.frame` is
   `'interceptor'`, its parts list is in `scripts/combat-derive.js` like
   the other two, and the models' row (`COMBAT_FRAMES.interceptor`) is
   brought to it; `check:combat-models` holds the two equal. Its payload
   is its own id, `proximity`, on the war's standard warhead, so it has
   its own kit; it keeps legs, since the plant parks every combat quad at
   the deepest payload's belly whether it carries one or not.
