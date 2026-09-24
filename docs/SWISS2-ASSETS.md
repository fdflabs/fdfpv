# swiss2: the photographs its ground, village and sky are made of

Every file under `assets/swiss2/` (the top level; `vegetation/` and
`water/` are listed in `docs/SWISS2-ASSETS-VEG.md`) is from Poly Haven or
ambientCG and is CC0 1.0: public domain, no attribution required. The
authors are named here anyway, because they made the valley look like a
place. Nothing here is a real map, a real village or a real photograph of
Lauterbrunnen: the valley is the Alps' own procedural one, and these are
material photographs laid on it.

Total: **9.05 MB** (9,051,035 bytes) in 50 files, against a budget of
25 MB for this part.

## How the files were made from the originals

Downloaded with curl from `api.polyhaven.com` (the 1k JPG maps) and
`ambientcg.com/get?file=<id>_1K-JPG.zip`, then packed with Python and
Pillow. No KTX2: there is no Basis encoder on this machine and none was
installed for this.

- **Terrain layers**, 1024 square, two files each:
  `<name>_col.jpg` is the albedo (JPEG quality 84);
  `<name>_nrh.jpg` carries the OpenGL normal in red and green and the
  displacement map in blue (JPEG quality 88), so the ground reads one
  texture for its normal and its height blending. At load the nine layers
  of each become one texture array (1024 on High, 512 on Medium and Low).
- **Surfaces** for the village, the roads and the props, three files each:
  `<name>_col.jpg` albedo 512 square, `<name>_nrm.jpg` OpenGL normal 512
  square, `<name>_arm.jpg` ambient occlusion, roughness and metalness in
  red, green and blue, 256 square. Poly Haven publishes the arm map; for
  ambientCG sets it was packed from their AmbientOcclusion, Roughness and
  Metalness maps, with a flat value where a set has none (Wood Siding 011
  has no roughness map). 512 is enough: at the default lens a wall five
  metres off is a centimetre a pixel, and a two metre tile at 512 is four
  millimetres a texel.
- **Sky**, from the 8k and 1k HDRs:
  `sky_back.jpg` is the upper hemisphere and eight degrees under the
  horizon, 4096 by 1115, stored as sRGB of radiance times 0.18588, so
  the brightest clouds sit just under white; the sun's disc is added
  back in the shader far brighter than the file can hold.
  `sky_env.hdr` is 512 by 256 flat RGBE for image based light, with the
  sun's disc (2.5 degrees round it) clamped to the sky's 99.9th
  percentile so the valley is not lit by the sun twice, and the lower
  hemisphere replaced by the light a sunlit meadow sends back up (albedo
  0.10, 0.13, 0.05 times the level irradiance, over pi), because a pure
  sky HDRI has haze where the valley has ground. The sun the directional
  light stands for is where the photograph has it: 37.79 degrees up, at
  u 0.6001.

## Terrain layers (texture array order)

| Layer | File stem | Source | Authors | Tile |
|---|---|---|---|---|
| 0 meadow | `meadow` | [Grass 004](https://ambientcg.com/view?id=Grass004), ambientCG | Lennart Demes | 1.9 m |
| 1 pasture | `pasture` | [Ground 037](https://ambientcg.com/view?id=Ground037), ambientCG | Lennart Demes | 2.6 m |
| 2 forest floor | `forest` | [Forest Leaves 04](https://polyhaven.com/a/forest_leaves_04), Poly Haven | Rob Tuytel | 2.4 m |
| 3 scree | `scree` | [Gray Rocks](https://polyhaven.com/a/gray_rocks), Poly Haven | Dimitrios Savva | 3.6 m |
| 4 rock | `rock` | [Rock 028](https://ambientcg.com/view?id=Rock028), ambientCG | Lennart Demes | 30 m, and 130 m |
| 5 snow | `snow` | [Snow 02](https://polyhaven.com/a/snow_02), Poly Haven | Rob Tuytel | 4.5 m |
| 6 shore gravel | `shore` | [River Small Rocks](https://polyhaven.com/a/river_small_rocks), Poly Haven | Rob Tuytel, Rico Cilliers | 3.0 m |
| 7 worn earth | `path` | [Rocky Trail](https://polyhaven.com/a/rocky_trail), Poly Haven | Amal Kumar | 2.6 m |
| 8 alpine turf and rock | `alpine` | [Aerial Rocks 04](https://polyhaven.com/a/aerial_rocks_04), Poly Haven | Rob Tuytel | 60 m |

## Surfaces

| Surface | File stem | Source | Authors | Tile | Used for |
|---|---|---|---|---|---|
| boards | `boards` | [Wood Siding 008](https://ambientcg.com/view?id=WoodSiding008), ambientCG | Lennart Demes | 2.0 m | larch, dark larch, honey and weathered boarding, shutters, fences, the jetty, boats, log ends |
| render | `render` | [Plaster 001](https://ambientcg.com/view?id=Plaster001), ambientCG | Lennart Demes | 2.5 m | rendered walls, trim |
| stone | `stone` | [Stone Wall](https://polyhaven.com/a/stone_wall), Poly Haven | Dario Barresi, Charlotte Baglioni | 2.0 m | plinths, chimneys, the churchyard wall |
| shingle | `shingle` | [Wood Siding 011](https://ambientcg.com/view?id=WoodSiding011), ambientCG | Lennart Demes | 1.4 m | timber shingle roofs |
| slate | `slate` | [Roofing Tiles 003](https://ambientcg.com/view?id=RoofingTiles003), ambientCG | Lennart Demes | 1.6 m | slate roofs, the spire |
| asphalt | `asphalt` | [Asphalt 02](https://polyhaven.com/a/asphalt_02), Poly Haven | Rob Tuytel | 3.0 m | the road and the street |
| gravel | `gravel` | [Gravel Floor](https://polyhaven.com/a/gravel_floor), Poly Haven | Jenelle van Heerden, Matterfield | 2.25 m | yards, the shore path, the track, the hiking paths |
| cobble | `cobble` | [Cobblestone Floor 03](https://polyhaven.com/a/cobblestone_floor_03), Poly Haven | Rob Tuytel | 2.4 m | the square |
| concrete | `concrete` | [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001), Poly Haven | Dimitrios Savva, Rico Cilliers | 3.0 m | the hangar apron, bases |
| metal | `metal` | [Corrugated Iron](https://polyhaven.com/a/corrugated_iron), Poly Haven | Jenelle van Heerden, Dimitrios Savva | 1.12 m | the hangar's walls and roof |

## Sky

| File | Source | Authors |
|---|---|---|
| `sky_back.jpg`, `sky_env.hdr` | [Kloofendal 38d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky), Poly Haven | Greg Zaal (photograph), Jarod Guest (sky edit) |

## Sizes

| Files | Bytes |
|---|---|
| terrain, 18 files | 6,967,308 |
| surfaces, 30 files | 1,342,038 |
| sky, 2 files | 741,689 |
| poster, `assets/posters/swiss2.jpg` (not counted above) | 59,230 |
| **total under assets/swiss2/ top level** | **9,051,035** |

On the GPU at High: the two terrain arrays, 9 layers of 1024 square RGBA8
with mipmaps, about 100 MB between them (25 MB at 512 on Medium and Low);
the surfaces about 31 MB; the sky backdrop 18 MB; the masks, the
mountains' shadow and the heights about 14 MB.
