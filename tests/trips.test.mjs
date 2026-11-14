// Trajets des livreurs : affectation « sur le chemin » (couloir, sens, capacité, chevauchement),
// acceptation / refus avec réaffectation, suivi public, idempotence, limitation et journal de l'API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
async function call(method, path, body, token, headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json() };
}
// Analakely → Ankorondrano → Ivandry
const ANALAKELY = { lat: -18.9055, lng: 47.5255 }, ANKORONDRANO = { lat: -18.8900, lng: 47.5240 }, IVANDRY = { lat: -18.8750, lng: 47.5330 };
const AMBOHIMANARINA = { lat: -18.8770, lng: 47.4930 };
const ROUTE = [[-18.9055, 47.5255], [-18.8980, 47.5250], [-18.8900, 47.5240], [-18.8820, 47.5290], [-18.8750, 47.5330]];
let admin, c1, c2, c1id, c2id, vendor, key;
const ship = (p, d, ref) => ({ external_ref: ref, declared_value: 10000, sender: { name: 'Boutique', address: 'Pickup', ...p }, recipient: { name: 'Client Test', phone: '0331112233', address: 'Drop', ...d } });
const getShip = async (id) => (await call('GET', `/api/shipments/${id}`, null, admin)).data.shipment;

test('mise en place : deux livreurs déclarent leur trajet', async () => {
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  c1id = (await call('POST', '/api/admin/users', { role: 'courier', phone: '0341111111', name: 'Hery Vélo', cin: '101211123456', password: 'velo123' }, admin)).data.id;
  c2id = (await call('POST', '/api/admin/users', { role: 'courier', phone: '0342222222', name: 'Tiana Vélo', cin: '101211123457', password: 'velo123' }, admin)).data.id;
  c1 = (await call('POST', '/api/auth/login', { phone: '0341111111', password: 'velo123' })).data.token;
  c2 = (await call('POST', '/api/auth/login', { phone: '0342222222', password: 'velo123' })).data.token;
  const trip = (dep, cap = 10) => ({ from: { address: 'Analakely', ...ANALAKELY }, to: { address: 'Ivandry', ...IVANDRY }, route: ROUTE, depart_at: dep, capacity: cap });
  const t1 = await call('POST', '/api/courier/trips', trip(Date.now() + 30 * 60e3, 2), c1);
  assert.equal(t1.status, 201, JSON.stringify(t1.data)); assert.ok(t1.data.trip.km > 3 && t1.data.trip.km < 6);
  // même livreur, trajet qui chevauche → refusé
  assert.equal((await call('POST', '/api/courier/trips', trip(Date.now() + 45 * 60e3), c1)).status, 409);
  assert.equal((await call('POST', '/api/courier/trips', trip(Date.now() + 60 * 60e3), c2)).status, 201);
  const m = await call('POST', '/api/admin/merchants', { name: 'Vente Test', phone: '0329999999' }, admin);
  key = m.data.api_key;
  const sch = (await call('GET', '/api/schedule', null, c2)).data;
  assert.equal(sch.trips.length, 2); assert.equal(sch.trips[0].courier, 'Hery');
});

let sA;
test('colis sur le chemin et dans le bon sens → livreur le plus tôt', async () => {
  const r = await call('POST', '/api/v1/shipments', ship(ANALAKELY, ANKORONDRANO, 'T-1'), null, { 'x-api-key': key });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  sA = r.data.shipment;
  assert.equal(sA.status, 'assigned'); assert.equal(sA.courier.id, c1id); assert.ok(sA.trip_id); assert.equal(sA.accepted_at, null);
  assert.equal(sA.axe, 'Analakely → Ivandry');
});

test('à contresens ou hors du chemin → non attribué', async () => {
  const rev = await call('POST', '/api/v1/shipments', ship(ANKORONDRANO, ANALAKELY, 'T-2'), null, { 'x-api-key': key });
  assert.equal(rev.data.shipment.status, 'pending', 'Ankorondrano → Analakely va dans l\'autre sens');
  const far = await call('POST', '/api/v1/shipments', ship(ANALAKELY, AMBOHIMANARINA, 'T-3'), null, { 'x-api-key': key });
  assert.equal(far.data.shipment.status, 'pending', 'Ambohimanarina est loin du trajet');
});

test('capacité : le trajet plein passe au livreur suivant', async () => {
  const a = await call('POST', '/api/v1/shipments', ship(ANALAKELY, IVANDRY, 'T-4'), null, { 'x-api-key': key });
  assert.equal(a.data.shipment.courier.id, c1id); // 2e colis de Hery (capacité 2)
  const b = await call('POST', '/api/v1/shipments', ship(ANALAKELY, IVANDRY, 'T-5'), null, { 'x-api-key': key });
  assert.equal(b.data.shipment.courier.id, c2id, 'Hery est plein → Tiana');
});

test('acceptation, puis refus → réaffectation automatique', async () => {
  const mine = (await call('GET', '/api/shipments', null, c1)).data.shipments;
  const x = mine.find((s) => s.external_ref === 'T-4');
  assert.equal((await call('POST', `/api/shipments/${x.id}/accept`, {}, c1)).status, 200);
  assert.ok((await getShip(x.id)).accepted_at);
  assert.equal((await call('POST', `/api/shipments/${sA.id}/accept`, {}, c2)).status, 403, 'pas son colis');
  const d = await call('POST', `/api/shipments/${sA.id}/decline`, { reason: 'crevaison' }, c1);
  assert.equal(d.status, 200); assert.equal(d.data.reassigned_to, 'Tiana');
  const s = await getShip(sA.id);
  assert.equal(s.courier.id, c2id); assert.ok(s.events.some((e) => e.status === 'declined' && /crevaison/.test(e.note)));
  // Tiana refuse aussi : plus personne de compatible → reste à programmer (jamais renvoyé à Hery)
  await call('POST', `/api/shipments/${sA.id}/decline`, { reason: 'plein' }, c2);
  assert.equal((await getShip(sA.id)).status, 'pending');
});

test('annulation d\'un trajet : ses colis repartent', async () => {
  const t = (await call('GET', '/api/courier/trips', null, c2)).data.trips[0];
  const r = await call('POST', `/api/courier/trips/${t.id}/cancel`, {}, c2);
  assert.equal(r.status, 200); assert.equal(r.data.moved, 1);
  const s = (await call('GET', '/api/admin/shipments?q=T-5', null, admin)).data.shipments[0];
  assert.equal(s.courier.id, c1id, 'Hery a refusé T-1 : une place s\'est libérée sur son trajet');
});

test('suivi public : position visible seulement pendant la livraison', async () => {
  const s = await getShip(sA.id);
  assert.match(s.track_token, /^[0-9a-f]{24}$/);
  let t = await call('GET', `/api/track/${s.track_token}`);
  assert.equal(t.status, 200); assert.equal(t.data.position, null); assert.equal(t.data.recipient, 'Client');
  assert.equal((await call('GET', '/api/track/zzzzzzzzzzzz')).status, 404);
  // attribué à Hery, parti, position fraîche
  env.DB.raw.prepare("UPDATE shipments SET status='assigned', courier_id=?, stage='departed' WHERE id=?").run(c1id, sA.id);
  env.DB.raw.prepare('UPDATE couriers SET lat=?, lng=?, last_seen=? WHERE user_id=?').run(-18.9, 47.525, Date.now(), c1id);
  t = await call('GET', `/api/track/${s.track_token}`);
  assert.deepEqual(t.data.position, [-18.9, 47.525]); assert.ok(t.data.eta > Date.now()); assert.equal(t.data.courier, 'Hery');
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE id=?").run(Date.now(), sA.id);
  t = await call('GET', `/api/track/${s.track_token}`);
  assert.equal(t.data.position, null, 'plus de position après la livraison');
});

test('API : clé d\'idempotence, limitation, journal des échanges', async () => {
  const body = ship(ANALAKELY, ANKORONDRANO); delete body.external_ref;
  const a = await call('POST', '/api/v1/shipments', body, null, { 'x-api-key': key, 'idempotency-key': 'abc-123' });
  const b = await call('POST', '/api/v1/shipments', body, null, { 'x-api-key': key, 'idempotency-key': 'abc-123' });
  assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.data.duplicate, true); assert.equal(a.data.shipment.ref, b.data.shipment.ref);
  const bad = await call('POST', '/api/v1/shipments', { recipient: {} }, null, { 'x-api-key': key });
  assert.equal(bad.status, 400);
  const log = (await call('GET', '/api/admin/sync-log', null, admin)).data.log;
  assert.ok(log.some((x) => x.ok === 1 && x.ref === 'T-1')); assert.ok(log.some((x) => x.ok === 0));
  env.DB.raw.prepare("UPDATE settings SET value='3' WHERE key='api_rate_per_min'").run();
  env.DB.raw.prepare('DELETE FROM rate_hits').run();
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call('GET', '/api/v1/shipments', null, null, { 'x-api-key': key })).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});
