// Colis du centre : API marchand → départ du livreur → récupération (photo + valeur) → livraison / refus / annulation → caisse → paiement vendeur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
const hooks = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (String(url).startsWith('https://vente.test')) { hooks.push({ url, init }); return new Response('ok'); } return realFetch(url, init); };

async function call(method, path, body, token, headers = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: ct.includes('json') ? await res.json() : ct.startsWith('image') ? 'IMG' : await res.text() };
}
const ANALAKELY = { lat: -18.9055, lng: 47.5255 }, BEHORIRIKA = { lat: -18.9020, lng: 47.5170 };
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
let admin, courier, courierId, vendorTok, recipient, key, ids = {};

test('mise en place : axe, livreur, planning, marchand API', async () => {
  const salt = 's';
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', salt, 1000), salt);
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  assert.equal((await call('POST', '/api/admin/axes', { name: 'Centre-ville', center_lat: ANALAKELY.lat, center_lng: ANALAKELY.lng, radius_km: 3 }, admin)).status, 200);
  assert.equal((await call('POST', '/api/admin/axes', { name: 'Ivandry', center_lat: -18.875, center_lng: 47.535, radius_km: 1.5, fee: 4000 }, admin)).status, 200);
  courierId = (await call('POST', '/api/admin/users', { role: 'courier', phone: '0341111111', name: 'Hery Vélo', cin: '101211123456', password: 'velo123' }, admin)).data.id;
  courier = (await call('POST', '/api/auth/login', { phone: '0341111111', password: 'velo123' })).data.token;
  // le livreur saisit lui-même son heure de départ et son axe
  const axes = (await call('GET', '/api/courier/schedule', null, courier)).data.axes;
  const min = new Date(Date.now() + 3 * 3600e3).getUTCHours() * 60 + new Date(Date.now() + 3 * 3600e3).getUTCMinutes();
  const start = (min + 30) % 1440, end = Math.min(1440, start + 120);
  assert.equal((await call('PUT', '/api/courier/schedule', { slots: [{ axe_id: axes.find((a) => a.name === 'Centre-ville').id, start_min: start, end_min: end }] }, courier)).status, 200);
  const m = await call('POST', '/api/admin/merchants', { name: 'Boutique Soa', phone: '0329999999', webhook_url: 'https://vente.test/hook' }, admin);
  assert.equal(m.status, 201); key = m.data.api_key; assert.match(key, /^ak_/); assert.ok(m.data.vendor_temp_password);
  vendorTok = (await call('POST', '/api/auth/login', { phone: '0329999999', password: m.data.vendor_temp_password })).data.token;
  recipient = (await call('POST', '/api/auth/register', { phone: '0331234567', name: 'Rasoa Mpandray', password: 'secret1' })).data.token;
});

test('tout client voit les heures et axes des livreurs', async () => {
  const s = (await call('GET', '/api/schedule', null, recipient)).data;
  assert.equal(s.departures.length >= 1, true); assert.equal(s.departures[0].axe, 'Centre-ville'); assert.equal(s.departures[0].courier, 'Hery'); assert.equal(s.default_fee, 3000);
});

test('API marchand : création, doublon, attribution automatique, webhooks', async () => {
  assert.equal((await call('GET', '/api/v1/shipments', null, null, { 'x-api-key': 'ak_' + 'f'.repeat(48) })).status, 401);
  const opt = await handleApi(new Request('https://alefa.test/api/v1/shipments', { method: 'OPTIONS' }), env);
  assert.equal(opt.status, 204); assert.equal(opt.headers.get('access-control-allow-origin'), '*');
  const body = (ext, extra = {}) => ({ external_ref: ext, description: 'Robe', declared_value: 20000,
    sender: { address: 'Boutique Soa, Analakely', lat: ANALAKELY.lat, lng: ANALAKELY.lng },
    recipient: { name: 'Rasoa', phone: '033 12 345 67', address: 'Behoririka', lat: BEHORIRIKA.lat, lng: BEHORIRIKA.lng }, ...extra });
  for (const ext of ['CMD-1', 'CMD-2', 'CMD-3']) {
    const r = await call('POST', '/api/v1/shipments', body(ext), null, { authorization: `Bearer ${key}` });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.shipment.status, 'assigned'); assert.equal(r.data.shipment.fee, 3000); assert.equal(r.data.shipment.axe, 'Centre-ville');
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    ids[ext] = r.data.shipment.id;
  }
  const dup = await call('POST', '/api/v1/shipments', body('CMD-1'), null, { 'x-api-key': key });
  assert.equal(dup.status, 200); assert.equal(dup.data.duplicate, true);
  const ivandry = await call('POST', '/api/v1/shipments', body('CMD-4', { recipient: { name: 'Faly', phone: '0345555555', address: 'Ivandry', lat: -18.875, lng: 47.535 } }), null, { 'x-api-key': key });
  assert.equal(ivandry.data.shipment.fee, 4000, 'tarif variable par axe'); assert.equal(ivandry.data.shipment.status, 'pending', 'aucun départ vers Ivandry');
  assert.ok(hooks.length >= 3); assert.match(hooks[0].init.headers['X-Alefa-Signature'], /^[a-f0-9]{64}$/);
  assert.equal((await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment.status, 'assigned');
});

test('le destinataire voit son colis, le livreur ses missions', async () => {
  const mine = (await call('GET', '/api/shipments', null, recipient)).data.shipments;
  assert.equal(mine.length, 3); assert.equal(mine[0].mine_as, 'recipient'); assert.equal(mine[0].amount_to_collect, 23000);
  assert.equal((await call('GET', '/api/shipments', null, courier)).data.shipments.length, 3);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loc = (lat, lng) => call('POST', '/api/courier/location', { lat, lng }, courier);
test('étapes : parti du centre → arrivé chez l\'expéditeur (GPS)', async () => {
  assert.equal((await loc(-18.91, 47.53)).data.ignored, 'offline', 'pas de suivi avant le départ');
  assert.equal((await call('POST', '/api/courier/depart', {}, courier)).data.shipments, 3);
  assert.equal((await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment.step, 'departed');
  await sleep(2600);
  const r = await loc(ANALAKELY.lat, ANALAKELY.lng);
  assert.equal(r.data.stages.length, 3);
  const mine = (await call('GET', '/api/shipments', null, recipient)).data.shipments;
  assert.equal(mine[0].step, 'at_pickup'); assert.ok(mine[0].courier_live.lat, 'le client voit le livreur en direct');
  const live = (await call('GET', '/api/admin/live', null, admin)).data;
  assert.ok(live.trails[courierId].length >= 1); assert.equal(live.parcels.length >= 3, true); assert.ok(live.feed.some((f) => /parti du centre/.test(f.text)));
});

test('récupération : photo et valeur obligatoires, frais modifiable', async () => {
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-1']}/pickup`, { value: 20000 }, courier)).status, 400, 'photo obligatoire');
  const r = await call('POST', `/api/shipments/${ids['CMD-1']}/pickup`, { value: 20000, photo: PHOTO }, courier);
  assert.equal(r.status, 200); assert.equal(r.data.amount_to_collect, 23000);
  assert.equal((await call('GET', `/api/shipments/${ids['CMD-1']}/photo`, null, vendorTok)).data, 'IMG');
  assert.equal((await call('GET', '/api/v1/shipments/CMD-1/photo', null, null, { 'x-api-key': key })).data, 'IMG');
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-2']}/pickup`, { value: 15000, fee: 2500, photo: PHOTO }, courier)).status, 200);
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-3']}/pickup`, { value: 10000, photo: PHOTO }, courier)).status, 200);
  assert.equal((await call('POST', '/api/v1/shipments/CMD-3/cancel', { reason: 'x' }, null, { 'x-api-key': key })).status, 409, 'annulation API impossible après récupération');
});

test('étapes : en route puis livreur tout proche', async () => {
  await sleep(2600);
  await loc(-18.904, 47.521);
  assert.equal((await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment.step, 'en_route');
  await sleep(2600);
  await loc(BEHORIRIKA.lat, BEHORIRIKA.lng);
  const sh = (await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment;
  assert.equal(sh.step, 'nearby'); assert.equal(sh.step_label, 'Livreur tout proche');
});

test('livraison, refus (destinataire paie les frais), annulation (expéditeur paie le retour)', async () => {
  // double confirmation : PIN faux refusé ; sans PIN → attente du destinataire ; le destinataire confirme → livré
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-1']}/deliver`, { pin: '0000' === (await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment.delivery_pin ? '1111' : '0000' }, courier)).status, 400);
  const d1 = await call('POST', `/api/shipments/${ids['CMD-1']}/deliver`, {}, courier);
  assert.equal(d1.data.collected, 23000); assert.equal(d1.data.delivered, false); assert.equal(d1.data.awaiting_recipient, true);
  assert.equal((await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment.step, 'awaiting_recipient');
  assert.equal((await call('GET', `/api/shipments/${ids['CMD-1']}`, null, courier)).data.shipment.delivery_pin, undefined, 'le livreur ne voit jamais le PIN');
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-1']}/confirm`, {}, vendorTok)).status, 403, 'seul le destinataire confirme');
  const conf = await call('POST', `/api/shipments/${ids['CMD-1']}/confirm`, {}, recipient);
  assert.equal(conf.data.delivered, true);
  const sh1 = (await call('GET', '/api/v1/shipments/CMD-1', null, null, { 'x-api-key': key })).data.shipment;
  assert.equal(sh1.status, 'delivered'); assert.equal(sh1.confirmed_by, 'app'); assert.ok(sh1.courier_confirmed_at && sh1.recipient_confirmed_at);
  const ref = await call('POST', `/api/shipments/${ids['CMD-2']}/refuse`, { note: 'Taille trop petite' }, courier);
  assert.equal(ref.data.collected, 2500);
  assert.equal((await call('POST', `/api/shipments/${ids['CMD-3']}/cancel`, { note: 'Destinataire injoignable' }, courier)).status, 200);
  const missions = (await call('GET', '/api/shipments', null, courier)).data.shipments;
  assert.equal(missions.filter((m) => m.to_return).length, 2);
  for (const ext of ['CMD-2', 'CMD-3']) assert.equal((await call('POST', `/api/shipments/${ids[ext]}/returned`, {}, courier)).status, 200);
  const last = hooks.at(-1); assert.equal(JSON.parse(last.init.body).shipment.returned, true);
});

test('caisse : remise du livreur puis paiement du vendeur', async () => {
  let cash = (await call('GET', '/api/admin/cash', null, admin)).data;
  assert.equal(cash.couriers[0].cash, 25500, '23 000 livré + 2 500 frais du refus');
  const v = cash.vendors.find((x) => x.phone === '+261329999999');
  assert.equal(v.sales, 0, 'rien à payer tant que le livreur n\'a pas remis l\'argent');
  assert.equal((await call('POST', `/api/admin/couriers/${courierId}/settle`, {}, admin)).data.total, 25500);
  cash = (await call('GET', '/api/admin/cash', null, admin)).data;
  assert.equal(cash.couriers.length, 0);
  const vendor = cash.vendors.find((x) => x.phone === '+261329999999');
  assert.equal(vendor.due, 20000 - 3000, 'valeur livrée (CMD-1) − frais de retour (CMD-3 annulé après récupération)');
  const pay = await call('POST', `/api/admin/vendors/${vendor.id}/pay`, {}, admin);
  assert.equal(pay.data.amount, 17000);
  assert.equal((await call('GET', '/api/shipments/balance', null, vendorTok)).data.due, 0);
  assert.equal((await call('POST', `/api/admin/vendors/${vendor.id}/pay`, {}, admin)).status, 409);
});

test('centre : attribution manuelle, frais, export', async () => {
  const pend = (await call('GET', '/api/admin/shipments?status=pending', null, admin)).data.shipments;
  assert.equal(pend.length, 1);
  assert.equal((await call('POST', `/api/shipments/${pend[0].id}/fee`, { fee: 5000 }, admin)).status, 200);
  assert.equal((await call('POST', `/api/shipments/${pend[0].id}/assign`, { courier_id: courierId }, admin)).data.shipment.status, 'assigned');
  assert.equal((await call('POST', `/api/shipments/${pend[0].id}/fee`, { fee: 4500 }, courier)).status, 200, 'le livreur peut modifier les frais');
  const ex = await call('GET', '/api/admin/shipments/export', null, admin);
  assert.match(ex.data, /CMD-1/);
  // client crée un colis depuis l'application
  const c = await call('POST', '/api/shipments', { pickup_addr: 'Chez moi, Analakely', pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng, recipient_name: 'Koto', recipient_phone: '0347777777', drop_addr: 'Behoririka', drop_lat: BEHORIRIKA.lat, drop_lng: BEHORIRIKA.lng, declared_value: 5000 }, recipient);
  assert.equal(c.status, 201); assert.equal(c.data.shipment.status, 'assigned');
  const sid = c.data.shipment.id;
  const pin = (await call('GET', `/api/shipments/${sid}`, null, recipient)).data.shipment.delivery_pin;
  assert.match(pin, /^\d{4}$/, 'l\'expéditeur voit le PIN à transmettre');
  assert.equal((await call('POST', `/api/shipments/${sid}/pickup`, { value: 5000, photo: PHOTO }, courier)).status, 200);
  const dp = await call('POST', `/api/shipments/${sid}/deliver`, { pin }, courier);
  assert.equal(dp.data.delivered, true, 'PIN du destinataire = double confirmation immédiate');
  assert.equal((await call('GET', `/api/shipments/${sid}`, null, admin)).data.shipment.confirmed_by, 'pin');
});

test('import Excel/CSV et lien : une ligne = un colis, sans doublon', async () => {
  const rows = [
    { external_ref: 'F-001', recipient_name: 'Naina', recipient_phone: '0341000001', drop_addr: 'Behoririka', drop_lat: BEHORIRIKA.lat, drop_lng: BEHORIRIKA.lng, declared_value: 12000, description: 'Chaussures' },
    { external_ref: 'F-002', recipient_name: 'Tiana', recipient_phone: '0341000002', drop_addr: 'Isotry', declared_value: 8000 },
    { external_ref: 'F-003', recipient_name: 'X', recipient_phone: '12', drop_addr: 'Nulle part' },
  ];
  const r = await call('POST', '/api/shipments/bulk', { rows, pickup_addr: 'Boutique Soa, Analakely', pickup_lat: ANALAKELY.lat, pickup_lng: ANALAKELY.lng }, vendorTok);
  assert.equal(r.data.created, 2); assert.equal(r.data.errors, 1); assert.match(r.data.results[0].pin, /^\d{4}$/);
  assert.equal(r.data.results[0].status, 'assigned'); assert.equal(r.data.results[1].status, 'pending', 'sans GPS → programmé par le centre');
  const again = await call('POST', '/api/shipments/bulk', { rows: rows.slice(0, 2), pickup_addr: 'Boutique Soa' }, vendorTok);
  assert.equal(again.data.duplicates, 2, 'réimport sans doublon');
  const link = await call('POST', '/api/shipments', { external_ref: 'F-001', recipient_name: 'Naina', recipient_phone: '0341000001', drop_addr: 'Behoririka', pickup_addr: 'Boutique' }, vendorTok);
  assert.equal(link.data.duplicate, true);
});
