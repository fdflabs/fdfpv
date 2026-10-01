# Combat drone models: builders, parts, paint and decal surfaces

Written 2026-10-01 for the owner's request of that day: combat drones
"built with and without their accessories and differing payloads", and
the war's Striker rebuilt as the delta wing one way attacker of his
reference sheets, with a prop or a jet. `docs/COMBAT-DRONES.md` (branch
`combat-drones-physics`) is the interface for the quads, and this file
does not restate it: its ids are the ids here and its parts list is where
every part is drawn. This file is what the models give their callers, and
what they need from the integration side.

## 1. The quads: `src/render/combatcraft.js`

```js
buildCombatDrone({
  frame: '7in' | '10in',
  payload: 'none' | 'standard' | 'wide' | 'penetrator' | 'emp',
  accessories: ['pack2', 'cage', 'lrantenna', 'gps'],   // any subset the frame offers
  name, fog, lite, worldScale, measure,                 // every builder's options
})
```

Through the shell it is `craftBuilderFor('7inch')` or `'10inch'`
(`src/render/craft.js`), which takes the pilot's resolved choice as
`opts.combat = { payload, accessories }` and draws the doc's default,
`{ payload: 'standard', accessories: [] }`, when a caller passes none.
`buildCraft(airframeId, combat)` forwards it. An unknown id, or an
accessory the frame does not offer (`pack2` on the 10 inch), throws.

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
and `prop` or `jet`, and `antenna`.

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

Regions:

| model | regions |
| --- | --- |
| quads | `frame`, `pack`, `payload`, `tape`, `cage`, `legs`, `props` |
| Striker | `skin` (fuselage, wing, fins; the elevons and rudders follow it), `nose`, `band`, `engine`, `prop`, `jet` |

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

These are requests, not edits: the files are the physics branch's.

1. **Forward the choice.** The shell builds the flown craft with
   `buildCraft(airframeId)` (`src/render/shell.js` swapCraft); it needs to
   pass the resolved `{ payload, accessories }` as the second argument and
   rebuild when it changes, as the doc's section 4 says.
2. **Replays.** `src/replay/crashcam.js` builds its craft with
   `craftBuilderFor(af)(opts)` and no choice, so a replay draws the default
   loadout. For a replay to show the flown build, the clip's meta needs
   the choice and the replay needs to pass it as `opts.combat`.
3. **Peers.** `src/render/peers.js` builds with no choice too, which is the
   doc's `standard` outside a war; in a war it needs the seat's loadout
   warhead as `opts.combat.payload` (the payload ids and the war's warhead
   ids are the same words in the doc).
4. **The FPV camera.** The model's camera is where the parts list puts it,
   about the CG 78.3 mm forward and 16.9 mm down on the 7 inch, 98.4 mm and
   21.0 mm on the 10 inch. The FPV view is placed by `src/render/lens.js`
   (80 mm forward, 18 mm up, the five inch's). The near plane hides the
   difference in the picture, but the parallax a roll gives is the
   camera's height, so the view may want the combat quads' own mount.
5. **The hull's top.** As drawn, the bare 7 inch's highest point (not
   counting antennas) is its pack's top, 42.1 mm above the CG, 84.1 mm with
   `pack2`; the 10 inch's 44.0 mm. `scripts/craft-check.js` holds
   `vHalfUp` to the seated default's, which is the bare machine.
6. **A render liberty.** The long range antenna and the receiver whips
   stand 14 mm either side of the centreline, where the doc puts their
   mass on it, so the GPS mast between them stays clear. The lumped mass
   the plant flies is unaffected.
