/*
 * preview-comment.js: put the preview's link on its pull request, once.
 * Run by .github/workflows/preview.yml after a publish. The comment carries
 * a marker, so a new push edits the same comment instead of adding one.
 *
 * Env: PR (number), HEAD_SHA, GH_TOKEN, GITHUB_REPOSITORY.
 * With --dry-run it prints the body and asks GitHub nothing.
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

import { execFileSync } from 'node:child_process';

const MARKER = '<!-- fdfpv-preview -->';

export function previewUrl(pr) {
  return `https://pr-${pr}.fdfpv-preview.pages.dev/`;
}

export function commentBody(pr, sha) {
  return [
    MARKER,
    `Preview of this pull request: ${previewUrl(pr)} (commit ${sha.slice(0, 12)}, merged into main as it stood).`,
    '',
    'Solo only: on a preview host the page asks no rooms, accounts, tracks or board server, so nothing you do there reaches real data. Settings and progress live in that host\'s own storage, not the game\'s.',
  ].join('\n');
}

function gh(args, input) {
  return execFileSync('gh', args, { input, encoding: 'utf8' });
}

const { PR, HEAD_SHA, GITHUB_REPOSITORY } = process.env;
if (!/^\d+$/.test(PR || '') || !/^[0-9a-f]{12,40}$/.test(HEAD_SHA || '')) {
  throw new Error('preview-comment: PR and HEAD_SHA are required');
}
const body = commentBody(PR, HEAD_SHA);
if (process.argv.includes('--dry-run')) {
  console.log(body);
  process.exit(0);
}
const comments = JSON.parse(gh(['api', `repos/${GITHUB_REPOSITORY}/issues/${PR}/comments`, '--paginate', '--slurp'])).flat();
const mine = comments.find((c) => c.body.startsWith(MARKER));
const payload = JSON.stringify({ body });
if (mine) {
  gh(['api', '-X', 'PATCH', `repos/${GITHUB_REPOSITORY}/issues/comments/${mine.id}`, '--input', '-'], payload);
} else {
  gh(['api', '-X', 'POST', `repos/${GITHUB_REPOSITORY}/issues/${PR}/comments`, '--input', '-'], payload);
}
console.log(`preview linked on #${PR}: ${previewUrl(PR)}`);
