/*
 * csp.js: the Content-Security-Policy of the pages pilots open, in one
 * place, so the deploy (scripts/stamp-version.js) and the checks that run
 * pages under it (tests/lib/server.js with SIM_CSP, scripts/csp-check.js)
 * cannot drift apart. docs/SECURITY-HEADERS.md says why each source is
 * there.
 *
 * GitHub Pages sets no headers a site chooses, so the deployed policy is a
 * <meta http-equiv> the stamp writes into each page. A meta policy cannot
 * carry frame-ancestors, report-uri or report-to, and there is no
 * report-only meta; those need a header, which only the checks' own
 * server (and Caddy, for the VM's pages) can send.
 *
 * Inline scripts are allowed by their sha256, computed from the page as
 * served: the import map the stamp writes differs every deploy, so its hash
 * is taken after stamping.
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

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_ORIGIN } from '../src/share/api.js';

/* The pages a pilot reaches, site relative. Developer pages (dev/, tools/,
 * tests/, the track builder's own page) are left as they are. */
export const POLICY_PAGES = ['index.html', 'landing.html', 'admin.html', 'privacy.html', 'terms.html',
  'src/share/orbit.html', 'vids/index.html'];

const API_WS = API_ORIGIN.replace(/^https:/, 'wss:');
const CDN = 'https://cdn.jsdelivr.net';
/* The Yellowstone tiles' own Pages site (src/maps/yellowstone). */
const DATA = 'https://fdflabs.github.io';
/* Google sign in (src/ui/accountui.js), the sources Google's Identity
 * Services documents for a CSP. */
const GSI = 'https://accounts.google.com/gsi/';

/* Every inline <script> body's 'sha256-...' source. */
export function inlineHashes(html) {
  const out = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    out.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  return out;
}

/*
 * The policy for one page's HTML. `extra` adds sources per directive, for
 * the checks' local servers (an origin on 127.0.0.1 standing in for the
 * API); the deployed policy passes none.
 */
export function pagePolicy(html, extra = {}) {
  const more = (d) => extra[d] || [];
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'", CDN, GSI, ...inlineHashes(html), ...more('script-src')],
    /* The shell builds most of its look from inline <style> and style
     * attributes in markup; hashing every one would make each copy edit a
     * policy edit for a source that cannot run code. */
    'style-src': ["'self'", "'unsafe-inline'", GSI, ...more('style-src')],
    'img-src': ["'self'", 'data:', 'blob:', API_ORIGIN, DATA, 'https://*.googleusercontent.com', ...more('img-src')],
    'media-src': ["'self'", 'data:', 'blob:', API_ORIGIN, ...more('media-src')],
    'font-src': ["'self'", ...more('font-src')],
    'connect-src': ["'self'", 'data:', 'blob:', API_ORIGIN, API_WS, CDN, DATA, GSI, ...more('connect-src')],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", GSI],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives).map(([d, v]) => `${d} ${[...new Set(v)].join(' ')}`).join('; ');
}

/* The page with the policy as the first thing in its <head> after the
 * charset, so it covers every element after it, the import map included. */
export function withPolicyMeta(html) {
  const found = html.match(/<meta charset="utf-8"\s*\/?>/gi) || [];
  if (found.length !== 1) {
    throw new Error('wants exactly one <meta charset="utf-8"> to put the policy after');
  }
  const charset = found[0];
  if (html.includes('http-equiv="Content-Security-Policy"')) {
    throw new Error('already carries a policy');
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${pagePolicy(html).replace(/"/g, '&quot;')}" />`;
  return html.replace(charset, `${charset}\n    ${meta}`);
}

/* Writes the policy into every page of POLICY_PAGES in a staged site, after
 * scripts/stamp-version.js has written the import maps it hashes. */
export function applyPolicies(siteDir) {
  for (const page of POLICY_PAGES) {
    const path = join(siteDir, page);
    writeFileSync(path, withPolicyMeta(readFileSync(path, 'utf8')));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [siteDir] = process.argv.slice(2);
  if (!siteDir) {
    console.error('usage: node scripts/csp.js <staged site dir>');
    process.exit(2);
  }
  applyPolicies(siteDir);
  console.log(`policy written into ${POLICY_PAGES.length} pages`);
}
