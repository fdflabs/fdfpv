/*
 * devhooks.js: developer mode, and the index of every window.__ hook.
 *
 * The browser checks drive the shell through window.__ hooks. The ones
 * that only read may ship to every pilot; the ones that change state
 * (place the craft, damage a part, start a war, open a screen) register
 * only in developer mode: the page opened with ?dev=1, or served from a
 * local host, which is where every check runs (tests/lib/server.js
 * listens on 127.0.0.1). A state changing hook is assigned to devHooks
 * instead of window, so on a public host it lands in an object nothing
 * can reach.
 *
 * HOOKS is the index: every hook src defines (and __showSticks, the one
 * src reads that a check sets), with what it changes, or
 * null for one that only reads and stays on window. `npm run lint:shell`
 * fails a hook missing from it, a hook assigned to the wrong one of the
 * two, and a page on a public host that shows a gated hook, so a new
 * hook that changes state cannot ship ungated without saying here that
 * it does not. In developer mode window.__dev.help() lists it.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* A developer's own machine, by the page's hostname: the one rule for
 * developer mode, the Itaipu map's local data (src/maps/itaipu.js) and
 * index.html's front door, which runs before any module and keeps a copy
 * (lint:shell fails the two apart). Whole names only, so
 * localhost.example.org is public; URL.hostname keeps IPv6's brackets. */
export const LOCAL_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

export function isLocalHost(hostname) {
  return LOCAL_HOST.test(hostname);
}

/* Whether a page at `loc` (a Location or URL) is in developer mode. */
export function devOpen(loc) {
  return new URLSearchParams(loc.search).get('dev') === '1' || isLocalHost(loc.hostname);
}

/* Read once, as the module loads: the shell rewrites its own query later
 * (src/ui/nav.js, src/share/rooms.js), and a gate that read it again could
 * close on a page that opened in developer mode. */
export const DEV = typeof window !== 'undefined' && devOpen(window.location);

/* Where a state changing hook is assigned: window in developer mode, else
 * an object of its own that nothing else holds. */
export const devHooks = DEV ? window : Object.create(null);

/* [name, what it changes]; null: reads only, ungated. */
export const HOOKS = [
  ['__accountSync', 'sends the account\'s settings and progress to the accounts server now'],
  ['__aids', null],
  ['__air', null],
  ['__airFlown', null],
  ['__animMs', null],
  ['__animTo', 'runs the map\'s animation clock to a step'],
  ['__attract', null],
  ['__audio', 'the audio engine itself'],
  ['__avionicsHud', null],
  ['__avionics', 'denies telemetry, switches the avionics AI, seeds tracks'],
  ['__boot', null],
  ['__briefCard', null],
  ['__budget', null],
  ['__camGround', null],
  ['__campaign', 'the campaign: progress and its screens'],
  ['__canopyTop', 'puts a flat canopy over the loaded map'],
  ['__carouselChords', null],
  ['__carouselStats', null],
  ['__celCount', null],
  ['__colliderBoxes', null],
  ['__colliderShapes', null],
  ['__colliders', null],
  ['__contacts', null],
  ['__controlRec', null],
  ['__cover', 'sets the roofs\' cover for the next contact sweep'],
  ['__craft', null],
  ['__craftPaint', null],
  ['__craftState', null],
  ['__crash', null],
  ['__crashBreak', 'breaks a part of the craft'],
  ['__crashCam', 'opens the crash cam, seeks it, saves and takes over'],
  ['__crashCamLast', null],
  ['__crashLog', null],
  ['__crashPosts', null],
  ['__crashSetDamage', 'sets a part\'s damage'],
  ['__crashSolids', null],
  ['__crashTable', null],
  ['__crashThrow', 'throws the craft at a pose and speed, resetting the plant'],
  ['__crashWater', null],
  ['__daytime', null],
  ['__debrief', null],
  ['__dev', 'this index (help)'],
  ['__drawOff', 'skips the draw while the frame loop runs'],
  ['__dynres', null],
  ['__flightLog', null],
  ['__flightMode', null],
  ['__fpvOsd', null],
  ['__frameFault', null],
  ['__frameMs', 'fixes the frame step'],
  ['__gateScale', null],
  ['__gpu', null],
  ['__gpuMemory', null],
  ['__ground', null],
  ['__hangarPartAt', null],
  ['__hangarRev', null],
  ['__heightAt', null],
  ['__hit', null],
  ['__input', 'the input layer: sticks, keys, devices'],
  ['__intro', null],
  ['__lastSwap', null],
  ['__link', 'switches the radio link preset'],
  ['__loading', null],
  ['__map', null],
  ['__mapFlows', null],
  ['__mapGates', 'hands the map a mission\'s gate state'],
  ['__mapLeaf', null],
  ['__mapOpening', 'opens the dam where the war\'s damage would'],
  ['__mapReplayWater', null],
  ['__mapScene', 'the map\'s scene graph'],
  ['__maps', null],
  ['__mode', null],
  ['__mouseLock', null],
  ['__nearSolid', null],
  ['__nextGate', null],
  ['__opsCampaign', 'the ops campaign screen'],
  ['__ops', 'an ops match: start, skip, end, the camera ball'],
  ['__opsHud', null],
  ['__peerMarkRole', 'sets a peer\'s marked role'],
  ['__peerMarks', null],
  ['__perfOverlay', null],
  ['__pickCombat', null],
  ['__pickLook', null],
  ['__pickPaint', null],
  ['__pickParts', null],
  ['__pids', null],
  ['__placeCraft', 'drops the craft level and airborne at a world point'],
  ['__quadScreen', null],
  ['__rain', null],
  ['__releasePose', 'frees a pose held by __seatCraft'],
  ['__renderStats', null],
  ['__respawn', 'resets the craft at a map point'],
  ['__rolesBoard', null],
  ['__roofTop', null],
  ['__roofs', null],
  ['__roomCreate', 'makes a room and joins it'],
  ['__roomJoin', 'joins a room by code'],
  ['__roomMute', 'mutes a seat'],
  ['__roomSay', 'reports a pilot or a name to the room'],
  ['__roomSlots', null],
  ['__rooms', null],
  ['__screen', null],
  ['__seatCraft', 'seats the craft on the ground or the water and holds the pose'],
  ['__sensors', 'the avionics sensor: mode, zoom, recording'],
  ['__setCam', 'parks the camera at a pose'],
  ['__setMap', 'loads a world as ?map= would'],
  ['__setTune', 'switches the tune'],
  ['__shellReady', null],
  ['__showSticks', 'set by a check: shows the stick overlay whatever flies (read through devHooks)'],
  ['__spawnStarts', null],
  ['__stepTrace', null],
  ['__stick', 'holds the sticks at the given channels'],
  ['__stickPath', null],
  ['__surface', null],
  ['__surfaceMaterial', null],
  ['__three', null],
  ['__touch', null],
  ['__traffic', null],
  ['__trackPoint', null],
  ['__training', 'the training screen'],
  ['__tune', null],
  ['__ui', 'the shell: every screen, setting and button'],
  ['__voice', 'the room\'s voice: microphone and peers'],
  ['__voiceUi', 'the voice panel'],
  ['__walkStats', null],
  ['__war', null],
  ['__warAt', null],
  ['__warCutaway', null],
  ['__warCutawayTest', 'plays a war cutaway cue'],
  ['__warDebug', 'draws the attackers\' debug overlay (true, false); with no argument reads what it drew'],
  ['__warDo', 'the war host\'s start, briefing and end, and in a developer room skip and complete'],
  ['__warFxBurst', 'sets off a swarm of explosions ahead of the camera'],
  ['__warHear', 'hands the war a message as if from the room'],
  ['__warIntro', null],
  ['__warIntroWatch', 'plays the war\'s briefing film'],
  ['__warMap', null],
  ['__warMapLog', 'starts or stops the war map\'s log'],
  ['__warMapLogged', null],
  ['__water', null],
  ['__waterSample', null],
  ['__wavesOn', 'turns the title\'s waves on'],
  ['__wear', null],
  ['__weather', 'sets the weather and its seed'],
  ['__weatherFlown', null],
  ['__wetFrame', 'draws one frame at a rain intensity'],
  ['__wetHold', 'holds the rain intensity'],
  ['__wingDoor', null],
  ['__wreckAudit', null],
];

const GATED = HOOKS.filter(([, changes]) => changes !== null);

devHooks.__dev = {
  /* Every gated hook and what it changes; `all` adds the readers. */
  help(all = false) {
    return (all ? HOOKS : GATED).map(([name, changes]) => ({ name, changes, gated: changes !== null }));
  },
};
