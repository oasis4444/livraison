// Trajets des livreurs et affectation « sur le chemin » :
// un colis est confié au livreur dont l'itinéraire passe près du point de récupération PUIS près du point de livraison
// (sens du trajet), dans ses horaires, sans dépasser sa capacité, avec le plus petit détour.
// + lien de suivi public, journal des échanges et limitation de l'API.
import { fail, json, str, int, now, haversineKm } from './lib.js';
import { one, all, run, settings } from './worker.js';

const MAX_PTS = 200;

// ---------------------------------------------------------------- géométrie
// Distance (m) d'un point à un segment, en projection locale (suffisant à l'échelle d'une ville).
function segDist(p, a, b) {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180), ky = 110540;
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}
// Position la plus proche sur l'itinéraire : distance et avancement (indice fractionnaire).
export function nearest(route, p) {
  let best = { d: Infinity, pos: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const r = segDist(p, route[i], route[i + 1]);
    if (r.d < best.d) best = { d: r.d, pos: i + r.t };
  }
  if (route.length === 1) best = { d: haversineKm(p[0], p[1], route[0][0], route[0][1]) * 1000, pos: 0 };
  return best;
}
export function simplify(coords) {
  const pts = coords.filter((c) => Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1])).map((c) => [+(+c[0]).toFixed(5), +(+c[1]).toFixed(5)]);
  if (pts.length <= MAX_PTS) return pts;
  const step = (pts.length - 1) / (MAX_PTS - 1);
  return Array.from({ length: MAX_PTS }, (_, i) => pts[Math.round(i * step)]);
}

// ---------------------------------------------------------------- compatibilité colis ↔ trajet
// Renvoie le meilleur trajet compatible (ou null). `exclude` : livreurs ayant déjà refusé.
export async function matchTrip(env, s, { exclude = [] } = {}) {
  if (s.drop_lat == null) return null;
  const st = await settings(env);
  const corridor = Number(st.trip_corridor_m || 700);
  const trips = await all(env, `SELECT t.*, u.name AS courier_name, c.lat AS clat, c.lng AS clng, c.last_seen AS cseen,
      (SELECT COUNT(*) FROM shipments x WHERE x.trip_id = t.id AND x.status IN ('assigned','picked_up')) AS load
    FROM courier_trips t JOIN users u ON u.id = t.courier_id LEFT JOIN couriers c ON c.user_id = t.courier_id
    WHERE t.status = 'planned' AND t.end_at > ? AND u.status = 'active'`, now());
  let best = null;
  for (const t of trips) {
    if (exclude.includes(t.courier_id) || t.load >= t.capacity) continue;
    const route = JSON.parse(t.route);
    const D = nearest(route, [s.drop_lat, s.drop_lng]);
    if (D.d > corridor) continue;
    let P = { d: 0, pos: 0 };
    if (s.pickup_lat != null) {
      P = nearest(route, [s.pickup_lat, s.pickup_lng]);
      if (P.d > corridor || P.pos > D.pos + 0.05) continue; // hors couloir ou à contresens
    }
    // Trajet déjà commencé : la récupération doit encore être devant le livreur.
    if (t.depart_at <= now() && t.clat != null && now() - (t.cseen || 0) < 15 * 60e3) {
      const C = nearest(route, [t.clat, t.clng]);
      if ((s.pickup_lat != null ? P.pos : D.pos) < C.pos - 0.05) continue;
    }
    const wait = Math.max(0, (t.depart_at - now()) / 60e3);
    const score = 2 * (P.d + D.d) + wait * 20; // détour aller-retour (m) + préférence pour le plus proche dans le temps
    if (!best || score < best.score) best = { score, trip: t, detour_m: Math.round(2 * (P.d + D.d)) };
  }
  if (!best) return null;
  const t = best.trip;
  return { courier_id: t.courier_id, trip_id: t.id, departure_at: t.depart_at, axe: `${t.from_addr.split(',')[0]} → ${t.to_addr.split(',')[0]}`,
    courier: t.courier_name.split(' ')[0], detour_m: best.detour_m };
}

// ---------------------------------------------------------------- trajets (livreur)
const publicTrip = (t) => ({ id: t.id, courier_id: t.courier_id, courier: t.courier_name ? t.courier_name.split(' ')[0] : undefined, depart_at: t.depart_at, end_at: t.end_at,
  from: { address: t.from_addr, lat: t.from_lat, lng: t.from_lng }, to: { address: t.to_addr, lat: t.to_lat, lng: t.to_lng },
  route: JSON.parse(t.route), km: t.km, capacity: t.capacity, load: t.load ?? undefined, status: t.status });

export async function upcomingTrips(env, { courierId = null } = {}) {
  const rows = await all(env, `SELECT t.*, u.name AS courier_name,
      (SELECT COUNT(*) FROM shipments x WHERE x.trip_id = t.id AND x.status IN ('assigned','picked_up')) AS load
    FROM courier_trips t JOIN users u ON u.id = t.courier_id
    WHERE t.status = 'planned' AND t.end_at > ? ${courierId ? 'AND t.courier_id = ?' : ''} ORDER BY t.depart_at LIMIT 100`, ...(courierId ? [now(), courierId] : [now()]));
  return rows.map(publicTrip);
}

function point(o, name) {
  const lat = Number(o?.lat), lng = Number(o?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'invalid', `Position de ${name} manquante`);
  return [lat, lng];
}

async function createTrip(ctx, env) {
  const b = ctx.body, cid = ctx.user.id;
  const from = point(b.from, 'départ'), to = point(b.to, 'destination');
  const depart = int(b.depart_at, { min: now() - 3600e3, max: now() + 8 * 864e5, name: 'Heure de départ' });
  let route = simplify(Array.isArray(b.route) && b.route.length >= 2 ? b.route : [from, to]);
  if (route.length < 2) route = [from, to];
  let km = 0; for (let i = 1; i < route.length; i++) km += haversineKm(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
  const minutes = b.duration_min ? int(b.duration_min, { min: 5, max: 600 }) : Math.round((km / 12) * 60 * 1.3 + 30); // vélo ~12 km/h + arrêts
  const end = depart + minutes * 60e3;
  // Pas deux trajets qui se chevauchent pour un même livreur.
  const clash = await one(env, "SELECT id FROM courier_trips WHERE courier_id = ? AND status = 'planned' AND depart_at < ? AND end_at > ?", cid, end, depart);
  if (clash) fail(409, 'trip_overlap', 'Ce trajet chevauche un autre de vos trajets');
  const r = await run(env, `INSERT INTO courier_trips (courier_id, depart_at, end_at, from_addr, from_lat, from_lng, to_addr, to_lat, to_lng, route, km, capacity, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, cid, depart, end, str(b.from.address, { min: 2, max: 160, name: 'Adresse de départ' }), from[0], from[1],
    str(b.to.address, { min: 2, max: 160, name: 'Destination' }), to[0], to[1], JSON.stringify(route), Math.round(km * 10) / 10,
    int(b.capacity ?? 10, { min: 1, max: 60, name: 'Capacité' }), now());
  // Les colis en attente qui tombent sur ce trajet lui sont proposés tout de suite.
  const { reassignPending } = await import('./shipments.js');
  const assigned = await reassignPending(env);
  return json({ trip: publicTrip(await one(env, 'SELECT * FROM courier_trips WHERE id = ?', r.meta.last_row_id)), assigned }, 201);
}

async function myTrips(ctx, env) { return json({ trips: await upcomingTrips(env, { courierId: ctx.user.id }) }); }

async function cancelTrip(ctx, env) {
  const t = await one(env, 'SELECT * FROM courier_trips WHERE id = ?', ctx.params.id);
  if (!t || (ctx.user.role === 'courier' && t.courier_id !== ctx.user.id)) fail(404, 'not_found', 'Trajet introuvable');
  const busy = await one(env, "SELECT COUNT(*) AS n FROM shipments WHERE trip_id = ? AND status = 'picked_up'", t.id);
  if (busy.n) fail(409, 'trip_busy', 'Des colis récupérés sont encore sur ce trajet');
  await run(env, "UPDATE courier_trips SET status = 'cancelled' WHERE id = ?", t.id);
  const { releaseTrip } = await import('./shipments.js');
  const moved = await releaseTrip(env, t.id, ctx.user);
  return json({ ok: true, moved });
}

// ---------------------------------------------------------------- suivi public (lien envoyé au destinataire / logiciel de vente)
async function trackPublic(ctx, env) {
  const s = await one(env, `SELECT s.*, u.name AS courier_name, c.lat AS clat, c.lng AS clng, c.last_seen AS cseen
    FROM shipments s LEFT JOIN users u ON u.id = s.courier_id LEFT JOIN couriers c ON c.user_id = s.courier_id WHERE s.track_token = ?`, ctx.params.ref);
  if (!s) fail(404, 'not_found', 'Lien de suivi invalide');
  const { stepOf, STEP_LABELS } = await import('./shipments.js');
  const step = stepOf(s);
  // La position du livreur n'est visible que pendant la mission (jamais avant ni après).
  const live = ['departed', 'at_pickup', 'picked_up', 'en_route', 'nearby', 'awaiting_recipient', 'awaiting_courier'].includes(step) && s.clat != null && now() - (s.cseen || 0) < 10 * 60e3;
  let eta = null;
  if (live && s.drop_lat != null) {
    const km = (s.status === 'assigned' && s.pickup_lat != null ? haversineKm(s.clat, s.clng, s.pickup_lat, s.pickup_lng) + haversineKm(s.pickup_lat, s.pickup_lng, s.drop_lat, s.drop_lng)
      : haversineKm(s.clat, s.clng, s.drop_lat, s.drop_lng)) * 1.3;
    eta = now() + Math.round((km / 12) * 60 + (s.status === 'assigned' ? 5 : 0)) * 60e3;
  }
  return json({ ref: s.ref, external_ref: s.external_ref, step, step_label: STEP_LABELS[step], recipient: s.recipient_name.split(' ')[0], drop: s.drop_lat != null ? [s.drop_lat, s.drop_lng] : null,
    pickup: s.pickup_lat != null ? [s.pickup_lat, s.pickup_lng] : null, courier: s.courier_name ? s.courier_name.split(' ')[0] : null,
    position: live ? [s.clat, s.clng] : null, position_at: live ? s.cseen : null, eta, departure_at: s.departure_at, done_at: s.done_at });
}

// ---------------------------------------------------------------- journal des échanges + limitation
export async function logSync(env, partner, direction, ref, ok, message = null) {
  try { await run(env, 'INSERT INTO sync_log (partner, direction, ref, ok, message, at) VALUES (?,?,?,?,?,?)', partner, direction, ref ? String(ref).slice(0, 60) : null, ok ? 1 : 0, message ? String(message).slice(0, 300) : null, now()); }
  catch (e) { console.warn('sync_log', e?.message); }
}
export async function rateLimit(env, key) {
  const st = await settings(env);
  const max = Number(st.api_rate_per_min || 120), bucket = `${key}:${Math.floor(now() / 60e3)}`;
  await run(env, 'INSERT INTO rate_hits (bucket, n) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET n = n + 1', bucket);
  const r = await one(env, 'SELECT n FROM rate_hits WHERE bucket = ?', bucket);
  if (r.n > max) fail(429, 'rate_limited', `Trop de requêtes (${max}/minute). Réessayez dans un instant.`);
}
export async function purgeLogs(env) {
  const cur = Math.floor(now() / 60e3);
  await run(env, "DELETE FROM rate_hits WHERE CAST(substr(bucket, instr(bucket, ':') + 1) AS INTEGER) < ?", cur - 2); // compteurs d'une minute
  await run(env, 'DELETE FROM sync_log WHERE at < ?', now() - 30 * 864e5);
}

async function syncLog(ctx, env) {
  const p = ctx.url.searchParams;
  const rows = await all(env, `SELECT * FROM sync_log ${p.get('errors') === '1' ? 'WHERE ok = 0' : ''} ORDER BY id DESC LIMIT 200`);
  return json({ log: rows });
}
async function adminTrips(ctx, env) { return json({ trips: await upcomingTrips(env) }); }

export function registerTripRoutes(route) {
  route('GET', '/api/courier/trips', ['courier'], myTrips);
  route('POST', '/api/courier/trips', ['courier'], createTrip);
  route('POST', '/api/courier/trips/:id/cancel', ['courier', 'admin'], cancelTrip);
  route('GET', '/api/admin/trips', ['admin'], adminTrips);
  route('GET', '/api/admin/sync-log', ['admin'], syncLog);
  route('GET', '/api/track/:ref', null, trackPublic);
}
