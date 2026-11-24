// Règles réglables par l'admin (Paramètres) : créneaux matin / après-midi, poids, parts du centre.
const H3 = 3 * 3600e3; // Madagascar = UTC+3

const toMin = (hhmm, dflt) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Math.min(1439, +m[1] * 60 + +m[2]) : dflt;
};
export const validHHMM = (v) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim());

// Créneaux de la journée (heure de Madagascar) : matin et après-midi.
export function dayParts(st) {
  const am = [toMin(st.am_start, 480), toMin(st.am_end, 720)], pm = [toMin(st.pm_start, 780), toMin(st.pm_end, 1020)];
  return [{ k: 'am', s: am[0], e: Math.max(am[0] + 30, am[1]) }, { k: 'pm', s: pm[0], e: Math.max(pm[0] + 30, pm[1]) }];
}
const midnight = (t) => { const d = new Date(t + H3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - H3; };

// Prochains créneaux à partir de t : on saute le créneau en cours s'il reste moins de 45 min.
export function nextWindows(st, t, n = 6) {
  const out = [];
  for (let day = 0; out.length < n && day < 10; day++) {
    const mid = midnight(t) + day * 864e5;
    for (const p of dayParts(st)) {
      const from = mid + p.s * 60e3, to = mid + p.e * 60e3;
      if (to - Math.max(from, t) < 45 * 60e3) continue;
      out.push({ part: p.k, from, to });
      if (out.length >= n) break;
    }
  }
  return out;
}

// Récupération : le créneau demandé (s'il est encore possible) sinon le plus tôt ;
// livraison : au plus tard le créneau suivant (matin → après-midi, après-midi → lendemain matin), ou plus tard si le client le demande.
export function planWindows(st, t, { pickup_at = null, deliver_at = null } = {}) {
  const ws = nextWindows(st, t, 8);
  let pi = pickup_at ? ws.findIndex((w) => w.from === Number(pickup_at)) : 0;
  if (pi < 0) pi = 0;
  let di = pi + 1;
  if (deliver_at) { const j = ws.findIndex((w) => w.from === Number(deliver_at)); if (j > pi) di = j; }
  const p = ws[pi], d = ws[Math.min(di, ws.length - 1)];
  return { pickup_from: p.from, pickup_to: p.to, deliver_from: d.from, deliver_to: d.to };
}

// Supplément de poids et limites par véhicule.
export function weightRule(st, kg) {
  const w = Number(kg) || 0;
  const free = Number(st.weight_free_kg ?? 5), step = Math.max(0.5, Number(st.weight_step_kg ?? 5)), stepFee = Number(st.weight_step_fee ?? 1000);
  const extra = w > free ? Math.ceil((w - free) / step) * stepFee : 0;
  return { extra, moto_only: w > Number(st.bike_max_kg ?? 10), too_heavy: w > Number(st.moto_max_kg ?? 25) };
}

// Part du centre sur les frais : 2 000–4 000 → 1 000 ; 4 500–8 000 → 2 000 ; au-delà → 3 000 (réglable).
export function centreShare(st, fee) {
  const f = Number(fee) || 0;
  const share = f <= Number(st.share_t1_max ?? 4000) ? Number(st.share_t1 ?? 1000) : f <= Number(st.share_t2_max ?? 8000) ? Number(st.share_t2 ?? 2000) : Number(st.share_t3 ?? 3000);
  return Math.min(f, share);
}

// ---------------------------------------------------------------- conditions de transport (catégories S / M / L / XL)
export const CATS = ['S', 'M', 'L', 'XL'];
export function catTable(st) {
  const n = (k, d) => Number(st[k] ?? d);
  return [
    { k: 'S', kg: n('cat_s_kg', 3), cm: n('cat_s_cm', 40), fee: n('cat_s_fee', 0), ex: st.cat_s_ex || '', vehicle: 'velo' },
    { k: 'M', kg: n('cat_m_kg', 10), cm: n('cat_m_cm', 50), fee: n('cat_m_fee', 1000), ex: st.cat_m_ex || '', vehicle: 'velo' },
    { k: 'L', kg: n('cat_l_kg', 25), cm: n('cat_l_cm', 80), fee: n('cat_l_fee', 3000), ex: st.cat_l_ex || '', vehicle: 'moto' },
    { k: 'XL', kg: null, cm: null, fee: null, ex: st.cat_xl_ex || '', vehicle: 'devis' },
  ];
}
// Catégorie retenue : la plus élevée entre celle choisie, le poids et la plus grande dimension.
export function categoryOf(st, { category = null, weight = null, dims = null } = {}) {
  const t = catTable(st);
  const idx = (k) => Math.max(0, CATS.indexOf(String(k || '').toUpperCase()));
  let i = category ? idx(category) : 0;
  const w = Number(weight) || 0, side = dims ? Math.max(...dims.map(Number)) : 0;
  const byLimit = (v, key) => { if (!v) return 0; const j = t.findIndex((c) => c[key] != null && v <= c[key]); return j < 0 ? 3 : j; };
  i = Math.max(i, byLimit(w, 'kg'), byLimit(side, 'cm'));
  if (w > Number(st.moto_max_kg ?? 30)) i = 3;
  return CATS[i];
}
// Prix : base (axe / défaut, ou tarif direct si récupération et livraison proches) + catégorie + options.
// Frais de livraison selon la distance (zones réglables) : ≤ 3 km 2 000, ≤ 7 km 3 000, ≤ 12 km 4 000, au-delà 5 000.
export function zoneFee(st, km) {
  const n = (k, d) => Number(st[k] ?? d);
  const zones = [[n('zone1_km', 3), n('zone1_fee', 2000), 'Zone 1'], [n('zone2_km', 7), n('zone2_fee', 3000), 'Zone 2'], [n('zone3_km', 12), n('zone3_fee', 4000), 'Zone 3']];
  const z = zones.find(([max]) => km <= max);
  return z ? { fee: z[1], zone: z[2] } : { fee: n('zone4_fee', 5000), zone: 'Périphérie' };
}
export function priceOf(st, { base, category, fragile = false, express = false, centreDrop = false, qty = 1, cashValue = 0, zone = null }) {
  const c = catTable(st).find((x) => x.k === category) || catTable(st)[0];
  const lines = [[zone ? `Livraison (${zone})` : 'Livraison', base]];
  if (c.fee) lines.push([`Catégorie ${c.k}`, c.fee]);
  if (['L', 'XL'].includes(c.k) && !centreDrop) lines.push(['Récupération (L/XL)', Number(st.pickup_fee_large ?? 2000)]);
  if (fragile) lines.push(['Fragile', Number(st.opt_fragile ?? 1000)]);
  if (express) lines.push(['Express', Number(st.opt_express ?? 2000)]);
  // Plusieurs colis pour la même adresse : −50 % sur les frais à partir du 2e colis.
  const one = lines.reduce((a, l) => a + l[1], 0);
  const n = Math.max(1, Math.min(50, Number(qty) || 1));
  if (n > 1) lines.push([`${n - 1} colis en plus (−${Number(st.multi_discount ?? 50)} %)`, Math.round(((n - 1) * one * (100 - Number(st.multi_discount ?? 50))) / 100)]);
  // Encaissement d'une grosse valeur : +1 % au-delà de 200 000 Ar.
  if (cashValue > Number(st.big_value ?? 200000)) lines.push([`Encaissement grosse valeur (${Number(st.big_value_pct ?? 1)} %)`, Math.round((cashValue * Number(st.big_value_pct ?? 1)) / 100)]);
  return { fee: lines.reduce((a, l) => a + l[1], 0), lines, moto_only: c.k === 'L', devis: c.k === 'XL' };
}
