// Notifications push (site fermé) et positions GPS gardées hors connexion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { hashPassword } from '../src/lib.js';
import { b64u, takePending } from '../src/push.js';

const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
const db = env.DB.raw;
async function call(method, path, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await handleApi(new Request('https://alefa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
let admin, courier, cid;

// Faux navigateur : sa clé de chiffrement, et un déchiffreur RFC 8291 pour lire ce que le serveur envoie.
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const enc = new TextEncoder();
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function decrypt(body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cipher));
  return JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))));
}

test('préparation', async () => {
  db.prepare("INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, created_at) VALUES ('+261340000000','Admin','admin',?, 's','active',?)").run(await hashPassword('admin123', 's', 1000), Date.now());
  admin = (await call('POST', '/api/auth/login', { phone: '0340000000', password: 'admin123' })).data.token;
  const r = await call('POST', '/api/admin/users', { role: 'courier', name: 'Santatra', phone: '0347429734', password: 'velo1234', cin: '101211100009', vehicle: 'velo' }, admin);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  courier = (await call('POST', '/api/auth/login', { phone: '0347429734', password: 'velo1234' })).data.token;
  cid = db.prepare("SELECT id FROM users WHERE name = 'Santatra'").get().id;
});

test('push : abonnement, envoi chiffré lisible par le téléphone, VAPID signé, abonnement expiré supprimé', async () => {
  const key = (await call('GET', '/api/push/key', null, courier)).data.key;
  assert.equal(b64u.dec(key).length, 65, 'clé publique VAPID P-256');
  assert.equal((await call('GET', '/api/push/key', null, courier)).data.key, key, 'clé stable');
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: b64u.enc(uaPub), auth: b64u.enc(authSecret) } };
  assert.equal((await call('POST', '/api/push/subscribe', { ...sub, keys: { p256dh: 'court', auth: 'x' } }, courier)).status, 400);
  assert.equal((await call('POST', '/api/push/subscribe', { ...sub, endpoint: 'http://pas-https' }, courier)).status, 400);
  assert.equal((await call('POST', '/api/push/subscribe', sub, courier)).data.devices, 1);
  assert.equal((await call('POST', '/api/push/subscribe', sub, courier)).data.devices, 1, 'même téléphone : pas de doublon');

  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, init }); return new Response('', { status: 201 }); };
  try {
    takePending();
    // une notification normale (ex. alerte « colis chez vous depuis 4 h ») part aussi en push
    const { notify } = await import('../src/worker.js');
    await notify(env, [cid], 'hold', '⏰ Colis AL123 à livrer', 'Il est chez vous depuis 4 h.');
    await Promise.all(takePending());
    assert.equal(sent.length, 1);
    const { url, init } = sent[0];
    assert.equal(url, sub.endpoint);
    assert.equal(init.headers['Content-Encoding'], 'aes128gcm'); assert.equal(init.headers.Urgency, 'high');
    const msg = await decrypt(init.body);
    assert.deepEqual(msg, { title: '⏰ Colis AL123 à livrer', body: 'Il est chez vous depuis 4 h.', url: '/livreur', tag: null });
    // signature VAPID vérifiable avec la clé publique, pour le bon service de push
    const [, t, k] = init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, key);
    const [h, p, sig] = t.split('.');
    const claims = JSON.parse(new TextDecoder().decode(b64u.dec(p)));
    assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.ok(claims.exp * 1000 > Date.now());
    const pk = await crypto.subtle.importKey('raw', b64u.dec(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pk, b64u.dec(sig), enc.encode(`${h}.${p}`)), 'signature VAPID valide');
    // bouton « tester »
    sent.length = 0;
    assert.equal((await call('POST', '/api/push/test', null, courier)).data.sent, 1);
    // abonnement expiré (410) : supprimé
    globalThis.fetch = async () => new Response('', { status: 410 });
    await notify(env, [cid], 'x', 'Test', 'x'); await Promise.all(takePending());
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subs').get().n, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('appel entrant : le téléphone de la personne appelée sonne par push', async () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/admin1', keys: { p256dh: b64u.enc(uaPub), auth: b64u.enc(authSecret) } };
  await call('POST', '/api/push/subscribe', sub, admin);
  const sent = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(init); return new Response('', { status: 201 }); };
  try {
    takePending();
    const r = await call('POST', '/api/calls', { to: 'support', offer: 'v=0 offre-webrtc-factice' }, courier);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    await Promise.all(takePending());
    assert.equal(sent.length, 1, 'l\'équipe du service client est appelée');
    const msg = await decrypt(sent[0].body);
    assert.equal(msg.tag, 'call'); assert.match(msg.body, /Santatra vous appelle/);
    assert.equal(sent[0].headers.TTL, '45');
  } finally { globalThis.fetch = realFetch; }
});

test('GPS hors connexion : les positions gardées par le téléphone reconstituent le trajet', async () => {
  db.prepare('UPDATE couriers SET available = 1, validated_at = ? WHERE user_id = ?').run(Date.now(), cid);
  const t = Date.now();
  // 20 minutes sans réseau : un point par minute, envoyés d'un coup (dans le désordre) au retour de la connexion
  const pts = Array.from({ length: 20 }, (_, i) => ({ lat: -18.9055 + i * 0.0005, lng: 47.5255 + i * 0.0003, at: t - (20 - i) * 60e3 })).reverse();
  const r = await call('POST', '/api/courier/locations', { points: [...pts, { lat: 'x', lng: 1, at: t }, { lat: -18.9, lng: 47.5, at: t - 3 * 864e5 }] }, courier);
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.saved, 20, 'points invalides ou trop vieux ignorés');
  const track = (await call('GET', `/api/admin/track?courier_id=${cid}&from=${t - 3600e3}&to=${t + 1}`, null, admin)).data.positions;
  assert.equal(track.length, 20);
  assert.deepEqual(track.map((p) => p.at), [...track.map((p) => p.at)].sort((a, b) => a - b), 'trajet dans l\'ordre de passage');
  const c = db.prepare('SELECT lat, lng, last_seen FROM couriers WHERE user_id = ?').get(cid);
  assert.equal(c.last_seen, t - 60e3, 'dernière position = le point le plus récent');
  assert.ok(Math.abs(c.lat - (-18.9055 + 19 * 0.0005)) < 1e-9);
  // un vieux lot qui arrive après une position plus récente ne recule pas le livreur
  await call('POST', '/api/courier/locations', { points: [{ lat: -18.95, lng: 47.55, at: t - 30 * 60e3 }] }, courier);
  assert.equal(db.prepare('SELECT last_seen FROM couriers WHERE user_id = ?').get(cid).last_seen, t - 60e3);
  assert.equal((await call('POST', '/api/courier/locations', { points: [] }, admin)).status, 403);
});
