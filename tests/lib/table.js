/*
 * table.js: the text table npm run verify prints, one line per check.
 *
 * A markdown-shaped table: a header line, a rule of dashes, then the rows,
 * every column padded to its widest cell so the report reads aligned in a
 * terminal. Cells are printed with String(), so a number, a boolean, null
 * and undefined all show as their usual spelling. A header is measured by
 * its own .length, a cell by the length of its spelling; a column's width
 * is the larger over the header and every row, counting a cell a short row
 * lacks as "undefined". A row is printed with the cells it has, no more.
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

const GAP = ' | ';

function columnWidths(headers, rows) {
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < widths.length; i += 1) {
      widths[i] = Math.max(widths[i], String(row[i]).length);
    }
  }
  return widths;
}

function paddedLine(cells, widths) {
  const padded = cells.map((cell, i) => String(cell).padEnd(widths[i]));
  return `| ${padded.join(GAP)} |`;
}

export function renderTable(headers, rows) {
  const widths = columnWidths(headers, rows);
  const rule = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  const lines = [paddedLine(headers, widths), rule];
  for (const row of rows) {
    lines.push(paddedLine(row, widths));
  }
  return lines.join('\n');
}
