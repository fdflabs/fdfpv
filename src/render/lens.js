/*
 * lens.js: the FPV camera's field of view, mount and shake, in one file
 * with no imports so the shell's camera, the Settings list and the shared
 * orbit clip all read the same lens without depending on each other.
 *
 * The field of view is not the figure printed on an FPV camera. Those
 * lenses are near equidistant fisheyes (r = f theta) and their 150 to 160
 * degrees is total coverage; three.js draws rectilinear (r = f tan theta).
 * What a pilot judges a gate by is the magnification in the middle of the
 * frame, and the two projections agree there when tan(v / 2) equals the
 * fisheye's vertical half angle in radians. A 155 degree diagonal lens on a
 * 4:3 sensor has a 46.5 degree (0.8116 rad) vertical half angle, so v is
 * about 78 degrees. Typing 100 in, as the list once did, drew the middle of
 * the frame 1.47 times too small, which was the report "the gates feel
 * small".
 *
 * 85 is the default, not 78, because a racer must also see the next gate
 * before pointing at it: 85 still gives 117 degrees across a 16:9 panel
 * and the middle 1.30 times larger than at 100. The stops bracket it.
 * 115 is the widest stop, asked for by a pilot naming the HDZero nano's
 * 162: on 16:9 it covers about 141 degrees across, past that lens's 132,
 * at 0.58 of the default's centre magnification. Wider needs a fisheye
 * shader, not a bigger number.
 *
 * Apparent size belongs to this file alone. GATE_SCALE (src/game/track.js)
 * and WORLD_SCALE (src/render/frame.js) change metres, and a bigger gate
 * seen from proportionally further away is the same picture.
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

/* Vertical field of view stops, degrees. */
export const CAMERA_FOVS = [75, 85, 95, 105, 115];
export const CAMERA_FOV_DEFAULT = 85;

/*
 * Camera tilt in whole degrees up from the airframe: the angle of the TPU
 * mount, not a look-at. 0 looks along the nose, 30 is cruising, 45 to 55
 * racing; a ticket of 2026-08-18 found the old menu stopped at 40 for no
 * reason the airframe gave. The FPV view and the model's mount both turn
 * by this about the body X axis, so the quad in Settings shows what the
 * goggles see. The viewpoint stays at the mount's pivot at every angle.
 */
export const CAMERA_ANGLE_MIN = 0;
export const CAMERA_ANGLE_MAX = 55;
export const CAMERA_ANGLE_DEFAULT = 30;

/* A stored or typed angle, rounded to a degree and held in range; anything
 * that is not a finite number is the default. */
export function clampCameraAngle(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return CAMERA_ANGLE_DEFAULT;
  }
  const degrees = Math.round(value);
  return degrees < CAMERA_ANGLE_MIN ? CAMERA_ANGLE_MIN : degrees > CAMERA_ANGLE_MAX ? CAMERA_ANGLE_MAX : degrees;
}

export function cameraTiltRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/*
 * Where the camera sits on the airframe, body frame metres from the CG:
 * the five inch's mount, which every quad's view still uses. The 1.8 cm of
 * height matters: a roll turns about the CG's axis, so a camera above it
 * swings sideways, 0.21 m/s at a 670 deg/s roll, and that parallax is what
 * says the lens is on a machine. Kept here so the view and the model read
 * one number (they once said 7.75 cm and 8.0 cm). The lens glass is a
 * further 2.42 cm out along the look axis; the plant samples it so a nose
 * down crash cannot put the picture under the ground.
 */
export const CAMERA_MOUNT_FORWARD = 0.080;
export const CAMERA_MOUNT_UP = 0.018;
export const CAMERA_LENS_FORWARD = 0.104;
export const CAMERA_LENS_UP = 0.018;

/*
 * How far the FPV lens is held off the ground, render only. The session's
 * near plane is 0.2 m, so a lens looking down into the dirt (or inverted)
 * needs more than the centimetre level flight keeps, or the near plane
 * cuts into the terrain.
 */
export const FPV_FLOOR_CLEAR = 0.012;
export const FPV_NEAR_CLEAR = 0.22;

/* camFwdY and camUpY: the camera's forward and up axes' world Y. */
export function fpvLensClear(camFwdY, camUpY) {
  const intoGround = camFwdY < -0.12 || camUpY < 0.35;
  return intoGround ? FPV_NEAR_CLEAR : FPV_FLOOR_CLEAR;
}

/*
 * Lens shake: the plate the camera shares with the flight controller
 * vibrates, so the picture should show it.
 *
 * Real vibration is at the prop fundamental, 130 to 430 Hz, which no
 * display can show; what an FPV feed shows is its slow beat against the
 * camera's frame rate, plus frame flex. So the shake is noise band passed
 * between 3 and 14 Hz: a fast first order low pass of white noise, less a
 * slower low pass of that. Amplitude follows rotor speed squared, the
 * imbalance law the gyro noise uses, up to 0.06 degrees RMS at full
 * throttle, about two thirds of a pixel at 1080p and 85 degrees (0.22 was
 * flown and called too much).
 *
 * Both filters are exact exponentials of the frame's dt, but the band's
 * gain still moves with frame rate (RMS 0.601 at 30 fps, 0.755 at 60,
 * 0.871 at 240). For first order filters with poles a (fast) and b (slow)
 * on unit variance noise it has a closed form,
 *
 *   var(slow)       = (1 - b)(1 + ab) / ((1 + b)(1 - ab))
 *   cov(fast, slow) = (1 - b) / (1 - ab)
 *   var(band)       = 1 + var(slow) - 2 cov(fast, slow)
 *
 * so each frame divides by its own band RMS and the shake measures the
 * same at any rate. Render only, so Math.random is allowed.
 */
const BAND_HIGH_HZ = 14;
const BAND_LOW_HZ = 3;
const FULL_THROTTLE_RMS_RAD = 0.06 * Math.PI / 180;
/* The frame is stiffer in yaw, as on the gyro. */
const AXIS_GAIN = [1, 0.6, 1];

function bandRms(a, b) {
  const ab = a * b;
  const slowVar = ((1 - b) * (1 + ab)) / ((1 + b) * (1 - ab));
  const crossCov = (1 - b) / (1 - ab);
  const v = 1 + slowVar - 2 * crossCov;
  return v > 1e-6 ? Math.sqrt(v) : 1;
}

/* Roughly normal, unit scale: three uniforms summed is close enough for a
 * sub pixel effect and cheaper than Box Muller. */
function noise() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
}

/*
 * One shake per camera. update(dtMs, rpmFraction) takes the frame's wall
 * delta and mean rotor speed as a fraction of full throttle, and returns a
 * small rotation in radians about the camera's own axes, in the same
 * object every frame.
 */
export function makeLensShake() {
  const axes = ['x', 'y', 'z'].map((name, i) => ({ name, gain: AXIS_GAIN[i], fast: 0, slow: 0 }));
  const rotation = { x: 0, y: 0, z: 0 };
  return {
    update(dtMs, rpmFraction) {
      const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
      const w = -dt * 2 * Math.PI;
      const a = Math.exp(w * BAND_HIGH_HZ);
      const b = Math.exp(w * BAND_LOW_HZ);
      const inject = Math.sqrt(1 - a * a);
      const throttle = rpmFraction > 0 ? Math.min(rpmFraction, 1) : 0;
      const scale = (FULL_THROTTLE_RMS_RAD * throttle * throttle) / bandRms(a, b);
      /* A plain loop: this runs every frame and must not allocate. */
      for (const axis of axes) {
        axis.fast = axis.fast * a + inject * noise();
        axis.slow = axis.slow * b + (1 - b) * axis.fast;
        rotation[axis.name] = (axis.fast - axis.slow) * scale * axis.gain;
      }
      return rotation;
    },
  };
}
