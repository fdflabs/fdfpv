# Materials per paint region (Wave 4, lane "materials")

**Status: CONTRACT** (2026-10-07). The owner asked for customization at the
level of a racing game: carbon fibre, brushed metal, matte, satin and gloss,
and a clear coat with metal flake, chosen per paint region.

## 1. What already exists (checked against the tree, origin/main 33c57145)

Most of it is live. A "material" here is a finish (configs/paint.js
FINISHES), chosen per region on the Colours tab, drawn by
src/render/finish.js on the builder's cel material, with a physically based
twin in src/maps/swiss2/craftlook.js.

| Asked for | Exists | Notes |
| --- | --- | --- |
| Carbon fibre, weave seen up close | yes | `carbon`: a 2x2 twill of 3 mm tows on the face nearest the normal, fading to flat once a tow is under a pixel |
| Carbon at the right scale per aircraft | yes, verified | the twill is in model units; every craft builder sets `1 / WORLD_SCALE` and WORLD_SCALE is 1 (src/render/frame.js), so model units are metres on every aircraft. No change. |
| Brushed metal | partly | `aluminium` is bare metal whose colour streaks along the span, but its highlight is round: no anisotropic look |
| Matte, satin, gloss | yes | `matte`, `satin` (shop, 300), `gloss` |
| Clear coat with metal flake | no | `candy` and `pearl` are lacquers, neither sparkles |
| Saved per region, synced, in codes | yes | `finishes` in the livery entry; saved liveries, codes and the account sync (src/share/progressmerge.js) carry it whole |
| Priced through the Shop | yes | src/game/economy.js ITEMS, the server's wallet (tracks-api/wallet.js) imports the same list |

## 2. What this lane adds, one PR each

1. **Flake** (`flake`, a shop finish). The region's colour under a clear
   coat with metal flake in it: a gloss highlight on top, and below it
   tiny flakes, each a cell of about 0.4 mm hashed from the model's own
   coordinates, turned a little off the surface, so a flake catches the
   light only from some angles and the paint glitters as the camera or
   the aircraft moves. Flakes finer than a pixel blend into an even
   metallic sheen, so far away it reads as metallic paint, not noise.
2. **Brushed** (`brushed`, a shop finish). Metal in the region's own colour
   (aluminium stays the bare silver one) with an anisotropic highlight:
   the highlight stretched across the brushing, which runs along the span,
   so it reads as a long streak, not a dot.

Both are a uniform write on the existing wrapper: no new material, nothing
recompiles after the first finish a material wears, and stock stays exact.

## 3. Data shapes, storage, sync, codes

No new key. A finish id is a string already stored in `finishes`; this adds
two ids to FINISHES and SHOP_FINISHES and two ITEMS. So:

- **No schema version moves.** The livery code's `v` stays 1: readCode
  refuses any other `v` whole, so bumping it would make every client that
  has not updated refuse every new code. With `v` kept, an older client
  reading a `flake` region drops that one finish and counts it in
  `dropped` (the existing contract), keeping the rest of the livery.
- **The migration** is the existing normaliser: an old entry loads exactly
  as before; a new id round-trips. `paint:selftest` seeds both (an old
  entry with every pre-existing finish, a new entry with the new ids
  through encodeLivery/readCode) and checks a reader without the new ids
  drops them and keeps the rest.
- **The shop:** `finish:flake` 800 tokens (above candy, the dearest paint),
  `finish:brushed` 400. Lead decision, reversible; the owner may move the
  prices. The server's wallet reads ITEMS, so buying them **needs a VM
  deploy** of tracks-api.

## 4. Rooms and replays

A peer's livery arrives as the same entry, drawn by the same finish.js, so
a room shows the material as the pilot sees it. Every flake is a hash of
model coordinates: every machine, peer and replay draws the same flakes.

## 5. Cost

Each finish is one branch in the finish chunk, taken only by a region that
wears it. Measured per quality preset with the hangar full screen on a
quiet GPU (the frame's GPU time, every region in the new finish against
every region in gloss); the numbers go in the PR body and in the FINISH
table comment.

## 6. What this does NOT do

- No new regions in any builder; no texture files.
- No stats: a material is cosmetic only.
- No change to aluminium, carbon, matte, satin or gloss as they draw today.

## 7. The checks

- `paint:selftest` and `economy:selftest` (Node, CI): old data, new ids.
- `materials:check` (browser, via run-check-slot.sh): opens the hangar on
  one aircraft of each family, puts every region in each new finish with
  the real pointer on the Colours tab, reads the uniforms back, and takes
  a picture per family per finish (outside the repo,
  ~/.cache/fdfpv-w34-materials/).
- lint:header, lint:dashes, lint:copy.
