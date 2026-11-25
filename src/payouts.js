// Versements aux expéditeurs (vendeurs) : par Mobile Money (MVola, Orange Money, Airtel Money) ou en espèces au centre.
// Chaque expéditeur peut enregistrer le numéro où il veut être payé ; chaque versement garde le moyen, le numéro et la
// référence de la transaction, pour pouvoir le prouver en cas de contestation.
import { fail, str, normalizePhone, now } from './lib.js';
import { one, all, run } from './worker.js';

export const PAYOUT_METHODS = { mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', cash: 'Espèces au centre' };
const MOBILE = ['mvola', 'orange_money', 'airtel_money'];

// Tables créées au premier usage (même contenu que migrations/0018_versements_mobile_money.sql) :
// un `git push` redéploie le code mais n'applique pas les migrations D1.
let schemaOk = false;
export async function ensurePayoutSchema(env) {
  if (schemaOk) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS payout_accounts (user_id INTEGER PRIMARY KEY, method TEXT NOT NULL, phone TEXT, holder TEXT, updated_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS vendor_payout_details (payout_id INTEGER PRIMARY KEY, method TEXT NOT NULL, phone TEXT, reference TEXT)'),
  ]);
  schemaOk = true;
}

// Moyen de versement : vérifié et normalisé. Mobile Money → numéro obligatoire.
export function payoutOf(b, { requireRef = false } = {}) {
  const method = PAYOUT_METHODS[b?.method] ? b.method : fail(400, 'invalid', 'Moyen de paiement invalide');
  let phone = null;
  if (MOBILE.includes(method)) {
    try { phone = normalizePhone(b.phone); } catch { fail(400, 'invalid', `Numéro ${PAYOUT_METHODS[method]} invalide`); }
  }
  const holder = str(b.holder, { max: 80 }) || null;
  const reference = str(b.reference, { max: 60 }) || null;
  if (requireRef && MOBILE.includes(method) && !reference) fail(400, 'reference_required', `Indiquez la référence de la transaction ${PAYOUT_METHODS[method]}`);
  return { method, phone, holder, reference };
}

export async function getPayoutAccount(env, userId) {
  await ensurePayoutSchema(env);
  return (await one(env, 'SELECT method, phone, holder, updated_at FROM payout_accounts WHERE user_id = ?', userId)) || null;
}
export async function payoutAccounts(env, ids) {
  await ensurePayoutSchema(env);
  if (!ids.length) return {};
  const rows = await all(env, `SELECT user_id, method, phone, holder FROM payout_accounts WHERE user_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  return Object.fromEntries(rows.map((r) => [r.user_id, { method: r.method, phone: r.phone, holder: r.holder }]));
}
export async function setPayoutAccount(env, userId, b) {
  await ensurePayoutSchema(env);
  const p = payoutOf(b);
  await run(env, 'INSERT OR REPLACE INTO payout_accounts (user_id, method, phone, holder, updated_at) VALUES (?,?,?,?,?)', userId, p.method, p.phone, p.holder, now());
  return p;
}
export async function savePayoutDetails(env, payoutId, p) {
  await ensurePayoutSchema(env);
  await run(env, 'INSERT OR REPLACE INTO vendor_payout_details (payout_id, method, phone, reference) VALUES (?,?,?,?)', payoutId, p.method, p.phone, p.reference);
}
export async function payoutDetails(env, ids) {
  await ensurePayoutSchema(env);
  if (!ids.length) return {};
  const rows = await all(env, `SELECT payout_id, method, phone, reference FROM vendor_payout_details WHERE payout_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  return Object.fromEntries(rows.map((r) => [r.payout_id, r]));
}
