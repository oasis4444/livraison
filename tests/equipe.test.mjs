// Équipe de l'administration (rôles), discussion par colis, appels dans la plateforme (signalisation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
const db = env.DB.raw;
db.prepare("UPDATE settings SET value = '0' WHERE key IN ('scan_required', 'direct_km')").run();
async function call(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (phone, password) => (await call('POST', '/api/auth/login', { phone, password })).data.token;
let admin, caisse, service, client, dest, velo, sid;

test('équipe : l\'administrateur crée des comptes avec un rôle', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = await login('0340000000', 'admin123');
  assert.equal((await call('POST', '/api/admin/users', { role: 'admin', staff: 'caisse', name: 'Fara Caisse', phone: '0340000001', password: 'caisse1' }, admin)).status, 201);
  assert.equal((await call('POST', '/api/admin/users', { role: 'admin', staff: 'service', name: 'Tiana Service', phone: '0340000002', password: 'service1' }, admin)).status, 201);
  assert.equal((await call('POST', '/api/admin/users', { role: 'admin', staff: 'pirate', name: 'X', phone: '0340000003', password: 'xxxxxx' }, admin)).status, 400);
  caisse = await login('0340000001', 'caisse1'); service = await login('0340000002', 'service1');
  const me = (await call('GET', '/api/me', null, caisse)).data.user;
  assert.equal(me.staff, 'caisse'); assert.ok(me.perms.includes('cash')); assert.ok(!me.perms.includes('support'));
  assert.equal((await call('GET', '/api/me', null, admin)).data.user.perms, null);
  const st = (await call('GET', '/api/admin/staff', null, admin)).data;
  assert.deepEqual(st.staff.map((x) => x.staff).sort(), ['admin', 'caisse', 'service']);
});

test('équipe : chaque rôle n\'accède qu\'à ses rubriques (vérifié par le serveur)', async () => {
  assert.equal((await call('GET', '/api/admin/cash', null, caisse)).status, 200);
  assert.equal((await call('GET', '/api/admin/support', null, caisse)).status, 403);
  assert.equal((await call('GET', '/api/admin/support/unread', null, caisse)).status, 200);
  assert.equal((await call('GET', '/api/admin/settings', null, caisse)).status, 403);
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { opt_fragile: '1' } }, service)).status, 403);
  assert.equal((await call('POST', '/api/admin/users', { role: 'admin', name: 'Y', phone: '0340000009', password: 'yyyyyy' }, service)).status, 403);
  assert.equal((await call('GET', '/api/admin/staff', null, service)).status, 403);
  assert.equal((await call('GET', '/api/admin/support', null, service)).status, 200);
  assert.equal((await call('GET', '/api/admin/cash', null, service)).status, 403);
  assert.equal((await call('GET', '/api/admin/stats', null, caisse)).status, 200);
  // Changement de rôle par l'administrateur (pas par soi-même)
  const id = db.prepare("SELECT id FROM users WHERE phone = '+261340000001'").get().id;
  assert.equal((await call('PATCH', `/api/admin/staff/${id}`, { staff: 'service' }, admin)).status, 200);
  assert.equal((await call('GET', '/api/admin/support', null, caisse)).status, 200);
  assert.equal((await call('PATCH', `/api/admin/staff/${id}`, { staff: 'admin' }, caisse)).status, 403);
  // Les actions sont enregistrées au nom de chacun (journal)
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'staff_role'").get().n >= 1);
});

test('discussion par colis : expéditeur, destinataire et livreur une fois la mission confirmée', async () => {
  client = (await call('POST', '/api/auth/register', { accept_terms: true, phone: '0331234567', name: 'Soa Boutique', password: 'secret1' })).data.token;
  dest = (await call('POST', '/api/auth/register', { accept_terms: true, phone: '0341239999', name: 'Rivo', password: 'secret1' })).data.token;
  assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone: '0341000001', name: 'Hery Velo', cin: '101211100001', password: 'velo1234', vehicle: 'velo' }, admin)).status, 201);
  velo = await login('0341000001', 'velo1234');
  const r = await call('POST', '/api/shipments', { description: 'Robe', category: 'S', declared_value: 20000, pickup_addr: 'Analakely', pickup_lat: -18.9055, pickup_lng: 47.5255,
    recipient_name: 'Rivo', recipient_phone: '0341239999', drop_addr: 'Ivandry', drop_lat: -18.8752, drop_lng: 47.5328 }, client);
  assert.equal(r.status, 201); sid = r.data.shipment.id;
  assert.equal((await call('POST', `/api/shipments/${sid}/messages`, { body: 'Bonjour, le colis est prêt au portail' }, client)).status, 201);
  let m = (await call('GET', `/api/shipments/${sid}/messages`, null, dest)).data;
  assert.equal(m.role, 'recipient'); assert.equal(m.messages[0].body, 'Bonjour, le colis est prêt au portail'); assert.equal(m.messages[0].mine, false);
  assert.ok(!m.can_call.includes('courier')); // pas encore de livreur confirmé
  // Livreur pas encore confirmé : pas d'accès
  const vid = db.prepare("SELECT id FROM users WHERE phone = '+261341000001'").get().id;
  db.prepare("UPDATE shipments SET courier_id = ?, pickup_courier_id = ?, status = 'assigned' WHERE id = ?").run(vid, vid, sid);
  assert.equal((await call('GET', `/api/shipments/${sid}/messages`, null, velo)).status, 403);
  db.prepare('UPDATE shipments SET accepted_at = ? WHERE id = ?').run(Date.now(), sid);
  m = (await call('GET', `/api/shipments/${sid}/messages`, null, velo)).data;
  assert.equal(m.role, 'courier'); assert.deepEqual(m.can_call, ['sender', 'recipient']);
  assert.equal((await call('POST', `/api/shipments/${sid}/messages`, { body: 'J\'arrive dans 10 minutes' }, velo)).status, 201);
  assert.ok((await call('GET', `/api/shipments/${sid}/messages`, null, client)).data.can_call.includes('courier'));
  const n = (await call('GET', '/api/notifications?after=0', null, client)).data.notifications.find((x) => /J'arrive/.test(x.body));
  assert.equal(n.target.type, 'chat'); assert.equal(n.target.id, sid);
  // Une personne sans lien avec le colis n'y a pas accès
  const other = (await call('POST', '/api/auth/register', { accept_terms: true, phone: '0329999999', name: 'Autre', password: 'secret1' })).data.token;
  assert.equal((await call('GET', `/api/shipments/${sid}/messages`, null, other)).status, 403);
});

test('appel dans la plateforme : sonnerie, réponse, échange réseau, fin', async () => {
  const offer = JSON.stringify({ type: 'offer', sdp: 'v=0 offre simulée' });
  let r = await call('POST', '/api/calls', { to: 'courier', shipment_id: sid, offer }, client);
  assert.equal(r.status, 201); const cid = r.data.id; assert.equal(r.data.peer, 'Hery Velo');
  const inc = (await call('GET', '/api/calls/incoming', null, velo)).data.call;
  assert.equal(inc.id, cid); assert.equal(inc.from, 'Soa Boutique');
  assert.equal((await call('GET', '/api/calls/incoming', null, dest)).data.call, null);
  assert.equal((await call('GET', `/api/calls/${cid}`, null, dest)).status, 403);
  assert.equal((await call('POST', `/api/calls/${cid}/ice`, { cands: [{ candidate: 'a', sdpMid: '0' }] }, client)).status, 200);
  const g = (await call('GET', `/api/calls/${cid}`, null, velo)).data;
  assert.equal(g.offer, offer); assert.equal(g.ice[0].cand.candidate, 'a');
  assert.equal((await call('POST', `/api/calls/${cid}/answer`, { answer: JSON.stringify({ type: 'answer', sdp: 'v=0 réponse' }) }, velo)).status, 200);
  const g2 = (await call('GET', `/api/calls/${cid}`, null, client)).data;
  assert.equal(g2.status, 'active'); assert.match(g2.answer, /réponse/);
  assert.equal((await call('POST', `/api/calls/${cid}/end`, {}, client)).data.status, 'ended');
  // Le livreur peut rappeler le destinataire, pas un inconnu
  assert.equal((await call('POST', '/api/calls', { to: 'recipient', shipment_id: sid, offer }, velo)).status, 201);
  // Appel au service client : sonne chez l'équipe autorisée, le premier qui décroche le prend
  r = await call('POST', '/api/calls', { to: 'support', offer }, dest);
  assert.equal(r.status, 201);
  assert.equal((await call('GET', '/api/calls/incoming', null, service)).data.call.support, true);
  assert.equal((await call('GET', '/api/calls/incoming', null, admin)).data.call.id, r.data.id);
  assert.equal((await call('POST', `/api/calls/${r.data.id}/answer`, { answer: JSON.stringify({ type: 'answer', sdp: 'v=0 ok' }) }, service)).status, 200);
  assert.equal((await call('POST', `/api/calls/${r.data.id}/answer`, { answer: JSON.stringify({ type: 'answer', sdp: 'v=0 ok' }) }, admin)).status, 409);
  // Sans réponse : appel manqué (notification)
  r = await call('POST', '/api/calls', { to: 'sender', shipment_id: sid, offer }, velo);
  db.prepare('UPDATE calls SET created_at = created_at - 60000 WHERE id = ?').run(r.data.id);
  await call('GET', '/api/calls/incoming', null, client);
  assert.equal(db.prepare('SELECT status FROM calls WHERE id = ?').get(r.data.id).status, 'missed');
  assert.ok((await call('GET', '/api/notifications?after=0', null, client)).data.notifications.some((x) => x.title === 'Appel manqué'));
  const cfg = (await call('GET', '/api/calls/config', null, client)).data;
  assert.ok(cfg.iceServers[0].urls.some((u) => u.startsWith('stun:')));
});
