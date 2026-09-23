# Fixed wing, stage 1: the aircraft and the model

The reference aircraft, every number the plant is built from with its
formula and source, the conventions, and the check table with its bands.
`docs/WING-PLAN.md` is the plan; `docs/WING-PROGRESS.md` the state.

## The aircraft

A 1000 mm span flying wing of the ZOHD Dart XL and AR Wing 900 class:
the wing most FPV pilots start on, pusher motor, elevons, winglets, hand
launched, belly landed. Where the two published aircraft disagree the
numbers below are the Dart XL's. Where a number is estimated it says so.

| Quantity | Value | How |
| --- | --- | --- |
| Span b | 1.000 m | manufacturer |
| Wing area S | 0.220 m² | manufacturer |
| Mean chord c = S/b | 0.220 m | derived |
| Aspect ratio AR = b²/S | 4.55 | derived |
| All-up mass m | 0.650 kg | manufacturer's 0.45 kg airframe with a 4S 2200 mAh pack and FPV gear |
| Weight W = mg | 6.38 N | g = 9.81 |
| Wing loading W/S | 29.0 N/m² | derived |
| CL max | 0.90 | a reflexed flying wing section; Anderson, Introduction to Flight, ch. 5, and the class's stall behaviour |
| CD0 | 0.030 | small UAV flying wing, Beard and McLain, Small Unmanned Aircraft, appendix E |
| Oswald e | 0.80 | same |
| Induced drag factor k = 1/(π e AR) | 0.0875 | derived |
| Lift slope CLα = 2π AR/(AR+2) | 4.36 /rad | Helmbold for low AR |
| Stall angle α_s = CL max / CLα | 11.8 deg | derived |
| Motor, cells, kV | 2216, 4S, 1400 kV | manufacturer |
| Prop | 6 x 4 in | manufacturer |
| No-load rpm = kV x 14.8 V | 20,720 | derived |
| Pitch speed V_p = rpm/60 x pitch x 0.85 | 29.8 m/s | derived, 0.85 for slip |
| Static thrust T_s | 11.5 N | manufacturer's bench figure for the motor and prop on 4S |
| Thrust to weight | 1.80 | derived |
| Inertia Ixx, Iyy, Izz | 0.016, 0.006, 0.020 kg m² | ESTIMATED: the mass sits in the centre third of the span, a flat plate of that width and the chord |
| Elevon travel | ±25 deg | manufacturer |

## Derived performance, the bands the plant must land in

Computed from the numbers above with a level flight balance L = W,
T = D and the thrust model below, by the script recorded at the end of
this file. The band is the derived figure with room for the estimated
inputs, and never wider.

| Check | Derived | Band |
| --- | --- | --- |
| W1 level speed at 65 percent throttle | 15.2 m/s | 13.5 to 17.5 |
| W2 stall speed, level, power off | 7.25 m/s | 6.8 to 8.2 |
| W3 glide ratio, power off, best glide | 9.76 at 9.0 m/s | 8.5 to 11 |
| W4 top speed, level, full throttle | 23.8 m/s | 22 to 27 |
| W5 roll rate, full elevon at 20 m/s | 250 deg/s | 180 to 300 |
| W6 turn radius at 60 deg bank | V²/(g tan 60°), 23.5 m at 20 m/s | within 15 percent of the formula at the speed flown |
| W7 climb rate, full throttle, best | 11.5 m/s at 12.5 m/s | 8 to 13 |
| W8 hand throw at 8 m/s, 60 percent throttle | airborne after 3 s, above 1 m | pass or fail |
| W9 throttle chop from cruise | glides, pitch stays within ±30 deg for 3 s | pass or fail |
| W10 the five inch unmoved | verify check 2 hash | identical |
| W11 Node and Chrome agree on a wing trace | SHA-256 | identical |

## Conventions

The quad's, unchanged: world right handed, Z up; body X forward, Y left,
Z up; SI throughout; 1000 Hz fixed step; the state block's twenty
doubles with the motor in RPM slot 0 and zeros in slots 1 to 3. The
relative wind in the body frame is (u, v, w). Angle of attack
α = atan2(-w, u), positive with the nose above the wind. Sideslip
β = atan2(v, sqrt(u² + w²)), positive with the wind from the left.
Dynamic pressure q = ½ ρ V², ρ = 1.225 kg/m³, V = |(u, v, w)|.

## The model

Forces in the wind axes, then rotated into the body frame:

- Lift L = q S CL(α), along the body Z axis rotated by α, positive up.
- Drag D = q S CD(α, β), along the relative wind, opposing it.
- Side force Y = q S CYβ β, CYβ = -0.30 /rad.
- Thrust T along body X from the motor model.
- Weight in the world frame.

CL below the stall is CLα α plus the elevon lift CLδe δe with
CLδe = 0.35 /rad. Above it CL blends to a flat plate's 2 sin α cos α over
a smoothstep of ±3 deg about α_s, and CD to 2 sin² α over the same
blend, on top of CD0 + k CL². The blend is a cubic smoothstep rather than
the sigmoid in Beard and McLain, so the libm needs no exponential.

Moments, with p, q, r the body rates and the rate terms made
dimensionless by b/2V and c/2V, V floored at 1 m/s:

- Roll: q S b [ Clβ β + Clp p b/2V + Clδa δa ], Clβ = -0.05, Clp = -0.40, Clδa = 0.10.
- Pitch: q S c [ Cm0 + Cmα α + Cmq q c/2V + Cmδe δe ], Cm0 = +0.02 (reflex), Cmα = -0.30, Cmq = -4.0, Cmδe = -0.60.
- Yaw: q S b [ Cnβ β + Cnr r b/2V ], Cnβ = 0.05 (winglets), Cnr = -0.10.
- Motor torque reaction: a roll moment of 0.02 m times thrust, the
  sign of the prop's rotation.

Elevons: the right and left surfaces are δe ± δa, each clipped to
±25 deg, from the sticks through the rates and expo in the wing's tune
diff, computed in C. Yaw stick does nothing; a flying wing has no
rudder, and the note in Settings says so.

Motor: duty d from the throttle stick, floored at 0.02 so the prop never
stops on screen, thrust T = T_s d² (1 − V / (V_p d)) clipped at zero, rpm
for the renderer and the sound = 0.85 d rpm_no_load.

Integration: semi-implicit Euler at 1 ms as the quad, quaternion
increment through the fixed sin and cos, renormalised each step.

Ground: a belly hull of five points, nose, tail, both wingtips and the
belly centre, through the existing contact path with a friction of 0.6
and no bounce, so a landing skids to a stop. A throw is an initial
velocity along the body X axis at the given speed, level, from a
standing start at 1.5 m; there is no launch stand.

## The script that made the numbers

```
rho=1.225 g=9.81 b=1.0 S=0.22 m=0.65 CLmax=0.90 CD0=0.030 e=0.80
k=1/(pi e AR); Vs=sqrt(2W/(rho S CLmax)); CLopt=sqrt(CD0/k); LDmax=CLopt/(2 CD0)
T(V,d)=max(0, Ts d^2 (1 - V/(Vp d))); D(V)=q S (CD0 + k CL^2) with CL=W/(q S)
level speed at duty d: bisect T(V,d)=D(V); climb=(T-D)V/W; roll p=(Clda δ)/(-Clp)(2V/b)
```
