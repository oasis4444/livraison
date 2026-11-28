// Discussion par colis (expéditeur, destinataire, livreur, centre) et appels audio dans la plateforme (WebRTC).
// Le serveur ne transporte pas la voix : il relaie seulement la mise en relation (offre, réponse, candidats réseau).
import { json, fail, str, now } from './lib.js';
import { queuePush } from './push.js';
import { one, all, run, notify, settings, staffPerms } from './worker.js';

// ---------------------------------------------------------------- qui participe à un colis
// Le livreur et le client ne se parlent qu'une fois la mission confirmée (même règle que l'affichage des contacts).
async function shipmentAccess(env, u, id) {
  const s = await one(env, 'SELECT * FROM shipments WHERE id = ?', id) || fail(404, 'not_found', 'Colis introuvable');
  const confirmed = !!s.accepted_at || !!s.stage || ['picked_up', 'delivered', 'refused', 'cancelled'].includes(s.status);
  const couriers = [s.courier_id, s.pickup_courier_id, s.delivery_courier_id].filter(Boolean);
  const recipient = s.recipient_phone ? await one(env, 'SELECT id FROM users WHERE phone = ?', s.recipient_phone) : null;
  let role = null;
  if (u.role === 'admin') role = 'centre';
  else if (u.role === 'courier' && couriers.includes(u.id) && confirmed) role = 'courier';
  else if (u.role === 'client' && s.sender_id === u.id) role = 'sender';
  else if (u.role === 'client' && s.recipient_phone === u.phone) role = 'recipient';
  if (!role) fail(403, 'forbidden', u.role === 'courier' ? 'Confirmez d\'abord la mission' : 'Ce colis ne vous concerne pas');
  // Le livreur en charge en ce moment : celui de la livraison une fois le colis parti du centre, sinon celui de la récupération.
  const currentCourier = s.delivery_courier_id && (s.centre_out_at || !s.relay) ? s.delivery_courier_id : s.pickup_courier_id || s.courier_id || s.delivery_courier_id;
  return { s, role, confirmed, couriers, currentCourier: confirmed ? currentCourier : null, recipientId: recipient?.id || null };
}
const ROLE_FR = { centre: 'Centre Alefa', courier: 'Livreur', sender: 'Expéditeur', recipient: 'Destinataire' };

async function listMessages(ctx, env) {
  const a = await shipmentAccess(env, ctx.user, ctx.params.id);
  const rows = await all(env, `SELECT m.id, m.body, m.at, m.role, m.user_id, u.name FROM shipment_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.shipment_id = ? ORDER BY m.id DESC LIMIT 120`, a.s.id);
  // Avant confirmation, le client ne voit pas le nom du livreur (et inversement).
  return json({
    role: a.role, can_courier: !!a.currentCourier, can_call: callTargets(a),
    messages: rows.reverse().map((m) => ({ id: m.id, body: m.body, at: m.at, role: m.role, mine: m.user_id === ctx.user.id, author: m.role === 'centre' ? 'Centre Alefa' : m.name || ROLE_FR[m.role] })),
  });
}
async function postMessage(ctx, env) {
  const u = ctx.user, a = await shipmentAccess(env, u, ctx.params.id);
  const body = str(ctx.body.body, { min: 1, max: 1000, name: 'Message' });
  const recent = await one(env, 'SELECT COUNT(*) AS n FROM shipment_messages WHERE user_id = ? AND at > ?', u.id, now() - 60e3);
  if (recent.n >= 15) fail(429, 'rate_limited', 'Trop de messages, patientez une minute');
  await run(env, 'INSERT INTO shipment_messages (shipment_id, user_id, role, body, at) VALUES (?,?,?,?,?)', a.s.id, u.id, a.role, body, now());
  // Tous les participants sont prévenus (sauf l'auteur) ; le centre ne reçoit que ce qui lui est adressé dans le fil.
  const to = [a.s.sender_id, a.recipientId, ...(a.confirmed ? a.couriers : [])].filter((x) => x && x !== u.id);
  await notify(env, to, `chat:${a.s.id}`, `Message · ${a.s.ref}`, `${a.role === 'centre' ? 'Centre Alefa' : u.name} : ${body.slice(0, 120)}`);
  return json({ ok: true }, 201);
}

// ---------------------------------------------------------------- appels
// Cibles possibles depuis un colis, selon qui appelle.
function callTargets(a) {
  const t = [];
  if (a.role !== 'courier' && a.currentCourier) t.push('courier');
  if (a.role === 'courier' || a.role === 'centre') { t.push('sender'); if (a.recipientId) t.push('recipient'); }
  return t;
}
async function iceConfig(ctx, env) {
  const st = await settings(env);
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  if (st.turn_url) servers.push({ urls: st.turn_url.split(/[\s,]+/).filter(Boolean), username: st.turn_user || undefined, credential: st.turn_pass || undefined });
  return json({ iceServers: servers });
}
const SUPPORT = -1; // appel vers le service client : sonne chez toute l'équipe autorisée, le premier qui décroche le prend
async function startCall(ctx, env) {
  const u = ctx.user, b = ctx.body;
  const offer = str(b.offer, { min: 10, max: 20000, name: 'Offre' });
  let to = null, sid = null, label = null;
  if (b.to === 'support') { if (u.role === 'admin') fail(400, 'invalid', 'Vous êtes le service client'); to = SUPPORT; label = 'Service client Alefa'; }
  else if (b.shipment_id) {
    const a = await shipmentAccess(env, u, Number(b.shipment_id));
    if (!callTargets(a).includes(b.to)) fail(403, 'forbidden', 'Appel non disponible pour ce colis');
    to = b.to === 'courier' ? a.currentCourier : b.to === 'sender' ? a.s.sender_id : a.recipientId;
    sid = a.s.id;
    if (!to) fail(404, 'not_found', 'Cette personne n\'a pas de compte Alefa : appelez-la par téléphone');
  } else if (u.role === 'admin' && b.user_id) to = Number(b.user_id); // le centre peut appeler n'importe quel utilisateur
  else fail(400, 'invalid', 'Destinataire de l\'appel manquant');
  if (to === u.id) fail(400, 'invalid', 'Vous ne pouvez pas vous appeler vous-même');
  // Un seul appel à la fois : les anciens appels non terminés de l'appelant sont clos.
  await run(env, "UPDATE calls SET status = 'ended', ended_at = ? WHERE from_id = ? AND status IN ('ringing','active')", now(), u.id);
  const r = await run(env, 'INSERT INTO calls (from_id, to_id, shipment_id, status, offer, created_at) VALUES (?,?,?,?,?,?)', u.id, to, sid, 'ringing', offer, now());
  const peer = to > 0 ? await one(env, 'SELECT name, role FROM users WHERE id = ?', to) : null;
  // Fait sonner le téléphone même site fermé : toucher la notification ouvre l'application, qui affiche l'appel.
  const ring = to > 0 ? [to] : (await all(env, "SELECT id, role, perms FROM users WHERE role = 'admin' AND status = 'active'")).filter((x) => canSupport(x)).map((x) => x.id);
  queuePush(env, ring, { title: '📞 Appel entrant', body: `${u.role === 'admin' ? 'Centre Alefa' : u.name} vous appelle — touchez pour répondre`, tag: 'call', ttl: 45, url: to > 0 && peer?.role === 'admin' ? '/#support' : null });
  return json({ id: r.meta.last_row_id, peer: label || peer?.name || 'Correspondant' }, 201);
}
async function myCall(env, u, id) {
  const c = await one(env, 'SELECT * FROM calls WHERE id = ?', id) || fail(404, 'not_found', 'Appel introuvable');
  const support = c.to_id === SUPPORT && u.role === 'admin' && canSupport(u);
  if (c.from_id !== u.id && c.to_id !== u.id && !support) fail(403, 'forbidden', 'Appel introuvable');
  return { c, side: c.from_id === u.id ? 'caller' : 'callee' };
}
const canSupport = (u) => { const p = staffPerms(u); return !p || p.includes('support'); };
const RING_MS = 45e3;
async function incoming(ctx, env) {
  const u = ctx.user;
  // Appels sans réponse depuis trop longtemps : manqués (l'appelé est prévenu).
  const stale = await all(env, "SELECT * FROM calls WHERE status = 'ringing' AND created_at < ?", now() - RING_MS);
  for (const c of stale) {
    await run(env, "UPDATE calls SET status = 'missed', ended_at = ? WHERE id = ? AND status = 'ringing'", now(), c.id);
    const from = await one(env, 'SELECT name FROM users WHERE id = ?', c.from_id);
    if (c.to_id > 0) await notify(env, [c.to_id], 'call', 'Appel manqué', `${from?.name || 'Un correspondant'} a essayé de vous appeler.`);
  }
  const rows = await all(env, `SELECT c.id, c.from_id, c.shipment_id, c.created_at, c.to_id, u.name, u.role, s.ref FROM calls c JOIN users u ON u.id = c.from_id LEFT JOIN shipments s ON s.id = c.shipment_id
    WHERE c.status = 'ringing' AND c.created_at > ? AND (c.to_id = ? ${u.role === 'admin' && canSupport(u) ? `OR c.to_id = ${SUPPORT}` : ''}) ORDER BY c.id DESC LIMIT 1`, now() - RING_MS, u.id);
  const c = rows[0];
  return json({ call: c ? { id: c.id, from: c.name, from_role: c.role, ref: c.ref, support: c.to_id === SUPPORT } : null });
}
async function getCall(ctx, env) {
  const { c, side } = await myCall(env, ctx.user, ctx.params.id);
  const after = Number(ctx.url.searchParams.get('after') || 0);
  const ice = await all(env, 'SELECT id, cand FROM call_ice WHERE call_id = ? AND side != ? AND id > ? ORDER BY id', c.id, side, after);
  return json({ status: c.status, offer: side === 'callee' ? c.offer : undefined, answer: side === 'caller' ? c.answer : undefined, ice: ice.map((x) => ({ id: x.id, cand: JSON.parse(x.cand) })), answered_at: c.answered_at });
}
async function answerCall(ctx, env) {
  const u = ctx.user;
  const c0 = await one(env, 'SELECT status FROM calls WHERE id = ?', ctx.params.id);
  if (c0 && c0.status === 'active' && u.role === 'admin') fail(409, 'gone', 'Appel déjà pris par un collègue');
  const { c } = await myCall(env, u, ctx.params.id);
  if (c.status !== 'ringing') fail(409, 'gone', c.status === 'active' ? 'Appel déjà pris par un collègue' : 'L\'appel est terminé');
  const r = await run(env, "UPDATE calls SET status = 'active', answer = ?, answered_at = ?, to_id = ? WHERE id = ? AND status = 'ringing'", str(ctx.body.answer, { min: 10, max: 20000, name: 'Réponse' }), now(), u.id, c.id);
  if (!r.meta.changes) fail(409, 'gone', 'Appel déjà pris');
  return json({ ok: true });
}
async function addIce(ctx, env) {
  const { c, side } = await myCall(env, ctx.user, ctx.params.id);
  const list = Array.isArray(ctx.body.cands) ? ctx.body.cands.slice(0, 30) : [ctx.body.cand];
  for (const cand of list.filter(Boolean)) await run(env, 'INSERT INTO call_ice (call_id, side, cand) VALUES (?,?,?)', c.id, side, JSON.stringify(cand).slice(0, 2000));
  return json({ ok: true });
}
async function endCall(ctx, env) {
  const u = ctx.user, { c, side } = await myCall(env, u, ctx.params.id);
  if (['ended', 'missed', 'declined'].includes(c.status)) return json({ ok: true });
  const status = c.status === 'ringing' ? (side === 'callee' ? 'declined' : 'missed') : 'ended';
  await run(env, 'UPDATE calls SET status = ?, ended_at = ? WHERE id = ?', status, now(), c.id);
  if (status === 'missed' && c.to_id > 0) await notify(env, [c.to_id], 'call', 'Appel manqué', `${u.name} a essayé de vous appeler.`);
  await run(env, 'DELETE FROM call_ice WHERE call_id = ?', c.id);
  return json({ ok: true, status });
}

export function registerTalkRoutes(route) {
  const ANY = ['client', 'courier', 'admin'];
  route('GET', '/api/shipments/:id/messages', ANY, listMessages);
  route('POST', '/api/shipments/:id/messages', ANY, postMessage);
  route('GET', '/api/calls/config', ANY, iceConfig);
  route('GET', '/api/calls/incoming', ANY, incoming);
  route('POST', '/api/calls', ANY, startCall);
  route('GET', '/api/calls/:id', ANY, getCall);
  route('POST', '/api/calls/:id/answer', ANY, answerCall);
  route('POST', '/api/calls/:id/ice', ANY, addIce);
  route('POST', '/api/calls/:id/end', ANY, endCall);
}
