/*
 * roombrowser.js: the Rooms screen and the Make a room screen (the owner,
 * 2026-09-28: "have it list in the lobby the rooms that are up, I want it
 * to be easy for people to join rooms and everyone to see every room,
 * also when creating room let me name it").
 *
 *   Rooms          the lobby (the owner, 2026-09-30: "the rooms needs to
 *                  be made more clear, there needs to be a lobby"): the
 *                  room this pilot is in, on top, with Leave; then every
 *                  open public room, live (src/share/roomlist.js), its
 *                  name, world, pilots and game, one press to join,
 *                  busiest first, an empty one with the minutes before it
 *                  closes; a quick join on this world; the way to make a
 *                  room and to join a private one with its code
 *   Make a room    a typed name (or the room's picked one), public or
 *                  private, the world, and a game to set it up for
 *
 * The rows are the menu's (src/ui/ui.js draws them, stick and keys and
 * mouse alike); what they do is here, so src/main.js only wires this to
 * the room's socket. Private rooms are never listed and keep their codes.
 *
 * A TYPED NAME is the one piece of free text in a room. The shape is
 * checked here to answer at once, but the rooms server decides, with the
 * tracks server's word filter (edge/rooms/front.js): a name it refuses
 * comes back as an error on this screen and nothing is made.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { ROOM_MODES, ROOM_NAME_REPORT, normaliseRoomName } from '../share/roomwire.js';
import { closesInMin, createRoomList } from '../share/roomlist.js';
import { MAPS, mapById } from '../maps/registry.js';
import { plural, str } from '../strings/index.js';

const ROOM_ACTION = 'friends-room-';
/* Rooms on the title's panel: the busiest few with a seat. */
const TITLE_ROOMS = 3;

/*
 * ui: the menu (show, askForm, refreshFriends); link: the room socket
 * (src/share/rooms.js); roomName(pick): a picker name in this pilot's
 * language; here(): the world this pilot is in; preset(): the game a
 * title card set up, or null; war(room): the shell's way into Defend
 * Itaipu (src/main.js DEFEND ITAIPU), which asks its consent question and
 * makes the room itself, resolving its code once it has; pilots(): how
 * many are in the room this pilot is in, them included; missions(): the
 * war missions this pilot may start, in order; missionNumber(id): a
 * mission's number.
 */
export function createRoomBrowser({
  ui, link, roomName, here, preset = () => null, war = null, pilots = () => 1, missions = () => [], missionNumber = () => 1,
}) {
  /*
   * WHERE THE CURSOR LANDS. Rooms opened before its list has ever arrived
   * draws Make a room as its primary, and the cursor lands there. When the
   * list then arrives with a room to join, that room is the primary, and
   * the cursor moves to it, once, if it is still where it landed: without
   * this a pilot who pressed Enter on what the screen now showed first
   * opened Make a room instead (found on the live server, where the first
   * answer takes longer than a local one).
   */
  let landedOn = null;
  const list = createRoomList(() => {
    ui.refreshFriends();
    const here = ui.items()[ui.cursor];
    if (landedOn && ui.screen === 'rooms' && list.rooms() !== null) {
      if (here && here.action === landedOn) {
        ui.setCursor(ui.restoreCursor());
      }
      landedOn = null;
    }
  });
  const worlds = () => MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id);
  let draft = null;
  let busy = false;
  let error = null;
  /* The code of the room whose name this pilot reported, for the note. */
  let reportedIn = null;
  /* The code of the last room joined from the list, never to be shown. */
  let joined = null;

  /*
   * DEFEND ITAIPU ON THE GAME ROW, for a room on the Itaipu map, public or
   * private since the owner opened it (2026-10-01, docs/WARFARE-PLAN.md
   * section 9), with the mission it starts with. The shell makes the room
   * (war: its consent first), set up for the war and that mission.
   */
  const warFits = (d) => Boolean(war) && d.map === 'itaipu';

  function fresh() {
    const w = worlds();
    return { name: null, public: list.open() !== false, map: w.includes(here()) ? here() : w[0], mode: preset() };
  }

  /* A room's name as this pilot reads it: typed, or picked. */
  function title(r) {
    return r.name || roomName(r.pick);
  }

  function doing(r) {
    return r.game ? str(`roombrowser.${r.game}_${r.state}`, { n: missionNumber(r.mission), w: r.wave ?? 1, of: r.waves ?? 1 }) : str('roombrowser.free');
  }

  /* What a room's pilots column says: full, how many of how many, or,
   * empty, how long before it closes (null from an older server).
   * `closes` is the string for the minutes: the title's chips are narrow. */
  function load(r, closes = 'roombrowser.empty_closes') {
    if (r.n >= r.cap) {
      return str('roombrowser.full');
    }
    if (r.n > 0) {
      return str('roombrowser.count', { n: r.n, cap: r.cap });
    }
    const min = closesInMin(r);
    return min == null ? str('roombrowser.empty_room') : min > 0 ? str(closes, { n: min }) : str('roombrowser.empty_closing');
  }

  function roomRow(r) {
    const full = r.n >= r.cap;
    const vars = { world: mapById(r.map).name, doing: doing(r) };
    const battle = r.game === 'war' && r.state !== 'waiting';
    const note = str(full ? 'roombrowser.row_full_note' : battle ? 'roombrowser.row_battle_note' : r.n ? 'roombrowser.row_note' : 'roombrowser.row_empty_note', vars);
    return full
      ? { label: title(r), value: load(r), note, info: true }
      : { label: title(r), value: load(r), note, action: `${ROOM_ACTION}${r.code}` };
  }

  /* The room this pilot is in, on top of the lobby, with Leave. */
  function hereRows() {
    const st = link.state();
    if (st.phase !== 'open' || !st.welcome) {
      return [];
    }
    const w = st.welcome;
    return [
      { label: str('roombrowser.here_section'), section: true },
      {
        label: w.public ? title(w) : str('roombrowser.here_private', { code: st.code }),
        value: plural('count.pilots', pilots()),
        note: str('roombrowser.here_note'),
        action: 'friends-here',
      },
      { label: str('friends.leave'), note: str('friends.leave_note'), action: 'friends-leave' },
    ];
  }

  /* The open rooms, the one this pilot is in aside: it is on top. */
  function openRooms() {
    const rooms = list.rooms();
    const st = link.state();
    return rooms && st.phase === 'open' ? rooms.filter((r) => r.code !== st.code) : rooms;
  }

  function listRows() {
    const rooms = openRooms();
    const heading = { label: str('roombrowser.open_section'), section: true };
    if (list.open() === false) {
      return [heading, { label: str('roombrowser.closed'), note: str('roombrowser.closed_note'), info: true }];
    }
    if (rooms === null) {
      return [heading, { label: str(list.failed() ? 'roombrowser.unreachable' : 'roombrowser.looking'), info: true }];
    }
    if (!rooms.length) {
      return [heading, { label: str('roombrowser.empty'), note: str('roombrowser.empty_note'), info: true }];
    }
    const rows = rooms.map(roomRow);
    const first = rows.find((row) => row.action);
    if (first) {
      first.primary = true;
    }
    return [heading, ...rows];
  }

  /* While the server is full it makes no new public room, so a quick join
   * with no room of this world to land in is said, not tried. */
  function quickRow(world) {
    const seat = (list.rooms() || []).some((r) => r.map === here() && r.n < r.cap);
    if (list.busy() && !seat) {
      return { label: str('roombrowser.quick'), value: world, note: str('roombrowser.busy'), info: true };
    }
    return { label: str('roombrowser.quick'), value: world, note: str('roombrowser.quick_note', { world }), action: 'friends-quick' };
  }

  function browserRows() {
    const world = mapById(here()).name;
    const quick = list.open() === false ? [] : [quickRow(world)];
    return [
      ...hereRows(),
      ...listRows(),
      { label: str('roombrowser.more_section'), section: true },
      { label: str('roombrowser.new'), note: str('roombrowser.new_note'), action: 'roomnew', primary: !(openRooms() || []).some((r) => r.n < r.cap) },
      ...quick,
      { label: str('friends.join'), note: str('friends.join_note'), action: 'friends-join' },
    ];
  }

  function choiceRow(label, note, values, current, format, set) {
    const i = Math.max(0, values.indexOf(current));
    return {
      label,
      note,
      value: format(current),
      current: String(i),
      options: values.map((v, k) => ({ value: String(k), label: format(v) })),
      pick: (k) => {
        set(values[Number(k)]);
        ui.refreshFriends();
      },
      adjust: (d) => {
        set(values[(i + d + values.length) % values.length]);
        ui.refreshFriends();
      },
    };
  }

  function newRows() {
    draft ??= fresh();
    const open = list.open() !== false;
    if (!open) {
      draft.public = false;
    }
    /* A draft that stops fitting the war, made public or moved to another
     * world, drops it rather than keeping a game it cannot run. */
    if (draft.mode === 'war' && !warFits(draft)) {
      draft.mode = null;
    }
    return [
      {
        label: str('roombrowser.name'),
        value: draft.name || str('roombrowser.name_picked'),
        note: str('roombrowser.name_note'),
        action: 'friends-roomname',
      },
      open
        ? choiceRow(str('roombrowser.kind'), str(draft.public ? 'roombrowser.public_note' : 'roombrowser.private_note'),
          [true, false], draft.public, (v) => str(v ? 'roombrowser.public' : 'roombrowser.private'), (v) => {
            draft.public = v;
          })
        : { label: str('roombrowser.kind'), value: str('roombrowser.private'), note: str('roombrowser.closed_note'), info: true },
      choiceRow(str('ui.the_world'), str('roombrowser.world_note'), worlds(), draft.map, (id) => mapById(id).name, (id) => {
        draft.map = id;
      }),
      choiceRow(str('roombrowser.game'), str('roombrowser.game_note'), [null, ...ROOM_MODES, ...(warFits(draft) ? ['war'] : [])], draft.mode,
        (m) => str(`roombrowser.mode_${m || 'none'}`), (m) => {
          draft.mode = m;
        }),
      ...(draft.mode === 'war' && missions().length
        ? [choiceRow(str('roombrowser.mission'), str('roombrowser.mission_note'), missions(), missions().includes(draft.mission) ? draft.mission : missions()[0],
          (id) => str('campaign.mission_n', { n: missionNumber(id) }), (id) => {
            draft.mission = id;
          })]
        : []),
      {
        label: str(busy ? 'roombrowser.making' : 'roombrowser.make'),
        note: error || str(draft.public ? (list.busy() ? 'roombrowser.busy' : 'roombrowser.make_public_note') : 'roombrowser.make_private_note'),
        action: 'friends-make',
        primary: true,
      },
    ];
  }

  async function askName() {
    const got = await ui.askForm({
      title: str('roombrowser.name_title'),
      detail: str('roombrowser.name_detail'),
      confirmLabel: str('ui.save'),
      fields: [{
        key: 'name',
        label: '',
        value: draft.name || '',
        maxLength: 64,
        placeholder: str('roombrowser.name_placeholder'),
        rules: str('roombrowser.name_rules'),
        /* Blank is allowed, and means the picked name: an object, because
         * askForm reads a falsy answer as a refusal. */
        save: (v) => {
          if (!String(v).trim()) {
            return { name: null };
          }
          const name = normaliseRoomName(v);
          return name ? { name } : null;
        },
      }],
    });
    if (got) {
      draft.name = got.name.name;
      error = null;
    }
    ui.refreshFriends();
  }

  async function make() {
    if (busy) {
      return;
    }
    busy = true;
    error = null;
    ui.refreshFriends();
    try {
      if (draft.mode === 'war') {
        /* False: the pilot said Back to the consent question, and the
         * form stays as it was. */
        const mission = missions().includes(draft.mission) ? draft.mission : null;
        const code = await war({ name: draft.name, public: draft.public, mission });
        if (code) {
          joined = draft.public ? code : null;
          draft = null;
        }
      } else {
        const code = await link.create(draft.map, false, { public: draft.public, name: draft.name, mode: draft.mode });
        joined = draft.public ? code : null;
        draft = null;
        link.join(code);
        ui.show('friends');
      }
    } catch (e) {
      error = str(e.message === 'name' ? 'roombrowser.bad_name' : e.message === 'busy' ? 'roombrowser.busy' : 'roombrowser.make_failed');
    }
    busy = false;
    ui.refreshFriends();
  }

  /* The title panel's line: how many rooms and pilots, or why none. */
  function summary() {
    const rooms = list.rooms();
    if (list.open() === false) {
      return str('roombrowser.closed');
    }
    if (rooms === null) {
      return str(list.failed() ? 'roombrowser.unreachable' : 'roombrowser.looking');
    }
    if (!rooms.length) {
      return str('roombrowser.title_none');
    }
    const pilots = rooms.reduce((n, r) => n + r.n, 0);
    const counted = plural('count.rooms', rooms.length);
    return pilots ? str('roombrowser.title_count', { rooms: counted, pilots: plural('count.pilots', pilots) })
      : str('roombrowser.title_count_empty', { rooms: counted });
  }

  return {
    /* The title's rooms panel (src/ui/ui.js renderTitleRooms): its line,
     * then the rooms, All rooms and Make a room. `lobby:` actions go the
     * Fly with friends card's way in first (ui.js act). */
    titleItems() {
      const open = (openRooms() || []).filter((r) => r.n < r.cap).slice(0, TITLE_ROOMS);
      return [
        { lobby: 'head', section: true, label: str('roombrowser.title'), value: summary() },
        ...open.map((r) => ({
          lobby: 'room',
          label: title(r),
          /* A room made for the war says so, and which mission. */
          value: r.game === 'war' && r.state !== 'waiting'
            ? str('roombrowser.chip_battle', { n: missionNumber(r.mission), w: r.wave ?? 1, of: r.waves ?? 1 })
            : r.game === 'war'
              ? str('roombrowser.chip_war', { n: missionNumber(r.mission), load: load(r, 'roombrowser.chip_empty') })
              : load(r, 'roombrowser.chip_empty'),
          join: str(r.game === 'war' && r.state !== 'waiting' ? 'roombrowser.join_battle' : 'roombrowser.join'),
          action: `lobby:${ROOM_ACTION}${r.code}`,
        })),
        { lobby: 'all', label: str('roombrowser.all'), action: 'lobby:rooms' },
        { lobby: 'make', label: str('roombrowser.new'), action: 'lobby:roomnew' },
      ];
    },
    /* The Rooms and Make a room screens' rows, Back aside. */
    rows(screen) {
      return screen === 'roomnew' ? newRows() : browserRows();
    },
    /* The Fly with friends screen's way in, when not in a room; `failed`
     * is why the last join did not work, or null. */
    entryRow(failed) {
      const rooms = list.rooms();
      const value = rooms === null ? '' : str(rooms.length ? 'roombrowser.entry_value' : 'roombrowser.entry_none', { n: rooms.length });
      return { label: str('roombrowser.title'), value, note: failed || str('roombrowser.entry_note'), action: 'rooms', primary: true };
    },
    /* In a room: its name, and a typed one's report row. */
    nameRows(w) {
      if (!w || !w.pick) {
        return [];
      }
      const row = { label: str('roombrowser.room'), value: title(w), note: str(w.name ? 'roombrowser.room_named_note' : 'roombrowser.room_note'), info: true };
      if (!w.name) {
        return [row];
      }
      const done = reportedIn === w.code;
      return [row, {
        label: str('friends.report', { reason: str('rooms.report.room_name') }),
        value: done ? str('roombrowser.reported') : '',
        note: str(done ? 'friends.reported_room' : 'roombrowser.report_name_note'),
        action: 'friends-reportname',
      }];
    },
    title,
    /* Whether this code is a room joined from the list: a public room's,
     * which is never shown, even while its socket is still opening. */
    listed: (code) => code != null && code === joined,
    /* Poll the list while it is on screen. */
    watch(on) {
      list.watch(on);
    },
    /* A new room's draft starts over each visit to Make a room. */
    opened(screen) {
      landedOn = null;
      /* The title's rooms panel keeps the list polled, so it can be up to
       * LIST_EVERY_MS old here: a room a friend made a moment ago would be
       * missing, and the cursor would land on Make a room with nothing to
       * move it once the room arrived. Ask now, and treat an empty list as
       * one that has not arrived, until that answer is in: an answer that
       * changes nothing moves nothing, and a room made minutes later must
       * not pull the cursor off Make a room under a pilot's Enter. */
      const asked = (screen === 'rooms' || screen === 'friends') ? list.refresh() : null;
      if (screen === 'rooms' && !(list.rooms() || []).length) {
        const here = ui.items()[ui.cursor];
        const landed = here ? here.action : null;
        landedOn = landed;
        Promise.resolve(asked).then(() => {
          if (landedOn === landed && list.rooms() !== null) {
            landedOn = null;
          }
        });
      }
      if (screen === 'roomnew') {
        draft = fresh();
        error = null;
      }
    },
    /* A friends- action of these screens: true when it was one. */
    act(action) {
      if (action.startsWith(ROOM_ACTION)) {
        joined = action.slice(ROOM_ACTION.length);
        link.join(joined);
        ui.show('friends');
        return true;
      }
      if (action === 'friends-here') {
        ui.show('friends');
        return true;
      }
      if (action === 'friends-quick') {
        link.joinPublic(here());
        ui.show('friends');
        return true;
      }
      if (action === 'friends-roomname') {
        askName();
        return true;
      }
      if (action === 'friends-make') {
        make();
        return true;
      }
      if (action === 'friends-reportname') {
        const st = link.state();
        if (st.welcome && st.welcome.name && reportedIn !== st.code) {
          link.send({ type: 'report', seat: 0, reason: ROOM_NAME_REPORT });
          reportedIn = st.code;
        }
        ui.refreshFriends();
        return true;
      }
      return false;
    },
  };
}
