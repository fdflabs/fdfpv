# The wing: what to fly, and what would count as wrong

Every band in `docs/WING-STAGE1.md` holds, every check in `docs/WING-PROGRESS.md`
is green, and none of that says whether the wing feels like a wing. The
upstream author rejected a whoop plant that passed every band, on feel.
This page asks for that judgement once, with something concrete to fly
each time, so a "feels wrong" comes back as a thing that can be measured.

Pick the fourth card on the title, Fixed wing. Press L to throw. The
sticks are the elevons: pitch and roll on the right stick in mode 2,
throttle on the left. Yaw does nothing; a flying wing has no rudder.
There is no flight controller and nothing levels the wing for you.

Fly each of the six below, in order. For each, the paragraph says what a
real 1000 mm wing does, then what would count as wrong here. Write down
the wrong ones with the numbers on the screen at the time: the speed in
the corner (it reads in km/h; seven metres a second is 25), the height
line, and roughly what the sticks were doing.

## 1. The throw

Real: a hand throw at ten metres a second with a little power on sinks
for a moment, picks up speed, and is flying by the time it is a wing
length ahead of you. With no power it settles onto the grass a few
lengths out.

Try: throw with L at half throttle, sticks neutral, then throw again at
zero throttle.

Wrong if: it climbs away on its own at half throttle without you pulling
back (a real one does not), or it pitches up and stalls straight off the
hand at zero throttle instead of settling, or the nose swings left or
right on release with the sticks centred.

## 2. The throttle chop

Real: chopping the throttle from cruise, a wing keeps its attitude and
starts to sink; the nose drops a little as it slows to its trim speed
and it glides, roughly ten metres forward for every metre down. It is
quiet and it takes seconds, not a moment.

Try: from level cruise at half throttle, close the throttle and leave the
sticks alone for three seconds.

Wrong if: the nose pitches up or down by more than about thirty degrees
by itself, or it falls out of the sky like a quad with the throttle cut,
or it keeps flying level with no sink at all. The band for this is W9;
what the band cannot see is whether the glide feels heavy or floaty.
Say which, and at what airspeed.

## 3. The stall

Real: slow down with steadily more up elevator and the wing mushes:
the sink rate rises, the controls go soft, and somewhere around seven
metres a second the nose drops on its own, sometimes one wing first.
Release the stick and it recovers in a couple of lengths.

Try: from a glide, hold a little up and let the speed bleed off. Watch
the airspeed. When it breaks, centre the stick.

Wrong if: it never breaks and just sinks level at any speed, or it
breaks violently into a spin that centring the stick does not stop
within a few seconds, or the break comes at a speed far from seven (the
band says 6.8 to 8.2 metres a second; a pilot will feel eight and ten
as very different things).

## 4. Roll heft at speed

Real: a flying wing with elevons rolls fast, about a quarter turn a
second at full stick at speed, and the roll gets crisper as the wing
gets faster because the elevons have more air over them. At a walk it
rolls lazily. Rolling also costs a little pitch: some up is needed
through a roll to keep the nose from dropping.

Try: at full throttle in level flight, full roll stick for one second,
then the same at the slowest speed it will hold level.

Wrong if: the roll rate feels the same at both speeds, or it rolls so
fast at speed that it is not controllable (the band is 180 to 300
degrees a second; say if it feels above or below), or the roll needs no
pitch correction at all, or rolling produces a large unexpected yaw
swing.

## 5. The turn

Real: banked to sixty degrees at twenty metres a second a wing turns
in about twenty five metres, and it needs a lot of up elevator to hold
height in the turn, more the steeper the bank. Let go of the up and the
nose falls through and the wing dives out of the turn.

Try: a steady sixty degree bank at cruise, holding height with up
stick. Then the same bank with the pitch stick released.

Wrong if: it holds height in the turn with no up stick, or it cannot
turn inside the field's width at any bank, or the turn radius feels the
same at all speeds.

## 6. Where the camera sits

Real: a wing camera sits in the nose, a little above the wing, looking
straight ahead or a few degrees up. In cruise the horizon sits a little
below the middle of the picture and stays there; the wing itself is not
in frame. Banked, the horizon tilts and the picture is otherwise steady.

Try: cruise, then a turn, then a glide, looking only at the picture.

Wrong if: the horizon sits far from the middle in cruise (it is set at
five degrees up, the same as a real nose camera would be shimmed), or
the picture bobs on every stick input, or the wing's own nose fills the
bottom of the frame.

## What comes back

Send the wrong ones. Each becomes either a number the derivation got
wrong (a coefficient in `docs/WING-STAGE1.md` and a band that moves for a
stated reason) or a shell fix. Nothing about the plant is tuned by ear:
if the wing feels wrong and every band holds, the band is questioned
first, and the answer is written down next to it.

Not in this handover, and still needing a hand: the board on Render, one
real lap posted to it, two browsers in a live room, and the whoop
physics decision.
