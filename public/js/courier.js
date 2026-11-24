// Application Livreur (vélo) : disponibilité, partage GPS, demandes proches, négociation, livraison avec PIN, revenus.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, bikeRoute, etaMin, vehIcon, getPosition, hm, every, geocode, startNotifications, showNotifications, setNotifOpener, supportChat, profileForm,
  sendSOS, complaintForm, chatHtml, haversine, beep,
} from './core.js';
import { c, shipCard, shipDetail, courierScheduleEditor, courierTripsEditor, scheduleHtml, stepLabel } from './colis.js';

let root, map, sheet, watchId = null, pos = null, posTimer, reqTimer, activeTimer, wakeLock = null, myRun = null, runLayer = null, toLeaveN = 0;
const mk = {};
let axeLayer = null, axe = null, routeLayer = null, tab = 'colis', shipTimer = null, requests = [], active = null, available = false, lastSig = '', selected = null, lastRouteKey = '';

export async function mount(el) {
  root = el;
  available = !!state.courier?.available;
  root.innerHTML = `<div class="mapapp">
    <div class="map" id="map"></div>
    <div class="topbar">
      <div class="brand-pill"><img src="/icon.svg" alt=""><span>Alefa <span class="muted small">${t('courier')}</span></span></div>
      <div class="grow"></div>
      <button class="icon-btn" data-act="support" title="Service client">💬</button>
      <button class="icon-btn" data-act="notifs">🔔<span class="badge-dot hidden" data-unread></span></button>
      <button class="icon-btn" data-act="profile">👤</button>
    </div>
    <div class="sheet" id="sheet"><div class="grip" data-act="grip"></div><div class="sheet-body" id="sheet-body"></div></div>
    <div class="fab-col"><button class="icon-btn" data-act="center">◎</button><button class="icon-btn sos-btn" data-act="sos">SOS</button></div>
  </div>`;
  sheet = $('#sheet');
  map = makeMap($('#map'), { zoom: 15 });
  bind(root, actions);
  if (state.user.status !== 'active') return renderPending();
  // clic sur une notification : le colis concerné, la course express, ou le planning
  setNotifOpener((tg) => {
    if (tg.type === 'shipment') { if (tab !== 'colis') { tab = 'colis'; lastSig = ''; render(); } return openShip(tg.id); }
    if (tg.type === 'plan') { tab = 'plan'; lastSig = ''; return render(); }
    if (tg.type === 'support') return supportChat();
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
  if (!g) { g = document.createElement('div'); g.id = 'gps-gate'; g.className = 'gps-gate'; root.querySelector('.mapapp').append(g); }
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
    <div class="tabs" style="margin-top:10px"><button data-act="tab" data-t="colis" class="${tab === 'colis' ? 'on' : ''}">📦 ${c('colis')}</button><button data-act="tab" data-t="plan" class="${tab === 'plan' ? 'on' : ''}">🕘 ${c('my_schedule')}</button><button data-act="tab" data-t="req" class="${tab === 'req' ? 'on' : ''}">Express${requests.length ? ` (${requests.length})` : ''}</button><button data-act="tab" data-t="wallet" class="${tab === 'wallet' ? 'on' : ''}">${t('wallet')}</button><button data-act="tab" data-t="hist" class="${tab === 'hist' ? 'on' : ''}">${t('history')}</button></div>`;
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
  if (active) return renderActive();
  sheet.classList.remove('collapsed');
  const body = $('#sheet-body');
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
  routeLayer = L.layerGroup([L.polyline(r.coords, { color: '#0b6e4f', weight: 9, opacity: .18 }), L.polyline(r.coords, { color: '#0b6e4f', weight: 4.5, dashArray: r.approx ? '8 8' : null })]).addTo(map);
  if (fit) map.fitBounds(L.latLngBounds(r.coords).pad(.3), { paddingBottomRight: [0, window.innerWidth < 900 ? 280 : 0], paddingTopLeft: [window.innerWidth >= 900 ? 430 : 0, 60] });
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
      box.innerHTML = res.map((x, i) => `<button data-i="${i}">${esc(x.label)}</button>`).join('') || `<div class="tiny muted" style="padding:8px">${mg ? 'Tsy hita' : 'Introuvable'}</div>`;
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
  const [{ shipments }, st, rn] = await Promise.all([api('GET', '/api/shipments'), api('GET', '/api/courier/stats').catch(() => null), api('GET', '/api/courier/run').catch(() => ({ run: null, offers: [] }))]);
  const el = $('[data-colis]'); if (!el) return;
  const me = state.user?.id, mg = state.lang === 'mg';
  const mine = (x) => x.courier?.id === me;
  const grp = [
    [mg ? '🔔 Iraka vaovao hekena' : '🔔 Nouvelles missions à accepter', shipments.filter((x) => x.status === 'assigned' && !x.accepted_at && mine(x))],
    [c('to_pickup'), shipments.filter((x) => x.status === 'assigned' && x.accepted_at && mine(x))],
    [mg ? '🏢 Hapetraka ao amin\'ny centre' : '🏢 À déposer au centre', shipments.filter((x) => x.step === 'to_centre' && mine(x))],
    [mg ? '📦 Halaina ao amin\'ny centre' : '📦 À prendre au centre', shipments.filter((x) => x.step === 'at_centre' && x.delivery_courier?.id === me)],
    [c('to_deliver'), shipments.filter((x) => x.status === 'picked_up' && !['to_centre', 'at_centre'].includes(x.step) && mine(x))],
    [mg ? '⏳ Ho avy amin\'ny centre (relais)' : '⏳ Arrivera au centre (relais)', shipments.filter((x) => x.relay && ['assigned', 'picked_up'].includes(x.status) && x.step !== 'at_centre' && x.delivery_courier?.id === me && !mine(x))],
    [c('to_return'), shipments.filter((x) => x.to_return)],
    [c('done_today'), shipments.filter((x) => ['delivered', 'refused', 'cancelled'].includes(x.status) && !x.to_return)],
  ];
  const cash = shipments.filter((x) => ['delivered', 'refused'].includes(x.status)).reduce((a, x) => a + (x.collected || 0), 0);
  const toLeave = shipments.filter((x) => x.step === 'scheduled' && mine(x)).length;
  const stats = st?.today ? `<div class="row" style="gap:8px;margin-bottom:10px">${[[mg ? 'Nalaina' : 'Récupérés', st.today.picked + st.today.from_centre], [mg ? 'Natolotra' : 'Livrés', st.today.delivered], [mg ? 'Mandeha' : 'En cours', st.today.open]].map(([k, v]) => `<div class="card grow" style="text-align:center;padding:8px"><div style="font-size:1.3rem;font-weight:850">${v}</div><div class="tiny muted">${k} ${mg ? 'androany' : "aujourd'hui"}</div></div>`).join('')}</div>` : '';
  myRun = rn.run; toLeaveN = toLeave;
  const runBox = rn.run
    ? `<div class="card" style="margin-bottom:10px;background:var(--green-soft);border:0"><div class="row between"><span>🚀 <b>${mg ? 'Mandeha' : 'En tournée'}</b> → ${esc(rn.run.to || '')}<div class="tiny muted">${mg ? 'nanomboka' : 'depuis'} ${time(rn.run.started_at)} · ${mg ? 'ho tonga aminao ny colis eny an-dalana' : 'les colis sur ton chemin te sont proposés'}</div></div>
        <button class="btn sm" data-act="endrun">🏁 ${mg ? 'Vita' : 'Fin'}</button></div></div>`
    : `<button class="btn sun lg block" data-act="depart" style="margin-bottom:10px">🚀 ${mg ? 'Miala amin\'ny centre' : 'Je pars du centre'}${toLeave ? ` (${toLeave} ${c('parcels')})` : ''}</button>`;
  const offerCard = (o) => `<div class="card" style="${o.status === 'lost' ? 'opacity:.55' : 'border:2px solid var(--sun)'}">
      <div class="row between"><b>${esc(o.ref)}</b><span>${o.province ? `🚌 ${esc(o.province.city)} ` : ''}${o.value_paid ? '📱 ' : ''}<b>${ar(o.amount_to_collect)}</b></span></div>
      <div class="small">🟢 ${esc(o.pickup.address)}<br>🟠 ${esc(o.drop.address)}</div>
      ${o.contents || o.size ? `<div class="tiny muted">📦 ${esc([o.contents, o.size].filter(Boolean).join(' · '))}</div>` : ''}
      ${o.status === 'lost' ? `<div class="small" style="color:var(--red)">❌ ${mg ? 'Efa nisy naka' : 'Déjà pris'}${o.taken_by ? ` (${esc(o.taken_by)})` : ''}</div>`
        : `<div class="row" style="margin-top:6px"><button class="btn primary grow" data-act="take" data-id="${o.id}">✋ ${mg ? 'Raisiko' : 'Je le prends'}</button><button class="btn" data-act="skip" data-id="${o.id}">✕</button></div>`}</div>`;
  const offersBox = rn.offers.length ? `<h3>📦 ${mg ? 'Colis eny an-dalanao' : 'Colis sur ton chemin'} (${rn.offers.filter((o) => o.status === 'open').length})</h3>
    <p class="tiny muted">${mg ? 'Izay manamarina voalohany no maka azy.' : 'Le premier qui confirme le prend.'}</p><div class="list">${rn.offers.map(offerCard).join('')}</div>` : '';
  el.innerHTML = stats + runBox + offersBox + (cash ? `<div class="card" style="background:var(--sun-soft);border:0;margin-bottom:10px">💵 ${state.lang === 'mg' ? 'Vola eny aminao (atolotra ny centre)' : 'Argent en main (à remettre au centre)'} : <b>${ar(cash)}</b></div>` : '')
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
  grip: () => sheet.classList.toggle('collapsed'),
  notifs: () => showNotifications(),
  support: () => supportChat(),
  profile: () => profileForm(),
  reload: () => location.reload(),
  center: () => pos && map?.setView(pos, 16),
  sos: () => sendSOS(active?.id),
  tab: (el) => { tab = el.dataset.t; lastSig = ''; render(); },
  open: (el) => openRequest(+el.dataset.id),
  ship: (el) => openShip(+el.dataset.id),
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
