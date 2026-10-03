# The redesign, on one page

**Approved on 2 October.** Nothing on the player's screen has changed
yet. The detail is in PLAN.md beside this file.

## What you asked for

An aviation simulator that happens to contain combat. A home with three
places to go: **Operations** (the campaign), **Flight Club** (free flight,
racing, Streamer Combat, Catch the Ace), **Hangar** (aircraft, loadouts,
upgrades, the controller). One way to play anything: choose it, set up
the session (alone, friends or public), press Ready, fly. Multiplayer is a
setting of the session, not a mode.

## What we found in the game

- **Most of it is already there.** The one click lobbies (about to merge)
  are exactly the session you describe: every game has a lobby, Ready
  alone starts it, friends drop in, everyone goes back to the lobby after
  a round. It is one lobby for every game, not five; a handful of special
  cases need folding in.
- **The game already lists its modes as data, in four places.** The plan
  merges them into one list that the menus and the server both read, so a
  new mode is one entry.
- **Breadcrumbs, lobby slots with Ready, mission cards with stars, the
  controller calibration with live sticks, a 3D hangar with paint, parts,
  power and tuning: all exist.** The redesign rearranges and restyles them.

## What we will not copy from the mockups

- No military insignia, no "Fuerza Aérea Paraguaya", no roundel, no flag
  hung vertically. The flag stays horizontal.
- No invented aircraft (Condor-06, Tacuara...), stats, ranks, battery
  health, maintenance hours or difficulty levels. The hangar shows the 20
  real aircraft and the numbers the game really computes.
- No Quick Mission, Intercept, Recon or Strike: Operations holds Defend the
  Paraná, the one operation that exists, and opens on its missions.
- No AI teammates: the game has none yet, so the session hides that row.
- No AI pictures: every card and background is a render of our own maps
  and aircraft, as the title cards are today.

## How it will look

The same dark tactical ground the menus have now, with one accent per
place: blue for Operations, a warm copper for Flight Club, steel for the
Hangar. Names in a strong condensed face, sentences in a plain readable
one, numbers in monospace. Cards with a picture, a name, one sentence and
two to four tags. Calm motion, nothing that loops on a menu.

There is a new page for us, not for players: the **UI playground**, which
shows every button, card, row, lobby slot and dialog in one place, drawn
with the game's own styles, so every screen is built from the same parts.

## The order

Small steps, each one finished and checked before the next (PLAN.md
section 5 has all eighteen): the shared list of modes (done, in review),
the two new names, the campaign's engine and films, the styles tidied,
the three hub home, Solo, Friends and Public, then the controller question
and training, Operations and the briefing, one debrief after every
flight, then progression, the Hangar, wind, a watch seat, and last an AI
race opponent.

## The pillars (new, 3 October)

Your ChatGPT thread's "Game Pillars" is now docs/PILLARS.md, rewritten so
every line is true for this game: each feature says whether it exists,
is being built, or is planned. Three more pages follow it:
PROGRESSION.md (reasons to come back, no grind), SESSIONS.md (choose what,
then who, then Ready) and TRAINING.md (from the first stick to the first
defence). Where we chose differently from the thread, the page says why;
the biggest ones:

- **Damage stays physical.** The plant already breaks props and wings;
  the screen just says Operational, Impaired or Destroyed.
- **No Strike operation and no ranks**: the war is defend only, and a
  rank is an insignia by another name.
- **No difficulty slider and no fake AI**: pilot count, the mission's
  seed and the assists are the difficulty; the AI row stays hidden until
  a real AI pilot flies the same physics.
- **Two economies, kept apart**: flying opens planes, the war's credits
  buy the war's loadout; nothing expires and nothing grinds.
- **Training and controllers moved up**: the first five minutes decide
  whether a radio pilot stays.

What we need from you on these is at the end of PLAN.md: whether the war
pays XP, the war's speed upgrade, wind in Flight Club, a watch seat, the
first screen asking what you fly with, and training before the debrief.

## What you decided

1. **Three hubs**, each listing its games as links, so one click still
   lands in a lobby.
2. **A game opens a public lobby**, and remembers each pilot's last
   choice of Solo, Friends or Public.
3. **"Friends" means private, by invite code.**
4. **Saira Condensed** for hub and game names, the same family as the
   title lockup.
5. **One accent per hub**: blue Operations, copper Flight Club, steel
   Hangar, over the same dark ground.
6. **Track mode becomes Track Day**, and **Toilet paper combat becomes
   Streamer Combat**, the toilet paper kept in its description and art.
7. **No AI pilots for now.** They come in a later phase.
