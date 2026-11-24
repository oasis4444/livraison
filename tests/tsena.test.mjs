// Synchronisation Tsena (Firestore simulé) : livraison « En attente » → colis Alefa → statut réécrit dans Tsena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { syncTsena } from '../src/tsena.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
env.DB.raw.prepare("UPDATE settings SET value = 'auto' WHERE key = 'dispatch_mode'").run(); // ces tests utilisent l'attribution automatique
env.DB.raw.prepare("UPDATE settings SET value = '0' WHERE key = 'direct_km'").run(); // et le tarif normal (pas de tarif direct)
env.DB.raw.prepare("UPDATE settings SET value = '0' WHERE key = 'zones_enabled'").run(); // frais fixes (zones testées à part)
env.DB.raw.prepare("UPDATE settings SET value = CASE key WHEN 'xl_enabled' THEN '1' ELSE '0' END WHERE key IN ('scan_required', 'xl_enabled')").run(); // devis XL activé (ancien fonctionnement testé ici) ; code colis non exigé (testé à part)
const fs = { // « Firestore » de Tsena
  d1: { no: 'L-00001', status: 'attente', clientName: 'Hotely Mamy', phone: '033 45 678 90', address: 'Andravoahangy', driver: 'Fidy', fee: 3000, amount: 45000, note: 'Livrer avant 11h' },
  d2: { no: 'L-00002', status: 'cours', clientName: 'Rasoa Hanta', phone: '034 12 345 67', address: 'Ampandrana', fee: 2000, amount: 0 },
};
const patches = []; let settingsAlefa = null, settingsWrites = 0;
const val = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
  : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v });
const dec = (v) => ('arrayValue' in v ? (v.arrayValue.values || []).map(dec) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]))
  : 'integerValue' in v ? Number(v.integerValue) : v.stringValue ?? null);
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/firebase-config.js')) return new Response('window.FIREBASE_CONFIG = { apiKey: "AIzaTEST", projectId: "tsena-ampandrana" };');
  if (u.includes('signInWithPassword')) { const b = JSON.parse(init.body); return b.password === 'bon' ? J({ idToken: 'tok', refreshToken: 'ref1' }) : J({ error: { message: 'INVALID_PASSWORD' } }, 400); }
  if (u.includes('securetoken')) return J({ id_token: 'tok', refresh_token: 'ref2' });
  if (u.includes(':runQuery')) {
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const want = JSON.parse(init.body).structuredQuery.where.fieldFilter.value.arrayValue.values.map((v) => v.stringValue);
    return J(Object.entries(fs).filter(([, d]) => want.includes(d.status)).map(([id, d]) => ({ document: { name: `projects/p/databases/(default)/documents/deliveries/${id}`, fields: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, val(v)])) } })));
  }
  if (init.method === 'PATCH' && u.includes('/documents/settings/alefa')) {
    settingsWrites++; settingsAlefa = Object.fromEntries(Object.entries(JSON.parse(init.body).fields).map(([k, v]) => [k, dec(v)])); return J({});
  }
  if (u.includes(':batchGet')) {
    return J(JSON.parse(init.body).documents.map((name) => { const id = name.split('/').pop(); return fs[id] ? { found: { name, fields: Object.fromEntries(Object.entries(fs[id]).map(([k, v]) => [k, val(v)])) } } : { missing: name }; }));
  }
  if (init.method === 'PATCH' && u.includes('/documents/deliveries/')) {
    const id = u.split('/deliveries/')[1].split('?')[0];
    assert.match(u, /currentDocument\.exists=true/);
    if (!fs[id]) return J({ error: { message: 'NOT_FOUND' } }, 404);
    const f = Object.fromEntries(Object.entries(JSON.parse(init.body).fields).map(([k, v]) => [k, dec(v)]));
    Object.assign(fs[id], f); patches.push([id, f]);
    return J({});
  }
  throw new Error('fetch inattendu ' + u);
};
async function call(method, path, body, token) {
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json() };
}
let admin;

test('connexion à Tsena : mauvais mot de passe refusé, puis import automatique', async () => {
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261340000000','Admin','admin',?,?,'active',0)").run(await hashPassword('a', 's', 1000), 's');
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'a' })).data.token;
  const bad = await call('POST', '/api/admin/tsena/connect', { email: 'x@y.mg', password: 'faux', shop_phone: '0321112233' }, admin);
  assert.equal(bad.status, 400); assert.match(bad.data.message, /refusée/);
  const ok = await call('POST', '/api/admin/tsena/connect', { url: 'https://tsena-ampandrana.web.app', email: 'x@y.mg', password: 'bon', shop_name: 'Tsena Ampandrana', shop_phone: '0321112233', pickup_addr: 'Ampandrana' }, admin);
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.waiting, 1); assert.equal(ok.data.imported, 1);
  const st = (await call('GET', '/api/admin/tsena', null, admin)).data;
  assert.equal(st.connected, true); assert.equal(st.linked, 1);
  assert.equal((await call('GET', '/api/admin/settings', null, admin)).data.settings.tsena_refresh, undefined, 'jeton jamais renvoyé');
  const sh = (await call('GET', '/api/admin/shipments?status=', null, admin)).data.shipments[0];
  assert.equal(sh.external_ref, 'L-00001'); assert.equal(sh.declared_value, 45000); assert.equal(sh.fee, 3000); assert.equal(sh.sender.name, 'Tsena Ampandrana');
});

test('pas de doublon, et l\'avancement Alefa est réécrit dans Tsena', async () => {
  let r = await syncTsena(env, { force: true });
  assert.equal(r.imported, 0, 'déjà importée');
  // le colis avance : récupéré puis livré
  env.DB.raw.prepare("UPDATE shipments SET status='picked_up', picked_at=1 WHERE external_ref='L-00001'").run();
  r = await syncTsena(env, { force: true });
  assert.equal(r.updated, 1); assert.equal(fs.d1.status, 'cours'); assert.match(fs.d1.alefaPin, /^\d{4}$/);
  assert.match(fs.d1.note, /^Livrer avant 11h — 🚲 Alefa : Récupéré · suivi AL\w+$/, 'note d\'origine conservée + statut Alefa + numéro de suivi');
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00001'").run(Date.now());
  await syncTsena(env, { force: true });
  assert.equal(fs.d1.status, 'livree'); assert.ok(fs.d1.doneAt); assert.equal(fs.d1.alefaStep, 'delivered');
  r = await syncTsena(env, { force: true });
  assert.equal(r.updated, 0, 'rien de nouveau');
  assert.match(fs.d1.note, /^Livrer avant 11h — 🚲 Alefa : Livré · suivi AL\w+$/);
  // nouvelle livraison saisie dans Tsena → arrive à la synchronisation suivante
  fs.d3 = { no: 'L-00003', status: 'attente', clientName: 'Koto', phone: '034 99 888 77', address: 'Behoririka', amount: 12000, fee: 0 };
  r = await syncTsena(env, { force: true });
  assert.equal(r.imported, 1);
  const s3 = (await call('GET', '/api/admin/shipments?q=L-00003', null, admin)).data.shipments[0];
  assert.equal(s3.fee, 3000, 'frais Alefa par défaut quand Tsena n\'en indique pas');
});

test('une livraison déjà importée à la main (même n°) est reliée et suivie', async () => {
  const { createShipment } = await import('../src/shipments.js');
  const sender = env.DB.raw.prepare("SELECT * FROM users WHERE phone='+261321112233'").get();
  fs.d4 = { no: 'L-00004', status: 'cours', clientName: 'Bema', phone: '034 55 666 77', address: 'Isotry', amount: 5000 };
  await createShipment(env, { external_ref: 'L-00004', recipient_name: 'Bema', recipient_phone: '0345566677', drop_addr: 'Isotry', pickup_addr: 'Ampandrana', declared_value: 5000 }, { sender, source: 'admin', actor: { role: 'admin', id: null } });
  const r = await syncTsena(env, { force: true });
  assert.equal(r.linked, 1); assert.equal(r.imported, 0, 'pas recréée');
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00004'").run(Date.now());
  await syncTsena(env, { force: true });
  assert.equal(fs.d4.status, 'livree');
});

test('statut visible dans Tsena dès la programmation, livraison supprimée dans Tsena jamais recréée', async () => {
  fs.d5 = { no: 'L-00005', status: 'attente', clientName: 'Soa', phone: '034 77 888 99', address: 'Ampasika', amount: 6000, fee: 3000, note: '' };
  await syncTsena(env, { force: true }); // import
  await syncTsena(env, { force: true }); // statut renvoyé
  assert.match(fs.d5.note, /^🚲 Alefa : À programmer · suivi AL\w+$/);
  // l'utilisateur modifie sa note dans Tsena : elle est conservée
  fs.d5.note = 'Sonner 2 fois — ' + fs.d5.note;
  env.DB.raw.prepare("UPDATE shipments SET status='picked_up', picked_at=1 WHERE external_ref='L-00005'").run();
  await syncTsena(env, { force: true });
  assert.match(fs.d5.note, /^Sonner 2 fois — 🚲 Alefa : Récupéré · suivi AL\w+$/);
  delete fs.d5;
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00005'").run(Date.now());
  const r = await syncTsena(env, { force: true });
  assert.equal(fs.d5, undefined, 'pas recréée'); assert.ok(r.errors.some((e) => /NOT_FOUND/.test(e)));
  assert.equal((await syncTsena(env, { force: true })).errors.length, 0, 'pas de relance infinie');
});

test('modifier la boutique : les colis non récupérés passent sur son compte', async () => {
  const ok = await call('POST', '/api/admin/tsena/shop', { shop_name: 'Tsena Ampandrana', shop_phone: '033 46 261 16', pickup_addr: 'Ampandrana' }, admin);
  assert.equal(ok.status, 200); assert.ok(ok.data.moved >= 1);
  const s3 = (await call('GET', '/api/admin/shipments?q=L-00003', null, admin)).data.shipments[0];
  assert.equal(s3.sender.phone, '+261334626116');
});

test('numéro de l\'admin donné pour la boutique : compte boutique séparé créé automatiquement, l\'admin n\'est jamais l\'expéditeur', async () => {
  const r = await call('POST', '/api/admin/tsena/shop', { shop_name: 'Tsena Ampandrana', shop_phone: '034 00 000 00', pickup_addr: 'Ampandrana' }, admin);
  assert.equal(r.status, 200);
  fs.d6 = { no: 'L-00006', status: 'attente', clientName: 'Hery', phone: '034 12 121 21', address: 'Ampasika', amount: 6000, fee: 3000 };
  const out = await syncTsena(env, { force: true });
  assert.equal(out.errors.length, 0, JSON.stringify(out.errors)); assert.equal(out.imported, 1);
  const s6 = (await call('GET', '/api/admin/shipments?q=L-00006', null, admin)).data.shipments[0];
  assert.equal(s6.sender.name, 'Tsena Ampandrana'); assert.equal(s6.sender.phone, '+261340000000', 'numéro de contact pour le livreur');
  const owner = env.DB.raw.prepare('SELECT u.role FROM shipments s JOIN users u ON u.id = s.sender_id WHERE s.external_ref = ?').get('L-00006');
  assert.equal(owner.role, 'client');
  // ancien colis resté au nom de l'admin : corrigé tout seul à la synchronisation suivante
  env.DB.raw.prepare("UPDATE shipments SET sender_id = (SELECT id FROM users WHERE role='admin') WHERE external_ref='L-00006'").run();
  await syncTsena(env, { force: true });
  assert.equal(env.DB.raw.prepare('SELECT u.role FROM shipments s JOIN users u ON u.id = s.sender_id WHERE s.external_ref = ?').get('L-00006').role, 'client');
});

test('changements faits dans Tsena suivis automatiquement : modification, suppression, « Livrée » par la boutique', async () => {
  fs.d7 = { no: 'L-00007', status: 'attente', clientName: 'Bema', phone: '034 55 555 55', address: 'Isotry', amount: 10000, fee: 3000 };
  fs.d8 = { no: 'L-00008', status: 'attente', clientName: 'Koto', phone: '034 66 666 66', address: 'Anosy', amount: 8000, fee: 3000 };
  await syncTsena(env, { force: true });
  // modification dans Tsena
  Object.assign(fs.d7, { address: 'Ankorondrano', amount: 12000, phone: '034 55 555 56' });
  let r = await syncTsena(env, { force: true });
  assert.equal(r.changed, 1);
  const s7 = (await call('GET', '/api/admin/shipments?q=L-00007', null, admin)).data.shipments[0];
  assert.equal(s7.declared_value, 12000); assert.equal(s7.recipient.address, 'Ankorondrano'); assert.equal(s7.recipient.phone, '+261345555556');
  // la boutique livre elle-même L-00007, et supprime L-00008
  fs.d7.status = 'livree'; delete fs.d8;
  r = await syncTsena(env, { force: true });
  assert.equal(r.cancelled, 2);
  const st = (ref) => env.DB.raw.prepare('SELECT status, outcome_note FROM shipments WHERE external_ref = ?').get(ref);
  assert.equal(st('L-00007').status, 'cancelled'); assert.match(st('L-00007').outcome_note, /boutique/);
  assert.equal(st('L-00008').status, 'cancelled'); assert.match(st('L-00008').outcome_note, /supprimée/);
  assert.equal(fs.d7.status, 'livree', 'Tsena garde « Livrée »');
});

test('nouveaux statuts Tsena : Confirmée importée, Annulée suivie, « Remettre en attente » repart, historique « Alefa », jamais de retour en arrière', async () => {
  const { createShipment } = await import('../src/shipments.js');
  // un livreur avec un départ pour que les colis soient programmés
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261349999999','Santatra Vélo','courier','x','x','active',0)").run();
  const cid = env.DB.raw.prepare("SELECT id FROM users WHERE phone='+261349999999'").get().id;
  fs.d9 = { no: 'L-00009', status: 'confirmee', clientName: 'Lova', phone: '034 90 909 09', address: 'Analakely', amount: 7000, fee: 3000, log: [{ s: 'confirmee', at: '2026-11-17T11:00:00Z', by: 'oasis' }] };
  let r = await syncTsena(env, { force: true });
  assert.equal(r.imported, 1, 'Confirmée importée');
  // Alefa programme le colis avec un livreur → Tsena passe « Confirmée » (déjà) : pas de changement de statut, mais historique intact
  env.DB.raw.prepare("UPDATE shipments SET status='assigned', courier_id=? WHERE external_ref='L-00009'").run(cid);
  await syncTsena(env, { force: true });
  assert.equal(fs.d9.status, 'confirmee'); assert.equal(fs.d9.log.length, 1);
  // le livreur récupère → « En route », ajouté à l'historique par Alefa
  env.DB.raw.prepare("UPDATE shipments SET status='picked_up', picked_at=1 WHERE external_ref='L-00009'").run();
  await syncTsena(env, { force: true });
  assert.equal(fs.d9.status, 'cours'); assert.equal(fs.d9.log.at(-1).s, 'cours'); assert.equal(fs.d9.log.at(-1).by, 'Santatra · Alefa'); assert.equal(fs.d9.log[0].by, 'oasis');
  // la boutique a déjà mis « En route » à la main : Alefa (programmé) ne le remet pas en « Confirmée »
  fs.d10 = { no: 'L-00010', status: 'attente', clientName: 'Fara', phone: '034 10 101 01', address: 'Isotry', amount: 5000, fee: 3000 };
  await syncTsena(env, { force: true });
  fs.d10.status = 'cours';
  env.DB.raw.prepare("UPDATE shipments SET status='assigned', courier_id=? WHERE external_ref='L-00010'").run(cid);
  await syncTsena(env, { force: true });
  assert.equal(fs.d10.status, 'cours', 'pas de retour en arrière');
  // annulée dans Tsena → colis annulé ; « Remettre en attente » → nouvelle demande Alefa
  fs.d10.status = 'annulee';
  r = await syncTsena(env, { force: true });
  assert.equal(r.cancelled, 1);
  assert.equal(env.DB.raw.prepare("SELECT status FROM shipments WHERE external_ref='L-00010' ORDER BY id DESC").get().status, 'cancelled');
  fs.d10.status = 'attente';
  r = await syncTsena(env, { force: true });
  assert.equal(r.imported, 1, 'repart comme nouvelle demande');
  const again = env.DB.raw.prepare("SELECT s.status, u.name FROM shipments s LEFT JOIN users u ON u.id = s.courier_id WHERE external_ref='L-00010' ORDER BY s.id DESC").get();
  assert.equal(again.status, 'assigned'); assert.equal(again.name, 'Santatra Vélo', 'le livreur affiché sur la carte Tsena est repris');
});

test('adresse précise introuvable : le quartier est utilisé', async () => {
  const { geocodeTana } = await import('../src/tsena.js');
  const real = globalThis.fetch, asked = [];
  globalThis.fetch = async (u) => { const q = decodeURIComponent(String(u).split('q=')[1]); asked.push(q); return new Response(JSON.stringify(/^Ampandrana,/.test(q) ? [{ lat: '-18.9038', lon: '47.5337' }] : [])); };
  try {
    assert.deepEqual(await geocodeTana('Lot II M 45 Ampandrana'), [-18.9038, 47.5337]);
    assert.equal(asked[0], 'Lot II M 45 Ampandrana, Antananarivo');
  } finally { globalThis.fetch = real; }
});

test('livreurs, axes et heures publiés automatiquement dans Tsena (settings/alefa), seulement quand ils changent', async () => {
  const cid = env.DB.raw.prepare("SELECT id FROM users WHERE phone='+261349999999'").get().id;
  env.DB.raw.prepare("INSERT INTO axes (name, center_lat, center_lng, radius_km, color, active) VALUES ('AMPANDRANA- ITAOSY', -18.9076, 47.4987, 3.6, '#0f7a55', 1)").run();
  const ax = env.DB.raw.prepare("SELECT id FROM axes WHERE name='AMPANDRANA- ITAOSY'").get().id;
  env.DB.raw.prepare("INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,480,600,'123456')").run(cid, ax);
  await syncTsena(env, { force: true });
  const santatra = settingsAlefa.couriers.find((c) => c.fullName === 'Santatra Vélo');
  assert.equal(santatra.name, 'Santatra (Alefa)');
  assert.equal(santatra.axes, 'AMPANDRANA- ITAOSY');
  assert.equal(santatra.hours, 'AMPANDRANA- ITAOSY 08:00–10:00 (lun–sam)');
  assert.match(santatra.label, /^Santatra \(Alefa\) · AMPANDRANA- ITAOSY/);
  const n = settingsWrites;
  await syncTsena(env, { force: true });
  assert.equal(settingsWrites, n, 'rien de changé : pas de nouvelle écriture');
  env.DB.raw.prepare('UPDATE courier_axes SET end_min = 660 WHERE courier_id = ?').run(cid);
  await syncTsena(env, { force: true });
  assert.equal(settingsWrites, n + 1); assert.match(settingsAlefa.couriers.find((c) => c.fullName === 'Santatra Vélo').hours, /08:00–11:00/);
});

test('livreur choisi dans Tsena (« Rivo (Alefa) ») : Alefa lui confie le colis', async () => {
  env.DB.raw.prepare("INSERT INTO users (phone,name,role,pass_hash,pass_salt,status,created_at) VALUES ('+261348888888','Rivo Vélo','courier','x','x','active',0)").run();
  const rivo = env.DB.raw.prepare("SELECT id FROM users WHERE phone='+261348888888'").get().id;
  fs.d11 = { no: 'L-00011', status: 'attente', clientName: 'Tahina', phone: '034 11 111 99', address: 'Isotry', amount: 4000, fee: 3000 };
  await syncTsena(env, { force: true });
  fs.d11.driver = 'Rivo (Alefa)';
  await syncTsena(env, { force: true });
  const sh = env.DB.raw.prepare("SELECT courier_id, status FROM shipments WHERE external_ref='L-00011'").get();
  assert.equal(sh.courier_id, rivo); assert.equal(sh.status, 'assigned');
  await syncTsena(env, { force: true });
  assert.equal(fs.d11.driver, 'Rivo (Alefa)'); assert.match(fs.d11.note, /Rivo/);
  // Rivo refuse : Alefa confie le colis à un autre ; le nom « Rivo (Alefa) » encore écrit dans Tsena ne le fait pas revenir
  const tok = (await call('POST', '/api/auth/login', { phone: '0348888888', password: 'x' })).data.token;
  env.DB.raw.prepare("UPDATE shipments SET refused_by = ?, courier_id = NULL, status = 'pending' WHERE external_ref = 'L-00011'").run(String(rivo));
  await syncTsena(env, { force: true });
  assert.notEqual(env.DB.raw.prepare("SELECT courier_id FROM shipments WHERE external_ref='L-00011'").get().courier_id, rivo);
});

test('quota Firebase ménagé : pas de lecture avant le délai, pause de 30 min après un refus 429', async () => {
  const runs = () => patches.length;
  let r = await syncTsena(env, { force: true });
  r = await syncTsena(env);
  assert.equal(r.skipped, 'wait', 'deuxième passage dans la même minute : rien lu');
  const real = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).includes(':runQuery') ? new Response(JSON.stringify({ error: { message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 }) : real(u, i));
  try {
    r = await syncTsena(env, { force: true });
    assert.match(r.errors[0], /Quota Firebase de Tsena dépassé/);
    const next = Number(env.DB.raw.prepare("SELECT value FROM settings WHERE key = 'tsena_next_at'").get().value);
    assert.ok(next - Date.now() > 25 * 60e3, 'pause d\'environ 30 minutes');
    assert.equal((await syncTsena(env)).skipped, 'wait');
  } finally { globalThis.fetch = real; }
  assert.ok(runs() >= 0);
});
