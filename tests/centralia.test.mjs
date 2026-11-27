// Données envoyées au Central IA (bouton 🤖 de l'administration) : contenu, heure de Madagascar, rien de sensible, accès réservé.
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
const login = async (phone, password) => (await call('POST', '/api/auth/login', { phone, password })).data.token;

test('Central IA : jeux de données pour l\'assistant, sans téléphone ni PIN, réservés à l\'administrateur complet', async () => {
  db.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('admin123', 's', 1000), 's');
  const admin = await login('0340000000', 'admin123');
  assert.equal((await call('POST', '/api/admin/users', { role: 'admin', staff: 'caisse', name: 'Fara Caisse', phone: '0340000001', password: 'caisse1' }, admin)).status, 201);
  assert.equal((await call('POST', '/api/admin/users', { role: 'courier', phone: '0341000001', name: 'Hery Velo', cin: '101211100001', password: 'velo1234', vehicle: 'velo' }, admin)).status, 201);
  const caisse = await login('0340000001', 'caisse1');
  const ids = Object.fromEntries(db.prepare('SELECT name, id FROM users').all().map((u) => [u.name, u.id]));
  const t0 = Date.UTC(2026, 10, 27, 6, 30);       // 09:30 à Antananarivo
  db.prepare(`INSERT INTO deliveries (client_id, courier_id, pickup_lat, pickup_lng, drop_lat, drop_lng, distance_km, suggested_price, proposed_price,
    final_price, commission, status, pin, created_at, assigned_at, picked_at, delivered_at, rating)
    VALUES (?,?,-18.9,47.5,-18.88,47.52,3.2,6000,6000,6500,650,'delivered','1234',?,?,?,?,5)`)
    .run(ids.Admin, ids['Hery Velo'], Date.now() - 3600e3, Date.now() - 3500e3, Date.now() - 3000e3, Date.now() - 1800e3);
  db.prepare('INSERT INTO positions (courier_id, lat, lng, at) VALUES (?,?,?,?),(?,?,?,?)')
    .run(ids['Hery Velo'], -18.9, 47.5, Date.now() - 120e3, ids['Hery Velo'], -18.9, 47.5, Date.now() - 115e3);
  db.prepare('INSERT INTO audit (user_id, action, detail, at) VALUES (?,?,?,?)').run(ids.Admin, 'delivery_cancel', '{"id":9}', t0);

  assert.equal((await call('GET', '/api/admin/centralia', null, caisse)).status, 403, 'rôle « caisse » : refusé');
  assert.equal((await call('GET', '/api/admin/centralia')).status, 401);
  const r = await call('GET', '/api/admin/centralia', null, admin);
  assert.equal(r.status, 200);
  const d = r.data.datasets;
  assert.deepEqual(Object.keys(d).sort(), ['colis', 'journal', 'livraisons', 'livreurs', 'presence', 'reclamations', 'transactions']);
  const l = d.livraisons[0];
  assert.equal(l.livreur, 'Hery Velo'); assert.equal(l.prix_final, 6500); assert.equal(l.duree_livraison_min, 20); assert.equal(l.attente_livreur_min, 2);
  const flat = JSON.stringify(d);
  assert.ok(!flat.includes('+261') && !/"pin"/.test(flat) && !flat.includes('101211100001'), 'ni téléphone, ni PIN, ni CIN');
  assert.equal(d.livreurs[0].nom, 'Hery Velo');
  assert.equal(d.presence.length, 1, 'une ligne par minute de GPS');
  const j = d.journal.find((x) => x.action === 'Livraison annulée');
  assert.equal(j.heure, '09:30'); assert.equal(j.date, '2026-11-27');
});
