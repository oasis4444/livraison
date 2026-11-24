// Créneaux matin / après-midi, validation par l'admin (> 300 000 Ar, trop lourd), poids, parts du centre, service client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';
import { planWindows, nextWindows, weightRule, centreShare } from '../src/rules.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
async function call(method, path, body, token, headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const db = env.DB.raw;
const ST = { am_start: '08:00', am_end: '12:00', pm_start: '13:00', pm_end: '17:00', bike_max_kg: '10', moto_max_kg: '25', weight_free_kg: '5', weight_step_kg: '5', weight_step_fee: '1000',
  share_t1_max: '4000', share_t1: '1000', share_t2_max: '8000', share_t2: '2000', share_t3: '3000' };
const tana = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 3, m); // heure de Madagascar → ms
const hm = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(8, 16).replace('T', ' ');

test('créneaux : récupération le matin → livraison l\'après-midi ; l\'après-midi → le lendemain matin', () => {
  let w = planWindows(ST, tana(24, 9));
  assert.equal(hm(w.pickup_from), '24 08:00'); assert.equal(hm(w.deliver_from), '24 13:00'); assert.equal(hm(w.deliver_to), '24 17:00');
  w = planWindows(ST, tana(24, 14));
  assert.equal(hm(w.pickup_from), '24 13:00'); assert.equal(hm(w.deliver_from), '25 08:00'); assert.equal(hm(w.deliver_to), '25 12:00');
  w = planWindows(ST, tana(24, 11, 30)); // moins de 45 min dans le créneau du matin → après-midi
  assert.equal(hm(w.pickup_from), '24 13:00');
  w = planWindows(ST, tana(24, 19));
  assert.equal(hm(w.pickup_from), '25 08:00'); assert.equal(hm(w.deliver_from), '25 13:00');
  // le client demande plus tard : récupération demain après-midi, livraison au plus tôt après
  const ws = nextWindows(ST, tana(24, 9));
  w = planWindows(ST, tana(24, 9), { pickup_at: ws[3].from });
  assert.equal(hm(w.pickup_from), '25 13:00'); assert.equal(hm(w.deliver_from), '26 08:00');
  // livraison plus tard demandée (jamais avant la récupération)
  w = planWindows(ST, tana(24, 9), { deliver_at: ws[3].from });
  assert.equal(hm(w.deliver_from), '25 13:00');
  w = planWindows(ST, tana(24, 9), { pickup_at: ws[2].from, deliver_at: ws[1].from });
  assert.equal(hm(w.deliver_from), '25 13:00', 'livraison demandée avant la récupération : ignorée');
  // horaires variables
  w = planWindows({ ...ST, am_start: '07:00', am_end: '11:00', pm_start: '14:00', pm_end: '18:30' }, tana(24, 15));
  assert.equal(hm(w.pickup_from), '24 14:00'); assert.equal(hm(w.deliver_to), '25 11:00');
});

test('poids et parts du centre (réglables)', () => {
  assert.deepEqual(weightRule(ST, 3), { extra: 0, moto_only: false, too_heavy: false });
  assert.deepEqual(weightRule(ST, 12), { extra: 2000, moto_only: true, too_heavy: false });
  assert.equal(weightRule(ST, 26).too_heavy, true);
  assert.equal(weightRule({ ...ST, weight_step_fee: '1500' }, 11).extra, 3000);
  assert.deepEqual([2000, 3000, 4000, 4500, 8000, 9000, 15000].map((f) => centreShare(ST, f)), [1000, 1000, 1000, 2000, 2000, 3000, 3000]);
  assert.equal(centreShare(ST, 500), 500, 'jamais plus que les frais');
});

let admin, client, moto, velo, key;
test('mise en place', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  client = (await call('POST', '/api/auth/register', { phone: '0331234567', name: 'Soa Boutique', password: 'secret1' })).data.token;
  for (const [phone, name, cin, vehicle] of [['0341000001', 'Hery Velo', '101211100001', 'velo'], ['0341000002', 'Naina Moto', '101211100002', 'moto']])
    assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone, name, cin, password: 'velo1234', vehicle }, admin)).status, 201);
  velo = (await call('POST', '/api/auth/login', { phone: '0341000001', password: 'velo1234' })).data.token;
  moto = (await call('POST', '/api/auth/login', { phone: '0341000002', password: 'velo1234' })).data.token;
  key = (await call('POST', '/api/admin/merchants', { name: 'Boutique', phone: '0329000000' }, admin)).data.api_key;
});

const P = { lat: -18.8990, lng: 47.5240 }, D = { lat: -18.8840, lng: 47.5240 };
const base = (x = {}) => ({ declared_value: 20000, description: 'Robe', size: '30x20x10', sender: { name: 'Soa', address: 'Behoririka', ...P },
  recipient: { name: 'Rivo', phone: '0341239999', address: 'Ankorondrano', ...D }, ...x });

test('créneaux : le client voit l\'heure de récupération et de livraison, il peut demander un autre créneau', async () => {
  const w = (await call('GET', '/api/shipments/windows', null, client)).data;
  assert.ok(w.windows.length >= 4); assert.deepEqual(w.am, ['08:00', '12:00']); assert.equal(w.max_value, 300000);
  let r = await call('POST', '/api/shipments', base(), client);
  assert.equal(r.status, 201);
  const win = r.data.shipment.windows;
  assert.equal(win.pickup[0], w.windows[0].from); assert.equal(win.delivery[0], w.windows[1].from);
  r = await call('POST', '/api/shipments', base({ pickup_at: w.windows[2].from }), client);
  assert.equal(r.data.shipment.windows.pickup[0], w.windows[2].from); assert.equal(r.data.shipment.windows.delivery[0], w.windows[3].from);
  // horaires modifiables par l'admin (format contrôlé)
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { pm_end: '18h' } }, admin)).status, 400);
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { pm_end: '18:00', share_t3: '3500' } }, admin)).status, 200);
  assert.deepEqual((await call('GET', '/api/shipments/windows', null, client)).data.pm, ['13:00', '18:00']);
  await call('PUT', '/api/admin/settings', { settings: { share_t3: '3000' } }, admin);
});

test('plus de 300 000 Ar : envoyé à l\'admin, qui valide ou refuse', async () => {
  const q = (await call('POST', '/api/shipments/quote', { drop_lat: D.lat, drop_lng: D.lng, value: 450000 }, client)).data;
  assert.equal(q.review, 'value');
  let r = await call('POST', '/api/shipments', base({ declared_value: 450000 }), client);
  assert.equal(r.status, 201); assert.match(r.data.shipment.review, /450 000 Ar > 300 000 Ar/);
  const id = r.data.shipment.id;
  const n = (await call('GET', '/api/notifications?after=0', null, admin)).data.notifications.find((x) => x.title === '⚠️ Colis à valider');
  assert.ok(n); assert.deepEqual(n.target, { type: 'shipment', id });
  // un livreur en tournée ne la reçoit pas tant que ce n'est pas validé
  await call('POST', '/api/courier/depart', { to: { address: 'Ankorondrano', ...D }, route: [[-18.9055, 47.5255], [P.lat, P.lng], [D.lat, D.lng]] }, velo);
  assert.ok(!(await call('GET', '/api/courier/run', null, velo)).data.offers.some((o) => o.id === id));
  r = await call('POST', `/api/admin/shipments/${id}/approve`, { fee: 6000 }, admin);
  assert.equal(r.status, 200); assert.equal(r.data.shipment.review, null); assert.equal(r.data.shipment.fee, 6000);
  assert.ok((await call('GET', '/api/courier/run', null, velo)).data.offers.some((o) => o.id === id), 'validé → proposé au livreur en tournée');
  // refus
  r = await call('POST', '/api/shipments', base({ declared_value: 900000 }), client);
  assert.equal((await call('POST', `/api/admin/shipments/${r.data.shipment.id}/reject`, { reason: 'Trop cher pour un vélo' }, admin)).status, 200);
  assert.equal((await call('GET', `/api/shipments/${r.data.shipment.id}`, null, client)).data.shipment.status, 'cancelled');
});

test('poids : supplément sur les frais, trop lourd pour un vélo → seulement les motos ; > 25 kg → admin', async () => {
  await call('POST', '/api/courier/depart', { to: { address: 'Ankorondrano', ...D }, route: [[-18.9055, 47.5255], [P.lat, P.lng], [D.lat, D.lng]] }, moto);
  let r = await call('POST', '/api/shipments', base({ size: { l: 50, w: 40, h: 30, weight: 12 } }), client);
  assert.equal(r.data.shipment.fee, 3000 + 2000); assert.equal(r.data.shipment.moto_only, true);
  const id = r.data.shipment.id;
  assert.ok((await call('GET', '/api/courier/run', null, moto)).data.offers.some((o) => o.id === id));
  assert.ok(!(await call('GET', '/api/courier/run', null, velo)).data.offers.some((o) => o.id === id), 'pas proposé au vélo');
  r = await call('POST', '/api/shipments', base({ size: { l: 80, w: 60, h: 50, weight: 30 } }), client);
  assert.match(r.data.shipment.review, /poids 30 kg > 25 kg/);
});

test('parts : 4 500 Ar → 2 000 au centre ; la récupération est gratuite, le livreur qui livre garde le reste', async () => {
  const PH = 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64');
  const r = await call('POST', '/api/v1/shipments', { ...base({ external_ref: 'P-45' }), fee: undefined }, null, { 'x-api-key': key });
  const id = r.data.shipment.id;
  await call('POST', `/api/shipments/${id}/fee`, { fee: 4500 }, admin);
  const veloId = db.prepare("SELECT id FROM users WHERE phone = '+261341000001'").get().id;
  await call('POST', `/api/shipments/${id}/assign`, { courier_id: veloId }, admin);
  await call('POST', `/api/shipments/${id}/pickup`, { value: 20000, photo: PH }, velo);
  const tok = db.prepare('SELECT track_token FROM shipments WHERE id = ?').get(id).track_token;
  await call('POST', `/api/track/${tok}/confirm`, {});
  assert.equal((await call('POST', `/api/shipments/${id}/deliver`, { photo: PH }, velo)).status, 200);
  const s = (await call('GET', `/api/shipments/${id}`, null, admin)).data.shipment;
  assert.deepEqual(s.shares, { centre: 2000, courier: 2500, paid: false });
  const st = (await call('GET', '/api/admin/courier-stats?days=1', null, admin)).data.couriers.find((c) => c.id === veloId);
  assert.equal(st.picked, 1); assert.equal(st.delivered, 1); assert.equal(st.delivered_value, 20000); assert.equal(st.fees, 4500);
  assert.equal(st.centre_share, 2000); assert.equal(st.courier_share, 2500); assert.equal(st.unpaid, 1);
  const due = (await call('GET', '/api/admin/cash', null, admin)).data.couriers.find((c) => c.id === veloId);
  assert.equal(due.cash, 24500 - 2500);
  await call('POST', `/api/admin/couriers/${veloId}/settle`, {}, admin);
  assert.equal((await call('GET', '/api/admin/courier-stats?days=1', null, admin)).data.couriers.find((c) => c.id === veloId).unpaid, 0);
});

test('liste des colis : filtre par livreur (récupération ou livraison) et par paiement', async () => {
  const veloId = db.prepare("SELECT id FROM users WHERE phone = '+261341000001'").get().id;
  const all = (await call('GET', `/api/admin/shipments?status=&courier_id=${veloId}`, null, admin)).data.shipments;
  assert.ok(all.length >= 1); assert.ok(all.every((x) => [x.courier?.id, x.pickup_courier?.id, x.delivery_courier?.id].includes(veloId)));
  const p45 = all.find((x) => x.external_ref === 'P-45');
  assert.equal(p45.sender.phone, '+261329000000'); assert.ok(p45.recipient.phone); assert.ok(p45.courier.phone);
  assert.equal(p45.shares.paid, true);
  const unpaid = (await call('GET', `/api/admin/shipments?status=&courier_id=${veloId}&paid=unpaid`, null, admin)).data.shipments;
  assert.ok(unpaid.some((x) => x.external_ref === 'P-45'), 'valeur pas encore payée à l\'expéditeur');
  assert.equal((await call('GET', '/api/admin/shipments?status=&courier_id=none', null, admin)).data.shipments.every((x) => !x.courier), true);
});

test('service client : le client écrit, l\'admin est notifié et répond', async () => {
  assert.equal((await call('POST', '/api/support', { body: 'Bonjour, mon colis est-il parti ?' }, client)).status, 201);
  assert.equal((await call('POST', '/api/support', { body: 'x', ref: 'ALNOPE00' }, client)).status, 404);
  const th = (await call('GET', '/api/admin/support', null, admin)).data.threads;
  assert.equal(th.length, 1); assert.equal(th[0].unread, 1); assert.equal(th[0].name, 'Soa Boutique');
  const n = (await call('GET', '/api/notifications?after=0', null, admin)).data.notifications.find((x) => x.title === '💬 Client Soa Boutique');
  assert.deepEqual(n.target, { type: 'support', id: th[0].user_id });
  const t = (await call('GET', `/api/admin/support/${th[0].user_id}`, null, admin)).data;
  assert.equal(t.messages[0].body, 'Bonjour, mon colis est-il parti ?');
  assert.equal((await call('GET', '/api/admin/support', null, admin)).data.threads[0].unread, 0);
  assert.equal((await call('POST', `/api/admin/support/${th[0].user_id}`, { body: 'Oui, il arrive cet après-midi.' }, admin)).status, 201);
  const mine = (await call('GET', '/api/support', null, client)).data.messages;
  assert.equal(mine.length, 2); assert.equal(mine[1].from_centre, true);
  const cn = (await call('GET', '/api/notifications?after=0', null, client)).data.notifications.find((x) => x.title === '💬 Service client Alefa');
  assert.deepEqual(cn.target, { type: 'support' });
  assert.equal((await call('GET', '/api/admin/support', null, client)).status, 403);
  // le livreur aussi
  assert.equal((await call('POST', '/api/support', { body: 'Pneu crevé, je serai en retard' }, velo)).status, 201);
  assert.equal((await call('GET', '/api/admin/support', null, admin)).data.threads.length, 2);
});
