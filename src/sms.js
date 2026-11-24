// SMS automatiques au destinataire (lien de suivi, récupéré, en route, livré) via une passerelle HTTP réglable
// (téléphone Android « SMS Gateway », opérateur…) : POST JSON { to, message, sender } avec « Authorization: Bearer <jeton> ».
import { now, json, fail, normalizePhone } from './lib.js';
import { run, all, settings } from './worker.js';

export async function sendSms(env, { to, body, shipmentId = null }) {
  const st = await settings(env);
  if (!to) return false;
  if (st.sms_enabled !== '1' || !st.sms_gateway_url) {
    await run(env, "INSERT INTO sms_log (shipment_id, to_phone, body, status, error, at) VALUES (?,?,?,'skipped',?,?)", shipmentId, to, body, 'SMS désactivés', now());
    return false;
  }
  let status = 'sent', error = null;
  try {
    const r = await fetch(st.sms_gateway_url, {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json', ...(st.sms_gateway_token ? { authorization: `Bearer ${st.sms_gateway_token}` } : {}) },
      body: JSON.stringify({ to, phone: to, message: body, text: body, sender: st.sms_sender || 'Alefa' }),
    });
    if (!r.ok) { status = 'failed'; error = `HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 150)}`; }
  } catch (e) { status = 'failed'; error = String(e.message || e).slice(0, 200); }
  await run(env, 'INSERT INTO sms_log (shipment_id, to_phone, body, status, error, at) VALUES (?,?,?,?,?,?)', shipmentId, to, body, status, error, now());
  return status === 'sent';
}

const BASE = (st) => (st.public_url || 'https://livraison.oasismdg3434.workers.dev').replace(/\/$/, '');
// Messages par étape (courts : 1 SMS). Le destinataire n'a jamais à taper le numéro du colis.
export async function smsStep(env, s, kind) {
  if (!s?.recipient_phone || !s.track_token) return false;
  const st = await settings(env);
  const link = `${BASE(st)}/suivi/${s.track_token}`;
  const from = (s.sender_name || '').split(' ')[0];
  const txt = {
    created: `Alefa : un colis de ${from} arrive pour vous. Suivez-le ici : ${link}`,
    picked_up: `Alefa : votre colis de ${from} est récupéré. Suivi : ${link}`,
    en_route: `Alefa : le livreur est en route vers vous. Code à lui donner et suivi : ${link}`,
    delivered: `Alefa : colis livré. Merci ! ${link}`,
  }[kind];
  return txt ? sendSms(env, { to: s.recipient_phone, body: txt, shipmentId: s.id }) : false;
}

async function smsTest(ctx, env) {
  let to; try { to = normalizePhone(ctx.body.to); } catch { fail(400, 'invalid', 'Numéro invalide'); }
  const ok = await sendSms(env, { to, body: 'Alefa : SMS de test, la passerelle fonctionne.' });
  const last = (await all(env, 'SELECT status, error FROM sms_log ORDER BY id DESC LIMIT 1'))[0];
  return json({ ok, status: last?.status, error: last?.error });
}
async function smsLog(ctx, env) {
  return json({ sms: await all(env, 'SELECT * FROM sms_log ORDER BY id DESC LIMIT 100') });
}
export function registerSmsRoutes(route) {
  route('POST', '/api/admin/sms-test', ['admin'], smsTest);
  route('GET', '/api/admin/sms-log', ['admin'], smsLog);
}
