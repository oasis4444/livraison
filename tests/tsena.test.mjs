// Synchronisation Tsena (Firestore simulé) : livraison « En attente » → colis Alefa → statut réécrit dans Tsena.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { syncTsena } from '../src/tsena.js';
import { hashPassword } from '../src/lib.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
const fs = { // « Firestore » de Tsena
  d1: { no: 'L-00001', status: 'attente', clientName: 'Hotely Mamy', phone: '033 45 678 90', address: 'Andravoahangy', driver: 'Fidy', fee: 3000, amount: 45000, note: 'Livrer avant 11h' },
  d2: { no: 'L-00002', status: 'cours', clientName: 'Rasoa Hanta', phone: '034 12 345 67', address: 'Ampandrana', fee: 2000, amount: 0 },
};
const patches = [];
const val = (v) => (typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v });
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
  if (init.method === 'PATCH' && u.includes('/documents/deliveries/')) {
    const id = u.split('/deliveries/')[1].split('?')[0];
    assert.match(u, /currentDocument\.exists=true/);
    if (!fs[id]) return J({ error: { message: 'NOT_FOUND' } }, 404);
    const f = Object.fromEntries(Object.entries(JSON.parse(init.body).fields).map(([k, v]) => [k, v.stringValue ?? Number(v.integerValue)]));
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
  const adminPhone = await call('POST', '/api/admin/tsena/connect', { email: 'x@y.mg', password: 'bon', shop_phone: '034 00 000 00' }, admin);
  assert.equal(adminPhone.status, 400); assert.match(adminPhone.data.message, /administrateur/);
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
  let r = await syncTsena(env);
  assert.equal(r.imported, 0, 'déjà importée');
  // le colis avance : récupéré puis livré
  env.DB.raw.prepare("UPDATE shipments SET status='picked_up', picked_at=1 WHERE external_ref='L-00001'").run();
  r = await syncTsena(env);
  assert.equal(r.updated, 1); assert.equal(fs.d1.status, 'cours'); assert.match(fs.d1.alefaPin, /^\d{4}$/);
  assert.equal(fs.d1.note, 'Livrer avant 11h — 🚲 Alefa : Récupéré', 'note d\'origine conservée + statut Alefa');
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00001'").run(Date.now());
  await syncTsena(env);
  assert.equal(fs.d1.status, 'livree'); assert.ok(fs.d1.doneAt); assert.equal(fs.d1.alefaStep, 'delivered');
  r = await syncTsena(env);
  assert.equal(r.updated, 0, 'rien de nouveau');
  assert.equal(fs.d1.note, 'Livrer avant 11h — 🚲 Alefa : Livré');
  // nouvelle livraison saisie dans Tsena → arrive à la synchronisation suivante
  fs.d3 = { no: 'L-00003', status: 'attente', clientName: 'Koto', phone: '034 99 888 77', address: 'Behoririka', amount: 12000, fee: 0 };
  r = await syncTsena(env);
  assert.equal(r.imported, 1);
  const s3 = (await call('GET', '/api/admin/shipments?q=L-00003', null, admin)).data.shipments[0];
  assert.equal(s3.fee, 3000, 'frais Alefa par défaut quand Tsena n\'en indique pas');
});

test('une livraison déjà importée à la main (même n°) est reliée et suivie', async () => {
  const { createShipment } = await import('../src/shipments.js');
  const sender = env.DB.raw.prepare("SELECT * FROM users WHERE phone='+261321112233'").get();
  fs.d4 = { no: 'L-00004', status: 'cours', clientName: 'Bema', phone: '034 55 666 77', address: 'Isotry', amount: 5000 };
  await createShipment(env, { external_ref: 'L-00004', recipient_name: 'Bema', recipient_phone: '0345566677', drop_addr: 'Isotry', pickup_addr: 'Ampandrana', declared_value: 5000 }, { sender, source: 'admin', actor: { role: 'admin', id: null } });
  const r = await syncTsena(env);
  assert.equal(r.linked, 1); assert.equal(r.imported, 0, 'pas recréée');
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00004'").run(Date.now());
  await syncTsena(env);
  assert.equal(fs.d4.status, 'livree');
});

test('statut visible dans Tsena dès la programmation, livraison supprimée dans Tsena jamais recréée', async () => {
  fs.d5 = { no: 'L-00005', status: 'attente', clientName: 'Soa', phone: '034 77 888 99', address: 'Ampasika', amount: 6000, fee: 3000, note: '' };
  await syncTsena(env); // import
  await syncTsena(env); // statut renvoyé
  assert.match(fs.d5.note, /^🚲 Alefa : À programmer$/);
  // l'utilisateur modifie sa note dans Tsena : elle est conservée
  fs.d5.note = 'Sonner 2 fois — ' + fs.d5.note;
  env.DB.raw.prepare("UPDATE shipments SET status='picked_up', picked_at=1 WHERE external_ref='L-00005'").run();
  await syncTsena(env);
  assert.equal(fs.d5.note, 'Sonner 2 fois — 🚲 Alefa : Récupéré');
  delete fs.d5;
  env.DB.raw.prepare("UPDATE shipments SET status='delivered', done_at=? WHERE external_ref='L-00005'").run(Date.now());
  const r = await syncTsena(env);
  assert.equal(fs.d5, undefined, 'pas recréée'); assert.ok(r.errors.some((e) => /NOT_FOUND/.test(e)));
  assert.equal((await syncTsena(env)).errors.length, 0, 'pas de relance infinie');
});

test('modifier la boutique : les colis non récupérés passent sur son compte', async () => {
  const bad = await call('POST', '/api/admin/tsena/shop', { shop_name: 'Tsena', shop_phone: '034 00 000 00' }, admin);
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/admin/tsena/shop', { shop_name: 'Tsena Ampandrana', shop_phone: '033 46 261 16', pickup_addr: 'Ampandrana' }, admin);
  assert.equal(ok.status, 200); assert.ok(ok.data.moved >= 1);
  const s3 = (await call('GET', '/api/admin/shipments?q=L-00003', null, admin)).data.shipments[0];
  assert.equal(s3.sender.phone, '+261334626116');
});
