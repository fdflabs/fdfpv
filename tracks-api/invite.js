/*
 * invite.js: the email an invited address is sent (waitlist.js), as
 * { subject, text, html }. English, then Spanish: an address says nothing
 * of its owner's language. The game's name is not translated.
 *
 * Nothing here sends: tracks-api/node.js hands the server a sender, so
 * worker.js stays free of anything Node's alone.
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

import { SITE_ORIGIN } from '../src/share/api.js';

const NAME = 'Paraguayan Drone Combat Simulator';

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function inviteMessage(email) {
  const en = [
    `You are in. Your place in the ${NAME} beta is open.`,
    `Go to ${SITE_ORIGIN}, press "Enter the simulator" and sign in with this Google account: ${email}`,
    'It is a beta: things will break. F8 in the game sends us a report.',
  ];
  const es = [
    `Ya estás dentro. Tu lugar en la beta de ${NAME} está abierto.`,
    `Entra a ${SITE_ORIGIN}, pulsa "Entrar al simulador" e inicia sesión con esta cuenta de Google: ${email}`,
    'Es una beta: habrá cosas que fallen. F8 en el juego nos envía un reporte.',
  ];
  const para = (lines) => lines.map((l) => `<p>${escapeHtml(l).replace(SITE_ORIGIN, `<a href="${SITE_ORIGIN}">${SITE_ORIGIN}</a>`)}</p>`).join('');
  return {
    subject: `Your ${NAME} beta invite / Tu invitación a la beta`,
    text: `${en.join('\n\n')}\n\n----\n\n${es.join('\n\n')}\n`,
    html: `<div style="font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.5; max-width: 34em;">${para(en)}<hr>${para(es)}</div>`,
  };
}
