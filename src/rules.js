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
