// Conditions de transport (S/M/L/XL + options), livraison directe, retour 50 %, confidentialité, page de suivi,
// retards, plafond d'argent, code colis + photos à chaque étape, SMS automatiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';
import { alertLate, lateReason } from '../src/shipments.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
async function call(method, path, body, token, headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const db = env.DB.raw;
const PH = 'data:image/jpeg;base64,' + Buffer.from('preuve').toString('base64');
// SMS : passerelle simulée
const sms = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://sms.test/')) { sms.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }
  return realFetch(url, init);
};
const A = { lat: -18.9055, lng: 47.5255 }, NEAR = { lat: -18.8990, lng: 47.5240 }, FAR = { lat: -18.8650, lng: 47.5400 };
let admin, client, velo, veloId, moto;
const body = (x = {}) => ({ description: 'Robe', category: 'S', declared_value: 20000, pickup_addr: 'Analakely', pickup_lat: A.lat, pickup_lng: A.lng,
  recipient_name: 'Rivo Rakoto', recipient_phone: '0341239999', drop_addr: 'Ivandry', drop_lat: FAR.lat, drop_lng: FAR.lng, ...x });

test('mise en place (SMS activés vers une passerelle)', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  client = (await call('POST', '/api/auth/register', { accept_terms: true, phone: '0331234567', name: 'Soa Boutique', password: 'secret1' })).data.token;
  for (const [phone, name, cin, vehicle] of [['0341000001', 'Hery Velo', '101211100001', 'velo'], ['0341000002', 'Naina Moto', '101211100002', 'moto']])
    assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone, name, cin, password: 'velo1234', vehicle }, admin)).status, 201);
  velo = (await call('POST', '/api/auth/login', { phone: '0341000001', password: 'velo1234' })).data.token;
  moto = (await call('POST', '/api/auth/login', { phone: '0341000002', password: 'velo1234' })).data.token;
  veloId = db.prepare("SELECT id FROM users WHERE phone = '+261341000001'").get().id;
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { sms_enabled: '1', sms_gateway_url: 'https://sms.test/send', sms_gateway_token: 'tok' } }, admin)).status, 200);
});

test('conditions de transport : catégories réglables, exemples sans ventilateur ni micro-ondes', async () => {
  const c = (await call('GET', '/api/conditions', null, client)).data;
  assert.deepEqual(c.categories.map((x) => [x.k, x.kg, x.fee, x.vehicle]), [['S', 3, 0, 'velo'], ['M', 10, 1000, 'velo'], ['L', 25, 3000, 'moto'], ['XL', null, null, 'devis']]);
  assert.ok(!/ventilateur|micro/i.test(c.categories.map((x) => x.ex).join(' ')));
  assert.deepEqual(c.options, { fragile: 1000, express: 2000, wait: 500, return_percent: 50, pickup_large: 2000, multi_discount: 50, big_value: 200000, big_value_pct: 1, xl_min: 15000 });
  assert.deepEqual(c.zones, [[1, 3, 2000], [2, 7, 3000], [3, 12, 4000], [4, null, 5000]]); assert.equal(c.version, '2026-11-24');
  assert.deepEqual(c.limits, { bike_kg: 15, moto_kg: 30, max_value: 300000 });
});

test('prix : catégorie + options ; le plus élevé entre catégorie, poids et taille ; livraison directe à 2 000 Ar', async () => {
  let q = (await call('POST', '/api/shipments/quote', { drop_lat: FAR.lat, drop_lng: FAR.lng, pickup_lat: A.lat, pickup_lng: A.lng, category: 'M', fragile: true }, client)).data;
  assert.equal(q.fee, 3000 + 1000 + 1000); assert.equal(q.direct, false);
  q = (await call('POST', '/api/shipments/quote', { drop_lat: FAR.lat, drop_lng: FAR.lng, pickup_lat: A.lat, pickup_lng: A.lng, category: 'S', weight: 12 }, client)).data;
  assert.equal(q.category, 'L', '12 kg → L même si « S » choisi'); assert.equal(q.fee, 3000 + 3000 + 2000); assert.equal(q.moto_only, true);
  q = (await call('POST', '/api/shipments/quote', { drop_lat: FAR.lat, drop_lng: FAR.lng, category: 'L', centre_drop: true }, client)).data;
  assert.equal(q.fee, 3000 + 3000, 'déposé au centre : pas de frais de récupération');
  q = (await call('POST', '/api/shipments/quote', { drop_lat: NEAR.lat, drop_lng: NEAR.lng, pickup_lat: A.lat, pickup_lng: A.lng, category: 'S' }, client)).data;
  assert.equal(q.direct, true); assert.equal(q.fee, 2000);
  q = (await call('POST', '/api/shipments/quote', { drop_lat: FAR.lat, drop_lng: FAR.lng, category: 'S', weight: 40 }, client)).data;
  assert.equal(q.review, 'devis');
  const r = await call('POST', '/api/shipments', body({ category: 'M', fragile: true, express: true }), client);
  assert.equal(r.status, 201);
  const s = r.data.shipment;
  assert.equal(s.category, 'M'); assert.equal(s.fragile, true); assert.equal(s.express, true); assert.equal(s.fee, 3000 + 1000 + 1000 + 2000);
  assert.deepEqual(s.fee_detail.map((l) => l[0]), ['Livraison (Zone 2)', 'Catégorie M', 'Fragile', 'Express']);
  assert.ok(s.windows.delivery[1] - Date.now() <= 91 * 60e3, 'express : livré dans l\'heure');
  const xl = (await call('POST', '/api/shipments', body({ category: 'XL' }), client)).data.shipment;
  assert.match(xl.review, /XL/);
  // dépôt au centre (L) : la récupération se fait au centre
  const dc = (await call('POST', '/api/shipments', body({ category: 'L', centre_drop: true }), client)).data.shipment;
  assert.match(dc.sender.address, /déposé par l'expéditeur/); assert.equal(dc.fee, 6000);
});

test('SMS automatique au destinataire avec le lien de suivi dès la création', async () => {
  const m = sms.find((x) => x.to === '+261341239999');
  assert.ok(m); assert.match(m.message, /\/suivi\/[0-9a-f]{24}/);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM sms_log WHERE status = 'sent'").get().n >= 1);
});

let s1;
test('confidentialité : livreur et client invisibles l\'un pour l\'autre avant confirmation', async () => {
  s1 = (await call('POST', '/api/shipments', body(), client)).data.shipment;
  assert.equal((await call('POST', `/api/shipments/${s1.id}/assign`, { courier_id: veloId }, admin)).status, 200);
  const forCourier = (await call('GET', `/api/shipments/${s1.id}`, null, velo)).data.shipment;
  assert.equal(forCourier.sender.name, null); assert.equal(forCourier.recipient.phone, null); assert.equal(forCourier.contacts_hidden, true);
  assert.ok(forCourier.recipient.address, 'l\'adresse reste visible');
  const forClient = (await call('GET', `/api/shipments/${s1.id}`, null, client)).data.shipment;
  assert.equal(forClient.courier, null); assert.equal(forClient.courier_hidden, true);
  const tok = db.prepare('SELECT track_token FROM shipments WHERE id = ?').get(s1.id).track_token;
  assert.equal((await call('GET', `/api/track/${tok}`)).data.courier, null);
  // le livreur confirme → chacun voit l'autre
  assert.equal((await call('POST', `/api/shipments/${s1.id}/accept`, {}, velo)).status, 200);
  assert.equal((await call('GET', `/api/shipments/${s1.id}`, null, velo)).data.shipment.recipient.phone, '+261341239999');
  assert.equal((await call('GET', `/api/shipments/${s1.id}`, null, client)).data.shipment.courier.name, 'Hery Velo');
  assert.equal((await call('GET', `/api/track/${tok}`)).data.courier, 'Hery');
});

test('preuves : code colis exigé (scan ou 4 caractères) + photo, catégorie corrigée à la récupération', async () => {
  const d = (await call('GET', `/api/shipments/${s1.id}`, null, velo)).data.shipment;
  assert.equal(d.code, d.ref.slice(-4));
  // récupération : le livreur voit que c'est plus gros que « S » → « M » : nouveau prix, l'expéditeur est prévenu
  const p = await call('POST', `/api/shipments/${s1.id}/pickup`, { value: 20000, photo: PH, category: 'M' }, velo);
  assert.equal(p.status, 200);
  const after = (await call('GET', `/api/shipments/${s1.id}`, null, client)).data.shipment;
  assert.equal(after.category, 'M'); assert.equal(after.fee, 4000);
  assert.ok(db.prepare("SELECT title FROM notifications WHERE title LIKE '%Catégorie corrigée%'").get());
  assert.ok(sms.some((x) => /récupéré/.test(x.message)), 'SMS « récupéré »');
  // livraison : sans code → refusé ; mauvais code → refusé
  assert.equal((await call('POST', `/api/shipments/${s1.id}/deliver`, { photo: PH }, velo)).data.error, 'code_required');
  assert.equal((await call('POST', `/api/shipments/${s1.id}/deliver`, { photo: PH, code: 'ZZZZ' }, velo)).data.error, 'bad_code');
});

test('page de suivi : frise horodatée, montant, code PIN et téléphone du livreur en route, changer l\'heure', async () => {
  const tok = db.prepare('SELECT track_token FROM shipments WHERE id = ?').get(s1.id).track_token;
  db.prepare("UPDATE couriers SET lat = ?, lng = ?, last_seen = ? WHERE user_id = ?").run(-18.89, 47.53, Date.now() - 20e3, veloId);
  let t = (await call('GET', `/api/track/${tok}`)).data;
  assert.deepEqual(t.timeline.map((x) => x.k), ['received', 'picked', 'delivery', 'delivered']);
  assert.ok(t.timeline[0].at && t.timeline[1].at); assert.equal(t.timeline[3].at, null);
  assert.equal(t.on_delivery, true); assert.match(t.pin, /^\d{4}$/); assert.equal(t.courier_phone, '+261341000001');
  assert.equal(t.amount_to_pay, 20000 + 4000); assert.equal(t.value, 20000); assert.equal(t.fee, 4000);
  assert.ok(Date.now() - t.position_at >= 20e3, 'heure de la dernière position');
  // « Je ne suis pas disponible » : nouveau créneau
  const w = t.reschedule[1];
  assert.equal((await call('POST', `/api/track/${tok}/reschedule`, { deliver_at: w.from })).status, 200);
  t = (await call('GET', `/api/track/${tok}`)).data;
  assert.equal(t.windows.delivery[0], w.from);
  assert.ok(db.prepare("SELECT title FROM notifications WHERE user_id = ? AND title LIKE '%nouvelle heure%'").get(veloId), 'livreur prévenu');
  assert.equal((await call('POST', `/api/track/${tok}/reschedule`, { deliver_at: 123 })).status, 400);
  // attente > 10 min : +500 Ar ; puis livré avec le bon code
  const wt = await call('POST', `/api/shipments/${s1.id}/wait`, {}, velo);
  assert.equal(wt.data.amount_to_collect, 20000 + 4500);
  assert.equal((await call('POST', `/api/shipments/${s1.id}/wait`, {}, velo)).status, 409);
  const ref = (await call('GET', `/api/shipments/${s1.id}`, null, velo)).data.shipment.ref;
  const pin = db.prepare('SELECT pin FROM shipments WHERE id = ?').get(s1.id).pin;
  const dv = await call('POST', `/api/shipments/${s1.id}/deliver`, { photo: PH, code: ref.slice(-4).toLowerCase(), pin }, velo);
  assert.equal(dv.status, 200); assert.equal(dv.data.delivered, true); assert.equal(dv.data.collected, 24500);
  assert.ok(sms.some((x) => /livré/.test(x.message)), 'SMS « livré »');
  t = (await call('GET', `/api/track/${tok}`)).data;
  assert.ok(t.timeline[3].at); assert.equal(t.pin, null);
});

test('retour : destinataire injoignable après 2 tentatives → l\'expéditeur paie les frais + 50 %', async () => {
  const s = (await call('POST', '/api/shipments', body(), client)).data.shipment;
  await call('POST', `/api/shipments/${s.id}/assign`, { courier_id: veloId }, admin);
  await call('POST', `/api/shipments/${s.id}/pickup`, { value: 20000, photo: PH }, velo);
  let r = await call('POST', `/api/shipments/${s.id}/refuse`, { unreachable: true }, velo);
  assert.equal(r.data.returned, false); assert.equal(r.data.attempt, 1, '1re tentative : nouvelle tentative');
  assert.equal((await call('GET', `/api/shipments/${s.id}`, null, admin)).data.shipment.status, 'picked_up');
  r = await call('POST', `/api/shipments/${s.id}/refuse`, { unreachable: true }, velo);
  assert.equal(r.status, 200); assert.equal(r.data.returned, true); assert.equal(r.data.collected, 0);
  assert.equal(db.prepare('SELECT return_fee FROM shipments WHERE id = ?').get(s.id).return_fee, 3000 + 1500);
  const v = (await call('GET', '/api/admin/cash', null, admin)).data.vendors.find((x) => x.phone === '+261331234567');
  assert.equal(v.return_fees, 4500);
});

test('zones de distance, plusieurs colis −50 %, grosse valeur +1 %, devis XL minimum 15 000', async () => {
  const q = (x) => call('POST', '/api/shipments/quote', { pickup_lat: A.lat, pickup_lng: A.lng, category: 'S', ...x }, client).then((r) => r.data);
  // A → NEAR ≈ 0,9 km (zone 1), A → FAR ≈ 6 km (zone 2), ~10 km (zone 3), ~20 km (périphérie)
  assert.equal((await q({ drop_lat: NEAR.lat, drop_lng: NEAR.lng })).fee, 2000);
  assert.equal((await q({ drop_lat: FAR.lat, drop_lng: FAR.lng })).zone, 'Zone 2');
  assert.equal((await q({ drop_lat: -18.84, drop_lng: 47.55 })).fee, 4000);
  assert.equal((await q({ drop_lat: -18.76, drop_lng: 47.48 })).fee, 5000);
  // 3 colis pour la même adresse : 3 000 + 2 × 1 500
  const m = await q({ drop_lat: FAR.lat, drop_lng: FAR.lng, qty: 3 });
  assert.equal(m.fee, 3000 + 3000); assert.match(m.lines.at(-1)[0], /2 colis en plus/);
  // grosse valeur à encaisser : +1 % au-delà de 200 000 Ar (pas si déjà payée par Mobile Money)
  assert.equal((await q({ drop_lat: FAR.lat, drop_lng: FAR.lng, value: 250000 })).fee, 3000 + 2500);
  assert.equal((await q({ drop_lat: FAR.lat, drop_lng: FAR.lng, value: 250000, value_paid: true })).fee, 3000);
  // XL : devis, 15 000 Ar minimum
  const xl = (await call('POST', '/api/shipments', body({ category: 'XL' }), client)).data.shipment;
  assert.equal((await call('POST', `/api/admin/shipments/${xl.id}/approve`, { fee: 9000 }, admin)).status, 400);
  assert.equal((await call('POST', `/api/admin/shipments/${xl.id}/approve`, { fee: 18000 }, admin)).data.shipment.fee, 18000);
});

test('plafond d\'argent : au-delà, plus de nouvelles missions tant que l\'argent n\'est pas remis', async () => {
  await call('PUT', '/api/admin/settings', { settings: { cash_cap: '10000' } }, admin);
  const s = (await call('POST', '/api/shipments', body(), client)).data.shipment;
  const r = await call('POST', `/api/shipments/${s.id}/assign`, { courier_id: veloId }, admin);
  assert.equal(r.status, 409); assert.match(r.data.message, /bloqué/);
  const ops = (await call('GET', '/api/admin/ops?days=1', null, admin)).data.couriers.find((c) => c.id === veloId);
  assert.ok(ops.due > 10000);
  const cash = (await call('GET', '/api/admin/cash', null, admin)).data.couriers.find((c) => c.id === veloId);
  assert.ok(cash.since, 'ancienneté de l\'argent');
  assert.equal((await call('POST', `/api/shipments/${s.id}/assign`, { courier_id: veloId, force: true }, admin)).status, 200, 'l\'admin peut forcer');
  assert.equal((await call('POST', `/api/shipments/${s.id}/accept`, {}, velo)).status, 409, 'le livreur doit d\'abord remettre l\'argent');
  await call('POST', `/api/admin/couriers/${veloId}/settle`, {}, admin);
  assert.equal((await call('POST', `/api/shipments/${s.id}/accept`, {}, velo)).status, 200);
});

test('retards : alerte automatique une seule fois et colis signalé', async () => {
  const s = (await call('POST', '/api/shipments', body(), client)).data.shipment;
  db.prepare('UPDATE shipments SET created_at = ? WHERE id = ?').run(Date.now() - 30 * 3600e3, s.id);
  const row = db.prepare('SELECT * FROM shipments WHERE id = ?').get(s.id);
  assert.match(lateReason(row), /sans livreur depuis 30 h/);
  assert.equal(await alertLate(env), 1);
  assert.equal(await alertLate(env), 0, 'une seule alerte');
  const n = (await call('GET', '/api/notifications?after=0', null, admin)).data.notifications.find((x) => x.body?.includes(`${s.ref} en retard`));
  assert.deepEqual(n.target, { type: 'shipment', id: s.id });
  const p = (await call('GET', '/api/admin/ops?days=1', null, admin)).data.parcels.find((x) => x.id === s.id);
  assert.ok(p.late); assert.ok(p.since);
});

test.after(() => { globalThis.fetch = realFetch; });

test('conditions acceptées à l\'inscription ; nouvelle version → à accepter de nouveau avant d\'envoyer', async () => {
  assert.equal((await call('POST', '/api/auth/register', { phone: '0331230000', name: 'Sans case', password: 'secret1' })).data.error, 'terms_required');
  const me = (await call('GET', '/api/me', null, client)).data;
  assert.deepEqual([me.terms.version, me.terms.accepted], ['2026-11-24', true]);
  await call('PUT', '/api/admin/settings', { settings: { terms_version: '2026-12-01' } }, admin);
  assert.equal((await call('GET', '/api/me', null, client)).data.terms.accepted, false);
  assert.equal((await call('POST', '/api/shipments', body(), client)).status, 428);
  assert.equal((await call('POST', '/api/terms/accept', {}, client)).data.version, '2026-12-01');
  assert.equal((await call('POST', '/api/shipments', body(), client)).status, 201);
});
