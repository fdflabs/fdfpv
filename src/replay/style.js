/*
 * style.js: the crash cam's screen, in the hangar's and the carousel's
 * language: dark glass cards, amber tracked labels, mint for the one thing
 * to press, cream pills for a choice made. src/replay/editor.js puts it in
 * a style element: the page's own CSS is inline in index.html, and a
 * separate stylesheet would be one more file every server has to know the
 * type of.
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

export const CRASHCAM_CSS = `
.cc {
  --cc-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --cc-ease: cubic-bezier(0.2, 0.9, 0.25, 1);
  --cc-glass: linear-gradient(180deg, rgba(22, 30, 24, 0.9), rgba(10, 14, 11, 0.93));
  --cc-line: rgba(243, 234, 212, 0.12);
  position: fixed; inset: 0; z-index: 40;
  font-family: var(--ui-font); color: var(--cream);
  user-select: none; -webkit-user-select: none;
}
.cc[hidden], .cc [hidden], .cc-prompt[hidden] { display: none !important; }
#ui.cc-open > * { visibility: hidden !important; }

.cc-stage { position: absolute; inset: 0; cursor: grab; }
.cc-stage.dragging { cursor: grabbing; }

/* ---- the head ---- */
.cc-top {
  position: absolute; left: 0; right: 0; top: 0;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 18px 22px; pointer-events: none;
  background: linear-gradient(180deg, rgba(8, 11, 9, 0.55), rgba(8, 11, 9, 0));
  animation: cc-down 420ms var(--cc-ease) both;
}
.cc-top > * { pointer-events: auto; }
.cc-title {
  display: flex; align-items: center; gap: 10px;
  font: 700 12px/1 var(--ui-font); letter-spacing: 0.24em; text-transform: uppercase; color: var(--amber);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
}
.cc-title::before { content: ""; width: 22px; height: 2px; border-radius: 1px; background: var(--amber); }
.cc-rec {
  width: 8px; height: 8px; border-radius: 50%; background: #ff5a5a;
  box-shadow: 0 0 10px rgba(255, 90, 90, 0.8); animation: cc-pulse 1.1s ease-in-out infinite;
}
.cc-name {
  margin-top: 8px; font-size: clamp(22px, 3vw, 34px); font-weight: 800; letter-spacing: 0.005em; line-height: 1;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
}
.cc-sub { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
.cc-chip {
  font: 600 12px/1 var(--ui-font); letter-spacing: 0.06em; color: var(--amber);
  padding: 6px 11px; border-radius: 999px;
  background: rgba(12, 18, 14, 0.62); border: 1px solid rgba(255, 212, 92, 0.3);
  font-variant-numeric: tabular-nums;
}
.cc-chip.mint { color: var(--mint); border-color: rgba(125, 255, 180, 0.35); }
.cc-chip.slate { color: var(--slate); border-color: rgba(157, 179, 200, 0.3); }
.cc-chip.cream { color: var(--cream); border-color: rgba(243, 234, 212, 0.3); }
.cc-chip.rig { color: var(--rig); border-color: color-mix(in srgb, var(--rig) 45%, transparent); }
.cc-head-actions { display: flex; gap: 8px; }

/* ---- buttons ---- */
.cc-btn {
  appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font: 700 13px/1 var(--ui-font); letter-spacing: 0.03em; color: var(--cream);
  padding: 10px 16px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  background: rgba(12, 18, 14, 0.55); border: 1px solid rgba(243, 234, 212, 0.3);
  transition: transform 220ms var(--cc-spring), border-color 140ms, background 140ms, color 140ms;
}
.cc-btn:hover:not(:disabled) { border-color: var(--cream); transform: translateY(-1px); }
.cc-btn:active:not(:disabled) { transform: translateY(0) scale(0.97); }
.cc-btn:disabled { opacity: 0.32; cursor: default; }
.cc-btn.primary { background: var(--mint); color: var(--deep); border-color: var(--mint); }
.cc-btn.primary:hover:not(:disabled) { background: #a6ffcc; }
.cc-btn.danger { color: #ffb4b4; border-color: rgba(255, 140, 140, 0.45); }
.cc-btn.danger:hover:not(:disabled) { border-color: #ff9a9a; background: rgba(255, 90, 90, 0.12); }
.cc-btn.on { background: var(--cream); color: var(--deep); border-color: var(--cream); }
.cc-btn.small { padding: 8px 12px; font-size: 12px; }
.cc-kbd {
  display: inline-block; min-width: 1.2em; padding: 2px 5px; border-radius: 5px;
  font: 700 10px/1.2 var(--ui-font); letter-spacing: 0.04em; text-align: center;
  color: inherit; opacity: 0.75; border: 1px solid currentColor;
}
.cc-btn.primary .cc-kbd, .cc-btn.on .cc-kbd { opacity: 0.6; }
.cc-icon {
  appearance: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--cream); background: rgba(243, 234, 212, 0.05); border: 1px solid rgba(243, 234, 212, 0.18);
  transition: transform 220ms var(--cc-spring), border-color 140ms, color 140ms, background 140ms;
}
.cc-icon:hover { border-color: var(--mint); color: var(--mint); transform: translateY(-1px); }
.cc-icon svg { width: 16px; height: 16px; fill: currentColor; }
.cc-icon.play { width: 50px; height: 50px; background: var(--mint); color: var(--deep); border-color: var(--mint); }
.cc-icon.play svg { width: 20px; height: 20px; }
.cc-icon.play:hover { background: #a6ffcc; color: var(--deep); }

/* ---- segmented pills ---- */
.cc-seg {
  display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px;
  background: rgba(12, 18, 14, 0.62); border: 1px solid rgba(243, 234, 212, 0.14);
}
.cc-seg button {
  appearance: none; border: 0; background: transparent; color: var(--slate);
  font: 600 12px/1 var(--ui-font); letter-spacing: 0.04em; font-variant-numeric: tabular-nums;
  padding: 8px 11px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  transition: background 160ms, color 160ms;
}
.cc-seg button:hover:not(:disabled) { color: var(--cream); }
.cc-seg button.on { background: var(--cream); color: var(--deep); box-shadow: 0 2px 10px rgba(243, 234, 212, 0.2); }
.cc-seg button:disabled { opacity: 0.3; cursor: default; }
.cc-seg.speed button.on { background: var(--amber); }
.cc-seg.rigs button.on { background: var(--rig); }

/* ---- the dock ---- */
.cc-dock {
  position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom));
  transform: translateX(-50%); width: min(1240px, calc(100% - 32px)); box-sizing: border-box;
  padding: 14px 18px 12px; border-radius: 18px;
  background: var(--cc-glass); border: 1px solid var(--cc-line);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(243, 234, 212, 0.06);
  animation: cc-up 460ms var(--cc-ease) both;
}
.cc-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 12px; }
.cc-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cc-label {
  font: 700 10px/1 var(--ui-font); letter-spacing: 0.18em; text-transform: uppercase; color: var(--slate);
  margin-right: 2px;
}
.cc-time {
  font: 700 15px/1 var(--ui-font); font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
  min-width: 118px; text-align: center;
}
.cc-time small { color: var(--slate); font-weight: 600; }
.cc-select {
  appearance: none; font: 600 12px/1 var(--ui-font); color: var(--cream);
  background: rgba(12, 18, 14, 0.62); border: 1px solid rgba(243, 234, 212, 0.2); border-radius: 999px;
  padding: 8px 12px; cursor: pointer; max-width: 170px;
}
.cc-select:disabled { opacity: 0.3; }
.cc-hints { margin-top: 10px; font-size: 11px; color: var(--slate); letter-spacing: 0.02em; text-align: center; opacity: 0.85; }
.cc-hints b { color: var(--cream); font-weight: 700; }

/* ---- the timeline: a strip of shots under the moments ---- */
.cc-timeline { position: relative; height: 56px; cursor: pointer; touch-action: none; }
.cc-strip {
  position: absolute; left: 0; right: 0; top: 18px; height: 34px; border-radius: 8px;
  background: rgba(243, 234, 212, 0.06); box-shadow: inset 0 0 0 1px rgba(243, 234, 212, 0.1);
}
.cc-blocks { position: absolute; inset: 0; border-radius: 8px; overflow: hidden; }
.cc-shot {
  --rig: var(--cream);
  position: absolute; top: 0; bottom: 0; box-sizing: border-box; overflow: hidden;
  display: flex; align-items: center; gap: 6px; padding: 0 9px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--rig) 34%, transparent), color-mix(in srgb, var(--rig) 18%, transparent));
  border-top: 3px solid var(--rig);
  font: 700 11px/1 var(--ui-font); letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap;
  color: var(--rig); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  transition: background 160ms;
}
.cc-shot small { font-weight: 600; letter-spacing: 0.04em; text-transform: none; color: var(--cream); opacity: 0.85; }
.cc-shot.sel { box-shadow: inset 0 0 0 2px var(--cream); background: color-mix(in srgb, var(--rig) 42%, transparent); }
.rig-chase { --rig: #ffd45c; }
.rig-orbit { --rig: #7dffb4; }
.rig-free { --rig: #7cc8ff; }
.rig-tripod { --rig: #c8a2ff; }
.rig-fpv { --rig: #ff9a76; }
.rig-follow { --rig: #f3ead4; }
.cc-hatch {
  position: absolute; top: 0; bottom: 0; pointer-events: none;
  background: repeating-linear-gradient(135deg, rgba(8, 11, 9, 0.72) 0 5px, rgba(8, 11, 9, 0.5) 5px 10px);
}
.cc-grips { position: absolute; inset: 0; }
.cc-grip {
  position: absolute; top: -4px; bottom: -4px; width: 16px; margin-left: -8px; cursor: ew-resize;
  display: flex; align-items: center; justify-content: center; z-index: 1;
}
.cc-grip i {
  display: flex; align-items: center; justify-content: center; width: 12px; height: 26px; border-radius: 4px;
  background: rgba(12, 18, 14, 0.9); box-shadow: 0 0 0 1px rgba(243, 234, 212, 0.35), 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: transform 200ms var(--cc-spring), box-shadow 140ms;
}
.cc-grip svg { width: 10px; height: 22px; fill: var(--cream); stroke: var(--cream); }
.cc-grip.in svg, .cc-grip.out svg { fill: none; stroke: var(--amber); }
.cc-grip.blend svg, .cc-grip.glide svg { stroke: var(--mint); }
.cc-grip:hover i { transform: scale(1.12); box-shadow: 0 0 0 1px var(--cream), 0 2px 10px rgba(0, 0, 0, 0.6); }
.cc-headline {
  position: absolute; top: 12px; width: 2px; height: 44px; margin-left: -1px; border-radius: 1px; z-index: 2;
  background: var(--cream); box-shadow: 0 0 10px rgba(243, 234, 212, 0.6); pointer-events: none;
}
.cc-headline::after {
  content: ""; position: absolute; left: -5px; top: 0; width: 12px; height: 12px; border-radius: 50%;
  background: var(--cream); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.cc-pop {
  position: absolute; top: -40px; z-index: 3; display: flex; gap: 6px;
  animation: cc-fade 160ms ease both;
}
.cc-pop .cc-seg { background: rgba(12, 18, 14, 0.94); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
.cc-mark {
  position: absolute; top: 0; transform: translateX(-50%);
  appearance: none; border: 0; padding: 0 4px; background: transparent; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.cc-mark i { display: block; width: 9px; height: 9px; transform: rotate(45deg); border-radius: 2px; }
.cc-mark.off i { background: var(--mint); box-shadow: 0 0 8px rgba(125, 255, 180, 0.7); }
.cc-mark.impact i { background: var(--amber); border-radius: 50%; transform: none; box-shadow: 0 0 8px rgba(255, 212, 92, 0.7); }
.cc-mark span {
  position: absolute; bottom: 100%; margin-bottom: 4px; white-space: nowrap;
  font: 700 10px/1 var(--ui-font); letter-spacing: 0.08em; text-transform: uppercase;
  padding: 4px 7px; border-radius: 6px; background: rgba(12, 18, 14, 0.92); border: 1px solid var(--cc-line);
  opacity: 0; transform: translateY(4px); transition: opacity 140ms, transform 200ms var(--cc-spring); pointer-events: none;
}
.cc-mark.off span { color: var(--mint); }
.cc-mark.impact span { color: var(--amber); }
.cc-mark:hover span, .cc-mark:focus-visible span { opacity: 1; transform: translateY(0); }

/* ---- the controls hidden, for a clean look at the shot ---- */
.cc-gone { opacity: 0 !important; pointer-events: none !important; transition: opacity 220ms ease; }
.cc-top, .cc-dock, .cc-osd { transition: opacity 220ms ease; }
.cc-bare {
  position: absolute; right: 18px; bottom: 16px; pointer-events: none;
  font: 600 11px/1 var(--ui-font); letter-spacing: 0.08em; color: var(--slate);
  padding: 6px 10px; border-radius: 999px; background: rgba(12, 18, 14, 0.5);
  animation: cc-fade 400ms ease 600ms both;
}

/* ---- overlays on the picture ---- */
.cc-osd {
  position: absolute; left: 26px; bottom: 210px; pointer-events: none;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.85); font-variant-numeric: tabular-nums;
  display: grid; grid-template-columns: auto auto; gap: 2px 14px; align-items: baseline;
}
.cc-osd .k { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--slate); }
.cc-osd .v { font-size: 20px; font-weight: 600; }
.cc-thr { width: 96px; height: 5px; border-radius: 3px; background: rgba(243, 234, 212, 0.2); overflow: hidden; align-self: center; }
.cc-thr i { display: block; height: 100%; background: var(--amber); }
.cc-toast {
  position: absolute; left: 50%; top: 92px; transform: translate(-50%, 0);
  font: 700 14px/1 var(--ui-font); letter-spacing: 0.04em; padding: 11px 18px; border-radius: 999px;
  background: rgba(12, 18, 14, 0.9); border: 1px solid rgba(125, 255, 180, 0.4); color: var(--mint);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); pointer-events: none;
  animation: cc-pop 320ms var(--cc-spring) both;
}

/* ---- My clips ---- */
.cc-modal {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(6, 9, 7, 0.55); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
  animation: cc-fade 200ms ease both;
}
.cc-card {
  width: min(980px, calc(100% - 32px)); max-height: calc(100% - 64px); box-sizing: border-box;
  display: flex; flex-direction: column; border-radius: 18px; padding: 20px 22px;
  background: var(--cc-glass); border: 1px solid var(--cc-line);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(243, 234, 212, 0.06);
  animation: cc-pop 360ms var(--cc-spring) both;
}
.cc-card-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cc-card-head .cc-name { font-size: clamp(22px, 2.6vw, 30px); }
.cc-list {
  margin-top: 16px; overflow-y: auto; min-height: 120px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px;
  scrollbar-width: thin; scrollbar-color: rgba(243, 234, 212, 0.25) transparent;
}
.cc-clip {
  display: flex; flex-direction: column; border-radius: 13px; overflow: hidden;
  border: 1px solid rgba(243, 234, 212, 0.14); background: rgba(243, 234, 212, 0.035);
  transition: transform 240ms var(--cc-spring), border-color 160ms;
}
.cc-clip:hover { transform: translateY(-2px); border-color: rgba(243, 234, 212, 0.45); }
.cc-thumb {
  position: relative; aspect-ratio: 16 / 9; background: #0b100c center / cover no-repeat;
  display: flex; align-items: flex-end; justify-content: flex-end;
}
.cc-thumb.none::before {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 30% 20%, rgba(125, 255, 180, 0.12), transparent 60%),
    linear-gradient(135deg, rgba(255, 212, 92, 0.08), transparent);
}
.cc-dur {
  position: relative; margin: 8px; font: 700 11px/1 var(--ui-font); font-variant-numeric: tabular-nums;
  padding: 5px 8px; border-radius: 6px; background: rgba(8, 11, 9, 0.8); color: var(--cream);
}
.cc-clip-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.cc-clip-name { font: 700 15px/1.2 var(--ui-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-clip-name input {
  width: 100%; box-sizing: border-box; font: 700 15px/1.2 var(--ui-font); color: var(--cream);
  background: rgba(12, 18, 14, 0.8); border: 1px solid var(--mint); border-radius: 7px; padding: 4px 7px;
  user-select: text; -webkit-user-select: text;
}
.cc-clip-meta { font-size: 12px; color: var(--slate); }
.cc-clip-actions { display: flex; gap: 6px; flex-wrap: nowrap; }
.cc-clip-actions .cc-btn.small { padding: 7px 10px; }
.cc-clip-actions .danger { margin-left: auto; }
.cc-empty { grid-column: 1 / -1; padding: 40px 10px; text-align: center; color: var(--slate); font-size: 14px; line-height: 1.5; }
.cc-confirm {
  width: min(440px, calc(100% - 32px)); box-sizing: border-box; border-radius: 16px; padding: 22px;
  background: var(--cc-glass); border: 1px solid rgba(255, 212, 92, 0.35);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); animation: cc-pop 320ms var(--cc-spring) both;
}
.cc-confirm p { margin: 10px 0 18px; font-size: 15px; line-height: 1.45; }
.cc-confirm .cc-group { justify-content: flex-end; }

/* ---- the export dialog ---- */
.cc-export {
  width: min(460px, calc(100% - 32px)); box-sizing: border-box; border-radius: 16px; padding: 20px 22px;
  background: var(--cc-glass); border: 1px solid var(--cc-line);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(243, 234, 212, 0.06);
  animation: cc-card 320ms var(--cc-spring) both;
}
.cc-export-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cc-export-len { font: 700 15px/1 var(--ui-font); font-variant-numeric: tabular-nums; }
.cc-export-form { margin-top: 18px; display: grid; gap: 12px; }
.cc-export-row { display: grid; grid-template-columns: 76px 1fr; align-items: start; gap: 10px; }
.cc-export-row > .cc-label { padding-top: 12px; }
.cc-export-note { margin-top: 6px; font-size: 12px; line-height: 1.4; color: var(--slate); }
.cc-export-notes p { margin: 12px 0 0; font-size: 12px; line-height: 1.45; color: var(--slate); }
.cc-export .warn { color: var(--amber); }
.cc-export-progress { margin-top: 18px; }
.cc-export-barrow { display: flex; align-items: center; gap: 12px; }
.cc-bar { flex: 1; height: 10px; border-radius: 5px; overflow: hidden; background: rgba(243, 234, 212, 0.12); }
.cc-bar i { display: block; height: 100%; width: 0; border-radius: 5px; background: linear-gradient(90deg, rgba(125, 255, 180, 0.55), var(--mint)); transition: width 160ms linear; }
.cc-export-pct { font: 700 14px/1 var(--ui-font); font-variant-numeric: tabular-nums; min-width: 42px; text-align: right; }
.cc-export-actions { margin-top: 20px; justify-content: flex-end; }

/* ---- the prompt in flight ---- */
.cc-prompt {
  position: fixed; left: 50%; bottom: 17%; transform: translateX(-50%); z-index: 8;
  display: flex; align-items: center; gap: 10px; pointer-events: none;
  font: 700 clamp(15px, 1.8vw, 19px)/1 var(--ui-font); letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--amber); text-shadow: 0 3px 10px rgba(0, 0, 0, 0.9);
  padding: 8px 14px; border-radius: 6px; background: rgba(16, 22, 17, 0.62);
  animation: cc-pop 360ms var(--cc-spring) both;
}
.cc-prompt b {
  display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px;
  padding: 0 6px; box-sizing: border-box; border-radius: 6px; letter-spacing: 0;
  color: var(--deep); background: var(--amber); text-shadow: none; font-size: 14px;
}

@keyframes cc-up { from { opacity: 0; transform: translate(-50%, 24px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes cc-down { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: none; } }
@keyframes cc-pop { from { opacity: 0; transform: translate(-50%, 6px) scale(0.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.cc-card, .cc-confirm { animation-name: cc-card; }
@keyframes cc-card { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes cc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cc-pulse { 50% { opacity: 0.35; } }
@media (max-width: 900px) {
  .cc-osd { bottom: 290px; }
}
`;
