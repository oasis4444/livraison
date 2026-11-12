// Scénario complet : Analakely → Ankorondrano (exemple du cahier des charges).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi, maintenance } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const env = { DB: createD1(dir), PBKDF2_ITER: '1000', APP_VERSION: 'test' };

async function call(method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env);
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() };
}

const ANALAKELY = { lat: -18.9055, lng: 47.5255 };
const ANKORONDRANO = { lat: -18.8840, lng: 47.5240 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let admin, client, c1, c2, deliveryId, pin;

test('création admin + inscriptions', async () => {
  const salt = 'abc';
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)")
    .run(await hashPassword('admin123', salt, 1000), salt);
  admin = (await call('POST', '/api/auth/login', { phone: '034 00 000 00', password: 'admin123' })).data.token;
  assert.ok(admin);

  const r = await call('POST', '/api/auth/register', { phone: '0331234567', name: 'Rasoa Client', password: 'secret1' });
  assert.equal(r.status, 201); client = r.data.token;
  assert.equal((await call('POST', '/api/auth/register', { phone: '+261 33 12 345 67', name: 'XY', password: 'secret1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/register', { phone: '0221234567', name: 'XY', password: 'secret1' })).status, 400);

  assert.equal((await call('POST', '/api/auth/register', { role: 'courier', phone: '0341111111', name: 'Hery', password: 'secret1', cin: '101211123456' })).status, 403, 'inscription livreur publique interdite');
  for (const [phone, name, cin] of [['0341111111', 'Hery Vélo', '101 211 123 456'], ['0322222222', 'Faly Vélo', '101 211 999 456']])
    assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone, name, cin, password: 'secret1' }, admin)).status, 201);
  c1 = (await call('POST', '/api/auth/login', { phone: '0341111111', password: 'secret1' })).data.token;
  c2 = (await call('POST', '/api/auth/login', { phone: '0322222222', password: 'secret1' })).data.token;
  assert.ok(c1 && c2);
});

test('validation admin des livreurs', async () => {
  const list = (await call('GET', '/api/admin/users?role=courier&status=active', null, admin)).data.users;
  assert.equal(list.length, 2, 'livreurs créés actifs par l\'admin');
  assert.equal((await call('GET', '/api/admin/users', null, client)).status, 403, 'client interdit sur admin');
});

test('livreurs en ligne avec GPS', async () => {
  for (const [t, off] of [[c1, 0.003], [c2, -0.004]]) {
    assert.equal((await call('POST', '/api/courier/availability', { available: true }, t)).status, 200);
    const r = await call('POST', '/api/courier/location', { lat: ANALAKELY.lat + off, lng: ANALAKELY.lng + off }, t);
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const near = await call('GET', `/api/couriers/nearby?lat=${ANALAKELY.lat}&lng=${ANALAKELY.lng}`, null, client);
  assert.equal(near.data.couriers.length, 2);
  assert.equal(near.data.couriers.find((c) => c.name === 'Hery').lat, ANALAKELY.lat + 0.003, 'position exacte en temps réel');
});

test('devis + demande à 8 000 Ar', async () => {
  const qv = await call('POST', '/api/quote', { pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, drop_lat: ANKORONDRANO.lat, drop_lng: ANKORONDRANO.lng }, client);
  assert.equal(qv.status, 200); assert.equal(qv.data.zone, 'Antananarivo'); assert.ok(qv.data.suggested_price >= 2000);
  assert.equal((await call('POST', '/api/deliveries', { pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, drop_lat: -15.7, drop_lng: 46.3, proposed_price: 8000 }, client)).status, 400, 'hors zone');
  assert.equal((await call('POST', '/api/deliveries', { pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, drop_lat: ANKORONDRANO.lat, drop_lng: ANKORONDRANO.lng, proposed_price: 500 }, client)).status, 400, 'prix minimum');
  const r = await call('POST', '/api/deliveries', {
    type: 'colis', description: 'Enveloppe', pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, pickup_addr: 'Analakely',
    drop_lat: ANKORONDRANO.lat, drop_lng: ANKORONDRANO.lng, drop_addr: 'Ankorondrano', proposed_price: 8000, payment_method: 'cash',
  }, client);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.couriers_notified, 2);
  deliveryId = r.data.id;
});

test('négociation : 8 000 accepté, 10 000 proposé', async () => {
  const reqs = (await call('GET', '/api/courier/requests', null, c1)).data.requests;
  assert.equal(reqs.length, 1); assert.equal(reqs[0].proposed_price, 8000);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/offer`, {}, c1)).status, 201);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/offer`, { price: 10000 }, c2)).status, 201);
  const view = (await call('GET', `/api/deliveries/${deliveryId}`, null, client)).data;
  assert.deepEqual(view.offers.map((o) => o.price), [8000, 10000]);
  pin = view.pin; assert.match(pin, /^\d{4}$/);
  const cv = (await call('GET', `/api/deliveries/${deliveryId}`, null, c1)).data;
  assert.equal(cv.pin, undefined, 'le livreur ne voit pas le PIN');
  const notif = (await call('GET', '/api/notifications', null, client)).data;
  assert.ok(notif.unread >= 2);
  // le client choisit l'offre à 10 000 (meilleure note par ex.)
  const chosen = view.offers.find((o) => o.price === 10000);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/accept`, { offer_id: chosen.id }, client)).status, 200);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/accept`, { offer_id: view.offers[0].id }, client)).status, 404, 'double attribution impossible');
});

test('suivi GPS, messagerie, récupération et livraison avec PIN', async () => {
  await sleep(2600);
  const loc = await call('POST', '/api/courier/location', { lat: -18.8995, lng: 47.5250 }, c2);
  assert.equal(loc.data.active_delivery, deliveryId);
  const v = (await call('GET', `/api/deliveries/${deliveryId}`, null, client)).data;
  assert.equal(v.status, 'assigned'); assert.equal(v.courier.name, 'Faly Vélo'); assert.ok(v.courier.lat);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/messages`, { body: 'Je suis devant le portail' }, c2)).status, 201);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/messages`, { body: 'J\'arrive' }, c1)).status, 403);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/deliver`, { pin }, c2)).status, 409, 'récupération obligatoire avant');
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/pickup`, {}, c2)).status, 200);
  await sleep(2600);
  await call('POST', '/api/courier/location', { lat: ANKORONDRANO.lat, lng: ANKORONDRANO.lng }, c2);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/deliver`, { pin: pin === '0000' ? '1111' : '0000' }, c2)).status, 400);
  const done = await call('POST', `/api/deliveries/${deliveryId}/deliver`, { pin }, c2);
  assert.equal(done.status, 200); assert.equal(done.data.commission, 1000);
  const w = (await call('GET', '/api/courier/wallet', null, c2)).data;
  assert.equal(w.courier.balance, -1000); assert.equal(w.stats.total, 1);
  assert.equal((await call('POST', `/api/deliveries/${deliveryId}/rate`, { rating: 5, comment: 'Rapide' }, client)).status, 200);
  assert.equal((await call('GET', '/api/me', null, c2)).data.courier.rating, 5);
});

test('administration : stats, carte, paramètres, rapports, export', async () => {
  const s = (await call('GET', '/api/admin/stats', null, admin)).data;
  assert.equal(s.today.delivered, 1); assert.equal(s.today.commission, 1000); assert.equal(s.couriers.online, 2);
  const live = (await call('GET', '/api/admin/live', null, admin)).data;
  assert.equal(live.couriers.length, 2);
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { commission_percent: 12, commission_mode: 'percent' } }, admin)).status, 200);
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { commission_mode: 'gratuit' } }, admin)).status, 400);
  const rep = (await call('GET', '/api/admin/reports?period=month', null, admin)).data;
  assert.equal(rep.series[0].delivered, 1); assert.equal(rep.series[0].revenue, 10000);
  const ex = await call('GET', '/api/admin/export?type=deliveries', null, admin);
  assert.match(ex.data, /Analakely/);
  const tx = await call('POST', '/api/admin/transactions', { courier_id: w2id(live), kind: 'deposit', amount: 1000, note: 'Commission réglée MVola' }, admin);
  assert.equal(tx.status, 201);
  assert.equal((await call('GET', '/api/courier/wallet', null, c2)).data.courier.balance, 0);
});
const w2id = (live) => live.couriers.find((c) => c.name === 'Faly Vélo').id;

test('abonnement, promo, SOS, annulation, sécurité', async () => {
  await call('PUT', '/api/admin/settings', { settings: { commission_mode: 'subscription' } }, admin);
  await call('POST', '/api/admin/promos', { code: 'tana10', percent: 10 }, admin);
  const r = await call('POST', '/api/deliveries', { pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, drop_lat: ANKORONDRANO.lat, drop_lng: ANKORONDRANO.lng, proposed_price: 6000, promo_code: 'TANA10', payment_method: 'mvola' }, client);
  assert.equal(r.status, 201);
  assert.equal((await call('POST', `/api/deliveries/${r.data.id}/offer`, {}, c1)).status, 402, 'abonnement requis');
  const c1id = (await call('GET', '/api/me', null, c1)).data.user.id;
  await call('POST', '/api/admin/transactions', { courier_id: c1id, kind: 'subscription', amount: 20000, months: 1 }, admin);
  assert.equal((await call('POST', `/api/deliveries/${r.data.id}/offer`, {}, c1)).status, 201);
  assert.equal((await call('POST', `/api/deliveries/${r.data.id}/cancel`, { reason: 'Plus besoin' }, client)).status, 200);
  assert.equal((await call('POST', '/api/complaints', { kind: 'sos', lat: ANALAKELY.lat, lng: ANALAKELY.lng }, c1)).status, 201);
  const comp = (await call('GET', '/api/admin/complaints', null, admin)).data.complaints;
  assert.equal(comp[0].kind, 'sos');
  // 5 mauvais mots de passe → verrouillage
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { phone: '0331234567', password: 'faux' });
  assert.equal((await call('POST', '/api/auth/login', { phone: '0331234567', password: 'secret1' })).status, 429);
  assert.equal((await call('GET', '/api/me', null, 'f'.repeat(64))).status, 401);
  const csrf = await handleApi(new Request('https://alefa.test/api/deliveries', { method: 'POST', headers: { authorization: `Bearer ${client}`, 'content-type': 'text/plain' }, body: '{}' }), env);
  assert.equal(csrf.status, 415);
  await maintenance(env);
});

test('axes (secteurs) et planning horaire', async () => {
  await call('PUT', '/api/admin/settings', { settings: { commission_mode: 'percent' } }, admin);
  assert.equal((await call('POST', '/api/admin/axes', { name: 'Analakely', center_lat: ANALAKELY.lat, center_lng: ANALAKELY.lng, radius_km: 1.5 }, admin)).status, 200);
  assert.equal((await call('POST', '/api/admin/axes', { name: 'Ivato', center_lat: -18.80, center_lng: 47.48, radius_km: 3 }, admin)).status, 200);
  const axes = (await call('GET', '/api/admin/axes', null, admin)).data.axes;
  const ana = axes.find((a) => a.name === 'Analakely'), iva = axes.find((a) => a.name === 'Ivato');
  const c1id = (await call('GET', '/api/me', null, c1)).data.user.id;
  // c1 : Ivato toute la journée → ne voit pas les demandes d'Analakely
  assert.equal((await call('PUT', `/api/admin/couriers/${c1id}/axes`, { slots: [{ axe_id: iva.id, start_min: 0, end_min: 1440 }] }, admin)).status, 200);
  const r = await call('POST', '/api/deliveries', { pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, drop_lat: ANKORONDRANO.lat, drop_lng: ANKORONDRANO.lng, proposed_price: 5000 }, client);
  assert.equal(r.status, 201);
  let reqs = (await call('GET', '/api/courier/requests', null, c1)).data;
  assert.equal(reqs.requests.length, 0); assert.equal(reqs.axe.current.name, 'Ivato');
  assert.equal((await call('POST', `/api/deliveries/${r.data.id}/offer`, {}, c1)).status, 403, 'hors axe');
  // créneaux d'1 heure sur 24 h : Analakely toute la journée par tranches
  const slots = Array.from({ length: 24 }, (_, h) => ({ axe_id: ana.id, start_min: h * 60, end_min: h * 60 + 60 }));
  await call('PUT', `/api/admin/couriers/${c1id}/axes`, { slots }, admin);
  reqs = (await call('GET', '/api/courier/requests', null, c1)).data;
  assert.equal(reqs.requests.length, 1); assert.equal(reqs.axe.current.name, 'Analakely'); assert.ok(reqs.axe.next);
  assert.equal((await call('POST', `/api/deliveries/${r.data.id}/offer`, {}, c1)).status, 201);
  const live = (await call('GET', '/api/admin/live', null, admin)).data;
  assert.equal(live.couriers.find((c) => c.id === c1id).axe, 'Analakely'); assert.equal(live.axes.length, 2);
  assert.equal((await call('POST', `/api/admin/users/${c1id}/password`, { password: 'nouveau1' }, admin)).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { phone: '0341111111', password: 'nouveau1' })).status, 200);
});
