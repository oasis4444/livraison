// Colis gérés par le centre : récupération chez l'expéditeur et livraison au destinataire en un seul trajet,
// selon les départs (heure + axe) déclarés par les livreurs. Le destinataire paie valeur + frais ;
// le centre reverse la valeur à l'expéditeur une fois l'argent remis par le livreur.
import { fail, json, str, int, normalizePhone, randomHex, hashPassword, haversineKm, now, csv, fmtDate } from './lib.js';
import { q, one, all, run, settings, audit, notify, alertAdmins, inAxe, SLOT_SQL, slotRoute } from './worker.js';
import { matchTrip, logSync } from './trips.js';

const OPEN = ['pending', 'assigned', 'picked_up'];
const atCentre = (s) => s.status === 'picked_up' && !!s.relay && !!s.centre_in_at && !s.centre_out_at;
const onDeliveryRun = (s) => !s.relay || (s.leg === 'delivery' && !!s.centre_out_at); // le colis est réellement en route vers le client
const H3 = 3 * 3600e3;

// ---------------------------------------------------------------- utilitaires
const mgMidnight = (offset = 0) => { const d = new Date(now() + H3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - H3 + offset * 864e5; };
const mgWeekday = (ms) => ((new Date(ms + H3).getUTCDay() + 6) % 7) + 1;

function genRef() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(7); crypto.getRandomValues(b);
  return 'AL' + [...b].map((x) => A[x % A.length]).join('');
}

function optCoord(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return [null, null];
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) fail(400, 'invalid', 'Coordonnées GPS invalides');
  return [a, b];
}

async function sha256Hex(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmacHex(secret, body) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Étape lisible d'un colis (statut + sous-étape GPS).
export function stepOf(s) {
  if (s.status === 'pending') return 'pending';
  if (s.status === 'assigned') return s.stage === 'at_pickup' ? 'at_pickup' : s.stage === 'departed' ? 'departed' : 'scheduled';
  // Relais : « au centre » = récupéré, déposé au centre, pas encore repris par le livreur de livraison.
  if (s.status === 'picked_up' && s.relay && s.leg === 'pickup') return 'to_centre';
  if (s.status === 'picked_up' && s.relay && s.centre_in_at && !s.centre_out_at) return 'at_centre';
  if (s.status === 'picked_up') {
    if (s.courier_confirmed_at || s.recipient_confirmed_at) return s.courier_confirmed_at ? 'awaiting_recipient' : 'awaiting_courier';
    return s.stage === 'nearby' ? 'nearby' : s.stage === 'en_route' ? 'en_route' : 'picked_up';
  }
  if (['refused', 'cancelled'].includes(s.status)) return s.returned_at ? 'returned' : s.picked_at ? 'returning' : s.status;
  return s.status;
}
const STEP_FR = { pending: 'À programmer', scheduled: 'Programmé', departed: 'Parti du centre', at_pickup: 'Arrivé chez l\'expéditeur', picked_up: 'Récupéré',
  en_route: 'En route vers le destinataire', nearby: 'Livreur tout proche', delivered: 'Livré', refused: 'Refusé', cancelled: 'Annulé', returning: 'Retour vers l\'expéditeur', returned: 'Rendu à l\'expéditeur', assigned: 'Programmé', fee: 'Frais modifiés',
  awaiting_recipient: 'Remis — attente confirmation du destinataire', awaiting_courier: 'Reçu — attente confirmation du livreur', courier_confirmed: 'Remise déclarée par le livreur',
  recipient_confirmed: 'Réception confirmée par le destinataire', pin_fail: 'Code PIN erroné', disputed: 'Réception contestée',
  to_centre: 'Récupéré — en route vers le centre (relais)', at_centre: 'Au centre — attend le livreur de livraison', centre_out: 'Repris au centre par le livreur de livraison',
  accepted: 'Mission acceptée par le livreur', declined: 'Mission refusée par le livreur', released: 'Trajet annulé — colis réaffecté', updated: 'Modifié par le logiciel de vente' };
export const STEP_LABELS = STEP_FR;

const toPay = (s) => (s.value ?? s.declared_value) + s.fee; // montant à encaisser auprès du destinataire

export function publicShipment(s) {
  return {
    id: s.id, ref: s.ref, external_ref: s.external_ref, status: s.status, step: stepOf(s), step_label: STEP_FR[stepOf(s)], stage_at: s.stage_at, source: s.source,
    sender: { name: s.sender_name, phone: s.sender_phone, address: s.pickup_addr, lat: s.pickup_lat, lng: s.pickup_lng },
    recipient: { name: s.recipient_name, phone: s.recipient_phone, address: s.drop_addr, lat: s.drop_lat, lng: s.drop_lng },
    description: s.description, declared_value: s.declared_value, value: s.value, fee: s.fee, amount_to_collect: toPay(s),
    collected: s.collected, return_fee: s.return_fee, outcome_note: s.outcome_note, has_photo: !!s.photo,
    courier_confirmed_at: s.courier_confirmed_at, recipient_confirmed_at: s.recipient_confirmed_at, confirmed_by: s.confirmed_by,
    courier: s.courier_id ? { id: s.courier_id, name: s.courier_name ?? null } : null,
    contents: s.description, size: s.dim_l ? { l: s.dim_l, w: s.dim_w, h: s.dim_h } : null, weight_kg: s.weight_kg ?? null,
    relay: !!s.relay, leg: s.leg ?? null, pickup_courier: s.pickup_courier_id ? { id: s.pickup_courier_id, name: s.pickup_courier_name ?? null } : null,
    delivery_courier: s.delivery_courier_id ? { id: s.delivery_courier_id, name: s.delivery_courier_name ?? null } : null, delivery_departure_at: s.delivery_departure_at ?? null,
    centre_in_at: s.centre_in_at ?? null, centre_out_at: s.centre_out_at ?? null,
    delivery_proof: s.delivery_photo || s.delivered_lat != null ? { photo: !!s.delivery_photo, lat: s.delivered_lat, lng: s.delivered_lng, dist_m: s.delivered_dist_m } : null,
    axe: s.axe_name ?? s.trip_label ?? null, departure_at: s.departure_at, trip_id: s.trip_id ?? null, accepted_at: s.accepted_at ?? null, track_token: s.track_token ?? null,
    returned: !!s.returned_at, created_at: s.created_at, assigned_at: s.assigned_at, picked_at: s.picked_at, done_at: s.done_at, returned_at: s.returned_at,
  };
}

const SHIP_SQL = `SELECT s.*, cu.name AS courier_name, a.name AS axe_name,
  (SELECT name FROM users WHERE id = s.pickup_courier_id) AS pickup_courier_name, (SELECT name FROM users WHERE id = s.delivery_courier_id) AS delivery_courier_name,
  CASE WHEN tr.id IS NOT NULL THEN substr(tr.from_addr, 1, instr(tr.from_addr || ',', ',') - 1) || ' → ' || substr(tr.to_addr, 1, instr(tr.to_addr || ',', ',') - 1) END AS trip_label
  FROM shipments s LEFT JOIN users cu ON cu.id = s.courier_id LEFT JOIN axes a ON a.id = s.axe_id LEFT JOIN courier_trips tr ON tr.id = s.trip_id`;

async function loadShipment(env, id) {
  const s = await one(env, `${SHIP_SQL} WHERE s.id = ?`, id);
  if (!s) fail(404, 'not_found', 'Colis introuvable');
  return s;
}

async function feeFor(env, lat, lng) {
  const st = await settings(env);
  if (lat != null) {
    const axes = await all(env, 'SELECT * FROM axes WHERE active = 1 AND fee IS NOT NULL');
    const a = axes.find((x) => inAxe(x, lat, lng));
    if (a) return a.fee;
  }
  return Number(st.default_fee || 3000);
}

async function logEvent(env, s, status, note, user, lat = null, lng = null) {
  await run(env, 'INSERT INTO shipment_events (shipment_id, status, note, user_id, lat, lng, at) VALUES (?,?,?,?,?,?,?)', s.id, status, note ?? null, user?.id ?? null, lat, lng, now());
}

// Prévient l'expéditeur, le destinataire (s'ils ont un compte) et le logiciel marchand (webhook signé).
async function broadcast(env, s, title, body) {
  const fresh = await loadShipment(env, s.id);
  const rec = await one(env, "SELECT id FROM users WHERE phone = ? AND role = 'client'", fresh.recipient_phone);
  await notify(env, [fresh.sender_id, rec?.id], 'shipment', title, `${fresh.ref} · ${body || ''}`.trim());
  if (fresh.merchant_id) {
    const m = await one(env, 'SELECT * FROM merchants WHERE id = ? AND active = 1', fresh.merchant_id);
    if (m?.webhook_url) {
      const payload = JSON.stringify({ event: 'shipment.updated', at: now(), shipment: publicShipment(fresh) });
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(m.webhook_url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Alefa-Event': 'shipment.updated', 'X-Alefa-Signature': await hmacHex(m.webhook_secret, payload) }, body: payload });
        clearTimeout(tm);
        await logSync(env, `webhook:${m.name}`, 'out', fresh.external_ref || fresh.ref, r.ok, `${stepOf(fresh)} → HTTP ${r.status}`);
      } catch (e) { await logSync(env, `webhook:${m.name}`, 'out', fresh.external_ref || fresh.ref, false, e?.message); }
    }
  }
  return fresh;
}

// ---------------------------------------------------------------- départs (heure + axe déclarés par les livreurs)
export async function departures(env, { days = 2, includePast = false } = {}) {
  const slots = (await all(env, `${SLOT_SQL} JOIN users u ON u.id = ca.courier_id JOIN couriers c ON c.user_id = ca.courier_id
    WHERE a.active = 1 AND u.status = 'active'`.replace('SELECT ca.*,', 'SELECT ca.*, c.lat AS clat, c.lng AS clng, c.last_seen AS cseen, c.vehicle,')));
  if (!slots.length) return [];
  const names = await all(env, `SELECT id, name FROM users WHERE id IN (${[...new Set(slots.map((x) => x.courier_id))].map(() => '?').join(',')})`, ...new Set(slots.map((x) => x.courier_id)));
  const loads = await all(env, `SELECT slot_id, departure_at, COUNT(*) AS n FROM shipments WHERE departure_at >= ? AND status IN ('assigned','picked_up') GROUP BY slot_id, departure_at`, mgMidnight(0));
  const out = [];
  for (let d = 0; d < days; d++) {
    const mid = mgMidnight(d), wd = String(mgWeekday(mid));
    for (const x of slots) {
      if (!String(x.days).includes(wd)) continue;
      const dep = mid + x.start_min * 60e3, end = mid + x.end_min * 60e3;
      if (!includePast && end < now()) continue;
      out.push({
        slot_id: x.id, courier_id: x.courier_id, courier: (names.find((n) => n.id === x.courier_id)?.name || '').split(' ')[0],
        axe_id: x.axe_id, axe: x.name, color: x.color, center_lat: x.center_lat, center_lng: x.center_lng, radius_km: x.radius_km, vehicle: x.vehicle || 'velo',
        from_addr: x.from_addr || null, to_addr: x.to_addr || null, route: slotRoute(x),
        departure_at: dep, return_at: end, started: dep <= now(),
        load: loads.find((l) => l.slot_id === x.id && l.departure_at === dep)?.n || 0,
        lat: dep <= now() ? x.clat : null, lng: dep <= now() ? x.clng : null, last_seen: dep <= now() ? x.cseen : null,
      });
    }
  }
  return out.sort((a, b) => a.departure_at - b.departure_at);
}

const refusedBy = (s) => String(s.refused_by || '').split(',').filter(Boolean).map(Number);

// 1) Trajet d'un livreur qui passe par la récupération puis la livraison (sens, horaires, capacité, plus petit détour) ;
// 2) sinon, premier départ à venir dont l'axe couvre la destination (et si possible la récupération).
// Les livreurs qui ont déjà refusé ce colis sont écartés.
// Position du centre (relais) : réglages centre_lat/centre_lng, sinon adresse du centre localisée une fois.
export async function centrePoint(env) {
  const st = await settings(env);
  if (st.centre_lat && st.centre_lng) return [Number(st.centre_lat), Number(st.centre_lng)];
  const { geocodeTana } = await import('./tsena.js');
  const g = st.centre_addr ? await geocodeTana(st.centre_addr) : null;
  if (g) await run(env, "INSERT INTO settings (key, value) VALUES ('centre_lat', ?), ('centre_lng', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(g[0]), String(g[1]));
  return g;
}
// Meilleur départ (trajet puis axe) pour aller de A vers B (A facultatif).
async function legDeparture(env, from, to, exclude, deps) {
  const trip = await matchTrip(env, { pickup_lat: from?.[0] ?? null, pickup_lng: from?.[1] ?? null, drop_lat: to[0], drop_lng: to[1] }, { exclude });
  if (trip) return trip;
  const ok = deps.filter((d) => !exclude.includes(d.courier_id) && inAxe(d, to[0], to[1]));
  return ok.find((d) => !from || inAxe(d, from[0], from[1])) || null;
}

// 1) Un livreur dont le trajet ou l'axe couvre la récupération ET la livraison : il fait tout.
// 2) Sinon, relais par le centre : un livreur qui passe par la récupération l'apporte au centre,
//    un autre qui passe par la livraison le reprend au centre.
// 3) Sinon, premier départ dont l'axe couvre la livraison (le livreur fait le détour).
// Les livreurs qui ont déjà refusé ce colis sont écartés.
export async function pickDeparture(env, s) {
  if (s.drop_lat == null) return null;
  const exclude = refusedBy(s);
  const P = s.pickup_lat != null ? [s.pickup_lat, s.pickup_lng] : null, D = [s.drop_lat, s.drop_lng];
  const deps = (await departures(env)).filter((d) => !d.started);
  const direct = await legDeparture(env, P, D, exclude, deps);
  if (direct && (!P || direct.trip_id || inAxe(direct, P[0], P[1]))) return direct;
  const st = await settings(env);
  if (P && st.relay_enabled !== '0') {
    const C = await centrePoint(env);
    if (C) {
      const a = await legDeparture(env, P, C, exclude, deps) || deps.find((d) => !exclude.includes(d.courier_id) && inAxe(d, P[0], P[1])) || null;
      const later = deps.filter((d) => (d.departure_at ?? 0) >= (a?.departure_at ?? 0));
      const b = a && (await legDeparture(env, C, D, exclude, later) || later.find((d) => !exclude.includes(d.courier_id) && d.courier_id !== a.courier_id && inAxe(d, D[0], D[1])) || null);
      if (a && b && a.courier_id !== b.courier_id) return { ...a, relay: b };
    }
  }
  return direct || deps.find((d) => !exclude.includes(d.courier_id) && inAxe(d, D[0], D[1])) || null;
}

// Remet un colis « à programmer » puis cherche un autre livreur compatible.
async function unassignAndRepick(env, s, user, why) {
  await run(env, "UPDATE shipments SET courier_id = NULL, slot_id = NULL, axe_id = NULL, trip_id = NULL, departure_at = NULL, status = 'pending', stage = NULL, accepted_at = NULL, relay = 0, leg = NULL, pickup_courier_id = NULL, delivery_courier_id = NULL, delivery_departure_at = NULL WHERE id = ?", s.id);
  const fresh = await loadShipment(env, s.id);
  const dep = await pickDeparture(env, fresh);
  if (dep) return assignTo(env, fresh, dep, user);
  await alertAdmins(env, 'alert', `Colis ${s.ref} à réattribuer manuellement (${why})`);
  return broadcast(env, fresh, 'Colis en attente d\'un livreur', why);
}

// Colis encore « à programmer » : on retente l'affectation (nouveau trajet déclaré, nouvelle position…).
export async function reassignPending(env) {
  const rows = await all(env, `${SHIP_SQL} WHERE s.status = 'pending' AND s.drop_lat IS NOT NULL AND s.created_at > ? ORDER BY s.created_at LIMIT 50`, now() - 3 * 864e5);
  let n = 0;
  for (const s of rows) { const dep = await pickDeparture(env, s); if (dep) { await assignTo(env, s, dep, null); n += 1; } }
  return n;
}

// Trajet annulé : ses colis non encore récupérés repartent vers un autre livreur.
export async function releaseTrip(env, tripId, user) {
  const rows = await all(env, `${SHIP_SQL} WHERE s.trip_id = ? AND s.status = 'assigned'`, tripId);
  for (const s of rows) { await logEvent(env, s, 'released', null, user); await unassignAndRepick(env, s, user, 'trajet du livreur annulé'); }
  return rows.length;
}

async function assignTo(env, s, dep, user) {
  const relay = dep.relay && dep.relay.courier_id !== dep.courier_id ? dep.relay : null;
  await run(env, `UPDATE shipments SET courier_id = ?, slot_id = ?, axe_id = ?, trip_id = ?, departure_at = ?, status = 'assigned', assigned_at = ?, accepted_at = NULL,
      relay = ?, leg = ?, pickup_courier_id = ?, delivery_courier_id = ?, delivery_departure_at = ? WHERE id = ?`,
    dep.courier_id, dep.slot_id ?? null, dep.axe_id ?? null, dep.trip_id ?? null, dep.departure_at ?? null, now(),
    relay ? 1 : 0, relay ? 'pickup' : null, dep.courier_id, relay ? relay.courier_id : dep.courier_id, relay ? relay.departure_at ?? null : null, s.id);
  if (relay) {
    await logEvent(env, s, 'assigned', `Relais par le centre : récupération ${dep.courier} → centre → livraison ${relay.courier}${relay.axe ? ` (${relay.axe})` : ''}`, user);
    await notify(env, [relay.courier_id], 'shipment_assigned', '🏢 Colis à prendre au centre', `${s.ref} · après dépôt par ${dep.courier} · → ${s.drop_addr}`);
  }
  await logEvent(env, s, 'assigned', dep.axe ? `${dep.courier} · ${dep.axe}${dep.detour_m != null ? ` · détour ~${dep.detour_m} m` : ''}` : null, user);
  await notify(env, [dep.courier_id], 'shipment_assigned', '📦 Nouvelle mission à accepter', `${s.ref} · ${s.pickup_addr} → ${s.drop_addr}${dep.departure_at ? ' · départ ' + fmtDate(dep.departure_at).slice(11) : ''}`);
  return broadcast(env, s, 'Colis programmé', dep.departure_at ? `Départ ${fmtDate(dep.departure_at)} (${dep.axe})` : 'Livreur attribué');
}

// Taille (cm) et poids (kg) du colis : { size: { l, w, h } }, « 30x20x10 », ou dim_l / dim_w / dim_h ; weight / weight_kg.
export function parseSize(b) {
  let l = b.size?.l ?? b.size?.length ?? b.dim_l, w = b.size?.w ?? b.size?.width ?? b.dim_w, h = b.size?.h ?? b.size?.height ?? b.dim_h;
  const txt = typeof b.size === 'string' ? b.size : typeof b.dimensions === 'string' ? b.dimensions : null;
  if (txt) { const m = txt.replace(/,/g, '.').match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i); if (m) [l, w, h] = [m[1], m[2], m[3]]; }
  const num = (v0, max, name) => { const v = typeof v0 === 'string' ? v0.trim().replace(',', '.') : v0; return v === undefined || v === null || v === '' ? null : (Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= max ? Math.round(Number(v) * 10) / 10 : fail(400, 'invalid', `${name} invalide`)); };
  const dims = [num(l, 300, 'Longueur'), num(w, 300, 'Largeur'), num(h, 300, 'Hauteur')];
  if (dims.some((x) => x == null) && dims.some((x) => x != null)) fail(400, 'invalid', 'Indiquez les 3 mesures du colis (longueur × largeur × hauteur)');
  return { dims: dims[0] == null ? null : dims, weight: num(b.weight ?? b.weight_kg ?? b.poids, 200, 'Poids') };
}

// ---------------------------------------------------------------- création (application, admin, API)
export async function createShipment(env, b, { sender, source, merchant = null, actor, requireDetails = false }) {
  const recipient_phone = normalizePhone(b.recipient?.phone ?? b.recipient_phone);
  const [plat, plng] = optCoord(b.sender?.lat ?? b.pickup_lat, b.sender?.lng ?? b.pickup_lng);
  const [dlat, dlng] = optCoord(b.recipient?.lat ?? b.drop_lat, b.recipient?.lng ?? b.drop_lng);
  const declared = int(b.declared_value ?? b.value ?? 0, { min: 0, max: 50_000_000, name: 'Valeur de la marchandise' });
  const size = parseSize(b);
  // Depuis l'application, le client indique ce qu'il envoie et la taille du colis.
  if (requireDetails) {
    if (!String(b.description || b.contents || '').trim()) fail(400, 'invalid', 'Indiquez ce que contient le colis');
    if (!size.dims) fail(400, 'invalid', 'Indiquez la taille du colis (longueur × largeur × hauteur en cm)');
  }
  if (b.external_ref) {
    // Une même commande (référence) n'est jamais créée deux fois pour le même vendeur.
    const dup = merchant
      ? await one(env, 'SELECT id FROM shipments WHERE merchant_id = ? AND external_ref = ?', merchant.id, String(b.external_ref))
      : await one(env, "SELECT id FROM shipments WHERE sender_id = ? AND external_ref = ? AND status != 'cancelled'", sender.id, String(b.external_ref));
    if (dup) return { duplicate: true, shipment: await loadShipment(env, dup.id) };
  }
  let fee = await feeFor(env, dlat, dlng);
  if (actor?.role === 'admin' && b.fee != null) fee = int(b.fee, { min: 0, max: 1_000_000, name: 'Frais' });
  let ref = genRef();
  while (await one(env, 'SELECT id FROM shipments WHERE ref = ?', ref)) ref = genRef();
  const res = await run(env, `INSERT INTO shipments (ref, source, merchant_id, external_ref, sender_id, sender_name, sender_phone, pickup_addr, pickup_lat, pickup_lng,
      recipient_name, recipient_phone, drop_addr, drop_lat, drop_lng, description, declared_value, fee, created_at, pin)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ref, source, merchant?.id ?? null, b.external_ref ? String(b.external_ref).slice(0, 60) : null, sender.id,
    str(b.sender?.name ?? b.sender_name ?? sender.name, { min: 2, max: 80, name: 'Nom de l\'expéditeur' }),
    b.sender?.phone || b.sender_phone ? normalizePhone(b.sender?.phone ?? b.sender_phone) : sender.phone,
    str(b.sender?.address ?? b.pickup_addr, { min: 3, max: 200, name: 'Adresse de récupération' }), plat, plng,
    str(b.recipient?.name ?? b.recipient_name, { min: 2, max: 80, name: 'Nom du destinataire' }), recipient_phone,
    str(b.recipient?.address ?? b.drop_addr, { min: 3, max: 200, name: 'Adresse de livraison' }), dlat, dlng,
    str(b.description ?? b.contents, { max: 300 }), declared, fee, now(), String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0'));
  await run(env, 'UPDATE shipments SET track_token = ?, dim_l = ?, dim_w = ?, dim_h = ?, weight_kg = ? WHERE id = ?', randomHex(12),
    size.dims?.[0] ?? null, size.dims?.[1] ?? null, size.dims?.[2] ?? null, size.weight, res.meta.last_row_id);
  let s = await loadShipment(env, res.meta.last_row_id);
  await logEvent(env, s, 'pending', source === 'api' ? `API ${merchant?.name}` : null, actor);
  // Départ choisi explicitement, sinon attribution automatique au prochain départ couvrant la destination.
  let dep = null;
  if (b.slot_id && b.departure_at) dep = (await departures(env)).find((d) => d.slot_id === Number(b.slot_id) && d.departure_at === Number(b.departure_at) && !d.started);
  if (!dep && b.auto_assign !== false) dep = await pickDeparture(env, s);
  if (dep) s = await assignTo(env, s, dep, actor);
  else {
    const admins = await all(env, "SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
    await notify(env, admins.map((a) => a.id), 'shipment_pending', 'Colis à attribuer', `${s.ref} · ${s.drop_addr}`);
  }
  return { shipment: s };
}

// ---------------------------------------------------------------- droits
async function canSee(env, u, s) {
  if (u.role === 'admin' || s.sender_id === u.id || s.courier_id === u.id || s.pickup_courier_id === u.id || s.delivery_courier_id === u.id) return true;
  return u.role === 'client' && s.recipient_phone === u.phone;
}

// ---------------------------------------------------------------- routes application
async function schedule(ctx, env) {
  const st = await settings(env);
  const axes = await all(env, 'SELECT id, name, color, center_lat, center_lng, radius_km, fee FROM axes WHERE active = 1 ORDER BY name');
  const { upcomingTrips } = await import('./trips.js');
  const trips = (await upcomingTrips(env)).filter((t) => t.depart_at < now() + 2 * 864e5)
    .map((t) => ({ id: t.id, courier: t.courier, departure_at: t.depart_at, return_at: t.end_at, from: t.from.address, to: t.to.address, load: t.load, capacity: t.capacity, started: t.depart_at <= now() }));
  return json({ departures: (await departures(env, { days: 2, includePast: false })).map(({ route, ...d }) => d), trips, axes, default_fee: Number(st.default_fee || 3000), centre: { name: st.centre_name, address: st.centre_addr } });
}

async function quoteShipment(ctx, env) {
  const [lat, lng] = optCoord(ctx.body.drop_lat, ctx.body.drop_lng);
  const fee = await feeFor(env, lat, lng);
  const deps = lat == null ? [] : (await departures(env)).filter((d) => !d.started && inAxe(d, lat, lng));
  return json({ fee, departures: deps.map(({ route, ...d }) => d) });
}

async function appCreate(ctx, env) {
  const u = ctx.user;
  let sender = u;
  if (u.role === 'admin') {
    const phone = normalizePhone(ctx.body.sender_phone);
    sender = await one(env, 'SELECT * FROM users WHERE phone = ?', phone) || fail(404, 'not_found', 'Expéditeur introuvable : créez d\'abord son compte client');
  }
  const r = await createShipment(env, ctx.body, { sender, source: u.role === 'admin' ? 'admin' : 'app', actor: u, requireDetails: u.role !== 'admin' && !ctx.body.external_ref });
  if (!r.duplicate) await audit(env, ctx, 'shipment_create', { ref: r.shipment.ref });
  return json({ duplicate: !!r.duplicate, shipment: { ...publicShipment(r.shipment), delivery_pin: r.shipment.pin } }, r.duplicate ? 200 : 201);
}

// Import en masse (fichier Excel / CSV exporté du logiciel de vente) : une ligne = un colis.
async function bulkCreate(ctx, env) {
  const u = ctx.user;
  const rows = Array.isArray(ctx.body.rows) ? ctx.body.rows : fail(400, 'invalid', 'Aucune ligne');
  if (rows.length > 200) fail(400, 'too_many', '200 lignes maximum par import');
  const st = await settings(env);
  let sender = u;
  if (u.role === 'admin') {
    // Le centre importe pour une boutique : son compte est créé automatiquement s'il n'existe pas encore.
    const phone = normalizePhone(ctx.body.sender_phone);
    sender = await one(env, 'SELECT * FROM users WHERE phone = ?', phone);
    if (!sender) {
      const name = str(ctx.body.sender_name || 'Boutique', { min: 2, max: 80, name: 'Nom de la boutique' });
      const salt = randomHex(16);
      const r = await run(env, "INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, is_business, company, created_at) VALUES (?,?,'client',?,?,'active',1,?,?)",
        phone, name, await hashPassword(randomHex(6), salt, Number(env.PBKDF2_ITER || 10000)), salt, name, now());
      sender = await one(env, 'SELECT * FROM users WHERE id = ?', r.meta.last_row_id);
    }
  }
  const out = [];
  for (const [i, r] of rows.entries()) {
    try {
      const b = { ...r, pickup_addr: r.pickup_addr || ctx.body.pickup_addr || st.centre_addr, pickup_lat: r.pickup_lat ?? ctx.body.pickup_lat, pickup_lng: r.pickup_lng ?? ctx.body.pickup_lng };
      const res = await createShipment(env, b, { sender, source: u.role === 'admin' ? 'admin' : 'app', actor: u });
      out.push({ line: i + 1, ok: true, duplicate: !!res.duplicate, ref: res.shipment.ref, external_ref: res.shipment.external_ref, status: res.shipment.status, step: stepOf(res.shipment), pin: res.shipment.pin, recipient: res.shipment.recipient_name, recipient_phone: res.shipment.recipient_phone });
    } catch (e) { out.push({ line: i + 1, ok: false, error: e.message }); }
  }
  await audit(env, ctx, 'shipment_import', { rows: rows.length, ok: out.filter((x) => x.ok && !x.duplicate).length });
  return json({ results: out, created: out.filter((x) => x.ok && !x.duplicate).length, duplicates: out.filter((x) => x.duplicate).length, errors: out.filter((x) => !x.ok).length });
}

async function listMine(ctx, env) {
  const u = ctx.user;
  let rows;
  if (u.role === 'courier') {
    rows = await all(env, `${SHIP_SQL} WHERE (s.courier_id = ? OR (s.delivery_courier_id = ${u.id} AND s.status IN ('assigned','picked_up') AND s.relay = 1)) AND (s.status IN ('assigned','picked_up') OR (s.status IN ('refused','cancelled') AND s.picked_at IS NOT NULL AND s.returned_at IS NULL) OR s.done_at > ?)
      ORDER BY COALESCE(s.departure_at, s.created_at)`, u.id, mgMidnight(0));
  } else {
    rows = await all(env, `${SHIP_SQL} WHERE s.sender_id = ? OR s.recipient_phone = ? ORDER BY s.created_at DESC LIMIT 100`, u.id, u.phone);
  }
  const live = {};
  const trackIds = [...new Set(rows.filter((s) => s.courier_id && (s.status === 'picked_up' || (s.status === 'assigned' && s.stage))).map((s) => s.courier_id))];
  if (u.role !== 'courier' && trackIds.length) {
    for (const c of await all(env, `SELECT user_id, lat, lng, last_seen FROM couriers WHERE user_id IN (${trackIds.map(() => '?').join(',')})`, ...trackIds)) live[c.user_id] = c;
  }
  return json({ shipments: rows.map((s) => ({ ...publicShipment(s), delivery_pin: u.role !== 'courier' || s.recipient_confirmed_at ? s.pin : undefined, recipient_confirmed_at: s.recipient_confirmed_at ?? null, courier_live: live[s.courier_id] && (s.status === 'picked_up' || s.stage) ? live[s.courier_id] : null, mine_as: s.sender_id === u.id ? 'sender' : s.recipient_phone === u.phone ? 'recipient' : 'courier', to_return: ['refused', 'cancelled'].includes(s.status) && s.picked_at && !s.returned_at })) });
}

async function getOne(ctx, env) {
  const u = ctx.user;
  const s = await loadShipment(env, ctx.params.id);
  if (!(await canSee(env, u, s))) fail(403, 'forbidden', 'Accès refusé');
  const out = publicShipment(s);
  if (u.role !== 'courier' || s.recipient_confirmed_at) out.delivery_pin = s.pin; // le livreur reçoit le code quand le client a appuyé sur « J'ai reçu »
  out.recipient_confirmed_at = s.recipient_confirmed_at ?? null;
  out.events = await all(env, 'SELECT status, note, at FROM shipment_events WHERE shipment_id = ? ORDER BY id', s.id);
  out.to_return = ['refused', 'cancelled'].includes(s.status) && !!s.picked_at && !s.returned_at;
  if (s.courier_id && (OPEN.includes(s.status) || out.to_return || u.role === 'admin')) {
    const c = await one(env, 'SELECT u.phone, c.lat, c.lng, c.last_seen FROM couriers c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?', s.courier_id);
    out.courier = { ...out.courier, phone: c?.phone, lat: c?.lat, lng: c?.lng, last_seen: c?.last_seen };
  }
  return json({ shipment: out });
}

async function photo(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  if (!(await canSee(env, ctx.user, s))) fail(403, 'forbidden', 'Accès refusé');
  return photoResponse(env, s.id);
}
async function deliveryPhoto(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  if (!(await canSee(env, ctx.user, s))) fail(403, 'forbidden', 'Accès refusé');
  const p = await one(env, 'SELECT mime, data FROM shipment_delivery_photos WHERE shipment_id = ?', s.id);
  if (!p) fail(404, 'not_found', 'Pas de photo de livraison');
  const bin = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=3600' } });
}

async function photoResponse(env, id) {
  const p = await one(env, 'SELECT mime, data FROM shipment_photos WHERE shipment_id = ?', id);
  if (!p) fail(404, 'not_found', 'Pas de photo');
  const bin = Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=86400' } });
}

async function setFee(ctx, env) {
  const u = ctx.user;
  const s = await loadShipment(env, ctx.params.id);
  const st = await settings(env);
  if (u.role === 'courier' && (s.courier_id !== u.id || st.courier_can_edit_fee !== '1')) fail(403, 'forbidden', 'Modification des frais non autorisée');
  if (!OPEN.includes(s.status)) fail(409, 'closed', 'Colis déjà clôturé');
  const fee = int(ctx.body.fee, { min: 0, max: 1_000_000, name: 'Frais de livraison' });
  await run(env, 'UPDATE shipments SET fee = ? WHERE id = ?', fee, s.id);
  await logEvent(env, s, 'fee', `${s.fee} → ${fee} Ar`, u);
  await audit(env, ctx, 'shipment_fee', { ref: s.ref, from: s.fee, to: fee });
  await broadcast(env, s, 'Frais de livraison modifiés', `${fee} Ar`);
  return json({ ok: true, fee });
}

async function assign(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  if (!['pending', 'assigned'].includes(s.status)) fail(409, 'bad_status', 'Le colis est déjà récupéré ou clôturé');
  let dep;
  if (ctx.body.auto) { dep = await pickDeparture(env, s); if (!dep) fail(404, 'no_departure', 'Aucun départ à venir ne couvre cette destination'); }
  else if (ctx.body.slot_id) {
    dep = (await departures(env)).find((d) => d.slot_id === int(ctx.body.slot_id) && d.departure_at === Number(ctx.body.departure_at));
    if (!dep) fail(404, 'no_departure', 'Départ introuvable');
  } else {
    const c = await one(env, "SELECT u.id, u.name FROM users u WHERE u.id = ? AND u.role = 'courier' AND u.status = 'active'", int(ctx.body.courier_id));
    if (!c) fail(404, 'not_found', 'Livreur introuvable');
    dep = { courier_id: c.id, courier: c.name, departure_at: null };
  }
  const fresh = await assignTo(env, s, dep, ctx.user);
  await audit(env, ctx, 'shipment_assign', { ref: s.ref, courier: dep.courier_id });
  return json({ shipment: publicShipment(fresh) });
}

// Le livreur accepte ou refuse une mission qui lui est proposée. Un refus la confie au livreur compatible suivant.
async function acceptMission(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['assigned']);
  if (!s.accepted_at) { await run(env, 'UPDATE shipments SET accepted_at = ? WHERE id = ?', now(), s.id); await logEvent(env, s, 'accepted', null, ctx.user); await broadcast(env, s, '✅ Mission acceptée', `Livreur : ${ctx.user.name.split(' ')[0]}`); }
  return json({ ok: true });
}
async function declineMission(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['assigned']);
  if (s.stage === 'at_pickup') fail(409, 'bad_status', 'Vous êtes déjà chez l\'expéditeur');
  const reason = str(ctx.body.reason, { max: 200 });
  await run(env, 'UPDATE shipments SET refused_by = ? WHERE id = ?', [...refusedBy(s), ctx.user.id].join(','), s.id);
  await logEvent(env, s, 'declined', reason || null, ctx.user);
  const fresh = await unassignAndRepick(env, await loadShipment(env, s.id), ctx.user, `refusé par ${ctx.user.name.split(' ')[0]}${reason ? ' : ' + reason : ''}`);
  return json({ ok: true, reassigned_to: fresh.courier_id && fresh.courier_id !== ctx.user.id ? (fresh.courier_name || '').split(' ')[0] : null });
}

// Relais : le livreur de récupération dépose le colis au centre ; le livreur de livraison le reprend.
// Le centre (admin) peut aussi enregistrer ces deux gestes.
async function dropAtCentre(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  if (ctx.user.role === 'courier' && s.courier_id !== ctx.user.id) fail(403, 'forbidden', 'Ce colis ne vous est pas attribué');
  if (s.status !== 'picked_up' || !s.relay || s.leg !== 'pickup') fail(409, 'bad_status', 'Ce colis ne passe pas par le centre');
  await run(env, "UPDATE shipments SET centre_in_at = ?, courier_id = COALESCE(delivery_courier_id, courier_id), leg = 'delivery', stage = NULL, stage_at = ?, accepted_at = NULL WHERE id = ?", now(), now(), s.id);
  // Compté pour le livreur de récupération, même si c'est le centre qui l'enregistre.
  await logEvent(env, s, 'at_centre', `Déposé par ${(s.courier_name || '').split(' ')[0]}${ctx.user.role === 'admin' ? ' (enregistré par le centre)' : ''}`, { id: s.courier_id }, ctx.body.lat ?? null, ctx.body.lng ?? null);
  if (s.delivery_courier_id) await notify(env, [s.delivery_courier_id], 'shipment', '🏢 Colis arrivé au centre', `${s.ref} · à prendre pour ${s.drop_addr}`);
  else await alertAdmins(env, 'alert', `Colis ${s.ref} au centre : aucun livreur de livraison choisi`);
  return broadcast(env, s, '🏢 Colis au centre', 'Il repart bientôt avec le livreur de livraison').then((x) => json({ shipment: publicShipment(x) }));
}
async function takeFromCentre(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  if (!atCentre(s)) fail(409, 'bad_status', 'Le colis n\'est pas au centre');
  if (ctx.user.role === 'courier' && s.delivery_courier_id !== ctx.user.id) fail(403, 'forbidden', 'Ce colis est attribué à un autre livreur');
  const cid = ctx.user.role === 'courier' ? ctx.user.id : (s.delivery_courier_id || fail(409, 'no_courier', 'Choisissez d\'abord le livreur de livraison'));
  await run(env, "UPDATE shipments SET courier_id = ?, delivery_courier_id = ?, centre_out_at = ?, stage = 'en_route', stage_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?", cid, cid, now(), now(), now(), s.id);
  await logEvent(env, s, 'centre_out', ctx.user.role === 'admin' ? 'Remis par le centre' : null, { id: cid });
  return broadcast(env, s, '🚲 Colis en route vers vous', 'Le livreur de livraison a repris le colis au centre').then((x) => json({ shipment: publicShipment(x) }));
}

// Admin : choisir le livreur de récupération et le livreur de livraison (identiques = sans relais).
async function planLegs(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  const b = ctx.body;
  const pick = b.pickup_courier_id ? int(b.pickup_courier_id) : null, del = b.delivery_courier_id ? int(b.delivery_courier_id) : null;
  const courier = async (id) => (await one(env, "SELECT id, name FROM users WHERE id = ? AND role = 'courier' AND status = 'active'", id)) || fail(404, 'not_found', 'Livreur introuvable');
  const nextDep = async (id) => (await departures(env)).find((d) => d.courier_id === id && !d.started);
  if (['pending', 'assigned'].includes(s.status)) {
    if (!pick) fail(400, 'invalid', 'Choisissez le livreur de récupération');
    const a = await courier(pick); const da = await nextDep(a.id);
    const dep = { courier_id: a.id, courier: a.name.split(' ')[0], departure_at: da?.departure_at ?? null, slot_id: da?.slot_id, axe_id: da?.axe_id, axe: da?.axe };
    if (del && del !== pick) { const c = await courier(del); const dc = await nextDep(c.id); dep.relay = { courier_id: c.id, courier: c.name.split(' ')[0], departure_at: dc?.departure_at ?? null, axe: dc?.axe }; }
    await assignTo(env, s, dep, ctx.user);
  } else if ((s.status === 'picked_up' && s.relay && s.leg === 'pickup') || atCentre(s)) {
    if (!del) fail(400, 'invalid', 'Choisissez le livreur de livraison');
    const c = await courier(del);
    await run(env, `UPDATE shipments SET delivery_courier_id = ?, courier_id = CASE WHEN leg = 'delivery' THEN ? ELSE courier_id END WHERE id = ?`, c.id, c.id, s.id);
    await logEvent(env, s, 'assigned', `Livreur de livraison : ${c.name.split(' ')[0]}`, ctx.user);
    await notify(env, [c.id], 'shipment_assigned', '🏢 Colis à prendre au centre', `${s.ref} · → ${s.drop_addr}`);
  } else fail(409, 'bad_status', 'Le colis est déjà en livraison ou clôturé');
  await audit(env, ctx, 'shipment_plan', { ref: s.ref, pick, del });
  return json({ shipment: publicShipment(await loadShipment(env, s.id)) });
}

// Admin : livreurs proposés pour la récupération et pour la livraison d'un colis
// (trajet ou axe qui passe par là, distance GPS en direct, prochain départ, colis en cours).
async function suggestCouriers(ctx, env) {
  const s = await loadShipment(env, ctx.params.id);
  const P = s.pickup_lat != null ? [s.pickup_lat, s.pickup_lng] : null, D = s.drop_lat != null ? [s.drop_lat, s.drop_lng] : null;
  const C = await centrePoint(env);
  const cs = await all(env, `SELECT u.id, u.name, u.phone, c.lat, c.lng, c.last_seen, c.available, c.vehicle,
      (SELECT COUNT(*) FROM shipments x WHERE x.courier_id = u.id AND x.status IN ('assigned','picked_up')) AS load
    FROM users u LEFT JOIN couriers c ON c.user_id = u.id WHERE u.role = 'courier' AND u.status = 'active'`);
  const deps = (await departures(env)).filter((d) => !d.started);
  const { upcomingTrips, nearest } = await import('./trips.js');
  const trips = await upcomingTrips(env);
  const km = (a, b) => (a && b ? Math.round(haversineKm(a[0], a[1], b[0], b[1]) * 10) / 10 : null);
  const score = (pt, from) => cs.map((c) => {
    const pos = c.lat != null ? [c.lat, c.lng] : null, online = !!c.last_seen && now() - c.last_seen < 2 * 60e3;
    const myDeps = deps.filter((d) => d.courier_id === c.id);
    const axe = pt ? myDeps.find((d) => inAxe(d, pt[0], pt[1])) : null;
    const trip = pt ? trips.find((t) => t.courier_id === c.id && nearest(t.route, pt).d <= 700 && (!from || nearest(t.route, from).pos <= nearest(t.route, pt).pos + 0.05)) : null;
    const next = [...myDeps.map((d) => ({ at: d.departure_at, label: d.axe })), ...trips.filter((t) => t.courier_id === c.id).map((t) => ({ at: t.depart_at, label: `${t.from.address.split(',')[0]} → ${t.to.address.split(',')[0]}` }))].sort((x, y) => x.at - y.at)[0] || null;
    const dist = km(pos, pt);
    const rank = (trip ? 0 : axe ? 1 : 3) * 100 + (online && dist != null ? Math.min(dist, 50) : 60) + c.load * 2;
    return { id: c.id, name: c.name, phone: c.phone, vehicle: c.vehicle || 'velo', online, position: pos, position_at: c.last_seen, dist_km: dist, on_trip: !!trip, axe: axe?.axe ?? null,
      next_departure: next, load: c.load, refused: refusedBy(s).includes(c.id), rank };
  }).sort((x, y) => x.rank - y.rank);
  return json({ centre: C, pickup: score(P, null), delivery: score(D, s.relay || (P && C) ? C : P), current: { pickup: s.pickup_courier_id, delivery: s.delivery_courier_id } });
}

// Nombre de colis récupérés, livrés, refusés, relais, en cours, par livreur sur une période (jours depuis minuit, heure de Tana).
export async function courierStats(env, days, courierId = null) {
  const from = mgMidnight(-(Math.max(1, days) - 1));
  const cs = await all(env, `SELECT id, name FROM users WHERE role = 'courier' AND status = 'active' ${courierId ? 'AND id = ?' : ''} ORDER BY name`, ...(courierId ? [courierId] : []));
  const ev = await all(env, `SELECT user_id, status, COUNT(*) AS n FROM shipment_events WHERE at >= ? AND status IN ('picked_up','at_centre','centre_out') AND user_id IS NOT NULL GROUP BY user_id, status`, from);
  const done = await all(env, `SELECT courier_id, status, COUNT(*) AS n, COALESCE(SUM(collected), 0) AS cash FROM shipments WHERE done_at >= ? AND status IN ('delivered','refused') GROUP BY courier_id, status`, from);
  const open = await all(env, "SELECT courier_id, COUNT(*) AS n FROM shipments WHERE status IN ('assigned','picked_up') AND courier_id IS NOT NULL GROUP BY courier_id");
  const get = (rows, id, st, key = 'n') => rows.find((r) => r.courier_id === id && r.status === st)?.[key] || 0;
  const evn = (id, st) => ev.find((r) => r.user_id === id && r.status === st)?.n || 0;
  return cs.map((c) => ({ id: c.id, name: c.name, picked: evn(c.id, 'picked_up'), to_centre: evn(c.id, 'at_centre'), from_centre: evn(c.id, 'centre_out'),
    delivered: get(done, c.id, 'delivered'), refused: get(done, c.id, 'refused'), collected: get(done, c.id, 'delivered', 'cash') + get(done, c.id, 'refused', 'cash'),
    open: open.find((r) => r.courier_id === c.id)?.n || 0 }));
}
async function adminCourierStats(ctx, env) {
  const days = int(ctx.url.searchParams.get('days') || 1, { min: 1, max: 366 });
  return json({ days, couriers: await courierStats(env, days) });
}
async function myStats(ctx, env) {
  return json({ today: (await courierStats(env, 1, ctx.user.id))[0], week: (await courierStats(env, 7, ctx.user.id))[0] });
}

async function courierGuardShip(ctx, env, statuses) {
  const s = await loadShipment(env, ctx.params.id);
  if (s.courier_id !== ctx.user.id) fail(403, 'forbidden', 'Ce colis ne vous est pas attribué');
  if (statuses && !statuses.includes(s.status)) fail(409, 'bad_status', 'Action impossible à cette étape');
  return s;
}

async function pickup(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['assigned']);
  const b = ctx.body;
  const value = int(b.value, { min: 0, max: 50_000_000, name: 'Valeur de la marchandise' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.photo || '');
  if (!m) fail(400, 'photo_required', 'La photo du colis est obligatoire');
  if (m[2].length > 900_000) fail(413, 'too_large', 'Photo trop lourde');
  const st = await settings(env);
  let fee = s.fee;
  if (b.fee != null && Number(b.fee) !== s.fee) {
    if (st.courier_can_edit_fee !== '1') fail(403, 'forbidden', 'Modification des frais non autorisée');
    fee = int(b.fee, { min: 0, max: 1_000_000, name: 'Frais' });
  }
  await env.DB.batch([
    q(env, 'INSERT OR REPLACE INTO shipment_photos (shipment_id, mime, data, at) VALUES (?,?,?,?)', s.id, m[1], m[2], now()),
    q(env, "UPDATE shipments SET status = 'picked_up', picked_at = ?, value = ?, fee = ?, photo = 1, stage = NULL, stage_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?", now(), value, fee, now(), now(), s.id),
  ]);
  await logEvent(env, s, 'picked_up', `Valeur ${value} Ar · frais ${fee} Ar`, ctx.user, b.lat ?? null, b.lng ?? null);
  if (s.declared_value && Math.abs(value - s.declared_value) > Math.max(1000, s.declared_value * 0.2))
    await alertAdmins(env, 'alert', `Colis ${s.ref} : valeur saisie ${value} Ar ≠ valeur annoncée ${s.declared_value} Ar`, null, ctx.user.id);
  await broadcast(env, s, '📦 Colis récupéré', `Valeur ${value.toLocaleString('fr-FR')} Ar · à payer ${(value + fee).toLocaleString('fr-FR')} Ar`);
  return json({ ok: true, amount_to_collect: value + fee });
}

// Livraison confirmée des deux côtés (preuve) : le livreur déclare la remise + le destinataire confirme,
// soit en donnant son code PIN au livreur, soit avec le bouton « Colis reçu » de son application.
async function completeIfBoth(env, s, by, user) {
  const f = await one(env, 'SELECT * FROM shipments WHERE id = ?', s.id);
  if (f.status !== 'picked_up' || !f.courier_confirmed_at || !f.recipient_confirmed_at) return false;
  await run(env, "UPDATE shipments SET status = 'delivered', done_at = ?, confirmed_by = ?, stage = NULL WHERE id = ? AND status = 'picked_up'", now(), by, s.id);
  await logEvent(env, s, 'delivered', `Encaissé ${f.collected} Ar · confirmé par ${by === 'pin' ? 'code PIN du destinataire' : by === 'app' ? 'le destinataire (application)' : by === 'link' ? 'le destinataire (lien de suivi)' : 'le centre'}`, user);
  await broadcast(env, s, '✅ Colis livré', `Confirmé par le livreur et le destinataire · ${f.collected.toLocaleString('fr-FR')} Ar`);
  return true;
}

async function deliver(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['picked_up']);
  if (!onDeliveryRun(s)) fail(409, 'relay_first', s.leg === 'pickup' ? 'Ce colis passe par le centre : déposez-le d\'abord au centre' : 'Reprenez d\'abord le colis au centre');
  // Preuve de livraison : photo à la remise (obligatoire selon les réglages) et position GPS du livreur.
  const stp = await settings(env);
  const ph = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(ctx.body.photo || '');
  if (!ph && stp.delivery_photo_required === '1' && !s.delivery_photo) fail(400, 'photo_required', 'Prenez une photo du colis remis au client');
  if (ph && ph[2].length > 900_000) fail(413, 'too_large', 'Photo trop lourde');
  const [glat, glng] = optCoord(ctx.body.lat, ctx.body.lng);
  const dist = glat != null && s.drop_lat != null ? Math.round(haversineKm(glat, glng, s.drop_lat, s.drop_lng) * 1000) : null;

  const due = toPay(s);
  const collected = ctx.body.collected == null ? due : int(ctx.body.collected, { min: 0, max: 60_000_000, name: 'Montant encaissé' });
  const pin = ctx.body.pin ? String(ctx.body.pin).trim() : '';
  if (pin && pin !== s.pin) {
    await logEvent(env, s, 'pin_fail', 'Code PIN erroné', ctx.user);
    const n = await one(env, "SELECT COUNT(*) AS n FROM shipment_events WHERE shipment_id = ? AND status = 'pin_fail'", s.id);
    if (n.n >= 3) await alertAdmins(env, 'alert', `Colis ${s.ref} : code PIN erroné ${n.n} fois (${ctx.user.name})`, null, ctx.user.id);
    fail(400, 'bad_pin', 'Code incorrect. Demandez le code à 4 chiffres au destinataire.');
  }
  // Code vérifié : on enregistre la preuve (photo + position) puis la remise.
  if (ph) await run(env, 'INSERT OR REPLACE INTO shipment_delivery_photos (shipment_id, mime, data, at) VALUES (?,?,?,?)', s.id, ph[1], ph[2], now());
  await run(env, 'UPDATE shipments SET delivery_photo = MAX(delivery_photo, ?), delivered_lat = COALESCE(?, delivered_lat), delivered_lng = COALESCE(?, delivered_lng), delivered_dist_m = COALESCE(?, delivered_dist_m) WHERE id = ?',
    ph ? 1 : 0, glat, glng, dist, s.id);
  if (dist != null && dist > Number(stp.delivery_max_dist_m || 300))
    await alertAdmins(env, 'alert', `Colis ${s.ref} : « remis » à ${dist} m de l'adresse du client (${ctx.user.name.split(' ')[0]}) — à vérifier`, null, ctx.user.id);
  else if (glat == null) await alertAdmins(env, 'alert', `Colis ${s.ref} : remis sans position GPS (${ctx.user.name.split(' ')[0]})`, null, ctx.user.id);
  const t = now();
  await run(env, `UPDATE shipments SET collected = ?, courier_confirmed_at = ?, outcome_note = ?, stage = 'awaiting',
      recipient_confirmed_at = CASE WHEN ? THEN ? ELSE recipient_confirmed_at END, stage_at = ? WHERE id = ?`,
    collected, t, str(ctx.body.note, { max: 200 }) || null, pin ? 1 : 0, t, t, s.id);
  await logEvent(env, s, 'courier_confirmed', `Remis · encaissé ${collected} Ar${pin ? ' · PIN correct' : ''}${ph ? ' · photo' : ''}${dist != null ? ` · à ${dist} m de l'adresse` : ''}`, ctx.user, glat, glng);
  if (collected !== due) await alertAdmins(env, 'alert', `Colis ${s.ref} : encaissé ${collected} Ar au lieu de ${due} Ar`, null, ctx.user.id);
  const done = await completeIfBoth(env, s, pin ? 'pin' : 'app', ctx.user);
  if (!done) {
    const rec = await one(env, "SELECT id FROM users WHERE phone = ? AND role = 'client'", s.recipient_phone);
    await broadcast(env, s, '📦 Confirmez la réception', `Le livreur indique avoir remis le colis (${collected.toLocaleString('fr-FR')} Ar). Confirmez dans l'application.`);
    if (!rec) await alertAdmins(env, 'alert', `Colis ${s.ref} : remis sans code PIN, le destinataire n'a pas de compte — confirmation à faire par le centre`, null, ctx.user.id);
  }
  return json({ ok: true, collected, delivered: done, awaiting_recipient: !done });
}

// Le destinataire confirme (ou conteste) la réception depuis son application.
// Le destinataire appuie sur « J'ai reçu mon colis » (application ou lien de suivi) : le code est transmis au livreur,
// qui n'a plus qu'à appuyer sur « Livré ». Si le livreur a déjà confirmé, le colis passe « Livré ».
export async function recipientReceived(env, s, by, user, note = null) {
  if (!onDeliveryRun(s)) fail(409, 'bad_status', 'Le colis n\'est pas encore parti vers vous');
  await run(env, 'UPDATE shipments SET recipient_confirmed_at = COALESCE(recipient_confirmed_at, ?) WHERE id = ?', now(), s.id);
  await logEvent(env, s, 'recipient_confirmed', note || 'Le destinataire a appuyé sur « J\'ai reçu » · code transmis au livreur', user);
  const done = await completeIfBoth(env, s, by, user);
  if (!done && s.courier_id) await notify(env, [s.courier_id], 'shipment', `✅ Code reçu : ${s.pin}`, `${s.ref} · le client a confirmé la réception — appuyez sur « Livré »`);
  return done;
}

async function recipientConfirm(ctx, env) {
  const u = ctx.user;
  const s = await loadShipment(env, ctx.params.id);
  const isRecipient = u.role === 'client' && s.recipient_phone === u.phone, isAdmin = u.role === 'admin';
  if (!isRecipient && !isAdmin) fail(403, 'forbidden', 'Seul le destinataire peut confirmer la réception');
  if (s.status !== 'picked_up') fail(409, 'bad_status', s.status === 'delivered' ? 'Déjà confirmé' : 'Le colis n\'est pas encore en livraison');
  if (ctx.body.received === false) {
    const note = str(ctx.body.note, { min: 2, max: 300, name: 'Explication' });
    await logEvent(env, s, 'disputed', note, u);
    await run(env, 'INSERT INTO complaints (user_id, kind, body, at) VALUES (?,?,?,?)', u.id, 'complaint', `Colis ${s.ref} non reçu selon ${u.name} (${u.phone}) : ${note}`, now());
    await alertAdmins(env, 'alert', `Colis ${s.ref} contesté par ${isAdmin ? 'le centre' : 'le destinataire'} : ${note}`, null, u.id);
    if (s.courier_id) await notify(env, [s.courier_id], 'shipment', '⚠ Réception contestée', `${s.ref} · ${note}`);
    return json({ ok: true, disputed: true });
  }
  const done = await recipientReceived(env, s, isAdmin ? 'admin' : 'app', u, isAdmin ? `Confirmé par le centre${ctx.body.note ? ' : ' + str(ctx.body.note, { max: 200 }) : ''}` : null);
  return json({ ok: true, delivered: done });
}

// Le destinataire refuse la marchandise : il paie les frais de livraison, le colis retourne à l'expéditeur.
async function refuse(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['picked_up']);
  if (!onDeliveryRun(s)) fail(409, 'relay_first', 'Ce colis n\'est pas encore en route vers le client');
  const collected = ctx.body.collected == null ? s.fee : int(ctx.body.collected, { min: 0, max: 1_000_000, name: 'Frais encaissés' });
  const note = str(ctx.body.note, { min: 2, max: 200, name: 'Motif du refus' });
  await run(env, "UPDATE shipments SET status = 'refused', collected = ?, done_at = ?, outcome_note = ? WHERE id = ?", collected, now(), note, s.id);
  await logEvent(env, s, 'refused', `${note} · frais encaissés ${collected} Ar`, ctx.user);
  if (collected < s.fee) await alertAdmins(env, 'alert', `Colis ${s.ref} refusé : frais encaissés ${collected} Ar au lieu de ${s.fee} Ar`, null, ctx.user.id);
  await broadcast(env, s, '↩️ Colis refusé par le destinataire', `${note} — retour à l'expéditeur`);
  return json({ ok: true, collected });
}

// Annulation : avant récupération → simple annulation. Après récupération → retour à l'expéditeur, qui paie les frais.
// Changement fait dans le logiciel de vente (annulation, livraison faite par la boutique, adresse ou montant modifiés).
// Avant récupération : Alefa suit. Après récupération : le centre est alerté (le livreur a déjà le colis).
export async function partnerCancel(env, id, reason) {
  const s = await loadShipment(env, id);
  if (!s || !['pending', 'assigned'].includes(s.status)) {
    if (s?.status === 'picked_up') await alertAdmins(env, 'alert', `${s.ref} (${s.external_ref || ''}) : ${reason} dans le logiciel de vente, mais le colis est déjà récupéré`);
    return false;
  }
  await run(env, "UPDATE shipments SET status = 'cancelled', done_at = ?, outcome_note = ?, return_fee = 0, collected = 0 WHERE id = ?", now(), reason, s.id);
  await logEvent(env, s, 'cancelled', reason, null);
  if (s.courier_id) await notify(env, [s.courier_id], 'shipment_cancel', 'Colis annulé', `${s.ref} · ${reason}`);
  return true;
}
// Livreur choisi dans le logiciel de vente (« Santatra (Alefa) ») : on lui confie le colis sur son prochain départ ou trajet.
export async function partnerChooseCourier(env, id, firstName) {
  const s = await loadShipment(env, id);
  if (!s || !['pending', 'assigned'].includes(s.status) || s.accepted_at) return false;
  const c = await one(env, "SELECT id, name FROM users WHERE role = 'courier' AND status = 'active' AND (name = ? OR name LIKE ?) ORDER BY id LIMIT 1", firstName, firstName + ' %');
  if (!c || c.id === s.courier_id) return false;
  const trip = await matchTrip(env, s, { exclude: [] });
  const dep = trip?.courier_id === c.id ? trip
    : (await departures(env)).find((d) => d.courier_id === c.id && !d.started) || { courier_id: c.id, courier: c.name.split(' ')[0], departure_at: null, axe: null };
  await assignTo(env, s, dep, null);
  await logEvent(env, s, 'updated', `Livreur choisi dans le logiciel de vente : ${c.name.split(' ')[0]}`, null);
  return true;
}

export async function partnerUpdate(env, id, ch) {
  const s = await loadShipment(env, id);
  if (!s || !['pending', 'assigned'].includes(s.status)) return false;
  const sets = [], args = [], what = [];
  const put = (col, v, label) => { sets.push(`${col} = ?`); args.push(v); if (label) what.push(label); };
  if (ch.recipient_name != null && ch.recipient_name !== s.recipient_name) put('recipient_name', ch.recipient_name, 'nom');
  if (ch.recipient_phone && normalizePhone(ch.recipient_phone) !== s.recipient_phone) put('recipient_phone', normalizePhone(ch.recipient_phone), 'téléphone');
  if (ch.declared_value != null && ch.declared_value !== s.declared_value) put('declared_value', ch.declared_value, 'montant');
  if (ch.fee != null && ch.fee !== s.fee) put('fee', ch.fee, 'frais');
  if (ch.drop_addr && ch.drop_addr !== s.drop_addr) { put('drop_addr', ch.drop_addr, 'adresse'); put('drop_lat', ch.drop_lat ?? null); put('drop_lng', ch.drop_lng ?? null); }
  if (!sets.length) return false;
  await run(env, `UPDATE shipments SET ${sets.join(', ')} WHERE id = ?`, ...args, s.id);
  const note = `Modifié dans le logiciel de vente : ${what.join(', ')}`;
  await logEvent(env, s, 'updated', note, null);
  if (s.courier_id) await notify(env, [s.courier_id], 'shipment_update', '✏️ Colis modifié', `${s.ref} · ${what.join(', ')}`);
  // Nouvelle adresse hors du trajet du livreur : on cherche un livreur compatible.
  if (what.includes('adresse') && s.status === 'assigned' && !s.accepted_at) { const fresh = await loadShipment(env, s.id); const dep = await pickDeparture(env, fresh); if (dep && dep.courier_id !== s.courier_id) await assignTo(env, fresh, dep, null); }
  return true;
}

async function cancel(ctx, env) {
  const u = ctx.user;
  const s = await loadShipment(env, ctx.params.id);
  const isSender = s.sender_id === u.id, isCourier = s.courier_id === u.id, isAdmin = u.role === 'admin';
  if (!isSender && !isCourier && !isAdmin) fail(403, 'forbidden', 'Accès refusé');
  if (!OPEN.includes(s.status)) fail(409, 'closed', 'Colis déjà clôturé');
  if (isSender && !isAdmin && s.status === 'picked_up') fail(409, 'picked', 'Le colis est déjà récupéré : contactez le centre');
  if (isCourier && !isAdmin && s.status !== 'picked_up') fail(409, 'bad_status', 'Signalez au centre un problème avant récupération');
  const note = str(ctx.body.note, { min: 2, max: 200, name: 'Motif' });
  const afterPickup = s.status === 'picked_up';
  await run(env, "UPDATE shipments SET status = 'cancelled', done_at = ?, outcome_note = ?, return_fee = ?, collected = 0 WHERE id = ?",
    now(), note, afterPickup ? (ctx.body.return_fee != null && isAdmin ? int(ctx.body.return_fee, { min: 0 }) : s.fee) : 0, s.id);
  await logEvent(env, s, 'cancelled', note, u);
  await audit(env, ctx, 'shipment_cancel', { ref: s.ref, afterPickup });
  await broadcast(env, s, afterPickup ? '↩️ Livraison annulée — retour à l\'expéditeur' : 'Colis annulé', afterPickup ? `${note} · frais de retour ${s.fee} Ar` : note);
  if (s.courier_id && !isCourier) await notify(env, [s.courier_id], 'shipment_cancel', 'Colis annulé', `${s.ref} · ${note}`);
  return json({ ok: true });
}

async function returned(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['refused', 'cancelled']);
  if (!s.picked_at || s.returned_at) fail(409, 'bad_status', 'Rien à retourner');
  await run(env, 'UPDATE shipments SET returned_at = ? WHERE id = ?', now(), s.id);
  await logEvent(env, s, 'returned', 'Remis à l\'expéditeur', ctx.user);
  await broadcast(env, s, 'Colis rendu à l\'expéditeur', null);
  return json({ ok: true });
}

// ---------------------------------------------------------------- planning du livreur (heures de départ + axes)
async function mySchedule(ctx, env) {
  const slots = await all(env, `${SLOT_SQL} WHERE ca.courier_id = ? ORDER BY ca.start_min`, ctx.user.id);
  const axes = await all(env, 'SELECT id, name, color, center_lat, center_lng, radius_km FROM axes WHERE active = 1 ORDER BY name');
  return json({ slots, axes });
}

// ---------------------------------------------------------------- centre : liste, caisse, vendeurs
async function adminList(ctx, env) {
  const p = ctx.url.searchParams, args = [];
  let sql = `${SHIP_SQL} WHERE 1=1`;
  const st = p.get('status');
  if (st === 'open') sql += " AND s.status IN ('pending','assigned','picked_up')";
  else if (st === 'return') sql += " AND s.status IN ('refused','cancelled') AND s.picked_at IS NOT NULL AND s.returned_at IS NULL";
  else if (st) { sql += ' AND s.status = ?'; args.push(st); }
  if (p.get('courier_id')) { sql += ' AND s.courier_id = ?'; args.push(Number(p.get('courier_id'))); }
  if (p.get('q')) { const v = `%${p.get('q')}%`; sql += ' AND (s.ref LIKE ? OR s.sender_name LIKE ? OR s.recipient_name LIKE ? OR s.recipient_phone LIKE ? OR s.drop_addr LIKE ? OR s.external_ref LIKE ?)'; args.push(v, v, v, v, v, v); }
  sql += ' ORDER BY s.created_at DESC LIMIT 300';
  const rows = await all(env, sql, ...args);
  return json({ shipments: rows.map((s) => ({ ...publicShipment(s), cash_settled_at: s.cash_settled_at, vendor_paid_at: s.vendor_paid_at })) });
}

async function cashOverview(ctx, env) {
  const couriers = await all(env, `SELECT u.id, u.name, u.phone, COUNT(s.id) AS n, COALESCE(SUM(s.collected),0) AS cash
    FROM users u JOIN shipments s ON s.courier_id = u.id
    WHERE (s.status IN ('delivered','refused') OR (s.status = 'picked_up' AND s.courier_confirmed_at IS NOT NULL)) AND s.cash_settled_at IS NULL GROUP BY u.id ORDER BY cash DESC`);
  const vendors = await all(env, `SELECT u.id, u.name, u.phone, u.company,
      COALESCE(SUM(CASE WHEN s.status = 'delivered' AND s.cash_settled_at IS NOT NULL THEN s.value END),0) AS sales,
      COALESCE(SUM(CASE WHEN s.status = 'cancelled' AND s.picked_at IS NOT NULL THEN s.return_fee END),0) AS return_fees,
      SUM(CASE WHEN s.status = 'delivered' AND s.cash_settled_at IS NULL THEN 1 ELSE 0 END) AS waiting_cash,
      COUNT(s.id) AS n
    FROM users u JOIN shipments s ON s.sender_id = u.id
    WHERE s.vendor_paid_at IS NULL AND ((s.status = 'delivered') OR (s.status = 'cancelled' AND s.picked_at IS NOT NULL))
    GROUP BY u.id ORDER BY sales DESC`);
  const payouts = await all(env, `SELECT p.*, u.name FROM vendor_payouts p JOIN users u ON u.id = p.user_id ORDER BY p.at DESC LIMIT 50`);
  const settlements = await all(env, `SELECT c.*, u.name FROM cash_settlements c JOIN users u ON u.id = c.courier_id ORDER BY c.at DESC LIMIT 50`);
  return json({ couriers, vendors: vendors.map((v) => ({ ...v, due: v.sales - v.return_fees })), payouts, settlements });
}

// Le livreur rentre au centre et remet l'argent encaissé.
async function settleCourier(ctx, env) {
  const cid = ctx.params.id;
  const rows = await all(env, "SELECT id, collected FROM shipments WHERE courier_id = ? AND (status IN ('delivered','refused') OR (status = 'picked_up' AND courier_confirmed_at IS NOT NULL)) AND cash_settled_at IS NULL", cid);
  if (!rows.length) fail(409, 'nothing', 'Aucun encaissement en attente pour ce livreur');
  const total = rows.reduce((a, r) => a + r.collected, 0);
  const received = ctx.body.amount == null ? total : int(ctx.body.amount, { min: 0, name: 'Montant reçu' });
  const t = now();
  await env.DB.batch([
    q(env, `UPDATE shipments SET cash_settled_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`, t, ...rows.map((r) => r.id)),
    q(env, 'INSERT INTO cash_settlements (courier_id, amount, shipments, note, created_by, at) VALUES (?,?,?,?,?,?)', cid, received, rows.length,
      received !== total ? `Attendu ${total} Ar, reçu ${received} Ar` : str(ctx.body.note, { max: 200 }) || null, ctx.user.id, t),
  ]);
  if (received !== total) await alertAdmins(env, 'alert', `Remise livreur #${cid} : attendu ${total} Ar, reçu ${received} Ar`, null, cid);
  await audit(env, ctx, 'cash_settle', { courier: cid, total, received });
  return json({ ok: true, total, received, shipments: rows.length });
}

// Le centre paie l'expéditeur : valeur des colis livrés (argent déjà remis par le livreur) − frais de retour.
async function payVendor(ctx, env) {
  const vid = ctx.params.id;
  const rows = await all(env, `SELECT id, status, value, return_fee FROM shipments WHERE sender_id = ? AND vendor_paid_at IS NULL
    AND ((status = 'delivered' AND cash_settled_at IS NOT NULL) OR (status = 'cancelled' AND picked_at IS NOT NULL))`, vid);
  if (!rows.length) fail(409, 'nothing', 'Rien à payer pour cet expéditeur');
  const amount = rows.reduce((a, r) => a + (r.status === 'delivered' ? r.value || 0 : -(r.return_fee || 0)), 0);
  const t = now();
  await env.DB.batch([
    q(env, `UPDATE shipments SET vendor_paid_at = ? WHERE id IN (${rows.map(() => '?').join(',')})`, t, ...rows.map((r) => r.id)),
    q(env, 'INSERT INTO vendor_payouts (user_id, amount, note, created_by, at) VALUES (?,?,?,?,?)', vid, amount,
      str(ctx.body.note, { max: 200 }) || `${rows.length} colis`, ctx.user.id, t),
  ]);
  await notify(env, [vid], 'payout', '💰 Paiement du centre', `${amount.toLocaleString('fr-FR')} Ar pour ${rows.length} colis`);
  await audit(env, ctx, 'vendor_pay', { vendor: vid, amount, n: rows.length });
  return json({ ok: true, amount, shipments: rows.length });
}

async function myBalance(ctx, env) {
  const u = ctx.user;
  const r = await one(env, `SELECT
      COALESCE(SUM(CASE WHEN status = 'delivered' AND vendor_paid_at IS NULL THEN value END),0) AS sales_unpaid,
      COALESCE(SUM(CASE WHEN status = 'delivered' AND vendor_paid_at IS NULL AND cash_settled_at IS NULL THEN value END),0) AS with_courier,
      COALESCE(SUM(CASE WHEN status = 'cancelled' AND picked_at IS NOT NULL AND vendor_paid_at IS NULL THEN return_fee END),0) AS return_fees
    FROM shipments WHERE sender_id = ?`, u.id);
  const payouts = await all(env, 'SELECT amount, note, at FROM vendor_payouts WHERE user_id = ? ORDER BY at DESC LIMIT 30', u.id);
  return json({ ...r, due: r.sales_unpaid - r.return_fees, payouts });
}

async function adminExportShipments(ctx, env) {
  const rows = await all(env, `${SHIP_SQL} ORDER BY s.created_at DESC LIMIT 5000`);
  const body = csv(rows, [{ label: 'Réf', key: 'ref' }, { label: 'Créé', get: (r) => fmtDate(r.created_at) }, { label: 'Source', key: 'source' }, { label: 'Réf marchand', key: 'external_ref' },
    { label: 'Expéditeur', key: 'sender_name' }, { label: 'Tél exp.', key: 'sender_phone' }, { label: 'Récupération', key: 'pickup_addr' },
    { label: 'Destinataire', key: 'recipient_name' }, { label: 'Tél dest.', key: 'recipient_phone' }, { label: 'Livraison', key: 'drop_addr' },
    { label: 'Livreur', key: 'courier_name' }, { label: 'Axe', key: 'axe_name' }, { label: 'Départ', get: (r) => fmtDate(r.departure_at) },
    { label: 'Valeur annoncée', key: 'declared_value' }, { label: 'Valeur', key: 'value' }, { label: 'Frais', key: 'fee' }, { label: 'Encaissé', key: 'collected' },
    { label: 'Frais retour', key: 'return_fee' }, { label: 'Statut', key: 'status' }, { label: 'Motif', key: 'outcome_note' },
    { label: 'Argent remis', get: (r) => fmtDate(r.cash_settled_at) }, { label: 'Vendeur payé', get: (r) => fmtDate(r.vendor_paid_at) }]);
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="alefa-colis-${new Date().toISOString().slice(0, 10)}.csv"` } });
}

// ---------------------------------------------------------------- marchands (logiciels de vente)
async function merchantsList(ctx, env) {
  return json({ merchants: await all(env, `SELECT m.id, m.name, m.key_prefix, m.webhook_url, m.active, m.created_at, m.last_used, u.name AS vendor_name, u.phone AS vendor_phone,
    (SELECT COUNT(*) FROM shipments s WHERE s.merchant_id = m.id) AS shipments FROM merchants m JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC`) });
}
async function newKey() { const key = 'ak_' + randomHex(24); return { key, prefix: key.slice(0, 10), hash: await sha256Hex(key) }; }
async function merchantCreate(ctx, env) {
  const b = ctx.body;
  const name = str(b.name, { min: 2, max: 80, name: 'Nom du logiciel / boutique' });
  const phone = normalizePhone(b.phone);
  let vendor = await one(env, 'SELECT * FROM users WHERE phone = ?', phone);
  if (!vendor) {
    const salt = randomHex(16), pw = randomHex(4);
    const r = await run(env, "INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, is_business, company, created_at) VALUES (?,?,'client',?,?,'active',1,?,?)",
      phone, name, await hashPassword(pw, salt, Number(env.PBKDF2_ITER || 10000)), salt, name, now());
    vendor = { id: r.meta.last_row_id, temp_password: pw };
  }
  const k = await newKey();
  const webhook = b.webhook_url ? str(b.webhook_url, { max: 300 }) : null;
  if (webhook && !/^https:\/\//.test(webhook)) fail(400, 'invalid', 'Le webhook doit commencer par https://');
  const secret = 'whsec_' + randomHex(16);
  await run(env, 'INSERT INTO merchants (name, user_id, key_prefix, key_hash, webhook_url, webhook_secret, created_at) VALUES (?,?,?,?,?,?,?)', name, vendor.id, k.prefix, k.hash, webhook, secret, now());
  await audit(env, ctx, 'merchant_create', { name });
  return json({ api_key: k.key, webhook_secret: secret, vendor_temp_password: vendor.temp_password || null }, 201);
}
async function merchantUpdate(ctx, env) {
  const m = await one(env, 'SELECT * FROM merchants WHERE id = ?', ctx.params.id) || fail(404, 'not_found', 'Marchand introuvable');
  const b = ctx.body, out = { ok: true };
  if (b.webhook_url !== undefined) {
    const w = b.webhook_url ? str(b.webhook_url, { max: 300 }) : null;
    if (w && !/^https:\/\//.test(w)) fail(400, 'invalid', 'Le webhook doit commencer par https://');
    await run(env, 'UPDATE merchants SET webhook_url = ? WHERE id = ?', w, m.id);
  }
  if (b.active !== undefined) await run(env, 'UPDATE merchants SET active = ? WHERE id = ?', b.active ? 1 : 0, m.id);
  if (b.regenerate) { const k = await newKey(); await run(env, 'UPDATE merchants SET key_prefix = ?, key_hash = ? WHERE id = ?', k.prefix, k.hash, m.id); out.api_key = k.key; }
  await audit(env, ctx, 'merchant_update', { id: m.id, regenerate: !!b.regenerate });
  return json(out);
}

// ---------------------------------------------------------------- API publique v1 (clé marchand)
export async function authenticateMerchant(req, env) {
  const h = req.headers.get('x-api-key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^ak_[a-f0-9]{48}$/.test(h)) return null;
  const m = await one(env, 'SELECT * FROM merchants WHERE key_hash = ? AND active = 1', await sha256Hex(h));
  if (m) await run(env, 'UPDATE merchants SET last_used = ? WHERE id = ?', now(), m.id);
  return m;
}
const byRef = async (env, m, ref) => {
  const s = await one(env, `${SHIP_SQL} WHERE s.merchant_id = ? AND (s.ref = ? OR s.external_ref = ?)`, m.id, ref, ref);
  if (!s) fail(404, 'not_found', 'Colis introuvable');
  return s;
};
async function v1Create(ctx, env) {
  const m = ctx.merchant;
  const sender = await one(env, 'SELECT * FROM users WHERE id = ?', m.user_id);
  // Clé d'idempotence : external_ref, ou à défaut l'en-tête Idempotency-Key.
  const body = { ...ctx.body, external_ref: ctx.body.external_ref || ctx.idempotencyKey || undefined };
  // Adresses sans GPS (cas de la plupart des logiciels de vente) : position recherchée automatiquement à Antananarivo.
  const { geocodeTana } = await import('./tsena.js');
  const dup = body.external_ref ? await one(env, 'SELECT id FROM shipments WHERE merchant_id = ? AND external_ref = ?', m.id, String(body.external_ref)) : null;
  if (!dup) {
    const rec = body.recipient || {}, snd = body.sender || {};
    if (rec.lat == null && body.drop_lat == null && (rec.address || body.drop_addr)) { const g = await geocodeTana(rec.address || body.drop_addr); if (g) body.recipient = { ...rec, lat: g[0], lng: g[1] }; }
    if (snd.lat == null && body.pickup_lat == null && (snd.address || body.pickup_addr)) { const g = await geocodeTana(snd.address || body.pickup_addr); if (g) body.sender = { ...snd, lat: g[0], lng: g[1] }; }
  }
  let r;
  try { r = await createShipment(env, body, { sender, source: 'api', merchant: m, actor: null }); }
  catch (e) { await logSync(env, `api:${m.name}`, 'in', body.external_ref, false, e.message); throw e; }
  await logSync(env, `api:${m.name}`, 'in', body.external_ref || r.shipment.ref, true, r.duplicate ? 'doublon ignoré' : `colis ${r.shipment.ref} créé`);
  return json({ duplicate: !!r.duplicate, shipment: { ...publicShipment(r.shipment), delivery_pin: r.shipment.pin } }, r.duplicate ? 200 : 201);
}
async function v1List(ctx, env) {
  const p = ctx.url.searchParams, args = [ctx.merchant.id];
  let sql = `${SHIP_SQL} WHERE s.merchant_id = ?`;
  if (p.get('status')) { sql += ' AND s.status = ?'; args.push(p.get('status')); }
  if (p.get('since')) { sql += ' AND s.created_at >= ?'; args.push(Number(p.get('since'))); }
  sql += ' ORDER BY s.created_at DESC LIMIT ?'; args.push(Math.min(200, Number(p.get('limit') || 50)));
  return json({ shipments: (await all(env, sql, ...args)).map(publicShipment) });
}
async function v1Get(ctx, env) {
  const s = await byRef(env, ctx.merchant, ctx.params.ref);
  const out = { ...publicShipment(s), delivery_pin: s.pin };
  out.events = await all(env, 'SELECT status, note, at FROM shipment_events WHERE shipment_id = ? ORDER BY id', s.id);
  if (s.courier_id && OPEN.includes(s.status)) {
    const c = await one(env, 'SELECT lat, lng, last_seen FROM couriers WHERE user_id = ?', s.courier_id);
    Object.assign(out.courier, { lat: c?.lat, lng: c?.lng, last_seen: c?.last_seen });
  }
  return json({ shipment: out });
}
async function v1Cancel(ctx, env) {
  const s = await byRef(env, ctx.merchant, ctx.params.ref);
  if (s.status !== 'pending' && s.status !== 'assigned') fail(409, 'picked', 'Colis déjà récupéré : annulation via le centre uniquement');
  const note = str(ctx.body.reason ?? ctx.body.note ?? 'Annulé par le logiciel de vente', { min: 2, max: 200 });
  await run(env, "UPDATE shipments SET status = 'cancelled', done_at = ?, outcome_note = ? WHERE id = ?", now(), note, s.id);
  await logEvent(env, s, 'cancelled', `API : ${note}`, null);
  if (s.courier_id) await notify(env, [s.courier_id], 'shipment_cancel', 'Colis annulé', `${s.ref} · ${note}`);
  await broadcast(env, s, 'Colis annulé', note);
  return json({ ok: true });
}
async function v1Photo(ctx, env) { const s = await byRef(env, ctx.merchant, ctx.params.ref); return photoResponse(env, s.id); }
async function v1Schedule(ctx, env) { return schedule(ctx, env); }
async function v1Quote(ctx, env) { return quoteShipment(ctx, env); }

// ---------------------------------------------------------------- étapes automatiques (GPS) et départ du centre
async function setStage(env, s, stage, user, title, body, notifyWho) {
  await run(env, 'UPDATE shipments SET stage = ?, stage_at = ? WHERE id = ?', stage, now(), s.id);
  await logEvent(env, s, stage, null, user);
  const fresh = await broadcast(env, s, title, body);
  if (notifyWho?.length) await notify(env, notifyWho, 'shipment', title, `${s.ref} · ${body || ''}`);
  return fresh;
}

export async function courierOpenShipments(env, cid) {
  const r = await one(env, "SELECT COUNT(*) AS n FROM shipments WHERE courier_id = ? AND (status = 'picked_up' OR (status = 'assigned' AND stage IS NOT NULL) OR (status IN ('refused','cancelled') AND picked_at IS NOT NULL AND returned_at IS NULL))", cid);
  return r.n;
}

// Appelé à chaque position GPS du livreur : met à jour les étapes et prévient expéditeur / destinataire.
export async function onCourierMove(env, u, lat, lng) {
  const rows = await all(env, "SELECT * FROM shipments WHERE courier_id = ? AND courier_confirmed_at IS NULL AND recipient_confirmed_at IS NULL AND (status = 'picked_up' OR (status = 'assigned' AND stage IS NOT NULL))", u.id);
  const changes = [];
  for (const s of rows) {
    const dP = s.pickup_lat != null ? haversineKm(lat, lng, s.pickup_lat, s.pickup_lng) : null;
    const dD = s.drop_lat != null ? haversineKm(lat, lng, s.drop_lat, s.drop_lng) : null;
    if (s.status === 'assigned' && s.stage === 'departed' && dP != null && dP <= 0.15) {
      await setStage(env, s, 'at_pickup', u, '🚲 Le livreur est arrivé chez l\'expéditeur', `${u.name.split(' ')[0]} récupère le colis`);
      changes.push([s.ref, 'at_pickup']);
    } else if (s.status === 'picked_up' && !onDeliveryRun(s)) {
      continue; // en route vers le centre : pas d'étape « tout proche » pour le client
    } else if (s.status === 'picked_up' && s.stage !== 'nearby' && dD != null && dD <= 0.3) {
      await setStage(env, s, 'nearby', u, '📍 Votre livreur est tout proche', `Moins de 300 m · préparez ${(toPay(s)).toLocaleString('fr-FR')} Ar`);
      changes.push([s.ref, 'nearby']);
    } else if (s.status === 'picked_up' && !s.stage && dP != null && dP > 0.2) {
      await setStage(env, s, 'en_route', u, '🚲 Colis en route', dD != null ? `${dD.toFixed(1).replace('.', ',')} km du destinataire` : 'Vers le destinataire');
      changes.push([s.ref, 'en_route']);
    }
  }
  return changes;
}

async function depart(ctx, env) {
  const u = ctx.user;
  const rows = await all(env, "SELECT * FROM shipments WHERE courier_id = ? AND status = 'assigned' AND stage IS NULL AND (departure_at IS NULL OR departure_at < ?)", u.id, now() + 3 * 3600e3);
  if (!rows.length) fail(409, 'nothing', 'Aucun colis programmé à emporter');
  for (const s of rows) await setStage(env, s, 'departed', u, '🚀 Le livreur est parti du centre', `${u.name.split(' ')[0]} est en route pour récupérer le colis`);
  await audit(env, ctx, 'courier_depart', { n: rows.length });
  return json({ ok: true, shipments: rows.length });
}

// Carte centre : colis en cours avec leur étape.
export async function liveShipments(env) {
  const rows = await all(env, `${SHIP_SQL} WHERE s.status IN ('pending','assigned','picked_up') OR (s.status IN ('refused','cancelled') AND s.picked_at IS NOT NULL AND s.returned_at IS NULL) ORDER BY s.created_at DESC LIMIT 300`);
  return rows.map((s) => ({ id: s.id, ref: s.ref, step: stepOf(s), step_label: STEP_FR[stepOf(s)], courier_id: s.courier_id, courier: s.courier_name,
    sender: s.sender_name, recipient: s.recipient_name, pickup: s.pickup_lat != null ? [s.pickup_lat, s.pickup_lng] : null, drop: s.drop_lat != null ? [s.drop_lat, s.drop_lng] : null,
    pickup_addr: s.pickup_addr, drop_addr: s.drop_addr, amount: toPay(s), departure_at: s.departure_at }));
}

// Fil des mouvements : étapes des colis + actions importantes des clients, livreurs et du centre.
export async function liveFeed(env) {
  const ev = await all(env, `SELECT e.at, e.status, e.note, s.ref, u.name AS who, u.role FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id
    LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 40`);
  const au = await all(env, `SELECT a.at, a.action, a.detail, u.name AS who, u.role FROM audit a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.action IN ('register','login','delivery_create','delivery_cancel','delivery_pickup','delivery_done','offer_accept','sos','complaint','courier_online','courier_offline','courier_depart','courier_schedule','shipment_create','cash_settle','vendor_pay')
    ORDER BY a.id DESC LIMIT 40`);
  const A = { register: 'inscription', login: 'connexion', delivery_create: 'nouvelle course express', delivery_cancel: 'course annulée', delivery_pickup: 'course : colis récupéré',
    delivery_done: 'course livrée', offer_accept: 'offre acceptée', sos: '🚨 SOS', complaint: 'réclamation', courier_online: 'disponible', courier_offline: 'indisponible',
    courier_depart: '🚀 parti du centre', courier_schedule: 'planning modifié', shipment_create: 'nouveau colis', cash_settle: '💵 argent remis au centre', vendor_pay: '💰 vendeur payé' };
  return [
    ...ev.map((e) => ({ at: e.at, kind: 'shipment', who: e.who || (e.status === 'pending' ? 'API' : 'Centre'), role: e.role, text: `${e.ref} · ${STEP_FR[e.status] || e.status}${e.note ? ' — ' + e.note : ''}` })),
    ...au.map((a) => ({ at: a.at, kind: a.action, who: a.who || '—', role: a.role, text: A[a.action] || a.action })),
  ].sort((x, y) => y.at - x.at).slice(0, 60);
}

// ---------------------------------------------------------------- enregistrement des routes
export function registerShipmentRoutes(route) {
  const ANY = ['client', 'courier', 'admin'];
  route('GET', '/api/schedule', ANY, schedule);
  route('POST', '/api/shipments/quote', ANY, quoteShipment);
  route('GET', '/api/shipments', ANY, listMine);
  route('POST', '/api/shipments', ['client', 'admin'], appCreate);
  route('POST', '/api/shipments/bulk', ['client', 'admin'], bulkCreate);
  route('GET', '/api/shipments/balance', ['client'], myBalance);
  route('GET', '/api/shipments/:id', ANY, getOne);
  route('GET', '/api/shipments/:id/photo', ANY, photo);
  route('POST', '/api/shipments/:id/fee', ['courier', 'admin'], setFee);
  route('POST', '/api/shipments/:id/assign', ['admin'], assign);
  route('POST', '/api/shipments/:id/pickup', ['courier'], pickup);
  route('POST', '/api/shipments/:id/drop-centre', ['courier', 'admin'], dropAtCentre);
  route('POST', '/api/shipments/:id/take-centre', ['courier', 'admin'], takeFromCentre);
  route('POST', '/api/admin/shipments/:id/plan', ['admin'], planLegs);
  route('GET', '/api/admin/shipments/:id/suggest', ['admin'], suggestCouriers);
  route('GET', '/api/admin/courier-stats', ['admin'], adminCourierStats);
  route('GET', '/api/courier/stats', ['courier'], myStats);
  route('GET', '/api/shipments/:id/delivery-photo', ['admin', 'client', 'courier'], deliveryPhoto);
  route('POST', '/api/shipments/:id/accept', ['courier'], acceptMission);
  route('POST', '/api/shipments/:id/decline', ['courier'], declineMission);
  route('POST', '/api/shipments/:id/deliver', ['courier'], deliver);
  route('POST', '/api/shipments/:id/confirm', ['client', 'admin'], recipientConfirm);
  route('POST', '/api/shipments/:id/refuse', ['courier'], refuse);
  route('POST', '/api/shipments/:id/cancel', ANY, cancel);
  route('POST', '/api/shipments/:id/returned', ['courier'], returned);
  route('GET', '/api/courier/schedule', ['courier'], mySchedule);
  route('POST', '/api/courier/depart', ['courier'], depart);
  // Axes et heures des livreurs : saisis par le centre (Admin → Livreurs → 🧭 Axes), le livreur les consulte seulement.
  route('GET', '/api/admin/shipments', ['admin'], adminList);
  route('GET', '/api/admin/shipments/export', ['admin'], adminExportShipments);
  route('GET', '/api/admin/cash', ['admin'], cashOverview);
  route('POST', '/api/admin/couriers/:id/settle', ['admin'], settleCourier);
  route('POST', '/api/admin/vendors/:id/pay', ['admin'], payVendor);
  route('GET', '/api/admin/merchants', ['admin'], merchantsList);
  route('POST', '/api/admin/merchants', ['admin'], merchantCreate);
  route('POST', '/api/admin/merchants/:id', ['admin'], merchantUpdate);
  route('GET', '/api/v1/schedule', 'merchant', v1Schedule);
  route('POST', '/api/v1/quote', 'merchant', v1Quote);
  route('GET', '/api/v1/shipments', 'merchant', v1List);
  route('POST', '/api/v1/shipments', 'merchant', v1Create);
  route('GET', '/api/v1/shipments/:ref', 'merchant', v1Get);
  route('POST', '/api/v1/shipments/:ref/cancel', 'merchant', v1Cancel);
  route('GET', '/api/v1/shipments/:ref/photo', 'merchant', v1Photo);
}
