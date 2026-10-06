/*
 * words.js: the word filter every public name on the tracks server passes.
 *
 * The owner's rule for anything public is that a child can read it. Track
 * names and pilot names are the only free text the server stores, so this
 * is the one gate, and it refuses rather than stars out: a name that has to
 * be changed is a thing the builder can say, a name printed with holes in
 * it is still the word.
 *
 * TWO LISTS, BECAUSE SUBSTRINGS LIE. A word that never occurs inside an
 * innocent one ("fuck") is caught anywhere, glued to other letters or not.
 * A short word that does ("ass" in "grass", "cum" in "cucumber") is caught
 * only as a whole word. Both lists are matched after folding case, accents
 * and the usual digit and symbol swaps, so "F4GG0T" and "PuT4" are caught
 * without listing every spelling. A word that would refuse an innocent
 * name when glued ("puta" in "reputation", "rapist" in "therapist") is in
 * the second list for that reason.
 *
 * English and Spanish, because those are the two languages the simulator
 * speaks (src/strings). It is a floor, not a moderation system: the admin
 * hide in worker.js is the answer to whatever gets past it.
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

const ANYWHERE = [
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore',
  'slut', 'dickhead', 'motherf', 'asshole', 'bastard', 'porn', 'pussy',
  'penis', 'vagina', 'dildo', 'blowjob', 'twat', 'hitler', 'nazi', 'kkk',
  'mierda', 'pendej', 'cabron', 'chinga', 'joder', 'maricon', 'culero',
  'pelotud', 'boludo', 'gilipollas', 'hijodep', 'follar', 'mamaguevo',
  'malparid',
];

const WHOLE_WORD = [
  'ass', 'arse', 'fag', 'fags', 'dick', 'dicks', 'cock', 'cocks', 'cum',
  'sex', 'sexy', 'tits', 'tit', 'hoe', 'hoes', 'jizz', 'rape', 'rapist',
  'wank', 'wanker', 'retard', 'retards', 'retarded',
  'puta', 'putas', 'puto', 'putos', 'verga', 'vergas', 'polla', 'zorra',
  'culo', 'teta', 'tetas', 'pene', 'sexo', 'marica', 'idiota', 'estupido',
];

const SWAPS = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i',
};

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9@$!|]/g, (c) => SWAPS[c] ?? c);
}

/* The listed word a name contains, or '' when it is clean. */
export function badWordIn(text) {
  const folded = fold(text);
  const glued = folded.replace(/[^a-zñ]/g, '');
  const hit = ANYWHERE.find((w) => glued.includes(fold(w).replace(/[^a-zñ]/g, '')));
  if (hit) {
    return hit;
  }
  const words = folded.split(/[^a-zñ]+/).filter(Boolean);
  return WHOLE_WORD.find((w) => words.includes(w)) ?? '';
}
