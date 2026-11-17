// Synchronisation automatique avec Tsena Ampandrana (logiciel de vente sur Firebase).
// Chaque minute : les livraisons « En attente » écrites dans Tsena deviennent des colis Alefa,
// et l'avancement Alefa est réécrit dans Tsena (En route → Livrée, livreur, code de réception).
// Le mot de passe Tsena n'est jamais conservé : seul un jeton de rafraîchissement Firebase est gardé.
import { fail, json, str, normalizePhone, randomHex, hashPassword, now } from './lib.js';
import { one, all, run, settings, audit, alertAdmins } from './worker.js';
import { createShipment, stepOf, STEP_LABELS, partnerCancel, partnerUpdate } from './shipments.js';
import { logSync } from './trips.js';

const KEYS = ['tsena_url', 'tsena_project', 'tsena_api_key', 'tsena_refresh', 'tsena_email', 'tsena_shop_name', 'tsena_shop_phone', 'tsena_pickup_addr', 'tsena_last_sync', 'tsena_last_result', 'tsena_last_error'];
const setMany = (env, obj) => env.DB.batch(Object.entries(obj).map(([k, v]) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, String(v ?? ''))));

// ---------------------------------------------------------------- Firestore (REST)
const fromFs = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  return null;
};
const toFs = (x) => (Array.isArray(x) ? { arrayValue: { values: x.map(toFs) } }
  : x && typeof x === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toFs(v)])) } }
  : typeof x === 'number' ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x })
  : typeof x === 'boolean' ? { booleanValue: x } : x == null ? { nullValue: null } : { stringValue: String(x) });

async function http(url, init) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error('Accès refusé par Tsena (403) : le compte Tsena relié n\'a plus le droit de lire/écrire les livraisons');
  if (!r.ok) throw new Error(j.error?.message || j.error_description || `HTTP ${r.status}`);
  return j;
}

// Adresse du logiciel → identifiants Firebase publics (firebase-config.js).
async function readConfig(siteUrl) {
  const base = siteUrl.replace(/\/+$/, '').replace(/#.*$/, '');
  const r = await fetch(`${base}/firebase-config.js`);
  if (!r.ok) fail(400, 'tsena_config', 'Configuration Firebase introuvable à cette adresse');
  const t = await r.text();
  const apiKey = (t.match(/apiKey\s*:\s*["']([^"']+)/) || [])[1], project = (t.match(/projectId\s*:\s*["']([^"']+)/) || [])[1];
  if (!apiKey || !project) fail(400, 'tsena_config', 'Configuration Firebase illisible');
  return { apiKey, project, base };
}

async function idToken(env, s) {
  if (!s.tsena_refresh) throw new Error('Tsena non connecté');
  const j = await http(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(s.tsena_api_key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.tsena_refresh)}`,
  });
  if (j.refresh_token && j.refresh_token !== s.tsena_refresh) await setMany(env, { tsena_refresh: j.refresh_token });
  return j.id_token;
}
const docsBase = (s) => `https://firestore.googleapis.com/v1/projects/${s.tsena_project}/databases/(default)/documents`;

// Statuts Tsena : attente → confirmee → cours → livree (ou annulee).
const OPEN_ST = ['attente', 'confirmee', 'cours'];
const RANK = { attente: 0, confirmee: 1, cours: 2, livree: 3 };
async function waitingDeliveries(s, token) {
  const j = await http(`${docsBase(s)}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'deliveries' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: OPEN_ST.map((v) => ({ stringValue: v })) } } } }, limit: 300 } }),
  });
  return (Array.isArray(j) ? j : []).filter((x) => x.document).map((x) => ({
    docId: x.document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, fromFs(v)])),
  }));
}

// Lecture des livraisons Tsena déjà reliées (pour voir les suppressions, « Livrée » faite par la boutique, modifications).
async function getDeliveries(s, token, ids) {
  if (!ids.length) return {};
  const base = `projects/${s.tsena_project}/databases/(default)/documents/deliveries/`;
  const j = await http(`${docsBase(s)}:batchGet`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ documents: ids.map((id) => base + id) }) });
  const out = {};
  for (const x of Array.isArray(j) ? j : []) {
    if (x.found) out[x.found.name.split('/').pop()] = Object.fromEntries(Object.entries(x.found.fields || {}).map(([k, v]) => [k, fromFs(v)]));
    else if (x.missing) out[x.missing.split('/').pop()] = null; // supprimée
  }
  return out;
}

async function patchDelivery(s, token, docId, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  // currentDocument.exists : une livraison supprimée dans Tsena n'est jamais recréée par Alefa.
  await http(`${docsBase(s)}/deliveries/${encodeURIComponent(docId)}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFs(v)])) }),
  });
}

// Table créée au premier usage (même contenu que migrations/0006_tsena.sql).
let schemaOk = false;
async function ensureSchema(env) {
  if (schemaOk) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS tsena_links (shipment_id INTEGER PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE, doc_id TEXT NOT NULL UNIQUE, last_step TEXT, synced_at INTEGER, base_note TEXT)').run();
  schemaOk = true;
}

// Adresse Tsena (texte libre) → position GPS, pour pouvoir trouver un livreur dont le trajet y passe.
export async function geocodeTana(addr) {
  if (!addr || addr.length < 3) return null;
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mg&viewbox=47.40,-18.80,47.65,-19.02&bounded=1&q=${encodeURIComponent(addr + ', Antananarivo')}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Alefa-livraison/1.0 (centre de livraison Antananarivo)', 'Accept-Language': 'fr' } });
    const j = await r.json();
    return j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- synchronisation
// Compte « boutique » (expéditeur des colis Tsena), créé automatiquement.
// Si le numéro indiqué est celui d'un admin ou d'un livreur, un compte boutique séparé est créé quand même
// (numéro interne), pour que l'argent des ventes ne parte jamais sur le compte de l'admin ou du livreur.
async function shopAccount(env, s) {
  const name = s.tsena_shop_name || 'Tsena Ampandrana';
  let u = s.tsena_shop_user ? await one(env, "SELECT * FROM users WHERE id = ? AND role = 'client'", Number(s.tsena_shop_user)) : null;
  let phone = s.tsena_shop_phone ? normalizePhone(s.tsena_shop_phone) : null;
  if (!u) u = phone ? await one(env, 'SELECT * FROM users WHERE phone = ?', phone) : null;
  if (u && u.role !== 'client') { u = null; phone = null; }
  if (!u) {
    if (!phone) do { phone = '+2610' + String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e8).padStart(8, '0'); } while (await one(env, 'SELECT id FROM users WHERE phone = ?', phone));
    const salt = randomHex(16);
    const r = await run(env, "INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, is_business, company, created_at) VALUES (?,?,'client',?,?,'active',1,?,?)",
      phone, name, await hashPassword(randomHex(6), salt, Number(env.PBKDF2_ITER || 10000)), salt, name, now());
    u = await one(env, 'SELECT * FROM users WHERE id = ?', r.meta.last_row_id);
  }
  await setMany(env, { tsena_shop_user: u.id });
  // Colis Tsena encore ouverts rattachés au mauvais compte (admin/livreur) : remis sur la boutique.
  await run(env, `UPDATE shipments SET sender_id = ?, sender_name = ? WHERE id IN (SELECT shipment_id FROM tsena_links)
    AND status IN ('pending','assigned','picked_up') AND sender_id IN (SELECT id FROM users WHERE role <> 'client')`, u.id, name);
  return u;
}

// Le statut Alefa est ajouté à la note Tsena (visible sur la carte de livraison), sans perdre la note d'origine.
const MARK = '🚲 Alefa :';
const baseNote = (note) => String(note ?? '').split(MARK)[0].replace(/\s*—\s*$/, '').trim();
const noteWith = (base, text) => (base ? `${base} — ${MARK} ${text}` : `${MARK} ${text}`);
const fmtMg = (ms) => { const d = new Date(ms + 3 * 3600e3).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`; };

// Étape Alefa → statut Tsena (attente / cours / livree).
const TSENA_STATUS = { scheduled: 'confirmee', departed: 'cours', at_pickup: 'cours', picked_up: 'cours', en_route: 'cours', nearby: 'cours', awaiting_recipient: 'cours', awaiting_courier: 'cours', delivered: 'livree' };

export async function syncTsena(env) {
  const s = await settings(env);
  if (!s.tsena_refresh) return { skipped: 'not_connected' };
  await ensureSchema(env);
  const out = { imported: 0, updated: 0, errors: [] };
  try {
    const token = await idToken(env, s);
    // 1. Tsena → Alefa : nouvelles livraisons « En attente ».
    const docs = await waitingDeliveries(s, token);
    const known = new Set((await all(env, 'SELECT doc_id FROM tsena_links')).map((x) => x.doc_id));
    // Livraisons déjà présentes dans Alefa (import manuel, même n°) : on les relie simplement.
    for (const d of docs.filter((x) => !known.has(x.docId) && x.no)) {
      const ex = await one(env, "SELECT id FROM shipments WHERE external_ref = ? AND status <> 'cancelled' AND id NOT IN (SELECT shipment_id FROM tsena_links) ORDER BY id DESC LIMIT 1", d.no);
      if (ex) { await run(env, 'INSERT OR IGNORE INTO tsena_links (shipment_id, doc_id, last_step, synced_at) VALUES (?,?,?,?)', ex.id, d.docId, null, now()); known.add(d.docId); out.linked = (out.linked || 0) + 1; }
    }
    const fresh = docs.filter((d) => !known.has(d.docId) && d.phone && ['attente', 'confirmee'].includes(d.status));
    if (fresh.length) {
      const sender = await shopAccount(env, s);
      for (const d of fresh) {
        try {
          const drop = await geocodeTana(d.address);
          const r = await createShipment(env, {
            drop_lat: drop?.[0], drop_lng: drop?.[1], pickup_lat: s.tsena_pickup_lat || undefined, pickup_lng: s.tsena_pickup_lng || undefined,
            external_ref: d.no || d.docId, recipient_name: d.clientName || 'Client', recipient_phone: d.phone, drop_addr: d.address || 'Adresse à confirmer',
            pickup_addr: s.tsena_pickup_addr || s.tsena_shop_name || 'Boutique', declared_value: Math.max(0, Math.round(Number(d.amount) || 0)),
            description: baseNote(d.note), fee: Number(d.fee) > 0 ? Math.round(Number(d.fee)) : undefined,
            sender_phone: s.tsena_shop_phone || undefined,
          }, { sender, source: 'api', actor: { role: 'admin', id: null } });
          await run(env, 'INSERT OR IGNORE INTO tsena_links (shipment_id, doc_id, last_step, synced_at) VALUES (?,?,?,?)', r.shipment.id, d.docId, null, now());
          out.imported += 1;
          await logSync(env, 'tsena', 'in', d.no || d.docId, true, `colis ${r.shipment.ref} créé${drop ? '' : ' (adresse à localiser)'}${r.shipment.courier_id ? ' · ' + (r.shipment.courier_name || '').split(' ')[0] : ''}`);
        } catch (e) { out.errors.push(`${d.no || d.docId} : ${e.message}`); await logSync(env, 'tsena', 'in', d.no || d.docId, false, e.message); }
      }
    }
    // Colis Tsena encore ouverts au nom d'un admin/livreur : remis automatiquement sur le compte boutique.
    const wrong = await one(env, `SELECT COUNT(*) AS n FROM shipments WHERE id IN (SELECT shipment_id FROM tsena_links) AND status IN ('pending','assigned','picked_up')
      AND sender_id IN (SELECT id FROM users WHERE role <> 'client')`);
    if (wrong.n) await shopAccount(env, s);

    // 2. Tsena → Alefa : changements faits dans Tsena sur les livraisons déjà envoyées.
    const open = await all(env, `SELECT l.doc_id, l.last_step, s.id, s.status, s.drop_addr FROM tsena_links l JOIN shipments s ON s.id = l.shipment_id
      WHERE s.status IN ('pending','assigned','picked_up')`);
    if (open.length) {
      const seen = Object.fromEntries(docs.map((d) => [d.docId, d]));
      const fetched = await getDeliveries(s, token, open.filter((o) => !seen[o.doc_id]).map((o) => o.doc_id).slice(0, 100));
      for (const o of open) {
        const d = o.doc_id in seen ? seen[o.doc_id] : fetched[o.doc_id];
        if (d === undefined) continue;
        try {
          // Annulée, supprimée ou livrée par la boutique dans Tsena : le colis Alefa est annulé et le lien retiré
          // (si la livraison est « remise en attente » dans Tsena, elle repart comme une nouvelle demande).
          const why = d === null ? 'Livraison supprimée dans Tsena' : d.status === 'annulee' ? 'Livraison annulée dans Tsena' : d.status === 'livree' && o.last_step !== 'delivered' ? 'Livrée par la boutique (Tsena)' : null;
          if (why) {
            if (await partnerCancel(env, o.id, why)) { out.cancelled = (out.cancelled || 0) + 1; await logSync(env, 'tsena', 'in', d?.no || o.doc_id, true, `${why} → colis Alefa annulé`); }
            if (o.status !== 'picked_up') await run(env, 'DELETE FROM tsena_links WHERE doc_id = ?', o.doc_id);
            continue;
          }
          const addr = d.address || 'Adresse à confirmer';
          const g = addr !== o.drop_addr ? await geocodeTana(addr) : null;
          const changed = await partnerUpdate(env, o.id, { recipient_name: d.clientName || 'Client', recipient_phone: d.phone, drop_addr: addr, drop_lat: g?.[0], drop_lng: g?.[1],
            declared_value: Math.max(0, Math.round(Number(d.amount) || 0)), ...(Number(d.fee) > 0 ? { fee: Math.round(Number(d.fee)) } : {}) });
          if (changed) { out.changed = (out.changed || 0) + 1; await logSync(env, 'tsena', 'in', d.no, true, 'modifiée dans Tsena → colis mis à jour'); await run(env, 'UPDATE tsena_links SET last_step = NULL WHERE doc_id = ?', o.doc_id); }
        } catch (e) { out.errors.push(`${d?.no || o.doc_id} : ${e.message}`); }
      }
    }

    // 3. Alefa → Tsena : avancement, livreur et code de réception.
    const links = await all(env, `SELECT l.*, s.*, cu.name AS courier_name FROM tsena_links l JOIN shipments s ON s.id = l.shipment_id
      LEFT JOIN users cu ON cu.id = s.courier_id WHERE s.created_at > ?`, now() - 14 * 864e5);
    const byDoc = Object.fromEntries(docs.map((d) => [d.docId, d]));
    for (const x of links) {
      const step = stepOf(x);
      const cur = byDoc[x.doc_id];
      const base = cur ? baseNote(cur.note) : (x.base_note ?? '');
      if (cur && base !== (x.base_note ?? '')) await run(env, 'UPDATE tsena_links SET base_note = ? WHERE shipment_id = ?', base, x.shipment_id);
      if (step === x.last_step) continue;
      const fields = { alefaRef: x.ref, alefaStep: step, alefaPin: x.pin || '', alefaTrack: x.track_token && s.app_url ? `${s.app_url}/suivi/${x.track_token}` : '' };
      // Le statut Tsena n'avance que vers l'avant (jamais de retour en arrière si la boutique l'a déjà avancé) ;
      // chaque changement est ajouté à l'historique de la carte (« … · Alefa »).
      const want = TSENA_STATUS[step] || (['refused', 'returned'].includes(step) ? 'annulee' : null);
      const have = cur?.status;
      if (want && cur && want !== have && (want === 'annulee' ? have !== 'livree' : (RANK[want] ?? 0) > (RANK[have] ?? -1))) {
        fields.status = want;
        const at = new Date().toISOString();
        fields.log = [...(Array.isArray(cur?.log) ? cur.log : []).slice(-9), { s: want, at, by: x.courier_name ? `${x.courier_name.split(' ')[0]} · Alefa` : 'Alefa' }];
      }
      if (x.courier_name) fields.driver = `${x.courier_name.split(' ')[0]} (Alefa)`;
      if (fields.status === 'livree') fields.doneAt = new Date(x.done_at || now()).toISOString();
      const who = x.courier_name ? ` · ${x.courier_name.split(' ')[0]}` : '';
      const when = step === 'scheduled' && x.departure_at ? ` · départ ${fmtMg(x.departure_at)}` : '';
      fields.note = noteWith(base, `${STEP_LABELS[step] || step}${who}${when}${x.outcome_note && ['refused', 'cancelled', 'returning', 'returned'].includes(step) ? ' — ' + x.outcome_note : ''}`);
      try {
        await patchDelivery(s, token, x.doc_id, fields);
        await run(env, 'UPDATE tsena_links SET last_step = ?, synced_at = ? WHERE shipment_id = ?', step, now(), x.shipment_id);
        out.updated += 1;
        await logSync(env, 'tsena', 'out', x.external_ref || x.ref, true, `${step}${fields.status ? ' → ' + fields.status : ''}`);
      } catch (e) {
        if (/NOT_FOUND|No document to update/i.test(e.message)) {
          // Livraison supprimée dans Tsena : on arrête de la mettre à jour (pas de relance infinie).
          await run(env, 'UPDATE tsena_links SET last_step = ?, synced_at = ? WHERE shipment_id = ?', step, now(), x.shipment_id);
          await logSync(env, 'tsena', 'out', x.external_ref || x.ref, false, 'livraison supprimée dans Tsena : plus mise à jour');
        } else await logSync(env, 'tsena', 'out', x.external_ref || x.ref, false, e.message);
        out.errors.push(`${x.ref} → Tsena : ${e.message}`);
      }
    }
    await setMany(env, { tsena_last_sync: now(), tsena_last_result: JSON.stringify(out), tsena_last_error: out.errors.slice(0, 3).join(' | ') });
  } catch (e) {
    out.errors.push(e.message);
    await logSync(env, 'tsena', 'in', null, false, e.message);
    const prev = s.tsena_last_error;
    await setMany(env, { tsena_last_sync: now(), tsena_last_result: JSON.stringify(out), tsena_last_error: e.message });
    if (prev !== e.message) await alertAdmins(env, 'alert', `Synchronisation Tsena en échec : ${e.message}`);
  }
  return out;
}

// ---------------------------------------------------------------- routes (centre)
async function status(ctx, env) {
  await ensureSchema(env);
  const s = await settings(env);
  const n = await one(env, 'SELECT COUNT(*) AS n FROM tsena_links');
  return json({ connected: !!s.tsena_refresh, url: s.tsena_url, email: s.tsena_email, shop_name: s.tsena_shop_name, shop_phone: s.tsena_shop_phone, pickup_addr: s.tsena_pickup_addr,
    last_sync: Number(s.tsena_last_sync) || null, last_result: s.tsena_last_result ? JSON.parse(s.tsena_last_result) : null, last_error: s.tsena_last_error || null, linked: n.n });
}

async function connect(ctx, env) {
  const b = ctx.body;
  const url = str(b.url || 'https://tsena-ampandrana.web.app', { min: 8, max: 200, name: 'Adresse de Tsena' });
  const email = str(b.email, { min: 5, max: 120, name: 'E-mail du compte Tsena' });
  const password = str(b.password, { min: 1, max: 200, name: 'Mot de passe Tsena' });
  const shopPhone = normalizePhone(b.shop_phone);
  const cfg = await readConfig(url);
  let auth;
  try {
    auth = await http(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch (e) { fail(400, 'tsena_login', `Connexion à Tsena refusée : ${e.message}`); }
  const s = { tsena_project: cfg.project, tsena_api_key: cfg.apiKey, tsena_refresh: auth.refreshToken };
  let waiting;
  try { waiting = await waitingDeliveries(s, auth.idToken); } catch (e) { fail(400, 'tsena_read', `Lecture des livraisons Tsena impossible : ${e.message}`); }
  const pickupAddr = str(b.pickup_addr, { max: 200 });
  const pk = await geocodeTana(pickupAddr);
  await setMany(env, { ...s, tsena_shop_user: '', app_url: ctx.url.origin, tsena_pickup_lat: pk?.[0] ?? '', tsena_pickup_lng: pk?.[1] ?? '', tsena_url: cfg.base, tsena_email: email, tsena_shop_name: str(b.shop_name || 'Tsena Ampandrana', { max: 80 }), tsena_shop_phone: shopPhone, tsena_pickup_addr: pickupAddr, tsena_last_error: '' });
  await audit(env, ctx, 'tsena_connect', { url: cfg.base, email });
  const first = await syncTsena(env);
  return json({ ok: true, waiting: waiting.filter((d) => d.status === 'attente').length, ...first });
}

async function syncNow(ctx, env) { return json(await syncTsena(env)); }

// Modifier la boutique (nom, numéro, adresse de récupération) sans ressaisir le mot de passe Tsena.
// Les colis Tsena encore non récupérés passent sur le compte de la boutique.
async function updateShop(ctx, env) {
  const b = ctx.body;
  const next = { tsena_shop_name: str(b.shop_name, { min: 2, max: 80, name: 'Nom de la boutique' }), tsena_shop_phone: normalizePhone(b.shop_phone), tsena_pickup_addr: str(b.pickup_addr, { max: 200 }) };
  const shop = await shopAccount(env, { ...(await settings(env)), ...next, tsena_shop_user: '' });
  const pk = await geocodeTana(next.tsena_pickup_addr);
  await setMany(env, { ...next, tsena_pickup_lat: pk?.[0] ?? '', tsena_pickup_lng: pk?.[1] ?? '' });
  const r = await run(env, `UPDATE shipments SET sender_id = ?, sender_name = ?, sender_phone = ?, pickup_addr = COALESCE(NULLIF(?, ''), pickup_addr),
      pickup_lat = COALESCE(?, pickup_lat), pickup_lng = COALESCE(?, pickup_lng)
    WHERE id IN (SELECT shipment_id FROM tsena_links) AND status IN ('pending','assigned')`, shop.id, next.tsena_shop_name, next.tsena_shop_phone, next.tsena_pickup_addr, pk?.[0] ?? null, pk?.[1] ?? null);
  await audit(env, ctx, 'tsena_shop', next);
  return json({ ok: true, moved: r.meta.changes });
}

async function disconnect(ctx, env) {
  await setMany(env, { tsena_refresh: '', tsena_last_error: '' });
  await audit(env, ctx, 'tsena_disconnect');
  return json({ ok: true });
}

export function registerTsenaRoutes(route) {
  route('GET', '/api/admin/tsena', ['admin'], status);
  route('POST', '/api/admin/tsena/connect', ['admin'], connect);
  route('POST', '/api/admin/tsena/sync', ['admin'], syncNow);
  route('POST', '/api/admin/tsena/shop', ['admin'], updateShop);
  route('POST', '/api/admin/tsena/disconnect', ['admin'], disconnect);
}
export { KEYS as TSENA_KEYS };
