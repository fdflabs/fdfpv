/*
 * identity.js: a pilot's name, claimed by a key rather than a password.
 *
 * A time on the board carries a name, and until now the name was whatever
 * the poster typed. This module gives each browser a keypair (ECDSA on
 * P-256, through WebCrypto), signs every posted time with it, and the board
 * records the first key it sees for a name. From then on the name belongs
 * to that key: another browser posting under it is refused, unless the key
 * was carried over with exportText and importText. No account, no password,
 * no email, and nothing on the board that could leak a secret, because the
 * board only ever holds public keys.
 *
 * The message that is signed is the time itself: track id, lap in
 * milliseconds and the SHA-256 of the ghost that proves the lap, joined by
 * newlines under a version prefix. Changing any of them voids the
 * signature, so a signed post cannot be replayed onto another track or
 * have its ghost swapped.
 *
 * DOM free on purpose. The board verifies with the same file through its
 * pinned checkout of this repository, and the selftests run it in Node, so
 * storage is injected and the crypto comes from globalThis.crypto.
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

export const KEY_STORAGE = 'webfpv.pilot.key.v1';
export const TIME_MESSAGE_PREFIX = 'fdfpv-time/v1';

const CURVE = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

function subtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('WebCrypto is not available here');
  }
  return c.subtle;
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export function fromBase64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function sha256Base64(text) {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(String(text)));
  return toBase64(new Uint8Array(digest));
}

/* The bytes a signature covers. lapMs is rounded here so both sides agree
 * on the integer; ghost is the base64 text as posted. `craft` is the fixed
 * wing a plane's lap on a map track names (src/game/verify.js planesFor)
 * and goes on a fifth line, so a signed plane lap cannot be moved onto the
 * quads' board or onto another plane; a lap without one signs the four
 * lines it always did, and every signature made before planes could race a
 * map track still verifies. */
export async function timeMessage({ trackId, lapMs, ghost, craft }) {
  const ghostHash = await sha256Base64(ghost || '');
  const tail = craft ? `\n${craft}` : '';
  return new TextEncoder().encode(`${TIME_MESSAGE_PREFIX}\n${trackId}\n${Math.round(lapMs)}\n${ghostHash}${tail}`);
}

/* key and sig are base64: the raw 65 byte P-256 public key and the 64 byte
 * IEEE P1363 signature WebCrypto produces. False for anything malformed. */
export async function verifyTimeSignature({ key, sig, trackId, lapMs, ghost, craft }) {
  const message = await timeMessage({ trackId, lapMs, ghost, craft });
  return verifySignature({ key, sig, message });
}

/*
 * A SAVED TRACK IS SIGNED THE SAME WAY, and the tracks server
 * (tracks-api/worker.js) files each track id under the first key that saved
 * it. The message is the track id, the save's own counter `ts`, and the
 * SHA-256 of the pilot name and of the document text exactly as sent, so a
 * signed save cannot be moved onto another id, renamed to someone else, or
 * replayed over a newer save: the server only takes a `ts` above the one it
 * holds. A delete signs the id and its `ts` under its own prefix, so a save's
 * signature can never be turned into a delete.
 */
export const TRACK_MESSAGE_PREFIX = 'fdfpv-track/v1';
export const TRACK_DELETE_PREFIX = 'fdfpv-track-delete/v1';

export async function trackMessage({ id, ts, author, documentText }) {
  const authorHash = await sha256Base64(author || '');
  const docHash = await sha256Base64(documentText || '');
  return new TextEncoder().encode(`${TRACK_MESSAGE_PREFIX}\n${id}\n${ts}\n${authorHash}\n${docHash}`);
}

export function trackDeleteMessage({ id, ts }) {
  return new TextEncoder().encode(`${TRACK_DELETE_PREFIX}\n${id}\n${ts}`);
}

/* False for anything malformed, like verifyTimeSignature. */
export async function verifySignature({ key, sig, message }) {
  try {
    const pub = await subtle().importKey('raw', fromBase64(key), CURVE, false, ['verify']);
    return await subtle().verify(SIGN, pub, fromBase64(sig), message);
  } catch (e) {
    return false;
  }
}

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    return null;
  }
}

/* An in-memory stand in for localStorage, for Node and for a browser that
 * refuses storage: the key then lives for the page and no longer. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/*
 * The pilot's identity in one storage. Created lazily on first use, and
 * kept as JSON: the private key as a JWK and the public key as base64 raw
 * bytes, which is also the pilot's id on the board.
 */
export function createIdentity(storage = browserStorage() || memoryStorage()) {
  let cached = null;

  async function load() {
    if (cached) {
      return cached;
    }
    let text = null;
    try {
      text = storage.getItem(KEY_STORAGE);
    } catch (e) {
    }
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && parsed.v === 1 && parsed.privateJwk && parsed.publicRaw) {
        const priv = await subtle().importKey('jwk', parsed.privateJwk, CURVE, true, ['sign']);
        cached = { priv, publicRaw: parsed.publicRaw };
        return cached;
      }
    }
    const pair = await subtle().generateKey(CURVE, true, ['sign', 'verify']);
    const privateJwk = await subtle().exportKey('jwk', pair.privateKey);
    const publicRaw = toBase64(new Uint8Array(await subtle().exportKey('raw', pair.publicKey)));
    try {
      storage.setItem(KEY_STORAGE, JSON.stringify({ v: 1, privateJwk, publicRaw }));
    } catch (e) {
    }
    cached = { priv: pair.privateKey, publicRaw };
    return cached;
  }

  return {
    /* The public key, base64. What the board files the name under. */
    async publicKey() {
      return (await load()).publicRaw;
    },
    /* { key, sig } for a time post, both base64. */
    async signTime({ trackId, lapMs, ghost, craft }) {
      const id = await load();
      const message = await timeMessage({ trackId, lapMs, ghost, craft });
      const sig = new Uint8Array(await subtle().sign(SIGN, id.priv, message));
      return { key: id.publicRaw, sig: toBase64(sig) };
    },
    /* { key, sig } over trackMessage or trackDeleteMessage bytes. */
    async signBytes(message) {
      const id = await load();
      const sig = new Uint8Array(await subtle().sign(SIGN, id.priv, message));
      return { key: id.publicRaw, sig: toBase64(sig) };
    },
    /* The whole identity as one line of text, to carry to another browser.
     * It holds the private key: whoever has it is this pilot. */
    async exportText() {
      await load();
      return storage.getItem(KEY_STORAGE);
    },
    /* Replace this browser's identity with an exported one. Returns the
     * public key, or throws when the text is not an identity. */
    async importText(text) {
      const parsed = JSON.parse(String(text || '').trim());
      if (!parsed || parsed.v !== 1 || !parsed.privateJwk || typeof parsed.publicRaw !== 'string') {
        throw new Error('That is not a pilot key.');
      }
      const priv = await subtle().importKey('jwk', parsed.privateJwk, CURVE, true, ['sign']);
      const probe = await subtle().sign(SIGN, priv, new Uint8Array([1]));
      if (!probe) {
        throw new Error('That key cannot sign.');
      }
      storage.setItem(KEY_STORAGE, JSON.stringify({ v: 1, privateJwk: parsed.privateJwk, publicRaw: parsed.publicRaw }));
      cached = null;
      return (await load()).publicRaw;
    },
    /* Drop the key. A new one is made on the next post, and the old name
     * stays with the old key on the board. */
    forget() {
      try {
        storage.removeItem(KEY_STORAGE);
      } catch (e) {
      }
      cached = null;
    },
  };
}
