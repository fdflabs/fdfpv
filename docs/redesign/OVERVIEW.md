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

Small steps, each one finished and checked before the next, starting after
the lobbies merge: the shared list of modes (nothing visible), the two
new names (Track Day, Streamer Combat), the styles tidied (nothing visible), then the three hub
home, then Operations and the briefing, then the session's Solo, Friends,
Public, then the Hangar, then the controller screen.

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
