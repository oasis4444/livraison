// Notifications « push » : elles arrivent sur le téléphone même quand le site est fermé (Android : Chrome ;
// iPhone : application ajoutée à l'écran d'accueil, iOS 16.4+). Standard Web Push, sans service payant :
// chiffrement RFC 8291 (aes128gcm) et identification du serveur par VAPID (RFC 8292), avec WebCrypto.
import { fail, str, now } from './lib.js';
import { one, all, run } from './worker.js';

const enc = new TextEncoder();
export const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4)), (c) => c.charCodeAt(0)),
};
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// Chiffre `payload` pour un abonnement (clé p256dh + secret auth du navigateur). `test` : clé éphémère et sel imposés (vecteur RFC).
export async function encryptPayload(payload, p256dh, auth, test = null) {
  const uaPublic = b64u.dec(p256dh), authSecret = b64u.dec(auth);
  const as = test?.keys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = test?.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const data = typeof payload === 'string' ? enc.encode(payload) : payload;
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(data, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // taille d'enregistrement 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// ---------------------------------------------------------------- stockage (créé au premier usage : git push n'applique pas les migrations)
let schemaOk = false;
async function ensure(env) {
  if (schemaOk) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT, created_at INTEGER NOT NULL, last_ok INTEGER, fails INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id)'),
    // Clés VAPID du serveur, à part des Paramètres (la clé privée n'est jamais renvoyée par l'API).
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK (id = 1), public TEXT NOT NULL, private TEXT NOT NULL)'),
  ]);
  schemaOk = true;
}
let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  await ensure(env);
  let row = await one(env, 'SELECT public, private FROM push_keys WHERE id = 1');
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = b64u.enc(await crypto.subtle.exportKey('raw', kp.publicKey));
    const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
    await run(env, 'INSERT OR IGNORE INTO push_keys (id, public, private) VALUES (1, ?, ?)', pub, priv); // deux serveurs en même temps : le premier gagne
    row = await one(env, 'SELECT public, private FROM push_keys WHERE id = 1');
  }
  const key = await crypto.subtle.importKey('jwk', JSON.parse(row.private), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { pub: row.public, key, jwt: new Map() };
  return vapidCache;
}
async function vapidJwt(v, aud, sub) {
  const c = v.jwt.get(aud);
  if (c && c.exp - 3600 > now() / 1000) return c.token;
  const exp = Math.floor(now() / 1000) + 12 * 3600;
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), body = b64u.enc(enc.encode(JSON.stringify({ aud, exp, sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc.encode(`${head}.${body}`));
  const token = `${head}.${body}.${b64u.enc(sig)}`;
  v.jwt.set(aud, { token, exp });
  return token;
}

// ---------------------------------------------------------------- envoi
// Les envois partent en arrière-plan (ctx.waitUntil) : la réponse de l'API n'attend pas les serveurs de push.
const pending = [];
export const takePending = () => pending.splice(0);
export function queuePush(env, userIds, msg) {
  const p = sendPush(env, userIds, msg).catch((e) => console.error('push', e?.message || e));
  pending.push(p);
  return p;
}
const openUrl = (role, url) => url || (role === 'courier' ? '/livreur' : '/');
export async function sendPush(env, userIds, { title, body = '', url = null, tag = null, ttl = 86400, urgency = 'high' }) {
  const ids = [...new Set((userIds || []).filter((x) => x > 0))];
  if (!ids.length) return 0;
  await ensure(env);
  const subs = await all(env, `SELECT p.*, u.role FROM push_subs p JOIN users u ON u.id = p.user_id WHERE p.user_id IN (${ids.map(() => '?').join(',')}) AND u.status = 'active'`, ...ids);
  if (!subs.length) return 0;
  const v = await vapid(env), sub = env.PUBLIC_URL || 'https://livraison.oasismdg3434.workers.dev';
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body || '').slice(0, 300), url: openUrl(s.role, url), tag });
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: `vapid t=${await vapidJwt(v, new URL(s.endpoint).origin, sub)}, k=${v.pub}` },
        body: await encryptPayload(payload, s.p256dh, s.auth),
      });
      if (res.status === 404 || res.status === 410) await run(env, 'DELETE FROM push_subs WHERE id = ?', s.id); // abonnement expiré
      else if (res.ok) { sent += 1; await run(env, 'UPDATE push_subs SET last_ok = ?, fails = 0 WHERE id = ?', now(), s.id); }
      else await run(env, 'UPDATE push_subs SET fails = fails + 1 WHERE id = ?', s.id);
    } catch { await run(env, 'UPDATE push_subs SET fails = fails + 1 WHERE id = ?', s.id).catch(() => {}); }
  }));
  await run(env, 'DELETE FROM push_subs WHERE fails >= 20');
  return sent;
}

// ---------------------------------------------------------------- API
async function pushKey(ctx, env) { return json200({ key: (await vapid(env)).pub }); }
const json200 = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
async function subscribe(ctx, env) {
  await ensure(env);
  const b = ctx.body || {};
  const endpoint = str(b.endpoint, { min: 10, max: 1000, name: 'Abonnement' });
  if (!/^https:\/\//.test(endpoint)) fail(400, 'invalid', 'Abonnement invalide');
  const p256dh = str(b.keys?.p256dh, { min: 20, max: 200, name: 'Clé' }), auth = str(b.keys?.auth, { min: 8, max: 100, name: 'Clé' });
  if (b64u.dec(p256dh).length !== 65 || b64u.dec(auth).length !== 16) fail(400, 'invalid', 'Clés d\'abonnement invalides');
  // un téléphone = un abonnement : s'il change de compte, l'abonnement suit le compte connecté
  await run(env, `INSERT INTO push_subs (user_id, endpoint, p256dh, auth, ua, created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, fails = 0`,
  ctx.user.id, endpoint, p256dh, auth, str(b.ua, { max: 160 }) || null, now());
  const n = (await one(env, 'SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', ctx.user.id)).n;
  return json200({ ok: true, devices: n });
}
async function unsubscribe(ctx, env) {
  await ensure(env);
  await run(env, 'DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', String(ctx.body?.endpoint || ''), ctx.user.id);
  return json200({ ok: true });
}
async function pushTest(ctx, env) {
  const n = await sendPush(env, [ctx.user.id], { title: '🔔 Alefa.mg', body: 'Les notifications marchent : vous les recevrez même site fermé.', tag: 'test' });
  return json200({ ok: true, sent: n });
}
export function registerPushRoutes(route) {
  route('GET', '/api/push/key', ['client', 'courier', 'admin'], pushKey);
  route('POST', '/api/push/subscribe', ['client', 'courier', 'admin'], subscribe);
  route('POST', '/api/push/unsubscribe', ['client', 'courier', 'admin'], unsubscribe);
  route('POST', '/api/push/test', ['client', 'courier', 'admin'], pushTest);
}
