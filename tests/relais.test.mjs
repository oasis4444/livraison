// Relais par le centre (livreur de récupération ≠ livreur de livraison), suggestions de livreurs pour l'admin,
// preuve de livraison (photo + GPS), compteurs par livreur, « Suivre mon colis » par numéro + téléphone, contenu et taille.
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
const PHOTO = 'data:image/jpeg;base64,' + Buffer.from('photo-remise').toString('base64');
// Ambohimanarina (récupération, axe de Hery) → centre (Analakely) → Ivandry (livraison, axe de Tiana)
const AMBOHIMANARINA = { lat: -18.8770, lng: 47.4930 }, IVANDRY = { lat: -18.8750, lng: 47.5330 }, CENTRE = { lat: -18.9055, lng: 47.5255 };
let admin, hery, tiana, heryId, tianaId, key, s1;
const db = env.DB.raw;

test('mise en place : centre, deux livreurs sur deux axes différents', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  heryId = (await call('POST', '/api/admin/users', { role: 'courier', phone: '0341111111', name: 'Hery Vélo', cin: '101211123456', password: 'velo123' }, admin)).data.id;
  tianaId = (await call('POST', '/api/admin/users', { role: 'courier', phone: '0342222222', name: 'Tiana Vélo', cin: '101211123457', password: 'velo123' }, admin)).data.id;
  hery = (await call('POST', '/api/auth/login', { phone: '0341111111', password: 'velo123' })).data.token;
  tiana = (await call('POST', '/api/auth/login', { phone: '0342222222', password: 'velo123' })).data.token;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'centre_lat'").run(String(CENTRE.lat));
  db.prepare("UPDATE settings SET value = ? WHERE key = 'centre_lng'").run(String(CENTRE.lng));
  const axe = (name, p) => { db.prepare("INSERT INTO axes (name, center_lat, center_lng, radius_km, color, active) VALUES (?,?,?,1.5,'#0f7a55',1)").run(name, p.lat, p.lng); return db.prepare('SELECT id FROM axes WHERE name = ?').get(name).id; };
  db.prepare("INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,1430,1439,'1234567')").run(heryId, axe('OUEST', AMBOHIMANARINA));
  db.prepare("INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,1430,1439,'1234567')").run(tianaId, axe('NORD', IVANDRY));
  key = (await call('POST', '/api/admin/merchants', { name: 'Boutique Test', phone: '0329999999' }, admin)).data.api_key;
});

test('aucun livreur ne couvre les deux : relais automatique par le centre', async () => {
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'R-1', declared_value: 20000, contents: 'Robe', size: { l: 30, w: 25, h: 8 }, weight: 0.6,
    sender: { name: 'Boutique', address: 'Ambohimanarina', ...AMBOHIMANARINA }, recipient: { name: 'Lova Ivandry', phone: '0331234567', address: 'Ivandry', ...IVANDRY } }, null, { 'x-api-key': key });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  s1 = r.data.shipment;
  assert.equal(s1.relay, true); assert.equal(s1.leg, 'pickup');
  assert.equal(s1.pickup_courier.id, heryId); assert.equal(s1.delivery_courier.id, tianaId); assert.equal(s1.courier.id, heryId);
  assert.deepEqual(s1.size, { l: 30, w: 25, h: 8 }); assert.equal(s1.weight_kg, 0.6); assert.equal(s1.contents, 'Robe');
  // Tiana voit déjà le colis qui l'attendra au centre
  assert.ok((await call('GET', '/api/shipments', null, tiana)).data.shipments.some((x) => x.ref === s1.ref));
});

test('suggestions pour l\'admin : le bon livreur en tête pour chaque partie', async () => {
  db.prepare('UPDATE couriers SET lat = ?, lng = ?, last_seen = ? WHERE user_id = ?').run(-18.88, 47.50, Date.now(), heryId);
  const g = (await call('GET', `/api/admin/shipments/${s1.id}/suggest`, null, admin)).data;
  assert.equal(g.pickup[0].id, heryId); assert.equal(g.pickup[0].axe, 'OUEST'); assert.equal(g.pickup[0].online, true); assert.ok(g.pickup[0].dist_km < 2);
  assert.equal(g.delivery[0].id, tianaId); assert.equal(g.delivery[0].axe, 'NORD');
  assert.deepEqual(g.current, { pickup: heryId, delivery: tianaId });
  assert.deepEqual(g.centre, [CENTRE.lat, CENTRE.lng]);
});

test('parcours en relais : récupéré → déposé au centre → repris → livré avec preuve', async () => {
  const P = (p, b, t) => call('POST', `/api/shipments/${s1.id}/${p}`, b, t);
  assert.equal((await P('pickup', { value: 20000, photo: PHOTO }, hery)).status, 200);
  let t = (await call('GET', `/api/track/${s1.track_token}`)).data;
  assert.equal(t.step, 'to_centre'); assert.equal(t.can_confirm, false, 'le client ne peut pas encore confirmer'); assert.equal(t.relay, true); assert.equal(t.size, '30×25×8 cm');
  assert.equal((await P('deliver', { photo: PHOTO }, hery)).status, 409, 'doit passer par le centre');
  assert.equal((await call('POST', `/api/track/${s1.track_token}/confirm`, {})).status, 409);
  assert.equal((await P('take-centre', {}, tiana)).status, 409, 'pas encore au centre');
  assert.equal((await P('drop-centre', {}, hery)).status, 400, 'photo obligatoire au dépôt au centre');
  const d = await P('drop-centre', { photo: PHOTO }, hery);
  assert.equal(d.status, 200); assert.equal(d.data.shipment.step, 'at_centre'); assert.equal(d.data.shipment.courier.id, tianaId);
  assert.ok((await call('GET', `/api/shipments/${s1.id}`, null, admin)).data.shipment.proofs.centre_in, 'preuve photo au centre');
  assert.ok(db.prepare("SELECT title FROM notifications WHERE user_id = ? ORDER BY id DESC").get(tianaId).title.includes('centre'));
  assert.equal((await P('take-centre', {}, hery)).status, 403, 'Hery n\'est pas le livreur de livraison');
  const tk = await P('take-centre', {}, tiana);
  assert.equal(tk.status, 200); assert.equal(tk.data.shipment.step, 'en_route');
  // le client confirme, Tiana livre : photo obligatoire, position loin de l'adresse → alerte
  assert.equal((await call('POST', `/api/track/${s1.track_token}/confirm`, {})).status, 200);
  assert.equal((await P('deliver', {}, tiana)).status, 400, 'photo obligatoire');
  const done = await P('deliver', { photo: PHOTO, lat: CENTRE.lat, lng: CENTRE.lng }, tiana);
  assert.equal(done.data.delivered, true);
  const s = (await call('GET', `/api/shipments/${s1.id}`, null, admin)).data.shipment;
  assert.equal(s.status, 'delivered'); assert.equal(s.delivery_proof.photo, true); assert.ok(s.delivery_proof.dist_m > 3000);
  assert.ok(s.events.some((e) => e.status === 'at_centre') && s.events.some((e) => e.status === 'centre_out'));
  assert.ok(db.prepare("SELECT body FROM complaints ORDER BY id DESC").all().some((a) => /m de l'adresse/.test(a.body)), 'alerte : remis loin de l\'adresse');
  const ph = await handleApi(new Request(`https://alefa.test/api/shipments/${s1.id}/delivery-photo`, { headers: { authorization: `Bearer ${admin}` } }), env);
  assert.equal(ph.status, 200);
});

test('admin : changer le livreur de récupération et de livraison (même livreur = sans relais)', async () => {
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'R-2', declared_value: 5000, sender: { name: 'Boutique', address: 'Ambohimanarina', ...AMBOHIMANARINA },
    recipient: { name: 'Fara', phone: '0337654321', address: 'Ivandry', ...IVANDRY } }, null, { 'x-api-key': key });
  const id = r.data.shipment.id;
  let p = await call('POST', `/api/admin/shipments/${id}/plan`, { pickup_courier_id: tianaId, delivery_courier_id: tianaId }, admin);
  assert.equal(p.status, 200); assert.equal(p.data.shipment.relay, false); assert.equal(p.data.shipment.courier.id, tianaId);
  p = await call('POST', `/api/admin/shipments/${id}/plan`, { pickup_courier_id: heryId, delivery_courier_id: tianaId }, admin);
  assert.equal(p.data.shipment.relay, true); assert.equal(p.data.shipment.pickup_courier.id, heryId); assert.equal(p.data.shipment.delivery_courier.id, tianaId);
  // le centre enregistre le dépôt lui-même, puis change le livreur de livraison
  db.prepare("UPDATE shipments SET status = 'picked_up', picked_at = ? WHERE id = ?").run(Date.now(), id);
  assert.equal((await call('POST', `/api/shipments/${id}/drop-centre`, {}, admin)).status, 200);
  p = await call('POST', `/api/admin/shipments/${id}/plan`, { delivery_courier_id: heryId }, admin);
  assert.equal(p.data.shipment.courier.id, heryId); assert.equal(p.data.shipment.step, 'at_centre');
  // le centre remet le colis à Hery : compté comme « repris au centre » pour Hery, pas pour l'admin
  assert.equal((await call('POST', `/api/shipments/${id}/take-centre`, {}, admin)).status, 200);
  assert.equal(db.prepare("SELECT user_id FROM shipment_events WHERE shipment_id = ? AND status = 'centre_out'").get(id).user_id, heryId);
});

test('compteurs par livreur : récupérés, déposés/repris au centre, livrés', async () => {
  const st = (await call('GET', '/api/admin/courier-stats?days=1', null, admin)).data.couriers;
  const h = st.find((c) => c.id === heryId), t = st.find((c) => c.id === tianaId);
  assert.equal(h.picked, 1); assert.equal(h.to_centre, 2, 'dont 1 enregistré par le centre'); assert.equal(h.from_centre, 1); assert.equal(h.delivered, 0); assert.equal(h.open, 1);
  assert.equal(t.from_centre, 1); assert.equal(t.delivered, 1); assert.equal(t.collected, 23000);
  const mine = (await call('GET', '/api/courier/stats', null, tiana)).data;
  assert.equal(mine.today.delivered, 1); assert.equal(mine.week.delivered, 1);
});

test('taille et poids écrits à la main (« 30x20x10 », « 0,5 ») acceptés à l\'import', async () => {
  const r = await call('POST', '/api/v1/shipments', { external_ref: 'R-3', declared_value: 1000, size: '30 x 20 x 10', weight: '0,5', sender: { name: 'Boutique', address: 'Ambohimanarina', ...AMBOHIMANARINA }, recipient: { name: 'Zoly', phone: '0331112233', address: 'Ivandry', ...IVANDRY } }, null, { 'x-api-key': key });
  assert.deepEqual(r.data.shipment.size, { l: 30, w: 20, h: 10 }); assert.equal(r.data.shipment.weight_kg, 0.5);
});

test('« Suivre mon colis » par numéro + téléphone', async () => {
  const ok = await call('GET', `/api/track-find?ref=${s1.ref.toLowerCase()}&phone=033 12 345 67`);
  assert.equal(ok.status, 200); assert.equal(ok.data.token, s1.track_token);
  assert.equal((await call('GET', '/api/track-find?ref=R-1&phone=0331234567')).data.token, s1.track_token, 'numéro de la commande du logiciel de vente');
  assert.equal((await call('GET', `/api/track-find?ref=${s1.ref}&phone=0349999999`)).status, 404, 'mauvais téléphone');
});
