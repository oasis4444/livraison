// Tableau de bord Administrateur.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, every, startNotifications, showNotifications, profileForm, chatHtml, TANA,
} from './core.js';

let root, main, view = location.hash.replace('#', '') || 'dash', liveTimer = null, liveMap = null, counts = {};
const liveMk = {};
let trackLayer = null;

const NAV = [
  ['dash', '📊', 'Tableau de bord'], ['live', '🗺️', 'Carte en direct'], ['deliveries', '📦', 'Livraisons'], ['couriers', '🚲', 'Livreurs'],
  ['clients', '👥', 'Clients'], ['payments', '💰', 'Paiements & soldes'], ['complaints', '⚠️', 'Réclamations & SOS'], ['reports', '📈', 'Rapports'],
  ['settings', '⚙️', 'Paramètres'], ['audit', '🧾', 'Journal'],
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
  if (liveMap) { liveMap.remove(); liveMap = null; for (const k of Object.keys(liveMk)) delete liveMk[k]; trackLayer = null; }
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
      <div class="kpis">
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
      for (const c of r.couriers) {
        const stale = r.server_time - c.last_seen > 2 * 60e3;
        keep.add('c' + c.id);
        upsertMarker(liveMap, liveMk, 'c' + c.id, [c.lat, c.lng], icons.bike(stale ? 'stale' : c.delivery_id ? 'busy' : ''), { refreshIcon: true })
          ?.bindTooltip(`<b>${esc(c.name)}</b><br>${c.delivery_id ? `Livraison #${c.delivery_id} (${t('st_' + c.delivery_status)})` : 'Disponible'}<br>Vu à ${time(c.last_seen)}`)
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
        ${r.couriers.map((c) => `<div class="row between small" data-act="ctrack" data-id="${c.id}" style="cursor:pointer;padding:4px 0"><span>${c.delivery_id ? '🟠' : '🟢'} ${esc(c.name)}</span><span class="muted">${time(c.last_seen)}</span></div>`).join('')}`;
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
          <div class="row">${f('max_open_requests', 'Demandes simultanées / client')}${f('position_retention_days', 'Conservation trajets GPS (jours)')}</div></div>
      </div><div class="stack">
        <div class="panel stack"><h3>Plateforme & paiements</h3>${f('platform_name', 'Nom', '', 'text')}${f('support_phone', 'Téléphone support', '', 'tel')}
          ${f('mvola_number', 'Numéro marchand MVola', '', 'text')}${f('orange_money_number', 'Numéro Orange Money', '', 'text')}${f('airtel_money_number', 'Numéro Airtel Money', '', 'text')}</div>
        <div class="panel"><div class="row between"><h3>Zones de service</h3><button class="btn sm" data-act="zone">＋ Zone</button></div>
          ${r.zones.map((z) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${z.active ? '🟢' : '⚪'} <b>${esc(z.name)}</b> · rayon ${z.radius_km} km</span><span><button class="btn sm" data-act="zone" data-z='${esc(JSON.stringify(z))}'>Modifier</button></span></div>`).join('')}</div>
        <div class="panel"><div class="row between"><h3>Codes promo</h3><button class="btn sm" data-act="promo">＋ Code</button></div>
          ${r.promos.map((p) => `<div class="row between small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${p.active ? '🟢' : '⚪'} <b>${esc(p.code)}</b> −${p.percent}%${p.max_amount ? ` (max ${ar(p.max_amount)})` : ''} · ${p.uses}${p.max_uses ? '/' + p.max_uses : ''} utilisations${p.expires_at ? ` · jusqu'au ${dt(p.expires_at)}` : ''}</span><button class="btn sm" data-act="promo" data-p='${esc(JSON.stringify(p))}'>Modifier</button></div>`).join('') || '<p class="muted small">Aucun</p>'}</div>
        <div class="panel"><div class="row between"><h3>Administrateurs & comptes</h3><button class="btn sm" data-act="newuser">＋ Créer un compte</button></div><p class="small muted">Créez un compte administrateur, un livreur pré-validé ou un compte entreprise.</p></div>
      </div></div>`;
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
  main.innerHTML = head(isC ? 'Livreurs' : 'Clients', `<a class="btn sm" href="#" data-act="export" data-type="users">⬇ CSV</a>`) + `
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
        ${isC && u.status === 'active' ? `<button class="btn sm" data-act="tx" data-id="${u.id}" data-name="${esc(u.name)}">💰</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Aucun</td></tr>'}
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
