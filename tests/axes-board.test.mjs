// Planning simple des livreurs : un axe le matin, un axe l'après-midi, des jours ; les créneaux détaillés restent.
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

test('Planning des livreurs : matin / après-midi en un clic, enregistré tout de suite', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  const admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone: '0341000001', name: 'Hery Velo', cin: '101211100001', password: 'velo1234', vehicle: 'velo' }, admin)).status, 201);
  const hery = db.prepare("SELECT id FROM users WHERE name = 'Hery Velo'").get().id;
  db.prepare("UPDATE settings SET value = '-18.9100' WHERE key = 'centre_lat'").run();
  db.prepare("UPDATE settings SET value = '47.5300' WHERE key = 'centre_lng'").run();
  const mk = async (name, lat, lng) => (await call('POST', '/api/admin/axes', { name, color: '#1a6fa3', center_lat: lat, center_lng: lng, radius_km: 2, active: true }, admin)).data;
  await mk('Analakely', -18.905, 47.525); await mk('Ivandry', -18.875, 47.533);
  const axes = Object.fromEntries((await call('GET', '/api/admin/axes', null, admin)).data.axes.map((a) => [a.name, a.id]));

  // Un créneau détaillé existant (soirée) doit rester
  db.prepare('INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,1080,1200,?)').run(hery, axes.Ivandry, '12345');

  let b = (await call('GET', '/api/admin/axes/board', null, admin)).data;
  assert.deepEqual(b.windows, { am: [480, 720], pm: [780, 1020] });
  let c = b.couriers.find((x) => x.id === hery);
  assert.deepEqual([c.am, c.pm, c.days, c.other], [null, null, '123456', 1]);

  // Matin Analakely, après-midi Ivandry, du lundi au vendredi
  assert.equal((await call('PUT', `/api/admin/couriers/${hery}/axes/quick`, { am: axes.Analakely, pm: axes.Ivandry, days: '12345' }, admin)).status, 200);
  c = (await call('GET', '/api/admin/axes/board', null, admin)).data.couriers.find((x) => x.id === hery);
  assert.deepEqual([c.am, c.pm, c.days, c.other], [axes.Analakely, axes.Ivandry, '12345', 1]);
  // Trajet par défaut : du centre vers le cœur de l'axe
  const am = db.prepare('SELECT * FROM courier_axes WHERE courier_id = ? AND start_min = 480').get(hery);
  assert.equal(am.from_addr, 'Centre Alefa'); assert.equal(am.to_addr, 'Analakely'); assert.ok(am.km > 0.5 && am.km < 2);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'axe'").get(hery).n >= 1, 'livreur prévenu');

  // Changer seulement l'après-midi : le matin et la soirée restent
  await call('PUT', `/api/admin/couriers/${hery}/axes/quick`, { am: axes.Analakely, pm: null, days: '12345' }, admin);
  const rows = db.prepare('SELECT start_min, axe_id FROM courier_axes WHERE courier_id = ? ORDER BY start_min').all(hery);
  assert.deepEqual(rows.map((r) => [r.start_min, r.axe_id]), [[480, axes.Analakely], [1080, axes.Ivandry]]);

  // Refus : aucun jour, axe inconnu, pas administrateur
  assert.equal((await call('PUT', `/api/admin/couriers/${hery}/axes/quick`, { am: axes.Analakely, days: '' }, admin)).status, 400);
  assert.equal((await call('PUT', `/api/admin/couriers/${hery}/axes/quick`, { am: 9999 }, admin)).status, 404);
  const velo = (await call('POST', '/api/auth/login', { phone: '0341000001', password: 'velo1234' })).data.token;
  assert.equal((await call('PUT', `/api/admin/couriers/${hery}/axes/quick`, { am: axes.Analakely }, velo)).status, 403);
});
