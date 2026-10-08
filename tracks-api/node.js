/*
 * node.js: the tracks server on plain Node, the VM's adapter.
 *
 *   TRACKS_DB=/var/lib/fdfpv-tracks/tracks.db ADMIN_SECRET=... PORT=8787 node tracks-api/node.js
 *
 * and GOOGLE_CLIENT_ID with ACCOUNTS_SECRET to switch the optional Google
 * sign-in on (accounts.js); without both it answers 503.
 *
 * worker.js is the whole server, unchanged: this serves its fetch handler
 * with node:http (edge/node-http.js) over SQLite in place of D1
 * (d1sqlite.js), applying any migration the file has not had yet. Without
 * ADMIN_SECRET the admin routes refuse everyone, as the Worker's do.
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

import nodemailer from 'nodemailer';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import worker from './worker.js';
import { parseClientIds } from './accounts.js';
import { openD1 } from './d1sqlite.js';
import { listener, readRevision } from '../edge/node-http.js';
import { Latency, routeGroup, serverReport } from './metrics.js';

/* googleClientId and accountsSecret switch sign-in on (accounts.js), and
 * inviteOnly keeps it to invited addresses (waitlist.js), and adminEmails
 * names who the admin page lets in (accounts.js isAdminToken); sendMail
 * sends the invite emails (waitlist.js), null for none;
 * googleJwksUrl is for the selftest's stand in for Google alone.
 * metricsDb is the collector's store (tracks-api/collect.js), read only,
 * and roomsOrigin and boardOrigin the loopback servers the admin page's
 * Server section asks for their own numbers (metrics.js serverReport).
 * revision: what GET /api/version answers, the deployed REVISION file's
 * (edge/node-http.js readRevision) unless the selftest passes its own. */
/*
 * The invite emails' sender, or null when the VM has no mail set up:
 * SMTP_USER and SMTP_PASS are a Gmail address and an app password made
 * for this server (/etc/fdfpv/mail.env), and the mail goes out as that
 * address through Gmail, which signs it, so it is not this server's word
 * that it came from there. nodemailer rather than a hand written SMTP
 * client: the reply codes, the dot stuffing and a Spanish subject line's
 * encoding are its to get right.
 */
export function smtpSender({ SMTP_USER: user, SMTP_PASS: pass, SMTP_HOST: host = 'smtp.gmail.com', SMTP_PORT: port = '465' }) {
  if (!user || !pass) {
    return null;
  }
  const transport = nodemailer.createTransport({
    host, port: Number(port), secure: Number(port) === 465, auth: { user, pass },
  });
  return (message) => transport.sendMail({ from: `Paraguayan Drone Combat Simulator <${user}>`, ...message });
}

export function startTracks({
  db, port, host = '127.0.0.1', adminSecret = '', googleClientId = '', accountsSecret = '', googleJwksUrl = '',
  inviteOnly = false, adminEmails = '', sendMail = null, metricsDb = '', roomsOrigin, boardOrigin,
  revision = readRevision(new URL('../REVISION', import.meta.url)),
}) {
  const opened = openD1(db);
  const env = {
    DB: opened.DB, ADMIN_SECRET: adminSecret, GOOGLE_CLIENT_ID: googleClientId, ACCOUNTS_SECRET: accountsSecret,
    REVISION: revision, INVITE_ONLY: inviteOnly, ADMIN_EMAILS: adminEmails, SEND_MAIL: sendMail,
    ...(googleJwksUrl ? { GOOGLE_JWKS_URL: googleJwksUrl } : {}),
    /* Where Flight Club's event tiers are read (eventpay.js); none, no
     * events are paid. */
    ...(boardOrigin ? { BOARD_ORIGIN: boardOrigin } : {}),
  };
  /* Every request timed to its answer's headers, by route group and in
   * all, for the admin page's Server section (metrics.js). */
  const latency = new Latency();
  env.SERVER = serverReport({ metricsDb, latency, secret: adminSecret, revision, rooms: roomsOrigin, board: boardOrigin });
  const timed = {
    async fetch(request, e) {
      const t = performance.now();
      const res = await worker.fetch(request, e);
      const ms = performance.now() - t;
      latency.record(routeGroup(new URL(request.url).pathname), ms, res.status);
      latency.record('all', ms, res.status);
      return res;
    },
  };
  const server = http.createServer(listener(timed, env));
  function stop() {
    return new Promise((resolve) => {
      server.close(() => {
        opened.db.close();
        resolve();
      });
      server.closeAllConnections();
    });
  }
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, stop, port: server.address().port }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const running = await startTracks({
    db: process.env.TRACKS_DB || 'tracks.db',
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST || '127.0.0.1',
    adminSecret: process.env.ADMIN_SECRET || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    accountsSecret: process.env.ACCOUNTS_SECRET || '',
    inviteOnly: Boolean(process.env.INVITE_ONLY),
    adminEmails: process.env.ADMIN_EMAILS || '',
    sendMail: smtpSender(process.env),
    metricsDb: process.env.METRICS_DB || '',
    roomsOrigin: process.env.ROOMS_ORIGIN,
    boardOrigin: process.env.BOARD_ORIGIN,
  });
  const signIn = parseClientIds(process.env.GOOGLE_CLIENT_ID).length > 0 && process.env.ACCOUNTS_SECRET;
  console.log(`fdfpv tracks on ${process.env.HOST || '127.0.0.1'}:${running.port}${process.env.ADMIN_SECRET ? '' : ', no ADMIN_SECRET: admin routes refuse everyone'}${signIn ? ', sign-in on' : ', no GOOGLE_CLIENT_ID or ACCOUNTS_SECRET: sign-in off'}${process.env.SMTP_USER && process.env.SMTP_PASS ? ', invite email on' : ', no SMTP_USER or SMTP_PASS: invite email off'}`);
  process.on('SIGTERM', async () => {
    await running.stop();
    process.exit(0);
  });
}
