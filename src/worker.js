// Alefa Livraison — API (Cloudflare Worker + D1).
// Clients, livreurs (vélo) et administrateurs ; négociation de prix à la inDrive ; suivi GPS par actualisation 5 s.
import {
  HttpError, fail, json, withSecurityHeaders, readJson, str, int, coord, normalizePhone,
  randomHex, randomPin, hashPassword, safeEqual, haversineKm, bbox, suggestPrice, csv, fmtDate, now,
} from './lib.js';
import { registerShipmentRoutes, authenticateMerchant, onCourierMove, courierOpenShipments, liveShipments, liveFeed } from './shipments.js';

const SESSION_DAYS = 30;
// Sans position GPS reçue depuis 2 minutes, le livreur n'est plus proposé aux clients ni notifié.
const GPS_FRESH_MS = 2 * 60e3;
const ACTIVE = ['assigned', 'picked_up'];
const PAYMENT_METHODS = ['cash', 'mvola', 'orange_money', 'airtel_money'];
const TYPES = ['colis', 'documents', 'marchandises', 'repas', 'autre'];

// ---------------------------------------------------------------- base
export const q = (env, sql, ...params) => env.DB.prepare(sql).bind(...params);
export const one = (env, sql, ...p) => q(env, sql, ...p).first();
export const all = async (env, sql, ...p) => (await q(env, sql, ...p).all()).results || [];
export const run = (env, sql, ...p) => q(env, sql, ...p).run();

export async function settings(env) {
  const rows = await all(env, 'SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function audit(env, ctx, action, detail) {
  await run(env, 'INSERT INTO audit (user_id, action, detail, ip, at) VALUES (?,?,?,?,?)',
    ctx.user?.id ?? null, action, detail ? JSON.stringify(detail).slice(0, 1000) : null, ctx.ip, now());
}

export async function notify(env, userIds, kind, title, body, deliveryId = null) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const t = now();
  await env.DB.batch(ids.map((id) =>
    q(env, 'INSERT INTO notifications (user_id, kind, title, body, delivery_id, at) VALUES (?,?,?,?,?,?)', id, kind, title, body ?? null, deliveryId, t)));
}

export async function alertAdmins(env, kind, body, deliveryId = null, userId = null, lat = null, lng = null) {
  await run(env, 'INSERT INTO complaints (delivery_id, user_id, kind, body, lat, lng, at) VALUES (?,?,?,?,?,?,?)',
    deliveryId, userId, kind, body, lat, lng, now());
  const admins = await all(env, "SELECT id FROM users WHERE role='admin' AND status='active'");
  await notify(env, admins.map((a) => a.id), kind, kind === 'sos' ? '🚨 SOS' : '⚠️ Alerte', body, deliveryId);
}

// ---------------------------------------------------------------- auth
async function authenticate(req, env) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await one(env, `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`, token);
  if (!row || row.expires_at < now()) return null;
  if (row.status === 'suspended' || row.status === 'rejected') return null;
  row.token = token;
  return row;
}

const publicUser = (u) => ({ id: u.id, phone: u.phone, name: u.name, role: u.role, status: u.status, lang: u.lang, is_business: !!u.is_business, company: u.company });

async function createSession(env, user) {
  const token = randomHex(32);
  await run(env, 'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?,?,?,?)', token, user.id, now() + SESSION_DAYS * 864e5, now());
  return token;
}

export const iterations = (env) => Number(env.PBKDF2_ITER || 10000);

async function register(ctx, env) {
  const b = ctx.body;
  if (b.role === 'courier') fail(403, 'courier_by_admin', 'Les comptes livreurs sont créés par l\'administration Alefa. Contactez-nous.');
  const role = 'client';
  const phone = normalizePhone(b.phone);
  const name = str(b.name, { min: 2, max: 80, name: 'Nom' });
  const password = str(b.password, { min: 6, max: 128, name: 'Mot de passe (6 caractères min.)' });
  if (await one(env, 'SELECT id FROM users WHERE phone = ?', phone)) fail(409, 'phone_taken', 'Ce numéro est déjà inscrit');
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt, iterations(env));
  const status = 'active';
  const res = await run(env, `INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, lang, is_business, company, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, phone, name, role, hash, salt, status, b.lang === 'mg' ? 'mg' : 'fr',
    b.is_business ? 1 : 0, b.is_business ? str(b.company, { max: 120 }) : null, now());
  const id = res.meta.last_row_id;
  const user = await one(env, 'SELECT * FROM users WHERE id = ?', id);
  ctx.user = user;
  await audit(env, ctx, 'register', { role });
  return json({ token: await createSession(env, user), user: publicUser(user) }, 201);
}

async function login(ctx, env) {
  const phone = normalizePhone(ctx.body.phone);
  const password = str(ctx.body.password, { min: 1, max: 128, name: 'Mot de passe' });
  const user = await one(env, 'SELECT * FROM users WHERE phone = ?', phone);
  if (!user) fail(401, 'bad_credentials', 'Numéro ou mot de passe incorrect');
  if (user.locked_until && user.locked_until > now()) fail(429, 'locked', 'Trop de tentatives. Réessayez dans 15 minutes.');
  const hash = await hashPassword(password, user.pass_salt, iterations(env));
  if (!safeEqual(hash, user.pass_hash)) {
    const n = user.failed_logins + 1;
    await run(env, 'UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', n >= 5 ? 0 : n, n >= 5 ? now() + 15 * 60e3 : null, user.id);
    fail(401, 'bad_credentials', 'Numéro ou mot de passe incorrect');
  }
  if (user.status === 'suspended') fail(403, 'suspended', 'Compte suspendu. Contactez le support.');
  if (user.status === 'rejected') fail(403, 'rejected', 'Inscription refusée. Contactez le support.');
  await run(env, 'UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id);
  ctx.user = user;
  await audit(env, ctx, 'login');
  return json({ token: await createSession(env, user), user: publicUser(user) });
}

async function me(ctx, env) {
  const u = ctx.user;
  const out = { user: publicUser(u) };
  if (u.role === 'courier') { out.courier = await courierProfile(env, u.id); out.axe = await courierAxeState(env, u.id); }
  return json(out);
}

async function courierProfile(env, id) {
  const c = await one(env, 'SELECT * FROM couriers WHERE user_id = ?', id);
  if (!c) return null;
  return { ...c, rating: c.rating_count ? Math.round((c.rating_sum / c.rating_count) * 10) / 10 : null };
}

async function updateMe(ctx, env) {
  const b = ctx.body, u = ctx.user;
  if (b.lang) await run(env, 'UPDATE users SET lang = ? WHERE id = ?', b.lang === 'mg' ? 'mg' : 'fr', u.id);
  if (b.name) await run(env, 'UPDATE users SET name = ? WHERE id = ?', str(b.name, { min: 2, max: 80, name: 'Nom' }), u.id);
  if (b.new_password) {
    const cur = await hashPassword(str(b.password, { min: 1, name: 'Mot de passe actuel' }), u.pass_salt, iterations(env));
    if (!safeEqual(cur, u.pass_hash)) fail(403, 'bad_credentials', 'Mot de passe actuel incorrect');
    const salt = randomHex(16);
    await run(env, 'UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?',
      await hashPassword(str(b.new_password, { min: 6, max: 128, name: 'Nouveau mot de passe (6 caractères min.)' }), salt, iterations(env)), salt, u.id);
    await run(env, 'DELETE FROM sessions WHERE user_id = ? AND token != ?', u.id, u.token);
    await audit(env, ctx, 'password_change');
  }
  return json({ ok: true });
}

async function logout(ctx, env) {
  await run(env, 'DELETE FROM sessions WHERE token = ?', ctx.user.token);
  return json({ ok: true });
}

// ---------------------------------------------------------------- public config & devis
async function publicConfig(ctx, env) {
  const s = await settings(env);
  const zones = await all(env, 'SELECT id, name, center_lat, center_lng, radius_km FROM zones WHERE active = 1');
  return json({
    platform_name: s.platform_name, support_phone: s.support_phone, min_price: Number(s.min_price),
    commission_mode: s.commission_mode, payment_numbers: { mvola: s.mvola_number, orange_money: s.orange_money_number, airtel_money: s.airtel_money_number },
    zones,
  });
}

async function findZone(env, lat, lng) {
  const zones = await all(env, 'SELECT * FROM zones WHERE active = 1');
  return zones.find((z) => haversineKm(lat, lng, z.center_lat, z.center_lng) <= z.radius_km) || null;
}

async function quote(ctx, env) {
  const b = ctx.body;
  const p = coord(b.pickup_lat, b.pickup_lng), d = coord(b.drop_lat, b.drop_lng);
  const s = await settings(env);
  const qv = suggestPrice(s, p, d);
  const zone = await findZone(env, p[0], p[1]);
  const nearby = await nearbyCouriers(env, p[0], p[1], Number(s.request_radius_km));
  return json({ ...qv, min_price: Number(s.min_price), zone: zone ? zone.name : null, couriers_nearby: nearby.length });
}

async function nearbyCouriers(env, lat, lng, km) {
  const [a, b, c, d] = bbox(lat, lng, km);
  const rows = await all(env, `SELECT c.user_id, c.lat, c.lng, c.rating_sum, c.rating_count FROM couriers c JOIN users u ON u.id = c.user_id
    WHERE c.available = 1 AND u.status = 'active' AND c.last_seen > ? AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ?`,
    now() - GPS_FRESH_MS, a, b, c, d);
  return rows.map((r) => ({ ...r, distance_km: haversineKm(lat, lng, r.lat, r.lng) })).filter((r) => r.distance_km <= km);
}

// ---------------------------------------------------------------- axes (secteurs) et planning
export const mgNow = () => { const d = new Date(now() + 3 * 3600e3); return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), day: ((d.getUTCDay() + 6) % 7) + 1 }; };
export const inAxe = (a, lat, lng) => haversineKm(lat, lng, a.center_lat, a.center_lng) <= a.radius_km;
export const SLOT_SQL = `SELECT ca.*, a.name, a.center_lat, a.center_lng, a.radius_km, a.color, a.active FROM courier_axes ca JOIN axes a ON a.id = ca.axe_id`;

export function axeState(slots) {
  if (!slots.length) return { free: true, slots: [] };
  const { min, day } = mgNow();
  const today = slots.filter((x) => String(x.days).includes(String(day)) && x.active).sort((a, b) => a.start_min - b.start_min);
  const pick = (x) => x && { id: x.axe_id, name: x.name, center_lat: x.center_lat, center_lng: x.center_lng, radius_km: x.radius_km, color: x.color, start_min: x.start_min, end_min: x.end_min };
  return { free: false, current: pick(today.find((x) => x.start_min <= min && min < x.end_min)), next: pick(today.find((x) => x.start_min > min)), today: today.map(pick) };
}
export async function courierAxeState(env, courierId) {
  return axeState(await all(env, `${SLOT_SQL} WHERE ca.courier_id = ? ORDER BY ca.start_min`, courierId));
}
// Le livreur peut-il servir ce point de départ ? Sans planning : tout le rayon. Avec planning : uniquement l'axe du créneau en cours.
const axeAllows = (st, lat, lng) => st.free || (st.current && inAxe(st.current, lat, lng));

// Livreurs à prévenir pour une demande : disponibles, et (sans axe & dans le rayon) ou (axe du créneau contenant le départ).
async function eligibleCouriers(env, lat, lng, km) {
  const rows = await all(env, `SELECT c.user_id, c.lat, c.lng FROM couriers c JOIN users u ON u.id = c.user_id
    WHERE c.available = 1 AND u.status = 'active' AND c.last_seen > ? AND c.lat IS NOT NULL`, now() - GPS_FRESH_MS);
  if (!rows.length) return [];
  const slots = await all(env, `${SLOT_SQL} WHERE ca.courier_id IN (${rows.map(() => '?').join(',')})`, ...rows.map((r) => r.user_id));
  return rows.filter((r) => {
    const st = axeState(slots.filter((x) => x.courier_id === r.user_id));
    return st.free ? haversineKm(lat, lng, r.lat, r.lng) <= km : axeAllows(st, lat, lng);
  });
}

async function clientNearby(ctx, env) {
  const [lat, lng] = coord(ctx.url.searchParams.get('lat'), ctx.url.searchParams.get('lng'));
  const s = await settings(env);
  const list = await nearbyCouriers(env, lat, lng, Math.max(Number(s.request_radius_km), 5));
  const names = list.length ? await all(env, `SELECT id, name FROM users WHERE id IN (${list.map(() => '?').join(',')})`, ...list.map((c) => c.user_id)) : [];
  // Positions réelles, actualisées toutes les 5 s (prénom seulement).
  return json({ couriers: list.slice(0, 80).map((c) => ({ id: c.user_id, name: (names.find((n) => n.id === c.user_id)?.name || '').split(' ')[0], lat: c.lat, lng: c.lng,
    rating: c.rating_count ? Math.round((c.rating_sum / c.rating_count) * 10) / 10 : null, distance_km: Math.round(c.distance_km * 100) / 100 })) });
}

// ---------------------------------------------------------------- livraisons (client)
async function createDelivery(ctx, env) {
  const b = ctx.body, u = ctx.user;
  const s = await settings(env);
  const p = coord(b.pickup_lat, b.pickup_lng), d = coord(b.drop_lat, b.drop_lng);
  const zone = await findZone(env, p[0], p[1]);
  if (!zone) fail(400, 'out_of_zone', 'Le point de récupération est hors de la zone de service');
  if (!(await findZone(env, d[0], d[1]))) fail(400, 'out_of_zone', 'La destination est hors de la zone de service');
  const openCount = await one(env, "SELECT COUNT(*) AS n FROM deliveries WHERE client_id = ? AND status IN ('open','assigned','picked_up')", u.id);
  if (openCount.n >= Number(s.max_open_requests) && !u.is_business) fail(429, 'too_many', `Maximum ${s.max_open_requests} demandes en cours`);
  const qv = suggestPrice(s, p, d);
  if (qv.distance_km < 0.1) fail(400, 'too_close', 'Départ et arrivée sont trop proches');
  let price = int(b.proposed_price, { min: Number(s.min_price), max: 1_000_000, name: `Prix (minimum ${s.min_price} Ar)` });
  const type = TYPES.includes(b.type) ? b.type : 'colis';
  const pay = PAYMENT_METHODS.includes(b.payment_method) ? b.payment_method : 'cash';
  let scheduled = null;
  if (b.scheduled_at) {
    scheduled = int(b.scheduled_at, { min: now() - 60e3, max: now() + 30 * 864e5, name: 'Date programmée' });
    if (scheduled < now() + 10 * 60e3) scheduled = null;
  }
  let discount = 0, promo = null;
  if (b.promo_code) {
    promo = str(b.promo_code, { max: 30 }).toUpperCase();
    const pr = await one(env, 'SELECT * FROM promos WHERE code = ? AND active = 1', promo);
    if (!pr || (pr.expires_at && pr.expires_at < now()) || (pr.max_uses && pr.uses >= pr.max_uses)) fail(400, 'bad_promo', 'Code promo invalide ou expiré');
    discount = Math.round((price * pr.percent) / 100);
    if (pr.max_amount) discount = Math.min(discount, pr.max_amount);
  }
  const res = await run(env, `INSERT INTO deliveries (client_id, zone_id, type, description, pickup_lat, pickup_lng, pickup_addr, drop_lat, drop_lng, drop_addr,
      recipient_name, recipient_phone, distance_km, suggested_price, proposed_price, discount, promo_code, payment_method, pin, scheduled_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    u.id, zone.id, type, str(b.description, { max: 300 }), p[0], p[1], str(b.pickup_addr, { max: 200 }), d[0], d[1], str(b.drop_addr, { max: 200 }),
    str(b.recipient_name, { max: 80 }), b.recipient_phone ? normalizePhone(b.recipient_phone) : null,
    qv.distance_km, qv.suggested_price, price, discount, promo, pay, randomPin(), scheduled, now());
  const id = res.meta.last_row_id;
  if (promo) await run(env, 'UPDATE promos SET uses = uses + 1 WHERE code = ?', promo);
  const near = await eligibleCouriers(env, p[0], p[1], Number(s.request_radius_km));
  await notify(env, near.map((c) => c.user_id), 'new_request', 'Nouvelle demande de livraison',
    `${price.toLocaleString('fr-FR')} Ar · ${qv.distance_km} km · ${b.pickup_addr || ''}`.trim(), id);
  await audit(env, ctx, 'delivery_create', { id, price });
  return json({ id, ...qv, couriers_notified: near.length }, 201);
}

async function loadDelivery(env, id) {
  const d = await one(env, 'SELECT * FROM deliveries WHERE id = ?', id);
  if (!d) fail(404, 'not_found', 'Livraison introuvable');
  return d;
}

function canSee(u, d) {
  return u.role === 'admin' || d.client_id === u.id || d.courier_id === u.id || (u.role === 'courier' && d.status === 'open');
}

async function getDelivery(ctx, env) {
  const u = ctx.user;
  const d = await loadDelivery(env, ctx.params.id);
  if (!canSee(u, d)) fail(403, 'forbidden', 'Accès refusé');
  await expireIfStale(env, d);
  const out = { ...d };
  if (u.role === 'courier' && d.client_id !== u.id) delete out.pin; // le PIN reste chez le client
  const client = await one(env, 'SELECT id, name, phone FROM users WHERE id = ?', d.client_id);
  out.client = { id: client.id, name: client.name, phone: d.courier_id === u.id || u.role === 'admin' ? client.phone : null };
  if (d.courier_id) {
    const c = await one(env, `SELECT u.id, u.name, u.phone, c.lat, c.lng, c.last_seen, c.rating_sum, c.rating_count, c.vehicle
      FROM users u JOIN couriers c ON c.user_id = u.id WHERE u.id = ?`, d.courier_id);
    out.courier = { id: c.id, name: c.name, phone: c.phone, vehicle: c.vehicle,
      rating: c.rating_count ? Math.round((c.rating_sum / c.rating_count) * 10) / 10 : null };
    if (ACTIVE.includes(d.status) || u.role === 'admin') Object.assign(out.courier, { lat: c.lat, lng: c.lng, last_seen: c.last_seen });
  }
  if (u.role === 'admin' || d.client_id === u.id) {
    out.offers = await all(env, `SELECT o.*, u.name AS courier_name, c.rating_sum, c.rating_count, c.lat, c.lng,
        (SELECT COUNT(*) FROM deliveries x WHERE x.courier_id = o.courier_id AND x.status = 'delivered') AS deliveries_done
      FROM offers o JOIN users u ON u.id = o.courier_id JOIN couriers c ON c.user_id = o.courier_id
      WHERE o.delivery_id = ? AND o.status IN ('pending','accepted') ORDER BY o.price ASC, o.created_at ASC`, d.id);
    out.offers = out.offers.map((o) => ({ id: o.id, courier_id: o.courier_id, courier_name: o.courier_name, price: o.price, status: o.status,
      distance_km: o.distance_km, eta_min: o.eta_min, deliveries_done: o.deliveries_done,
      rating: o.rating_count ? Math.round((o.rating_sum / o.rating_count) * 10) / 10 : null,
      lat: Math.round(o.lat * 1000) / 1000, lng: Math.round(o.lng * 1000) / 1000, created_at: o.created_at }));
  } else if (u.role === 'courier') {
    out.my_offer = await one(env, 'SELECT * FROM offers WHERE delivery_id = ? AND courier_id = ?', d.id, u.id);
  }
  if (d.client_id === u.id || d.courier_id === u.id || u.role === 'admin') {
    const since = Number(ctx.url.searchParams.get('msg_after') || 0);
    out.messages = await all(env, 'SELECT id, sender_id, body, at FROM messages WHERE delivery_id = ? AND id > ? ORDER BY id LIMIT 200', d.id, since);
  }
  if (u.role === 'admin') out.track = await all(env, 'SELECT lat, lng, at FROM positions WHERE delivery_id = ? ORDER BY at LIMIT 2000', d.id);
  return json(out);
}

async function expireIfStale(env, d) {
  if (d.status !== 'open' || d.scheduled_at) return;
  const s = await settings(env);
  if (d.created_at < now() - Number(s.request_ttl_min) * 60e3) {
    await run(env, "UPDATE deliveries SET status = 'expired' WHERE id = ? AND status = 'open'", d.id);
    d.status = 'expired';
  }
}

async function myDeliveries(ctx, env) {
  const u = ctx.user;
  const col = u.role === 'courier' ? 'courier_id' : 'client_id';
  const rows = await all(env, `SELECT d.*, cu.name AS courier_name, cl.name AS client_name FROM deliveries d
    LEFT JOIN users cu ON cu.id = d.courier_id LEFT JOIN users cl ON cl.id = d.client_id
    WHERE d.${col} = ? ORDER BY d.created_at DESC LIMIT 100`, u.id);
  for (const r of rows) if (u.role === 'courier') delete r.pin;
  return json({ deliveries: rows });
}

async function raisePrice(ctx, env) {
  const d = await loadDelivery(env, ctx.params.id);
  if (d.client_id !== ctx.user.id) fail(403, 'forbidden', 'Accès refusé');
  if (d.status !== 'open') fail(409, 'not_open', 'La demande n\'est plus ouverte');
  const price = int(ctx.body.price, { min: d.proposed_price + 1, max: 1_000_000, name: 'Nouveau prix (doit être supérieur)' });
  await run(env, 'UPDATE deliveries SET proposed_price = ? WHERE id = ?', price, d.id);
  const s = await settings(env);
  const near = await eligibleCouriers(env, d.pickup_lat, d.pickup_lng, Number(s.request_radius_km));
  await notify(env, near.map((c) => c.user_id), 'price_raised', 'Prix augmenté', `${price.toLocaleString('fr-FR')} Ar · ${d.pickup_addr || ''}`, d.id);
  return json({ ok: true, proposed_price: price });
}

async function acceptOffer(ctx, env) {
  const d = await loadDelivery(env, ctx.params.id);
  if (d.client_id !== ctx.user.id) fail(403, 'forbidden', 'Accès refusé');
  const offer = await one(env, "SELECT * FROM offers WHERE id = ? AND delivery_id = ? AND status = 'pending'", int(ctx.body.offer_id), d.id);
  if (!offer) fail(404, 'not_found', 'Offre introuvable ou retirée');
  const busy = await one(env, "SELECT id FROM deliveries WHERE courier_id = ? AND status IN ('assigned','picked_up')", offer.courier_id);
  if (busy) fail(409, 'courier_busy', 'Ce livreur vient d\'accepter une autre course');
  const finalPrice = Math.max(0, offer.price - d.discount);
  const res = await run(env, `UPDATE deliveries SET courier_id = ?, final_price = ?, status = 'assigned', assigned_at = ? WHERE id = ? AND status = 'open'`,
    offer.courier_id, finalPrice, now(), d.id);
  if (!res.meta.changes) fail(409, 'not_open', 'La demande n\'est plus ouverte');
  await env.DB.batch([
    q(env, "UPDATE offers SET status = 'accepted' WHERE id = ?", offer.id),
    q(env, "UPDATE offers SET status = 'rejected' WHERE delivery_id = ? AND id != ? AND status = 'pending'", d.id, offer.id),
  ]);
  const losers = await all(env, "SELECT courier_id FROM offers WHERE delivery_id = ? AND status = 'rejected'", d.id);
  await notify(env, [offer.courier_id], 'offer_accepted', '✅ Offre acceptée !', `Allez récupérer le colis : ${d.pickup_addr || ''}`, d.id);
  await notify(env, losers.map((l) => l.courier_id), 'offer_rejected', 'Course attribuée à un autre livreur', null, d.id);
  await audit(env, ctx, 'offer_accept', { delivery: d.id, offer: offer.id, price: offer.price });
  return json({ ok: true, final_price: finalPrice });
}

async function cancelDelivery(ctx, env) {
  const u = ctx.user;
  const d = await loadDelivery(env, ctx.params.id);
  const isClient = d.client_id === u.id, isCourier = d.courier_id === u.id, isAdmin = u.role === 'admin';
  if (!isClient && !isCourier && !isAdmin) fail(403, 'forbidden', 'Accès refusé');
  if (!['open', 'assigned'].includes(d.status) && !(isAdmin && d.status === 'picked_up')) fail(409, 'cannot_cancel', 'Cette livraison ne peut plus être annulée');
  const reason = str(ctx.body.reason, { max: 300 });
  const by = isAdmin ? 'admin' : isClient ? 'client' : 'courier';
  if (isCourier && !isAdmin) {
    // Le livreur se désiste : la demande redevient ouverte pour les autres.
    await env.DB.batch([
      q(env, "UPDATE deliveries SET status = 'open', courier_id = NULL, final_price = NULL, assigned_at = NULL, created_at = ? WHERE id = ?", now(), d.id),
      q(env, "UPDATE offers SET status = 'withdrawn' WHERE delivery_id = ? AND courier_id = ?", d.id, u.id),
      q(env, "UPDATE offers SET status = 'pending' WHERE delivery_id = ? AND status = 'rejected'", d.id),
      q(env, 'UPDATE users SET cancel_count = cancel_count + 1 WHERE id = ?', u.id),
    ]);
    await notify(env, [d.client_id], 'courier_cancelled', 'Le livreur s\'est désisté', 'Votre demande est de nouveau visible par les livreurs.', d.id);
  } else {
    await run(env, "UPDATE deliveries SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?", now(), by, reason, d.id);
    if (isClient) await run(env, 'UPDATE users SET cancel_count = cancel_count + 1 WHERE id = ?', u.id);
    await notify(env, [d.courier_id, isAdmin ? d.client_id : null], 'cancelled', 'Livraison annulée', reason || null, d.id);
    const pend = await all(env, "SELECT courier_id FROM offers WHERE delivery_id = ? AND status = 'pending'", d.id);
    await notify(env, pend.map((p) => p.courier_id), 'cancelled', 'Demande annulée par le client', null, d.id);
  }
  // Détection d'abus : annulations répétées en 24 h.
  const recent = await one(env, `SELECT COUNT(*) AS n FROM audit WHERE user_id = ? AND action = 'delivery_cancel' AND at > ?`, u.id, now() - 864e5);
  if (!isAdmin && recent.n >= 4) await alertAdmins(env, 'alert', `Annulations répétées (${recent.n + 1} en 24 h) : ${u.name} ${u.phone}`, d.id, u.id);
  await audit(env, ctx, 'delivery_cancel', { id: d.id, by, reason });
  return json({ ok: true });
}

async function rateDelivery(ctx, env) {
  const d = await loadDelivery(env, ctx.params.id);
  if (d.client_id !== ctx.user.id) fail(403, 'forbidden', 'Accès refusé');
  if (d.status !== 'delivered') fail(409, 'not_delivered', 'La livraison n\'est pas terminée');
  if (d.rating) fail(409, 'already_rated', 'Déjà évaluée');
  const r = int(ctx.body.rating, { min: 1, max: 5, name: 'Note' });
  await env.DB.batch([
    q(env, 'UPDATE deliveries SET rating = ?, rating_comment = ? WHERE id = ?', r, str(ctx.body.comment, { max: 300 }), d.id),
    q(env, 'UPDATE couriers SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?', r, d.courier_id),
  ]);
  if (r <= 2) await alertAdmins(env, 'alert', `Note ${r}/5 sur la livraison #${d.id} : ${ctx.body.comment || ''}`, d.id, ctx.user.id);
  return json({ ok: true });
}

async function postMessage(ctx, env) {
  const u = ctx.user;
  const d = await loadDelivery(env, ctx.params.id);
  if (d.client_id !== u.id && d.courier_id !== u.id && u.role !== 'admin') fail(403, 'forbidden', 'Accès refusé');
  if (!d.courier_id) fail(409, 'no_courier', 'Aucun livreur attribué');
  const body = str(ctx.body.body, { min: 1, max: 500, name: 'Message' });
  const res = await run(env, 'INSERT INTO messages (delivery_id, sender_id, body, at) VALUES (?,?,?,?)', d.id, u.id, body, now());
  const to = u.id === d.client_id ? d.courier_id : d.client_id;
  await notify(env, [to], 'message', `Message de ${u.name}`, body.slice(0, 120), d.id);
  return json({ id: res.meta.last_row_id }, 201);
}

// ---------------------------------------------------------------- favoris
const listFavorites = async (ctx, env) => json({ favorites: await all(env, 'SELECT * FROM favorites WHERE user_id = ? ORDER BY id', ctx.user.id) });
async function addFavorite(ctx, env) {
  const [lat, lng] = coord(ctx.body.lat, ctx.body.lng);
  const n = await one(env, 'SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?', ctx.user.id);
  if (n.n >= 20) fail(400, 'limit', '20 adresses favorites maximum');
  await run(env, 'INSERT INTO favorites (user_id, label, addr, lat, lng) VALUES (?,?,?,?,?)', ctx.user.id,
    str(ctx.body.label, { min: 1, max: 40, name: 'Nom' }), str(ctx.body.addr, { max: 200 }), lat, lng);
  return json({ ok: true }, 201);
}
async function deleteFavorite(ctx, env) {
  await run(env, 'DELETE FROM favorites WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id);
  return json({ ok: true });
}

// ---------------------------------------------------------------- livreur
async function courierGuard(env, u) {
  if (u.status !== 'active') fail(403, 'not_validated', 'Votre compte est en attente de validation par l\'administrateur');
  return one(env, 'SELECT * FROM couriers WHERE user_id = ?', u.id);
}

async function setAvailability(ctx, env) {
  await courierGuard(env, ctx.user);
  const avail = ctx.body.available ? 1 : 0;
  await run(env, 'UPDATE couriers SET available = ? WHERE user_id = ?', avail, ctx.user.id);
  await audit(env, ctx, avail ? 'courier_online' : 'courier_offline');
  return json({ ok: true, available: !!avail });
}

async function postLocation(ctx, env) {
  const u = ctx.user;
  const c = await courierGuard(env, u);
  const [lat, lng] = coord(ctx.body.lat, ctx.body.lng);
  const t = now();
  const active = await one(env, "SELECT id FROM deliveries WHERE courier_id = ? AND status IN ('assigned','picked_up')", u.id);
  const parcels = await courierOpenShipments(env, u.id);
  // Suivi pendant le service : disponible, course express en cours, ou colis en cours (parti du centre / récupéré).
  if (!c.available && !active && !parcels) return json({ ok: true, ignored: 'offline' });
  if (c.last_seen && t - c.last_seen < 2500) return json({ ok: true, throttled: true });
  if (c.lat != null && c.last_seen) {
    const km = haversineKm(c.lat, c.lng, lat, lng), h = (t - c.last_seen) / 3600e3;
    if (h > 0 && km > 0.3 && km / h > 70) {
      await alertAdmins(env, 'alert', `Saut GPS suspect : ${u.name} (${Math.round(km / h)} km/h)`, active?.id ?? null, u.id, lat, lng);
    }
  }
  await env.DB.batch([
    q(env, 'UPDATE couriers SET lat = ?, lng = ?, last_seen = ? WHERE user_id = ?', lat, lng, t, u.id),
    q(env, 'INSERT INTO positions (courier_id, delivery_id, lat, lng, at) VALUES (?,?,?,?,?)', u.id, active?.id ?? null, lat, lng, t),
  ]);
  const stages = parcels ? await onCourierMove(env, u, lat, lng) : [];
  return json({ ok: true, active_delivery: active?.id ?? null, stages });
}

async function courierRequests(ctx, env) {
  const u = ctx.user;
  const c = await courierGuard(env, u);
  const s = await settings(env);
  const lat = Number(ctx.url.searchParams.get('lat') ?? c.lat), lng = Number(ctx.url.searchParams.get('lng') ?? c.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return json({ requests: [], need_location: true });
  const axe = await courierAxeState(env, u.id);
  if (!axe.free && !axe.current) return json({ requests: [], axe, off_schedule: true });
  const km = axe.free ? Number(s.request_radius_km) : null;
  const [a, b, cc, d] = axe.free ? bbox(lat, lng, km) : bbox(axe.current.center_lat, axe.current.center_lng, axe.current.radius_km);
  const rows = await all(env, `SELECT d.id, d.type, d.description, d.pickup_lat, d.pickup_lng, d.pickup_addr, d.drop_lat, d.drop_lng, d.drop_addr,
      d.distance_km, d.suggested_price, d.proposed_price, d.payment_method, d.scheduled_at, d.created_at, u.name AS client_name,
      o.price AS my_price, o.status AS my_status
    FROM deliveries d JOIN users u ON u.id = d.client_id
    LEFT JOIN offers o ON o.delivery_id = d.id AND o.courier_id = ?
    WHERE d.status = 'open' AND d.client_id != ? AND d.pickup_lat BETWEEN ? AND ? AND d.pickup_lng BETWEEN ? AND ?
      AND (d.scheduled_at IS NOT NULL OR d.created_at > ?)
    ORDER BY d.created_at DESC LIMIT 50`, u.id, u.id, a, b, cc, d, now() - Number(s.request_ttl_min) * 60e3);
  const list = rows.map((r) => ({ ...r, to_pickup_km: Math.round(haversineKm(lat, lng, r.pickup_lat, r.pickup_lng) * 100) / 100 }))
    .filter((r) => (axe.free ? r.to_pickup_km <= km : inAxe(axe.current, r.pickup_lat, r.pickup_lng)) && r.my_status !== 'withdrawn').sort((x, y) => x.to_pickup_km - y.to_pickup_km);
  const active = await one(env, "SELECT id FROM deliveries WHERE courier_id = ? AND status IN ('assigned','picked_up')", u.id);
  return json({ requests: list, active_delivery: active?.id ?? null, axe });
}

async function makeOffer(ctx, env) {
  const u = ctx.user;
  const c = await courierGuard(env, u);
  const s = await settings(env);
  if (!c.available) fail(409, 'offline', 'Passez en mode disponible pour faire une offre');
  if (c.balance < -Number(s.max_courier_debt)) fail(402, 'debt', `Solde négatif trop élevé (${c.balance} Ar). Réglez vos commissions auprès de l'administration.`);
  if (s.commission_mode === 'subscription' && !(c.subscription_until > now())) fail(402, 'subscription', 'Abonnement expiré. Renouvelez-le auprès de l\'administration.');
  const busy = await one(env, "SELECT id FROM deliveries WHERE courier_id = ? AND status IN ('assigned','picked_up')", u.id);
  if (busy) fail(409, 'busy', 'Terminez votre livraison en cours avant d\'accepter une autre');
  const d = await loadDelivery(env, ctx.params.id);
  await expireIfStale(env, d);
  if (d.status !== 'open') fail(409, 'not_open', 'La demande n\'est plus ouverte');
  if (d.client_id === u.id) fail(400, 'own', 'Impossible');
  const axe = await courierAxeState(env, u.id);
  if (!axeAllows(axe, d.pickup_lat, d.pickup_lng)) fail(403, 'out_of_axe', axe.current ? `Cette demande est hors de votre axe (${axe.current.name})` : 'Vous êtes hors de vos horaires de travail');
  const price = ctx.body.price == null ? d.proposed_price : int(ctx.body.price, { min: Number(s.min_price), max: 1_000_000, name: 'Prix' });
  const dist = c.lat != null ? haversineKm(c.lat, c.lng, d.pickup_lat, d.pickup_lng) : null;
  const eta = dist != null ? Math.max(2, Math.round((dist * 1.3 / Number(s.bike_speed_kmh)) * 60)) : null;
  await run(env, `INSERT INTO offers (delivery_id, courier_id, price, distance_km, eta_min, status, created_at) VALUES (?,?,?,?,?, 'pending', ?)
    ON CONFLICT(delivery_id, courier_id) DO UPDATE SET price = excluded.price, distance_km = excluded.distance_km, eta_min = excluded.eta_min,
    status = 'pending', created_at = excluded.created_at`, d.id, u.id, price, dist != null ? Math.round(dist * 100) / 100 : null, eta, now());
  const label = price === d.proposed_price ? `${u.name} accepte ${price.toLocaleString('fr-FR')} Ar` : `${u.name} propose ${price.toLocaleString('fr-FR')} Ar`;
  await notify(env, [d.client_id], 'offer', 'Nouvelle offre', `${label}${eta ? ` · arrivée ~${eta} min` : ''}`, d.id);
  return json({ ok: true, price }, 201);
}

async function withdrawOffer(ctx, env) {
  await run(env, "UPDATE offers SET status = 'withdrawn' WHERE delivery_id = ? AND courier_id = ? AND status = 'pending'", ctx.params.id, ctx.user.id);
  return json({ ok: true });
}

async function pickup(ctx, env) {
  const d = await loadDelivery(env, ctx.params.id);
  if (d.courier_id !== ctx.user.id) fail(403, 'forbidden', 'Accès refusé');
  if (d.status !== 'assigned') fail(409, 'bad_status', 'Statut incorrect');
  await run(env, "UPDATE deliveries SET status = 'picked_up', picked_at = ? WHERE id = ?", now(), d.id);
  await notify(env, [d.client_id], 'picked_up', '📦 Colis récupéré', 'Votre livreur est en route vers la destination.', d.id);
  await audit(env, ctx, 'delivery_pickup', { id: d.id });
  return json({ ok: true });
}

async function deliver(ctx, env) {
  const u = ctx.user;
  const d = await loadDelivery(env, ctx.params.id);
  if (d.courier_id !== u.id) fail(403, 'forbidden', 'Accès refusé');
  if (d.status !== 'picked_up') fail(409, 'bad_status', 'Confirmez d\'abord la récupération du colis');
  const pin = str(ctx.body.pin, { min: 4, max: 4, name: 'Code PIN' });
  if (!safeEqual(pin, d.pin)) {
    await audit(env, ctx, 'pin_fail', { id: d.id });
    const fails = await one(env, "SELECT COUNT(*) AS n FROM audit WHERE user_id = ? AND action = 'pin_fail' AND detail LIKE ? AND at > ?", u.id, `{"id":${d.id}}%`, now() - 3600e3);
    if (fails.n >= 5) await alertAdmins(env, 'alert', `PIN erroné ${fails.n} fois sur la livraison #${d.id} (${u.name})`, d.id, u.id);
    fail(400, 'bad_pin', 'Code PIN incorrect. Demandez le code au destinataire.');
  }
  const s = await settings(env);
  const t = now();
  const price = d.final_price ?? d.proposed_price;
  const commission = s.commission_mode === 'percent' ? Math.round((price * Number(s.commission_percent)) / 100) : 0;
  const cash = d.payment_method === 'cash';
  const flags = [];
  const c = await one(env, 'SELECT lat, lng FROM couriers WHERE user_id = ?', u.id);
  if (c?.lat != null && haversineKm(c.lat, c.lng, d.drop_lat, d.drop_lng) > 0.7) flags.push('loin_de_la_destination');
  const minMinutes = (d.distance_km / 35) * 60;
  if (d.picked_at && (t - d.picked_at) / 60e3 < minMinutes) flags.push('trajet_trop_rapide');
  const stmts = [
    q(env, `UPDATE deliveries SET status = 'delivered', delivered_at = ?, commission = ?, payment_status = ?, flagged = ? WHERE id = ?`,
      t, commission, cash ? 'paid' : 'pending', flags.length ? flags.join(',') : null, d.id),
  ];
  // Espèces : le livreur encaisse tout et doit la commission. Mobile Money : la plateforme encaisse et crédite le livreur (prix − commission).
  if (cash) {
    if (commission) {
      stmts.push(q(env, 'INSERT INTO transactions (courier_id, delivery_id, kind, amount, note, at) VALUES (?,?,?,?,?,?)', u.id, d.id, 'commission', -commission, `Commission ${s.commission_percent}% (espèces)`, t));
      stmts.push(q(env, 'UPDATE couriers SET balance = balance - ? WHERE user_id = ?', commission, u.id));
    }
  } else {
    stmts.push(q(env, 'INSERT INTO transactions (courier_id, delivery_id, kind, amount, note, at) VALUES (?,?,?,?,?,?)', u.id, d.id, 'earning', price - commission,
      `Gain ${d.payment_method} (commission ${commission} Ar déduite)`, t));
    stmts.push(q(env, 'UPDATE couriers SET balance = balance + ? WHERE user_id = ?', price - commission, u.id));
  }
  // Remise promo prise en charge par la plateforme : reversée au livreur.
  if (d.discount) {
    stmts.push(q(env, 'INSERT INTO transactions (courier_id, delivery_id, kind, amount, note, at) VALUES (?,?,?,?,?,?)', u.id, d.id, 'adjust', d.discount, `Remise promo ${d.promo_code} remboursée`, t));
    stmts.push(q(env, 'UPDATE couriers SET balance = balance + ? WHERE user_id = ?', d.discount, u.id));
  }
  await env.DB.batch(stmts);
  await notify(env, [d.client_id], 'delivered', '🎉 Livraison terminée', 'Merci ! Pensez à évaluer votre livreur.', d.id);
  if (flags.length) await alertAdmins(env, 'alert', `Livraison #${d.id} signalée : ${flags.join(', ')}`, d.id, u.id);
  await audit(env, ctx, 'delivery_done', { id: d.id, price, commission });
  return json({ ok: true, price, commission, payment_method: d.payment_method });
}

async function wallet(ctx, env) {
  const u = ctx.user;
  const c = await courierProfile(env, u.id);
  const tx = await all(env, 'SELECT * FROM transactions WHERE courier_id = ? ORDER BY at DESC LIMIT 100', u.id);
  const day0 = new Date(); day0.setUTCHours(-3, 0, 0, 0);
  const stats = await one(env, `SELECT
      COUNT(*) AS total, COALESCE(SUM(final_price),0) AS revenue, COALESCE(SUM(commission),0) AS commissions,
      COALESCE(SUM(CASE WHEN delivered_at > ? THEN final_price END),0) AS today,
      COALESCE(SUM(CASE WHEN delivered_at > ? THEN 1 END),0) AS today_count,
      COALESCE(SUM(CASE WHEN delivered_at > ? THEN final_price END),0) AS week
    FROM deliveries WHERE courier_id = ? AND status = 'delivered'`, day0.getTime(), day0.getTime(), now() - 7 * 864e5, u.id);
  const s = await settings(env);
  return json({ courier: c, transactions: tx, stats, commission_mode: s.commission_mode, commission_percent: Number(s.commission_percent),
    payment_numbers: { mvola: s.mvola_number, orange_money: s.orange_money_number, airtel_money: s.airtel_money_number } });
}

// ---------------------------------------------------------------- réclamations / SOS / notifications
async function createComplaint(ctx, env) {
  const b = ctx.body, u = ctx.user;
  const kind = b.kind === 'sos' ? 'sos' : 'complaint';
  let deliveryId = b.delivery_id ? int(b.delivery_id) : null;
  if (deliveryId) {
    const d = await loadDelivery(env, deliveryId);
    if (d.client_id !== u.id && d.courier_id !== u.id) fail(403, 'forbidden', 'Accès refusé');
  }
  const lat = Number.isFinite(Number(b.lat)) ? Number(b.lat) : null, lng = Number.isFinite(Number(b.lng)) ? Number(b.lng) : null;
  const body = str(b.body, { min: kind === 'sos' ? 0 : 3, max: 1000, name: 'Description' }) || 'SOS déclenché';
  await run(env, 'INSERT INTO complaints (delivery_id, user_id, kind, body, lat, lng, at) VALUES (?,?,?,?,?,?,?)', deliveryId, u.id, kind, `${u.name} (${u.phone}) : ${body}`, lat, lng, now());
  const admins = await all(env, "SELECT id FROM users WHERE role='admin' AND status='active'");
  await notify(env, admins.map((a) => a.id), kind, kind === 'sos' ? '🚨 SOS' : 'Nouvelle réclamation', `${u.name} : ${body}`.slice(0, 200), deliveryId);
  await audit(env, ctx, kind, { delivery: deliveryId });
  return json({ ok: true }, 201);
}

async function notifications(ctx, env) {
  const after = Number(ctx.url.searchParams.get('after') || 0);
  const rows = await all(env, 'SELECT * FROM notifications WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT 50', ctx.user.id, after);
  const unread = await one(env, 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', ctx.user.id);
  return json({ notifications: rows, unread: unread.n });
}
async function readNotifications(ctx, env) {
  await run(env, 'UPDATE notifications SET read = 1 WHERE user_id = ?', ctx.user.id);
  return json({ ok: true });
}

// ---------------------------------------------------------------- administration
async function adminStats(ctx, env) {
  const day0 = new Date(); day0.setUTCHours(-3, 0, 0, 0);
  const t0 = day0.getTime() > now() ? day0.getTime() - 864e5 : day0.getTime();
  const [today, active, users, couriers, complaints, money] = await Promise.all([
    one(env, `SELECT COUNT(*) AS created, SUM(status='delivered') AS delivered, SUM(status='cancelled') AS cancelled,
      COALESCE(SUM(CASE WHEN status='delivered' THEN final_price END),0) AS revenue, COALESCE(SUM(CASE WHEN status='delivered' THEN commission END),0) AS commission
      FROM deliveries WHERE created_at >= ?`, t0),
    one(env, "SELECT SUM(status='open') AS open, SUM(status='assigned') AS assigned, SUM(status='picked_up') AS picked_up FROM deliveries WHERE status IN ('open','assigned','picked_up')"),
    one(env, "SELECT SUM(role='client') AS clients, SUM(role='courier') AS couriers, SUM(role='courier' AND status='pending') AS pending FROM users"),
    one(env, 'SELECT SUM(available=1 AND last_seen > ?) AS online FROM couriers', now() - GPS_FRESH_MS),
    one(env, "SELECT COUNT(*) AS open, SUM(kind='sos') AS sos FROM complaints WHERE status='open'"),
    one(env, `SELECT COALESCE(SUM(CASE WHEN balance < 0 THEN -balance END),0) AS owed_by_couriers, COALESCE(SUM(CASE WHEN balance > 0 THEN balance END),0) AS owed_to_couriers FROM couriers`),
  ]);
  const parcels = await one(env, `SELECT SUM(status = 'pending') AS pending, SUM(status IN ('assigned','picked_up')) AS open,
      SUM(status = 'delivered' AND done_at >= ?) AS delivered_today, COALESCE(SUM(CASE WHEN status = 'delivered' AND done_at >= ? THEN fee END),0) AS fees_today,
      COALESCE(SUM(CASE WHEN status IN ('delivered','refused') AND cash_settled_at IS NULL THEN collected END),0) AS cash_with_couriers,
      SUM(status IN ('refused','cancelled') AND picked_at IS NOT NULL AND returned_at IS NULL) AS to_return FROM shipments`, t0, t0);
  return json({ today, active, users, couriers, complaints, money, parcels });
}

async function adminLive(ctx, env) {
  const couriers = await all(env, `SELECT u.id, u.name, u.phone, c.available, c.lat, c.lng, c.last_seen,
      (SELECT d.id FROM deliveries d WHERE d.courier_id = u.id AND d.status IN ('assigned','picked_up') LIMIT 1) AS delivery_id,
      (SELECT d.status FROM deliveries d WHERE d.courier_id = u.id AND d.status IN ('assigned','picked_up') LIMIT 1) AS delivery_status
    FROM users u JOIN couriers c ON c.user_id = u.id
    WHERE u.status = 'active' AND c.lat IS NOT NULL AND c.last_seen > ?`, now() - 12 * 3600e3);
  const deliveries = await all(env, `SELECT d.id, d.status, d.pickup_lat, d.pickup_lng, d.pickup_addr, d.drop_lat, d.drop_lng, d.drop_addr, d.proposed_price, d.final_price,
      d.courier_id, d.created_at, cl.name AS client_name, cu.name AS courier_name
    FROM deliveries d JOIN users cl ON cl.id = d.client_id LEFT JOIN users cu ON cu.id = d.courier_id
    WHERE d.status IN ('open','assigned','picked_up') ORDER BY d.created_at DESC LIMIT 200`);
  const sos = await all(env, "SELECT * FROM complaints WHERE status = 'open' AND kind = 'sos' ORDER BY at DESC LIMIT 20");
  const axes = await all(env, 'SELECT * FROM axes WHERE active = 1');
  if (couriers.length) {
    const slots = await all(env, `${SLOT_SQL} WHERE ca.courier_id IN (${couriers.map(() => '?').join(',')})`, ...couriers.map((c) => c.id));
    for (const c of couriers) { const st = axeState(slots.filter((x) => x.courier_id === c.id)); c.axe = st.free ? null : st.current?.name || 'hors horaires'; }
  }
  // Trajets des 3 dernières heures (allégés à ~300 points par livreur) pour voir le chemin parcouru en direct.
  const since = Number(ctx.url.searchParams.get('trail_minutes') || 180) * 60e3;
  const pts = couriers.length ? await all(env, `SELECT courier_id, lat, lng, at FROM positions WHERE at > ? AND courier_id IN (${couriers.map(() => '?').join(',')}) ORDER BY at`, now() - since, ...couriers.map((c) => c.id)) : [];
  const trails = {};
  for (const c of couriers) {
    const mine = pts.filter((p) => p.courier_id === c.id);
    const step = Math.max(1, Math.ceil(mine.length / 300));
    trails[c.id] = mine.filter((_, i) => i % step === 0 || i === mine.length - 1).map((p) => [p.lat, p.lng, p.at]);
  }
  return json({ couriers, deliveries, sos, axes, trails, parcels: await liveShipments(env), feed: await liveFeed(env), server_time: now() });
}

async function adminUsers(ctx, env) {
  const p = ctx.url.searchParams;
  const role = ['client', 'courier', 'admin'].includes(p.get('role')) ? p.get('role') : null;
  const status = p.get('status');
  const search = (p.get('q') || '').trim();
  let sql = `SELECT u.id, u.phone, u.name, u.role, u.status, u.is_business, u.company, u.cancel_count, u.created_at,
      c.cin, c.address, c.emergency_contact, c.doc_note, c.available, c.balance, c.rating_sum, c.rating_count, c.last_seen, c.subscription_until,
      (SELECT COUNT(*) FROM deliveries d WHERE (d.client_id = u.id OR d.courier_id = u.id) AND d.status='delivered') AS delivered
    FROM users u LEFT JOIN couriers c ON c.user_id = u.id WHERE 1=1`;
  const args = [];
  if (role) { sql += ' AND u.role = ?'; args.push(role); }
  if (status) { sql += ' AND u.status = ?'; args.push(status); }
  if (search) { sql += ' AND (u.name LIKE ? OR u.phone LIKE ?)'; args.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY (u.status = \'pending\') DESC, u.created_at DESC LIMIT 300';
  return json({ users: await all(env, sql, ...args) });
}

async function adminCreateUser(ctx, env) {
  const b = ctx.body;
  const role = ['client', 'courier', 'admin'].includes(b.role) ? b.role : fail(400, 'invalid', 'Rôle invalide');
  const phone = normalizePhone(b.phone);
  if (await one(env, 'SELECT id FROM users WHERE phone = ?', phone)) fail(409, 'phone_taken', 'Ce numéro est déjà inscrit');
  const salt = randomHex(16);
  const res = await run(env, 'INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, is_business, company, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    phone, str(b.name, { min: 2, max: 80, name: 'Nom' }), role,
    await hashPassword(str(b.password, { min: 6, max: 128, name: 'Mot de passe (6 caractères min.)' }), salt, iterations(env)), salt, 'active',
    b.is_business ? 1 : 0, str(b.company, { max: 120 }) || null, now());
  if (role === 'courier') await run(env, 'INSERT INTO couriers (user_id, vehicle, cin, address, emergency_contact, doc_note, validated_at) VALUES (?,?,?,?,?,?,?)',
    res.meta.last_row_id, 'velo', str(b.cin, { min: 5, max: 30, name: 'Numéro CIN' }), str(b.address, { max: 200 }), str(b.emergency_contact, { max: 60 }), str(b.doc_note, { max: 500 }), now());
  await audit(env, ctx, 'admin_user_create', { id: res.meta.last_row_id, role });
  return json({ id: res.meta.last_row_id }, 201);
}

async function adminSetStatus(ctx, env) {
  const status = ctx.body.status;
  if (!['active', 'suspended', 'rejected'].includes(status)) fail(400, 'invalid', 'Statut invalide');
  const target = await one(env, 'SELECT * FROM users WHERE id = ?', ctx.params.id);
  if (!target) fail(404, 'not_found', 'Utilisateur introuvable');
  if (target.id === ctx.user.id) fail(400, 'self', 'Vous ne pouvez pas modifier votre propre compte');
  await run(env, 'UPDATE users SET status = ? WHERE id = ?', status, target.id);
  if (status !== 'active') {
    await run(env, 'DELETE FROM sessions WHERE user_id = ?', target.id);
    await run(env, 'UPDATE couriers SET available = 0 WHERE user_id = ?', target.id);
  } else if (target.role === 'courier') {
    await run(env, 'UPDATE couriers SET validated_at = COALESCE(validated_at, ?) WHERE user_id = ?', now(), target.id);
    await notify(env, [target.id], 'validated', '✅ Compte validé', 'Vous pouvez maintenant recevoir des livraisons.');
  }
  await audit(env, ctx, 'admin_user_status', { id: target.id, status, reason: ctx.body.reason });
  return json({ ok: true });
}

async function adminDeliveries(ctx, env) {
  const p = ctx.url.searchParams;
  const status = p.get('status');
  const args = [];
  let sql = `SELECT d.*, cl.name AS client_name, cl.phone AS client_phone, cu.name AS courier_name, cu.phone AS courier_phone
    FROM deliveries d JOIN users cl ON cl.id = d.client_id LEFT JOIN users cu ON cu.id = d.courier_id WHERE 1=1`;
  if (status === 'active') sql += " AND d.status IN ('open','assigned','picked_up')";
  else if (status === 'flagged') sql += ' AND d.flagged IS NOT NULL';
  else if (status) { sql += ' AND d.status = ?'; args.push(status); }
  if (p.get('payment') === 'pending') sql += " AND d.payment_status = 'pending'";
  if (p.get('q')) { sql += ' AND (cl.name LIKE ? OR cu.name LIKE ? OR d.pickup_addr LIKE ? OR d.drop_addr LIKE ? OR d.id = ?)'; const s = `%${p.get('q')}%`; args.push(s, s, s, s, Number(p.get('q')) || 0); }
  sql += ' ORDER BY d.created_at DESC LIMIT 300';
  return json({ deliveries: await all(env, sql, ...args) });
}

async function adminPayment(ctx, env) {
  const d = await loadDelivery(env, ctx.params.id);
  const st = ctx.body.payment_status;
  if (!['paid', 'refunded', 'pending'].includes(st)) fail(400, 'invalid', 'Statut de paiement invalide');
  await run(env, 'UPDATE deliveries SET payment_status = ?, payment_ref = COALESCE(?, payment_ref) WHERE id = ?', st, str(ctx.body.ref, { max: 60 }) || null, d.id);
  await audit(env, ctx, 'admin_payment', { id: d.id, st });
  return json({ ok: true });
}

async function adminSettingsGet(ctx, env) {
  return json({ settings: await settings(env), zones: await all(env, 'SELECT * FROM zones ORDER BY id'), promos: await all(env, 'SELECT * FROM promos ORDER BY code') });
}

const NUMERIC = ['commission_percent', 'subscription_monthly', 'base_fare', 'per_km', 'min_price', 'road_factor', 'request_radius_km', 'request_ttl_min',
  'bike_speed_kmh', 'position_retention_days', 'max_open_requests', 'max_courier_debt', 'axe_slot_minutes', 'default_fee'];
async function adminSettingsPut(ctx, env) {
  const cur = await settings(env);
  const stmts = [];
  for (const [k, v] of Object.entries(ctx.body.settings || {})) {
    if (!(k in cur)) continue;
    let val = String(v ?? '').trim().slice(0, 200);
    if (NUMERIC.includes(k)) { const n = Number(val); if (!Number.isFinite(n) || n < 0) fail(400, 'invalid', `Valeur invalide pour ${k}`); val = String(n); }
    if (k === 'commission_mode' && !['percent', 'subscription'].includes(val)) fail(400, 'invalid', 'Mode de commission invalide');
    if (k === 'courier_can_edit_fee') val = val === '1' || val === 'true' ? '1' : '0';
    if (k === 'commission_percent' && Number(val) > 50) fail(400, 'invalid', 'Commission maximum 50 %');
    stmts.push(q(env, 'UPDATE settings SET value = ? WHERE key = ?', val, k));
  }
  if (stmts.length) await env.DB.batch(stmts);
  await audit(env, ctx, 'admin_settings', ctx.body.settings);
  return json({ ok: true });
}

async function adminZoneSave(ctx, env) {
  const b = ctx.body;
  const [lat, lng] = coord(b.center_lat, b.center_lng);
  const radius = Number(b.radius_km);
  if (!(radius > 0 && radius <= 100)) fail(400, 'invalid', 'Rayon invalide (1–100 km)');
  if (b.id) await run(env, 'UPDATE zones SET name = ?, center_lat = ?, center_lng = ?, radius_km = ?, active = ? WHERE id = ?', str(b.name, { min: 2, max: 60, name: 'Nom' }), lat, lng, radius, b.active ? 1 : 0, b.id);
  else await run(env, 'INSERT INTO zones (name, center_lat, center_lng, radius_km, active) VALUES (?,?,?,?,1)', str(b.name, { min: 2, max: 60, name: 'Nom' }), lat, lng, radius);
  await audit(env, ctx, 'admin_zone', b);
  return json({ ok: true });
}

async function adminPromoSave(ctx, env) {
  const b = ctx.body;
  const code = str(b.code, { min: 3, max: 30, name: 'Code' }).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  await run(env, `INSERT INTO promos (code, percent, max_amount, max_uses, expires_at, active) VALUES (?,?,?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET percent = excluded.percent, max_amount = excluded.max_amount, max_uses = excluded.max_uses, expires_at = excluded.expires_at, active = excluded.active`,
    code, int(b.percent, { min: 1, max: 100, name: 'Pourcentage' }), b.max_amount ? int(b.max_amount, { min: 0 }) : null,
    b.max_uses ? int(b.max_uses, { min: 1 }) : null, b.expires_at ? int(b.expires_at) : null, b.active === false ? 0 : 1);
  await audit(env, ctx, 'admin_promo', { code });
  return json({ ok: true });
}

async function adminComplaints(ctx, env) {
  const st = ctx.url.searchParams.get('status') || 'open';
  return json({ complaints: await all(env, `SELECT c.*, u.name AS user_name, u.phone AS user_phone, u.role AS user_role FROM complaints c
    LEFT JOIN users u ON u.id = c.user_id WHERE c.status = ? ORDER BY (c.kind = 'sos') DESC, c.at DESC LIMIT 200`, st === 'resolved' ? 'resolved' : 'open') });
}
async function adminResolveComplaint(ctx, env) {
  await run(env, "UPDATE complaints SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?", str(ctx.body.resolution, { max: 500 }), now(), ctx.params.id);
  await audit(env, ctx, 'admin_complaint_resolve', { id: ctx.params.id });
  return json({ ok: true });
}

async function adminTransactions(ctx, env) {
  const cid = ctx.url.searchParams.get('courier_id');
  const rows = await all(env, `SELECT t.*, u.name AS courier_name FROM transactions t JOIN users u ON u.id = t.courier_id
    ${cid ? 'WHERE t.courier_id = ?' : ''} ORDER BY t.at DESC LIMIT 300`, ...(cid ? [Number(cid)] : []));
  return json({ transactions: rows });
}

async function adminAddTransaction(ctx, env) {
  const b = ctx.body;
  const kind = ['payout', 'deposit', 'subscription', 'adjust', 'refund'].includes(b.kind) ? b.kind : fail(400, 'invalid', 'Type invalide');
  const courier = await one(env, 'SELECT * FROM couriers WHERE user_id = ?', int(b.courier_id));
  if (!courier) fail(404, 'not_found', 'Livreur introuvable');
  let amount = int(b.amount, { min: -10_000_000, max: 10_000_000, name: 'Montant' });
  // payout : la plateforme paie le livreur (solde diminue) ; deposit / subscription : le livreur verse à la plateforme (dette diminue).
  if (kind === 'payout') amount = -Math.abs(amount);
  if (kind === 'deposit') amount = Math.abs(amount);
  const stmts = [q(env, 'INSERT INTO transactions (courier_id, kind, amount, note, created_by, at) VALUES (?,?,?,?,?,?)', courier.user_id, kind,
    kind === 'subscription' ? 0 : amount, str(b.note, { max: 200 }) || (kind === 'subscription' ? `Abonnement ${Math.abs(amount)} Ar` : null), ctx.user.id, now())];
  if (kind === 'subscription') {
    const months = int(b.months || 1, { min: 1, max: 12, name: 'Mois' });
    const from = Math.max(now(), courier.subscription_until || 0);
    stmts.push(q(env, 'UPDATE couriers SET subscription_until = ? WHERE user_id = ?', from + months * 30 * 864e5, courier.user_id));
  } else {
    stmts.push(q(env, 'UPDATE couriers SET balance = balance + ? WHERE user_id = ?', amount, courier.user_id));
  }
  await env.DB.batch(stmts);
  await audit(env, ctx, 'admin_transaction', { courier: courier.user_id, kind, amount });
  return json({ ok: true }, 201);
}

const PERIODS = { day: '%Y-%m-%d', week: '%Y-S%W', month: '%Y-%m', year: '%Y' };
async function adminReports(ctx, env) {
  const p = ctx.url.searchParams;
  const period = PERIODS[p.get('period')] ? p.get('period') : 'day';
  const from = Number(p.get('from') || now() - 30 * 864e5), to = Number(p.get('to') || now());
  const fmt = PERIODS[period];
  const series = await all(env, `SELECT strftime('${fmt}', created_at / 1000, 'unixepoch', '+3 hours') AS label,
      COUNT(*) AS created, SUM(status = 'delivered') AS delivered, SUM(status = 'cancelled') AS cancelled, SUM(status = 'expired') AS expired,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_price END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN commission END), 0) AS commission,
      ROUND(AVG(CASE WHEN status = 'delivered' THEN distance_km END), 2) AS avg_km,
      ROUND(AVG(CASE WHEN status = 'delivered' THEN final_price END)) AS avg_price
    FROM deliveries WHERE created_at BETWEEN ? AND ? GROUP BY label ORDER BY label`, from, to);
  const topCouriers = await all(env, `SELECT u.name, COUNT(*) AS n, SUM(d.final_price) AS revenue, ROUND(AVG(d.rating), 1) AS rating
    FROM deliveries d JOIN users u ON u.id = d.courier_id WHERE d.status = 'delivered' AND d.created_at BETWEEN ? AND ? GROUP BY u.id ORDER BY n DESC LIMIT 10`, from, to);
  const payments = await all(env, `SELECT payment_method, COUNT(*) AS n, SUM(final_price) AS amount FROM deliveries WHERE status = 'delivered' AND created_at BETWEEN ? AND ? GROUP BY payment_method`, from, to);
  const types = await all(env, 'SELECT type, COUNT(*) AS n FROM deliveries WHERE created_at BETWEEN ? AND ? GROUP BY type', from, to);
  return json({ period, from, to, series, topCouriers, payments, types });
}

async function adminExport(ctx, env) {
  const p = ctx.url.searchParams;
  const kind = p.get('type') || 'deliveries';
  const from = Number(p.get('from') || 0), to = Number(p.get('to') || now());
  let body, name;
  if (kind === 'transactions') {
    const rows = await all(env, 'SELECT t.*, u.name AS courier_name, u.phone FROM transactions t JOIN users u ON u.id = t.courier_id WHERE t.at BETWEEN ? AND ? ORDER BY t.at', from, to);
    body = csv(rows, [{ label: 'Date', get: (r) => fmtDate(r.at) }, { label: 'Livreur', key: 'courier_name' }, { label: 'Téléphone', key: 'phone' },
      { label: 'Type', key: 'kind' }, { label: 'Montant (Ar)', key: 'amount' }, { label: 'Livraison', key: 'delivery_id' }, { label: 'Note', key: 'note' }]);
    name = 'transactions';
  } else if (kind === 'users') {
    const rows = await all(env, 'SELECT u.*, c.cin, c.balance FROM users u LEFT JOIN couriers c ON c.user_id = u.id ORDER BY u.id');
    body = csv(rows, [{ label: 'ID', key: 'id' }, { label: 'Nom', key: 'name' }, { label: 'Téléphone', key: 'phone' }, { label: 'Rôle', key: 'role' },
      { label: 'Statut', key: 'status' }, { label: 'Entreprise', key: 'company' }, { label: 'CIN', key: 'cin' }, { label: 'Solde', key: 'balance' }, { label: 'Inscrit le', get: (r) => fmtDate(r.created_at) }]);
    name = 'utilisateurs';
  } else {
    const rows = await all(env, `SELECT d.*, cl.name AS client_name, cu.name AS courier_name FROM deliveries d JOIN users cl ON cl.id = d.client_id
      LEFT JOIN users cu ON cu.id = d.courier_id WHERE d.created_at BETWEEN ? AND ? ORDER BY d.created_at`, from, to);
    body = csv(rows, [{ label: 'N°', key: 'id' }, { label: 'Date', get: (r) => fmtDate(r.created_at) }, { label: 'Client', key: 'client_name' },
      { label: 'Livreur', key: 'courier_name' }, { label: 'Type', key: 'type' }, { label: 'Départ', key: 'pickup_addr' }, { label: 'Arrivée', key: 'drop_addr' },
      { label: 'Distance (km)', key: 'distance_km' }, { label: 'Prix proposé', key: 'proposed_price' }, { label: 'Prix final', key: 'final_price' },
      { label: 'Remise', key: 'discount' }, { label: 'Commission', key: 'commission' }, { label: 'Paiement', key: 'payment_method' },
      { label: 'Statut paiement', key: 'payment_status' }, { label: 'Statut', key: 'status' }, { label: 'Livrée le', get: (r) => fmtDate(r.delivered_at) },
      { label: 'Note', key: 'rating' }, { label: 'Signalement', key: 'flagged' }]);
    name = 'livraisons';
  }
  await audit(env, ctx, 'admin_export', { kind });
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="alefa-${name}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}

async function adminTrack(ctx, env) {
  const cid = int(ctx.url.searchParams.get('courier_id'));
  const from = Number(ctx.url.searchParams.get('from') || now() - 864e5), to = Number(ctx.url.searchParams.get('to') || now());
  return json({ positions: await all(env, 'SELECT lat, lng, at, delivery_id FROM positions WHERE courier_id = ? AND at BETWEEN ? AND ? ORDER BY at LIMIT 5000', cid, from, to) });
}

async function adminAxes(ctx, env) {
  const axes = await all(env, 'SELECT a.*, (SELECT COUNT(DISTINCT courier_id) FROM courier_axes ca WHERE ca.axe_id = a.id) AS couriers FROM axes a ORDER BY a.name');
  return json({ axes, slot_minutes: Number((await settings(env)).axe_slot_minutes || 60) });
}
async function adminAxeSave(ctx, env) {
  const b = ctx.body;
  const [lat, lng] = coord(b.center_lat, b.center_lng);
  const radius = Number(b.radius_km);
  if (!(radius >= 0.2 && radius <= 50)) fail(400, 'invalid', 'Rayon invalide (0,2 – 50 km)');
  const name = str(b.name, { min: 2, max: 60, name: 'Nom de l\'axe' });
  const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#0b6e4f';
  const fee = b.fee === '' || b.fee == null ? null : int(b.fee, { min: 0, max: 1_000_000, name: 'Frais de l\'axe' });
  if (b.id) await run(env, 'UPDATE axes SET name = ?, center_lat = ?, center_lng = ?, radius_km = ?, color = ?, active = ?, fee = ? WHERE id = ?', name, lat, lng, radius, color, b.active === false ? 0 : 1, fee, int(b.id));
  else await run(env, 'INSERT INTO axes (name, center_lat, center_lng, radius_km, color, fee) VALUES (?,?,?,?,?,?)', name, lat, lng, radius, color, fee);
  await audit(env, ctx, 'admin_axe', { name });
  return json({ ok: true });
}
async function adminAxeDelete(ctx, env) {
  await run(env, 'DELETE FROM axes WHERE id = ?', ctx.params.id);
  await audit(env, ctx, 'admin_axe_delete', { id: ctx.params.id });
  return json({ ok: true });
}
async function adminCourierAxesGet(ctx, env) {
  const slots = await all(env, `${SLOT_SQL} WHERE ca.courier_id = ? ORDER BY ca.start_min`, ctx.params.id);
  return json({ slots, state: axeState(slots) });
}
async function adminCourierAxesPut(ctx, env) {
  const cid = ctx.params.id;
  if (!(await one(env, 'SELECT user_id FROM couriers WHERE user_id = ?', cid))) fail(404, 'not_found', 'Livreur introuvable');
  const slots = Array.isArray(ctx.body.slots) ? ctx.body.slots.slice(0, 96) : [];
  const stmts = [q(env, 'DELETE FROM courier_axes WHERE courier_id = ?', cid)];
  for (const x of slots) {
    const start = int(x.start_min, { min: 0, max: 1439, name: 'Heure de début' }), end = int(x.end_min, { min: 1, max: 1440, name: 'Heure de fin' });
    if (end <= start) fail(400, 'invalid', 'L\'heure de fin doit être après l\'heure de début');
    const days = String(x.days || '1234567').replace(/[^1-7]/g, '') || '1234567';
    stmts.push(q(env, 'INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,?,?,?)', cid, int(x.axe_id), start, end, days));
  }
  await env.DB.batch(stmts);
  await notify(env, [cid], 'axe', 'Planning mis à jour', 'Vos axes de travail ont été modifiés par l\'administration.');
  await audit(env, ctx, 'admin_courier_axes', { courier: cid, slots: slots.length });
  return json({ ok: true });
}
async function adminResetPassword(ctx, env) {
  const target = await one(env, 'SELECT id FROM users WHERE id = ?', ctx.params.id);
  if (!target) fail(404, 'not_found', 'Utilisateur introuvable');
  const salt = randomHex(16);
  await run(env, 'UPDATE users SET pass_hash = ?, pass_salt = ?, failed_logins = 0, locked_until = NULL WHERE id = ?',
    await hashPassword(str(ctx.body.password, { min: 6, max: 128, name: 'Mot de passe (6 caractères min.)' }), salt, iterations(env)), salt, target.id);
  await run(env, 'DELETE FROM sessions WHERE user_id = ?', target.id);
  await audit(env, ctx, 'admin_password_reset', { id: target.id });
  return json({ ok: true });
}

async function adminAudit(ctx, env) {
  return json({ audit: await all(env, 'SELECT a.*, u.name AS user_name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300') });
}

// ---------------------------------------------------------------- tâches planifiées
export async function maintenance(env) {
  const s = await settings(env);
  const keep = Number(s.position_retention_days || 30) * 864e5;
  await env.DB.batch([
    q(env, 'DELETE FROM positions WHERE at < ?', now() - keep),
    q(env, 'DELETE FROM sessions WHERE expires_at < ?', now()),
    q(env, 'DELETE FROM notifications WHERE at < ?', now() - 60 * 864e5),
    q(env, "UPDATE deliveries SET status = 'expired' WHERE status = 'open' AND scheduled_at IS NULL AND created_at < ?", now() - Number(s.request_ttl_min) * 60e3),
    q(env, "UPDATE deliveries SET status = 'expired' WHERE status = 'open' AND scheduled_at IS NOT NULL AND scheduled_at < ?", now() - 3600e3),
    q(env, 'UPDATE couriers SET available = 0 WHERE available = 1 AND last_seen < ?', now() - 30 * 60e3),
  ]);
}

// ---------------------------------------------------------------- routeur
const R = [];
const route = (method, path, roles, handler) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), k === 'ref' ? '([A-Za-z0-9_-]{4,40})' : '(\\d+)')) + '$');
  R.push({ method, re, keys, roles, handler });
};
const ANY = ['client', 'courier', 'admin'];

route('GET', '/api/health', null, async (ctx, env) => json({ ok: true, version: env.APP_VERSION || 'dev', time: now() }));
route('GET', '/api/config', null, publicConfig);
route('POST', '/api/auth/register', null, register);
route('POST', '/api/auth/login', null, login);
route('POST', '/api/auth/logout', ANY, logout);
route('GET', '/api/me', ANY, me);
route('PATCH', '/api/me', ANY, updateMe);
route('POST', '/api/quote', ANY, quote);
route('GET', '/api/couriers/nearby', ['client', 'admin'], clientNearby);
route('GET', '/api/deliveries', ANY, myDeliveries);
route('POST', '/api/deliveries', ['client'], createDelivery);
route('GET', '/api/deliveries/:id', ANY, getDelivery);
route('POST', '/api/deliveries/:id/raise', ['client'], raisePrice);
route('POST', '/api/deliveries/:id/accept', ['client'], acceptOffer);
route('POST', '/api/deliveries/:id/cancel', ANY, cancelDelivery);
route('POST', '/api/deliveries/:id/rate', ['client'], rateDelivery);
route('POST', '/api/deliveries/:id/messages', ANY, postMessage);
route('POST', '/api/deliveries/:id/offer', ['courier'], makeOffer);
route('POST', '/api/deliveries/:id/withdraw', ['courier'], withdrawOffer);
route('POST', '/api/deliveries/:id/pickup', ['courier'], pickup);
route('POST', '/api/deliveries/:id/deliver', ['courier'], deliver);
route('GET', '/api/favorites', ANY, listFavorites);
route('POST', '/api/favorites', ANY, addFavorite);
route('DELETE', '/api/favorites/:id', ANY, deleteFavorite);
route('POST', '/api/courier/availability', ['courier'], setAvailability);
route('POST', '/api/courier/location', ['courier'], postLocation);
route('GET', '/api/courier/requests', ['courier'], courierRequests);
route('GET', '/api/courier/wallet', ['courier'], wallet);
route('POST', '/api/complaints', ANY, createComplaint);
route('GET', '/api/notifications', ANY, notifications);
route('POST', '/api/notifications/read', ANY, readNotifications);
route('GET', '/api/admin/stats', ['admin'], adminStats);
route('GET', '/api/admin/live', ['admin'], adminLive);
route('GET', '/api/admin/users', ['admin'], adminUsers);
route('POST', '/api/admin/users', ['admin'], adminCreateUser);
route('POST', '/api/admin/users/:id/status', ['admin'], adminSetStatus);
route('GET', '/api/admin/deliveries', ['admin'], adminDeliveries);
route('POST', '/api/admin/deliveries/:id/payment', ['admin'], adminPayment);
route('GET', '/api/admin/settings', ['admin'], adminSettingsGet);
route('PUT', '/api/admin/settings', ['admin'], adminSettingsPut);
route('POST', '/api/admin/zones', ['admin'], adminZoneSave);
route('POST', '/api/admin/promos', ['admin'], adminPromoSave);
route('GET', '/api/admin/complaints', ['admin'], adminComplaints);
route('POST', '/api/admin/complaints/:id/resolve', ['admin'], adminResolveComplaint);
route('GET', '/api/admin/transactions', ['admin'], adminTransactions);
route('POST', '/api/admin/transactions', ['admin'], adminAddTransaction);
route('GET', '/api/admin/reports', ['admin'], adminReports);
route('GET', '/api/admin/export', ['admin'], adminExport);
route('GET', '/api/admin/track', ['admin'], adminTrack);
route('GET', '/api/admin/audit', ['admin'], adminAudit);
route('GET', '/api/admin/axes', ['admin'], adminAxes);
route('POST', '/api/admin/axes', ['admin'], adminAxeSave);
route('DELETE', '/api/admin/axes/:id', ['admin'], adminAxeDelete);
route('GET', '/api/admin/couriers/:id/axes', ['admin'], adminCourierAxesGet);
route('PUT', '/api/admin/couriers/:id/axes', ['admin'], adminCourierAxesPut);
route('POST', '/api/admin/users/:id/password', ['admin'], adminResetPassword);

registerShipmentRoutes(route);

// API publique v1 : appelée par les logiciels de vente (souvent côté serveur, CORS ouvert pour les intégrations web).
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };

export async function handleApi(req, env) {
  const isV1 = new URL(req.url).pathname.startsWith('/api/v1/');
  if (isV1 && req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const res = await handleApiInner(req, env);
  if (!isV1) return res;
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

async function handleApiInner(req, env) {
  const url = new URL(req.url);
  const ctx = { url, ip: req.headers.get('cf-connecting-ip') || '', params: {}, body: {} };
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // Protection CSRF : les écritures exigent un en-tête JSON (impossible via un formulaire tiers).
      if (!(req.headers.get('content-type') || '').includes('application/json') && req.method !== 'DELETE') fail(415, 'json_required', 'JSON requis');
      ctx.body = await readJson(req);
    }
    const r = R.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) fail(404, 'not_found', 'Route inconnue');
    const m = url.pathname.match(r.re);
    r.keys.forEach((k, i) => (ctx.params[k] = k === 'ref' ? m[i + 1] : Number(m[i + 1])));
    if (r.roles === 'merchant') {
      ctx.merchant = await authenticateMerchant(req, env);
      if (!ctx.merchant) fail(401, 'bad_api_key', 'Clé API invalide ou désactivée');
    } else if (r.roles) {
      ctx.user = await authenticate(req, env);
      if (!ctx.user) fail(401, 'unauthenticated', 'Session expirée, reconnectez-vous');
      if (!r.roles.includes(ctx.user.role)) fail(403, 'forbidden', 'Accès refusé');
    }
    return await r.handler(ctx, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error(e?.stack || e);
    return json({ error: 'server_error', message: 'Erreur serveur, réessayez' }, 500);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    const res = await env.ASSETS.fetch(req);
    return withSecurityHeaders(res);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(maintenance(env));
  },
};
