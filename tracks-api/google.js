/*
 * google.js: a Google Identity Services ID token, checked without Google's
 * libraries.
 *
 * The page signs in with Google Identity Services and hands the server the
 * ID token Google gave it: a JWT signed RS256 by one of Google's keys. This
 * file checks that token the way Google's own documentation lists
 * (developers.google.com/identity/gsi/web/guides/verify-google-id-token):
 * the signature against Google's published keys, `iss` is Google, `aud` is
 * one of this site's client ids, and `exp` has not passed. There is no
 * client secret and no redirect: the token is the whole of the exchange.
 *
 * MORE THAN ONE CLIENT ID is accepted so a client id can move: accounts.js
 * parses GOOGLE_CLIENT_ID as a comma separated list and passes it here as
 * clientIds, so a page loaded before a deploy, still holding an old id,
 * keeps signing in until it is reloaded.
 *
 * WebCrypto, not node:crypto, because worker.js is written to run on
 * Cloudflare as well as on Node (tracks-api/node.js), and both have
 * crypto.subtle with RSASSA-PKCS1-v1_5.
 *
 * THE KEYS are fetched from GOOGLE_JWKS_URL and kept for as long as its
 * Cache-Control max-age says (Google rotates them over days, and sends
 * about six hours), and fetched again early when a token names a key id
 * that is not held, at most once a minute, so a stream of junk key ids
 * cannot make this server hammer Google.
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

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/* A clock between here and Google that is off by up to a minute still
 * takes a fresh token and still refuses a stale one within a minute. */
const SKEW_S = 60;
const TOKEN_MAX_CHARS = 4096;
const REFETCH_GAP_MS = 60 * 1000;
const DEFAULT_KEEP_MS = 60 * 60 * 1000;
const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const SUB_RE = /^[A-Za-z0-9_-]{1,255}$/;

function base64UrlBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function base64UrlJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(text)));
}

/*
 * Google's keys by key id, fetched through `fetchFn` from `url`. One per
 * server process: key(kid) resolves to a CryptoKey, or null when Google
 * does not publish that id. A failed fetch throws, so the caller answers
 * 503 rather than refusing a good token as bad.
 */
export function googleKeys({ url = GOOGLE_JWKS_URL, fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  let keys = new Map();
  let until = 0;
  let fetchedAt = -Infinity;
  let inflight = null;

  async function refresh() {
    const res = await fetchFn(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Google keys answered ${res.status}`);
    }
    const body = await res.json();
    const next = new Map();
    for (const jwk of Array.isArray(body && body.keys) ? body.keys : []) {
      if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.alg && jwk.alg !== 'RS256')) {
        continue;
      }
      /* eslint-disable-next-line no-await-in-loop */
      next.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, RS256, false, ['verify']));
    }
    const age = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
    keys = next;
    fetchedAt = now();
    until = fetchedAt + (age ? Number(age[1]) * 1000 : DEFAULT_KEEP_MS);
  }

  function refreshOnce() {
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  return async function key(kid) {
    const t = now();
    if (t >= until || (!keys.has(kid) && t - fetchedAt >= REFETCH_GAP_MS)) {
      await refreshOnce();
    }
    return keys.get(kid) ?? null;
  };
}

/*
 * { sub } for a good token, or { error } saying what was wrong with it.
 * Only a failure to reach Google's keys throws.
 */
export async function verifyGoogleIdToken(token, { clientIds, key, nowS = Math.floor(Date.now() / 1000) }) {
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return { error: 'no client id' };
  }
  if (typeof token !== 'string' || token.length > TOKEN_MAX_CHARS) {
    return { error: 'not a token' };
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) {
    return { error: 'not a token' };
  }
  let header;
  let claims;
  try {
    header = base64UrlJson(parts[0]);
    claims = base64UrlJson(parts[1]);
  } catch (e) {
    return { error: 'not a token' };
  }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') {
    return { error: 'not an RS256 token' };
  }
  const pub = await key(header.kid);
  if (!pub) {
    return { error: 'unknown key' };
  }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let good = false;
  try {
    good = await crypto.subtle.verify(RS256, pub, base64UrlBytes(parts[2]), signed);
  } catch (e) {
    good = false;
  }
  if (!good) {
    return { error: 'bad signature' };
  }
  if (!GOOGLE_ISSUERS.includes(claims.iss)) {
    return { error: 'wrong issuer' };
  }
  /* A token for several audiences is not one this site asked for. */
  if (typeof claims.aud !== 'string' || !clientIds.includes(claims.aud)) {
    return { error: 'wrong audience' };
  }
  if (!Number.isFinite(claims.exp) || claims.exp + SKEW_S <= nowS) {
    return { error: 'expired' };
  }
  if (Number.isFinite(claims.iat) && claims.iat - SKEW_S > nowS) {
    return { error: 'issued in the future' };
  }
  if (Number.isFinite(claims.nbf) && claims.nbf - SKEW_S > nowS) {
    return { error: 'not yet valid' };
  }
  if (typeof claims.sub !== 'string' || !SUB_RE.test(claims.sub)) {
    return { error: 'no subject' };
  }
  return { sub: claims.sub };
}
