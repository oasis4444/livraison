// Répartition par l'admin, « Je pars du centre » + offres au premier qui confirme, marchandise déjà payée, envoi en province.
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
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const db = env.DB.raw;
db.prepare("UPDATE settings SET value = '0' WHERE key = 'direct_km'").run(); // tarif normal dans ces tests
db.prepare("UPDATE settings SET value = '0' WHERE key = 'zones_enabled'").run(); // frais fixes (zones testées à part)
db.prepare("UPDATE settings SET value = CASE key WHEN 'xl_enabled' THEN '1' ELSE '0' END WHERE key IN ('scan_required', 'xl_enabled')").run(); // devis XL activé (ancien fonctionnement testé ici) ; code colis non exigé dans ces tests (testé à part)
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
// Centre à Analakely ; tournées vers le nord (Behoririka → Ankorondrano). Récupération à Behoririka, livraison à Ankorondrano.
const CENTRE = { lat: -18.9055, lng: 47.5255 }, BEHORIRIKA = { lat: -18.8990, lng: 47.5240 }, ANKORONDRANO = { lat: -18.8840, lng: 47.5240 };
const NORTH = [[CENTRE.lat, CENTRE.lng], [BEHORIRIKA.lat, BEHORIRIKA.lng], [ANKORONDRANO.lat, ANKORONDRANO.lng]];
let admin, key, sender, c1, c2, c3, id1, id2, id3;
const notes = (uid) => db.prepare('SELECT title, body FROM notifications WHERE user_id = ? ORDER BY id').all(uid);
const uid = (phone) => db.prepare('SELECT id FROM users WHERE phone = ?').get(phone).id;

test('mise en place : admin, 3 livreurs, une boutique', async () => {
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'dispatch_mode'").get().value, 'admin', 'par défaut, l\'admin répartit');
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  assert.equal((await call('PUT', '/api/admin/settings', { settings: { centre_addr: 'Analakely', centre_lat: CENTRE.lat, centre_lng: CENTRE.lng } }, admin)).status, 200);
  const mk = async (phone, name, cin) => {
    assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone, name, cin, password: 'velo1234' }, admin)).status, 201);
    return (await call('POST', '/api/auth/login', { phone, password: 'velo1234' })).data.token;
  };
  c1 = await mk('0341000001', 'Hery Rakoto', '101211100001');
  c2 = await mk('0341000002', 'Naina Rabe', '101211100002');
  c3 = await mk('0341000003', 'Tojo Sud', '101211100003');
  key = (await call('POST', '/api/admin/merchants', { name: 'Boutique Lova', phone: '0329000000' }, admin)).data.api_key;
  sender = uid('+261329000000');
});

test('nouveau colis : il reste chez l\'admin (pas d\'attribution automatique) et l\'admin est prévenu', async () => {
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'T-1', declared_value: 20000, description: 'Robe',
    sender: { name: 'Lova', address: 'Behoririka', ...BEHORIRIKA }, recipient: { name: 'Voahangy', phone: '0331112233', address: 'Ankorondrano', ...ANKORONDRANO } }, null, { 'x-api-key': key });
  assert.equal(r.status, 201);
  assert.equal(r.data.shipment.status, 'pending'); assert.equal(r.data.shipment.courier, null);
  id1 = r.data.shipment.id;
  assert.ok(notes(uid('+261340000000')).some((n) => n.title === '📦 Nouveau colis à répartir' && /aucun livreur en tournée/.test(n.body)));
});

test('« Je pars du centre » : destination obligatoire si rien à emporter ; les colis en attente sur le chemin sont proposés', async () => {
  let r = await call('POST', '/api/courier/depart', {}, c1);
  assert.equal(r.status, 400); assert.match(r.data.message, /Indiquez où vous allez/);
  r = await call('POST', '/api/courier/depart', { to: { address: 'Ankorondrano', ...ANKORONDRANO }, route: NORTH, lat: CENTRE.lat, lng: CENTRE.lng }, c1);
  assert.equal(r.status, 200); assert.equal(r.data.offers, 1); assert.equal(r.data.run.to, 'Ankorondrano');
  const mine = (await call('GET', '/api/courier/run', null, c1)).data;
  assert.equal(mine.run.to, 'Ankorondrano'); assert.equal(mine.offers.length, 1);
  assert.equal(mine.offers[0].status, 'open'); assert.equal(mine.offers[0].amount_to_collect, 20000 + 3000);
  assert.ok(notes(uid('+261341000001')).some((n) => n.title === '📦 Colis sur ton chemin'));
  // un livreur qui part vers le sud ne reçoit rien
  r = await call('POST', '/api/courier/depart', { to: { address: 'Anosy', lat: -18.9150, lng: 47.5200 }, lat: CENTRE.lat, lng: CENTRE.lng }, c3);
  assert.equal(r.data.offers, 0);
});

test('nouveau colis sur le chemin de deux livreurs : le premier qui confirme le prend, l\'autre voit « déjà pris »', async () => {
  await call('POST', '/api/courier/depart', { to: { address: 'Ankorondrano', ...ANKORONDRANO }, route: NORTH }, c2);
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'T-2', declared_value: 15000, value_paid: true, value_paid_ref: 'MVola 123456',
    sender: { name: 'Lova', address: 'Behoririka', ...BEHORIRIKA }, recipient: { name: 'Fara', phone: '0331112244', address: 'Ankorondrano', ...ANKORONDRANO } }, null, { 'x-api-key': key });
  id2 = r.data.shipment.id;
  assert.equal(r.data.shipment.status, 'pending');
  assert.equal(r.data.shipment.payment.value_paid, true);
  assert.equal(r.data.shipment.amount_to_collect, 0, 'marchandise déjà payée : rien à encaisser à la livraison');
  assert.equal(r.data.shipment.payment.fee_at_pickup, 3000, 'les frais sont payés à la récupération');
  const adminNote = notes(uid('+261340000000')).filter((n) => n.title === '📦 Nouveau colis à répartir').pop();
  assert.match(adminNote.body, /proposé à (Hery, Naina|Naina, Hery)/);
  assert.ok(!notes(uid('+261341000003')).some((n) => n.body.includes(r.data.shipment.ref)), 'pas proposé au livreur du sud');
  // l'admin voit les livreurs en tournée qui passent par là, avec leur téléphone
  const sug = (await call('GET', `/api/admin/shipments/${id2}/suggest`, null, admin)).data;
  const top = sug.pickup.slice(0, 2).map((c) => c.name).sort();
  assert.deepEqual(top, ['Hery Rakoto', 'Naina Rabe']);
  assert.equal(sug.pickup[0].run.passes, true); assert.equal(sug.pickup[0].offer, 'open'); assert.ok(sug.pickup[0].phone);
  // Naina confirme en premier
  let t = await call('POST', `/api/courier/offers/${id2}/take`, {}, c2);
  assert.equal(t.status, 200); assert.equal(t.data.shipment.courier.name, 'Naina Rabe'); assert.equal(t.data.shipment.step, 'departed');
  t = await call('POST', `/api/courier/offers/${id2}/take`, {}, c1);
  assert.equal(t.status, 409); assert.match(t.data.message, /Déjà pris par Naina/);
  const o = (await call('GET', '/api/courier/run', null, c1)).data.offers.find((x) => x.id === id2);
  assert.equal(o.status, 'lost'); assert.equal(o.taken_by, 'Naina');
  assert.ok(notes(uid('+261341000001')).some((n) => n.title.includes('déjà pris')));
  assert.equal((await call('POST', `/api/courier/offers/${id2}/take`, {}, c3)).status, 404, 'jamais proposé à ce livreur');
});

test('notifications cliquables : chacune indique le colis à ouvrir', async () => {
  const n = (await call('GET', '/api/notifications?after=0', null, admin)).data.notifications;
  const pris = n.find((x) => x.title.includes('pris par Naina'));
  assert.deepEqual(pris.target, { type: 'shipment', id: id2 });
  const c = (await call('GET', '/api/notifications?after=0', null, c1)).data.notifications.find((x) => x.title === '📦 Colis sur ton chemin');
  assert.equal(c.target.type, 'shipment');
});

test('l\'admin répartit lui-même : l\'offre se ferme pour les autres', async () => {
  const r = await call('POST', `/api/shipments/${id1}/assign`, { courier_id: uid('+261341000003') }, admin);
  assert.equal(r.status, 200);
  const o = (await call('GET', '/api/courier/run', null, c1)).data.offers.find((x) => x.id === id1);
  assert.equal(o.status, 'lost'); assert.equal(o.taken_by, 'Tojo');
  assert.equal((await call('POST', `/api/courier/offers/${id1}/take`, {}, c1)).status, 409);
});

test('marchandise déjà payée : frais encaissés à la récupération, rien à la livraison', async () => {
  const p = await call('POST', `/api/shipments/${id2}/pickup`, { value: 15000, photo: PHOTO }, c2);
  assert.equal(p.status, 200); assert.equal(p.data.pickup_fee, 3000); assert.equal(p.data.amount_to_collect, 0);
  const tok = db.prepare('SELECT track_token FROM shipments WHERE id = ?').get(id2).track_token;
  const tr = (await call('GET', `/api/track/${tok}`)).data;
  assert.equal(tr.amount_to_pay, 0); assert.equal(tr.value_paid, true);
  await call('POST', `/api/track/${tok}/confirm`, {});
  const d = await call('POST', `/api/shipments/${id2}/deliver`, { photo: PHOTO }, c2);
  assert.equal(d.status, 200); assert.equal(d.data.collected, 0); assert.equal(d.data.delivered, true);
  const s = (await call('GET', `/api/shipments/${id2}`, null, admin)).data.shipment;
  assert.deepEqual(s.shares, { centre: 1000, courier: 2000, paid: false });
  assert.equal(s.payment.pickup_fee, 3000);
});

test('province : ville et coopérative obligatoires ; remise avec véhicule, frais de transport PA / payé', async () => {
  const base = { declared_value: 0, description: 'Sac de riz', sender: { name: 'Lova', address: 'Behoririka', ...BEHORIRIKA },
    recipient: { name: 'Rivo', phone: '0341239999', address: 'Gare Kofmad, Ankorondrano', ...ANKORONDRANO } };
  let r = await call('POST', '/api/v1/shipments', { ...base, external_ref: 'P-0', province: true, coop_name: 'Kofmad' }, null, { 'x-api-key': key });
  assert.equal(r.status, 400); assert.match(r.data.message, /Ville de destination/);
  r = await call('POST', '/api/v1/shipments', { ...base, external_ref: 'P-1', province: true, dest_city: 'Fianarantsoa', coop_name: 'Kofmad' }, null, { 'x-api-key': key });
  assert.equal(r.status, 201); id3 = r.data.shipment.id;
  assert.deepEqual(r.data.shipment.province, { city: 'Fianarantsoa', coop: 'Kofmad', plate: null, driver_phone: null, fee: null, fee_status: null });
  assert.equal(r.data.shipment.amount_to_collect, 0);
  assert.equal((await call('POST', `/api/shipments/${id3}/assign`, { courier_id: uid('+261341000001') }, admin)).status, 200);
  assert.equal((await call('POST', `/api/shipments/${id3}/pickup`, { value: 0, photo: PHOTO }, c1)).status, 200);
  // remise : véhicule et frais obligatoires, PIN inutile
  let d = await call('POST', `/api/shipments/${id3}/deliver`, { photo: PHOTO, coop_fee: 15000, coop_fee_status: 'pa' }, c1);
  assert.equal(d.status, 400); assert.match(d.data.message, /Véhicule/);
  d = await call('POST', `/api/shipments/${id3}/deliver`, { photo: PHOTO, coop_plate: '1234 TBA', coop_fee: 15000, coop_fee_status: 'peut-être' }, c1);
  assert.equal(d.status, 400); assert.match(d.data.message, /PA/);
  d = await call('POST', `/api/shipments/${id3}/deliver`, { photo: PHOTO, coop_plate: '1234 TBA', coop_driver_phone: '0345556677', coop_fee: 15000, coop_fee_status: 'pa', lat: ANKORONDRANO.lat, lng: ANKORONDRANO.lng }, c1);
  assert.equal(d.status, 200); assert.equal(d.data.delivered, true); assert.equal(d.data.collected, 0);
  const s = (await call('GET', `/api/shipments/${id3}`, null, admin)).data.shipment;
  assert.deepEqual(s.province, { city: 'Fianarantsoa', coop: 'Kofmad', plate: '1234 TBA', driver_phone: '+261345556677', fee: 15000, fee_status: 'pa' });
  assert.equal(s.status, 'delivered'); assert.ok(s.delivery_proof.photo);
  const tr = (await call('GET', `/api/track/${db.prepare('SELECT track_token FROM shipments WHERE id = ?').get(id3).track_token}`)).data;
  assert.equal(tr.province.plate, '1234 TBA'); assert.equal(tr.province.fee_status, 'pa');
});

test('caisse : marchandise payée par Mobile Money et frais Alefa de la province retenus sur le paiement de la boutique', async () => {
  const dues = (await call('GET', '/api/admin/cash', null, admin)).data.couriers;
  // Naina : 3 000 de frais encaissés à la récupération − sa part 2 000 = 1 000 à remettre ;
  // Hery : province, rien encaissé, sa part 2 000 → le centre lui doit 2 000.
  assert.equal(dues.find((x) => x.name === 'Naina Rabe').cash, 1000);
  assert.equal(dues.find((x) => x.name === 'Hery Rakoto').cash, -2000);
  for (const c of [c1, c2]) {
    const me = (await call('GET', '/api/me', null, c)).data.user.id;
    assert.equal((await call('POST', `/api/admin/couriers/${me}/settle`, {}, admin)).status, 200);
  }
  assert.equal((await call('GET', '/api/admin/cash', null, admin)).data.couriers.length, 0);
  assert.equal((await call('GET', `/api/shipments/${id2}`, null, admin)).data.shipment.shares.paid, true);
  const v = (await call('GET', '/api/admin/cash', null, admin)).data.vendors.find((x) => x.id === sender);
  assert.equal(v.sales, 0, 'T-2 déjà payée à la boutique par Mobile Money');
  assert.equal(v.province_fees, 3000); assert.equal(v.due, -3000);
  assert.equal((await call('POST', `/api/admin/vendors/${sender}/pay`, { method: 'paypal' }, admin)).status, 400, 'moyen inconnu');
  assert.equal((await call('POST', `/api/admin/vendors/${sender}/pay`, { method: 'mvola', phone: '12' }, admin)).status, 400, 'numéro MVola invalide');
  const p = await call('POST', `/api/admin/vendors/${sender}/pay`, { method: 'mvola', phone: '0341234567', holder: 'Boutique', reference: 'MV-778899' }, admin);
  assert.equal(p.data.amount, -3000); assert.equal(p.data.method, 'mvola');
  const last = (await call('GET', '/api/admin/cash', null, admin)).data.payouts[0];
  assert.match(last.note, /MVola 034 12 345 67 · réf\. MV-778899/); assert.equal(last.detail.reference, 'MV-778899');
});

test('rapport livreurs : par jour et par livreur, argent encaissé, parts et reste à remettre', async () => {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const r = (await call('GET', `/api/admin/courier-stats/report?from=${today}&to=${today}`, null, admin)).data;
  const naina = r.rows.find((x) => x.name === 'Naina Rabe'), hery = r.rows.find((x) => x.name === 'Hery Rakoto');
  assert.ok(naina && hery, 'une ligne par livreur actif aujourd\'hui');
  assert.equal(naina.day, today);
  assert.equal(naina.pickup_fees, 3000, 'frais pris à la récupération');
  assert.equal(naina.due, naina.collected + naina.pickup_fees - naina.courier_share);
  assert.equal(naina.remaining, 0, 'déjà encaissé à la caisse'); assert.equal(naina.remitted, naina.due);
  assert.equal(hery.due, -2000, 'le centre doit sa part à Hery');
  assert.equal(r.totals.delivered, r.rows.reduce((a, x) => a + x.delivered, 0));
  assert.ok(r.couriers.length >= 3);
  // filtre par livreur
  const one = (await call('GET', `/api/admin/courier-stats/report?from=${today}&to=${today}&courier=${naina.courier_id}`, null, admin)).data;
  assert.deepEqual(one.rows.map((x) => x.name), ['Naina Rabe']); assert.equal(one.courier, naina.courier_id);
  // export Excel
  const res = await handleApi(new Request(`https://alefa.test/api/admin/courier-stats/report?from=${today}&to=${today}&format=csv`, { headers: { authorization: `Bearer ${admin}` } }), env);
  const text = await res.text();
  assert.match(text, /Reste à remettre/); assert.match(text, /Naina Rabe/); assert.match(text, /^\uFEFF?Jour;/);
  // dates invalides
  assert.equal((await call('GET', '/api/admin/courier-stats/report?from=hier', null, admin)).status, 400);
  assert.equal((await call('GET', `/api/admin/courier-stats/report?from=${today}&to=2020-01-01`, null, admin)).status, 400);
  // un livreur n'y a pas accès
  assert.equal((await call('GET', `/api/admin/courier-stats/report`, null, c1)).status, 403);
});

test('tableau de bord du livreur : mêmes chiffres que le rapport de l\'administration', async () => {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const rep = (await call('GET', `/api/admin/courier-stats/report?from=${today}&to=${today}`, null, admin)).data.rows;
  const naina = rep.find((x) => x.name === 'Naina Rabe');
  const r = await call('GET', '/api/courier/dashboard', null, c2);
  assert.equal(r.status, 200);
  const d = r.data;
  assert.equal(d.today.delivered, naina.delivered); assert.equal(d.today.picked, naina.picked);
  assert.equal(d.today.earned, naina.courier_share); assert.equal(d.earnings.today, naina.courier_share);
  assert.equal(d.cash.to_remit, 0, 'tout a été encaissé à la caisse');
  assert.ok(d.remitted.month >= naina.due && d.remitted.last.length >= 1, 'la remise du jour apparaît');
  assert.equal(d.last7.length, 7); assert.equal(d.last7[6].day, today); assert.equal(d.last7[6].earned, naina.courier_share);
  for (const k of ['to_pickup', 'to_deliver', 'to_collect', 'in_progress']) assert.equal(typeof d.now[k], 'number');
  // Hery : le centre lui doit sa part (montant négatif)
  assert.equal((await call('GET', '/api/courier/dashboard', null, c1)).data.cash.to_remit, rep.find((x) => x.name === 'Hery Rakoto').remaining);
  assert.equal((await call('GET', '/api/courier/dashboard', null, admin)).status, 403);
});

test('fin de tournée : plus d\'offres', async () => {
  assert.equal((await call('POST', '/api/courier/run/end', {}, c1)).data.ended, 1);
  assert.equal((await call('GET', '/api/courier/run', null, c1)).data.run, null);
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'T-9', declared_value: 1000,
    sender: { name: 'Lova', address: 'Behoririka', ...BEHORIRIKA }, recipient: { name: 'Zo', phone: '0331112299', address: 'Ankorondrano', ...ANKORONDRANO } }, null, { 'x-api-key': key });
  assert.ok(!notes(uid('+261341000001')).some((n) => n.body.includes(r.data.shipment.ref)));
});
