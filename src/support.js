// Service client : chaque client ou livreur a un fil de discussion avec le centre (les admins répondent).
import { json, fail, str, int, now } from './lib.js';
import { one, all, run, notify } from './worker.js';

const msgOut = (m) => ({ id: m.id, body: m.body, at: m.at, from_centre: !!m.from_centre, author: m.author_name || null, shipment: m.ref || null });
const MSG_SQL = `SELECT m.*, a.name AS author_name, s.ref FROM support_messages m JOIN users a ON a.id = m.author_id LEFT JOIN shipments s ON s.id = m.shipment_id`;

async function shipmentFor(env, u, ref) {
  if (!ref) return null;
  const s = await one(env, 'SELECT id, sender_id, courier_id, pickup_courier_id, delivery_courier_id, recipient_phone FROM shipments WHERE ref = ?', String(ref).trim().toUpperCase());
  if (!s) fail(404, 'not_found', 'Colis introuvable');
  if (![s.sender_id, s.courier_id, s.pickup_courier_id, s.delivery_courier_id].includes(u.id) && s.recipient_phone !== u.phone) fail(403, 'forbidden', 'Ce colis ne vous concerne pas');
  return s.id;
}

async function myThread(ctx, env) {
  const rows = await all(env, `${MSG_SQL} WHERE m.user_id = ? ORDER BY m.id DESC LIMIT 100`, ctx.user.id);
  await run(env, 'UPDATE support_messages SET read_user = 1 WHERE user_id = ? AND from_centre = 1 AND read_user = 0', ctx.user.id);
  return json({ messages: rows.reverse().map(msgOut) });
}
async function postMine(ctx, env) {
  const u = ctx.user;
  const body = str(ctx.body.body, { min: 1, max: 1000, name: 'Message' });
  const sid = await shipmentFor(env, u, ctx.body.ref);
  const recent = await one(env, 'SELECT COUNT(*) AS n FROM support_messages WHERE author_id = ? AND at > ?', u.id, now() - 60e3);
  if (recent.n >= 10) fail(429, 'rate_limited', 'Trop de messages, patientez une minute');
  await run(env, 'INSERT INTO support_messages (user_id, author_id, from_centre, body, shipment_id, at, read_user) VALUES (?,?,?,?,?,?,1)', u.id, u.id, 0, body, sid, now());
  const admins = await all(env, "SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  await notify(env, admins.map((a) => a.id), `support:${u.id}`, `💬 ${u.role === 'courier' ? 'Livreur' : 'Client'} ${u.name}`, body.slice(0, 140));
  return json({ ok: true }, 201);
}

async function threads(ctx, env) {
  const rows = await all(env, `SELECT m.user_id, u.name, u.phone, u.role, MAX(m.id) AS last_id, MAX(m.at) AS last_at,
      SUM(CASE WHEN m.from_centre = 0 AND m.read_centre = 0 THEN 1 ELSE 0 END) AS unread
    FROM support_messages m JOIN users u ON u.id = m.user_id GROUP BY m.user_id ORDER BY last_at DESC LIMIT 200`);
  const last = rows.length ? await all(env, `SELECT id, body, from_centre FROM support_messages WHERE id IN (${rows.map(() => '?').join(',')})`, ...rows.map((r) => r.last_id)) : [];
  return json({ threads: rows.map((r) => ({ user_id: r.user_id, name: r.name, phone: r.phone, role: r.role, last_at: r.last_at, unread: r.unread,
    last: last.find((x) => x.id === r.last_id)?.body ?? '', last_from_centre: !!last.find((x) => x.id === r.last_id)?.from_centre })) });
}
async function thread(ctx, env) {
  const uid = int(ctx.params.id);
  const u = await one(env, 'SELECT id, name, phone, role FROM users WHERE id = ?', uid);
  if (!u) fail(404, 'not_found', 'Utilisateur introuvable');
  const rows = await all(env, `${MSG_SQL} WHERE m.user_id = ? ORDER BY m.id DESC LIMIT 200`, uid);
  await run(env, 'UPDATE support_messages SET read_centre = 1 WHERE user_id = ? AND from_centre = 0 AND read_centre = 0', uid);
  return json({ user: u, messages: rows.reverse().map(msgOut) });
}
async function reply(ctx, env) {
  const uid = int(ctx.params.id);
  const u = await one(env, "SELECT id FROM users WHERE id = ? AND role IN ('client','courier')", uid);
  if (!u) fail(404, 'not_found', 'Utilisateur introuvable');
  const body = str(ctx.body.body, { min: 1, max: 1000, name: 'Message' });
  await run(env, 'INSERT INTO support_messages (user_id, author_id, from_centre, body, at, read_centre) VALUES (?,?,1,?,?,1)', uid, ctx.user.id, body, now());
  await run(env, 'UPDATE support_messages SET read_centre = 1 WHERE user_id = ? AND from_centre = 0', uid);
  await notify(env, [uid], 'support', '💬 Service client Alefa', body.slice(0, 140));
  return json({ ok: true }, 201);
}
async function unreadCount(ctx, env) {
  const r = await one(env, 'SELECT COUNT(DISTINCT user_id) AS n FROM support_messages WHERE from_centre = 0 AND read_centre = 0');
  return json({ unread_threads: r.n });
}

export function registerSupportRoutes(route) {
  route('GET', '/api/support', ['client', 'courier'], myThread);
  route('POST', '/api/support', ['client', 'courier'], postMine);
  route('GET', '/api/admin/support', ['admin'], threads);
  route('GET', '/api/admin/support/unread', ['admin'], unreadCount);
  route('GET', '/api/admin/support/:id', ['admin'], thread);
  route('POST', '/api/admin/support/:id', ['admin'], reply);
}
