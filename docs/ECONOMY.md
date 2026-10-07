# Progression and the economy: the contract (Waves 3 and 4, items 17 and 25)

**Status: CONTRACT** (2026-10-07, lane "progression"). Builds on
docs/redesign/PROGRESSION.md (the proposal, whose rules stand except where
the owner's decisions of 2026-10-07 change them, marked below). Each PR in
this lane ships one section of it and the check named there.

## 1. What the player sees

- **Aircraft mastery** in the Hangar: per aircraft, its flight time (already
  counted, src/share/flighttime.js) and its milestones: *first flight*,
  *ten minutes*, *an hour*. A milestone reached the first time pays XP once
  and shows as a pip on the aircraft's card.
- **Firsts from every activity** (PROGRESSION.md section 3, phase 1): a
  Defend the Paraná mission's first win and each of its stars the first time
  pays XP, once. Streamer Combat and Catch the Ace firsts follow in their
  own PR.
- **Tokens** (es: *Fichas*), the hangar's soft currency, shown beside the
  level in the Hangar. Earned two ways only:
  1. **firsts**: the same finite list of firsts that pay XP (a challenge, a
     mission star, an aircraft milestone) each pays tokens once;
  2. **Flight Club weekly events** (the flightclub lane): a placing in an
     event pays once per event.
  Never from repetition, never from logging in, never on a timer.
- **The shop** (Hangar, Shop card): cosmetic items with a token price, each
  previewed on the pilot's own aircraft before buying (the hangar's 3D view,
  wearing the item over the current paint, nothing saved until Buy).
- **Prestige items**: shown in the shop with how to earn them, never with a
  price. Granted by the server when the pilot's record shows the feat.

## 2. Rules (and what changed from PROGRESSION.md)

1. Firsts and bests pay; repetition never does (unchanged). The token list
   is FINITE by construction: built courses (infinite, anyone can make
   one) and laps pay XP as today and pay no tokens.
2. Three currencies, never exchanged: XP and levels open the hangar's
   level locks; war credits buy the war's loadout (src/game/campaign.js,
   unchanged); tokens buy cosmetics. **Changed:** PROGRESSION.md said two.
3. Nothing makes an aircraft better: the shop sells finishes and decals
   only (unchanged; owner 2026-10-05 and 2026-10-07).
4. **Changed (owner 2026-10-07):** Flight Club weekly events expire. What
   they paid does not: tokens and items are kept forever.
5. Unlock all opens level locks only. Shop and prestige items are owned,
   not unlocked, so Unlock all does not give them (lead decision,
   reversible; see section 8).
6. No real money in this lane. Paid cosmetics come later, on top.

## 3. Data shapes

### Progress (settings.progress, synced as section `progress`)

`v: 2`, adding to v1:

    firsts: { [key]: true }   // XP paid for this first, e.g. 'mission:m1:win',
                              // 'mission:m1:star2', 'aircraft:cub1400:hour'

    lessons: { [lessonId]: passedAtMs }   // training passes (training lane
                              // writes; lead decision 2026-10-07); merge:
                              // union, earliest pass wins; a known lesson
                              // passed is a first ('lesson:<id>', XP once)

Migration v1 to v2 (src/game/progress.js `PROGRESS_MIGRATIONS`, an ordered
list of pure steps, each `n` to `n + 1`): adds `firsts: {}`. A v1 pilot's
firsts are then paid on the next load by the same award path as a new one,
so a pilot who won a mission before this shipped gets its XP once, and a
second load pays nothing. Merge: `firsts` is a flag map, the union
(progressmerge.js FLAG_MAPS). An older build reading v2 keeps every field it
knows (normaliseProgress never fails on extra keys).

### The wallet (server only: tracks-api, migration 0005_wallet.sql)

    grants (account_id, key, amount, created_utc)  PRIMARY KEY (account_id, key)
    owned  (account_id, item, price, how, created_utc)  PRIMARY KEY (account_id, item)

The balance is `SUM(grants.amount) - SUM(owned.price)`, computed, never
stored, so it cannot drift from its parts. A grant key is paid at most once
by the primary key. A purchase is one INSERT whose WHERE holds the balance,
so two computers buying at once cannot overspend.

### The catalog (src/game/economy.js, pure, imported by the page and the server)

    GRANTS: key pattern -> amount, and grantsFrom(blob) -> [{ key, amount }]
    ITEMS:  [{ id: 'finish:pearl', kind: 'finish', price: 150 }
             { id: 'decal:ribbon', kind: 'decal', earn: 'mission:*:star3' }, ...]

`grantsFrom` reads only the synced blob (progress.challenges, the
campaign's stars, flightTime per airframe), so the server derives every
grant from what it already holds.

### Flight Club event payout (shape agreed with the flightclub lane)

    grant key:  'event:<eventId>:<tier>'   eventId e.g. '2026-w41-alps-sprint'
    tiers:      'finish' 20, 'bronze' 40, 'silver' 60, 'gold' 100
    server:     tracks-api/wallet.js grantEvent(env, accountId, eventId, tier)

One grant per event per tier reached (a gold also holds finish), so a pilot
re-flying an event pays nothing new. The flightclub lane decides when a
placing is final and calls grantEvent; this lane owns the table and the
amounts.

## 4. Storage, sync, and who is truth

- XP, firsts, challenges, stars, flight time: the synced blob, as today
  (client written, merged on the server: higher counts, union of flags).
- Tokens and ownership: the server. On every progress sync the server
  inserts the grants `grantsFrom(merged blob)` names (INSERT OR IGNORE),
  and every earned-only item whose feat the blob shows. The page caches the
  wallet it was last told (settings.wallet, not synced) only to draw it.
- **Honest limit:** the facts in the blob are written by the page, as XP is
  today, so an edited profile can claim firsts it never flew. Because the
  list is finite, the most it can mint is what flying everything pays; it
  cannot mint more. Server-observed facts (room results, verified laps) can
  replace page-claimed ones key by key later without changing the shapes.

## 5. API (tracks-api/accounts.js, bearer session as every account route)

    GET  /api/account/wallet          { balance, earned, owned: { [item]: how } }
    POST /api/account/wallet/buy      { item }  -> the wallet, or 404 unknown
                                      item, 409 already owned / earned only,
                                      402 too few tokens
    PUT  /api/account/progress        unchanged reply, plus `wallet`

Needs a VM deploy (tracks-api), with the migration applied by node.js at
start as every other.

## 6. Modules it builds on

src/game/progress.js (levels, unlockables, lockOf), src/game/campaign.js
(stars), src/share/flighttime.js (per aircraft seconds),
src/share/progressmerge.js (sync), tracks-api/accounts.js and d1sqlite.js,
src/ui/progress-ui.js (toasts), the hangar's 3D view and src/render/finish.js
and decals.js (the preview).

## 7. What it does NOT do

No dailies, logins, streaks or timers. No paid items. No item that changes
flight. No exchange between currencies. No tokens for laps or built
courses. No change to what a level opens today. No ranks.

## 8. Questions for the owner (built the recommended way, reversible)

1. Chrome is a level unlock today. The plan names it as an earned-only
   prestige item; moving it would take it from pilots who have it.
   **Recommended:** keep chrome as is; prestige items are new (a gold
   finish, campaign ribbons).
2. Unlock all and shop items. **Recommended:** Unlock all does not give
   tokens' items (rule 5), or tokens mean nothing.
3. Token amounts and prices (sections 3 and 9) are the lead's guesses,
   balanced so a pilot who flies everything once can buy the whole shop.

## 9. Checks

- `progress:selftest`: migration of every stored shape (no `v`, v1 with
  stars already earned, v2) gives v2; migrating twice is a no op; a first
  pays once; mastery milestones from a seeded flightTime.
- `economy:selftest` (Node, CI): grantsFrom is finite (a blob with every
  fact pays exactly the ceiling), repetition adds nothing, war credits and
  tokens never convert, every ITEM id is a real finish or decal.
- `test:tracks` (accounts-selftest): a sync grants once, a second sync
  grants nothing, a buy past the balance is 402, two buys race to one,
  a seeded v1 account blob syncs to v2 and its old stars pay.
- Shop: a browser check (run-check-slot) that previews an item on the
  aircraft with a real pointer, buys it, and reads the wallet back.
