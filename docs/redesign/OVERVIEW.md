# The redesign, on one page

**A proposal, awaiting your approval.** Nothing on the player's screen has
changed. The detail is in PLAN.md beside this file.

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
the lobbies merge: the shared list of modes (nothing visible), Streamer
Combat's new name, the styles tidied (nothing visible), then the three hub
home, then Operations and the briefing, then the session's Solo, Friends,
Public, then the Hangar, then the controller screen.

## What we need from you

1. **The three hubs, keeping one click into a game?** Each hub card lists
   its games as links, so one click still lands in a lobby. *We recommend
   yes.*
2. **When you click a game, do you land in a public lobby (as you decided
   on 2 October) or alone?** *We recommend public, remembering each
   pilot's last choice.*
3. **"Friends" means "private, by invite code"**, since there is no friends
   list. *We recommend keeping the word, with "invite code" under it.*
4. **A condensed font for the names** (Saira Condensed, the same family as
   the new title lockup), or stay with the system's fonts? *We recommend
   Saira Condensed.*
5. **One accent colour per hub** over the same dark ground, rather than
   three colour schemes. *We recommend one accent.*
6. **Track mode becomes Track Day?** *We recommend yes.*
