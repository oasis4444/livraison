// Tableau de bord Administrateur.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, every, hm, startNotifications, showNotifications, profileForm, chatHtml, TANA,
} from './core.js';
import { c, shipPill, sendForm, shipDetail } from './colis.js';

let root, main, view = location.hash.replace('#', '') || 'dash', liveTimer = null, liveMap = null, counts = {};
const liveMk = {};
let trackLayer = null, axeLayers = [];

const NAV = [
  ['dash', '📊', 'Tableau de bord'], ['live', '🗺️', 'Carte en direct'], ['parcels', '📦', 'Colis (centre)'], ['cash', '💵', 'Caisse & vendeurs'], ['deliveries', '🛵', 'Courses express'], ['couriers', '🚲', 'Livreurs'], ['axes', '🧭', 'Axes & planning'],
  ['clients', '👥', 'Clients'], ['payments', '💰', 'Paiements & soldes'], ['complaints', '⚠️', 'Réclamations & SOS'], ['reports', '📈', 'Rapports'],
  ['api', '🔌', 'API marchands'], ['settings', '⚙️', 'Paramètres'], ['audit', '🧾', 'Journal'],
];

export async function mount(el) {
  root = el;
  root.innerHTML = `<div class="admin">
    <aside class="side" id="side"><div class="logo"><img src="/icon.svg" alt="">Alefa <span class="small" style="opacity:.6;font-weight:600">Admin</span></div><nav id="nav"></nav>
      <div style="margin-top:20px;padding:0 8px" class="small"><div style="opacity:.7">${esc(state.user.name)}</div><button class="btn sm ghost" style="color:#cfe3da;padding-left:0" data-act="profile">Profil / déconnexion</button></div></aside>
    <main class="main" id="main"></main>
  </div>`;
  main = $('#main');
  bind(root, actions);
  window.addEventListener('hashchange', () => { view = location.hash.replace('#', '') || 'dash'; show(); });
  startNotifications(() => { refreshCounts(); if (view === 'dash' || view === 'complaints') show(); });
  every(30000, refreshCounts);
  show();
}

async function refreshCounts() {
  const s = await api('GET', '/api/admin/stats');
  counts = { couriers: s.users.pending || 0, complaints: s.complaints.open || 0, live: s.complaints.sos || 0 };
  renderNav();
  return s;
}
function renderNav() {
  $('#nav').innerHTML = NAV.map(([k, ic, l]) => `<button data-act="nav" data-v="${k}" class="${view === k ? 'on' : ''}">${ic} ${l}${counts[k] ? `<span class="cnt">${counts[k]}</span>` : ''}</button>`).join('');
}
function head(title, extra = '') {
  return `<div class="main-head"><div class="row"><button class="icon-btn mobile-nav" data-act="menu">☰</button><h1>${title}</h1></div><div class="row wrap no-print">${extra}<button class="icon-btn" data-act="notifs">🔔<span class="badge-dot hidden" data-unread></span></button></div></div>`;
}

async function show() {
  liveTimer?.stop(); liveTimer = null;
  if (liveMap) { liveMap.remove(); liveMap = null; for (const k of Object.keys(liveMk)) delete liveMk[k]; trackLayer = null; axeLayers = []; }
  renderNav();
  $('#side').classList.remove('open');
  main.innerHTML = '<p class="muted">Chargement…</p>';
  try { await (VIEWS[view] || VIEWS.dash)(); } catch (e) { toastErr(e); }
}

// ---------------------------------------------------------------- vues
const kpi = (l, v, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
function bars(series, key, fmt = (v) => v) {
  const max = Math.max(1, ...series.map((s) => s[key] || 0));
  return `<div class="bars">${series.map((s) => `<div class="b" style="height:${((s[key] || 0) / max) * 100}%" title="${esc(s.label)} : ${fmt(s[key] || 0)}"><span>${s[key] ? fmt(s[key]) : ''}</span></div>`).join('')}</div>
    <div class="bar-labels">${series.map((s) => `<span>${esc(String(s.label).slice(-5))}</span>`).join('')}</div>`;
}

const VIEWS = {
  async dash() {
    const [s, rep, comp] = await Promise.all([refreshCounts(), api('GET', `/api/admin/reports?period=day&from=${Date.now() - 14 * 864e5}`), api('GET', '/api/admin/complaints')]);
    main.innerHTML = head('Tableau de bord', `<span class="small muted">${new Date().toLocaleString('fr-FR')}</span>`) + `
      <h3>📦 Colis du centre</h3><div class="kpis">
        ${kpi('Colis livrés aujourd\'hui', s.parcels.delivered_today || 0)}${kpi('Frais encaissés aujourd\'hui', ar(s.parcels.fees_today))}
        ${kpi('En cours', s.parcels.open || 0)}${kpi('À programmer', s.parcels.pending || 0, s.parcels.pending ? 'alert' : '')}
        ${kpi('Argent chez les livreurs', ar(s.parcels.cash_with_couriers))}${kpi('À rendre aux expéditeurs', s.parcels.to_return || 0)}</div>
      <h3>🛵 Courses express</h3><div class="kpis">
        ${kpi('Livraisons aujourd\'hui', `${s.today.delivered || 0} <span class="small muted">/ ${s.today.created || 0}</span>`)}
        ${kpi('Chiffre d\'affaires du jour', ar(s.today.revenue))}
        ${kpi('Commissions du jour', ar(s.today.commission))}
        ${kpi('En cours', `${(s.active.open || 0) + (s.active.assigned || 0) + (s.active.picked_up || 0)} <span class="small muted">(${s.active.open || 0} en attente)</span>`)}
        ${kpi('Livreurs en service', s.couriers.online || 0)}
        ${kpi('Livreurs à valider', s.users.pending || 0, s.users.pending ? 'alert' : '')}
        ${kpi('Réclamations ouvertes', `${s.complaints.open || 0}${s.complaints.sos ? ` <span class="small" style="color:var(--red)">dont ${s.complaints.sos} SOS</span>` : ''}`, s.complaints.sos ? 'alert' : '')}
        ${kpi('Dû par les livreurs', ar(s.money.owed_by_couriers))}
        ${kpi('Clients / Livreurs', `${s.users.clients || 0} / ${s.users.couriers || 0}`)}
      </div>
      <div class="grid2">
        <div class="panel"><div class="row between"><h3>Livraisons réussies — 14 jours</h3><a href="#reports" class="small">Rapports →</a></div>${bars(rep.series, 'delivered')}
          <h3 style="margin-top:18px">Chiffre d'affaires (Ar)</h3>${bars(rep.series, 'revenue', (v) => Math.round(v / 1000) + 'k')}</div>
        <div class="panel"><div class="row between"><h3>Alertes récentes</h3><a href="#complaints" class="small">Tout voir →</a></div>
          <div class="list">${comp.complaints.slice(0, 8).map((c) => `<div class="small"><b>${c.kind === 'sos' ? '🚨 SOS' : c.kind === 'alert' ? '⚠️ Alerte' : '📝 Réclamation'}</b> <span class="muted">${dt(c.at)}</span><div>${esc(c.body || '')}</div></div>`).join('') || '<p class="muted">Aucune alerte 👍</p>'}</div>
          <h3 style="margin-top:16px">Top livreurs (14 j)</h3>
          ${rep.topCouriers.map((c, i) => `<div class="row between small"><span>${i + 1}. ${esc(c.name)}</span><span>${c.n} 🚲 · ${ar(c.revenue)} ${c.rating ? `· ★ ${c.rating}` : ''}</span></div>`).join('') || '<p class="muted small">—</p>'}
        </div>
      </div>`;
  },

  async live() {
    main.innerHTML = head('Carte en direct', `<span class="small muted" data-live-info></span>`) + `<div class="live-wrap"><div class="livemap" id="livemap"></div><div class="live-list panel" data-live-list></div></div>`;
    liveMap = makeMap($('#livemap'), { zoom: 13, zoomControl: true });
    let fitted = false;
    liveTimer = every(5000, async () => {
      const r = await api('GET', '/api/admin/live');
      const keep = new Set();
      if (liveMap && !axeLayers.length && r.axes.length) axeLayers = r.axes.map((a) => L.circle([a.center_lat, a.center_lng], { radius: a.radius_km * 1000, color: a.color, weight: 2, fillOpacity: .05, interactive: false }).addTo(liveMap).bindTooltip?.(esc(a.name)));
      for (const c of r.couriers) {
        const stale = r.server_time - c.last_seen > 2 * 60e3;
        keep.add('c' + c.id);
        upsertMarker(liveMap, liveMk, 'c' + c.id, [c.lat, c.lng], icons.bike(stale ? 'stale' : c.delivery_id ? 'busy' : ''), { refreshIcon: true })
          ?.bindTooltip(`<b>${esc(c.name)}</b><br>${c.delivery_id ? `Livraison #${c.delivery_id} (${t('st_' + c.delivery_status)})` : 'Disponible'}${c.axe ? `<br>🧭 ${esc(c.axe)}` : ''}<br>${stale ? '⚠ GPS perdu — ' : ''}Vu à ${time(c.last_seen)}`)
          .off('click').on('click', () => courierTrack(c));
      }
      for (const d of r.deliveries.filter((x) => x.status === 'open')) {
        keep.add('d' + d.id);
        upsertMarker(liveMap, liveMk, 'd' + d.id, [d.pickup_lat, d.pickup_lng], icons.req(`#${d.id} · ${(d.proposed_price / 1000).toFixed(1)}k`), { refreshIcon: true })
          ?.off('click').on('click', () => deliveryDetail(d.id));
      }
      for (const s of r.sos) if (s.lat != null) { keep.add('s' + s.id); upsertMarker(liveMap, liveMk, 's' + s.id, [s.lat, s.lng], icons.sos())?.bindTooltip(esc(s.body)); }
      pruneMarkers(liveMk, keep);
      if (!fitted && liveMap && keep.size) { const pts = Object.values(liveMk).map((m) => m.getLatLng()); liveMap.fitBounds(L.latLngBounds(pts).pad(.3), { maxZoom: 15 }); fitted = true; }
      $('[data-live-info]').textContent = `🟢 ${r.couriers.filter((c) => !c.delivery_id).length} disponibles · 🟠 ${r.couriers.filter((c) => c.delivery_id).length} en livraison · 🟡 ${r.deliveries.filter((d) => d.status === 'open').length} demandes · actualisé ${time(r.server_time)}`;
      $('[data-live-list]').innerHTML = `${r.sos.length ? `<h3 style="color:var(--red)">🚨 SOS (${r.sos.length})</h3>${r.sos.map((s) => `<div class="small card" style="border-color:var(--red);margin-bottom:6px">${esc(s.body)}<div class="muted">${dt(s.at)}</div></div>`).join('')}` : ''}
        <h3>Livraisons actives (${r.deliveries.length})</h3>
        <div class="list">${r.deliveries.map((d) => `<div class="small" data-act="delivery" data-id="${d.id}" style="cursor:pointer"><div class="row between"><b>#${d.id} ${esc(d.client_name)}</b>${statusPill(d.status)}</div>
          <div class="muted ellipsis">${esc(d.pickup_addr || '')} → ${esc(d.drop_addr || '')}</div><div>${d.courier_name ? '🚲 ' + esc(d.courier_name) : '—'} · ${ar(d.final_price ?? d.proposed_price)}</div></div>`).join('') || '<p class="muted small">Aucune</p>'}</div>
        <h3 style="margin-top:14px">Livreurs (${r.couriers.length})</h3>
        ${r.couriers.map((c) => `<div class="row between small" data-act="ctrack" data-id="${c.id}" style="cursor:pointer;padding:4px 0"><span>${c.delivery_id ? '🟠' : '🟢'} ${esc(c.name)}${c.axe ? ` <span class="tiny muted">🧭 ${esc(c.axe)}</span>` : ''}</span><span class="muted">${time(c.last_seen)}</span></div>`).join('')}`;
      $('[data-live-list]')._couriers = r.couriers;
    });
  },

  async deliveries() {
    const p = new URLSearchParams(sessionStorage.getItem('adm_dfilter') ?? 'status=active');
    main.innerHTML = head('Livraisons', `<a class="btn sm" href="/api/admin/export?type=deliveries" data-act="export" data-type="deliveries">⬇ Excel (CSV)</a>`) + `
      <div class="filters"><select class="input" data-f="status">${[['active', 'En cours'], ['', 'Toutes'], ['open', 'En attente'], ['assigned', 'Attribuées'], ['picked_up', 'Récupérées'], ['delivered', 'Livrées'], ['cancelled', 'Annulées'], ['expired', 'Expirées'], ['flagged', '⚠ Signalées']].map(([v, l]) => `<option value="${v}" ${p.get('status') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" data-f="payment"><option value="">Tous paiements</option><option value="pending" ${p.get('payment') === 'pending' ? 'selected' : ''}>Mobile Money à confirmer</option></select>
      <input class="input" data-f="q" placeholder="Rechercher (n°, nom, adresse)" value="${esc(p.get('q') || '')}"><button class="btn sm primary" data-act="dfilter">Filtrer</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Livreur</th><th>Trajet</th><th class="num">km</th><th class="num">Prix</th><th>Paiement</th><th>Statut</th></tr></thead><tbody data-rows><tr><td colspan="9">…</td></tr></tbody></table></div>`;
    const r = await api('GET', '/api/admin/deliveries?' + p.toString());
    $('[data-rows]').innerHTML = r.deliveries.map((d) => `<tr class="click" data-act="delivery" data-id="${d.id}"><td>#${d.id}${d.flagged ? ' ⚠' : ''}</td><td class="small">${dt(d.created_at)}</td><td>${esc(d.client_name)}</td><td>${esc(d.courier_name || '—')}</td>
      <td class="small" style="max-width:260px"><div class="ellipsis">${esc(d.pickup_addr || '')} → ${esc(d.drop_addr || '')}</div></td><td class="num">${d.distance_km}</td><td class="num">${ar(d.final_price ?? d.proposed_price)}</td>
      <td class="small">${t(d.payment_method)}${d.payment_method !== 'cash' ? ` <span class="status-pill st-${d.payment_status === 'paid' ? 'delivered' : 'pending'}">${d.payment_status}</span>` : ''}</td><td>${statusPill(d.status)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucune livraison</td></tr>';
  },

  async couriers() { return usersView('courier'); },
  async clients() { return usersView('client'); },

  async payments() {
    const [tx, users, pend] = await Promise.all([api('GET', '/api/admin/transactions'), api('GET', '/api/admin/users?role=courier'), api('GET', '/api/admin/deliveries?status=delivered&payment=pending')]);
    main.innerHTML = head('Paiements & soldes', `<a class="btn sm" href="#" data-act="export" data-type="transactions">⬇ Opérations (CSV)</a>`) + `
      <div class="grid2"><div class="panel"><h3>Soldes des livreurs</h3><p class="small muted">Négatif = commissions dues à la plateforme (espèces). Positif = la plateforme doit au livreur (Mobile Money encaissé).</p>
        <div class="tbl-wrap" style="border:0"><table class="tbl"><thead><tr><th>Livreur</th><th class="num">Solde</th><th>Abonnement</th><th></th></tr></thead><tbody>
        ${users.users.filter((u) => u.status === 'active').sort((a, b) => a.balance - b.balance).map((u) => `<tr><td>${esc(u.name)}<div class="tiny muted">${esc(phoneFmt(u.phone))}</div></td>
          <td class="num" style="color:${u.balance < 0 ? 'var(--red)' : 'var(--green)'};font-weight:700">${ar(u.balance)}</td><td class="small">${u.subscription_until ? (u.subscription_until > Date.now() ? '✅ ' : '❌ ') + dt(u.subscription_until) : '—'}</td>
          <td><button class="btn sm" data-act="tx" data-id="${u.id}" data-name="${esc(u.name)}">Opération</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h3>Mobile Money à confirmer (${pend.deliveries.length})</h3>
        ${pend.deliveries.map((d) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>#${d.id} · ${esc(d.client_name)} · ${t(d.payment_method)}<br><span class="muted">${dt(d.delivered_at)}</span></span><span><b>${ar(d.final_price)}</b> <button class="btn sm primary" data-act="paid" data-id="${d.id}">Reçu</button></span></div>`).join('') || '<p class="muted small">Rien à confirmer</p>'}
        <h3 style="margin-top:16px">Dernières opérations</h3>
        ${tx.transactions.slice(0, 40).map((x) => `<div class="row between small" style="padding:4px 0"><span>${esc(x.courier_name)} · <span class="muted">${esc(x.note || x.kind)}</span><br><span class="tiny muted">${dt(x.at)}</span></span><b style="color:${x.amount < 0 ? 'var(--red)' : 'var(--green)'}">${ar(x.amount)}</b></div>`).join('')}
      </div></div>`;
  },

  async complaints() {
    const st = sessionStorage.getItem('adm_cst') || 'open';
    const r = await api('GET', '/api/admin/complaints?status=' + st);
    main.innerHTML = head('Réclamations, alertes & SOS', `<div class="seg"><button data-act="cst" data-v="open" class="${st === 'open' ? 'on' : ''}">Ouvertes</button><button data-act="cst" data-v="resolved" class="${st === 'resolved' ? 'on' : ''}">Traitées</button></div>`) + `
      <div class="list">${r.complaints.map((c) => `<div class="panel" style="${c.kind === 'sos' && c.status === 'open' ? 'border-color:var(--red);background:var(--red-soft)' : ''}">
        <div class="row between"><b>${c.kind === 'sos' ? '🚨 SOS' : c.kind === 'alert' ? '⚠️ Alerte automatique' : '📝 Réclamation'}</b><span class="small muted">${dt(c.at)}</span></div>
        <p style="margin:6px 0">${esc(c.body || '')}</p>
        <div class="row wrap small">${c.user_name ? `<span>👤 ${esc(c.user_name)} (${esc(c.user_role)}) <a href="tel:${esc(c.user_phone)}">${esc(phoneFmt(c.user_phone))}</a></span>` : ''}
          ${c.delivery_id ? `<button class="btn sm" data-act="delivery" data-id="${c.delivery_id}">Livraison #${c.delivery_id}</button>` : ''}
          ${c.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=17/${c.lat}/${c.lng}">📍 Position</a>` : ''}
          ${c.status === 'open' ? `<button class="btn sm primary" data-act="resolve" data-id="${c.id}">Marquer traité</button>` : `<span class="muted">✅ ${esc(c.resolution || '')}</span>`}</div></div>`).join('') || '<p class="muted">Rien à signaler 👍</p>'}</div>`;
  },

  async reports() {
    const period = sessionStorage.getItem('adm_period') || 'day';
    const span = { day: 30, week: 120, month: 365, year: 365 * 5 }[period];
    const from = Date.now() - span * 864e5;
    const r = await api('GET', `/api/admin/reports?period=${period}&from=${from}`);
    const tot = r.series.reduce((a, s) => ({ created: a.created + s.created, delivered: a.delivered + s.delivered, cancelled: a.cancelled + s.cancelled, revenue: a.revenue + s.revenue, commission: a.commission + s.commission }), { created: 0, delivered: 0, cancelled: 0, revenue: 0, commission: 0 });
    main.innerHTML = head('Rapports', `<div class="seg">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']].map(([v, l]) => `<button data-act="period" data-v="${v}" class="${period === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <a class="btn sm" href="#" data-act="export" data-type="deliveries" data-from="${from}">⬇ Excel</a><button class="btn sm" data-act="print">🖨 PDF</button>`) + `
      <p class="small muted">Période : ${new Date(from).toLocaleDateString('fr-FR')} → ${new Date().toLocaleDateString('fr-FR')}</p>
      <div class="kpis">${kpi('Demandes', tot.created)}${kpi('Livrées', tot.delivered)}${kpi('Taux de réussite', tot.created ? Math.round((tot.delivered / tot.created) * 100) + ' %' : '—')}${kpi('Annulées', tot.cancelled)}${kpi('Chiffre d\'affaires', ar(tot.revenue))}${kpi('Commissions', ar(tot.commission))}</div>
      <div class="grid2"><div class="panel"><h3>Livraisons réussies</h3>${bars(r.series, 'delivered')}<h3 style="margin-top:16px">Chiffre d'affaires</h3>${bars(r.series, 'revenue', (v) => Math.round(v / 1000) + 'k')}</div>
        <div class="panel"><h3>Modes de paiement</h3>${r.payments.map((p) => `<div class="row between small"><span>${t(p.payment_method)}</span><span>${p.n} · <b>${ar(p.amount)}</b></span></div>`).join('') || '—'}
          <h3 style="margin-top:14px">Types</h3>${r.types.map((p) => `<div class="row between small"><span>${t(p.type)}</span><b>${p.n}</b></div>`).join('') || '—'}
          <h3 style="margin-top:14px">Top livreurs</h3>${r.topCouriers.map((c, i) => `<div class="row between small"><span>${i + 1}. ${esc(c.name)}</span><span>${c.n} · ${ar(c.revenue)}</span></div>`).join('') || '—'}</div></div>
      <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Période</th><th class="num">Demandes</th><th class="num">Livrées</th><th class="num">Annulées</th><th class="num">Expirées</th><th class="num">CA</th><th class="num">Commissions</th><th class="num">Prix moyen</th><th class="num">km moyen</th></tr></thead>
      <tbody>${r.series.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${s.created}</td><td class="num">${s.delivered}</td><td class="num">${s.cancelled}</td><td class="num">${s.expired}</td><td class="num">${ar(s.revenue)}</td><td class="num">${ar(s.commission)}</td><td class="num">${ar(s.avg_price)}</td><td class="num">${s.avg_km ?? '—'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucune donnée</td></tr>'}</tbody></table></div>`;
  },

  async settings() {
    const r = await api('GET', '/api/admin/settings');
    const s = r.settings;
    const f = (k, l, help = '', type = 'number') => `<label class="field"><span>${l}</span><input class="input" type="${type}" data-s="${k}" value="${esc(s[k])}" step="any">${help ? `<span class="tiny muted">${help}</span>` : ''}</label>`;
    main.innerHTML = head('Paramètres', '<button class="btn primary" data-act="savesettings">Enregistrer</button>') + `
      <div class="grid2"><div class="stack">
        <div class="panel stack"><h3>Commission</h3>
          <label class="field"><span>Modèle</span><select class="input" data-s="commission_mode"><option value="percent" ${s.commission_mode === 'percent' ? 'selected' : ''}>Pourcentage par livraison</option><option value="subscription" ${s.commission_mode === 'subscription' ? 'selected' : ''}>Abonnement mensuel</option></select></label>
          ${f('commission_percent', 'Commission (%)', 'Prélevée sur chaque livraison terminée')}${f('subscription_monthly', 'Abonnement mensuel (Ar)')}${f('max_courier_debt', 'Dette maximale d\'un livreur (Ar)', 'Au-delà, il ne peut plus faire d\'offre')}</div>
        <div class="panel stack"><h3>Tarification conseillée (vélo)</h3><div class="row">${f('base_fare', 'Prise en charge (Ar)')}${f('per_km', 'Prix par km (Ar)')}</div>
          <div class="row">${f('min_price', 'Prix minimum (Ar)')}${f('road_factor', 'Coefficient route', 'Distance réelle ≈ vol d\'oiseau × coef.')}</div>${f('bike_speed_kmh', 'Vitesse moyenne vélo (km/h)')}</div>
        <div class="panel stack"><h3>Fonctionnement</h3><div class="row">${f('request_radius_km', 'Rayon des demandes (km)')}${f('request_ttl_min', 'Expiration demande (min)')}</div>
          <div class="row">${f('max_open_requests', 'Demandes simultanées / client')}${f('position_retention_days', 'Conservation trajets GPS (jours)')}</div>${f('axe_slot_minutes', 'Durée d\'un créneau d\'axe (minutes)', 'Durée par défaut lors de la génération des plannings (60 = 1 heure)')}</div>
      </div><div class="stack">
        <div class="panel stack"><h3>Colis du centre</h3><div class="row">${f('default_fee', 'Frais de livraison par défaut (Ar)', 'Modifiable par axe et par colis')}
          <label class="field grow"><span>Le livreur peut modifier les frais</span><select class="input" data-s="courier_can_edit_fee"><option value="1" ${s.courier_can_edit_fee === '1' ? 'selected' : ''}>Oui</option><option value="0" ${s.courier_can_edit_fee !== '1' ? 'selected' : ''}>Non</option></select></label></div>
          <div class="row">${f('centre_name', 'Nom du centre', '', 'text')}${f('centre_addr', 'Adresse du centre', '', 'text')}</div></div>
        <div class="panel stack"><h3>Plateforme & paiements</h3>${f('platform_name', 'Nom', '', 'text')}${f('support_phone', 'Téléphone support', '', 'tel')}
          ${f('mvola_number', 'Numéro marchand MVola', '', 'text')}${f('orange_money_number', 'Numéro Orange Money', '', 'text')}${f('airtel_money_number', 'Numéro Airtel Money', '', 'text')}</div>
        <div class="panel"><div class="row between"><h3>Zones de service</h3><button class="btn sm" data-act="zone">＋ Zone</button></div>
          ${r.zones.map((z) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${z.active ? '🟢' : '⚪'} <b>${esc(z.name)}</b> · rayon ${z.radius_km} km</span><span><button class="btn sm" data-act="zone" data-z='${esc(JSON.stringify(z))}'>Modifier</button></span></div>`).join('')}</div>
        <div class="panel"><div class="row between"><h3>Codes promo</h3><button class="btn sm" data-act="promo">＋ Code</button></div>
          ${r.promos.map((p) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${p.active ? '🟢' : '⚪'} <b>${esc(p.code)}</b> −${p.percent}%${p.max_amount ? ` (max ${ar(p.max_amount)})` : ''} · ${p.uses}${p.max_uses ? '/' + p.max_uses : ''} utilisations${p.expires_at ? ` · jusqu'au ${dt(p.expires_at)}` : ''}</span><button class="btn sm" data-act="promo" data-p='${esc(JSON.stringify(p))}'>Modifier</button></div>`).join('') || '<p class="muted small">Aucun</p>'}</div>
        <div class="panel"><div class="row between"><h3>Administrateurs & comptes</h3><button class="btn sm" data-act="newuser">＋ Créer un compte</button></div><p class="small muted">Créez un compte administrateur, un livreur pré-validé ou un compte entreprise.</p></div>
      </div></div>`;
  },

  async axes() {
    const r = await api('GET', '/api/admin/axes');
    main.innerHTML = head('Axes & planning', '<button class="btn primary" data-act="axe">＋ Nouvel axe</button>') + `
      <p class="small muted">Un axe est un secteur de travail (cercle sur la carte). Attribuez des axes aux livreurs par créneaux horaires depuis <a href="#couriers">Livreurs → 🧭 Axes</a>.
      Un livreur avec planning ne voit que les demandes dont le départ est dans l'axe du créneau en cours ; sans planning, il voit toute la zone autour de lui.</p>
      <div class="grid2"><div class="livemap" id="axemap" style="height:520px"></div>
      <div class="panel"><div class="list">${r.axes.map((a) => `<div class="row between" style="border-bottom:1px solid var(--line);padding-bottom:8px">
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${esc(a.color)}"></span> <b>${esc(a.name)}</b>${a.active ? '' : ' <span class="muted">(inactif)</span>'}<br><span class="small muted">Rayon ${a.radius_km} km · ${a.couriers} livreur(s) · frais ${a.fee ? ar(a.fee) : 'par défaut'}</span></span>
        <span><button class="btn sm" data-act="axe" data-a='${esc(JSON.stringify(a))}'>Modifier</button> <button class="btn sm danger" data-act="axedel" data-id="${a.id}">✕</button></span></div>`).join('') || '<p class="muted">Aucun axe. Créez-en un (ex : Analakely, Ankorondrano, Ivandry…).</p>'}</div></div></div>`;
    liveMap = makeMap($('#axemap'), { zoom: 12, zoomControl: true });
    if (liveMap && r.axes.length) {
      const cs = r.axes.map((a) => L.circle([a.center_lat, a.center_lng], { radius: a.radius_km * 1000, color: a.color, weight: 2, fillOpacity: .12 }).addTo(liveMap).bindTooltip(esc(a.name), { permanent: true, direction: 'center' }));
      liveMap.fitBounds(L.featureGroup(cs).getBounds().pad(.1));
    }
  },

  async parcels() {
    const st = sessionStorage.getItem('adm_pst') ?? 'open', qv = sessionStorage.getItem('adm_pq') || '';
    const r = await api('GET', `/api/admin/shipments?status=${st}&q=${encodeURIComponent(qv)}`);
    main.innerHTML = head('Colis (centre)', `<button class="btn sm primary" data-act="newparcel">＋ Colis</button><a class="btn sm" href="#" data-act="pexport">⬇ Excel</a>`) + `
      <div class="filters"><select class="input" data-pf="status">${[['open', 'En cours'], ['pending', '⏳ À programmer'], ['assigned', 'Programmés'], ['picked_up', 'Récupérés'], ['return', '↩️ À rendre'], ['delivered', 'Livrés'], ['refused', 'Refusés'], ['cancelled', 'Annulés'], ['', 'Tous']].map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" data-pf="q" placeholder="Réf, nom, téléphone, adresse" value="${esc(qv)}"><button class="btn sm primary" data-act="pfilter">Filtrer</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Réf</th><th>Créé</th><th>Source</th><th>Expéditeur</th><th>Destinataire</th><th>Livreur / départ</th><th class="num">Valeur</th><th class="num">Frais</th><th class="num">Encaissé</th><th>Statut</th></tr></thead><tbody>
      ${r.shipments.map((x) => `<tr class="click" data-act="parcel" data-id="${x.id}"><td><b>${esc(x.ref)}</b>${x.external_ref ? `<div class="tiny muted">${esc(x.external_ref)}</div>` : ''}</td><td class="small">${dt(x.created_at)}</td><td class="small">${esc(x.source)}</td>
        <td class="small">${esc(x.sender.name)}<div class="tiny muted ellipsis" style="max-width:180px">${esc(x.sender.address)}</div></td><td class="small">${esc(x.recipient.name)}<div class="tiny muted ellipsis" style="max-width:180px">${esc(x.recipient.address)}</div></td>
        <td class="small">${x.courier ? `🚲 ${esc(x.courier.name || '')}` : '—'}${x.departure_at ? `<div class="tiny muted">${dt(x.departure_at)} · ${esc(x.axe || '')}</div>` : ''}</td>
        <td class="num">${ar(x.value ?? x.declared_value)}</td><td class="num">${ar(x.fee)}</td><td class="num">${x.collected ? ar(x.collected) : '—'}</td><td>${shipPill(x)}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">Aucun colis</td></tr>'}</tbody></table></div>`;
  },

  async cash() {
    const r = await api('GET', '/api/admin/cash');
    main.innerHTML = head('Caisse & vendeurs') + `
      <p class="small muted">1. Quand le livreur rentre au centre, encaissez l'argent qu'il a collecté. 2. Payez ensuite chaque expéditeur : valeur des colis livrés (argent déjà remis) moins les frais de retour des colis annulés après récupération.</p>
      <div class="grid2"><div class="panel"><h3>💵 Argent à récupérer auprès des livreurs</h3>
        ${r.couriers.map((x) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(x.name)}</b><div class="tiny muted">${x.n} colis · ${esc(phoneFmt(x.phone))}</div></span><span><b>${ar(x.cash)}</b> <button class="btn sm primary" data-act="settle" data-id="${x.id}" data-amt="${x.cash}" data-name="${esc(x.name)}">Encaisser</button></span></div>`).join('') || '<p class="muted small">Aucun argent en attente.</p>'}
        <h3 style="margin-top:16px">Dernières remises</h3>${r.settlements.slice(0, 15).map((x) => `<div class="row between small"><span>${esc(x.name)} · ${x.shipments} colis${x.note ? ` · <span style="color:var(--red)">${esc(x.note)}</span>` : ''}</span><span>${ar(x.amount)} <span class="muted tiny">${dt(x.at)}</span></span></div>`).join('') || '<p class="muted small">—</p>'}</div>
      <div class="panel"><h3>🏪 À payer aux expéditeurs</h3>
        ${r.vendors.map((v) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(v.company || v.name)}</b><div class="tiny muted">${esc(phoneFmt(v.phone))} · ventes ${ar(v.sales)}${v.return_fees ? ` · retours −${ar(v.return_fees)}` : ''}${v.waiting_cash ? ` · ${v.waiting_cash} colis encore chez le livreur` : ''}</div></span>
          <span><b style="color:${v.due < 0 ? 'var(--red)' : 'var(--green)'}">${ar(v.due)}</b> ${v.sales || v.return_fees ? `<button class="btn sm primary" data-act="payvendor" data-id="${v.id}" data-amt="${v.due}" data-name="${esc(v.company || v.name)}">Payer</button>` : ''}</span></div>`).join('') || '<p class="muted small">Rien à payer.</p>'}
        <h3 style="margin-top:16px">Derniers paiements</h3>${r.payouts.slice(0, 15).map((x) => `<div class="row between small"><span>${esc(x.name)} · ${esc(x.note || '')}</span><span>${ar(x.amount)} <span class="muted tiny">${dt(x.at)}</span></span></div>`).join('') || '<p class="muted small">—</p>'}</div></div>`;
  },

  async api() {
    const r = await api('GET', '/api/admin/merchants');
    const base = location.origin;
    main.innerHTML = head('API marchands', '<button class="btn primary" data-act="newmerchant">＋ Connecter un logiciel de vente</button>') + `
      <p class="small muted">Chaque logiciel de vente (ou boutique) reçoit une clé API. Ses commandes arrivent ici comme colis, sont programmées sur le prochain départ couvrant l'adresse, et son webhook est prévenu à chaque changement de statut.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Logiciel / boutique</th><th>Compte vendeur</th><th>Clé</th><th>Webhook</th><th class="num">Colis</th><th>Dernier appel</th><th></th></tr></thead><tbody>
      ${r.merchants.map((m) => `<tr><td><b>${esc(m.name)}</b> ${m.active ? '' : '<span class="status-pill st-suspended">désactivé</span>'}</td><td class="small">${esc(m.vendor_name)}<div class="tiny muted">${esc(phoneFmt(m.vendor_phone))}</div></td>
        <td><code>${esc(m.key_prefix)}…</code></td><td class="small" style="max-width:220px;word-break:break-all">${esc(m.webhook_url || '—')}</td><td class="num">${m.shipments}</td><td class="small">${m.last_used ? dt(m.last_used) : 'jamais'}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-act="mhook" data-id="${m.id}" data-url="${esc(m.webhook_url || '')}">Webhook</button> <button class="btn sm" data-act="mkey" data-id="${m.id}">Nouvelle clé</button> <button class="btn sm ${m.active ? 'danger' : 'primary'}" data-act="mactive" data-id="${m.id}" data-v="${m.active ? 0 : 1}">${m.active ? 'Désactiver' : 'Activer'}</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucun logiciel connecté.</td></tr>'}</tbody></table></div>
      <div class="panel" style="margin-top:16px"><h3>Intégration rapide</h3>
        <p class="small">Base : <code>${esc(base)}/api/v1</code> · En-tête : <code>X-API-Key: ak_…</code> · Documentation complète : <a href="https://github.com/oasis4444/livraison/blob/main/docs/API.md" target="_blank" rel="noopener">docs/API.md</a></p>
        <pre style="background:#0f1a16;color:#cfe3da;padding:14px;border-radius:12px;overflow:auto;font-size:.8rem">curl -X POST ${esc(base)}/api/v1/shipments \
  -H "X-API-Key: ak_VOTRE_CLE" -H "Content-Type: application/json" \
  -d '{"external_ref":"CMD-1042","declared_value":25000,"description":"Robe taille M",
       "sender":{"address":"Boutique Soa, Analakely","lat":-18.9055,"lng":47.5255},
       "recipient":{"name":"Rasoa","phone":"0341234567","address":"Ankorondrano, immeuble X","lat":-18.884,"lng":47.524}}'</pre>
        <p class="small muted">Autres appels : <code>GET /api/v1/schedule</code> (heures et axes) · <code>POST /api/v1/quote</code> · <code>GET /api/v1/shipments/{ref}</code> · <code>POST /api/v1/shipments/{ref}/cancel</code> · <code>GET /api/v1/shipments/{ref}/photo</code>. Webhook signé : en-tête <code>X-Alefa-Signature</code> = HMAC-SHA256 du corps avec le secret <code>whsec_…</code>.</p></div>`;
  },

  async audit() {
    const r = await api('GET', '/api/admin/audit');
    main.innerHTML = head('Journal des opérations') + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th><th>IP</th></tr></thead><tbody>
      ${r.audit.map((a) => `<tr><td class="small">${dt(a.at)}</td><td>${esc(a.user_name || '—')}</td><td><code>${esc(a.action)}</code></td><td class="small" style="max-width:420px;word-break:break-all">${esc(a.detail || '')}</td><td class="small muted">${esc(a.ip || '')}</td></tr>`).join('')}</tbody></table></div>`;
  },
};

async function usersView(role) {
  const st = sessionStorage.getItem('adm_ust_' + role) || '';
  const qv = sessionStorage.getItem('adm_uq_' + role) || '';
  const r = await api('GET', `/api/admin/users?role=${role}&status=${st}&q=${encodeURIComponent(qv)}`);
  const isC = role === 'courier';
  main.innerHTML = head(isC ? 'Livreurs' : 'Clients', `${isC ? '<button class="btn sm primary" data-act="newcourier">＋ Nouveau livreur</button>' : ''}<a class="btn sm" href="#" data-act="export" data-type="users">⬇ CSV</a>`) + `
    <div class="filters"><select class="input" data-u="status"><option value="">Tous</option>${(isC ? ['pending', 'active', 'suspended', 'rejected'] : ['active', 'suspended']).map((s) => `<option value="${s}" ${st === s ? 'selected' : ''}>${{ pending: 'À valider', active: 'Actifs', suspended: 'Suspendus', rejected: 'Refusés' }[s]}</option>`).join('')}</select>
    <input class="input" data-u="q" placeholder="Nom ou téléphone" value="${esc(qv)}"><button class="btn sm primary" data-act="ufilter" data-role="${role}">Filtrer</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Téléphone</th>${isC ? '<th>CIN</th><th>Note</th><th class="num">Solde</th><th>En ligne</th>' : '<th>Type</th><th>Annulations</th>'}<th class="num">Livraisons</th><th>Inscrit</th><th>Statut</th><th></th></tr></thead><tbody>
    ${r.users.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.company ? `<div class="tiny muted">${esc(u.company)}</div>` : ''}${isC && u.doc_note ? `<div class="tiny muted">${esc(u.doc_note)}</div>` : ''}</td><td><a href="tel:${esc(u.phone)}">${esc(phoneFmt(u.phone))}</a></td>
      ${isC ? `<td class="small">${esc(u.cin || '')}${u.address ? `<div class="tiny muted">${esc(u.address)}</div>` : ''}${u.emergency_contact ? `<div class="tiny muted">🆘 ${esc(u.emergency_contact)}</div>` : ''}</td><td>${stars(u.rating_count ? Math.round((u.rating_sum / u.rating_count) * 10) / 10 : null)}</td><td class="num">${ar(u.balance)}</td><td class="small">${u.available && u.last_seen > Date.now() - 600e3 ? '🟢' : '⚪'} ${u.last_seen ? dt(u.last_seen) : ''}</td>`
      : `<td class="small">${u.is_business ? '🏢 Entreprise' : 'Particulier'}</td><td>${u.cancel_count}</td>`}
      <td class="num">${u.delivered}</td><td class="small">${dt(u.created_at)}</td><td>${statusPill(u.status)}</td>
      <td style="white-space:nowrap">${u.status !== 'active' ? `<button class="btn sm primary" data-act="ustatus" data-id="${u.id}" data-s="active">${u.status === 'pending' ? 'Valider' : 'Activer'}</button>` : ''}
        ${u.status === 'pending' ? `<button class="btn sm danger" data-act="ustatus" data-id="${u.id}" data-s="rejected">Refuser</button>` : ''}
        ${u.status === 'active' ? `<button class="btn sm danger" data-act="ustatus" data-id="${u.id}" data-s="suspended">Suspendre</button>` : ''}
        ${isC && u.status === 'active' ? `<button class="btn sm" data-act="planning" data-id="${u.id}" data-name="${esc(u.name)}" title="Axes & horaires">🧭 Axes</button><button class="btn sm" data-act="tx" data-id="${u.id}" data-name="${esc(u.name)}" title="Opération">💰</button>` : ''}
        <button class="btn sm ghost" data-act="pwreset" data-id="${u.id}" data-name="${esc(u.name)}" title="Nouveau mot de passe">🔑</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted">Aucun</td></tr>'}
    </tbody></table></div>`;
}

// ---------------------------------------------------------------- détails
async function deliveryDetail(id) {
  const d = await api('GET', `/api/deliveries/${id}`);
  const m = modal(`Livraison #${d.id}`, `<div class="grid2" style="grid-template-columns:1fr 1fr">
    <div class="stack small">
      <div class="row between">${statusPill(d.status)}${d.flagged ? `<span class="status-pill st-cancelled">⚠ ${esc(d.flagged)}</span>` : ''}</div>
      <div><b>Client :</b> ${esc(d.client.name)} · <a href="tel:${esc(d.client.phone)}">${esc(phoneFmt(d.client.phone))}</a></div>
      <div><b>Livreur :</b> ${d.courier ? `${esc(d.courier.name)} · <a href="tel:${esc(d.courier.phone)}">${esc(phoneFmt(d.courier.phone))}</a>` : '—'}</div>
      <div><b>Départ :</b> ${esc(d.pickup_addr || '')}</div><div><b>Arrivée :</b> ${esc(d.drop_addr || '')}</div>
      ${d.recipient_name || d.recipient_phone ? `<div><b>Destinataire :</b> ${esc(d.recipient_name || '')} ${esc(phoneFmt(d.recipient_phone || ''))}</div>` : ''}
      <div><b>Type :</b> ${t(d.type)} ${d.description ? '— ' + esc(d.description) : ''}</div>
      <div><b>Distance :</b> ${km(d.distance_km)} · <b>Conseillé :</b> ${ar(d.suggested_price)} · <b>Proposé :</b> ${ar(d.proposed_price)} · <b>Final :</b> ${ar(d.final_price)}${d.discount ? ` · Remise ${ar(d.discount)} (${esc(d.promo_code)})` : ''}</div>
      <div><b>Commission :</b> ${ar(d.commission)} · <b>Paiement :</b> ${t(d.payment_method)} (${d.payment_status})</div>
      <div><b>PIN :</b> ${esc(d.pin)}</div>
      <div class="muted">Créée ${dt(d.created_at)} · Attribuée ${dt(d.assigned_at)} · Récupérée ${dt(d.picked_at)} · Livrée ${dt(d.delivered_at)}${d.cancelled_at ? ` · Annulée ${dt(d.cancelled_at)} par ${esc(d.cancelled_by)} : ${esc(d.cancel_reason || '')}` : ''}</div>
      ${d.rating ? `<div><b>Note :</b> <span class="stars">${'★'.repeat(d.rating)}</span> ${esc(d.rating_comment || '')}</div>` : ''}
      ${d.offers?.length ? `<div><b>Offres :</b> ${d.offers.map((o) => `${esc(o.courier_name)} ${ar(o.price)} (${o.status})`).join(' · ')}</div>` : ''}
      ${d.messages?.length ? `<b>Messages</b><div class="chat">${chatHtml(d.messages, d.client.id)}</div>` : ''}
      <div class="row wrap">${['open', 'assigned', 'picked_up'].includes(d.status) ? '<button class="btn sm danger" data-cancel>Annuler la livraison</button>' : ''}
        ${d.payment_method !== 'cash' && d.payment_status !== 'paid' && d.status === 'delivered' ? '<button class="btn sm primary" data-paid>Paiement reçu</button>' : ''}
        ${d.payment_status === 'paid' ? '<button class="btn sm" data-refund>Marquer remboursé</button>' : ''}</div>
    </div><div id="dmap" style="height:380px;border-radius:14px;overflow:hidden"></div></div>`, { wide: true });
  const map = makeMap(m.el.querySelector('#dmap'), { zoomControl: true });
  if (map) {
    L.marker([d.pickup_lat, d.pickup_lng], { icon: icons.a() }).addTo(map);
    L.marker([d.drop_lat, d.drop_lng], { icon: icons.b() }).addTo(map);
    const pts = [[d.pickup_lat, d.pickup_lng], [d.drop_lat, d.drop_lng]];
    if (d.track?.length) { const tr = d.track.map((p) => [p.lat, p.lng]); L.polyline(tr, { color: '#e8890c', weight: 4 }).addTo(map); pts.push(...tr); }
    if (d.courier?.lat != null) { L.marker([d.courier.lat, d.courier.lng], { icon: icons.bike() }).addTo(map); pts.push([d.courier.lat, d.courier.lng]); }
    setTimeout(() => { map.invalidateSize(); map.fitBounds(L.latLngBounds(pts).pad(.2)); }, 150);
  }
  m.el.querySelector('[data-cancel]')?.addEventListener('click', async () => {
    const reason = await promptBox('Annuler la livraison', { label: 'Motif' }); if (reason === null) return;
    try { await api('POST', `/api/deliveries/${d.id}/cancel`, { reason }); m.close(); show(); } catch (e) { toastErr(e); }
  });
  const pay = (st) => async () => { try { await api('POST', `/api/admin/deliveries/${d.id}/payment`, { payment_status: st }); m.close(); show(); } catch (e) { toastErr(e); } };
  m.el.querySelector('[data-paid]')?.addEventListener('click', pay('paid'));
  m.el.querySelector('[data-refund]')?.addEventListener('click', pay('refunded'));
}

async function courierTrack(c) {
  const r = await api('GET', `/api/admin/track?courier_id=${c.id}&from=${Date.now() - 864e5}`);
  trackLayer?.remove();
  if (!liveMap || !r.positions.length) return toast(`${c.name} : aucun trajet sur 24 h`);
  trackLayer = L.polyline(r.positions.map((p) => [p.lat, p.lng]), { color: '#2563eb', weight: 4, opacity: .8 }).addTo(liveMap);
  liveMap.fitBounds(trackLayer.getBounds().pad(.2));
  toast(`Trajet de ${c.name} sur 24 h (${r.positions.length} points)`);
}

function txForm(id, name) {
  const m = modal(`Opération — ${name}`, `<div class="stack">
    <label class="field"><span>Type</span><select class="input" data-k><option value="deposit">Versement du livreur (règle ses commissions)</option><option value="payout">Paiement au livreur (Mobile Money encaissé)</option><option value="subscription">Abonnement (prolonge la validité)</option><option value="adjust">Ajustement (+/−)</option></select></label>
    <label class="field"><span>Montant (Ar)</span><input class="input" inputmode="numeric" data-a></label>
    <label class="field" data-months-f><span>Nombre de mois (abonnement)</span><input class="input" type="number" min="1" max="12" value="1" data-m></label>
    <label class="field"><span>Note / référence</span><input class="input" data-n placeholder="Réf. MVola, reçu…"></label>
    <button class="btn primary block" data-ok>Enregistrer</button></div>`);
  m.el.querySelector('[data-ok]').onclick = async () => {
    try {
      await api('POST', '/api/admin/transactions', { courier_id: id, kind: m.el.querySelector('[data-k]').value, amount: Number(m.el.querySelector('[data-a]').value.replace(/[^\d-]/g, '')), months: Number(m.el.querySelector('[data-m]').value), note: m.el.querySelector('[data-n]').value });
      m.close(); toast('Enregistré', 'ok'); show();
    } catch (e) { toastErr(e); }
  };
}

async function downloadCsv(type, from) {
  const res = await fetch(`/api/admin/export?type=${type}${from ? '&from=' + from : ''}`, { headers: { authorization: `Bearer ${state.token}` } });
  if (!res.ok) return toast('Export impossible', 'err');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (res.headers.get('content-disposition') || '').match(/filename="(.+)"/)?.[1] || `alefa-${type}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- actions
const actions = {
  nav: (el) => { location.hash = el.dataset.v; },
  menu: () => $('#side').classList.toggle('open'),
  notifs: () => showNotifications(),
  profile: () => profileForm(),
  delivery: (el) => deliveryDetail(+el.dataset.id),
  ctrack: (el) => { const c = $('[data-live-list]')._couriers.find((x) => x.id === +el.dataset.id); if (c) { liveMk['c' + c.id] && liveMap.setView(liveMk['c' + c.id].getLatLng(), 16); courierTrack(c); } },
  dfilter: () => { const p = new URLSearchParams(); $$('[data-f]').forEach((i) => p.set(i.dataset.f, i.value)); sessionStorage.setItem('adm_dfilter', p.toString()); show(); },
  ufilter: (el) => { sessionStorage.setItem('adm_ust_' + el.dataset.role, $('[data-u=status]').value); sessionStorage.setItem('adm_uq_' + el.dataset.role, $('[data-u=q]').value); show(); },
  ustatus: async (el) => {
    const s = el.dataset.s;
    if (s !== 'active' && !(await confirmBox(s === 'suspended' ? 'Suspendre ce compte ? L\'utilisateur sera déconnecté.' : 'Refuser cette inscription ?', 'Confirmer', true))) return;
    await api('POST', `/api/admin/users/${el.dataset.id}/status`, { status: s }); toast('OK', 'ok'); refreshCounts(); show();
  },
  tx: (el) => txForm(+el.dataset.id, el.dataset.name),
  paid: async (el) => { await api('POST', `/api/admin/deliveries/${el.dataset.id}/payment`, { payment_status: 'paid' }); show(); },
  cst: (el) => { sessionStorage.setItem('adm_cst', el.dataset.v); show(); },
  resolve: async (el) => { const r = await promptBox('Traitement', { label: 'Action menée / commentaire' }); if (r === null) return; await api('POST', `/api/admin/complaints/${el.dataset.id}/resolve`, { resolution: r }); refreshCounts(); show(); },
  period: (el) => { sessionStorage.setItem('adm_period', el.dataset.v); show(); },
  print: () => window.print(),
  export: (el) => downloadCsv(el.dataset.type, el.dataset.from),
  savesettings: async () => {
    const settings = {}; $$('[data-s]').forEach((i) => (settings[i.dataset.s] = i.value));
    await api('PUT', '/api/admin/settings', { settings }); toast('Paramètres enregistrés', 'ok');
  },
  zone: (el) => {
    const z = el.dataset.z ? JSON.parse(el.dataset.z) : { name: '', center_lat: TANA[0], center_lng: TANA[1], radius_km: 10, active: 1 };
    const m = modal(z.id ? 'Modifier la zone' : 'Nouvelle zone', `<div class="stack"><input class="input" data-n placeholder="Nom (ex : Toamasina)" value="${esc(z.name)}">
      <div class="small muted">Déplacez la carte pour centrer la zone.</div><div id="zmap" style="height:300px;border-radius:12px;overflow:hidden;position:relative"></div>
      <label class="field"><span>Rayon (km)</span><input class="input" type="number" data-r value="${z.radius_km}"></label>
      <label class="row small"><input type="checkbox" data-a ${z.active ? 'checked' : ''}> Zone active</label><button class="btn primary block" data-ok>Enregistrer</button></div>`);
    const zm = makeMap(m.el.querySelector('#zmap'), { center: [z.center_lat, z.center_lng], zoom: 11, zoomControl: true });
    let circle = zm && L.circle([z.center_lat, z.center_lng], { radius: z.radius_km * 1000, color: '#0b6e4f' }).addTo(zm);
    const upd = () => circle && (circle.setLatLng(zm.getCenter()), circle.setRadius(Number(m.el.querySelector('[data-r]').value) * 1000));
    zm?.on('move', upd); m.el.querySelector('[data-r]').addEventListener('input', upd);
    m.el.querySelector('[data-ok]').onclick = async () => {
      const c = zm ? zm.getCenter() : { lat: z.center_lat, lng: z.center_lng };
      try { await api('POST', '/api/admin/zones', { id: z.id, name: m.el.querySelector('[data-n]').value, center_lat: c.lat, center_lng: c.lng, radius_km: Number(m.el.querySelector('[data-r]').value), active: m.el.querySelector('[data-a]').checked }); m.close(); show(); } catch (e) { toastErr(e); }
    };
  },
  promo: (el) => {
    const p = el.dataset.p ? JSON.parse(el.dataset.p) : { code: '', percent: 10, active: 1 };
    const m = modal('Code promo', `<div class="stack"><input class="input" data-c placeholder="CODE" value="${esc(p.code)}" ${p.code ? 'readonly' : ''} style="text-transform:uppercase">
      <div class="row"><label class="field grow"><span>Réduction (%)</span><input class="input" type="number" data-pc value="${p.percent}"></label><label class="field grow"><span>Plafond (Ar)</span><input class="input" type="number" data-mx value="${p.max_amount ?? ''}"></label></div>
      <div class="row"><label class="field grow"><span>Utilisations max</span><input class="input" type="number" data-mu value="${p.max_uses ?? ''}"></label><label class="field grow"><span>Expire le</span><input class="input" type="date" data-ex value="${p.expires_at ? new Date(p.expires_at).toISOString().slice(0, 10) : ''}"></label></div>
      <label class="row small"><input type="checkbox" data-a ${p.active ? 'checked' : ''}> Actif</label><button class="btn primary block" data-ok>Enregistrer</button></div>`);
    m.el.querySelector('[data-ok]').onclick = async () => {
      const v = (s) => m.el.querySelector(s).value;
      try { await api('POST', '/api/admin/promos', { code: v('[data-c]'), percent: Number(v('[data-pc]')), max_amount: v('[data-mx]') || null, max_uses: v('[data-mu]') || null, expires_at: v('[data-ex]') ? new Date(v('[data-ex]') + 'T23:59:59').getTime() : null, active: m.el.querySelector('[data-a]').checked }); m.close(); show(); } catch (e) { toastErr(e); }
    };
  },
  newcourier: () => courierForm(),
  pfilter: () => { sessionStorage.setItem('adm_pst', $('[data-pf=status]').value); sessionStorage.setItem('adm_pq', $('[data-pf=q]').value); show(); },
  pexport: async () => {
    const res = await fetch('/api/admin/shipments/export', { headers: { authorization: `Bearer ${state.token}` } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `alefa-colis-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  },
  newparcel: () => sendForm({ adminMode: true, onDone: () => show() }),
  parcel: (el) => parcelDetail(+el.dataset.id),
  settle: async (el) => {
    const v = await promptBox(`Encaisser — ${el.dataset.name}`, { label: 'Montant reçu du livreur (Ar)', type: 'number', value: el.dataset.amt });
    if (v == null || v === '') return;
    const r = await api('POST', `/api/admin/couriers/${el.dataset.id}/settle`, { amount: Number(v) });
    toast(`${ar(r.received)} encaissés (${r.shipments} colis)`, r.received === r.total ? 'ok' : 'err'); show();
  },
  payvendor: async (el) => {
    if (!(await confirmBox(`Payer ${ar(Number(el.dataset.amt))} à ${el.dataset.name} ?`, 'Payer'))) return;
    const note = await promptBox('Référence du paiement', { label: 'Ex : MVola réf. 12345, espèces…' });
    const r = await api('POST', `/api/admin/vendors/${el.dataset.id}/pay`, { note: note || '' });
    toast(`${ar(r.amount)} payés (${r.shipments} colis)`, 'ok'); show();
  },
  newmerchant: () => merchantForm(),
  mhook: async (el) => { const v = await promptBox('Webhook (https://…)', { value: el.dataset.url, placeholder: 'https://mon-logiciel.mg/webhooks/alefa' }); if (v == null) return; await api('POST', `/api/admin/merchants/${el.dataset.id}`, { webhook_url: v }); show(); },
  mkey: async (el) => {
    if (!(await confirmBox('Générer une nouvelle clé ? L\'ancienne cessera de fonctionner immédiatement.', 'Générer', true))) return;
    const r = await api('POST', `/api/admin/merchants/${el.dataset.id}`, { regenerate: true });
    modal('Nouvelle clé API', `<p>Copiez-la maintenant, elle ne sera plus affichée :</p><pre style="white-space:pre-wrap;word-break:break-all;background:var(--bg);padding:12px;border-radius:10px">${esc(r.api_key)}</pre>`); show();
  },
  mactive: async (el) => { await api('POST', `/api/admin/merchants/${el.dataset.id}`, { active: el.dataset.v === '1' }); show(); },
  planning: (el) => planningForm(+el.dataset.id, el.dataset.name),
  pwreset: async (el) => {
    const pw = await promptBox(`Nouveau mot de passe — ${el.dataset.name}`, { label: 'Mot de passe provisoire (6 caractères min.)', value: Math.random().toString(36).slice(2, 10) });
    if (!pw) return;
    await api('POST', `/api/admin/users/${el.dataset.id}/password`, { password: pw });
    modal('Mot de passe modifié', `<p>Communiquez ce mot de passe à <b>${esc(el.dataset.name)}</b> :</p><p style="font-size:1.6rem;font-weight:800;text-align:center;letter-spacing:.05em">${esc(pw)}</p><p class="small muted">Il pourra le changer dans son profil.</p>`);
  },
  axe: (el) => axeForm(el.dataset.a ? JSON.parse(el.dataset.a) : null),
  axedel: async (el) => { if (!(await confirmBox('Supprimer cet axe ? Il sera retiré du planning des livreurs.', 'Supprimer', true))) return; await api('DELETE', `/api/admin/axes/${el.dataset.id}`); show(); },
  newuser: () => {
    const m = modal('Créer un compte', `<div class="stack"><select class="input" data-r><option value="admin">Administrateur</option><option value="courier">Livreur (pré-validé)</option><option value="client">Client entreprise</option></select>
      <input class="input" data-n placeholder="Nom"><input class="input" data-p type="tel" placeholder="Téléphone"><input class="input" data-c placeholder="Entreprise / CIN (facultatif)"><input class="input" data-pw type="text" placeholder="Mot de passe provisoire (6 car. min.)">
      <button class="btn primary block" data-ok>Créer</button></div>`);
    m.el.querySelector('[data-ok]').onclick = async () => {
      const v = (s) => m.el.querySelector(s).value; const role = v('[data-r]');
      try { await api('POST', '/api/admin/users', { role, name: v('[data-n]'), phone: v('[data-p]'), password: v('[data-pw]'), company: role === 'client' ? v('[data-c]') : '', cin: role === 'courier' ? v('[data-c]') : '', is_business: role === 'client' }); m.close(); toast('Compte créé', 'ok'); } catch (e) { toastErr(e); }
    };
  },
};

// ---------------------------------------------------------------- livreurs, axes, planning
function courierForm() {
  const m = modal('Nouveau livreur', `<div class="stack">
    <div class="row"><label class="field grow"><span>Nom complet</span><input class="input" data-v="name"></label><label class="field grow"><span>Téléphone</span><input class="input" type="tel" data-v="phone" placeholder="034 12 345 67"></label></div>
    <div class="row"><label class="field grow"><span>Numéro CIN</span><input class="input" data-v="cin"></label><label class="field grow"><span>Mot de passe provisoire</span><input class="input" data-v="password" value="${Math.random().toString(36).slice(2, 10)}"></label></div>
    <label class="field"><span>Adresse</span><input class="input" data-v="address"></label>
    <label class="field"><span>Contact d'urgence</span><input class="input" data-v="emergency_contact" placeholder="Nom + téléphone"></label>
    <label class="field"><span>Vélo / documents vérifiés</span><textarea class="input" data-v="doc_note" rows="2" placeholder="Type et couleur du vélo, documents contrôlés…"></textarea></label>
    <button class="btn primary block" data-ok>Créer le livreur</button></div>`);
  m.el.querySelector('[data-ok]').onclick = async () => {
    const b = { role: 'courier' }; m.el.querySelectorAll('[data-v]').forEach((i) => (b[i.dataset.v] = i.value));
    try {
      const r = await api('POST', '/api/admin/users', b);
      m.close();
      const done = modal('Livreur créé ✅', `<p>Identifiants à communiquer à <b>${esc(b.name)}</b> :</p><div class="card"><div>📱 <b>${esc(b.phone)}</b></div><div>🔑 <b>${esc(b.password)}</b></div><div class="small muted">Lien : ${esc(location.origin)}</div></div>
        <button class="btn primary block" style="margin-top:12px" data-pl>🧭 Définir ses axes maintenant</button>`);
      done.el.querySelector('[data-pl]').onclick = () => { done.close(); planningForm(r.id, b.name); };
      show();
    } catch (e) { toastErr(e); }
  };
}

function axeForm(a) {
  a ||= { name: '', center_lat: TANA[0], center_lng: TANA[1], radius_km: 1.5, color: '#0b6e4f', active: 1 };
  const m = modal(a.id ? `Axe : ${a.name}` : 'Nouvel axe', `<div class="stack">
    <div class="row"><input class="input grow" data-n placeholder="Nom (ex : Analakely – Tsaralalana)" value="${esc(a.name)}"><input type="color" data-c value="${esc(a.color)}" style="width:52px;height:46px;border:0;background:none"></div>
    <div class="small muted">Déplacez la carte pour centrer l'axe, réglez le rayon.</div>
    <div id="axm" style="height:320px;border-radius:12px;overflow:hidden;position:relative"></div>
    <div class="row"><label class="field grow"><span>Rayon (km)</span><input class="input" type="number" step="0.1" min="0.2" data-r value="${a.radius_km}"></label>
    <label class="field grow"><span>Frais colis sur cet axe (Ar)</span><input class="input" type="number" data-fe value="${a.fee ?? ''}" placeholder="par défaut"></label></div>
    <label class="row small"><input type="checkbox" data-a ${a.active ? 'checked' : ''}> Axe actif</label>
    <button class="btn primary block" data-ok>Enregistrer</button></div>`);
  const zm = makeMap(m.el.querySelector('#axm'), { center: [a.center_lat, a.center_lng], zoom: 14, zoomControl: true });
  const circle = zm && L.circle([a.center_lat, a.center_lng], { radius: a.radius_km * 1000, color: a.color }).addTo(zm);
  const upd = () => { if (!circle) return; circle.setLatLng(zm.getCenter()); circle.setRadius(Number(m.el.querySelector('[data-r]').value) * 1000); circle.setStyle?.({ color: m.el.querySelector('[data-c]').value }); };
  zm?.on('move', upd); m.el.querySelector('[data-r]').addEventListener('input', upd); m.el.querySelector('[data-c]').addEventListener('input', upd);
  m.el.querySelector('[data-ok]').onclick = async () => {
    const c = zm ? zm.getCenter() : { lat: a.center_lat, lng: a.center_lng };
    try { await api('POST', '/api/admin/axes', { id: a.id, name: m.el.querySelector('[data-n]').value, color: m.el.querySelector('[data-c]').value, center_lat: c.lat, center_lng: c.lng, radius_km: Number(m.el.querySelector('[data-r]').value), fee: m.el.querySelector('[data-fe]').value, active: m.el.querySelector('[data-a]').checked }); m.close(); show(); } catch (e) { toastErr(e); }
  };
}

const DAYS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'];
const toMin = (v) => { const [h, mi] = String(v || '0:0').split(':').map(Number); return h * 60 + (mi || 0); };
async function planningForm(courierId, name) {
  const [{ axes, slot_minutes }, cur] = await Promise.all([api('GET', '/api/admin/axes'), api('GET', `/api/admin/couriers/${courierId}/axes`)]);
  if (!axes.length) { toast('Créez d\'abord un axe (menu Axes & planning)', 'err'); location.hash = 'axes'; return; }
  let slots = cur.slots.map((x) => ({ axe_id: x.axe_id, start_min: x.start_min, end_min: x.end_min, days: x.days }));
  const m = modal(`Axes & horaires — ${name}`, `<div class="stack">
    <div class="small muted">Sans aucun créneau, le livreur travaille sur toute la zone autour de lui. Avec des créneaux, il ne reçoit que les demandes de l'axe du créneau en cours (heure de Madagascar).</div>
    <div class="card" style="background:var(--bg);border:0"><b>⚡ Générer une rotation</b>
      <div class="small muted" style="margin:4px 0 8px">Ex : de 07:00 à 19:00, créneaux de ${slot_minutes} min, en alternant les axes cochés.</div>
      <div class="chips" data-gax>${axes.filter((a) => a.active).map((a) => `<label class="chip"><input type="checkbox" value="${a.id}" style="margin-right:4px">${esc(a.name)}</label>`).join('')}</div>
      <div class="row wrap" style="margin-top:8px"><label class="field"><span>De</span><input class="input" type="time" data-gfrom value="07:00"></label><label class="field"><span>À</span><input class="input" type="time" data-gto value="19:00"></label>
        <label class="field"><span>Créneau (min)</span><input class="input" type="number" min="15" step="15" data-gstep value="${slot_minutes}" style="width:100px"></label>
        <button class="btn sun" data-gen style="align-self:flex-end">Générer</button></div></div>
    <div class="row between"><b>Créneaux</b><span><button class="btn sm" data-add>＋ Créneau</button> <button class="btn sm danger" data-clear>Tout effacer</button></span></div>
    <div data-slots class="list"></div>
    <button class="btn primary block" data-save>Enregistrer le planning</button></div>`, { wide: true });
  const box = m.el.querySelector('[data-slots]');
  const render = () => {
    slots.sort((a, b) => a.start_min - b.start_min);
    box.innerHTML = slots.map((x, i) => `<div class="row wrap" data-i="${i}" style="border-bottom:1px solid var(--line);padding-bottom:8px">
      <select class="input" data-k="axe_id" style="width:auto;min-width:160px">${axes.map((a) => `<option value="${a.id}" ${a.id === x.axe_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <input class="input" type="time" data-k="start" value="${hm(x.start_min)}" style="width:auto"> → <input class="input" type="time" data-k="end" value="${x.end_min >= 1440 ? '23:59' : hm(x.end_min)}" style="width:auto">
      <span class="chips">${DAYS.map((d, j) => `<button class="chip ${String(x.days).includes(String(j + 1)) ? 'on' : ''}" data-day="${j + 1}" style="padding:.25rem .5rem">${d}</button>`).join('')}</span>
      <button class="btn sm danger" data-del>✕</button></div>`).join('') || '<p class="muted small">Aucun créneau : le livreur travaille sur toute la zone.</p>';
  };
  render();
  box.addEventListener('change', (e) => {
    const row = e.target.closest('[data-i]'); if (!row) return; const x = slots[+row.dataset.i];
    if (e.target.dataset.k === 'axe_id') x.axe_id = +e.target.value;
    if (e.target.dataset.k === 'start') x.start_min = toMin(e.target.value);
    if (e.target.dataset.k === 'end') { const v = toMin(e.target.value); x.end_min = v === 1439 ? 1440 : v; }
  });
  box.addEventListener('click', (e) => {
    const row = e.target.closest('[data-i]'); if (!row) return; const x = slots[+row.dataset.i];
    if (e.target.closest('[data-del]')) { slots.splice(+row.dataset.i, 1); render(); }
    const d = e.target.closest('[data-day]')?.dataset.day;
    if (d) { x.days = String(x.days).includes(d) ? String(x.days).replace(d, '') : [...String(x.days) + d].sort().join(''); render(); }
  });
  m.el.querySelector('[data-add]').onclick = () => { const last = slots[slots.length - 1]; const st = last ? last.end_min % 1440 : 420; slots.push({ axe_id: axes[0].id, start_min: st, end_min: Math.min(1440, st + slot_minutes), days: '1234567' }); render(); };
  m.el.querySelector('[data-clear]').onclick = () => { slots = []; render(); };
  m.el.querySelector('[data-gen]').onclick = () => {
    const ids = [...m.el.querySelectorAll('[data-gax] input:checked')].map((i) => +i.value);
    if (!ids.length) return toast('Cochez au moins un axe', 'err');
    const from = toMin(m.el.querySelector('[data-gfrom]').value), to = toMin(m.el.querySelector('[data-gto]').value) || 1440, step = Math.max(15, Number(m.el.querySelector('[data-gstep]').value) || 60);
    if (to <= from) return toast('Heure de fin invalide', 'err');
    slots = []; let k = 0;
    for (let t0 = from; t0 < to; t0 += step) slots.push({ axe_id: ids[k++ % ids.length], start_min: t0, end_min: Math.min(to, t0 + step), days: '1234567' });
    render();
  };
  m.el.querySelector('[data-save]').onclick = async () => {
    try { await api('PUT', `/api/admin/couriers/${courierId}/axes`, { slots }); m.close(); toast('Planning enregistré', 'ok'); } catch (e) { toastErr(e); }
  };
}

// ---------------------------------------------------------------- colis : détail centre (attribution) et marchands
async function parcelDetail(id) {
  const d = await shipDetail(id, { role: 'admin', onChange: () => show() });
  const s = d.shipment;
  if (!['pending', 'assigned'].includes(s.status)) return;
  const sch = await api('GET', '/api/schedule');
  const couriers = (await api('GET', '/api/admin/users?role=courier&status=active')).users;
  const box = document.createElement('div');
  box.className = 'card';
  box.innerHTML = `<b>Programmer sur un départ</b>
    <select class="input" data-dep style="margin-top:6px"><option value="auto">⚡ Automatique (prochain départ couvrant l'adresse)</option>
      ${sch.departures.filter((x) => !x.started).map((x) => `<option value="${x.slot_id}|${x.departure_at}">${dt(x.departure_at)} · ${esc(x.axe)} · 🚲 ${esc(x.courier)} (${x.load} colis)</option>`).join('')}
      <optgroup label="Livreur sans départ précis">${couriers.map((u) => `<option value="c${u.id}">🚲 ${esc(u.name)}</option>`).join('')}</optgroup></select>
    <button class="btn primary block" data-go style="margin-top:8px">Programmer</button>`;
  d.actions.prepend(box);
  box.querySelector('[data-go]').onclick = async () => {
    const v = box.querySelector('[data-dep]').value;
    const body = v === 'auto' ? { auto: true } : v.startsWith('c') ? { courier_id: Number(v.slice(1)) } : { slot_id: Number(v.split('|')[0]), departure_at: Number(v.split('|')[1]) };
    try { await api('POST', `/api/shipments/${s.id}/assign`, body); d.modal.close(); toast('Colis programmé', 'ok'); show(); } catch (e) { toastErr(e); }
  };
}

function merchantForm() {
  const m = modal('Connecter un logiciel de vente', `<div class="stack">
    <label class="field"><span>Nom du logiciel / de la boutique</span><input class="input" data-n placeholder="Ex : Boutique Soa"></label>
    <label class="field"><span>Téléphone du vendeur (compte qui reçoit les paiements)</span><input class="input" data-p type="tel" placeholder="034 12 345 67"></label>
    <label class="field"><span>Webhook (facultatif)</span><input class="input" data-w placeholder="https://…/webhooks/alefa"></label>
    <button class="btn primary block" data-ok>Créer la clé API</button></div>`);
  m.el.querySelector('[data-ok]').onclick = async () => {
    try {
      const r = await api('POST', '/api/admin/merchants', { name: m.el.querySelector('[data-n]').value, phone: m.el.querySelector('[data-p]').value, webhook_url: m.el.querySelector('[data-w]').value });
      m.close();
      modal('Logiciel connecté ✅', `<p class="small">À transmettre au développeur du logiciel de vente. <b>La clé ne sera plus affichée.</b></p>
        <div class="field"><span>Clé API</span><pre style="white-space:pre-wrap;word-break:break-all;background:var(--bg);padding:10px;border-radius:10px">${esc(r.api_key)}</pre></div>
        <div class="field"><span>Secret webhook (vérification de signature)</span><pre style="white-space:pre-wrap;word-break:break-all;background:var(--bg);padding:10px;border-radius:10px">${esc(r.webhook_secret)}</pre></div>
        ${r.vendor_temp_password ? `<p class="small">Compte vendeur créé — mot de passe provisoire : <b>${esc(r.vendor_temp_password)}</b></p>` : ''}`);
      show();
    } catch (e) { toastErr(e); }
  };
}
