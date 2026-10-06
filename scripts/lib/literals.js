/*
 * literals.js: every quoted string and template in a JavaScript source,
 * with its line and the text before it. Comments are stepped over, so a
 * word in a comment is never a literal. A template's ${...} is walked with
 * its brace depth, so an inner string is stepped over whole. Shared by
 * the copy lint and the brand lint.
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

export function literals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      /* A template's \${...} can hold strings of its own, backticks included,
       * so a template is walked with the brace depth in hand and an inner
       * string is stepped over whole. */
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (c === '`' && depth > 0 && (src[j] === '"' || src[j] === "'" || src[j] === '`')) {
          const q = src[j];
          j += 1;
          while (j < n && src[j] !== q) {
            j += src[j] === '\\' ? 2 : 1;
          }
          j += 1;
          continue;
        }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          depth += 1;
          j += 2;
          continue;
        }
        if (c === '`' && depth > 0 && src[j] === '}') {
          depth -= 1;
          j += 1;
          continue;
        }
        if (src[j] === c && depth === 0) {
          break;
        }
        if (src[j] === '\n') {
          line += 1;
        }
        j += 1;
      }
      /* Two lines of context, because an Error's message often starts on the
       * line after the throw. */
      const lineStart = src.lastIndexOf('\n', i) + 1;
      const prevStart = src.lastIndexOf('\n', lineStart - 2) + 1;
      out.push({ line, text: src.slice(i + 1, Math.min(j, n)), before: src.slice(prevStart, i) });
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, j < 0 ? n : j + 2);
      line += (chunk.match(/\n/g) || []).length;
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    i += 1;
  }
  return out;
}
