// Colis gérés par le centre : récupération chez l'expéditeur et livraison au destinataire en un seul trajet,
// selon les départs (heure + axe) déclarés par les livreurs. Le destinataire paie valeur + frais ;
// le centre reverse la valeur à l'expéditeur une fois l'argent remis par le livreur.
import { fail, json, str, int, normalizePhone, randomHex, hashPassword, haversineKm, now, csv, fmtDate } from './lib.js';
import { q, one, all, run, settings, audit, notify, alertAdmins, inAxe, SLOT_SQL } from './worker.js';

const OPEN = ['pending', 'assigned', 'picked_up'];
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
  if (s.status === 'picked_up') return s.stage === 'nearby' ? 'nearby' : s.stage === 'en_route' ? 'en_route' : 'picked_up';
  if (['refused', 'cancelled'].includes(s.status)) return s.returned_at ? 'returned' : s.picked_at ? 'returning' : s.status;
  return s.status;
}
const STEP_FR = { pending: 'À programmer', scheduled: 'Programmé', departed: 'Parti du centre', at_pickup: 'Arrivé chez l\'expéditeur', picked_up: 'Récupéré',
  en_route: 'En route vers le destinataire', nearby: 'Livreur tout proche', delivered: 'Livré', refused: 'Refusé', cancelled: 'Annulé', returning: 'Retour vers l\'expéditeur', returned: 'Rendu à l\'expéditeur', assigned: 'Programmé', fee: 'Frais modifiés' };

const toPay = (s) => (s.value ?? s.declared_value) + s.fee; // montant à encaisser auprès du destinataire

export function publicShipment(s) {
  return {
    id: s.id, ref: s.ref, external_ref: s.external_ref, status: s.status, step: stepOf(s), step_label: STEP_FR[stepOf(s)], stage_at: s.stage_at, source: s.source,
    sender: { name: s.sender_name, phone: s.sender_phone, address: s.pickup_addr, lat: s.pickup_lat, lng: s.pickup_lng },
    recipient: { name: s.recipient_name, phone: s.recipient_phone, address: s.drop_addr, lat: s.drop_lat, lng: s.drop_lng },
    description: s.description, declared_value: s.declared_value, value: s.value, fee: s.fee, amount_to_collect: toPay(s),
    collected: s.collected, return_fee: s.return_fee, outcome_note: s.outcome_note, has_photo: !!s.photo,
    courier: s.courier_id ? { id: s.courier_id, name: s.courier_name ?? null } : null,
    axe: s.axe_name ?? null, departure_at: s.departure_at,
    returned: !!s.returned_at, created_at: s.created_at, assigned_at: s.assigned_at, picked_at: s.picked_at, done_at: s.done_at, returned_at: s.returned_at,
  };
}

const SHIP_SQL = `SELECT s.*, cu.name AS courier_name, a.name AS axe_name FROM shipments s
  LEFT JOIN users cu ON cu.id = s.courier_id LEFT JOIN axes a ON a.id = s.axe_id`;

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
        await fetch(m.webhook_url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Alefa-Event': 'shipment.updated', 'X-Alefa-Signature': await hmacHex(m.webhook_secret, payload) }, body: payload });
        clearTimeout(tm);
      } catch (e) { console.warn('webhook', m.id, e?.message); }
    }
  }
  return fresh;
}

// ---------------------------------------------------------------- départs (heure + axe déclarés par les livreurs)
export async function departures(env, { days = 2, includePast = false } = {}) {
  const slots = (await all(env, `${SLOT_SQL} JOIN users u ON u.id = ca.courier_id JOIN couriers c ON c.user_id = ca.courier_id
    WHERE a.active = 1 AND u.status = 'active'`.replace('SELECT ca.*,', 'SELECT ca.*, c.lat AS clat, c.lng AS clng, c.last_seen AS cseen,')));
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
        axe_id: x.axe_id, axe: x.name, color: x.color, center_lat: x.center_lat, center_lng: x.center_lng, radius_km: x.radius_km,
        departure_at: dep, return_at: end, started: dep <= now(),
        load: loads.find((l) => l.slot_id === x.id && l.departure_at === dep)?.n || 0,
        lat: dep <= now() ? x.clat : null, lng: dep <= now() ? x.clng : null, last_seen: dep <= now() ? x.cseen : null,
      });
    }
  }
  return out.sort((a, b) => a.departure_at - b.departure_at);
}

// Premier départ à venir dont l'axe couvre la destination (et si possible le point de récupération).
async function pickDeparture(env, s) {
  if (s.drop_lat == null) return null;
  const deps = (await departures(env)).filter((d) => !d.started && inAxe(d, s.drop_lat, s.drop_lng));
  return deps.find((d) => s.pickup_lat == null || inAxe(d, s.pickup_lat, s.pickup_lng)) || deps[0] || null;
}

async function assignTo(env, s, dep, user) {
  await run(env, "UPDATE shipments SET courier_id = ?, slot_id = ?, axe_id = ?, departure_at = ?, status = 'assigned', assigned_at = ? WHERE id = ?",
    dep.courier_id, dep.slot_id ?? null, dep.axe_id ?? null, dep.departure_at ?? null, now(), s.id);
  await logEvent(env, s, 'assigned', dep.axe ? `${dep.courier} · ${dep.axe}` : null, user);
  await notify(env, [dep.courier_id], 'shipment_assigned', '📦 Nouveau colis', `${s.ref} · ${s.pickup_addr} → ${s.drop_addr}${dep.departure_at ? ' · départ ' + fmtDate(dep.departure_at).slice(11) : ''}`);
  return broadcast(env, s, 'Colis programmé', dep.departure_at ? `Départ ${fmtDate(dep.departure_at)} (${dep.axe})` : 'Livreur attribué');
}

// ---------------------------------------------------------------- création (application, admin, API)
async function createShipment(env, b, { sender, source, merchant = null, actor }) {
  const recipient_phone = normalizePhone(b.recipient?.phone ?? b.recipient_phone);
  const [plat, plng] = optCoord(b.sender?.lat ?? b.pickup_lat, b.sender?.lng ?? b.pickup_lng);
  const [dlat, dlng] = optCoord(b.recipient?.lat ?? b.drop_lat, b.recipient?.lng ?? b.drop_lng);
  const declared = int(b.declared_value ?? b.value ?? 0, { min: 0, max: 50_000_000, name: 'Valeur de la marchandise' });
  if (merchant && b.external_ref) {
    const dup = await one(env, 'SELECT id FROM shipments WHERE merchant_id = ? AND external_ref = ?', merchant.id, String(b.external_ref));
    if (dup) return { duplicate: true, shipment: await loadShipment(env, dup.id) };
  }
  let fee = await feeFor(env, dlat, dlng);
  if (actor?.role === 'admin' && b.fee != null) fee = int(b.fee, { min: 0, max: 1_000_000, name: 'Frais' });
  let ref = genRef();
  while (await one(env, 'SELECT id FROM shipments WHERE ref = ?', ref)) ref = genRef();
  const res = await run(env, `INSERT INTO shipments (ref, source, merchant_id, external_ref, sender_id, sender_name, sender_phone, pickup_addr, pickup_lat, pickup_lng,
      recipient_name, recipient_phone, drop_addr, drop_lat, drop_lng, description, declared_value, fee, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ref, source, merchant?.id ?? null, b.external_ref ? String(b.external_ref).slice(0, 60) : null, sender.id,
    str(b.sender?.name ?? b.sender_name ?? sender.name, { min: 2, max: 80, name: 'Nom de l\'expéditeur' }),
    b.sender?.phone || b.sender_phone ? normalizePhone(b.sender?.phone ?? b.sender_phone) : sender.phone,
    str(b.sender?.address ?? b.pickup_addr, { min: 3, max: 200, name: 'Adresse de récupération' }), plat, plng,
    str(b.recipient?.name ?? b.recipient_name, { min: 2, max: 80, name: 'Nom du destinataire' }), recipient_phone,
    str(b.recipient?.address ?? b.drop_addr, { min: 3, max: 200, name: 'Adresse de livraison' }), dlat, dlng,
    str(b.description, { max: 300 }), declared, fee, now());
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
  if (u.role === 'admin' || s.sender_id === u.id || s.courier_id === u.id) return true;
  return u.role === 'client' && s.recipient_phone === u.phone;
}

// ---------------------------------------------------------------- routes application
async function schedule(ctx, env) {
  const st = await settings(env);
  const axes = await all(env, 'SELECT id, name, color, center_lat, center_lng, radius_km, fee FROM axes WHERE active = 1 ORDER BY name');
  return json({ departures: await departures(env, { days: 2, includePast: false }), axes, default_fee: Number(st.default_fee || 3000), centre: { name: st.centre_name, address: st.centre_addr } });
}

async function quoteShipment(ctx, env) {
  const [lat, lng] = optCoord(ctx.body.drop_lat, ctx.body.drop_lng);
  const fee = await feeFor(env, lat, lng);
  const deps = lat == null ? [] : (await departures(env)).filter((d) => !d.started && inAxe(d, lat, lng));
  return json({ fee, departures: deps });
}

async function appCreate(ctx, env) {
  const u = ctx.user;
  let sender = u;
  if (u.role === 'admin') {
    const phone = normalizePhone(ctx.body.sender_phone);
    sender = await one(env, 'SELECT * FROM users WHERE phone = ?', phone) || fail(404, 'not_found', 'Expéditeur introuvable : créez d\'abord son compte client');
  }
  const r = await createShipment(env, ctx.body, { sender, source: u.role === 'admin' ? 'admin' : 'app', actor: u });
  await audit(env, ctx, 'shipment_create', { ref: r.shipment.ref });
  return json({ shipment: publicShipment(r.shipment) }, 201);
}

async function listMine(ctx, env) {
  const u = ctx.user;
  let rows;
  if (u.role === 'courier') {
    rows = await all(env, `${SHIP_SQL} WHERE s.courier_id = ? AND (s.status IN ('assigned','picked_up') OR (s.status IN ('refused','cancelled') AND s.picked_at IS NOT NULL AND s.returned_at IS NULL) OR s.done_at > ?)
      ORDER BY COALESCE(s.departure_at, s.created_at)`, u.id, mgMidnight(0));
  } else {
    rows = await all(env, `${SHIP_SQL} WHERE s.sender_id = ? OR s.recipient_phone = ? ORDER BY s.created_at DESC LIMIT 100`, u.id, u.phone);
  }
  const live = {};
  const trackIds = [...new Set(rows.filter((s) => s.courier_id && (s.status === 'picked_up' || (s.status === 'assigned' && s.stage))).map((s) => s.courier_id))];
  if (u.role !== 'courier' && trackIds.length) {
    for (const c of await all(env, `SELECT user_id, lat, lng, last_seen FROM couriers WHERE user_id IN (${trackIds.map(() => '?').join(',')})`, ...trackIds)) live[c.user_id] = c;
  }
  return json({ shipments: rows.map((s) => ({ ...publicShipment(s), courier_live: live[s.courier_id] && (s.status === 'picked_up' || s.stage) ? live[s.courier_id] : null, mine_as: s.sender_id === u.id ? 'sender' : s.recipient_phone === u.phone ? 'recipient' : 'courier', to_return: ['refused', 'cancelled'].includes(s.status) && s.picked_at && !s.returned_at })) });
}

async function getOne(ctx, env) {
  const u = ctx.user;
  const s = await loadShipment(env, ctx.params.id);
  if (!(await canSee(env, u, s))) fail(403, 'forbidden', 'Accès refusé');
  const out = publicShipment(s);
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
    q(env, "UPDATE shipments SET status = 'picked_up', picked_at = ?, value = ?, fee = ?, photo = 1, stage = NULL, stage_at = ? WHERE id = ?", now(), value, fee, now(), s.id),
  ]);
  await logEvent(env, s, 'picked_up', `Valeur ${value} Ar · frais ${fee} Ar`, ctx.user, b.lat ?? null, b.lng ?? null);
  if (s.declared_value && Math.abs(value - s.declared_value) > Math.max(1000, s.declared_value * 0.2))
    await alertAdmins(env, 'alert', `Colis ${s.ref} : valeur saisie ${value} Ar ≠ valeur annoncée ${s.declared_value} Ar`, null, ctx.user.id);
  await broadcast(env, s, '📦 Colis récupéré', `Valeur ${value.toLocaleString('fr-FR')} Ar · à payer ${(value + fee).toLocaleString('fr-FR')} Ar`);
  return json({ ok: true, amount_to_collect: value + fee });
}

async function deliver(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['picked_up']);
  const due = toPay(s);
  const collected = ctx.body.collected == null ? due : int(ctx.body.collected, { min: 0, max: 60_000_000, name: 'Montant encaissé' });
  await run(env, "UPDATE shipments SET status = 'delivered', collected = ?, done_at = ?, outcome_note = ? WHERE id = ?", collected, now(), str(ctx.body.note, { max: 200 }) || null, s.id);
  await logEvent(env, s, 'delivered', `Encaissé ${collected} Ar`, ctx.user, ctx.body.lat ?? null, ctx.body.lng ?? null);
  if (collected !== due) await alertAdmins(env, 'alert', `Colis ${s.ref} : encaissé ${collected} Ar au lieu de ${due} Ar`, null, ctx.user.id);
  await broadcast(env, s, '✅ Colis livré', `Encaissé ${collected.toLocaleString('fr-FR')} Ar`);
  return json({ ok: true, collected });
}

// Le destinataire refuse la marchandise : il paie les frais de livraison, le colis retourne à l'expéditeur.
async function refuse(ctx, env) {
  const s = await courierGuardShip(ctx, env, ['picked_up']);
  const collected = ctx.body.collected == null ? s.fee : int(ctx.body.collected, { min: 0, max: 1_000_000, name: 'Frais encaissés' });
  const note = str(ctx.body.note, { min: 2, max: 200, name: 'Motif du refus' });
  await run(env, "UPDATE shipments SET status = 'refused', collected = ?, done_at = ?, outcome_note = ? WHERE id = ?", collected, now(), note, s.id);
  await logEvent(env, s, 'refused', `${note} · frais encaissés ${collected} Ar`, ctx.user);
  if (collected < s.fee) await alertAdmins(env, 'alert', `Colis ${s.ref} refusé : frais encaissés ${collected} Ar au lieu de ${s.fee} Ar`, null, ctx.user.id);
  await broadcast(env, s, '↩️ Colis refusé par le destinataire', `${note} — retour à l'expéditeur`);
  return json({ ok: true, collected });
}

// Annulation : avant récupération → simple annulation. Après récupération → retour à l'expéditeur, qui paie les frais.
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
export async function saveSlots(env, cid, slotsIn) {
  const slots = Array.isArray(slotsIn) ? slotsIn.slice(0, 96) : [];
  const stmts = [q(env, 'DELETE FROM courier_axes WHERE courier_id = ?', cid)];
  for (const x of slots) {
    const start = int(x.start_min, { min: 0, max: 1439, name: 'Heure de départ' }), end = int(x.end_min, { min: 1, max: 1440, name: 'Heure de retour' });
    if (end <= start) fail(400, 'invalid', 'L\'heure de retour doit être après l\'heure de départ');
    if (!(await one(env, 'SELECT id FROM axes WHERE id = ?', int(x.axe_id)))) fail(400, 'invalid', 'Axe inconnu');
    const days = String(x.days || '1234567').replace(/[^1-7]/g, '') || '1234567';
    stmts.push(q(env, 'INSERT INTO courier_axes (courier_id, axe_id, start_min, end_min, days) VALUES (?,?,?,?,?)', cid, int(x.axe_id), start, end, days));
  }
  await env.DB.batch(stmts);
}
async function mySchedule(ctx, env) {
  const slots = await all(env, `${SLOT_SQL} WHERE ca.courier_id = ? ORDER BY ca.start_min`, ctx.user.id);
  const axes = await all(env, 'SELECT id, name, color, center_lat, center_lng, radius_km FROM axes WHERE active = 1 ORDER BY name');
  return json({ slots, axes });
}
async function saveMySchedule(ctx, env) {
  await saveSlots(env, ctx.user.id, ctx.body.slots);
  await audit(env, ctx, 'courier_schedule', { slots: (ctx.body.slots || []).length });
  return json({ ok: true });
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
    WHERE s.status IN ('delivered','refused') AND s.cash_settled_at IS NULL GROUP BY u.id ORDER BY cash DESC`);
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
  const rows = await all(env, "SELECT id, collected FROM shipments WHERE courier_id = ? AND status IN ('delivered','refused') AND cash_settled_at IS NULL", cid);
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
  const r = await createShipment(env, ctx.body, { sender, source: 'api', merchant: m, actor: null });
  return json({ duplicate: !!r.duplicate, shipment: publicShipment(r.shipment) }, r.duplicate ? 200 : 201);
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
  const out = publicShipment(s);
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
  const rows = await all(env, "SELECT * FROM shipments WHERE courier_id = ? AND (status = 'picked_up' OR (status = 'assigned' AND stage IS NOT NULL))", u.id);
  const changes = [];
  for (const s of rows) {
    const dP = s.pickup_lat != null ? haversineKm(lat, lng, s.pickup_lat, s.pickup_lng) : null;
    const dD = s.drop_lat != null ? haversineKm(lat, lng, s.drop_lat, s.drop_lng) : null;
    if (s.status === 'assigned' && s.stage === 'departed' && dP != null && dP <= 0.15) {
      await setStage(env, s, 'at_pickup', u, '🚲 Le livreur est arrivé chez l\'expéditeur', `${u.name.split(' ')[0]} récupère le colis`);
      changes.push([s.ref, 'at_pickup']);
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
  route('GET', '/api/shipments/balance', ['client'], myBalance);
  route('GET', '/api/shipments/:id', ANY, getOne);
  route('GET', '/api/shipments/:id/photo', ANY, photo);
  route('POST', '/api/shipments/:id/fee', ['courier', 'admin'], setFee);
  route('POST', '/api/shipments/:id/assign', ['admin'], assign);
  route('POST', '/api/shipments/:id/pickup', ['courier'], pickup);
  route('POST', '/api/shipments/:id/deliver', ['courier'], deliver);
  route('POST', '/api/shipments/:id/refuse', ['courier'], refuse);
  route('POST', '/api/shipments/:id/cancel', ANY, cancel);
  route('POST', '/api/shipments/:id/returned', ['courier'], returned);
  route('GET', '/api/courier/schedule', ['courier'], mySchedule);
  route('POST', '/api/courier/depart', ['courier'], depart);
  route('PUT', '/api/courier/schedule', ['courier'], saveMySchedule);
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
