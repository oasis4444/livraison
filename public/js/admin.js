// Tableau de bord Administrateur.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, every, hm, startNotifications, showNotifications, profileForm, chatHtml, TANA, bikeRoute, vehIcon, geocode, setNotifOpener, chatPanel, logout,
} from './core.js';
import { c, shipPill, sendForm, shipDetail, importForm, templateCsv, courierTripsEditor } from './colis.js';

let root, main, view = location.hash.replace('#', '') || 'dash', liveTimer = null, liveMap = null, counts = {};
const liveMk = {};
let trackLayer = null, axeLayers = [], refocus = null, shown = null;

// Menu : icônes sobres (traits), regroupées par usage.
const SV = {
  home: '<path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z"/>', route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l2 8h-6M14 5h2"/>', cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.2 2.6 3.5 5.5"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3M16.5 13.5h.01"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const aic = (k) => `<svg class="ad-ic" viewBox="0 0 24 24" aria-hidden="true">${SV[k] || ''}</svg>`;
const NAV = [
  ['Pilotage'], ['dash', 'home', 'Tableau de bord'], ['ops', 'route', 'Suivi des livraisons'], ['live', 'map', 'Carte en direct'],
  ['Colis et argent'], ['parcels', 'box', 'Colis'], ['cash', 'cash', 'Caisse & vendeurs'], ['creport', 'chart', 'Rapport livreurs'],['payments', 'wallet', 'Paiements & soldes'], ['deliveries', 'bolt', 'Courses express'],
  ['Équipe et clients'], ['couriers', 'bike', 'Livreurs'], ['axes', 'cal', 'Axes & planning'], ['clients', 'users', 'Clients'],
  ['Relation client'], ['support', 'chat', 'Service client'], ['complaints', 'alert', 'Réclamations & SOS'],
  ['Système'], ['reports', 'chart', 'Rapports'], ['staff', 'users', 'Équipe et rôles'], ['api', 'plug', 'Logiciels de vente'], ['settings', 'gear', 'Paramètres'], ['audit', 'list', 'Journal'],
];
// Rubriques permises selon le rôle de la personne connectée (null = administrateur complet).
const SYSTEM = ['staff', 'api', 'settings', 'audit'];
const allowed = (k) => { const p = state.user.perms; return !p || k === 'dash' || (!SYSTEM.includes(k) && p.includes(k)); };

export async function mount(el) {
  root = el;
  if (!document.querySelector('link[data-admin-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/admin.css'; l.dataset.adminCss = '1'; document.head.append(l); }
  const u = state.user;
  root.innerHTML = `<div class="admin ad">
    <aside class="side" id="side"><a class="logo" href="#dash"><img src="/icon.svg" alt="">Alefa</a><div class="ad-label">Administration</div><nav id="nav"></nav>
      <div class="ad-me"><span class="ad-av">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><small>${esc(phoneFmt(u.phone))}</small></div>
        <button data-act="profile" title="Profil">${aic('gear')}</button><button data-act="logout" title="Déconnexion">${aic('out')}</button></div></aside>
    <div class="side-back" data-act="menu"></div>
    <main class="main" id="main"></main>
  </div>`;
  main = $('#main');
  bind(root, actions);
  window.addEventListener('hashchange', () => { view = location.hash.replace('#', '') || 'dash'; show(); });
  // Filtres appliqués tout seuls : choix dans une liste → tout de suite ; recherche → pendant la frappe (ou touche Entrée).
  let ftmr;
  const runFilter = (el, delay) => {
    const box = el.closest('.filters, [data-autofilter]'), b = box?.querySelector('[data-act$="filter"], [data-act=crgo]'); if (!b) return;
    clearTimeout(ftmr);
    ftmr = setTimeout(() => { const k = [...el.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-act'); refocus = el.matches('input') && k ? { sel: `[${k.name}="${k.value}"]`, pos: el.selectionStart } : null; b.click(); }, delay);
  };
  const F = ':is(.filters, [data-autofilter])';
  root.addEventListener('change', (e) => { if (e.target.matches(`${F} select, ${F} input[type=date]`)) runFilter(e.target, 0); });
  root.addEventListener('input', (e) => { if (e.target.matches(`${F} input:not([type=date])`)) runFilter(e.target, 500); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches(`${F} input`)) { e.preventDefault(); runFilter(e.target, 0); } });
  startNotifications(() => { refreshCounts(); if (['dash', 'complaints', 'support'].includes(view)) show(); });
  // clic sur une notification : fiche du colis, course, réclamations, colis à répartir, paiements
  setNotifOpener((tg) => {
    if (tg.type === 'shipment') return parcelDetail(tg.id);
    if (tg.type === 'chat') return import('./talk.js').then((t) => t.openShipChat(tg.id));
    if (tg.type === 'delivery') return deliveryDetail(tg.id);
    if (tg.type === 'support') { supportOpen = tg.id || null; if (view === 'support') return show(); location.hash = 'support'; return; }
    const v = { alerts: 'complaints', parcels: 'parcels', payouts: 'cash', plan: 'couriers' }[tg.type];
    if (v) location.hash = v;
  });
  every(30000, refreshCounts);
  show();
}

async function refreshCounts() {
  const [s, su] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/support/unread').catch(() => ({ unread_threads: 0 }))]);
  counts = { couriers: s.users.pending || 0, complaints: s.complaints.open || 0, live: s.complaints.sos || 0, support: su.unread_threads || 0, ops: s.parcels?.pending || 0 };
  renderNav();
  return s;
}
function renderNav() {
  // Les titres de rubrique sans aucune entrée permise sont masqués.
  const items = NAV.filter(([k, ic]) => ic === undefined || allowed(k));
  $('#nav').innerHTML = items.filter((x, i) => x[1] !== undefined || (items[i + 1] && items[i + 1][1] !== undefined)).map(([k, ic, l]) => (ic === undefined ? `<div class="ad-grp">${k}</div>`
    : `<button data-act="nav" data-v="${k}" class="${view === k ? 'on' : ''}">${aic(ic)}<span>${l}</span>${counts[k] ? `<span class="cnt">${counts[k]}</span>` : ''}</button>`)).join('');
}
function head(title, extra = '') {
  const u = state.user;
  return `<div class="main-head"><div class="row"><button class="icon-btn mobile-nav" data-act="menu" aria-label="Menu">☰</button><h1>${title}</h1></div><div class="row wrap no-print ad-tools">${extra}
    <button class="ad-bell" data-act="notifs" aria-label="Notifications">${aic('bell')}<span class="badge-dot hidden" data-unread></span></button>
    <button class="ad-chip" data-act="profile"><span class="ad-av">${esc(initials(u.name))}</span><span>${esc(u.name.split(' ')[0])}</span></button></div></div>`;
}

async function show() {
  liveTimer?.stop(); liveTimer = null;
  if (liveMap) { liveMap.remove(); liveMap = null; for (const k of Object.keys(liveMk)) delete liveMk[k]; trackLayer = null; axeLayers = []; }
  renderNav();
  $('#side').classList.remove('open');
  // Même page (filtre, actualisation) : on garde l'affichage pendant le chargement, sans clignotement.
  if (shown !== view) main.innerHTML = '<p class="muted">Chargement…</p>'; else main.classList.add('loading');
  shown = view;
  if (!allowed(view)) view = 'dash';
  try { await (VIEWS[view] || VIEWS.dash)(); } catch (e) { toastErr(e); }
  main.classList.remove('loading');
  if (refocus) { const el = main.querySelector(refocus.sel); if (el) { el.focus(); try { el.setSelectionRange(refocus.pos, refocus.pos); } catch {} } refocus = null; }
}

// ---------------------------------------------------------------- vues
const kpi = (l, v, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
function bars(series, key, fmt = (v) => v) {
  const max = Math.max(1, ...series.map((s) => s[key] || 0));
  return `<div class="bars">${series.map((s) => `<div class="b" style="height:${((s[key] || 0) / max) * 100}%" title="${esc(s.label)} : ${fmt(s[key] || 0)}"><span>${s[key] ? fmt(s[key]) : ''}</span></div>`).join('')}</div>
    <div class="bar-labels">${series.map((s) => `<span>${esc(String(s.label).slice(-5))}</span>`).join('')}</div>`;
}

// Rapport livreurs : période (jours de Madagascar, AAAA-MM-JJ) et livreur choisis, gardés pendant la session.
const mgDay = (offset = 0) => new Date(Date.now() + 3 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
const dayLabel = (d) => { if (d === mgDay()) return "aujourd'hui"; if (d === mgDay(-1)) return 'hier'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };
const crRange = (k) => {
  if (k === 'yesterday') return [mgDay(-1), mgDay(-1)];
  if (k === '7') return [mgDay(-6), mgDay()];
  if (k === '30') return [mgDay(-29), mgDay()];
  if (k === 'month') return [mgDay().slice(0, 8) + '01', mgDay()];
  return [mgDay(), mgDay()];
};
const crF = (() => { try { const s = JSON.parse(sessionStorage.getItem('adm_cr') || 'null'); if (s?.from) return s; } catch {} const [from, to] = crRange('today'); return { from, to, courier: '', quick: 'today' }; })();
const crSave = () => sessionStorage.setItem('adm_cr', JSON.stringify(crF));

// Filtres du tableau des livraisons (gardés pendant la session).
const opsF = { step: sessionStorage.getItem('ops_step') || 'active', courier: sessionStorage.getItem('ops_c') || '', kind: '', days: sessionStorage.getItem('ops_days') || '1', q: '' };
const OPS_STEPS = [['active', 'En cours'], ['review', '⚠️ À valider'], ['todo', '📥 À répartir'], ['pickup', '🟢 À récupérer'], ['centre', '🏢 Au centre'], ['delivery', '🟠 En livraison'], ['done', '✅ Terminés'], ['all', 'Tous']];
const opsGroup = (p) => {
  if (p.review && p.status === 'pending') return 'review';
  if (p.status === 'pending') return 'todo';
  if (p.status === 'assigned') return 'pickup';
  if (['to_centre', 'at_centre'].includes(p.step)) return 'centre';
  if (p.status === 'picked_up') return 'delivery';
  return 'done';
};

let supportOpen = null, supportPanel = null;
const agoTxt = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} j`; };
const VIEWS = {
  async support() {
    const r = await api('GET', '/api/admin/support');
    if (!supportOpen && r.threads.length) supportOpen = r.threads[0].user_id;
    main.innerHTML = head('Service client') + `<div class="grid2" style="grid-template-columns:minmax(220px,1fr) 2fr">
      <div class="panel" style="max-height:70vh;overflow:auto">${r.threads.map((t) => `<div class="card" data-act="sthread" data-id="${t.user_id}" style="cursor:pointer;margin-bottom:6px;${t.user_id === supportOpen ? 'border-color:var(--green)' : ''}">
        <div class="row between small"><b>${t.role === 'courier' ? '🚲' : '👤'} ${esc(t.name)}</b>${t.unread ? `<span class="cnt">${t.unread}</span>` : ''}</div>
        <div class="tiny muted ellipsis">${t.last_from_centre ? '↩ ' : ''}${esc(t.last)}</div><div class="tiny muted">${dt(t.last_at)}</div></div>`).join('') || '<p class="muted small">Aucun message pour le moment.</p>'}</div>
      <div class="panel" data-sthread>${supportOpen ? '' : '<p class="muted">Choisissez une discussion.</p>'}</div></div>`;
    supportPanel?.stop(); supportPanel = null;
    if (supportOpen) {
      const el = $('[data-sthread]');
      const t = r.threads.find((x) => x.user_id === supportOpen);
      el.insertAdjacentHTML('beforebegin', '');
      const hd = document.createElement('div');
      hd.className = 'row between'; hd.style.marginBottom = '6px';
      hd.innerHTML = t ? `<b>${t.role === 'courier' ? '🚲 Livreur' : '👤 Client'} ${esc(t.name)}</b><span class="row" style="gap:6px"><button class="btn sm primary" data-callu>📞 Appeler (Alefa)</button><a class="btn sm" href="tel:${esc(t.phone)}">${esc(phoneFmt(t.phone))}</a></span>` : '';
      hd.querySelector('[data-callu]')?.addEventListener('click', () => import('./talk.js').then((m) => m.callUser({ user_id: t.user_id, name: t.name })));
      const body = document.createElement('div');
      el.append(hd, body);
      supportPanel = chatPanel(body, { centre: true, load: async () => (await api('GET', `/api/admin/support/${supportOpen}`)).messages, send: (b) => api('POST', `/api/admin/support/${supportOpen}`, { body: b }) });
      liveTimer = { stop: () => { supportPanel?.stop(); supportPanel = null; } };
    }
  },

  async ops() {
    main.innerHTML = head('Suivi des livraisons', `<span class="small muted" data-ops-info></span>`) + `
      <div class="panel no-print" style="margin-bottom:10px"><div class="row wrap" style="gap:8px;align-items:flex-end">
        <div class="seg" data-ostep>${OPS_STEPS.map(([k, l]) => `<button data-k="${k}" class="${opsF.step === k ? 'on' : ''}">${l} <span class="cnt" data-cnt="${k}"></span></button>`).join('')}</div>
        <label class="field"><span>Livreur</span><select class="input" data-oc style="min-width:170px"><option value="">Tous les livreurs</option><option value="none">— Sans livreur</option></select></label>
        <label class="field"><span>Type</span><select class="input" data-ok2><option value="">Tous</option><option value="tana">Antananarivo</option><option value="prov">🚌 Province</option><option value="mm">📱 Payé Mobile Money</option></select></label>
        <label class="field"><span>Période</span><select class="input" data-od>${[['1', 'Aujourd\'hui'], ['7', '7 jours'], ['30', '30 jours']].map(([v, l]) => `<option value="${v}" ${opsF.days === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field grow"><span>Recherche</span><input class="input" data-oq placeholder="N° colis, nom, quartier…"></label></div></div>
      <div class="live-wrap"><div class="livemap" id="opsmap"></div><div class="live-list panel" data-ops-list style="max-height:520px;overflow:auto"></div></div>
      <div class="panel" style="margin-top:12px"><h3>Livreurs — <span data-ops-period></span></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Livreur</th><th>Récupérés</th><th>Livrés</th><th>Valeur récupérée</th><th>Valeur livrée</th><th>Frais</th><th>Part centre</th><th>Part livreur</th><th>Non réglés</th><th>À remettre</th><th></th></tr></thead><tbody data-ops-table></tbody></table></div>
        <p class="tiny muted">Part du centre selon les frais (Paramètres) ; la récupération est gratuite, le reste revient au livreur qui livre. « À remettre » : argent encaissé − sa part + frais encaissés à la récupération (négatif = le centre lui doit). Réglez dans <a href="#cash">Caisse & vendeurs</a>.</p></div>`;
    liveMap = makeMap($('#opsmap'), { zoom: 13, zoomControl: true, layers: true });
    let data = null, fitted = false;
    const lines = {};
    const match = (p) => {
      if (opsF.step === 'active' && opsGroup(p) === 'done') return false;
      if (!['active', 'all'].includes(opsF.step) && opsGroup(p) !== opsF.step) return false;
      if (opsF.courier === 'none' && p.courier_id) return false;
      if (opsF.courier && opsF.courier !== 'none' && ![p.courier_id, p.pickup_courier_id, p.delivery_courier_id].includes(+opsF.courier)) return false;
      if (opsF.kind === 'tana' && p.province) return false;
      if (opsF.kind === 'prov' && !p.province) return false;
      if (opsF.kind === 'mm' && !p.value_paid) return false;
      if (opsF.q) { const q = opsF.q.toLowerCase(); if (![p.ref, p.sender, p.recipient, p.pickup_addr, p.drop_addr, p.courier].some((x) => String(x || '').toLowerCase().includes(q))) return false; }
      return true;
    };
    const win = (w) => (w ? `${time(w[0])}–${time(w[1])}${new Date(w[0]).toDateString() !== new Date().toDateString() ? ` (${new Date(w[0]).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })})` : ''}` : '');
    const draw = () => {
      if (!data || !liveMap) return;
      const ps = data.parcels.filter(match).sort((a, b) => (b.late ? 1 : 0) - (a.late ? 1 : 0)); // en retard : en rouge, en haut
      // compteurs par étape (avec les autres filtres)
      const save = opsF.step;
      for (const [k] of OPS_STEPS) { opsF.step = k; const n = data.parcels.filter(match).length; const el = $(`[data-cnt="${k}"]`); if (el) el.textContent = n || ''; }
      opsF.step = save;
      $('[data-ops-info]').textContent = `${ps.length} colis · mis à jour ${time(data.server_time)}`;
      const keep = new Set(), pos = {};
      for (const c of data.couriers) {
        if (opsF.courier && opsF.courier !== String(c.id)) continue;
        if (c.lat == null) continue;
        const stale = data.server_time - (c.last_seen || 0) > 2 * 60e3;
        if (!c.online && stale && !ps.some((p) => p.courier_id === c.id)) continue;
        pos[c.id] = [c.lat, c.lng]; keep.add('c' + c.id);
        upsertMarker(liveMap, liveMk, 'c' + c.id, [c.lat, c.lng], icons.bike(stale ? 'stale' : ps.some((p) => p.courier_id === c.id && opsGroup(p) !== 'done') ? 'busy' : '', c.name.split(' ')[0], c.vehicle), { refreshIcon: true, zIndexOffset: 1000 })
          ?.bindTooltip(`<b>${esc(c.name)}</b> · ${vehIcon(c.vehicle)} · 📞 ${esc(phoneFmt(c.phone))}<br>${c.run ? `🚀 en tournée → ${esc(c.run.to)}` : c.online ? 'Disponible' : 'Hors ligne'}${stale ? ' · ⚠ GPS ancien' : ''}`)
          .off('click').on('click', () => { opsF.courier = String(c.id); sessionStorage.setItem('ops_c', opsF.courier); $('[data-oc]').value = opsF.courier; draw(); });
      }
      const keepL = new Set();
      for (const p of ps) {
        const g = opsGroup(p);
        if (g === 'done') continue;
        const toPickup = ['review', 'todo', 'pickup'].includes(g);
        const t = toPickup ? p.pickup : g === 'centre' ? null : p.drop;
        if (!t) continue;
        keep.add('p' + p.id);
        upsertMarker(liveMap, liveMk, 'p' + p.id, t, icons.dot(g === 'review' ? '#c2410c' : toPickup ? '#0b6e4f' : '#e8890c', p.ref), { refreshIcon: true })
          ?.bindTooltip(`<b>${esc(p.ref)}</b> · ${esc(p.step_label)}<br>${toPickup ? '🟢 Récupération' : '🟠 Livraison'} : ${esc(toPickup ? p.pickup_addr : p.drop_addr)}<br>${toPickup && p.windows ? `🕘 ${win(p.windows.pickup)}` : p.windows ? `🏁 ${win(p.windows.delivery)}` : ''}${p.courier ? ` · ${esc(p.courier)}` : ' · sans livreur'}`)
          .off('click').on('click', () => parcelDetail(p.id));
        if (p.courier_id && pos[p.courier_id]) {
          keepL.add(p.id);
          const ll = [pos[p.courier_id], t];
          if (!lines[p.id]) lines[p.id] = L.polyline(ll, { color: toPickup ? '#0b6e4f' : '#e8890c', weight: 2, dashArray: '4 6', opacity: .8, interactive: false }).addTo(liveMap);
          else lines[p.id].setLatLngs(ll);
        }
      }
      for (const id of Object.keys(lines)) if (!keepL.has(+id)) { lines[id].remove(); delete lines[id]; }
      pruneMarkers(liveMk, keep);
      if (!fitted) { const pts = [...Object.values(pos), ...ps.map((p) => p.pickup).filter(Boolean)]; if (pts.length) try { liveMap.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); fitted = true; } catch {} }
      // liste
      $('[data-ops-list]').innerHTML = ps.length ? ps.map((p) => {
        const g = opsGroup(p);
        return `<div class="card" data-act="parcel" data-id="${p.id}" data-ref="${esc(p.ref)}" style="cursor:pointer;margin-bottom:6px;${p.late ? 'border:2px solid var(--red);background:#fdf1f1' : ''}">
          ${p.late ? `<div class="tiny" style="color:var(--red);font-weight:700">⏰ En retard : ${esc(p.late)}</div>` : ''}
          <div class="row between small"><span class="muted">${p.category ? `<b>${esc(p.category)}</b> · ` : ''}${g !== 'done' && p.since ? `depuis ${agoTxt(p.since)}` : dt(p.created_at)}</span><span class="pill ${g === 'done' ? '' : g === 'review' ? 'warn' : 'live'}">${esc(p.step_label)}</span></div>
          <div class="tiny" style="line-height:1.45">🟢 <b>${esc(p.sender)}</b>${p.sender_phone ? ` · <a href="tel:${esc(p.sender_phone)}">📞 ${esc(phoneFmt(p.sender_phone))}</a>` : ''}<br><span class="muted">${esc(p.pickup_addr)}</span><br>
            🟠 <b>${esc(p.recipient)}</b>${p.recipient_phone ? ` · <a href="tel:${esc(p.recipient_phone)}">📞 ${esc(phoneFmt(p.recipient_phone))}</a>` : ''}<br><span class="muted">${esc(p.drop_addr)}</span>${p.province ? ` · 🚌 ${esc(p.province)}` : ''}</div>
          <div class="tiny muted">${p.courier ? `🚲 <b>${esc(p.courier)}</b>${p.courier_phone ? ` · <a href="tel:${esc(p.courier_phone)}">📞 ${esc(phoneFmt(p.courier_phone))}</a>` : ''}` : '<span style="color:var(--orange)">sans livreur</span>'}${['todo', 'pickup', 'review'].includes(g) && p.windows ? ` · 🕘 ${win(p.windows.pickup)}` : g !== 'done' && p.windows ? ` · 🏁 ${win(p.windows.delivery)}` : ''} · ${ar(p.value || 0)}${p.value_paid ? ' 📱' : ''} · frais ${ar(p.fee)}${p.review ? ` · ⚠️ ${esc(p.review)}` : ''}</div></div>`;
      }).join('') : '<p class="muted small">Aucun colis pour ces filtres.</p>';
      // tableau par livreur
      $('[data-ops-period]').textContent = { 1: 'aujourd\'hui', 7: '7 derniers jours', 30: '30 derniers jours' }[data.days] || `${data.days} jours`;
      $('[data-ops-table]').innerHTML = data.couriers.filter((c) => !opsF.courier || opsF.courier === String(c.id)).map((c) => {
        const st = c.stats || {};
        return `<tr><td>${vehIcon(c.vehicle)} <b>${esc(c.name)}</b> ${c.online ? '🟢' : '⚪'}${c.run ? `<div class="tiny muted">🚀 → ${esc(c.run.to)}</div>` : ''}</td>
          <td>${st.picked || 0}</td><td>${st.delivered || 0}</td><td>${ar(st.picked_value || 0)}</td><td>${ar(st.delivered_value || 0)}</td><td>${ar(st.fees || 0)}</td>
          <td>${ar(st.centre_share || 0)}</td><td>${ar(st.courier_share || 0)}</td><td>${st.unpaid ? `<b style="color:var(--orange)">${st.unpaid}</b>` : '✅ 0'}</td>
          <td><b style="color:${c.due > 0 ? 'var(--orange)' : c.due < 0 ? 'var(--green)' : 'inherit'}">${ar(c.due)}</b>${c.due > 0 && c.due_since ? `<div class="tiny" style="color:${c.blocked ? 'var(--red)' : 'var(--muted)'}">depuis ${agoTxt(c.due_since)}${c.blocked ? ' · bloqué' : ''}</div>` : ''}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-act="opsc" data-id="${c.id}">🔎</button> <a class="btn sm" href="tel:${esc(c.phone)}">📞</a></td></tr>`;
      }).join('') || '<tr><td colspan="11" class="muted">Aucun livreur.</td></tr>';
    };
    const load = async () => {
      data = await api('GET', `/api/admin/ops?days=${opsF.days}`);
      const sel = $('[data-oc]');
      if (sel && sel.options.length <= 2) { sel.insertAdjacentHTML('beforeend', data.couriers.map((c) => `<option value="${c.id}">${vehIcon(c.vehicle)} ${esc(c.name)}</option>`).join('')); sel.value = opsF.courier; }
      draw();
    };
    $('[data-ostep]').onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; opsF.step = b.dataset.k; sessionStorage.setItem('ops_step', opsF.step); $$('[data-ostep] [data-k]').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    $('[data-oc]').onchange = (e) => { opsF.courier = e.target.value; sessionStorage.setItem('ops_c', opsF.courier); fitted = false; draw(); };
    $('[data-ok2]').onchange = (e) => { opsF.kind = e.target.value; draw(); };
    $('[data-od]').onchange = (e) => { opsF.days = e.target.value; sessionStorage.setItem('ops_days', opsF.days); load(); };
    $('[data-oq]').oninput = (e) => { opsF.q = e.target.value.trim(); draw(); };
    liveTimer = every(10000, load);
  },

  async dash() {
    const [s, rep, comp, ops] = await Promise.all([refreshCounts(), api('GET', `/api/admin/reports?period=day&from=${Date.now() - 14 * 864e5}`).catch(() => ({ series: [], topCouriers: [] })), api('GET', '/api/admin/complaints').catch(() => ({ complaints: [] })), api('GET', '/api/admin/ops?days=1').catch(() => null)]);
    const og = (k) => (ops?.parcels || []).filter((p) => opsGroup(p) === k).length;
    const hr = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Indian/Antananarivo' }));
    main.innerHTML = head('Tableau de bord') + `
      <div class="ad-hello"><div><h2>${hr < 18 ? 'Bonjour' : 'Bonsoir'} ${esc(state.user.name.split(' ')[0])}</h2><p>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · voici l'activité du centre.</p></div>
        <div class="ad-quick"><button class="ad-q sun" data-act="newparcel">${aic('plus')}<span>Nouveau colis</span></button><a class="ad-q" href="#ops">${aic('route')}<span>Suivi</span></a><a class="ad-q" href="#live">${aic('map')}<span>Carte</span></a><a class="ad-q" href="#cash">${aic('cash')}<span>Caisse</span></a></div></div>
      ${(s.parcels.pending || s.complaints.sos || s.users.pending) ? `<div class="ad-alerts">${s.parcels.pending ? `<a href="#ops" class="ad-al">📥 <b>${s.parcels.pending}</b> colis à programmer ${aic('arrow')}</a>` : ''}${s.complaints.sos ? `<a href="#complaints" class="ad-al bad">🚨 <b>${s.complaints.sos}</b> SOS ${aic('arrow')}</a>` : ''}${s.users.pending ? `<a href="#couriers" class="ad-al">🚲 <b>${s.users.pending}</b> livreur(s) à valider ${aic('arrow')}</a>` : ''}</div>` : ''}
      <h3>📦 Colis du centre</h3><div class="kpis">
        ${kpi('Colis livrés aujourd\'hui', s.parcels.delivered_today || 0)}${kpi('Frais encaissés aujourd\'hui', ar(s.parcels.fees_today))}
        ${kpi('En cours', s.parcels.open || 0)}${kpi('À programmer', s.parcels.pending || 0, s.parcels.pending ? 'alert' : '')}
        ${kpi('Argent chez les livreurs', ar(s.parcels.cash_with_couriers))}${kpi('À rendre aux expéditeurs', s.parcels.to_return || 0)}</div>
      ${ops ? `<div class="panel" style="margin:10px 0"><div class="row between"><h3>🚦 Livraisons du jour par livreur</h3><a class="btn sm primary" href="#ops">Ouvrir le suivi (carte + filtres) →</a></div>
        <div class="row wrap small" style="gap:14px;margin:4px 0 8px">⚠️ À valider <b>${og('review')}</b> · 📥 À répartir <b>${og('todo')}</b> · 🟢 À récupérer <b>${og('pickup')}</b> · 🏢 Au centre <b>${og('centre')}</b> · 🟠 En livraison <b>${og('delivery')}</b></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Livreur</th><th>Récupérés</th><th>Livrés</th><th>Valeur livrée</th><th>Frais</th><th>Part centre</th><th>Part livreur</th><th>Réglé ?</th></tr></thead><tbody>
        ${ops.couriers.filter((c) => c.stats?.picked || c.stats?.delivered || c.stats?.unpaid || c.online).map((c) => `<tr><td>${vehIcon(c.vehicle)} <b>${esc(c.name)}</b> ${c.online ? '🟢' : '⚪'}</td><td>${c.stats.picked || 0}</td><td>${c.stats.delivered || 0}</td>
          <td>${ar(c.stats.delivered_value || 0)}</td><td>${ar(c.stats.fees || 0)}</td><td>${ar(c.stats.centre_share || 0)}</td><td>${ar(c.stats.courier_share || 0)}</td>
          <td>${c.stats.unpaid ? `<span style="color:var(--orange)">❌ ${c.stats.unpaid} non réglé(s)</span>` : '✅ Payé'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Aucune activité aujourd\'hui.</td></tr>'}</tbody></table></div></div>` : ''}
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
    const win = sessionStorage.getItem('adm_trail') || '180';
    main.innerHTML = head('Carte en direct', `<span class="small muted" data-live-info></span>`) + `
      <div class="live-tools no-print" style="margin-bottom:10px">
        <label class="row small"><input type="checkbox" data-tr ${sessionStorage.getItem('adm_trails') !== '0' ? 'checked' : ''}> Chemins parcourus</label>
        <select class="input" data-win style="width:auto;padding:.35rem .6rem">${[['30', '30 min'], ['60', '1 h'], ['180', '3 h'], ['720', '12 h']].map(([v, l]) => `<option value="${v}" ${win === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="row small"><input type="checkbox" data-pc ${sessionStorage.getItem('adm_parcels') !== '0' ? 'checked' : ''}> Colis</label>
        <label class="row small"><input type="checkbox" data-fl checked> Suivre automatiquement</label>
        <span class="small muted">🟢 disponible · 🟠 en course · ⚪ GPS perdu · 🟩 récupération · 🟧 livraison</span></div>
      <div class="live-wrap"><div class="livemap" id="livemap"></div><div class="live-list panel" data-live-list></div></div>`;
    liveMap = makeMap($('#livemap'), { zoom: 13, zoomControl: true, layers: true });
    const trails = {}, links = {}, tripLayers = {};
    const COLORS = ['#0b6e4f', '#2563eb', '#c2410c', '#7c3aed', '#be123c', '#0891b2', '#a16207', '#4d7c0f'];
    const colorOf = (id) => COLORS[id % COLORS.length];
    let fitted = false;
    $('[data-win]').onchange = (e) => { sessionStorage.setItem('adm_trail', e.target.value); show(); };
    $('[data-tr]').onchange = (e) => sessionStorage.setItem('adm_trails', e.target.checked ? '1' : '0');
    $('[data-pc]').onchange = (e) => sessionStorage.setItem('adm_parcels', e.target.checked ? '1' : '0');
    liveTimer = every(5000, async () => {
      const r = await api('GET', `/api/admin/live?trail_minutes=${win}`);
      if (!liveMap) return;
      if (!axeLayers.length && r.axes.length) axeLayers = r.axes.map((a) => L.circle([a.center_lat, a.center_lng], { radius: a.radius_km * 1000, color: a.color, weight: 1.5, fillOpacity: .04, interactive: false }).addTo(liveMap));
      const showTrails = $('[data-tr]')?.checked, showParcels = $('[data-pc]')?.checked;
      const keep = new Set(), pos = {};
      for (const c of r.couriers) {
        const stale = r.server_time - c.last_seen > 2 * 60e3;
        const busy = c.delivery_id || r.parcels.some((p) => p.courier_id === c.id && ['departed', 'at_pickup', 'picked_up', 'en_route', 'nearby', 'returning'].includes(p.step));
        if (!c.available && !busy && stale) continue;
        pos[c.id] = [c.lat, c.lng];
        keep.add('c' + c.id);
        upsertMarker(liveMap, liveMk, 'c' + c.id, [c.lat, c.lng], icons.bike(stale ? 'stale' : busy ? 'busy' : '', c.name.split(' ')[0], c.vehicle, colorOf(c.id)), { refreshIcon: true, zIndexOffset: 1000 })
          ?.bindTooltip(`<b>${esc(c.name)}</b> · ${esc(phoneFmt(c.phone))}<br>${c.delivery_id ? `Course #${c.delivery_id}` : busy ? 'Colis en cours' : 'Disponible'}${c.axe ? ` · 🧭 ${esc(c.axe)}` : ''}<br>${stale ? '⚠ GPS perdu — ' : ''}Vu à ${time(c.last_seen)}`)
          .off('click').on('click', () => courierTrack(c));
        // chemin parcouru (mis à jour en continu)
        const tr = (r.trails[c.id] || []).map((p) => [p[0], p[1]]);
        if (showTrails && tr.length > 1) {
          if (!trails[c.id]) trails[c.id] = L.polyline(tr, { color: colorOf(c.id), weight: 4, opacity: .75 }).addTo(liveMap);
          else trails[c.id].setLatLngs(tr);
        } else if (trails[c.id]) { trails[c.id].remove(); delete trails[c.id]; }
      }
      for (const id of Object.keys(trails)) if (!pos[id]) { trails[id].remove(); delete trails[id]; }
      // trajets déclarés (12 prochaines heures) : itinéraire en pointillés de la couleur du livreur
      const tk = new Set();
      for (const t of r.trips || []) {
        tk.add(String(t.id));
        const tip = `<b>${esc(t.courier)}</b> · ${time(t.depart_at)}<br>${esc(t.from.address)} → ${esc(t.to.address)}<br>${t.load}/${t.capacity} colis`;
        if (!tripLayers[t.id]) tripLayers[t.id] = L.polyline(t.route, { color: colorOf(t.courier_id), weight: 3, dashArray: '2 8', opacity: .9 }).bindTooltip(tip, { sticky: true }).addTo(liveMap);
      }
      for (const id of Object.keys(tripLayers)) if (!tk.has(id)) { tripLayers[id].remove(); delete tripLayers[id]; }
      // colis : point de récupération / livraison + liaison avec le livreur
      const keepLinks = new Set();
      if (showParcels) for (const p of r.parcels) {
        const toPickup = ['pending', 'scheduled', 'departed', 'at_pickup'].includes(p.step);
        const target = toPickup ? p.pickup : p.drop;
        if (!target) continue;
        keep.add('p' + p.id);
        upsertMarker(liveMap, liveMk, 'p' + p.id, target, icons.dot(p.courier_id ? colorOf(p.courier_id) : toPickup ? '#0b6e4f' : '#e8890c', `${toPickup ? '↑' : '↓'} ${(toPickup ? p.sender : p.recipient || '').split(' ')[0]}`), { refreshIcon: true })
          ?.bindTooltip(`<b>${esc(p.ref)}</b> · ${esc(p.step_label)}<br>${toPickup ? '🟢 Récupération' : '🟠 Livraison'} : ${esc(toPickup ? p.pickup_addr : p.drop_addr)}<br>${esc(p.sender)} → ${esc(p.recipient)} · ${ar(p.amount)}${p.courier ? `<br>🚲 ${esc(p.courier)}` : ''}`)
          .off('click').on('click', () => parcelDetail(p.id));
        if (p.courier_id && pos[p.courier_id] && p.step !== 'scheduled') {
          keepLinks.add(p.id);
          const ll = [pos[p.courier_id], target];
          if (!links[p.id]) links[p.id] = L.polyline(ll, { color: toPickup ? '#0b6e4f' : '#e8890c', weight: 2, dashArray: '6 6', opacity: .8, interactive: false }).addTo(liveMap);
          else links[p.id].setLatLngs(ll);
        }
      }
      for (const id of Object.keys(links)) if (!keepLinks.has(Number(id))) { links[id].remove(); delete links[id]; }
      for (const d of r.deliveries.filter((x) => x.status === 'open')) {
        keep.add('d' + d.id);
        upsertMarker(liveMap, liveMk, 'd' + d.id, [d.pickup_lat, d.pickup_lng], icons.req(`#${d.id} · ${(d.proposed_price / 1000).toFixed(1)}k`), { refreshIcon: true })?.off('click').on('click', () => deliveryDetail(d.id));
      }
      for (const s of r.sos) if (s.lat != null) { keep.add('s' + s.id); upsertMarker(liveMap, liveMk, 's' + s.id, [s.lat, s.lng], icons.sos())?.bindTooltip(esc(s.body)); }
      pruneMarkers(liveMk, keep);
      const all = Object.values(pos);
      if (all.length && ($('[data-fl]')?.checked && !fitted)) { liveMap.fitBounds(L.latLngBounds(all).pad(.4), { maxZoom: 15 }); fitted = true; }
      const out = r.couriers.filter((c) => pos[c.id]);
      $('[data-live-info]').textContent = `🚲 ${out.length} livreurs en service · 📦 ${r.parcels.length} colis en cours · actualisé ${time(r.server_time)}`;
      const icon = (k) => (k === 'shipment' ? '📦' : /sos/.test(k) ? '🚨' : /delivery|offer/.test(k) ? '🛵' : /courier/.test(k) ? '🚲' : /cash|vendor/.test(k) ? '💵' : '👤');
      $('[data-live-list]').innerHTML = `${r.sos.length ? `<h3 style="color:var(--red)">🚨 SOS (${r.sos.length})</h3>${r.sos.map((s) => `<div class="small card" style="border-color:var(--red);margin-bottom:6px">${esc(s.body)}<div class="muted">${dt(s.at)}</div></div>`).join('')}` : ''}
        <h3>🚲 Livreurs en service (${out.length})</h3>
        ${out.map((c) => { const mine = r.parcels.filter((p) => p.courier_id === c.id); return `<div class="small" data-act="ctrack" data-id="${c.id}" style="cursor:pointer;padding:6px 0 6px 8px;border-bottom:1px solid var(--line);border-left:4px solid ${colorOf(c.id)}">
          <div class="row between"><b>${esc(c.name)}</b><span class="muted">${time(c.last_seen)} · ${mine.length} colis</span></div>
          ${c.delivery_id ? `<div class="muted">course express #${c.delivery_id}</div>` : ''}
          ${mine.map((p) => { const up = ['pending', 'scheduled', 'departed', 'at_pickup'].includes(p.step); return `<div class="tiny" style="margin-top:2px"><span style="color:${up ? '#0b6e4f' : '#e8890c'}">●</span> ${esc(p.step_label)} — ${esc((up ? p.pickup_addr : p.drop_addr || '').split(',')[0])} <span class="muted">(${esc(up ? p.sender : p.recipient)})</span></div>`; }).join('') || `<div class="muted tiny">${c.axe ? `axe ${esc(c.axe)}` : 'disponible'}</div>`}</div>`; }).join('') || '<p class="muted small">Aucun livreur en service.</p>'}
        ${(r.trips || []).length ? `<h3 style="margin-top:12px">🛣 Trajets prévus (${r.trips.length})</h3>${r.trips.map((t) => `<div class="small" style="padding:4px 0;border-bottom:1px solid var(--line)"><b><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorOf(t.courier_id)}"></span> ${esc(t.courier)}</b> · ${time(t.depart_at)} <span class="muted">${esc(t.from.address.split(',')[0])} → ${esc(t.to.address.split(',')[0])} · ${t.load}/${t.capacity}</span></div>`).join('')}` : ''}
        <h3 style="margin-top:12px">⚡ Mouvements</h3>
        <div class="feed">${r.feed.slice(0, 40).map((f) => `<div><time>${time(f.at)}</time><span>${icon(f.kind)} <b>${esc(f.who)}</b>${f.role ? ` <span class="muted tiny">${{ client: 'client', courier: 'livreur', admin: 'centre' }[f.role] || ''}</span>` : ''} — ${esc(f.text)}</span></div>`).join('') || '<p class="muted small">—</p>'}</div>`;
      $('[data-live-list]')._couriers = r.couriers;
    });
  },

  async deliveries() {
    const p = new URLSearchParams(sessionStorage.getItem('adm_dfilter') ?? 'status=active');
    main.innerHTML = head('Livraisons', `<a class="btn sm" href="/api/admin/export?type=deliveries" data-act="export" data-type="deliveries">⬇ Excel (CSV)</a>`) + `
      <div class="filters"><select class="input" data-f="status">${[['active', 'En cours'], ['', 'Toutes'], ['open', 'En attente'], ['assigned', 'Attribuées'], ['picked_up', 'Récupérées'], ['delivered', 'Livrées'], ['cancelled', 'Annulées'], ['expired', 'Expirées'], ['flagged', '⚠ Signalées']].map(([v, l]) => `<option value="${v}" ${p.get('status') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="input" data-f="payment"><option value="">Tous paiements</option><option value="pending" ${p.get('payment') === 'pending' ? 'selected' : ''}>Mobile Money à confirmer</option></select>
      <input class="input" data-f="q" placeholder="Rechercher (n°, nom, adresse)" value="${esc(p.get('q') || '')}"><button class="hidden" data-act="dfilter">Filtrer</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Livreur</th><th>Trajet</th><th class="num">km</th><th class="num">Prix</th><th>Paiement</th><th>Statut</th></tr></thead><tbody data-rows><tr><td colspan="9">…</td></tr></tbody></table></div>`;
    const r = await api('GET', '/api/admin/deliveries?' + p.toString());
    $('[data-rows]').innerHTML = r.deliveries.map((d) => `<tr class="click" data-act="delivery" data-id="${d.id}"><td>#${d.id}${d.flagged ? ' ⚠' : ''}</td><td class="small">${dt(d.created_at)}</td><td>${esc(d.client_name)}</td><td>${esc(d.courier_name || '—')}</td>
      <td class="small" style="max-width:260px"><div class="ellipsis">${esc(d.pickup_addr || '')} → ${esc(d.drop_addr || '')}</div></td><td class="num">${d.distance_km}</td><td class="num">${ar(d.final_price ?? d.proposed_price)}</td>
      <td class="small">${t(d.payment_method)}${d.payment_method !== 'cash' ? ` <span class="status-pill st-${d.payment_status === 'paid' ? 'delivered' : 'pending'}">${d.payment_status}</span>` : ''}</td><td>${statusPill(d.status)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucune livraison</td></tr>';
  },

  async couriers() {
    await usersView('courier');
    // Colis récupérés / livrés par livreur sur la période choisie.
    const box = document.createElement('div'); box.className = 'panel'; box.style.marginBottom = '16px';
    const days = Number(sessionStorage.getItem('alefa_stat_days') || 1);
    const r = await api('GET', `/api/admin/courier-stats?days=${days}`);
    box.innerHTML = `<div class="row between wrap"><h3>📦 Colis par livreur</h3><div class="row" style="gap:6px"><a class="btn sm ghost" href="#creport">Rapport détaillé et argent →</a>${[[1, "Aujourd'hui"], [7, '7 jours'], [30, '30 jours']].map(([d, l]) => `<button class="btn sm ${d === days ? 'primary' : ''}" data-days="${d}">${l}</button>`).join('')}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Livreur</th><th>Récupérés</th><th>Déposés au centre</th><th>Repris au centre</th><th>Livrés</th><th>Refusés</th><th>En cours</th><th>Encaissé</th></tr></thead><tbody>
      ${r.couriers.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${c.picked}</td><td>${c.to_centre}</td><td>${c.from_centre}</td><td><b>${c.delivered}</b></td><td>${c.refused}</td><td>${c.open}</td><td>${ar(c.collected)}</td></tr>`).join('')}
      <tr style="font-weight:800"><td>Total</td>${['picked', 'to_centre', 'from_centre', 'delivered', 'refused', 'open'].map((k) => `<td>${r.couriers.reduce((a, c) => a + c[k], 0)}</td>`).join('')}<td>${ar(r.couriers.reduce((a, c) => a + c.collected, 0))}</td></tr></tbody></table></div>`;
    box.querySelectorAll('[data-days]').forEach((b) => b.onclick = () => { sessionStorage.setItem('alefa_stat_days', b.dataset.days); show(); });
    const main = document.querySelector('main'); const h = main.querySelector('.head, h2')?.closest('div') || main.firstElementChild;
    h ? h.after(box) : main.prepend(box);
  },
  async clients() { return usersView('client'); },

  // Équipe : chaque personne a son compte (connexion, journal des actions) et un rôle qui limite les rubriques.
  async staff() {
    const r = await api('GET', '/api/admin/staff');
    const lbl = (k) => r.roles[k]?.label || k;
    const NAMES = { creport: 'Rapport livreurs', ops: 'Suivi', live: 'Carte', parcels: 'Colis', deliveries: 'Courses express', couriers: 'Livreurs', axes: 'Axes', clients: 'Clients', support: 'Service client', complaints: 'Réclamations', reports: 'Rapports', cash: 'Caisse', payments: 'Paiements' };
    main.innerHTML = head('Équipe et rôles', '<button class="btn sm primary" data-act="newstaff">＋ Ajouter une personne</button>') + `
      <p class="small muted" style="max-width:760px">Chaque personne de l'équipe se connecte avec son propre numéro et son mot de passe. Toutes ses actions sont enregistrées à son nom dans le Journal. Son rôle décide des rubriques qu'elle voit.</p>
      <div class="grid2"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Personne</th><th>Rôle</th><th>Dernière action</th><th></th></tr></thead><tbody>
      ${r.staff.map((u) => `<tr><td><b>${esc(u.name)}</b><div class="tiny muted">${esc(phoneFmt(u.phone))}${u.status !== 'active' ? ' · <span style="color:var(--red)">suspendu</span>' : ''}</div></td>
        <td>${u.id === state.user.id ? `<b>${esc(lbl(u.staff))}</b> <span class="tiny muted">(vous)</span>` : `<select class="input" data-staffrole="${u.id}">${Object.entries(r.roles).map(([k, x]) => `<option value="${k}" ${u.staff === k ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`}</td>
        <td class="small">${u.last_action ? dt(u.last_action) : '—'}<div class="tiny muted">${u.actions || 0} action(s)</div></td>
        <td class="num">${u.id === state.user.id ? '' : `<button class="btn sm" data-act="pwreset" data-id="${u.id}" data-name="${esc(u.name)}">Mot de passe</button> <button class="btn sm ${u.status === 'active' ? 'danger' : ''}" data-act="ustatus" data-id="${u.id}" data-s="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspendre' : 'Réactiver'}</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel"><h3>Les rôles</h3>${Object.entries(r.roles).map(([k, x]) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(x.label)}</b><div class="small muted">${x.perms ? x.perms.map((p) => NAMES[p] || p).join(' · ') : 'Toutes les rubriques, y compris Paramètres, Équipe, Logiciels de vente et Journal.'}</div></div>`).join('')}</div></div>`;
    main.querySelectorAll('[data-staffrole]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api('PATCH', `/api/admin/staff/${sel.dataset.staffrole}`, { staff: sel.value }); toast('Rôle modifié', 'ok'); } catch (e) { toastErr(e); show(); }
    }));
  },

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
          <div class="row">${f('centre_name', 'Nom du centre', '', 'text')}${f('centre_addr', 'Adresse du centre', 'Point de relais : quartier, rue (ex : Ampandrana, Lot II M 45)', 'text')}</div>
          <label class="field"><span>Répartition des nouveaux colis</span><select class="input" data-s="dispatch_mode"><option value="admin" ${s.dispatch_mode !== 'auto' ? 'selected' : ''}>Par l'admin (+ proposés aux livreurs en tournée sur le chemin, le premier qui confirme)</option><option value="auto" ${s.dispatch_mode === 'auto' ? 'selected' : ''}>Automatique (planning et trajets)</option></select></label>
          <div class="row"><label class="field grow"><span>Relais par le centre (2 livreurs)</span><select class="input" data-s="relay_enabled"><option value="1" ${s.relay_enabled !== '0' ? 'selected' : ''}>Oui</option><option value="0" ${s.relay_enabled === '0' ? 'selected' : ''}>Non</option></select></label><label class="field grow"><span>Photo obligatoire à la remise</span><select class="input" data-s="delivery_photo_required"><option value="1" ${s.delivery_photo_required !== '0' ? 'selected' : ''}>Oui</option><option value="0" ${s.delivery_photo_required === '0' ? 'selected' : ''}>Non</option></select></label></div>
          ${f('delivery_max_dist_m', 'Alerte si « remis » loin de l\'adresse (m)', 'Position GPS du livreur au moment de la remise')}</div>
        <div class="panel stack"><h3>🕘 Heures de récupération et de livraison</h3>
          <p class="tiny muted">Récupéré le matin → livré l'après-midi ; récupéré l'après-midi → livré le lendemain matin au plus tard. Le client peut demander un créneau plus tard.</p>
          <div class="row">${f('am_start', 'Matin : début', '', 'text')}${f('am_end', 'Matin : fin', '', 'text')}</div>
          <div class="row">${f('pm_start', 'Après-midi : début', '', 'text')}${f('pm_end', 'Après-midi : fin', '', 'text')}</div></div>
        <div class="panel stack"><h3>Tarifs selon la distance</h3>
          <p class="tiny muted">Distance route ≈ vol d'oiseau × coefficient route, entre la récupération et la livraison. Les suppléments (catégorie, options) s'ajoutent.</p>
          <label class="field"><span>Calcul des frais</span><select class="input" data-s="zones_enabled"><option value="1" ${s.zones_enabled === '1' ? 'selected' : ''}>Par zone de distance</option><option value="0" ${s.zones_enabled !== '1' ? 'selected' : ''}>Par axe (frais de l'axe ou par défaut)</option></select></label>
          <div class="row">${f('zone1_km', 'Zone 1 : jusqu\'à (km)')}${f('zone1_fee', 'Frais (Ar)')}</div>
          <div class="row">${f('zone2_km', 'Zone 2 : jusqu\'à (km)')}${f('zone2_fee', 'Frais (Ar)')}</div>
          <div class="row">${f('zone3_km', 'Zone 3 : jusqu\'à (km)')}${f('zone3_fee', 'Frais (Ar)')}</div>
          ${f('zone4_fee', 'Périphérie, au-delà (Ar)', 'Ou sur devis')}
          <div class="row">${f('multi_discount', 'Plusieurs colis, même adresse (− %)', 'À partir du 2e colis')}${f('xl_min_fee', 'XL : devis minimum (Ar)')}</div>
          <div class="row">${f('big_value', 'Encaissement grosse valeur au-delà de (Ar)')}${f('big_value_pct', 'Supplément (%)')}</div></div>
        <div class="panel stack"><h3>Conditions générales</h3>
          <div class="row">${f('max_attempts', 'Tentatives avant retour (injoignable)')}${f('centre_keep_days', 'Garde au centre avant de contacter l\'expéditeur (jours)')}</div>
          ${f('liability_cap', 'Remboursement maximum en cas de perte ou casse (Ar)', 'Vide = limité à la valeur déclarée')}
          ${f('terms_version', 'Version des conditions (date)', 'Changer la date oblige chaque client à accepter de nouveau les conditions', 'date')}
          <button class="btn sm" data-act="showterms">Voir le texte affiché aux clients</button></div>
        <div class="panel stack"><h3>Conditions de transport</h3>
          <p class="tiny muted">Catégorie retenue : la plus élevée entre celle choisie par le client, le poids et la plus grande dimension. Le livreur peut la corriger à la récupération (l'expéditeur est prévenu du nouveau prix).</p>
          ${['s', 'm', 'l'].map((k) => `<div class="row">${f(`cat_${k}_kg`, `${k.toUpperCase()} : jusqu'à (kg)`)}${f(`cat_${k}_cm`, 'jusqu\'à (cm)')}${f(`cat_${k}_fee`, 'supplément (Ar)')}</div>${f(`cat_${k}_ex`, `Exemples ${k.toUpperCase()}`, '', 'text')}`).join('')}
          <label class="field"><span>Au-delà de L (plus de ${esc(s.cat_l_kg)} kg ou ${esc(s.cat_l_cm)} cm)</span><select class="input" data-s="xl_enabled"><option value="0" ${s.xl_enabled !== '1' ? 'selected' : ''}>Refusé : vélo et moto seulement</option><option value="1" ${s.xl_enabled === '1' ? 'selected' : ''}>Accepté sur devis (XL)</option></select></label>
          ${s.xl_enabled === '1' ? f('cat_xl_ex', 'XL : exemples', 'Sur devis (validation de l\'admin)', 'text') : ''}
          <div class="row">${f('bike_max_kg', 'Poids max vélo (kg)')}${f('moto_max_kg', 'Poids max moto (kg)', 'Au-delà : devis')}</div>
          ${f('max_value', 'Valeur maximale sans validation (Ar)', 'Au-delà, le colis attend la validation de l\'admin')}</div>
        <div class="panel stack"><h3>Options et suppléments</h3>
          <div class="row">${f('opt_fragile', 'Fragile (Ar)')}${f('opt_express', 'Express (Ar)')}${f('opt_wait', 'Attente > 10 min (Ar)')}</div>
          <div class="row">${f('pickup_fee_large', 'Récupération L / XL (Ar)', 'Gratuite pour S et M ; 0 si déposé au centre')}${f('return_fee_percent', 'Retour à l\'expéditeur (% des frais)')}</div>
          <div class="row">${f('direct_km', 'Livraison directe : jusqu\'à (km)', 'Récupération et livraison proches : un seul livreur, sans le centre')}${f('direct_fee', 'Tarif direct (Ar)')}</div></div>
        <div class="panel stack"><h3>Contrôles</h3>
          <div class="row">${f('late_hours', 'Alerte « sans livreur » après (h)')}${f('cash_cap', 'Plafond d\'argent chez un livreur (Ar)', 'Au-delà : plus de nouvelles missions')}${f('cash_cap_hours', 'Argent gardé au plus (h)')}</div>
          <label class="field"><span>Code du colis à chaque étape (dépôt au centre, reprise, livraison)</span><select class="input" data-s="scan_required"><option value="1" ${s.scan_required !== '0' ? 'selected' : ''}>Obligatoire (scan de l'étiquette ou 4 caractères)</option><option value="0" ${s.scan_required === '0' ? 'selected' : ''}>Facultatif</option></select></label></div>
        <div class="panel stack"><h3>SMS automatiques au destinataire</h3>
          <p class="tiny muted">Lien de suivi à la création, puis « récupéré », « en route » et « livré ». Il faut une passerelle SMS (ex. téléphone Android avec une application « SMS Gateway », ou un opérateur) qui accepte : POST JSON { to, message } avec le jeton en « Authorization: Bearer ».</p>
          <label class="field"><span>SMS</span><select class="input" data-s="sms_enabled"><option value="0" ${s.sms_enabled !== '1' ? 'selected' : ''}>Désactivés</option><option value="1" ${s.sms_enabled === '1' ? 'selected' : ''}>Activés</option></select></label>
          ${f('sms_gateway_url', 'Adresse de la passerelle (URL)', '', 'text')}${f('sms_gateway_token', 'Jeton (clé)', '', 'text')}
          <div class="row">${f('sms_sender', 'Nom d\'expéditeur', '', 'text')}${f('public_url', 'Adresse de l\'application (liens)', '', 'text')}</div>
          <div class="row"><button class="btn sm" data-act="smstest">Envoyer un SMS de test</button><button class="btn sm" data-act="smslog">Journal des SMS</button></div></div>
        <div class="panel stack"><h3>Appels dans la plateforme</h3>
          <p class="tiny muted">Les appels passent directement entre les téléphones. Sur certains réseaux mobiles, un serveur relais (TURN) est nécessaire pour que la voix passe : laissez vide pour commencer, à remplir si des appels n'aboutissent pas (ex. Cloudflare Realtime TURN, Metered).</p>
          ${f('turn_url', 'Adresse du relais (turn:…)', '', 'text')}<div class="row">${f('turn_user', 'Identifiant', '', 'text')}${f('turn_pass', 'Mot de passe', '', 'text')}</div></div>
        <div class="panel stack"><h3>💵 Part du centre sur les frais</h3>
          <p class="tiny muted">Le reste revient au livreur qui livre ; la récupération est gratuite.</p>
          <div class="row">${f('share_t1_max', 'Frais jusqu\'à (Ar)')}${f('share_t1', '→ part du centre (Ar)')}</div>
          <div class="row">${f('share_t2_max', 'Frais jusqu\'à (Ar)')}${f('share_t2', '→ part du centre (Ar)')}</div>
          ${f('share_t3', 'Au-delà → part du centre (Ar)')}</div>
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
    const st = sessionStorage.getItem('adm_pst') ?? 'open', qv = sessionStorage.getItem('adm_pq') || '', cv = sessionStorage.getItem('adm_pc') || '', pv = sessionStorage.getItem('adm_pp') || '';
    const [r, cs] = await Promise.all([
      api('GET', `/api/admin/shipments?status=${st}&q=${encodeURIComponent(qv)}&courier_id=${cv}&paid=${pv}`),
      api('GET', '/api/admin/users?role=courier&status=active')]);
    // Sobre : texte foncé, un seul repère de couleur par information (point ou trait), pas de fonds colorés.
    const ok = (b, yes, no) => `<span class="pt ${b ? 'ok' : 'no'}">${b ? yes : no}</span>`;
    const first = (n) => esc((n || '').split(' ')[0]);
    // Argent de chaque colis : valeur (remise au centre, payée à l'expéditeur) et livraison (part du livreur réglée).
    const money = (x) => {
      const done = ['delivered', 'refused'].includes(x.status), out = [];
      if (x.status === 'delivered') {
        if (x.payment?.value_paid) out.push('Valeur payée par Mobile Money');
        else if (x.province) out.push('Province : rien encaissé');
        else out.push(`Valeur : ${ok(x.cash_settled_at, 'au centre', 'chez le livreur')}`);
        if (!x.payment?.value_paid) out.push(`Expéditeur : ${ok(x.vendor_paid_at, 'payé', 'à payer')}`);
      }
      if (x.payment?.pickup_fee != null) out.push(`Frais récup. : ${ok(x.pickup_fee_settled_at, 'au centre', 'chez ' + first(x.pickup_courier?.name))}`);
      if (done && x.shares) out.push(`Livreur ${ar(x.shares.courier)} : ${ok(x.shares.paid, 'payé', 'non payé')}`);
      return out.length ? `<div class="tiny pc-money">${out.join('<br>')}</div>` : '<span class="tiny muted">—</span>';
    };
    const person = (p, w) => `<div class="pc-name">${esc(p.name)}</div>${p.phone ? `<a class="pc-tel" href="tel:${esc(p.phone)}" data-stop>${esc(phoneFmt(p.phone))}</a>` : ''}<div class="pc-addr">${esc(p.address)}</div>${w ? `<div class="pc-win">${w}</div>` : ''}`;
    const win = (w) => `${new Date(w[0]).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${time(w[0])}–${time(w[1])}`;
    const rows = [...r.shipments].sort((a, b) => (b.late ? 1 : 0) - (a.late ? 1 : 0)); // colis en retard en haut
    // totaux (utile avec le filtre livreur)
    const del = rows.filter((x) => x.status === 'delivered');
    const tot = { n: rows.length, value: del.reduce((a, x) => a + (x.value || 0), 0), fees: rows.filter((x) => ['delivered', 'refused'].includes(x.status)).reduce((a, x) => a + x.fee, 0),
      share: rows.reduce((a, x) => a + (x.shares && (!cv || x.delivery_courier?.id === +cv || x.courier?.id === +cv) ? x.shares.courier : 0), 0),
      unpaid: rows.filter((x) => ['delivered', 'refused'].includes(x.status) && x.shares && !x.shares.paid).length, late: rows.filter((x) => x.late).length };
    main.innerHTML = head('Colis (centre)', `<button class="btn sm primary" data-act="newparcel">＋ Colis</button><button class="btn sm" data-act="importparcels">Importer (Excel)</button><a class="btn sm" href="#" data-act="pexport">Exporter (Excel)</a>`) + `
      <div class="filters"><select class="input" data-pf="status">${[['open', 'En cours'], ['pending', 'À programmer'], ['assigned', 'Programmés'], ['picked_up', 'Récupérés'], ['return', 'À rendre'], ['delivered', 'Livrés'], ['refused', 'Refusés'], ['cancelled', 'Annulés'], ['', 'Tous']].map(([v, l]) => `<option value="${v}" ${st === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="input" data-pf="courier"><option value="">Tous les livreurs</option><option value="none" ${cv === 'none' ? 'selected' : ''}>Sans livreur</option>${cs.users.map((u) => `<option value="${u.id}" ${cv === String(u.id) ? 'selected' : ''}>${vehIcon(u.vehicle)} ${esc(u.name)}</option>`).join('')}</select>
        <select class="input" data-pf="paid">${[['', 'Payé ou non'], ['unpaid', 'Non réglés'], ['paid', 'Tout réglé']].map(([v, l]) => `<option value="${v}" ${pv === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" data-pf="q" placeholder="Rechercher : réf., nom, téléphone, adresse" value="${esc(qv)}"><button class="hidden" data-act="pfilter">Filtrer</button></div>
      <div class="pc-sum"><span><b>${tot.n}</b> colis</span>${tot.late ? `<span class="pc-late-n"><b>${tot.late}</b> en retard</span>` : ''}<span>Valeur livrée <b>${ar(tot.value)}</b></span><span>Frais <b>${ar(tot.fees)}</b></span>${cv && cv !== 'none' ? `<span>Part du livreur <b>${ar(tot.share)}</b></span>` : ''}<span>${tot.unpaid ? `<span class="pt no">${tot.unpaid} livraison(s) non payée(s)</span>` : '<span class="pt ok">Livraisons payées</span>'}</span></div>
      <div class="tbl-wrap"><table class="tbl pc-tbl"><thead><tr><th>Colis</th><th>Expéditeur · récupération</th><th>Destinataire · livraison</th><th>Livreurs</th><th class="num">Valeur · frais</th><th>Argent</th><th>Statut</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="click ${x.late ? 'late' : ''}" data-act="parcel" data-id="${x.id}" data-ref="${esc(x.ref)}">
        <td><div class="pc-ref">${esc(x.ref)}</div><div class="pc-meta">${dt(x.created_at)}</div><div class="pc-tags">${x.category ? `<span>${esc(x.category)}</span>` : ''}${x.fragile ? '<span>fragile</span>' : ''}${x.express ? '<span>express</span>' : ''}${x.province ? '<span>province</span>' : ''}${x.external_ref ? `<span title="N° de commande">${esc(x.external_ref)}</span>` : ''}</div></td>
        <td>${person(x.sender, x.windows && ['pending', 'assigned'].includes(x.status) ? `Récup. ${win(x.windows.pickup)}` : '')}</td>
        <td>${person(x.recipient, x.windows && !['delivered', 'refused', 'cancelled'].includes(x.status) ? `Livr. ${win(x.windows.delivery)}` : '')}${x.province ? `<div class="pc-win">${esc(x.province.city)} · ${esc(x.province.coop)}</div>` : ''}</td>
        <td>${x.pickup_courier || x.delivery_courier || x.courier
          ? `<div class="pc-c"><span>Récup.</span> ${esc(x.pickup_courier?.name || x.courier?.name || '—')}</div><div class="pc-c"><span>Livr.</span> ${esc(x.delivery_courier?.name || x.courier?.name || '—')}</div>${x.courier?.phone ? `<a class="pc-tel" href="tel:${esc(x.courier.phone)}" data-stop>${esc(phoneFmt(x.courier.phone))}</a>` : ''}`
          : '<span class="pc-none">Sans livreur</span>'}</td>
        <td class="num"><div class="pc-amt">${ar(x.value ?? x.declared_value)}</div><div class="pc-meta">frais ${ar(x.fee)}${x.payment?.value_paid ? ' · MM' : ''}</div>${x.collected ? `<div class="pc-meta">encaissé ${ar(x.collected)}</div>` : ''}</td>
        <td>${money(x)}</td><td>${shipPill(x)}<div class="pc-meta">${['pending', 'assigned', 'picked_up'].includes(x.status) && x.since ? `depuis ${agoTxt(x.since)}` : ''}</div>${x.late ? `<div class="pc-late">${esc(x.late)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="padding:30px;text-align:center">Aucun colis.</td></tr>'}
      </tbody></table></div>`;
  },

  // Rapport livreurs : par jour et par livreur, colis récupérés / livrés / refusés, argent encaissé, parts et reste à remettre.
  async creport() {
    const qs = new URLSearchParams({ from: crF.from, to: crF.to, ...(crF.courier ? { courier: crF.courier } : {}) });
    const r = await api('GET', `/api/admin/courier-stats/report?${qs}`);
    const T = r.totals, one = r.courier ? r.couriers.find((c) => c.id === r.courier) : null;
    const quick = [['today', "Aujourd'hui"], ['yesterday', 'Hier'], ['7', '7 jours'], ['month', 'Ce mois'], ['30', '30 jours']];
    const period = crF.from === crF.to ? dayLabel(crF.from) : `du ${dayLabel(crF.from)} au ${dayLabel(crF.to)}`;
    const td = (v, money = true) => `<td class="num">${v ? (money ? ar(v) : v) : '<span class="muted">—</span>'}</td>`;
    main.innerHTML = head('Rapport livreurs', `<button class="btn sm" data-act="crcsv">⬇ Excel (CSV)</button>`) + `
      <div class="panel" style="margin-bottom:16px"><div class="row wrap" data-autofilter style="gap:10px;align-items:flex-end">
        <label class="field" style="margin:0"><span>Du</span><input class="input" type="date" data-cr="from" value="${esc(crF.from)}"></label>
        <label class="field" style="margin:0"><span>Au</span><input class="input" type="date" data-cr="to" value="${esc(crF.to)}"></label>
        <label class="field" style="margin:0;min-width:200px"><span>Livreur</span><select class="input" data-cr="courier"><option value="">Tous les livreurs</option>${r.couriers.map((c) => `<option value="${c.id}" ${c.id === r.courier ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <button class="hidden" data-act="crgo">Afficher</button></div>
        <div class="row wrap" style="gap:6px;margin-top:10px">${quick.map(([k, l]) => `<button class="btn sm ${crF.quick === k ? 'primary' : ''}" data-act="crquick" data-q="${k}">${l}</button>`).join('')}</div></div>
      <p class="small muted" style="margin:-4px 0 12px">${esc(one ? one.name : 'Tous les livreurs')} · ${esc(period)}</p>
      <div class="kpis k6">${kpi('Colis récupérés', T.picked)}${kpi('Colis livrés', T.delivered)}${kpi('Refusés', T.refused)}${kpi('Annulés', r.overview.cancelled)}${kpi('Nouveaux colis', r.overview.created)}${kpi('En cours maintenant', r.overview.open)}</div>
      <div class="kpis k6">${kpi('Valeur livrée', ar(T.delivered_value))}${kpi('Frais de livraison', ar(T.fees))}${kpi('Argent encaissé', ar(T.collected + T.pickup_fees))}${kpi('Part du centre', ar(T.centre_share))}${kpi('Part des livreurs', ar(T.courier_share))}${kpi('Reste à remettre', ar(T.remaining), T.remaining > 0 ? 'alert' : '')}</div>
      ${one && T.remaining > 0 ? `<div class="panel row between wrap" style="margin-bottom:16px;border:2px solid var(--red)"><div><b>${esc(one.name)} doit encore remettre ${ar(T.remaining)}</b><div class="small muted">Sur ${ar(T.due)} à remettre pour cette période, ${ar(T.remitted)} ont déjà été encaissés au centre.</div></div><a class="btn primary" href="#cash">Encaisser à la caisse →</a></div>` : ''}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Jour</th><th>Livreur</th><th class="num">Récupérés</th><th class="num">Livrés</th><th class="num">Refusés</th><th class="num">Valeur livrée</th><th class="num">Encaissé</th><th class="num">Part centre</th><th class="num">Part livreur</th><th class="num">À remettre</th><th class="num">Reste</th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td class="small">${esc(dayLabel(x.day))}</td><td><b>${esc(x.name)}</b>${r.open[x.courier_id] && x.day === r.to ? `<div class="tiny muted">${r.open[x.courier_id]} colis en cours</div>` : ''}</td>
        ${td(x.picked, false)}${td(x.delivered, false)}${td(x.refused, false)}${td(x.delivered_value)}${td(x.collected + x.pickup_fees)}${td(x.centre_share)}${td(x.courier_share)}${td(x.due)}
        <td class="num">${x.remaining ? `<b style="color:var(--red)">${ar(x.remaining)}</b>` : x.due ? '<span style="color:var(--green)">✓ réglé</span>' : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="padding:24px;text-align:center">Aucune activité sur cette période.</td></tr>'}
      ${r.rows.length > 1 ? `<tr style="font-weight:800"><td colspan="2">Total</td>${td(T.picked, false)}${td(T.delivered, false)}${td(T.refused, false)}${td(T.delivered_value)}${td(T.collected + T.pickup_fees)}${td(T.centre_share)}${td(T.courier_share)}${td(T.due)}<td class="num">${T.remaining ? `<span style="color:var(--red)">${ar(T.remaining)}</span>` : '—'}</td></tr>` : ''}
      </tbody></table></div>
      <p class="tiny muted" style="margin-top:10px">À remettre = argent encaissé (livraison + frais pris à la récupération) − part du livreur. « Reste à remettre » = ce qui n'a pas encore été encaissé au centre avec le bouton Encaisser de la Caisse ; « ✓ réglé » = tout est remis. Un colis compte le jour où le livreur l'a remis au destinataire.</p>`;
  },

  async cash() {
    const r = await api('GET', '/api/admin/cash');
    main.innerHTML = head('Caisse & vendeurs') + `
      <p class="small muted">1. Quand le livreur rentre au centre, encaissez l'argent qu'il a collecté. 2. Payez ensuite chaque expéditeur : valeur des colis livrés (argent déjà remis) moins les frais de retour des colis annulés après récupération.</p>
      <div class="grid2"><div class="panel"><h3>💵 Argent à récupérer auprès des livreurs</h3>
        ${r.couriers.map((x) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(x.name)}</b><div class="tiny muted">${x.n} colis · ${esc(phoneFmt(x.phone))}${x.since && x.cash > 0 ? ` · <span style="color:${Date.now() - x.since > 48 * 3600e3 ? 'var(--red)' : 'inherit'}">argent gardé depuis ${agoTxt(x.since)}</span>` : ''}${x.cash < 0 ? ' · <span style="color:var(--green)">le centre lui doit sa part</span>' : ''}</div></span><span><b>${ar(x.cash)}</b> <button class="btn sm primary" data-act="settle" data-id="${x.id}" data-amt="${x.cash}" data-name="${esc(x.name)}">Encaisser</button></span></div>`).join('') || '<p class="muted small">Aucun argent en attente.</p>'}
        <h3 style="margin-top:16px">Dernières remises</h3>${r.settlements.slice(0, 15).map((x) => `<div class="row between small"><span>${esc(x.name)} · ${x.shipments} colis${x.note ? ` · <span style="color:var(--red)">${esc(x.note)}</span>` : ''}</span><span>${ar(x.amount)} <span class="muted tiny">${dt(x.at)}</span></span></div>`).join('') || '<p class="muted small">—</p>'}</div>
      <div class="panel"><h3>🏪 À payer aux expéditeurs</h3>
        ${r.vendors.map((v) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span><b>${esc(v.company || v.name)}</b><div class="tiny muted">${esc(phoneFmt(v.phone))} · ventes ${ar(v.sales)}${v.return_fees ? ` · retours −${ar(v.return_fees)}` : ''}${v.waiting_cash ? ` · ${v.waiting_cash} colis encore chez le livreur` : ''}</div>
          <div class="tiny">${v.payout ? `💳 ${esc(r.methods?.[v.payout.method] || v.payout.method)}${v.payout.phone ? ` ${esc(phoneFmt(v.payout.phone))}` : ''}${v.payout.holder ? ` · ${esc(v.payout.holder)}` : ''}` : '<span class="muted">Pas de numéro de paiement enregistré (MVola par défaut au numéro du compte)</span>'}</div></span>
          <span><b style="color:${v.due < 0 ? 'var(--red)' : 'var(--green)'}">${ar(v.due)}</b> ${v.sales || v.return_fees ? `<button class="btn sm primary" data-act="payvendor" data-id="${v.id}" data-amt="${v.due}" data-name="${esc(v.company || v.name)}" data-pay="${esc(JSON.stringify(v.payout || { method: 'mvola', phone: v.phone, holder: v.name }))}">Payer</button>` : ''}</span></div>`).join('') || '<p class="muted small">Rien à payer.</p>'}
        <h3 style="margin-top:16px">Derniers paiements</h3>${r.payouts.slice(0, 15).map((x) => `<div class="row between small"><span>${esc(x.name)} · ${esc(x.note || '')}</span><span>${ar(x.amount)} <span class="muted tiny">${dt(x.at)}</span></span></div>`).join('') || '<p class="muted small">—</p>'}</div></div>`;
  },

  async api() {
    const [r, ts, lg] = await Promise.all([api('GET', '/api/admin/merchants'), api('GET', '/api/admin/tsena'), api('GET', '/api/admin/sync-log')]);
    const base = location.origin;
    const res = ts.last_result || {};
    main.innerHTML = head('Relier un logiciel de vente', '<button class="btn primary" data-act="newmerchant">＋ Clé API</button>') + `
      <div class="panel stack" style="margin-bottom:16px;border:2px solid ${ts.connected ? 'var(--green)' : 'var(--line)'}">
        <div class="row between wrap"><h3>🛒 Tsena Ampandrana — synchronisation automatique</h3>
          ${ts.connected ? '<span class="status-pill st-delivered">● Connecté</span>' : '<span class="status-pill st-suspended">Non connecté</span>'}</div>
        <p class="small">Chaque livraison <b>« En attente »</b> saisie dans Tsena arrive ici toute seule comme colis (en moins d'une minute). En retour, Alefa met à jour Tsena : <b>En cours</b> dès que le livreur part, <b>Livrée</b> à la remise, avec le nom du livreur et le code de réception.</p>
        ${ts.connected ? `<div class="small">Compte : <b>${esc(ts.email)}</b> · Boutique : <b>${esc(ts.shop_name)}</b> ${esc(phoneFmt(ts.shop_phone))} · ${ts.linked} livraison(s) reliée(s)<br>
          Dernière synchro : ${ts.last_sync ? dt(ts.last_sync) : '—'}${res.imported != null ? ` · ${res.imported} importée(s), ${res.updated} mise(s) à jour` : ''}</div>
          ${ts.last_error ? `<div class="small" style="color:var(--red)">⚠ ${esc(ts.last_error)}</div>` : ''}
          <div class="row"><button class="btn sm primary" data-act="tsenasync">⟳ Synchroniser maintenant</button><button class="btn sm" data-act="tsenashop" data-n="${esc(ts.shop_name || '')}" data-p="${esc(ts.shop_phone || '')}" data-a="${esc(ts.pickup_addr || '')}">Modifier la boutique</button><button class="btn sm" data-act="tsenaconnect">Changer de compte</button><button class="btn sm danger" data-act="tsenaoff">Déconnecter</button></div>`
        : '<div class="row"><button class="btn primary" data-act="tsenaconnect">Connecter Tsena</button></div>'}
      </div>
      <details class="panel" style="margin-bottom:16px" ${lg.log.some((x) => !x.ok) ? 'open' : ''}><summary><b>🧾 Journal des échanges</b> <span class="small muted">(${lg.log.length} derniers · ${lg.log.filter((x) => !x.ok).length} erreur(s))</span></summary>
        <div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Heure</th><th>Logiciel</th><th>Sens</th><th>Réf.</th><th>Résultat</th></tr></thead><tbody>
        ${lg.log.slice(0, 60).map((x) => `<tr><td class="small">${dt(x.at)}</td><td class="small">${esc(x.partner)}</td><td>${x.direction === 'in' ? '⬅ reçu' : '➡ envoyé'}</td><td class="small"><code>${esc(x.ref || '—')}</code></td>
          <td class="small" style="color:${x.ok ? 'inherit' : 'var(--red)'}">${x.ok ? '✓' : '⚠'} ${esc(x.message || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun échange pour le moment.</td></tr>'}</tbody></table></div>
        <p class="tiny muted">Les opérations en échec sont relancées automatiquement chaque minute.</p></details>
      <div class="grid2" style="margin-bottom:16px"><div class="panel stack">
        <h3>① Le plus simple : le lien « Alefa » (aucun développement)</h3>
        <p class="small">Dans le logiciel de vente, ajoutez un bouton <b>« Livrer avec Alefa »</b> qui ouvre ce lien en remplaçant les valeurs par celles de la commande. Le vendeur (connecté à Alefa) voit le formulaire déjà rempli et appuie sur <b>Envoyer</b>.</p>
        <pre style="background:#0f1a16;color:#cfe3da;padding:12px;border-radius:12px;white-space:pre-wrap;word-break:break-all;font-size:.8rem">${esc(base)}/envoyer?ref=<b style="color:#ffc83d">N°COMMANDE</b>&nom=<b style="color:#ffc83d">NOM</b>&tel=<b style="color:#ffc83d">TELEPHONE</b>&adresse=<b style="color:#ffc83d">ADRESSE</b>&valeur=<b style="color:#ffc83d">MONTANT</b>&desc=<b style="color:#ffc83d">ARTICLE</b></pre>
        <div class="row wrap">${[['ref', 'CMD-1042'], ['nom', 'Rasoa'], ['tel', '0341234567'], ['adresse', 'Behoririka'], ['valeur', '25000'], ['desc', 'Robe']].map(([k, ph]) => `<input class="input" data-gl="${k}" placeholder="${k}" value="${ph}" style="width:130px">`).join('')}<button class="btn sm primary" data-act="genlink">Générer</button></div>
        <div class="small" style="word-break:break-all"><code data-glout></code></div><a class="btn sm" data-gltest target="_blank" rel="noopener" href="#">Tester le lien ↗</a>
        <p class="tiny muted">Paramètres facultatifs : <code>lat</code>, <code>lng</code> (position du destinataire), <code>depart</code> (adresse de récupération). Une même référence n'est jamais créée deux fois.</p></div>
      <div class="panel stack"><h3>② Import Excel / CSV (aucun développement)</h3>
        <p class="small">Exportez les commandes du jour depuis le logiciel de vente, puis <b>Colis → ⬆ Import Excel</b> (centre) ou <b>Entana → ⬆ Excel</b> (vendeur). Colonnes reconnues : ref, nom, telephone, adresse, valeur, description. Les positions GPS sont recherchées automatiquement.</p>
        <div class="row"><button class="btn sm" data-act="tpl">⬇ Modèle de fichier</button><button class="btn sm primary" data-act="importparcels">⬆ Importer maintenant</button></div>
        <h3 style="margin-top:8px">③ Connexion automatique (API, pour un développeur)</h3>
        <p class="small">Le logiciel envoie lui-même chaque commande et reçoit les statuts (webhook). Créez une clé ci-dessous et transmettez la <a href="https://github.com/oasis4444/livraison/blob/main/docs/API.md" target="_blank" rel="noopener">documentation</a>.</p></div></div>
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
    <input class="input" data-u="q" placeholder="Nom ou téléphone" value="${esc(qv)}"><button class="hidden" data-act="ufilter" data-role="${role}">Filtrer</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Téléphone</th>${isC ? '<th>CIN</th><th>Note</th><th class="num">Solde</th><th>En ligne</th>' : '<th>Type</th><th>Annulations</th>'}<th class="num">Livraisons</th><th>Inscrit</th><th>Statut</th><th></th></tr></thead><tbody>
    ${r.users.map((u) => `<tr><td><b>${esc(u.name)}</b>${isC ? ` <button class="btn sm ghost" data-act="veh" data-id="${u.id}" data-v="${u.vehicle === 'moto' ? 'velo' : 'moto'}" title="Changer de véhicule (vélo / moto)">${vehIcon(u.vehicle)} ${u.vehicle === 'moto' ? 'Moto' : 'Vélo'}</button>` : ''}${u.company ? `<div class="tiny muted">${esc(u.company)}</div>` : ''}${isC && u.doc_note ? `<div class="tiny muted">${esc(u.doc_note)}</div>` : ''}</td><td><a href="tel:${esc(u.phone)}">${esc(phoneFmt(u.phone))}</a></td>
      ${isC ? `<td class="small">${esc(u.cin || '')}${u.address ? `<div class="tiny muted">${esc(u.address)}</div>` : ''}${u.emergency_contact ? `<div class="tiny muted">🆘 ${esc(u.emergency_contact)}</div>` : ''}</td><td>${stars(u.rating_count ? Math.round((u.rating_sum / u.rating_count) * 10) / 10 : null)}</td><td class="num">${ar(u.balance)}</td><td class="small">${u.available && u.last_seen > Date.now() - 600e3 ? '🟢' : '⚪'} ${u.last_seen ? dt(u.last_seen) : ''}</td>`
      : `<td class="small">${u.is_business ? '🏢 Entreprise' : 'Particulier'}</td><td>${u.cancel_count}</td>`}
      <td class="num">${u.delivered}</td><td class="small">${dt(u.created_at)}</td><td>${statusPill(u.status)}</td>
      <td style="white-space:nowrap">${u.status !== 'active' ? `<button class="btn sm primary" data-act="ustatus" data-id="${u.id}" data-s="active">${u.status === 'pending' ? 'Valider' : 'Activer'}</button>` : ''}
        ${u.status === 'pending' ? `<button class="btn sm danger" data-act="ustatus" data-id="${u.id}" data-s="rejected">Refuser</button>` : ''}
        ${u.status === 'active' ? `<button class="btn sm danger" data-act="ustatus" data-id="${u.id}" data-s="suspended">Suspendre</button>` : ''}
        ${isC && u.status === 'active' ? `<button class="btn sm" data-act="planning" data-id="${u.id}" data-name="${esc(u.name)}" data-veh="${u.vehicle || 'velo'}" title="Axes & horaires">🧭 Axes</button><button class="btn sm" data-act="tx" data-id="${u.id}" data-name="${esc(u.name)}" title="Opération">💰</button>` : ''}
        <button class="btn sm ghost" data-act="pwreset" data-id="${u.id}" data-name="${esc(u.name)}" title="Nouveau mot de passe">🔑</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted">Aucun</td></tr>'}
    </tbody></table></div>`;
}

// Versement à un expéditeur : Mobile Money (numéro + référence de la transaction obligatoire) ou espèces au centre.
const PAY_METHODS = { mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', cash: 'Espèces au centre' };
function payVendorForm(el) {
  const amt = Number(el.dataset.amt), acc = (() => { try { return JSON.parse(el.dataset.pay); } catch { return { method: 'mvola' }; } })();
  const m = modal(`Payer ${el.dataset.name}`, `<form class="stack" data-f>
    <div class="card" style="text-align:center;background:var(--green-soft);border:0"><div class="small">Montant à verser</div><div style="font-size:1.8rem;font-weight:900">${ar(amt)}</div></div>
    <label class="field"><span>Moyen</span><select class="input" name="method">${Object.entries(PAY_METHODS).map(([k, l]) => `<option value="${k}" ${acc.method === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field" data-mm><span>Numéro du destinataire</span><input class="input" name="phone" type="tel" value="${esc(acc.phone ? phoneFmt(acc.phone) : '')}"></label>
    <label class="field" data-mm><span>Nom du titulaire</span><input class="input" name="holder" value="${esc(acc.holder || '')}"></label>
    <label class="field" data-mm><span>Référence de la transaction</span><input class="input" name="reference" placeholder="Ex : 1234567890 (reçue par SMS après l'envoi)" ${amt > 0 ? 'required' : ''}></label>
    <p class="tiny muted" data-mm style="margin:0">Faites d'abord le transfert depuis le téléphone du centre, puis recopiez ici la référence reçue par SMS : elle prouve le paiement.</p>
    <p class="tiny muted hidden" data-cashinfo style="margin:0">L'expéditeur vient chercher son argent au centre. Faites-lui signer le reçu.</p>
    <label class="field"><span>Note (facultatif)</span><input class="input" name="note" maxlength="200"></label>
    <button class="btn primary block lg">Enregistrer le paiement de ${ar(amt)}</button></form>`);
  const f = m.el.querySelector('[data-f]'), sel = f.elements.method;
  const sync = () => { const cash = sel.value === 'cash'; f.querySelectorAll('[data-mm]').forEach((x) => x.classList.toggle('hidden', cash)); f.querySelector('[data-cashinfo]').classList.toggle('hidden', !cash); f.elements.reference.required = !cash && amt > 0; };
  sel.onchange = sync; sync();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(f));
    try { const r = await api('POST', `/api/admin/vendors/${el.dataset.id}/pay`, b); m.close(); toast(`${ar(r.amount)} payés (${r.shipments} colis)`, 'ok'); show(); } catch (err) { toastErr(err); }
  };
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
  logout: () => logout(),
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
  showterms: () => import('./terms.js').then((m) => m.loadConditions(true).then(() => m.showConditions())),
  resolve: async (el) => { const r = await promptBox('Traitement', { label: 'Action menée / commentaire' }); if (r === null) return; await api('POST', `/api/admin/complaints/${el.dataset.id}/resolve`, { resolution: r }); refreshCounts(); show(); },
  period: (el) => { sessionStorage.setItem('adm_period', el.dataset.v); show(); },
  print: () => window.print(),
  export: (el) => downloadCsv(el.dataset.type, el.dataset.from),
  crgo: () => {
    const v = (k) => $(`[data-cr=${k}]`).value;
    if (!v('from') || !v('to')) return toast('Choisissez les deux dates', 'err');
    Object.assign(crF, { from: v('from'), to: v('to') < v('from') ? v('from') : v('to'), courier: v('courier'), quick: '' }); crSave(); show();
  },
  crquick: (el) => { const [from, to] = crRange(el.dataset.q); Object.assign(crF, { from, to, quick: el.dataset.q, courier: $('[data-cr=courier]')?.value || crF.courier }); crSave(); show(); },
  crcsv: async () => {
    const qs = new URLSearchParams({ from: crF.from, to: crF.to, format: 'csv', ...(crF.courier ? { courier: crF.courier } : {}) });
    const res = await fetch(`/api/admin/courier-stats/report?${qs}`, { headers: { authorization: `Bearer ${state.token}` } });
    if (!res.ok) return toast('Export impossible', 'err');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `alefa-livreurs-${crF.from}_${crF.to}.csv`; a.click();
  },
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
  pfilter: () => { sessionStorage.setItem('adm_pst', $('[data-pf=status]').value); sessionStorage.setItem('adm_pq', $('[data-pf=q]').value); sessionStorage.setItem('adm_pc', $('[data-pf=courier]').value); sessionStorage.setItem('adm_pp', $('[data-pf=paid]').value); show(); },
  pexport: async () => {
    const res = await fetch('/api/admin/shipments/export', { headers: { authorization: `Bearer ${state.token}` } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = `alefa-colis-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  },
  newparcel: () => sendForm({ adminMode: true, onDone: () => show() }),
  importparcels: () => importForm({ adminMode: true, onDone: () => show() }),
  tpl: (el, e) => templateCsv(),
  genlink: () => {
    const v = (k) => encodeURIComponent($(`[data-gl=${k}]`).value.trim());
    const url = `${location.origin}/envoyer?ref=${v('ref')}&nom=${v('nom')}&tel=${v('tel')}&adresse=${v('adresse')}&valeur=${v('valeur')}&desc=${v('desc')}`;
    $('[data-glout]').textContent = url; $('[data-gltest]').href = url;
  },
  parcel: (el) => parcelDetail(+el.dataset.id),
  smstest: async () => { const to = await promptBox('SMS de test', { label: 'Numéro', type: 'tel', placeholder: '034 12 345 67' }); if (!to) return; const r = await api('POST', '/api/admin/sms-test', { to }); toast(r.ok ? 'SMS envoyé' : `Échec : ${r.error || r.status}`, r.ok ? 'ok' : 'err'); },
  smslog: async () => { const r = await api('GET', '/api/admin/sms-log'); modal('Journal des SMS', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>À</th><th>Message</th><th>État</th></tr></thead><tbody>${r.sms.map((x) => `<tr><td class="small">${dt(x.at)}</td><td class="small">${esc(phoneFmt(x.to_phone))}</td><td class="small">${esc(x.body)}</td><td class="small">${x.status === 'sent' ? '✅ envoyé' : x.status === 'failed' ? `❌ ${esc(x.error || '')}` : '— désactivé'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun SMS</td></tr>'}</tbody></table></div>`, { wide: true }); },
  sthread: (el) => { supportOpen = +el.dataset.id; show(); },
  opsc: (el) => { opsF.courier = el.dataset.id; sessionStorage.setItem('ops_c', opsF.courier); const s2 = $('[data-oc]'); if (s2) s2.value = opsF.courier; show(); },
  settle: async (el) => {
    const v = await promptBox(`Encaisser — ${el.dataset.name}`, { label: 'Montant reçu du livreur (Ar)', type: 'number', value: el.dataset.amt });
    if (v == null || v === '') return;
    const r = await api('POST', `/api/admin/couriers/${el.dataset.id}/settle`, { amount: Number(v) });
    toast(`${ar(r.received)} encaissés (${r.shipments} colis)`, r.received === r.total ? 'ok' : 'err'); show();
  },
  payvendor: (el) => payVendorForm(el),
  newmerchant: () => merchantForm(),
  tsenaconnect: () => tsenaForm(),
  tsenashop: (el) => {
    const m = modal('Boutique Tsena', `<form class="stack" data-f>
      <label class="field"><span>Nom de la boutique (expéditeur)</span><input class="input" name="shop_name" value="${esc(el.dataset.n)}" required></label>
      <label class="field"><span>Téléphone de la boutique (pas celui de l'admin)</span><input class="input" name="shop_phone" value="${esc(phoneFmt(el.dataset.p))}" required></label>
      <label class="field"><span>Adresse de récupération</span><input class="input" name="pickup_addr" value="${esc(el.dataset.a)}" placeholder="Ampandrana, Antananarivo"></label>
      <button class="btn primary">Enregistrer</button></form>`);
    const f = m.el.querySelector('[data-f]');
    f.addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await api('POST', '/api/admin/tsena/shop', Object.fromEntries(new FormData(f))); m.close(); toast(`Boutique enregistrée · ${r.moved} colis mis à jour`, 'ok'); show(); } catch (err) { toastErr(err); } });
  },
  tsenasync: async () => { const r = await api('POST', '/api/admin/tsena/sync'); toast(r.errors?.length ? r.errors[0] : `${r.imported} importée(s), ${r.updated} mise(s) à jour`, r.errors?.length ? 'err' : 'ok'); show(); },
  tsenaoff: async () => { if (!(await confirmBox('Arrêter la synchronisation avec Tsena ?', 'Déconnecter', true))) return; await api('POST', '/api/admin/tsena/disconnect'); show(); },
  mhook: async (el) => { const v = await promptBox('Webhook (https://…)', { value: el.dataset.url, placeholder: 'https://mon-logiciel.mg/webhooks/alefa' }); if (v == null) return; await api('POST', `/api/admin/merchants/${el.dataset.id}`, { webhook_url: v }); show(); },
  mkey: async (el) => {
    if (!(await confirmBox('Générer une nouvelle clé ? L\'ancienne cessera de fonctionner immédiatement.', 'Générer', true))) return;
    const r = await api('POST', `/api/admin/merchants/${el.dataset.id}`, { regenerate: true });
    modal('Nouvelle clé API', `<p>Copiez-la maintenant, elle ne sera plus affichée :</p><pre style="white-space:pre-wrap;word-break:break-all;background:var(--bg);padding:12px;border-radius:10px">${esc(r.api_key)}</pre>`); show();
  },
  mactive: async (el) => { await api('POST', `/api/admin/merchants/${el.dataset.id}`, { active: el.dataset.v === '1' }); show(); },
  planning: (el) => planningForm(+el.dataset.id, el.dataset.name, el.dataset.veh),
  veh: async (el) => { await api('POST', `/api/admin/users/${el.dataset.id}/vehicle`, { vehicle: el.dataset.v }); toast(el.dataset.v === 'moto' ? 'Livreur passé à moto 🏍️' : 'Livreur passé à vélo 🚲', 'ok'); show(); },
  pwreset: async (el) => {
    const pw = await promptBox(`Nouveau mot de passe — ${el.dataset.name}`, { label: 'Mot de passe provisoire (6 caractères min.)', value: Math.random().toString(36).slice(2, 10) });
    if (!pw) return;
    await api('POST', `/api/admin/users/${el.dataset.id}/password`, { password: pw });
    modal('Mot de passe modifié', `<p>Communiquez ce mot de passe à <b>${esc(el.dataset.name)}</b> :</p><p style="font-size:1.6rem;font-weight:800;text-align:center;letter-spacing:.05em">${esc(pw)}</p><p class="small muted">Il pourra le changer dans son profil.</p>`);
  },
  axe: (el) => axeForm(el.dataset.a ? JSON.parse(el.dataset.a) : null),
  axedel: async (el) => { if (!(await confirmBox('Supprimer cet axe ? Il sera retiré du planning des livreurs.', 'Supprimer', true))) return; await api('DELETE', `/api/admin/axes/${el.dataset.id}`); show(); },
  newstaff: async () => {
    const r = await api('GET', '/api/admin/staff');
    const m = modal('Ajouter une personne à l\'équipe', `<div class="stack">
      <label class="field"><span>Nom</span><input class="input" data-n placeholder="Ex : Fara (accueil)"></label>
      <label class="field"><span>Téléphone (sert à se connecter)</span><input class="input" data-p type="tel" placeholder="034 12 345 67"></label>
      <label class="field"><span>Rôle</span><select class="input" data-r>${Object.entries(r.roles).map(([k, x]) => `<option value="${k}" ${k === 'operateur' ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Mot de passe provisoire</span><input class="input" data-pw value="${Math.random().toString(36).slice(2, 10)}"></label>
      <button class="btn primary block" data-ok>Créer le compte</button></div>`);
    m.el.querySelector('[data-ok]').onclick = async () => {
      const v = (q) => m.el.querySelector(q).value;
      try {
        await api('POST', '/api/admin/users', { role: 'admin', staff: v('[data-r]'), name: v('[data-n]'), phone: v('[data-p]'), password: v('[data-pw]') });
        m.close(); modal('Compte créé', `<p>Communiquez à <b>${esc(v('[data-n]'))}</b> son numéro et ce mot de passe :</p><p style="font-size:1.5rem;font-weight:800;text-align:center">${esc(v('[data-pw]'))}</p><p class="small muted">Il pourra le changer dans son profil.</p>`); show();
      } catch (e) { toastErr(e); }
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

// ---------------------------------------------------------------- livreurs, axes, planning
function courierForm() {
  const m = modal('Nouveau livreur', `<div class="stack">
    <div class="row"><label class="field grow"><span>Nom complet</span><input class="input" data-v="name"></label><label class="field grow"><span>Téléphone</span><input class="input" type="tel" data-v="phone" placeholder="034 12 345 67"></label></div>
    <div class="row"><label class="field grow"><span>Numéro CIN</span><input class="input" data-v="cin"></label><label class="field grow"><span>Mot de passe provisoire</span><input class="input" data-v="password" value="${Math.random().toString(36).slice(2, 10)}"></label></div>
    <label class="field"><span>Adresse</span><input class="input" data-v="address"></label>
    <label class="field"><span>Contact d'urgence</span><input class="input" data-v="emergency_contact" placeholder="Nom + téléphone"></label>
    <label class="field"><span>Véhicule</span><select class="input" data-v="vehicle"><option value="velo">🚲 Vélo</option><option value="moto">🏍️ Moto</option></select></label>
    <label class="field"><span>Véhicule / documents vérifiés</span><textarea class="input" data-v="doc_note" rows="2" placeholder="Type, couleur, immatriculation de la moto, permis, documents contrôlés…"></textarea></label>
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
async function planningForm(courierId, name, vehicle = 'velo') {
  const [{ axes, slot_minutes }, cur] = await Promise.all([api('GET', '/api/admin/axes'), api('GET', `/api/admin/couriers/${courierId}/axes`)]);
  if (!axes.length) { toast('Créez d\'abord un axe (menu Axes & planning)', 'err'); location.hash = 'axes'; return; }
    const place = (a, lat, lng) => (lat != null ? { address: a, lat, lng } : null);
  const placeTxt = (x) => (x.from && x.to
    ? `<span class="tiny muted">✓ ${esc(x.from.address)} → ${esc(x.to.address)}${x.km ? ` · ${String(x.km).replace('.', ',')} km` : ''}</span>`
    : `<span class="tiny" style="color:var(--red)">${x.from ? '✓ départ · ' : ''}${x.to ? '✓ arrivée · ' : ''}Indiquez le départ et l'arrivée</span>`);
  let slots = cur.slots.map((x) => ({ axe_id: x.axe_id, start_min: x.start_min, end_min: x.end_min, days: x.days,
    from: place(x.from_addr, x.from_lat, x.from_lng), to: place(x.to_addr, x.to_lat, x.to_lng), route: x.route ? (typeof x.route === 'string' ? JSON.parse(x.route) : x.route) : null, km: x.km }));
  // Même axe = mêmes lieux de départ et d'arrivée par défaut (repris d'un autre créneau de cet axe).
  const sameAxe = (axeId) => slots.find((y) => y.axe_id === axeId && y.from && y.to);
  const fillFromAxe = (x) => { const o = sameAxe(x.axe_id); if (o && !x.from && !x.to) { x.from = { ...o.from }; x.to = { ...o.to }; x.route = o.route; x.km = o.km; } return x; };
  const m = modal(`Axes & horaires — ${name} (${vehIcon(vehicle)} ${vehicle === 'moto' ? 'Moto' : 'Vélo'})`, `<div class="stack">
    <div class="small muted">Pour chaque créneau : l'axe, les heures, les jours, et le <b>lieu de départ</b> et le <b>lieu d'arrivée</b> du livreur. Les colis dont l'adresse est dans l'axe ou à moins de 800 m de ce chemin lui sont confiés. Sans aucun créneau, le livreur travaille sur toute la zone autour de lui.</div>
    <div data-smap style="height:220px;border-radius:12px;overflow:hidden"></div>
    <div class="card" style="background:var(--bg);border:0"><b>⚡ Générer une rotation</b>
      <div class="small muted" style="margin:4px 0 8px">Ex : de 07:00 à 19:00, créneaux de ${slot_minutes} min, en alternant les axes cochés.</div>
      <div class="chips" data-gax>${axes.filter((a) => a.active).map((a) => `<label class="chip"><input type="checkbox" value="${a.id}" style="margin-right:4px">${esc(a.name)}</label>`).join('')}</div>
      <div class="row wrap" style="margin-top:8px"><label class="field"><span>De</span><input class="input" type="time" data-gfrom value="07:00"></label><label class="field"><span>À</span><input class="input" type="time" data-gto value="19:00"></label>
        <label class="field"><span>Créneau (min)</span><input class="input" type="number" min="15" step="15" data-gstep value="${slot_minutes}" style="width:100px"></label>
        <button class="btn sun" data-gen style="align-self:flex-end">Générer</button></div></div>
    <div class="row between"><b>Créneaux</b><span><button class="btn sm" data-add>＋ Créneau</button> <button class="btn sm danger" data-clear>Tout effacer</button></span></div>
    <div data-slots class="list"></div>
    <button class="btn primary block" data-save>Enregistrer le planning</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:8px 0">
    <b>🛣 Trajets de ${esc(name)}</b>
    <div class="small muted">Départ → destination à une heure précise : les colis à récupérer et livrer sur ce chemin lui sont confiés automatiquement.</div>
    <div data-tmap style="height:220px;border-radius:12px;overflow:hidden"></div>
    <div data-trips></div></div>`, { wide: true });
  const tmap = makeMap(m.el.querySelector('[data-tmap]'), { zoom: 12 });
  courierTripsEditor(m.el.querySelector('[data-trips]'), { map: tmap, bikeRoute, vehicle, base: `/api/admin/couriers/${courierId}/trips` }).catch(toastErr);
  const box = m.el.querySelector('[data-slots]');
  const render = () => {
    slots.sort((a, b) => a.start_min - b.start_min);
    box.innerHTML = slots.map((x, i) => `<div class="row wrap" data-i="${i}" style="border-bottom:1px solid var(--line);padding-bottom:8px">
      <select class="input" data-k="axe_id" style="width:auto;min-width:160px">${axes.map((a) => `<option value="${a.id}" ${a.id === x.axe_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <input class="input" type="time" data-k="start" value="${hm(x.start_min)}" style="width:auto"> → <input class="input" type="time" data-k="end" value="${x.end_min >= 1440 ? '23:59' : hm(x.end_min)}" style="width:auto">
      <span class="chips">${DAYS.map((d, j) => `<button class="chip ${String(x.days).includes(String(j + 1)) ? 'on' : ''}" data-day="${j + 1}" style="padding:.25rem .5rem">${d}</button>`).join('')}</span>
      <button class="btn sm danger" data-del>✕</button>
      <div class="row wrap" style="width:100%">
        <label class="field grow"><span>📍 Départ</span><input class="input" data-k="from" value="${esc(x.from?.address || '')}" placeholder="Ex : Analakely"></label>
        <label class="field grow"><span>🏁 Arrivée</span><input class="input" data-k="to" value="${esc(x.to?.address || '')}" placeholder="Ex : Ivandry"></label></div>
      <div data-st style="width:100%">${placeTxt(x)}</div></div>`).join('') || '<p class="muted small">Aucun créneau : le livreur travaille sur toute la zone.</p>';
    drawSlots();
  };
  const smap = makeMap(m.el.querySelector('[data-smap]'), { zoom: 12 });
  let sLayers = [];
  // Mise à jour d'une ligne sans tout redessiner (ne pas effacer ce que l'admin est en train de taper ailleurs).
  const refreshRow = (y) => {
    const row = box.querySelector(`[data-i="${slots.indexOf(y)}"]`); if (!row) return;
    row.querySelector('[data-st]').innerHTML = placeTxt(y);
    for (const k of ['from', 'to']) { const inp = row.querySelector(`[data-k=${k}]`); if (inp && document.activeElement !== inp && y[k]) inp.value = y[k].address; }
  };
  const drawSlots = () => {
    if (!smap || !window.L) return;
    sLayers.forEach((l) => l.remove()); sLayers = [];
    const pts = [];
    for (const x of slots) {
      if (!x.from || !x.to) continue;
      const color = axes.find((a) => a.id === x.axe_id)?.color || '#0f7a55';
      const line = x.route?.length > 1 ? x.route : [[x.from.lat, x.from.lng], [x.to.lat, x.to.lng]];
      sLayers.push(L.polyline(line, { color, weight: 5, opacity: .75 }).addTo(smap).bindTooltip(`${hm(x.start_min)} · ${esc(x.from.address)} → ${esc(x.to.address)}`));
      sLayers.push(L.marker([x.from.lat, x.from.lng], { icon: icons.a() }).addTo(smap), L.marker([x.to.lat, x.to.lng], { icon: icons.b() }).addTo(smap));
      pts.push(...line);
    }
    if (pts.length) try { smap.fitBounds(pts, { padding: [25, 25], maxZoom: 15 }); } catch {}
  };
  // Lieu saisi → position (Nominatim) puis itinéraire selon le véhicule du livreur.
  const locate = async (x, k, v) => {
    v = v.trim();
    if (!v) { x[k] = null; x.route = null; x.km = null; return; }
    const r = await geocode(v); if (!r.length) { x[k] = null; throw new Error(`Lieu introuvable : « ${v} »`); }
    x[k] = { address: v, lat: r[0].lat, lng: r[0].lng };
    if (x.from && x.to) { const rt = await bikeRoute([x.from.lat, x.from.lng], [x.to.lat, x.to.lng], vehicle); x.route = rt.coords; x.km = Math.round(rt.km * 10) / 10; }
  };
  render();
  box.addEventListener('change', (e) => {
    const row = e.target.closest('[data-i]'); if (!row) return; const x = slots[+row.dataset.i];
    if (e.target.dataset.k === 'axe_id') { x.axe_id = +e.target.value; fillFromAxe(x); render(); }
    if (e.target.dataset.k === 'from' || e.target.dataset.k === 'to') {
      const k = e.target.dataset.k; x.route = null;
      locate(x, k, e.target.value).then(() => {
        refreshRow(x);
        // les autres créneaux du même axe encore vides reprennent ces lieux
        if (x.from && x.to) for (const y of slots) if (y !== x && y.axe_id === x.axe_id && !y.from && !y.to) { Object.assign(y, { from: { ...x.from }, to: { ...x.to }, route: x.route, km: x.km }); refreshRow(y); }
        drawSlots();
      }).catch((er) => { toastErr(er); refreshRow(x); });
    }
    if (e.target.dataset.k === 'start') x.start_min = toMin(e.target.value);
    if (e.target.dataset.k === 'end') { const v = toMin(e.target.value); x.end_min = v === 1439 ? 1440 : v; }
  });
  box.addEventListener('click', (e) => {
    const row = e.target.closest('[data-i]'); if (!row) return; const x = slots[+row.dataset.i];
    if (e.target.closest('[data-del]')) { slots.splice(+row.dataset.i, 1); render(); }
    const d = e.target.closest('[data-day]')?.dataset.day;
    if (d) { x.days = String(x.days).includes(d) ? String(x.days).replace(d, '') : [...String(x.days) + d].sort().join(''); render(); }
  });
  m.el.querySelector('[data-add]').onclick = () => { const last = slots[slots.length - 1]; const st = last ? last.end_min % 1440 : 420; slots.push(fillFromAxe({ axe_id: last?.axe_id || axes[0].id, start_min: st, end_min: Math.min(1440, st + slot_minutes), days: '1234567', from: last?.from ? { ...last.from } : null, to: last?.to ? { ...last.to } : null, route: last?.route || null, km: last?.km || null })); render(); };
  m.el.querySelector('[data-clear]').onclick = () => { slots = []; render(); };
  m.el.querySelector('[data-gen]').onclick = () => {
    const ids = [...m.el.querySelectorAll('[data-gax] input:checked')].map((i) => +i.value);
    if (!ids.length) return toast('Cochez au moins un axe', 'err');
    const from = toMin(m.el.querySelector('[data-gfrom]').value), to = toMin(m.el.querySelector('[data-gto]').value) || 1440, step = Math.max(15, Number(m.el.querySelector('[data-gstep]').value) || 60);
    if (to <= from) return toast('Heure de fin invalide', 'err');
    const prev = slots; slots = []; let k = 0;
    for (let t0 = from; t0 < to; t0 += step) {
      const id = ids[k++ % ids.length], o = prev.find((y) => y.axe_id === id && y.from && y.to);
      slots.push({ axe_id: id, start_min: t0, end_min: Math.min(to, t0 + step), days: '1234567', from: o?.from || null, to: o?.to || null, route: o?.route || null, km: o?.km || null });
    }
    render();
  };
  m.el.querySelector('[data-save]').onclick = async () => {
    const miss = slots.findIndex((x) => !x.from || !x.to);
    if (miss >= 0) return toast(`Créneau de ${hm(slots[miss].start_min)} : indiquez le lieu de départ et le lieu d'arrivée`, 'err');
    try {
      await api('PUT', `/api/admin/couriers/${courierId}/axes`, { slots: slots.map((x) => ({ axe_id: x.axe_id, start_min: x.start_min, end_min: x.end_min, days: x.days, from: x.from, to: x.to, route: x.route, km: x.km })) });
      m.close(); toast('Planning enregistré', 'ok');
    } catch (e) { toastErr(e); }
  };
}

// ---------------------------------------------------------------- colis : détail centre (attribution) et marchands
async function parcelDetail(id) {
  const d = await shipDetail(id, { role: 'admin', onChange: () => show() });
  const s = d.shipment;
  const canPick = ['pending', 'assigned'].includes(s.status), canDel = canPick || ['to_centre', 'at_centre'].includes(s.step);
  // Colis trop cher ou trop lourd : l'admin valide (en ajustant les frais) ou refuse.
  if (s.review && s.status === 'pending') {
    const rv = document.createElement('div');
    rv.className = 'card stack'; rv.style.background = 'var(--sun-soft)'; rv.style.border = '0';
    rv.innerHTML = `<b>⚠️ À valider : ${esc(s.review)}</b>
      <div class="row wrap" style="gap:8px"><label class="field grow"><span>Frais (Ar)${s.category === 'XL' || s.review === 'devis' ? ' — XL : devis, minimum 15 000 Ar' : ''}</span><input class="input" data-rfee inputmode="numeric" value="${s.category === 'XL' && s.fee < 15000 ? 15000 : s.fee}"></label>
        <label class="field grow"><span>Motif si refus</span><input class="input" data-rreason value="Valeur ou poids trop élevé"></label></div>
      <div class="row" style="gap:8px"><button class="btn primary grow" data-approve>✅ Valider</button><button class="btn danger grow" data-reject>❌ Refuser</button></div>`;
    d.actions.prepend(rv);
    rv.querySelector('[data-approve]').onclick = async () => {
      try { await api('POST', `/api/admin/shipments/${s.id}/approve`, { fee: Number(rv.querySelector('[data-rfee]').value.replace(/\D/g, '')) || s.fee }); d.modal.close(); toast('Colis validé', 'ok'); show(); } catch (e) { toastErr(e); }
    };
    rv.querySelector('[data-reject]').onclick = async () => {
      const reason = rv.querySelector('[data-rreason]').value.trim() || 'Refusé par le centre';
      try { await api('POST', `/api/admin/shipments/${s.id}/reject`, { reason }); d.modal.close(); toast('Colis refusé', 'ok'); show(); } catch (e) { toastErr(e); }
    };
  }
  if (canDel) await suggestBox(d, s, canPick);
  if (!canPick) return;
  const sch = await api('GET', '/api/schedule');
  const couriers = (await api('GET', '/api/admin/users?role=courier&status=active')).users;
  const box = document.createElement('div');
  box.className = 'card';
  box.innerHTML = `<b>Ou : programmer sur un départ précis</b>
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

// Livreurs proposés pour la récupération et la livraison (passent par là, distance GPS en direct, prochain départ, charge).
// Choisir deux livreurs différents = relais par le centre.
async function suggestBox(d, s, canPick) {
  const g = await api('GET', `/api/admin/shipments/${s.id}/suggest`);
  let pick = g.current.pickup || '', del = g.current.delivery || '';
  const box = document.createElement('div');
  box.className = 'card stack';
  const row = (c, leg) => `<label class="row" style="gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--line);cursor:pointer">
      <input type="radio" name="${leg}" value="${c.id}" ${String(leg === 'p' ? pick : del) === String(c.id) ? 'checked' : ''} style="margin-top:4px">
      <span class="grow small">${vehIcon(c.vehicle)} <b>${esc(c.name)}</b> ${c.online ? '🟢' : '⚪'} · <a href="tel:${esc(c.phone)}" onclick="event.stopPropagation()">📞 ${esc(phoneFmt(c.phone))}</a>${c.refused ? ' <span style="color:var(--red)">a refusé</span>' : ''}
        <span class="muted">${c.dist_km != null ? ` · 📍 ${String(c.dist_km).replace('.', ',')} km maintenant` : ''}${c.run?.passes ? ` · <b style="color:var(--green)">🚀 en tournée, passe par là</b> (→ ${esc(c.run.to)})` : c.run ? ` · 🚀 en tournée → ${esc(c.run.to)}` : ''}${c.offer === 'open' ? ' · 🔔 offre envoyée' : c.offer === 'declined' ? ' · a passé l\'offre' : ''}${c.on_trip ? ' · 🛣 trajet passe par là' : ''}${c.axe ? ` · 🧭 axe ${esc(c.axe)}` : ''}
        ${c.next_departure ? ` · 🕘 ${dt(c.next_departure.at)} ${esc(c.next_departure.label || '')}` : ''} · ${c.load} colis en cours</span></span></label>`;
  const list = (arr, leg) => arr.slice(0, 6).map((c) => row(c, leg)).join('') + (arr.length > 6 ? `<details class="small"><summary>${arr.length - 6} autre(s)</summary>${arr.slice(6).map((c) => row(c, leg)).join('')}</details>` : '');
  box.innerHTML = `<b>🚲🏍️ Livreurs proposés</b>
    <div class="tiny muted">En tête : ceux dont le trajet ou l'axe passe par l'adresse, puis les plus proches (GPS en direct). Deux livreurs différents = passage par le centre.</div>
    <div data-smap style="height:260px;border-radius:12px;overflow:hidden"></div>
    <div class="tiny muted">🟢 A = récupération · 🟠 B = livraison · 🏢 centre · 🚲/🏍️ livreurs en direct (mis à jour toutes les 5 s)</div>
    ${canPick ? `<div><div class="small"><b>🟢 Récupération</b> — ${esc(s.sender.address)}</div>${list(g.pickup, 'p')}</div>` : ''}
    <div><div class="small"><b>🟠 Livraison</b> — ${esc(s.recipient.address)}${canPick ? '' : ' (depuis le centre)'}</div>${list(g.delivery, 'd')}</div>
    <div class="small" data-plan></div>
    <button class="btn primary block" data-save>Enregistrer les livreurs</button>`;
  d.actions.prepend(box);
  // Carte en direct : points A / B / centre et position actuelle de chaque livreur proposé.
  const smap = makeMap(box.querySelector('[data-smap]'), { zoom: 13 });
  const mk = {};
  const drawMap = (data, fit) => {
    if (!smap) return;
    const pts = [];
    if (s.sender.lat != null) { upsertMarker(smap, mk, 'A', [s.sender.lat, s.sender.lng], icons.a()); pts.push([s.sender.lat, s.sender.lng]); }
    if (s.recipient.lat != null) { upsertMarker(smap, mk, 'B', [s.recipient.lat, s.recipient.lng], icons.b()); pts.push([s.recipient.lat, s.recipient.lng]); }
    if (data.centre) upsertMarker(smap, mk, 'C', data.centre, L.divIcon({ className: '', html: '<div style="font-size:22px">🏢</div>', iconSize: [24, 24], iconAnchor: [12, 12] }));
    const seen = new Set(['A', 'B', 'C']);
    for (const c of [...new Map([...data.pickup, ...data.delivery].map((x) => [x.id, x])).values()]) {
      if (!c.position) continue;
      const k = 'k' + c.id; seen.add(k);
      upsertMarker(smap, mk, k, c.position, icons.bike('', c.name.split(' ')[0], c.vehicle));
      mk[k].bindTooltip(`<b>${esc(c.name)}</b><br>${vehIcon(c.vehicle)} ${c.vehicle === 'moto' ? 'Moto' : 'Vélo'} · 📞 ${esc(phoneFmt(c.phone))}${c.run ? `<br>🚀 En tournée → ${esc(c.run.to)}` : ''}<br>${c.online ? '🟢 en ligne' : '⚪ hors ligne'}${c.position_at ? ' · ' + time(c.position_at) : ''}`);
      if (c.online) pts.push(c.position);
    }
    pruneMarkers(mk, seen);
    if (fit && pts.length) try { smap.fitBounds(pts, { padding: [30, 30], maxZoom: 15 }); } catch {}
  };
  drawMap(g, true);
  const live = setInterval(async () => {
    if (!document.body.contains(box)) return clearInterval(live);
    try { const x = await api('GET', `/api/admin/shipments/${s.id}/suggest`); g.pickup = x.pickup; g.delivery = x.delivery; drawMap(x, false); } catch {}
  }, 5000);
  const sum = () => {
    const n = (id) => [...g.pickup, ...g.delivery].find((c) => String(c.id) === String(id))?.name?.split(' ')[0] || '?';
    box.querySelector('[data-plan]').innerHTML = canPick ? (pick && del && String(pick) !== String(del) ? `🏢 Relais : <b>${esc(n(pick))}</b> → centre → <b>${esc(n(del))}</b>` : pick ? `➡️ Direct : <b>${esc(n(pick))}</b> fait tout le trajet` : '') : del ? `Livraison depuis le centre : <b>${esc(n(del))}</b>` : '';
  };
  box.addEventListener('change', (e) => { if (e.target.name === 'p') { pick = e.target.value; if (!del || String(del) === String(g.current.delivery)) { /* garde le choix */ } } if (e.target.name === 'd') del = e.target.value; sum(); });
  sum();
  box.querySelector('[data-save]').onclick = async () => {
    try {
      await api('POST', `/api/admin/shipments/${s.id}/plan`, canPick ? { pickup_courier_id: Number(pick), delivery_courier_id: Number(del || pick) } : { delivery_courier_id: Number(del) });
      d.modal.close(); toast('Livreurs enregistrés', 'ok'); show();
    } catch (e) { toastErr(e); }
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

// Connexion au compte Tsena : le mot de passe part une seule fois vers Firebase, il n'est pas conservé.
function tsenaForm() {
  const m = modal('Connecter Tsena Ampandrana', `<form class="stack" data-f>
    <label class="field"><span>Adresse du logiciel</span><input class="input" name="url" value="https://tsena-ampandrana.web.app" required></label>
    <label class="field"><span>E-mail du compte Tsena</span><input class="input" name="email" type="email" autocomplete="off" required></label>
    <label class="field"><span>Mot de passe Tsena</span><input class="input" name="password" type="password" autocomplete="off" required></label>
    <p class="tiny muted">Utilisé une seule fois pour obtenir l'autorisation ; Alefa ne garde pas le mot de passe.</p>
    <label class="field"><span>Nom de la boutique (expéditeur des colis)</span><input class="input" name="shop_name" value="Tsena Ampandrana" required></label>
    <label class="field"><span>Téléphone de la boutique</span><input class="input" name="shop_phone" required placeholder="034 00 000 00"></label>
    <label class="field"><span>Adresse de récupération</span><input class="input" name="pickup_addr" placeholder="Ampandrana, Antananarivo"></label>
    <button class="btn primary" data-go>Connecter et importer</button></form>`);
  const f = m.el.querySelector('[data-f]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = f.querySelector('[data-go]'); b.disabled = true; b.textContent = 'Connexion…';
    try {
      const r = await api('POST', '/api/admin/tsena/connect', Object.fromEntries(new FormData(f)));
      m.close(); toast(`Tsena connecté : ${r.imported} livraison(s) importée(s)`, 'ok'); show();
    } catch (err) { toastErr(err); b.disabled = false; b.textContent = 'Connecter et importer'; }
  });
}
