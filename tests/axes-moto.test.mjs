// Créneau d'axe avec lieu de départ et d'arrivée (saisis par l'admin) et livreurs à moto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
env.DB.raw.prepare("UPDATE settings SET value = 'auto' WHERE key = 'dispatch_mode'").run(); // ces tests utilisent l'attribution automatique
env.DB.raw.prepare("UPDATE settings SET value = '0' WHERE key = 'direct_km'").run(); // et le tarif normal (pas de tarif direct)
env.DB.raw.prepare("UPDATE settings SET value = '0' WHERE key = 'zones_enabled'").run(); // frais fixes (zones testées à part)
env.DB.raw.prepare("UPDATE settings SET value = '0' WHERE key = 'scan_required'").run(); // code colis non exigé (testé à part)
async function call(method, path, body, token, headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const db = env.DB.raw;
// Axe « Sud » = petit cercle autour d'Anosy ; chemin du créneau Anosy → Ambohijatovo → Analakely → Behoririka.
const ANOSY = { lat: -18.9150, lng: 47.5200 }, BEHORIRIKA = { lat: -18.8990, lng: 47.5240 };
const ON_PATH = { lat: -18.9070, lng: 47.5222 }; // à ~100 m du chemin, à ~0,9 km d'Anosy (hors cercle de 0,5 km)
let admin, motoId, moto, axeId, key;

test('mise en place : un livreur à moto', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  const r = await call('POST', '/api/admin/users', { role: 'courier', phone: '0345555555', name: 'Faly Moto', cin: '101211123458', password: 'moto123', vehicle: 'moto' }, admin);
  assert.equal(r.status, 201); motoId = r.data.id;
  moto = (await call('POST', '/api/auth/login', { phone: '0345555555', password: 'moto123' })).data.token;
  const users = (await call('GET', '/api/admin/users?role=courier', null, admin)).data.users;
  assert.equal(users.find((u) => u.id === motoId).vehicle, 'moto');
  assert.equal((await call('GET', '/api/me', null, moto)).data.courier.vehicle, 'moto');
  assert.equal((await call('POST', '/api/admin/axes', { name: 'Sud', center_lat: ANOSY.lat, center_lng: ANOSY.lng, radius_km: 0.5 }, admin)).status, 200);
  axeId = (await call('GET', '/api/admin/axes', null, admin)).data.axes.find((a) => a.name === 'Sud').id;
  key = (await call('POST', '/api/admin/merchants', { name: 'Boutique', phone: '0329999999' }, admin)).data.api_key;
});

test('créneau : départ et arrivée obligatoires ensemble, enregistrés avec le chemin', async () => {
  const base = { axe_id: axeId, start_min: 0, end_min: 1440 };
  let r = await call('PUT', `/api/admin/couriers/${motoId}/axes`, { slots: [{ ...base, from: { address: 'Anosy', ...ANOSY } }] }, admin);
  assert.equal(r.status, 400); assert.match(r.data.message, /départ ET le lieu d'arrivée/);
  r = await call('PUT', `/api/admin/couriers/${motoId}/axes`, { slots: [{ ...base, from: { address: 'Anosy' }, to: { address: 'Behoririka', ...BEHORIRIKA } }] }, admin);
  assert.equal(r.status, 400);
  const route = [[ANOSY.lat, ANOSY.lng], [-18.9100, 47.5215], [-18.9055, 47.5225], [BEHORIRIKA.lat, BEHORIRIKA.lng]];
  r = await call('PUT', `/api/admin/couriers/${motoId}/axes`, { slots: [{ ...base, from: { address: 'Anosy', ...ANOSY }, to: { address: 'Behoririka', ...BEHORIRIKA }, route, km: 2.1 }] }, admin);
  assert.equal(r.status, 200);
  const g = (await call('GET', `/api/admin/couriers/${motoId}/axes`, null, admin)).data;
  assert.equal(g.slots[0].from_addr, 'Anosy'); assert.equal(g.slots[0].to_addr, 'Behoririka'); assert.equal(g.slots[0].km, 2.1);
  assert.equal(JSON.parse(g.slots[0].route).length, 4);
  assert.equal(g.state.current.to_addr, 'Behoririka');
  // le livreur voit son créneau avec départ → arrivée, sans pouvoir le modifier
  const mine = (await call('GET', '/api/courier/schedule', null, moto)).data.slots;
  assert.equal(mine[0].from_addr, 'Anosy');
  // horaires publics : départ / arrivée et véhicule, sans le tracé complet
  const sch = (await call('GET', '/api/v1/schedule', null, null, { 'x-api-key': key })).data;
  const d = sch.departures.find((x) => x.courier_id === motoId);
  assert.equal(d.from_addr, 'Anosy'); assert.equal(d.vehicle, 'moto'); assert.equal(d.route, undefined);
});

test('un colis sur le chemin départ → arrivée (hors du cercle de l\'axe) est confié au livreur', async () => {
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'M-1', declared_value: 10000,
    sender: { name: 'Boutique', address: 'Anosy', ...ANOSY }, recipient: { name: 'Voahangy', phone: '0331112233', address: 'Ambohijatovo', ...ON_PATH } }, null, { 'x-api-key': key });
  assert.equal(r.status, 201);
  assert.equal(r.data.shipment.courier?.id, motoId);
  // loin du chemin et de l'axe : personne
  const far = await call('POST', '/api/v1/shipments', { external_ref: 'M-2', declared_value: 10000,
    sender: { name: 'Boutique', address: 'Anosy', ...ANOSY }, recipient: { name: 'Lova', phone: '0331112234', address: 'Ivato', lat: -18.80, lng: 47.48 } }, null, { 'x-api-key': key });
  assert.equal(far.data.shipment.courier, null);
  // suggestions : véhicule affiché
  const sug = (await call('GET', `/api/admin/shipments/${far.data.shipment.id}/suggest`, null, admin)).data;
  assert.equal([...sug.pickup, ...sug.delivery].find((c) => c.id === motoId).vehicle, 'moto');
});

test('changer de véhicule : vélo ↔ moto', async () => {
  assert.equal((await call('POST', `/api/admin/users/${motoId}/vehicle`, { vehicle: 'velo' }, admin)).status, 200);
  assert.equal((await call('GET', '/api/me', null, moto)).data.courier.vehicle, 'velo');
  assert.equal((await call('POST', `/api/admin/users/${motoId}/vehicle`, { vehicle: 'avion' }, admin)).status, 400);
});
