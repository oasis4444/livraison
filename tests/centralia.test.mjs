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
  db.prepare(`INSERT INTO shipments (ref, sender_id, sender_name, sender_phone, pickup_addr, recipient_name, recipient_phone, drop_addr, fee, value, status, kind, category,
    courier_id, created_at, assigned_at, picked_at, done_at, centre_share, courier_share, collected, pin) VALUES ('ALTEST01',?,'Boutique Soa','+261330000000','Analakely, Antananarivo','Rivo','+261340000009',
    'Ivandry, Antananarivo',3000,25000,'delivered','document','M',?,?,?,?,?,1000,2000,25000,'9876')`)
    .run(ids.Admin, ids['Hery Velo'], t0, t0 + 600e3, t0 + 1800e3, t0 + 5400e3);

  // Livreur en service près d'Analakely (adresse d'un colis), avec un colis en route
  db.prepare("UPDATE shipments SET pickup_lat = -18.9060, pickup_lng = 47.5250, drop_lat = -18.8752, drop_lng = 47.5328 WHERE ref = 'ALTEST01'").run();
  db.prepare("INSERT INTO shipments (ref, sender_id, sender_name, sender_phone, pickup_addr, recipient_name, recipient_phone, drop_addr, fee, status, courier_id, created_at) VALUES ('ALTEST02',?,'Boutique Soa','+261330000000','Analakely','Lova','+261340000008','67 Ha, Antananarivo',3000,'picked_up',?,?)")
    .run(ids.Admin, ids['Hery Velo'], Date.now() - 3600e3);
  db.prepare('UPDATE couriers SET lat = -18.9064, lng = 47.5254, last_seen = ?, available = 1 WHERE user_id = ?').run(Date.now() - 120e3, ids['Hery Velo']);
  assert.equal((await call('GET', '/api/admin/centralia', null, caisse)).status, 403, 'rôle « caisse » : refusé');
  assert.equal((await call('GET', '/api/admin/centralia')).status, 401);
  const r = await call('GET', '/api/admin/centralia', null, admin);
  assert.equal(r.status, 200);
  const d = r.data.datasets;
  assert.deepEqual(Object.keys(d).sort(), ['clients', 'colis', 'equipe', 'journal', 'livraisons', 'livreurs', 'planning', 'presence', 'reclamations',
    'remises_caisse', 'service_client', 'tarifs', 'transactions', 'versements']);
  // Colis : quartiers, livreurs, délais, paiement, sans téléphone ni PIN
  const c = d.colis.find((x) => x.ref === 'ALTEST01');
  assert.equal(c.quartier_depart, 'Analakely'); assert.equal(c.quartier_arrivee, 'Ivandry'); assert.equal(c.type, 'document');
  assert.equal(c.livreur_livraison, 'Hery Velo'); assert.equal(c.duree_livraison_min, 60); assert.equal(c.attente_programmation_min, 10);
  assert.equal(c.paiement, 'à encaisser'); assert.equal(c.caisse_reglee, 0); assert.equal(c.en_retard, 0); assert.equal(c.heure_livraison, '11:00');
  assert.ok(d.tarifs.some((t) => t.element === 'Zone 1' && t.valeur === 2000), 'grille des tarifs');
  assert.deepEqual(d.equipe.map((e) => e.role).sort(), ['Administrateur', 'Caisse']);
  // Connaissances : fonctionnement, tarifs, conditions… écrits à partir des Paramètres
  const k = r.data.connaissances;
  assert.ok(k.length >= 7 && k.every((x) => x.titre && x.texte.length > 200));
  const all = k.map((x) => x.texte).join('\n');
  assert.match(all, /Zone 1 : jusqu'à 3 km → 2 000 Ar/); assert.match(all, /038 51 201 42/); assert.match(all, /Lot II V 89 Ampandrana/);
  assert.match(all, /code PIN/i); assert.match(all, /tsy azo alefa/i);
  assert.ok(!/sms_gateway_token|turn_pass|tsena_api_key|pass_hash/.test(all), 'aucun secret');
  const l = d.livraisons[0];
  assert.equal(l.livreur, 'Hery Velo'); assert.equal(l.prix_final, 6500); assert.equal(l.duree_livraison_min, 20); assert.equal(l.attente_livreur_min, 2);
  const flat = JSON.stringify(d);
  assert.ok(!flat.includes('+261') && !/"pin"/.test(flat) && !flat.includes('9876') && !flat.includes('101211100001'), 'ni téléphone, ni PIN, ni CIN');
  assert.equal(d.livreurs[0].nom, 'Hery Velo');
  const lv = d.livreurs[0];
  assert.equal(lv.en_service, 1); assert.equal(lv.position_il_y_a_min, 2); assert.match(lv.pres_de, /Analakely \(\d+ m\)/);
  assert.match(lv.lien_carte, /^https:\/\/www\.google\.com\/maps\?q=-18\.906/); assert.equal(lv.colis_en_cours, 1); assert.match(lv.mission, /ALTEST02 en route → 67 Ha/);
  assert.equal(d.presence.length, 1, 'une ligne par minute de GPS');
  const j = d.journal.find((x) => x.action === 'Livraison annulée');
  assert.equal(j.heure, '09:30'); assert.equal(j.date, '2026-11-27');
});
