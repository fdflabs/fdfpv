# render.py: the war's explosion flipbook, rendered in Blender from
# JangaFX's free EmberGen simulations (CC0), for src/render/explosion.js.
#
#   CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1 \
#     blender -b -P tools/explosions/render.py -- \
#       --vdb ~/Desktop/fdfpv-loop/explosions/vdb --out assets/explosions \
#       [--test FRAME] [--work DIR]
#
# WHAT A SHEET IS. One opaque RGB image of COLS x ROWS cells, each cell one
# frame of the simulation seen from the side by an orthographic camera,
# left to right and top to bottom. The three channels are three different
# things, because the renderer draws an explosion in two pools that want
# different halves of it:
#
#   R  the fire's light, as it leaves the volume (the smoke in front of it
#      already taken off), divided by the sheet's FIRE_MAX and stored as
#      its square root, so the dim red edges keep some bits. The additive
#      pool decodes it and colours it by its own ramp: the hottest is
#      white, the faintest a deep red.
#   G  the smoke's shade under a plain sun from above and in front, 0 dark
#      to 1 lit, its own colour taken out; empty texels hold the frame's
#      mean, so the filtering never drags a dark rim in. The blended pool
#      tints it with the map's light.
#   B  the smoke's opacity.
#
# No alpha channel on purpose: a browser decoding an image with alpha may
# premultiply it, and the fire is bright exactly where there is no smoke.
# Lossless WebP, since lossy WebP's chroma subsampling would smear the three
# channels into one another.
#
# The script prints the constants explosion.js keeps for the sheet; when a
# sheet is rendered again, copy them across.
#
# THE SOURCE is the EmberGen free VDB animations (README.md here names the
# files). They are not in the repository and never go in it; only the sheets
# do.
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

import argparse
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

import bpy
import mathutils
import numpy as np

# The simulation: JangaFX's mid air explosion, 126 frames, each with
# density, flames and temperature grids; frame 0 holds nothing, and the
# script finds that itself. 30 frames a second is assumed from the free
# ground explosion set, whose preview movie is 200 frames in 6.67 s; the
# mid air set ships no movie.
SET_DIR = 'Midair_Explosion_01'
SET_MATCH = r'embergen_midair_explosion_a_(\d+)\.vdb$'
SIM_FPS = 30
# The volume's density and the flames' light, multipliers on the grids.
DENSITY = 0.25
FLAMES = 6.0
NAME = 'midair'

ap = argparse.ArgumentParser()
ap.add_argument('--vdb', required=True, help='the folder the EmberGen archives were extracted into')
ap.add_argument('--out', required=True, help='where the sheet goes')
ap.add_argument('--cols', type=int, default=8)
ap.add_argument('--rows', type=int, default=8)
ap.add_argument('--cell', type=int, default=256)
ap.add_argument('--samples', type=int, default=96)
ap.add_argument('--test', type=int, default=None, help='render this one simulation frame and stop')
ap.add_argument('--work', default=None, help='keep the per frame renders here')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

src = os.path.join(os.path.expanduser(args.vdb), SET_DIR)
files = {}
for name in os.listdir(src):
    m = re.search(SET_MATCH, name)
    if m:
        files[int(m.group(1))] = os.path.join(src, name)
if not files:
    sys.exit(f'render.py: no frames in {src}')

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'

# Cycles on the CUDA devices this process can see, never the CPU: the
# command line above shows only the second GPU, because the first is the
# one the desktop and a pilot may be using.
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'CUDA'
prefs.get_devices()
cuda = [d for d in prefs.devices if d.type == 'CUDA']
if not cuda:
    sys.exit('render.py: no CUDA device visible')
for d in prefs.devices:
    d.use = d.type == 'CUDA'
print('render.py: on', ', '.join(d.name for d in cuda), 'CUDA_VISIBLE_DEVICES', os.environ.get('CUDA_VISIBLE_DEVICES'))
sc.cycles.device = 'GPU'
sc.cycles.samples = args.samples
sc.cycles.use_denoising = False
sc.cycles.volume_bounces = 1
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.view_settings.view_transform = 'Standard'

vol = bpy.data.volumes.new('sim')
ob = bpy.data.objects.new('sim', vol)
sc.collection.objects.link(ob)
# EmberGen writes Y up; Blender is Z up.
ob.rotation_euler = (math.pi / 2, 0, 0)


def volume_material(name, fire):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    pv = nt.nodes.new('ShaderNodeVolumePrincipled')
    pv.inputs['Density Attribute'].default_value = 'density'
    pv.inputs['Density'].default_value = DENSITY
    pv.inputs['Blackbody Intensity'].default_value = 0.0
    if fire:
        # Absorbs and glows, scatters nothing: the fire as seen through
        # the smoke, with no light of the sun's in it.
        pv.inputs['Color'].default_value = (0, 0, 0, 1)
        fl = nt.nodes.new('ShaderNodeAttribute')
        fl.attribute_name = 'flames'
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = FLAMES
        nt.links.new(fl.outputs['Fac'], mul.inputs[0])
        nt.links.new(mul.outputs[0], pv.inputs['Emission Strength'])
        pv.inputs['Emission Color'].default_value = (1, 1, 1, 1)
    else:
        pv.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
        pv.inputs['Emission Strength'].default_value = 0.0
    nt.links.new(pv.outputs[0], out.inputs['Volume'])
    return mat


fire_mat = volume_material('fire', True)
smoke_mat = volume_material('smoke', False)
vol.materials.append(fire_mat)

world = bpy.data.worlds.new('sky')
sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']

sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 3.0
sun_data.angle = math.radians(10)
sun = bpy.data.objects.new('sun', sun_data)
sc.collection.objects.link(sun)
# High, and a little in front and to the left of the camera, so the
# billows read as round.
sun.rotation_euler = (math.radians(35), 0, math.radians(-30))

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.clip_end = 5000
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
# Looking down the simulation's X, the picture's right its Z (world Y
# here): the sets are 193 voxels across in X and 385 in Z, and from the
# Z side a plume that reaches the domain's X wall shows it as a straight
# cut edge. Seen this way the wall is along the line of sight.
cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)


def bounds(path):
    """The frame's box in Blender's world, Z up, or None if it is empty."""
    vol.filepath = path
    vol.grids.load()
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ mathutils.Vector(c) for c in ob.bound_box]
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    if hi[0] - lo[0] < 1e-3:
        return None
    return lo, hi


# Every frame's box: the first and last frames that hold anything, and the
# box the camera keeps for all of them.
frames = sorted(files)
boxes = {f: bounds(files[f]) for f in frames}
full = [f for f in frames if boxes[f]]
first, last = full[0], full[-1]
n_cells = args.cols * args.rows
picked = [first + round(k * (last - first) / (n_cells - 1)) for k in range(n_cells)]
lo = [min(boxes[f][0][i] for f in full) for i in range(3)]
hi = [max(boxes[f][1][i] for f in full) for i in range(3)]
# The detonation point: the middle of the first frame that holds anything.
b0 = boxes[first]
origin = [(b0[0][i] + b0[1][i]) / 2 for i in range(3)]

work = args.work or tempfile.mkdtemp(prefix='fdfpv-explosions-')
os.makedirs(work, exist_ok=True)


def aim(cx, cz, side):
    cam_data.ortho_scale = side
    cam.location = (hi[0] + 100, cx, cz)


def render(path, fire, dest, res):
    vol.filepath = path
    vol.materials[0] = fire_mat if fire else smoke_mat
    # The fire pass is lit by nothing but itself; the smoke pass by the
    # sun and a dim, even sky.
    sun.hide_render = fire
    bg.inputs['Strength'].default_value = 0.0 if fire else 0.35
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.filepath = dest
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(dest)
    px = np.empty(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    # Blender's rows run bottom up.
    return px.reshape(res, res, 4)[::-1]


# The framing, from what the frames show rather than from their boxes: a
# box holds every faint wisp, and a cell framed on it gives the fireball a
# fraction of its pixels. A quick pass over the union box keeps the most
# opaque each pixel ever is; the cell is the square round everything that
# was ever more than CUT opaque, with MARGIN clear on each side so the
# mipmaps do not bleed one frame into the next.
CUT = 0.08
MARGIN = 0.03
SCOUT = 128
scout_side = max(hi[1] - lo[1], hi[2] - lo[2]) * 1.02
scout_cx, scout_cz = (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2
aim(scout_cx, scout_cz, scout_side)
samples = sc.cycles.samples
sc.cycles.samples = 8
most = np.zeros((SCOUT, SCOUT), dtype=np.float32)
for f in picked:
    most = np.maximum(most, render(files[f], False, os.path.join(work, 'scout.exr'), SCOUT)[..., 3])
sc.cycles.samples = samples
ys, xs = np.nonzero(most > CUT)
px = scout_side / SCOUT
x0 = scout_cx - scout_side / 2 + xs.min() * px
x1 = scout_cx - scout_side / 2 + (xs.max() + 1) * px
z1 = scout_cz + scout_side / 2 - ys.min() * px
z0 = scout_cz + scout_side / 2 - (ys.max() + 1) * px
side = max(x1 - x0, z1 - z0) / (1 - 2 * MARGIN)
cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
aim(cx, cz, side)
# Where the detonation point falls in a cell, from its top left corner.
origin_u = (origin[1] - cx) / side + 0.5
origin_v = 0.5 - (origin[2] - cz) / side
print(f'render.py: {NAME}: frames {first}..{last} of {frames[0]}..{frames[-1]}, '
      f'box x {lo[0]:.0f}..{hi[0]:.0f} y {lo[1]:.0f}..{hi[1]:.0f} z {lo[2]:.0f}..{hi[2]:.0f}, '
      f'cell {side:.1f} units round ({cx:.1f}, {cz:.1f}), detonation at u {origin_u:.3f} v {origin_v:.3f}')


def lum(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


todo = [args.test] if args.test is not None else picked
fire = np.zeros((len(todo), args.cell, args.cell), dtype=np.float32)
shade = np.zeros_like(fire)
opac = np.zeros_like(fire)
for k, f in enumerate(todo):
    a = render(files[f], True, os.path.join(work, f'fire_{f:04d}.exr'), args.cell)
    b = render(files[f], False, os.path.join(work, f'smoke_{f:04d}.exr'), args.cell)
    fire[k] = lum(a[..., :3])
    opac[k] = np.clip(b[..., 3], 0, 1)
    seen = opac[k] > 0.02
    s = np.where(seen, lum(b[..., :3]) / np.maximum(opac[k], 1e-4), 0)
    mean = float(s[seen].mean()) if seen.any() else 0.5
    shade[k] = np.where(seen, s, mean)
    print(f'render.py: frame {f} ({k + 1}/{len(todo)}): fire max {fire[k].max():.2f}, '
          f'opacity max {opac[k].max():.2f}, shade mean {mean:.2f}')

# The fire's scale: a high percentile of the lit texels, not the brightest,
# so one hot voxel does not dim every frame.
lit = fire[fire > 1e-3]
fire_max = float(np.percentile(lit, 99.7)) if lit.size else 1.0
shade_max = float(np.percentile(shade[opac > 0.02], 99.5)) if (opac > 0.02).any() else 1.0

rows = 1 if args.test is not None else args.rows
cols = 1 if args.test is not None else args.cols
sheet = np.zeros((rows * args.cell, cols * args.cell, 4), dtype=np.float32)
for k in range(len(todo)):
    r, c = divmod(k, cols)
    ys = slice(r * args.cell, (r + 1) * args.cell)
    xs = slice(c * args.cell, (c + 1) * args.cell)
    sheet[ys, xs, 0] = np.sqrt(np.clip(fire[k] / fire_max, 0, 1))
    sheet[ys, xs, 1] = np.clip(shade[k] / shade_max, 0, 1)
    sheet[ys, xs, 2] = opac[k]
sheet[..., 3] = 1

os.makedirs(args.out, exist_ok=True)
stem = f'{NAME}-test-{args.test}' if args.test is not None else NAME
png = os.path.join(work, f'{stem}.png')
h, w = sheet.shape[:2]
img = bpy.data.images.new(stem, w, h, alpha=True, float_buffer=False)
img.colorspace_settings.name = 'Non-Color'
img.pixels.foreach_set(sheet[::-1].reshape(-1))
img.filepath_raw = png
img.file_format = 'PNG'
img.save()
webp = os.path.join(args.out, f'{stem}.webp')
if not shutil.which('ffmpeg'):
    sys.exit('render.py: ffmpeg is needed for the lossless WebP')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', png, '-pix_fmt', 'rgb24', '-c:v', 'libwebp',
                '-lossless', '1', '-compression_level', '6', webp], check=True)

span_s = (last - first) / SIM_FPS
print(f'render.py: wrote {webp}, {w} x {h}, {os.path.getsize(webp)} bytes, '
      f'{w * h * 4 / 2 ** 20:.1f} MiB on the GPU as RGBA8 ({w * h * 4 * 4 / 3 / 2 ** 20:.1f} MiB with mipmaps)')
print(f'render.py: the simulation spans {span_s:.3f} s; fire scale {fire_max:.4f}, shade scale {shade_max:.4f}; '
      f'a cell is {side:.1f} simulation units')
print(f"render.py: explosion.js SHEET: {{ cols: {cols}, rows: {rows}, frames: {len(todo)}, "
      f"originU: {origin_u:.3f}, originV: {origin_v:.3f} }}")
