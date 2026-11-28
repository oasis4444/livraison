// GPS permanent : l'application « Traccar Client » envoie la position du livreur, application Alefa fermée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
const db = env.DB.raw;
async function call(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const raw = (method, path, body, type) => handleApi(new Request('https://alefa.test' + path, { method, headers: type ? { 'content-type': type } : {}, body }), env);

test('GPS permanent : clé par livreur, positions Traccar (adresse, formulaire, JSON, hors réseau)', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  const admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  await call('POST', '/api/admin/users', { role: 'courier', phone: '0341000001', name: 'Hery Velo', cin: '101211100001', password: 'velo1234', vehicle: 'velo' }, admin);
  const hery = db.prepare("SELECT id FROM users WHERE name = 'Hery Velo'").get().id;
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(hery);
  const velo = (await call('POST', '/api/auth/login', { phone: '0341000001', password: 'velo1234' })).data.token;

  // Sans clé : refusé
  assert.equal((await raw('GET', '/api/gps?id=gk_000000000000000000000000&lat=-18.9&lon=47.5')).status, 404);
  // Le livreur obtient sa clé (créée au premier affichage), la même ensuite
  const k = (await call('POST', '/api/courier/gps-key', {}, velo)).data;
  assert.match(k.key, /^gk_[0-9a-f]{24}$/); assert.equal(k.path, '/api/gps'); assert.equal(k.last, null);
  assert.equal((await call('POST', '/api/courier/gps-key', {}, velo)).data.key, k.key);
  // La clé n'apparaît pas dans le profil
  const me = (await call('GET', '/api/me', null, velo)).data;
  assert.equal(me.courier.gps_key, undefined); assert.equal(me.courier.gps_on, true);

  const t = Math.floor(Date.now() / 1000);
  // 1) OsmAnd en adresse (GET)
  let r = await raw('GET', `/api/gps?id=${k.key}&lat=-18.9060&lon=47.5250&timestamp=${t - 120}&batt=80`);
  assert.equal(r.status, 200);
  // 2) formulaire (POST, sans JSON)
  r = await raw('POST', '/api/gps', `id=${k.key}&lat=-18.9000&lon=47.5280&timestamp=${t - 60}`, 'application/x-www-form-urlencoded');
  assert.equal(r.status, 200);
  // 3) JSON du nouveau Traccar Client, avec 2 points gardés hors réseau
  r = await raw('POST', '/api/gps', JSON.stringify({ device_id: k.key, location: [
    { timestamp: new Date((t - 30) * 1000).toISOString(), coords: { latitude: -18.8950, longitude: 47.5300 }, battery: { level: 0.7 } },
    { timestamp: new Date((t - 10) * 1000).toISOString(), coords: { latitude: -18.8900, longitude: 47.5310 } }] }), 'application/json');
  assert.equal(r.status, 200); assert.equal((await r.json()).saved, 2);
  const pos = db.prepare('SELECT lat, at FROM positions WHERE courier_id = ? ORDER BY at').all(hery);
  assert.deepEqual(pos.map((p) => p.lat), [-18.906, -18.9, -18.895, -18.89]);
  const c = db.prepare('SELECT lat, last_seen, gps_seen FROM couriers WHERE user_id = ?').get(hery);
  assert.equal(c.lat, -18.89); assert.ok(c.gps_seen > 0);
  // Un vieux point arrivé en retard ne remplace pas la position actuelle
  await raw('GET', `/api/gps?id=${k.key}&lat=-18.95&lon=47.50&timestamp=${t - 600}`);
  assert.equal(db.prepare('SELECT lat FROM couriers WHERE user_id = ?').get(hery).lat, -18.89);
  // Points invalides ignorés
  r = await raw('GET', `/api/gps?id=${k.key}&lat=0&lon=0`); assert.equal((await r.json()).saved, 0);

  // L'admin voit l'état, crée une nouvelle clé (l'ancienne ne marche plus), puis désactive
  const u = (await call('GET', '/api/admin/users?role=courier', null, admin)).data.users.find((x) => x.id === hery);
  assert.equal(u.gps_on, 1); assert.ok(u.gps_seen > 0);
  const k2 = (await call('POST', `/api/admin/couriers/${hery}/gps-key`, { renew: true }, admin)).data.key;
  assert.notEqual(k2, k.key);
  assert.equal((await raw('GET', `/api/gps?id=${k.key}&lat=-18.9&lon=47.5`)).status, 404);
  assert.equal((await raw('GET', `/api/gps?id=${k2}&lat=-18.9&lon=47.5`)).status, 200);
  assert.equal((await call('DELETE', `/api/admin/couriers/${hery}/gps-key`, null, admin)).status, 200);
  assert.equal((await raw('GET', `/api/gps?id=${k2}&lat=-18.9&lon=47.5`)).status, 404);
  // Livreur suspendu : refusé
  const k3 = (await call('POST', `/api/admin/couriers/${hery}/gps-key`, {}, admin)).data.key;
  db.prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(hery);
  assert.equal((await raw('GET', `/api/gps?id=${k3}&lat=-18.9&lon=47.5`)).status, 404);
});
