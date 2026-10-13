# Spanish for the Paraguayan Drone Combat Simulator: rules for every slice

Neutral Latin American Spanish, informal "tú" (never "usted", never "vos").
Natural, short sentences, the tone of a friend who flies. No em dashes.

Keep exactly as they are, character for character:
- every placeholder in braces, e.g. {name}, {n}, {v1}: same names, same count
- every HTML tag, e.g. <b>reload</b> becomes <b>recargar</b>
- product and brand names: Betaflight, MultiGP, RaceGOW, DShot, Chrome, Edge, Firefox, Render, GitHub
- FPV jargon the Spanish-speaking community uses in English: throttle, roll, pitch, yaw, rates, PID, PIDs, tune, freestyle, whoop, quad, arm/disarm as "armar/desarmar", FPV, ELRS, CRSF, SBUS, ESC, DShot, OSD, VTX, gyro
- key names on a keyboard: Enter, Escape, Ctrl, Alt, Shift, W, A, S, D, arrows described as "flechas"
- units and numbers exactly: m, mm, ms, kg, g, V, A, Hz, kHz, deg, px, 6S, 1S, 5 in

Fixed choices, use these every time:
- the game's name in a sentence = el Simulador de Combate de Drones Paraguayo (since 2026-09-30); the wordmark (PARAGUAYAN DRONE COMBAT SIMULATOR on the title and loading screens) is the mark and stays in English
- track = pista; the board / leaderboard = el tablero; gate = puerta; lap = vuelta; time (a posted lap time) = tiempo
- pilot = piloto; pilot key = clave de piloto; name = nombre; ghost = fantasma; live = en vivo
- the field / sixty metre field = el campo / campo de sesenta metros; room (indoor whoop room) = sala
- track builder = constructor de pistas; flying order = orden de vuelo; start line = línea de salida; start pads = pads de salida
- five inch = cinco pulgadas; sticks = sticks; radio = radio; joystick = joystick; calibrate = calibrar
- Settings = Ajustes; Credits = Créditos; How to fly = Cómo volar; Publish = Publicar; Upload a time = Subir un tiempo; Fly = Volar; Back = Volver
- record (a best time) = récord; split = parcial; standings = clasificación; run (freestyle run) = sesión; score = puntaje; trick = truco
- Off / On = Apagado / Encendido, but a switch's two segments are Sí / No, which fit a phone (ui.switch_on, ui.switch_off); Best = Mejor; Previous = Anterior; None = Ninguno
- crash = choque; reset = reiniciar; spawn = aparecer; launch control = launch control; turtle mode = modo tortuga; arcade = arcade
- the stick axes = throttle, roll, pitch, yaw, for a quad and for a plane, never acelerador, gas, alabeo, cabeceo or guiñada: the RC pilots in Paraguay say the English words. Masculine and invariable: el roll, el pitch, el yaw, el throttle; a label is capitalised like any other (Roll, Pitch, Yaw, Throttle). The verbs become hacer roll / hacer pitch, and dar yaw when the aircraft is made to yaw ("sus alerones le dan yaw al revés"). Prose says it too, for a quad and for a plane's engine alike: "sube el throttle", "con el throttle cerrado", "a fondo de throttle", and in the operations' capitals "SUBAN EL THROTTLE". One word for one stick, so a label and the sentence under it never disagree (settled 2026-10-13). The recorded war voice lines (assets/audio/war) still say acelerador, until they are recorded again

Capitalisation as in English (sentence case). Keep trailing punctuation and leading/trailing spaces exactly as the English has them (some strings are fragments joined to others).

## The game's nouns, in both languages

One word for one thing, the redesign's (docs/redesign/COMPLETENESS.md items 78 and 83), settled 2026-10-13. English first, then the Spanish, then what it is.

| English | Spanish | What it is |
|---|---|---|
| operation | operación | a campaign of missions flown in order: Defend the Paraná, The Interior |
| mission | misión | one of an operation's, with its briefing, stages and result |
| stage | etapa | one part of a mission between its radio calls (src/share/war/stages.js) |
| activity | actividad | a Flight Club entry: Track Day, Free Flight, Streamer Combat, Catch the Ace!, Trick Battle, Learn to fly |
| session | sesión | a room set up for one activity or mission, what a pilot makes, joins and leaves |
| lobby | sala de espera | a session before its round starts |
| round | ronda | one go in a session, from the countdown to the result |
| room | sala | the code's word for a session; shown only where the server's room is meant: its code, the room list |
| party | (not used) | say the session's pilots, los pilotos de la sesión |

Where today's copy still differs, and moves when that copy is next touched rather than in a sweep:

- match: the Catch the Ace! strings say match for a round (roomtag.*, 15 strings). They become round.
- session: the six English strings that say session mean this browser's visit (ghost.session_best, main.your_best_this_session and four more; gpuinfo's means the graphics context). They become visit or today when the session copy lands.
- run: Spanish says sesión for a freestyle run (about 35 strings, ui.scored_run and the rest), which collides with session. A run becomes pasada; until those strings move, sesión stays for a run and the session copy waits.
- iniciar sesión / cerrar sesión (sign in, sign out) are the fixed phrases and stay.

`npm run lint:nouns` holds the words that are gone: course (track) and party.

