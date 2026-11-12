// Application Livreur (vélo) : disponibilité, partage GPS, demandes proches, négociation, livraison avec PIN, revenus.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, bikeRoute, etaMin, getPosition, every, startNotifications, showNotifications, profileForm,
  sendSOS, complaintForm, chatHtml, haversine, beep,
} from './core.js';

let root, map, sheet, watchId = null, pos = null, posTimer, reqTimer, activeTimer, wakeLock = null;
const mk = {};
let routeLayer = null, tab = 'req', requests = [], active = null, available = false, lastSig = '', selected = null, lastRouteKey = '';

export async function mount(el) {
  root = el;
  available = !!state.courier?.available;
  root.innerHTML = `<div class="mapapp">
    <div class="map" id="map"></div>
    <div class="topbar">
      <div class="brand-pill"><img src="/icon.svg" alt=""><span>Alefa <span class="muted small">${t('courier')}</span></span></div>
      <div class="grow"></div>
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
  startNotifications((fresh) => {
    if (fresh.some((n) => n.kind === 'offer_accepted')) checkActive();
    if (fresh.some((n) => ['new_request', 'price_raised'].includes(n.kind))) loadRequests();
  });
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
function startGps() {
  if (!navigator.geolocation) return toast(t('gps_denied'), 'err');
  watchId = navigator.geolocation.watchPosition((p) => {
    const first = !pos;
    pos = [p.coords.latitude, p.coords.longitude];
    upsertMarker(map, mk, 'me', pos, icons.bike(active ? 'busy' : ''), { zIndexOffset: 1000, refreshIcon: true });
    if (first) { map?.setView(pos, 15); sendPos(); if (available) loadRequests(); }
  }, () => toast(t('gps_denied'), 'err'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  // Partage de la position toutes les 5 s quand le livreur est en service.
  posTimer = every(5000, sendPos, false);
}
async function sendPos() {
  if (!pos || (!available && !active)) return;
  const r = await api('POST', '/api/courier/location', { lat: pos[0], lng: pos[1] });
  if (r.active_delivery && !active) checkActive();
}
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && (available || active)) keepAwake(); });

// ---------------------------------------------------------------- demandes
async function loadRequests() {
  if (!available || active) return;
  const qs = pos ? `?lat=${pos[0]}&lng=${pos[1]}` : '';
  const r = await api('GET', '/api/courier/requests' + qs);
  if (r.active_delivery && !active) return checkActive();
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

function header() {
  return `<button class="switch ${available ? 'on' : 'off'}" data-act="toggle"><span class="knob"></span><span class="grow" style="text-align:left">${available ? t('available') : t('unavailable')}</span><span class="small">${available ? '🟢 GPS' : ''}</span></button>
    <div class="tabs" style="margin-top:10px"><button data-act="tab" data-t="req" class="${tab === 'req' ? 'on' : ''}">${t('requests')}${requests.length ? ` (${requests.length})` : ''}</button><button data-act="tab" data-t="wallet" class="${tab === 'wallet' ? 'on' : ''}">${t('wallet')}</button><button data-act="tab" data-t="hist" class="${tab === 'hist' ? 'on' : ''}">${t('history')}</button></div>`;
}

function reqCard(q) {
  const mine = q.my_status === 'pending';
  return `<div class="card ${mine ? 'hl' : ''}" data-act="open" data-id="${q.id}" style="cursor:pointer">
    <div class="row between"><span class="small muted">${t(q.type)} · ${esc(q.client_name.split(' ')[0])}${q.scheduled_at ? ` · 🗓 ${dt(q.scheduled_at)}` : ''}</span><span class="price">${q.proposed_price.toLocaleString('fr-FR')} <small>Ar</small></span></div>
    <div class="route-line" style="margin:6px 0"><span class="dot"></span><span class="small ellipsis">${esc(q.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(q.drop_addr || '—')}</span></div>
    <div class="row between small"><span class="muted">📍 ${km(q.to_pickup_km)} ${t('to_pickup')} · 🚲 ${km(q.distance_km)}</span><span>${t(q.payment_method)}</span></div>
    ${mine ? `<div class="small" style="margin-top:6px;color:var(--green);font-weight:700">${t('my_offer')} : ${ar(q.my_price)} — ${t('waiting_client')}</div>` : ''}
  </div>`;
}

function render() {
  if (active) return renderActive();
  sheet.classList.remove('collapsed');
  const body = $('#sheet-body');
  if (tab === 'wallet') { body.innerHTML = header() + '<div data-wallet>…</div>'; return loadWallet(); }
  if (tab === 'hist') { body.innerHTML = header() + '<div data-hist class="list">…</div>'; return loadHistory(); }
  body.innerHTML = header() + (available
    ? `<div class="list">${requests.map(reqCard).join('') || `<div style="text-align:center;padding:16px"><div class="radar" style="margin:10px auto 16px"></div><p class="muted">${t('no_requests')}</p></div>`}</div>`
    : `<div style="text-align:center;padding:16px 8px"><div style="font-size:46px">🚲</div><p class="muted">${t('go_online')}</p></div>`);
}

async function openRequest(id) {
  const q = requests.find((x) => x.id === id);
  if (!q) return;
  selected = q;
  const r = await bikeRoute([q.pickup_lat, q.pickup_lng], [q.drop_lat, q.drop_lng]);
  drawRoute(r, true);
  upsertMarker(map, mk, 'A', [q.pickup_lat, q.pickup_lng], icons.a());
  upsertMarker(map, mk, 'B', [q.drop_lat, q.drop_lng], icons.b());
  const m = modal(`${t(q.type)} · ${ar(q.proposed_price)}`, `<div class="stack">
    <div class="card"><div class="route-line"><span class="dot"></span><span class="small">${esc(q.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small">${esc(q.drop_addr || '—')}</span></div></div>
    ${q.description ? `<div class="small">📝 ${esc(q.description)}</div>` : ''}
    <div class="row between small"><span class="muted">📍 ${km(q.to_pickup_km)} ${t('to_pickup')}</span><span class="muted">🚲 ${km(r.km)} · ~${r.min || etaMin(r.km)} ${t('min')}</span></div>
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
    const r = await bikeRoute(from, target);
    drawRoute(r, first);
    active._km = r.km; active._eta = r.min || etaMin(r.km);
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
      <div class="small muted">🚲 ${km(d._km)} · ~${d._eta || '…'} ${t('min')}</div>
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
    <div class="row"><div class="card grow" style="text-align:center"><div class="tiny muted">${t('today')}</div><b>${ar(w.stats.today)}</b><div class="tiny muted">${w.stats.today_count} 🚲</div></div>
      <div class="card grow" style="text-align:center"><div class="tiny muted">${t('week')}</div><b>${ar(w.stats.week)}</b></div>
      <div class="card grow" style="text-align:center"><div class="tiny muted">${t('total')}</div><b>${ar(w.stats.revenue)}</b><div class="tiny muted">${w.stats.total} 🚲</div></div></div>
    <div class="small muted">${t('commission')} : <b>${w.commission_mode === 'percent' ? w.commission_percent + ' %' : 'Abonnement'}</b>${w.commission_mode === 'subscription' ? ` · ${t('subscription_until')} <b>${c.subscription_until ? dt(c.subscription_until) : '—'}</b>` : ''} · ${stars(c.rating)} (${c.rating_count})</div>
    <h3>${t('transactions')}</h3>
    <div class="list">${w.transactions.map((x) => `<div class="row between small"><span><b>${esc(x.note || x.kind)}</b><br><span class="muted">${dt(x.at)}</span></span><b style="color:${x.amount < 0 ? 'var(--red)' : 'var(--green)'}">${x.amount > 0 ? '+' : ''}${ar(x.amount)}</b></div>`).join('') || `<p class="muted">${t('empty')}</p>`}</div>
  </div>`;
}

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
  profile: () => profileForm(),
  reload: () => location.reload(),
  center: () => pos && map?.setView(pos, 16),
  sos: () => sendSOS(active?.id),
  tab: (el) => { tab = el.dataset.t; lastSig = ''; render(); },
  open: (el) => openRequest(+el.dataset.id),
  toggle: async () => {
    if (!available && !pos) { try { const p = await getPosition(); pos = [p[0], p[1]]; } catch (e) { return toastErr(e); } }
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
