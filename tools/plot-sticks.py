# plot-sticks.py: the four sticks against time from a hover-video.js run.
#   python3 -I tools/plot-sticks.py run.json out.png
#
# This file is part of the Paraguayan Drone Combat Simulator, GPLv3; see the header of any
# JavaScript file in this repository for the full notice.
import json
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

run = json.load(open(sys.argv[1]))
s = run['sticks']
t = [x[0] for x in s]
fig, ax = plt.subplots(5, 1, figsize=(9, 8), sharex=True)
for i, name in enumerate(['roll', 'pitch', 'yaw', 'throttle']):
    ax[i].step(t, [x[i + 1] for x in s], where='post')
    ax[i].set_ylabel(name)
    ax[i].set_ylim(-1.05 if i < 3 else -0.05, 1.05)
    if run.get('kind') != 'pull':
        ax[i].axvspan(0, 3, color='0.9')
    ax[i].grid(True, alpha=0.3)
pull = run.get('kind') == 'pull'
ax[4].plot(t, [x[6] for x in s], label='bank, deg' if pull else 'nose off vertical, deg')
ax[4].plot(t, [x[5] for x in s], label='roll rate, deg/s')
ax[4].legend(loc='upper right', fontsize=8)
if pull:
    ax[4].set_xlabel('s: throttle closed, then half up elevator held from 1 s')
    fig.suptitle(f"{run['tune']}: power off pull, bank {run['result'].get('pull', {}).get('bank', 0):.0f} deg at the end")
else:
    ax[4].set_xlabel('s since the hand over (grey: the 3 s to catch it)')
    fig.suptitle(f"{run['tune']}: a person's hover, held {run['result'].get('human', {}).get('held', 0):.1f} s of 10")
fig.tight_layout()
fig.savefig(sys.argv[2], dpi=90)
