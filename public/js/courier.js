// Application Livreur (vélo) : disponibilité, partage GPS, demandes proches, négociation, livraison avec PIN, revenus.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, bikeRoute, etaMin, vehIcon, getPosition, hm, every, geocode, startNotifications, showNotifications, setNotifOpener, supportChat, profileForm,
  sendSOS, complaintForm, chatHtml, haversine, beep, logout,
} from './core.js';
import { c, shipCard, shipDetail, courierScheduleEditor, courierTripsEditor, scheduleHtml, stepLabel, nextAction } from './colis.js';

let root, map, sheet, watchId = null, pos = null, posTimer, reqTimer, activeTimer, wakeLock = null, myRun = null, runLayer = null, toLeaveN = 0;
const mk = {};
let axeLayer = null, axe = null, routeLayer = null, tab = 'home', shipTimer = null, requests = [], active = null, available = false, lastSig = '', selected = null, lastRouteKey = '';

// Icônes du menu (mêmes traits que l'espace client).
const SV = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  home: '<path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  hist: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4l3 2"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
const ic = (k) => `<svg class="sp-ic" viewBox="0 0 24 24" aria-hidden="true">${SV[k]}</svg>`;
const L2 = (fr, mg) => (state.lang === 'mg' ? mg : fr);
const NOMAP = ['home', 'wallet', 'hist']; // pages sans carte : la place va au contenu

export async function mount(el) {
  root = el;
  available = !!state.courier?.available;
  if (!document.querySelector('link[data-space-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/space.css'; l.dataset.spaceCss = '1'; document.head.append(l); }
  const u = state.user;
  const navs = [['home', 'home', L2('Tableau de bord', 'Tabilao')], ['colis', 'box', c('colis')], ['req', 'bolt', 'Express'], ['plan', 'cal', c('my_schedule')], ['wallet', 'cash', t('wallet')], ['hist', 'hist', t('history')]];
  root.className = 'sp cv';
  root.innerHTML = `<aside class="sp-side">
      <a class="sp-logo" href="/livreur"><img src="/icon.svg" alt="" width="34" height="34"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a>
      <div class="sp-label">${L2('Espace livreur', 'Toeran\'ny livreur')}</div>
      <nav>${navs.map(([k, i, l]) => `<button data-act="tab" data-t="${k}">${ic(i)}<span>${l}</span><em class="cv-count" data-count="${k}"></em></button>`).join('')}<hr>
        <button data-act="support">${ic('chat')}<span>${L2('Service client', 'Sampana mpanjifa')}</span></button>
        <button data-act="notifs">${ic('bell')}<span>Notifications</span></button>
        <button data-act="profile">${ic('user')}<span>${L2('Profil', 'Mombamomba')}</span></button></nav>
      <div class="sp-me"><span class="sp-av">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><small>${esc(phoneFmt(u.phone))}</small></div><button data-act="out" title="${L2('Déconnexion', 'Hivoaka')}">${ic('out')}</button></div>
    </aside>
    <div class="sp-main">
      <header class="sp-top"><a class="sp-logo m" href="/livreur"><img src="/icon.svg" alt="" width="30" height="30"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a>
        <span class="cv-state ${available ? 'on' : ''}" data-state>${available ? t('available') : t('unavailable')}</span><div class="grow"></div>
        <button class="sp-bell" data-act="notifs" aria-label="Notifications">${ic('bell')}<span class="sp-dot hidden" data-unread></span></button>
        <button class="sp-chip" data-act="profile"><span class="sp-av">${esc(initials(u.name))}</span><span>${esc(u.name.split(' ')[0])}</span></button></header>
      <main class="cv-main" data-cvmain>
        <div class="cv-map"><div class="map" id="map"></div>
          <div class="cv-fab"><button class="icon-btn" data-act="center" title="${L2('Ma position', 'Ny toerako')}">${ic('target')}</button><button class="icon-btn sos-btn" data-act="sos">SOS</button></div></div>
        <div class="cv-body" id="sheet"><div class="sheet-body" id="sheet-body"></div></div>
      </main>
    </div>
    <nav class="sp-tab">${[...navs.slice(0, 4), ['menu', 'more', L2('Plus', 'Hafa')]].map(([k, i, l]) => `<button ${k === 'menu' ? 'data-act="menu"' : `data-act="tab" data-t="${k}"`}>${ic(i)}<span>${k === 'home' ? L2('Accueil', 'Fandraisana') : k === 'plan' ? L2('Départs', 'Fiaingana') : l}</span><em class="cv-count" data-count="${k}"></em></button>`).join('')}</nav>`;
  sheet = $('#sheet');
  map = makeMap($('#map'), { zoom: 15 });
  bind(root, actions);
  if (state.user.status !== 'active') return renderPending();
  // clic sur une notification : le colis concerné, la course express, ou le planning
  setNotifOpener((tg) => {
    if (tg.type === 'shipment') { if (tab !== 'colis') { tab = 'colis'; lastSig = ''; render(); } return openShip(tg.id); }
    if (tg.type === 'plan') { tab = 'plan'; lastSig = ''; return render(); }
    if (tg.type === 'support') return supportChat();
    if (tg.type === 'chat') return import('./talk.js').then((t) => t.openShipChat(tg.id));
    if (tg.type === 'delivery') { tab = 'req'; lastSig = ''; render(); return openRequest?.(tg.id); }
  });
  startNotifications((fresh) => {
    if (fresh.some((n) => n.kind === 'offer_accepted')) checkActive();
    if (fresh.some((n) => ['new_request', 'price_raised'].includes(n.kind))) loadRequests();
    if (tab === 'colis' && !active && fresh.some((n) => n.kind.startsWith('shipment'))) loadMissions();
  });
  axe = state.axe; drawAxe();
  startGps();
  await checkActive();
  if (!active) render();
  reqTimer = every(5000, () => (available && !active ? loadRequests() : null));
  if (available) keepAwake();
}

function renderPending() {
  $('#sheet-body').innerHTML = `<div style="text-align:center;padding:10px 4px 18px"><div style="font-size:52px">⏳</div><h2>${t('pending_validation')}</h2><p class="muted">${t('pending_help')}</p>
    <button class="btn primary block" data-act="reload">↻</button></div>`;
}

// ---------------------------------------------------------------- GPS
const GPS_OPTS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
let lastFix = 0, gateKind = null;

// Le GPS est obligatoire : tant qu'aucune position n'est reçue, un écran bloque l'application.
function startGps() {
  if (!navigator.geolocation) return showGate('off');
  showGate('searching');
  watchGps();
  posTimer = every(5000, sendPos, false);
  // Signal perdu depuis plus d'1 minute pendant le service → écran bloquant.
  every(10000, () => { if (lastFix && Date.now() - lastFix > 60e3) showGate('lost'); }, false);
  navigator.permissions?.query({ name: 'geolocation' }).then((perm) => {
    if (perm.state === 'denied') showGate('denied');
    perm.onchange = () => (perm.state === 'denied' ? showGate('denied') : watchGps());
  }).catch(() => {});
}
function watchGps() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onFix, (e) => showGate(e.code === 1 ? 'denied' : lastFix ? 'lost' : 'off'), GPS_OPTS);
}
function onFix(p) {
  lastFix = Date.now();
  const first = !pos;
  pos = [p.coords.latitude, p.coords.longitude];
  hideGate();
  upsertMarker(map, mk, 'me', pos, icons.bike(active ? 'busy' : '', '', state.courier?.vehicle), { zIndexOffset: 1000, refreshIcon: true });
  if (first) { map?.setView(pos, 15); sendPos(); if (available) loadRequests(); }
}
function showGate(kind) {
  if (gateKind === kind) return;
  gateKind = kind;
  let g = $('#gps-gate');
  if (!g) { g = document.createElement('div'); g.id = 'gps-gate'; g.className = 'gps-gate'; document.body.append(g); }
  const searching = kind === 'searching';
  g.innerHTML = `<div class="gps-card">
    ${searching ? '<div class="radar" style="margin:6px auto 18px"></div>' : '<div style="font-size:54px;line-height:1">📍</div>'}
    <h2>${searching ? t('gps_searching') : kind === 'denied' ? t('gps_denied_title') : t('gps_off_title')}</h2>
    <p class="muted">${t('gps_off_text')}</p>
    ${searching ? '' : `<ol class="small" style="text-align:left;padding-left:18px;line-height:1.5"><li>${t('gps_step_android')}</li><li>${t('gps_step_iphone')}</li><li>${t('gps_step_browser')}</li></ol>`}
    <button class="btn primary lg block" data-gps-retry>${t('gps_retry')}</button>
    <button class="btn ghost block" data-gps-sos style="margin-top:6px;color:var(--red)">SOS</button>
  </div>`;
  g.querySelector('[data-gps-retry]').onclick = () => { gateKind = null; showGate('searching'); navigator.geolocation?.getCurrentPosition(onFix, (e) => showGate(e.code === 1 ? 'denied' : 'off'), GPS_OPTS); watchGps(); };
  g.querySelector('[data-gps-sos]').onclick = () => sendSOS(active?.id);
}
function hideGate() {
  if (!gateKind) return;
  gateKind = null;
  $('#gps-gate')?.remove();
  toast(t('gps_ok'), 'ok');
}
async function sendPos() {
  // Position envoyée dès que le GPS répond ; le serveur ne l'enregistre que pendant le service (disponible, course ou colis en cours).
  if (!pos) return;
  const r = await api('POST', '/api/courier/location', { lat: pos[0], lng: pos[1] });
  if (r.active_delivery && !active) checkActive();
  if (r.stages?.length) { for (const [ref, st] of r.stages) toast(`${ref} · ${stepLabel(st)}`, 'ok'); if (tab === 'colis') loadMissions(); }
}
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && (available || active)) keepAwake(); });

// ---------------------------------------------------------------- demandes
async function loadRequests() {
  if (!available || active) return;
  const qs = pos ? `?lat=${pos[0]}&lng=${pos[1]}` : '';
  const r = await api('GET', '/api/courier/requests' + qs);
  if (r.active_delivery && !active) return checkActive();
  if (r.axe && JSON.stringify(r.axe) !== JSON.stringify(axe)) { axe = r.axe; drawAxe(); lastSig = ''; }
  const before = new Set(requests.map((x) => x.id));
  requests = r.requests;
  if (requests.some((x) => !before.has(x.id)) && before.size) beep();
  const keep = new Set();
  for (const q of requests) {
    keep.add('r' + q.id);
    upsertMarker(map, mk, 'r' + q.id, [q.pickup_lat, q.pickup_lng], icons.req(`${(q.my_price || q.proposed_price).toLocaleString('fr-FR')} Ar`), { refreshIcon: true })
      .off('click').on('click', () => openRequest(q.id));
  }
  for (const k of Object.keys(mk)) if (k.startsWith('r') && !keep.has(k)) { mk[k].remove(); delete mk[k]; }
  const sig = JSON.stringify(requests.map((x) => [x.id, x.proposed_price, x.my_price, x.my_status]));
  syncNav();
  if (sig !== lastSig && tab === 'req') { lastSig = sig; render(); }
}

function drawAxe() {
  if (!map) return;
  axeLayer?.remove(); axeLayer = null;
  const c = axe?.current;
  if (c) axeLayer = L.circle([c.center_lat, c.center_lng], { radius: c.radius_km * 1000, color: c.color, weight: 2, fillOpacity: .07, interactive: false }).addTo(map);
}
function axeLine() {
  if (!axe || axe.free) return `<div class="small muted" style="margin-top:8px">📍 ${t('my_axe')} : <b>${t('free_axe')}</b></div>`;
  const c = axe.current, n = axe.next;
  return `<div class="card" style="margin-top:8px;padding:10px 12px;${c ? `border-color:${esc(c.color)}` : 'background:var(--sun-soft);border:0'}">
    ${c ? `📍 ${t('my_axe')} : <b>${esc(c.name)}</b> <span class="muted small">${hm(c.start_min)}–${hm(c.end_min)}</span>` : `⏸ <b>${t('off_schedule')}</b>`}
    ${n ? `<div class="small muted">${t('next_axe')} : ${esc(n.name)} ${state.lang === 'mg' ? 'amin\'ny' : 'à'} ${hm(n.start_min)}</div>` : ''}</div>`;
}
function header() {
  return `<button class="switch ${available ? 'on' : 'off'}" data-act="toggle"><span class="knob"></span><span class="grow" style="text-align:left">${available ? t('available') : t('unavailable')}</span><span class="small">${available ? '🟢 GPS' : ''}</span></button>${axeLine()}
    <h2 class="cv-h">${{ home: L2('Tableau de bord', 'Tabilao'), colis: c('colis'), req: L2('Courses express', 'Dia haingana'), plan: c('my_schedule'), wallet: t('wallet'), hist: t('history') }[tab] || ''}</h2>`;
}
// Menu, carte et compteurs suivent la page affichée.
function syncNav() {
  root.querySelectorAll('[data-act=tab]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  const st = root.querySelector('[data-state]');
  if (st) { st.textContent = available ? t('available') : t('unavailable'); st.classList.toggle('on', available); }
  root.querySelectorAll('[data-count=req]').forEach((e) => { e.textContent = requests.length || ''; });
  const m = root.querySelector('[data-cvmain]'), hide = !active && NOMAP.includes(tab);
  if (m && m.classList.contains('nomap') !== hide) { m.classList.toggle('nomap', hide); if (!hide) setTimeout(() => map?.invalidateSize(), 50); }
}

function reqCard(q) {
  const mine = q.my_status === 'pending';
  return `<div class="card ${mine ? 'hl' : ''}" data-act="open" data-id="${q.id}" style="cursor:pointer">
    <div class="row between"><span class="small muted">${t(q.type)} · ${esc(q.client_name.split(' ')[0])}${q.scheduled_at ? ` · 🗓 ${dt(q.scheduled_at)}` : ''}</span><span class="price">${q.proposed_price.toLocaleString('fr-FR')} <small>Ar</small></span></div>
    <div class="route-line" style="margin:6px 0"><span class="dot"></span><span class="small ellipsis">${esc(q.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(q.drop_addr || '—')}</span></div>
    <div class="row between small"><span class="muted">📍 ${km(q.to_pickup_km)} ${t('to_pickup')} · ${vehIcon(state.courier?.vehicle)} ${km(q.distance_km)}</span><span>${t(q.payment_method)}</span></div>
    ${mine ? `<div class="small" style="margin-top:6px;color:var(--green);font-weight:700">${t('my_offer')} : ${ar(q.my_price)} — ${t('waiting_client')}</div>` : ''}
  </div>`;
}

function render() {
  syncNav();
  if (active) return renderActive();
  window.scrollTo(0, 0);
  const body = $('#sheet-body');
  if (tab === 'home') { body.innerHTML = header() + '<div data-dash><div class="sp-skel"></div></div>'; return loadDash(); }
  if (tab === 'wallet') { body.innerHTML = header() + '<div data-wallet>…</div>'; return loadWallet(); }
  if (tab === 'colis') { body.innerHTML = header() + '<div data-colis>…</div>'; return loadMissions(); }
  if (tab === 'plan') {
    body.innerHTML = header() + `<h3>🛣 ${state.lang === 'mg' ? 'Ny diako' : 'Mes trajets'}</h3><div data-trips>…</div>`
      + `<h3 style="margin-top:16px">🕘 ${c('my_schedule')} (axes)</h3><div data-plan>…</div><h3 style="margin-top:16px">${c('from_centre')}</h3><div data-allsched class="small">…</div>`;
    const all = () => scheduleHtml(null).then((h) => { const el = $('[data-allsched]'); if (el) el.innerHTML = h; });
    courierTripsEditor($('[data-trips]'), { map, bikeRoute, onChange: all, readOnly: true }).catch(toastErr);
    courierScheduleEditor($('[data-plan]')).catch(toastErr); all(); return; }
  if (tab === 'hist') { body.innerHTML = header() + '<div data-hist class="list">…</div>'; return loadHistory(); }
  body.innerHTML = header() + (available
    ? `<div class="list">${requests.map(reqCard).join('') || (axe && !axe.free && !axe.current ? `<p class="muted" style="text-align:center;padding:16px">⏸ ${t('off_schedule')}</p>` : `<div style="text-align:center;padding:16px"><div class="radar" style="margin:10px auto 16px"></div><p class="muted">${t('no_requests')}</p></div>`)}</div>`
    : `<div style="text-align:center;padding:16px 8px"><div style="font-size:46px">${vehIcon(state.courier?.vehicle)}</div><p class="muted">${t('go_online')}</p></div>`);
}

async function openRequest(id) {
  const q = requests.find((x) => x.id === id);
  if (!q) return;
  selected = q;
  const r = await bikeRoute([q.pickup_lat, q.pickup_lng], [q.drop_lat, q.drop_lng], state.courier?.vehicle);
  drawRoute(r, true);
  upsertMarker(map, mk, 'A', [q.pickup_lat, q.pickup_lng], icons.a());
  upsertMarker(map, mk, 'B', [q.drop_lat, q.drop_lng], icons.b());
  const m = modal(`${t(q.type)} · ${ar(q.proposed_price)}`, `<div class="stack">
    <div class="card"><div class="route-line"><span class="dot"></span><span class="small">${esc(q.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small">${esc(q.drop_addr || '—')}</span></div></div>
    ${q.description ? `<div class="small">📝 ${esc(q.description)}</div>` : ''}
    <div class="row between small"><span class="muted">📍 ${km(q.to_pickup_km)} ${t('to_pickup')}</span><span class="muted">${vehIcon(state.courier?.vehicle)} ${km(r.km)} · ~${r.min || etaMin(r.km, state.courier?.vehicle)} ${t('min')}</span></div>
    <div class="row between small"><span class="muted">${t('payment')}</span><b>${t(q.payment_method)}</b></div>
    <div class="row between small"><span class="muted">${t('suggested')}</span><b>${ar(q.suggested_price)}</b></div>
    <button class="btn primary lg block" data-acc>✅ ${t('accept_price')} ${ar(q.proposed_price)}</button>
    <div class="small muted" style="text-align:center">— ${t('propose')} —</div>
    <div class="row">${[500, 1000, 2000].map((d) => `<button class="btn sun grow" data-p="${q.proposed_price + d}">${ar(q.proposed_price + d)}</button>`).join('')}</div>
    <div class="row"><input class="input grow" inputmode="numeric" placeholder="Autre prix (Ar)" data-custom><button class="btn primary" data-cus>${t('propose')}</button></div>
    ${q.my_status === 'pending' ? `<button class="btn danger block" data-wd>${t('withdraw')} (${ar(q.my_price)})</button>` : ''}
  </div>`, { onClose: () => { selected = null; clearRoute(); } });
  const offer = async (price) => {
    try { await api('POST', `/api/deliveries/${q.id}/offer`, price ? { price } : {}); toast(`${t('my_offer')} : ${ar(price || q.proposed_price)} — ${t('waiting_client')}`, 'ok'); m.close(); lastSig = ''; loadRequests(); }
    catch (e) { toastErr(e); }
  };
  m.el.querySelector('[data-acc]').onclick = () => offer(null);
  m.el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => offer(+b.dataset.p)));
  m.el.querySelector('[data-cus]').onclick = () => { const v = +m.el.querySelector('[data-custom]').value.replace(/\D/g, ''); if (v) offer(v); };
  m.el.querySelector('[data-wd]')?.addEventListener('click', async () => { await api('POST', `/api/deliveries/${q.id}/withdraw`, {}); m.close(); lastSig = ''; loadRequests(); });
}

function drawRoute(r, fit) {
  if (!map) return;
  routeLayer?.remove();
  routeLayer = L.layerGroup([L.polyline(r.coords, { color: '#1a6fa3', weight: 9, opacity: .18 }), L.polyline(r.coords, { color: '#1a6fa3', weight: 4.5, dashArray: r.approx ? '8 8' : null })]).addTo(map);
  if (fit) map.fitBounds(L.latLngBounds(r.coords).pad(.2), { padding: [30, 30] });
}
function clearRoute() { routeLayer?.remove(); routeLayer = null; for (const k of ['A', 'B']) if (mk[k]) { mk[k].remove(); delete mk[k]; } lastRouteKey = ''; }

// ---------------------------------------------------------------- livraison en cours
async function checkActive() {
  const list = (await api('GET', '/api/deliveries')).deliveries;
  const a = list.find((d) => ['assigned', 'picked_up'].includes(d.status));
  if (a) {
    active = { id: a.id };
    for (const k of Object.keys(mk)) if (k.startsWith('r')) { mk[k].remove(); delete mk[k]; }
    $$('.modal-back').forEach((x) => x.remove());
    activeTimer?.stop();
    activeTimer = every(5000, refreshActive);
  }
}

async function refreshActive() {
  if (!active) return;
  const d = await api('GET', `/api/deliveries/${active.id}`);
  const prev = active;
  active = d;
  if (!['assigned', 'picked_up'].includes(d.status)) {
    activeTimer?.stop(); active = null; clearRoute();
    if (d.status === 'cancelled') toast('Livraison annulée', 'err');
    lastSig = ''; render(); loadRequests(); return;
  }
  upsertMarker(map, mk, 'A', [d.pickup_lat, d.pickup_lng], icons.a());
  upsertMarker(map, mk, 'B', [d.drop_lat, d.drop_lng], icons.b());
  const target = d.status === 'assigned' ? [d.pickup_lat, d.pickup_lng] : [d.drop_lat, d.drop_lng];
  const from = pos || target;
  const key = d.status + from.map((x) => x.toFixed(3)).join();
  if (key !== lastRouteKey) {
    const first = !lastRouteKey || !lastRouteKey.startsWith(d.status);
    lastRouteKey = key;
    const r = await bikeRoute(from, target, state.courier?.vehicle);
    drawRoute(r, first);
    active._km = r.km; active._eta = r.min || etaMin(r.km, state.courier?.vehicle);
  } else { active._km = prev._km; active._eta = prev._eta; }
  const sig = JSON.stringify([d.status, d.messages?.length, active._eta]);
  if (sig !== prev._sig || !$('[data-active]')) renderActive();
  active._sig = sig;
}

function renderActive() {
  syncNav();
  const d = active;
  if (!d?.status) return;
  sheet.classList.remove('collapsed');
  const target = d.status === 'assigned' ? [d.pickup_lat, d.pickup_lng] : [d.drop_lat, d.drop_lng];
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${target[0]},${target[1]}&travelmode=bicycling`;
  const hadInput = $('[data-chat-input]')?.value || '';
  const hadPin = $('[data-pin]')?.value || '';
  $('#sheet-body').innerHTML = `<div data-active class="stack">
    <div class="row between"><span class="small muted">#${d.id} · ${t(d.type)}</span>${statusPill(d.status)}</div>
    <div class="card" style="background:${d.status === 'assigned' ? 'var(--green-soft)' : '#fff1e0'};border:0">
      <div class="small muted">${d.status === 'assigned' ? '① ' + t('where_from') : '② ' + t('where_to')}</div>
      <b style="font-size:1.1rem">${esc(d.status === 'assigned' ? d.pickup_addr : d.drop_addr) || '—'}</b>
      <div class="small muted">${vehIcon(state.courier?.vehicle)} ${km(d._km)} · ~${d._eta || '…'} ${t('min')}</div>
      ${d.status === 'picked_up' && (d.recipient_name || d.recipient_phone) ? `<div class="small" style="margin-top:4px">👤 ${esc(d.recipient_name || '')} ${d.recipient_phone ? `· <a href="tel:${esc(d.recipient_phone)}">${esc(phoneFmt(d.recipient_phone))}</a>` : ''}</div>` : ''}
    </div>
    ${d.description ? `<div class="small">📝 ${esc(d.description)}</div>` : ''}
    <div class="row between"><span>${t('payment')} : <b>${t(d.payment_method)}</b></span><span class="price">${(d.final_price ?? d.proposed_price).toLocaleString('fr-FR')} <small>Ar</small></span></div>
    ${d.payment_method === 'cash' ? `<div class="tiny muted">💵 ${state.lang === 'mg' ? 'Raiso amin\'ny mpanjifa na mpandray ny vola' : 'Encaissez ce montant auprès du client ou du destinataire'}</div>` : ''}
    <div class="row"><a class="btn grow" href="${nav}" target="_blank" rel="noopener">🧭 ${t('navigate')}</a><a class="btn grow" href="tel:${esc(d.client?.phone || '')}">📞 ${t('call')}</a></div>
    ${d.status === 'assigned'
      ? `<button class="btn primary lg block" data-act="pickup">📦 ${t('picked')}</button>`
      : `<label class="field"><span>${t('enter_pin')}</span><input class="input" data-pin inputmode="numeric" maxlength="4" value="${esc(hadPin)}" placeholder="••••" style="text-align:center;font-size:1.6rem;letter-spacing:.5em;font-weight:800"></label>
         <button class="btn primary lg block" data-act="deliver">✅ ${t('delivered_btn')}</button>`}
    <h3>💬 ${t('chat')} — ${esc(d.client?.name || '')}</h3>
    <div class="chat" data-chat>${chatHtml(d.messages || [], state.user.id)}</div>
    <div class="row"><input class="input grow" data-chat-input placeholder="${t('chat')}…" maxlength="500" value="${esc(hadInput)}"><button class="btn primary" data-act="send">${t('send')}</button></div>
    <div class="row"><button class="btn ghost grow" data-act="complaint">⚠ ${t('complaint')}</button>${d.status === 'assigned' ? `<button class="btn danger grow" data-act="abandon">${t('abandon')}</button>` : ''}</div>
  </div>`;
  const box = $('[data-chat]'); if (box) box.scrollTop = box.scrollHeight;
  $('[data-chat-input]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.send(); });
}

// ---------------------------------------------------------------- revenus / historique
// ---------------------------------------------------------------- tableau de bord du livreur
async function loadDash() {
  const d = await api('GET', '/api/courier/dashboard').catch((e) => { toastErr(e); return null; });
  const el = $('[data-dash]'); if (!el || !d) return;
  const mg = state.lang === 'mg', N = d.now, C = d.cash;
  const ago = (ms) => { const h = Math.round((Date.now() - ms) / 3600e3); return h < 1 ? L2("moins d'une heure", 'latsaky ny adiny iray') : h < 24 ? `${h} h` : `${Math.round(h / 24)} ${L2('jour(s)', 'andro')}`; };
  const kpi = (icon, label, v, sub = '', cls = '') => `<div class="sp-kpi ${cls}"><span>${ic(icon)}</span><small>${label}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const max = Math.max(1, ...d.last7.map((x) => x.earned));
  const wd = (k) => new Date(`${k}T12:00:00Z`).toLocaleDateString(mg ? 'fr-FR' : 'fr-FR', { weekday: 'short' }).replace('.', '');
  el.innerHTML = `
    <div class="cv-hero ${C.to_remit > 0 ? 'due' : ''}">
      <small>${L2('À remettre au centre', 'Atolotra ny centre')}</small>
      <b>${ar(C.to_remit)}</b>
      <em>${C.to_remit > 0 ? `${C.parcels} ${L2('colis', 'colis')} · ${L2('encaissé', 'voaray')} ${ar(C.collected)} − ${L2('votre part', 'anjaranao')} ${ar(C.my_share)}${C.since ? ` · ${L2('depuis', 'nanomboka')} ${ago(C.since)}` : ''}` : L2('Tout est remis. Merci !', 'Voatolotra daholo. Misaotra !')}</em>
      <div class="cv-hero-row"><span>${L2('Déjà remis ce mois', 'Efa natolotra tamin\'ity volana ity')} <b>${ar(d.remitted.month)}</b></span>${d.remitted.last[0] ? `<span>${L2('Dernière remise', 'Farany')} : ${ar(d.remitted.last[0].amount)} · ${dt(d.remitted.last[0].at)}</span>` : ''}</div>
    </div>
    <h3 class="cv-sub">${L2('Maintenant', 'Izao')}</h3>
    <div class="sp-kpis cv-kpis">
      ${kpi('box', L2('À récupérer', 'Halaina'), N.to_pickup, N.to_collect_later ? `${ar(N.to_collect_later)} ${L2('à encaisser ensuite', 'horaisina avy eo')}` : '', 'sun')}
      ${kpi('bolt', L2('À livrer', 'Haterina'), N.to_deliver, '')}
      ${kpi('cash', L2('À encaisser', 'Horaisina'), ar(N.to_collect), L2('sur les colis à livrer', 'amin\'ny colis haterina'), N.to_collect ? 'sun' : '')}
      ${kpi('hist', L2('Frais des colis en cours', 'Saran\'ny colis mandeha'), ar(N.fees_in_progress), `${N.in_progress} ${L2('colis', 'colis')}`)}
    </div>
    ${N.in_progress ? `<button class="btn primary block lg" style="margin-top:12px" data-act="tab" data-t="colis">${L2('Voir ma tournée', 'Hijery ny fihodinako')} →</button>` : ''}
    <h3 class="cv-sub">${L2("Aujourd'hui", 'Androany')}</h3>
    <div class="sp-kpis cv-kpis">
      ${kpi('box', L2('Récupérés', 'Nalaina'), d.today.picked)}
      ${kpi('check', L2('Livrés', 'Tonga'), d.today.delivered)}
      ${kpi('back', L2('Refusés', 'Nolavina'), d.today.refused)}
      ${kpi('cash', L2('Encaissé', 'Voaray'), ar(d.today.collected))}
    </div>
    <h3 class="cv-sub">${L2('Mes gains (colis)', 'Ny karamako (colis)')}</h3>
    <div class="sp-card cv-gains">
      <div class="cv-gains-row"><div><small>${L2("Aujourd'hui", 'Androany')}</small><b>${ar(d.earnings.today)}</b></div><div><small>${L2('7 jours', '7 andro')}</small><b>${ar(d.earnings.week)}</b></div><div><small>${L2('Ce mois', 'Ity volana')}</small><b>${ar(d.earnings.month)}</b></div></div>
      <div class="cv-bars">${d.last7.map((x) => `<div title="${esc(x.day)} · ${ar(x.earned)} · ${x.delivered} ${L2('livrés', 'tonga')}"><i style="height:${Math.max(4, Math.round((x.earned / max) * 100))}%"></i><span>${esc(wd(x.day))}</span></div>`).join('')}</div>
      <p class="tiny muted" style="margin:8px 0 0">${L2('Votre part sur les frais des colis livrés. Les courses express sont dans « Revenus ».', 'Ny anjaranao amin\'ny saran\'ny colis tonga. Ao amin\'ny « Revenus » ny dia haingana.')}</p>
    </div>
    <div class="sp-card cv-month">
      <div><small>${L2('Ce mois', 'Ity volana')}</small><b>${d.month.delivered}</b><em>${L2('livrés', 'tonga')}</em></div>
      <div><b>${d.month.picked}</b><em>${L2('récupérés', 'nalaina')}</em></div>
      <div><b>${d.month.refused}</b><em>${L2('refusés', 'nolavina')}</em></div>
      <div><b>${d.rating ? `${Number(d.rating).toFixed(1)} ★` : '—'}</b><em>${d.rating_count} ${L2('avis', 'hevitra')}</em></div>
    </div>
    ${d.remitted.last.length ? `<h3 class="cv-sub">${L2('Mes dernières remises au centre', 'Ny vola natolotro farany')}</h3><div class="sp-card" style="padding:6px 16px">${d.remitted.last.map((x) => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--hl)"><span class="small">${dt(x.at)} · ${x.shipments} ${L2('colis', 'colis')}</span><b>${ar(x.amount)}</b></div>`).join('')}</div>` : ''}`;
}

async function loadWallet() {
  const w = await api('GET', '/api/courier/wallet');
  const el = $('[data-wallet]'); if (!el) return;
  const c = w.courier;
  const nums = Object.entries(w.payment_numbers).filter(([, v]) => v);
  el.innerHTML = `<div class="stack">
    <div class="card" style="text-align:center;background:${c.balance < 0 ? 'var(--red-soft)' : 'var(--green-soft)'};border:0">
      <div class="small muted">${t('balance')}</div><div class="big-price" style="color:${c.balance < 0 ? 'var(--red)' : 'var(--green)'}">${ar(c.balance)}</div>
      <div class="tiny muted">${c.balance < 0 ? (state.lang === 'mg' ? 'Komisiona tokony haloa amin\'ny Alefa' : 'Commissions à régler à Alefa') : (state.lang === 'mg' ? 'Vola tokony horaisinao avy amin\'ny Alefa' : 'Montant que Alefa vous doit')}</div>
      ${c.balance < 0 && nums.length ? `<div class="small" style="margin-top:6px">${t('pay_to')} : ${nums.map(([k, v]) => `${t(k)} <b>${esc(v)}</b>`).join(' · ')}</div>` : ''}
    </div>
    <div class="row"><div class="card grow" style="text-align:center"><div class="tiny muted">${t('today')}</div><b>${ar(w.stats.today)}</b><div class="tiny muted">${w.stats.today_count} ${vehIcon(state.courier?.vehicle)}</div></div>
      <div class="card grow" style="text-align:center"><div class="tiny muted">${t('week')}</div><b>${ar(w.stats.week)}</b></div>
      <div class="card grow" style="text-align:center"><div class="tiny muted">${t('total')}</div><b>${ar(w.stats.revenue)}</b><div class="tiny muted">${w.stats.total} ${vehIcon(state.courier?.vehicle)}</div></div></div>
    <div class="small muted">${t('commission')} : <b>${w.commission_mode === 'percent' ? w.commission_percent + ' %' : 'Abonnement'}</b>${w.commission_mode === 'subscription' ? ` · ${t('subscription_until')} <b>${c.subscription_until ? dt(c.subscription_until) : '—'}</b>` : ''} · ${stars(c.rating)} (${c.rating_count})</div>
    <h3>${t('transactions')}</h3>
    <div class="list">${w.transactions.map((x) => `<div class="row between small"><span><b>${esc(x.note || x.kind)}</b><br><span class="muted">${dt(x.at)}</span></span><b style="color:${x.amount < 0 ? 'var(--red)' : 'var(--green)'}">${x.amount > 0 ? '+' : ''}${ar(x.amount)}</b></div>`).join('') || `<p class="muted">${t('empty')}</p>`}</div>
  </div>`;
}

// « Je pars du centre » : où vas-tu ? (par défaut : l'arrivée du créneau en cours). Les colis sur ce chemin te seront proposés.
async function departForm() {
  const mg = state.lang === 'mg';
  const cur = (await api('GET', '/api/courier/schedule').catch(() => ({}))).current;
  let dest = cur?.to_lat != null ? { label: cur.to_addr, lat: cur.to_lat, lng: cur.to_lng } : null, res = [], tmr;
  const m = modal(`🚀 ${mg ? 'Miala amin\'ny centre' : 'Je pars du centre'}`, `<div class="stack">
    <label class="field"><span>🏁 ${mg ? 'Ho aiza ianao?' : 'Où vas-tu ?'}</span><div class="addr"><input class="input" data-dest autocomplete="off" value="${esc(dest?.label || '')}" placeholder="${mg ? 'Ohatra : Ivandry' : 'Ex : Ivandry'}"><div class="suggest hidden" data-sg></div></div></label>
    <p class="tiny muted">${mg ? 'Ho tonga aminao ny colis rehetra eny amin\'ny lalanao. Izay manamarina voalohany no maka.' : 'Les colis à récupérer sur ton chemin te seront proposés ; le premier qui confirme les prend.'}</p>
    <button class="btn primary lg block" data-go>🚀 ${mg ? 'Handeha' : 'Partir'}</button>
    ${toLeaveN ? `<button class="btn block" data-nodest>${mg ? 'Handeha tsy misy toerana' : 'Partir sans destination'} (${toLeaveN} ${c('parcels')})</button>` : ''}</div>`);
  const inp = m.el.querySelector('[data-dest]'), box = m.el.querySelector('[data-sg]');
  inp.addEventListener('input', () => {
    dest = null; clearTimeout(tmr);
    const v = inp.value.trim(); if (v.length < 3) return box.classList.add('hidden');
    tmr = setTimeout(async () => {
      res = await geocode(v + ', Antananarivo').catch(() => []);
      box.innerHTML = res.map((x, i) => `<button data-i="${i}"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') || `<div class="tiny muted" style="padding:8px">${mg ? 'Tsy hita' : 'Introuvable'}</div>`;
      box.classList.remove('hidden');
    }, 400);
  });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; dest = res[+b.dataset.i]; inp.value = dest.label; box.classList.add('hidden'); });
  const go = async (withDest) => {
    if (withDest && !dest) return toast(mg ? 'Safidio ao amin\'ny lisitra ny toerana halehanao' : 'Choisis ta destination dans la liste', 'err');
    let route = null;
    if (withDest && pos) try { route = (await bikeRoute(pos, [dest.lat, dest.lng], state.courier?.vehicle)).coords; } catch {}
    try {
      const r = await api('POST', '/api/courier/depart', withDest ? { to: { address: dest.label, lat: dest.lat, lng: dest.lng }, route, lat: pos?.[0], lng: pos?.[1] } : {});
      m.close();
      toast(`🚀 ${r.shipments ? `${r.shipments} ${c('parcels')} · ` : ''}${r.offers ? `${r.offers} ${mg ? 'colis eny an-dalana' : 'colis sur ton chemin'}` : (mg ? 'Mandeha soa!' : 'Bonne route !')}`, 'ok');
      await sendPos(); loadMissions();
    } catch (e) { toastErr(e); }
  };
  m.el.querySelector('[data-go]').onclick = () => go(true);
  m.el.querySelector('[data-nodest]')?.addEventListener('click', () => go(false));
}

async function loadMissions() {
  const [{ shipments }, st, rn, db] = await Promise.all([api('GET', '/api/shipments'), api('GET', '/api/courier/stats').catch(() => null), api('GET', '/api/courier/run').catch(() => ({ run: null, offers: [] })), api('GET', '/api/courier/dashboard').catch(() => null)]);
  const el = $('[data-colis]'); if (!el) return;
  const me = state.user?.id, mg = state.lang === 'mg';
  const mine = (x) => x.courier?.id === me;
  // « Ma tournée du jour » : toutes les actions à faire, dans l'ordre du trajet (le plus proche d'abord), avec un gros bouton.
  const todo = shipments.map((x) => {
    if (x.status === 'assigned' && (x.accepted_at || ['departed', 'at_pickup'].includes(x.step)) && mine(x)) return { x, act: 'pickup', at: x.sender.lat != null ? [x.sender.lat, x.sender.lng] : null, label: mg ? '📦 Nalaiko' : '📦 Récupéré' };
    if (x.step === 'to_centre' && mine(x)) return { x, act: 'centre_in', at: null, label: mg ? '🏢 Napetrako tao amin\'ny centre' : '🏢 Déposé au centre' };
    if (x.step === 'at_centre' && x.delivery_courier?.id === me) return { x, act: 'centre_out', at: null, label: mg ? '📦 Noraisiko tao amin\'ny centre' : '📦 Pris au centre' };
    if (x.status === 'picked_up' && !['to_centre', 'at_centre'].includes(x.step) && mine(x) && !x.courier_confirmed_at) return { x, act: 'deliver', at: x.recipient.lat != null ? [x.recipient.lat, x.recipient.lng] : null, label: x.province ? (mg ? '🚌 Natolotra ny koperativa' : '🚌 Remis à la coopérative') : (mg ? '✅ Natolotra' : '✅ Livré') };
    return null;
  }).filter(Boolean);
  const ordered = [];
  let cur = pos ? [pos[0], pos[1]] : null;
  const pool = [...todo];
  while (pool.length) {
    let bi = 0;
    if (cur) { let bd = Infinity; pool.forEach((t, i) => { const d = t.at ? Math.hypot(t.at[0] - cur[0], t.at[1] - cur[1]) : 1; if (d < bd) { bd = d; bi = i; } }); }
    const [t] = pool.splice(bi, 1); ordered.push(t); if (t.at) cur = t.at;
  }
  const tourBox = ordered.length ? `<h3>🗺 ${mg ? 'Ny fihodinako anio' : 'Ma tournée du jour'} (${ordered.length})</h3><div class="list">${ordered.map((t, i) => shipCard(t.x,
    `<div class="row" style="gap:8px;margin-top:8px"><span class="pill">${i + 1}</span><button class="btn primary lg grow" data-act="next" data-id="${t.x.id}">${t.label}</button></div>`)).join('')}</div>` : '';
  const grp = [
    [mg ? '🔔 Iraka vaovao hekena' : '🔔 Nouvelles missions à accepter', shipments.filter((x) => x.status === 'assigned' && !x.accepted_at && !['departed', 'at_pickup'].includes(x.step) && mine(x))],
    [mg ? '⏳ Miandry ny fanamarinan\'ny mpandray' : '⏳ En attente de confirmation du destinataire', shipments.filter((x) => x.status === 'picked_up' && mine(x) && x.courier_confirmed_at)],
    [mg ? '⏳ Ho avy amin\'ny centre (relais)' : '⏳ Arrivera au centre (relais)', shipments.filter((x) => x.relay && ['assigned', 'picked_up'].includes(x.status) && x.step !== 'at_centre' && x.delivery_courier?.id === me && !mine(x))],
    [c('to_return'), shipments.filter((x) => x.to_return)],
    [c('done_today'), shipments.filter((x) => ['delivered', 'refused', 'cancelled'].includes(x.status) && !x.to_return)],
  ];
  // à remettre au centre = argent encaissé (tous jours non encore remis) − ma part ; même calcul que l'administration
  const cash = db ? db.cash.to_remit : shipments.filter((x) => ['delivered', 'refused'].includes(x.status)).reduce((a, x) => a + (x.collected || 0), 0);
  const toLeave = shipments.filter((x) => x.step === 'scheduled' && mine(x)).length;
  const stats = st?.today ? `<div class="row" style="gap:8px;margin-bottom:10px">${[[mg ? 'Nalaina' : 'Récupérés', st.today.picked + st.today.from_centre], [mg ? 'Natolotra' : 'Livrés', st.today.delivered], [mg ? 'Mandeha' : 'En cours', st.today.open]].map(([k, v]) => `<div class="card grow" style="text-align:center;padding:8px"><div style="font-size:1.3rem;font-weight:850">${v}</div><div class="tiny muted">${k} ${mg ? 'androany' : "aujourd'hui"}</div></div>`).join('')}</div>` : '';
  myRun = rn.run; toLeaveN = toLeave;
  const runBox = rn.run
    ? `<div class="card" style="margin-bottom:10px;background:var(--green-soft);border:0"><div class="row between"><span>🚀 <b>${mg ? 'Mandeha' : 'En tournée'}</b> → ${esc(rn.run.to || '')}<div class="tiny muted">${mg ? 'nanomboka' : 'depuis'} ${time(rn.run.started_at)} · ${mg ? 'ho tonga aminao ny colis eny an-dalana' : 'les colis sur ton chemin te sont proposés'}</div></div>
        <button class="btn sm" data-act="endrun">🏁 ${mg ? 'Vita' : 'Fin'}</button></div></div>`
    : `<button class="btn sun lg block" data-act="depart" style="margin-bottom:10px">🚀 ${mg ? 'Miala amin\'ny centre' : 'Je pars du centre'}${toLeave ? ` (${toLeave} ${c('parcels')})` : ''}</button>`;
  const offerCard = (o) => `<div class="card" data-ref="${esc(o.ref)}" style="${o.status === 'lost' ? 'opacity:.55' : 'border:2px solid var(--sun)'}">
      <div class="row between"><span class="small muted">${time(o.at)}</span><span>${o.province ? `🚌 ${esc(o.province.city)} ` : ''}${o.value_paid ? '📱 ' : ''}<b>${ar(o.amount_to_collect)}</b></span></div>
      <div class="small" style="line-height:1.45">🟢 ${esc(o.pickup.address)}<br>🟠 ${esc(o.drop.address)}</div>
      <div class="tiny muted">🔒 ${mg ? 'Anarana sy laharana hita rehefa noraisinao' : 'Noms et téléphones visibles une fois le colis pris'}</div>
      ${o.contents || o.size ? `<div class="tiny muted">📦 ${esc([o.contents, o.size].filter(Boolean).join(' · '))}</div>` : ''}
      ${o.status === 'lost' ? `<div class="small" style="color:var(--red)">❌ ${mg ? 'Efa nisy naka' : 'Déjà pris'}${o.taken_by ? ` (${esc(o.taken_by)})` : ''}</div>`
        : `<div class="row" style="margin-top:6px"><button class="btn primary grow" data-act="take" data-id="${o.id}">✋ ${mg ? 'Raisiko' : 'Je le prends'}</button><button class="btn" data-act="skip" data-id="${o.id}">✕</button></div>`}</div>`;
  const offersBox = rn.offers.length ? `<h3>📦 ${mg ? 'Colis eny an-dalanao' : 'Colis sur ton chemin'} (${rn.offers.filter((o) => o.status === 'open').length})</h3>
    <p class="tiny muted">${mg ? 'Izay manamarina voalohany no maka azy.' : 'Le premier qui confirme le prend.'}</p><div class="list">${rn.offers.map(offerCard).join('')}</div>` : '';
  el.innerHTML = stats + runBox + offersBox + tourBox + (cash ? `<div class="card" style="background:var(--sun-soft);border:0;margin-bottom:10px">💵 ${state.lang === 'mg' ? 'Vola atolotra ny centre (efa nesorina ny anjaranao)' : 'À remettre au centre (votre part déjà déduite)'} : <b>${ar(cash)}</b></div>` : '')
    + grp.filter(([, l]) => l.length).map(([title, l]) => `<h3>${esc(title)} (${l.length})</h3><div class="list">${l.map((x) => shipCard(x)).join('')}</div>`).join('')
    || `<p class="muted" style="text-align:center;padding:16px">${c('empty')}</p>`;
  // repères sur la carte (+ colis proposés et chemin de la tournée)
  for (const k of Object.keys(mk)) if (k.startsWith('s') || k.startsWith('o')) { mk[k].remove(); delete mk[k]; }
  for (const o of rn.offers) if (o.status === 'open' && o.pickup.lat != null) upsertMarker(map, mk, 'o' + o.id, [o.pickup.lat, o.pickup.lng], icons.a());
  runLayer?.remove?.(); runLayer = null;
  if (rn.run?.route?.length > 1 && window.L && map) runLayer = L.polyline(rn.run.route, { color: '#f5a524', weight: 5, opacity: .7, dashArray: '8 8' }).addTo(map);
  for (const x of shipments) {
    if (x.status === 'assigned' && x.sender.lat != null) upsertMarker(map, mk, 's' + x.id, [x.sender.lat, x.sender.lng], icons.a())?.on('click', () => openShip(x.id));
    if (x.status === 'picked_up' && mine(x) && !['to_centre', 'at_centre'].includes(x.step) && x.recipient.lat != null) upsertMarker(map, mk, 's' + x.id, [x.recipient.lat, x.recipient.lng], icons.b())?.on('click', () => openShip(x.id));
  }
}
const openShip = (id) => shipDetail(id, { role: 'courier', onChange: () => { lastSig = ''; render(); } });

async function loadHistory() {
  const list = (await api('GET', '/api/deliveries')).deliveries;
  const el = $('[data-hist]'); if (!el) return;
  el.innerHTML = list.map((d) => `<div class="card"><div class="row between"><span class="small muted">#${d.id} · ${dt(d.created_at)}</span>${statusPill(d.status)}</div>
    <div class="small ellipsis" style="margin-top:6px">${esc(d.pickup_addr || '—')} → ${esc(d.drop_addr || '—')}</div>
    <div class="row between small" style="margin-top:4px"><span class="muted">${esc(d.client_name)} · ${t(d.payment_method)}${d.rating ? ` · <span class="stars">${'★'.repeat(d.rating)}</span>` : ''}</span><b>${ar(d.final_price)}</b></div></div>`).join('') || `<p class="muted">${t('empty')}</p>`;
}

// ---------------------------------------------------------------- actions
const actions = {
  menu: () => {
    const back = document.createElement('div');
    back.className = 'sp-sheet-back';
    back.innerHTML = `<div class="sp-sheet">${[['plan', 'cal', c('my_schedule')], ['wallet', 'cash', t('wallet')], ['hist', 'hist', t('history')], ['support', 'chat', L2('Service client', 'Sampana mpanjifa')], ['notifs', 'bell', 'Notifications'], ['profile', 'user', L2('Profil et langue', 'Mombamomba sy fiteny')]]
      .map(([k, i, l]) => `<button data-k="${k}">${ic(i)}<span>${l}</span></button>`).join('')}<button data-k="out" class="danger">${ic('out')}<span>${L2('Déconnexion', 'Hivoaka')}</span></button></div>`;
    back.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]')?.dataset.k; back.remove();
      if (['plan', 'wallet', 'hist'].includes(k)) { tab = k; lastSig = ''; render(); } else if (k === 'out') logout(); else if (k) actions[k]();
    });
    document.body.append(back);
  },
  out: () => logout(),
  notifs: () => showNotifications(),
  support: () => supportChat(),
  profile: () => profileForm(),
  reload: () => location.reload(),
  center: () => pos && map?.setView(pos, 16),
  sos: () => sendSOS(active?.id),
  tab: (el) => { tab = el.dataset.t; lastSig = ''; render(); },
  open: (el) => openRequest(+el.dataset.id),
  ship: (el) => openShip(+el.dataset.id),
  next: (el) => nextAction(+el.dataset.id, () => { lastSig = ''; render(); }),
  depart: () => { if (!pos) return toast(t('gps_off_title'), 'err'); departForm(); },
  endrun: async () => { await api('POST', '/api/courier/run/end', {}); toast(state.lang === 'mg' ? '🏁 Vita ny fihodinana' : '🏁 Tournée terminée', 'ok'); loadMissions(); },
  take: async (el) => {
    try { const r = await api('POST', `/api/courier/offers/${el.dataset.id}/take`, {}); toast(`✅ ${r.shipment.ref} — ${state.lang === 'mg' ? 'anao io colis io' : 'colis à toi'}`, 'ok'); }
    catch (e) { toastErr(e); }
    loadMissions();
  },
  skip: async (el) => { await api('POST', `/api/courier/offers/${el.dataset.id}/decline`, {}); loadMissions(); },
  toggle: async () => {
    if (!available && (!pos || Date.now() - lastFix > 60e3)) { showGate(pos ? 'lost' : 'off'); return toast(t('gps_off_title'), 'err'); }
    const r = await api('POST', '/api/courier/availability', { available: !available });
    available = r.available;
    if (available) { await sendPos(); keepAwake(); loadRequests(); }
    else { requests = []; for (const k of Object.keys(mk)) if (k.startsWith('r')) { mk[k].remove(); delete mk[k]; } wakeLock?.release?.(); }
    lastSig = ''; render();
  },
  pickup: async () => {
    if (!(await confirmBox(`${t('picked')} ?`, 'OK'))) return;
    await api('POST', `/api/deliveries/${active.id}/pickup`, {}); lastRouteKey = ''; refreshActive();
  },
  deliver: async () => {
    const pin = $('[data-pin]').value.trim();
    if (!/^\d{4}$/.test(pin)) return toast(t('enter_pin'), 'err');
    const r = await api('POST', `/api/deliveries/${active.id}/deliver`, { pin });
    activeTimer?.stop(); active = null; clearRoute();
    modal('🎉', `<div style="text-align:center"><h2>${t('st_delivered')} !</h2><div class="big-price">${ar(r.price)}</div>
      <p class="muted">${r.payment_method === 'cash' ? (state.lang === 'mg' ? 'Raiso ny vola an-tanana.' : 'Encaissez le montant en espèces.') : t(r.payment_method)}${r.commission ? ` · ${t('commission')} ${ar(r.commission)}` : ''}</p></div>`);
    lastSig = ''; render(); loadRequests();
  },
  send: async () => { const inp = $('[data-chat-input]'); const v = inp.value.trim(); if (!v) return; inp.value = ''; await api('POST', `/api/deliveries/${active.id}/messages`, { body: v }); refreshActive(); },
  complaint: () => complaintForm(active?.id),
  abandon: async () => {
    const reason = await promptBox(t('abandon'), { label: t('reason') });
    if (reason === null) return;
    await api('POST', `/api/deliveries/${active.id}/cancel`, { reason });
    activeTimer?.stop(); active = null; clearRoute(); lastSig = ''; render(); loadRequests();
  },
};
