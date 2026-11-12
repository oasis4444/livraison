// Application Client : demande, négociation, suivi GPS en direct, paiement, évaluation.
import {
  state, t, api, esc, $, $$, bind, toast, toastErr, modal, confirmBox, promptBox, ar, km, dt, time, initials, stars, statusPill, phoneFmt,
  makeMap, icons, upsertMarker, pruneMarkers, bikeRoute, etaMin, geocode, reverse, getPosition, every, startNotifications, showNotifications,
  profileForm, sendSOS, complaintForm, chatHtml, TANA,
} from './core.js';

let root, map, sheet, poller, nearbyTimer;
const mk = {};
let routeLayer = null;
const form = { a: null, b: null, type: 'colis', price: null, priceTouched: false, quote: null, payment: 'cash', schedule: false, scheduled_at: '', promo: '', desc: '', rname: '', rphone: '' };
let picking = null, me = null, tab = 'home', current = null, lastSig = '', lastMsgId = 0, lastRouteFrom = null, favorites = [];

export async function mount(el) {
  root = el;
  root.innerHTML = `<div class="mapapp">
    <div class="map" id="map"></div>
    <div class="topbar">
      <div class="brand-pill"><img src="/icon.svg" alt=""><span>Alefa</span></div>
      <div class="grow"></div>
      <button class="icon-btn" data-act="notifs" aria-label="${t('notifications')}">🔔<span class="badge-dot hidden" data-unread></span></button>
      <button class="icon-btn" data-act="profile" aria-label="${t('profile')}">👤</button>
    </div>
    <div class="pick-banner hidden" id="pick-banner"></div>
    <div class="center-pin hidden" id="center-pin">📍</div>
    <div class="sheet" id="sheet"><div class="grip" data-act="grip"></div><div class="sheet-body" id="sheet-body"></div></div>
    <div class="fab-col">
      <button class="icon-btn" data-act="locate" aria-label="${t('my_position')}">◎</button>
      <button class="icon-btn sos-btn" data-act="sos">SOS</button>
    </div>
  </div>`;
  sheet = $('#sheet');
  map = makeMap($('#map'));
  bind(root, actions);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  startNotifications((fresh) => { if (current && fresh.some((n) => n.delivery_id === current.id)) refreshCurrent(); });
  locate(true);
  favorites = (await api('GET', '/api/favorites').catch(() => ({ favorites: [] }))).favorites;
  const list = (await api('GET', '/api/deliveries')).deliveries;
  const active = list.find((d) => ['open', 'assigned', 'picked_up'].includes(d.status))
    || list.find((d) => d.status === 'delivered' && !d.rating && Date.now() - d.delivered_at < 3 * 3600e3);
  if (active) track(active.id); else renderHome();
  nearbyTimer = every(5000, showNearby);
}

// ---------------------------------------------------------------- position & livreurs proches
async function locate(silent) {
  try {
    const [lat, lng] = await getPosition();
    me = [lat, lng];
    upsertMarker(map, mk, 'me', me, icons.me(), { zIndexOffset: 1000, interactive: false });
    if (!current) map?.setView(me, 15);
    if (!form.a && !current) { form.a = { lat, lng, label: t('my_position') }; renderHome(); reverse(lat, lng).then((l) => { if (form.a && form.a.label === t('my_position')) { form.a.label = l; if (!current && tab === 'home') renderHome(); } }); }
  } catch (e) { if (!silent) toastErr(e); }
}

async function showNearby() {
  if (current && current.status !== 'open') return;
  const c = form.a || (me && { lat: me[0], lng: me[1] }) || { lat: TANA[0], lng: TANA[1] };
  const r = await api('GET', `/api/couriers/nearby?lat=${c.lat}&lng=${c.lng}`);
  const keep = new Set();
  r.couriers.forEach((p) => {
    keep.add('n' + p.id);
    upsertMarker(map, mk, 'n' + p.id, [p.lat, p.lng], icons.bike())?.bindTooltip(`🚲 ${esc(p.name)} · ${km(p.distance_km)}${p.rating ? ` · ★ ${p.rating}` : ''}`);
  });
  for (const k of Object.keys(mk)) if (k.startsWith('n') && !keep.has(k)) { mk[k].remove(); delete mk[k]; }
  const el = $('[data-near]'); if (el) el.textContent = `🚲 ${r.couriers.length} ${t('couriers_near')}`;
}
function clearNearby() { for (const k of Object.keys(mk)) if (k.startsWith('n')) { mk[k].remove(); delete mk[k]; } }

// ---------------------------------------------------------------- écran d'accueil / formulaire
function addrField(which) {
  const p = form[which];
  return `<div class="addr" data-addr="${which}">
    <span class="ic ${which === 'b' ? 'b' : ''}"></span>
    <input class="input" data-q="${which}" placeholder="${which === 'a' ? t('where_from') : t('where_to')}" value="${esc(p?.label || '')}" autocomplete="off">
    <div class="act">${which === 'a' ? `<button data-act="usegps" title="${t('my_position')}">◎</button>` : ''}<button data-act="pick" data-w="${which}" title="${t('pick_on_map')}">📍</button></div>
    <div class="suggest hidden" data-sug="${which}"></div>
  </div>`;
}

function renderHome() {
  current = null;
  sheet.classList.remove('collapsed');
  const body = $('#sheet-body');
  const tabs = `<div class="tabs"><button data-act="tab" data-t="home" class="${tab === 'home' ? 'on' : ''}">${t('home')}</button><button data-act="tab" data-t="history" class="${tab === 'history' ? 'on' : ''}">${t('history')}</button><button data-act="tab" data-t="fav" class="${tab === 'fav' ? 'on' : ''}">${t('favorites')}</button></div>`;
  if (tab === 'history') { body.innerHTML = tabs + '<div data-hist class="list"><p class="muted">…</p></div>'; return loadHistory(); }
  if (tab === 'fav') { body.innerHTML = tabs + favHtml(); return; }
  const q = form.quote;
  body.innerHTML = tabs + `<div class="stack">
    <div class="row between"><h2 style="margin:0">${state.user.name.split(' ')[0]}, ${state.lang === 'mg' ? 'inona no alefa?' : 'on livre quoi ?'}</h2><span class="small muted" data-near></span></div>
    ${favorites.length ? `<div class="chips">${favorites.slice(0, 6).map((f) => `<button class="chip" data-act="usefav" data-id="${f.id}">⭐ ${esc(f.label)}</button>`).join('')}</div>` : ''}
    <div class="stack" style="--gap:6px">${addrField('a')}${addrField('b')}</div>
    ${form.a && form.b ? `
      <div class="chips">${['colis', 'documents', 'marchandises', 'repas', 'autre'].map((x) => `<button class="chip ${form.type === x ? 'on' : ''}" data-act="type" data-v="${x}">${t(x)}</button>`).join('')}</div>
      <input class="input" data-f="desc" placeholder="${t('details')}" value="${esc(form.desc)}" maxlength="300">
      <div class="row"><input class="input grow" data-f="rname" placeholder="${t('recipient')}" value="${esc(form.rname)}"><input class="input grow" data-f="rphone" type="tel" placeholder="${t('recipient_phone')}" value="${esc(form.rphone)}"></div>
      <div class="card" style="background:var(--bg);border:0">
        <div class="row between small"><span class="muted">${t('distance')} : <b>${q ? km(q.distance_km) : '…'}</b> · ~${q ? q.eta_min : '…'} ${t('min')}</span><span class="muted">${t('suggested')} : <b>${q ? ar(q.suggested_price) : '…'}</b></span></div>
        <div class="stepper" style="margin-top:10px"><button data-act="step" data-d="-500">−</button><input class="input grow" data-f="price" inputmode="numeric" value="${form.price ?? ''}"><button data-act="step" data-d="500">+</button></div>
        <div class="tiny muted" style="text-align:center;margin-top:6px">${t('your_price')} (Ariary) · min ${ar(state.config?.min_price)}</div>
      </div>
      <label class="field"><span>${t('payment')}</span><div class="chips">${['cash', 'mvola', 'orange_money', 'airtel_money'].map((x) => `<button class="chip ${form.payment === x ? 'on' : ''}" data-act="pay" data-v="${x}">${t(x)}</button>`).join('')}</div></label>
      <div class="row"><div class="seg grow"><button data-act="sched" data-v="0" class="${form.schedule ? '' : 'on'}">${t('now')}</button><button data-act="sched" data-v="1" class="${form.schedule ? 'on' : ''}">🗓 ${t('schedule')}</button></div></div>
      ${form.schedule ? `<input class="input" type="datetime-local" data-f="scheduled_at" value="${esc(form.scheduled_at)}">` : ''}
      <input class="input" data-f="promo" placeholder="${t('promo')}" value="${esc(form.promo)}" style="text-transform:uppercase">
      <button class="btn primary lg block" data-act="submit">${t('find_courier')} · ${ar(form.price)}</button>
    ` : `<p class="muted small">${t('set_points')}</p>`}
  </div>`;
  showNearby().catch(() => {});
}

function favHtml() {
  return `<div class="list">${favorites.map((f) => `<div class="card row"><div class="grow"><b>⭐ ${esc(f.label)}</b><div class="small muted ellipsis">${esc(f.addr || '')}</div></div>
    <button class="btn sm" data-act="usefav" data-id="${f.id}">→</button><button class="btn sm danger" data-act="delfav" data-id="${f.id}">✕</button></div>`).join('') || `<p class="muted">${t('empty')}</p>`}
    ${form.a ? `<button class="btn block" data-act="addfav" data-w="a">＋ ${t('add_favorite')} : ${esc(form.a.label)}</button>` : ''}
    ${form.b ? `<button class="btn block" data-act="addfav" data-w="b">＋ ${t('add_favorite')} : ${esc(form.b.label)}</button>` : ''}</div>`;
}

async function loadHistory() {
  const list = (await api('GET', '/api/deliveries')).deliveries;
  const el = $('[data-hist]'); if (!el) return;
  el.innerHTML = list.map((d) => `<div class="card" data-act="histdetail" data-id="${d.id}" style="cursor:pointer">
    <div class="row between"><span class="small muted">#${d.id} · ${dt(d.created_at)}</span>${statusPill(d.status)}</div>
    <div class="route-line" style="margin-top:8px"><span class="dot"></span><span class="small ellipsis">${esc(d.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(d.drop_addr || '—')}</span></div>
    <div class="row between" style="margin-top:6px"><span class="small muted">${d.courier_name ? '🚲 ' + esc(d.courier_name) : ''}</span><b>${ar(d.final_price ?? d.proposed_price)}</b></div></div>`).join('') || `<p class="muted">${t('empty')}</p>`;
}

async function updateQuote() {
  if (!form.a || !form.b) return;
  drawRoute([form.a.lat, form.a.lng], [form.b.lat, form.b.lng], true);
  upsertMarker(map, mk, 'A', [form.a.lat, form.a.lng], icons.a());
  upsertMarker(map, mk, 'B', [form.b.lat, form.b.lng], icons.b());
  try {
    form.quote = await api('POST', '/api/quote', { pickup_lat: form.a.lat, pickup_lng: form.a.lng, drop_lat: form.b.lat, drop_lng: form.b.lng });
    if (!form.priceTouched) form.price = form.quote.suggested_price;
    if (!form.quote.zone) toast(state.lang === 'mg' ? 'Ivelan\'ny faritra iasanay ity toerana ity' : 'Ce point est hors de la zone de service (Antananarivo)', 'err');
  } catch (e) { toastErr(e); }
  if (!current) renderHome();
}

async function drawRoute(from, to, fit) {
  const r = await bikeRoute(from, to);
  if (!map) return r;
  routeLayer?.remove();
  routeLayer = L.layerGroup([
    L.polyline(r.coords, { color: '#0b6e4f', weight: 9, opacity: .18 }),
    L.polyline(r.coords, { color: '#0b6e4f', weight: 4.5, opacity: .9, dashArray: r.approx ? '8 8' : null }),
  ]).addTo(map);
  if (fit) map.fitBounds(L.latLngBounds(r.coords).pad(.25), { paddingBottomRight: [0, window.innerWidth < 900 ? 260 : 0], paddingTopLeft: [window.innerWidth >= 900 ? 430 : 0, 60] });
  return r;
}

// ---------------------------------------------------------------- saisie
let geoTimer;
function onInput(e) {
  const el = e.target;
  if (el.dataset.f) {
    const k = el.dataset.f;
    if (k === 'price') { form.price = Number(el.value.replace(/\D/g, '')) || null; form.priceTouched = true; const b = $('[data-act=submit]'); if (b) b.textContent = `${t('find_courier')} · ${ar(form.price)}`; }
    else form[k] = el.value;
  }
  if (el.dataset.q && e.type === 'input') {
    const w = el.dataset.q, v = el.value.trim();
    clearTimeout(geoTimer);
    const box = $(`[data-sug=${w}]`);
    if (v.length < 3) { box.classList.add('hidden'); return; }
    geoTimer = setTimeout(async () => {
      const res = await geocode(v + ', Antananarivo').catch(() => []);
      box.innerHTML = res.map((r, i) => `<button data-act="sug" data-w="${w}" data-i="${i}">${esc(r.label)}</button>`).join('') || `<button disabled>—</button>`;
      box._res = res;
      box.classList.remove('hidden');
    }, 450);
  }
}

function setPoint(w, p) {
  form[w] = p;
  upsertMarker(map, mk, w.toUpperCase(), [p.lat, p.lng], w === 'a' ? icons.a() : icons.b());
  if (form.a && form.b) updateQuote(); else { map?.setView([p.lat, p.lng], 16); renderHome(); }
}

function startPicking(w) {
  picking = w;
  sheet.classList.add('collapsed');
  $('#center-pin').classList.remove('hidden');
  const ban = $('#pick-banner'); ban.classList.remove('hidden'); ban.textContent = `${w === 'a' ? '🟢 ' + t('where_from') : '🟠 ' + t('where_to')} — ${t('tap_map')}`;
  const p = form[w] || form.a || (me && { lat: me[0], lng: me[1] });
  if (p && map) map.setView([p.lat, p.lng], 17);
  $('#sheet-body').innerHTML = `<div class="stack" style="padding-top:6px"><button class="btn primary lg block" data-act="confirmpick">${t('confirm_point')}</button><button class="btn ghost block" data-act="cancelpick">${t('cancel')}</button></div>`;
}
async function endPicking(confirm) {
  const w = picking; picking = null;
  $('#center-pin').classList.add('hidden'); $('#pick-banner').classList.add('hidden');
  sheet.classList.remove('collapsed');
  if (confirm && map) {
    const c = map.getCenter();
    setPoint(w, { lat: c.lat, lng: c.lng, label: '…' });
    form[w].label = await reverse(c.lat, c.lng);
    if (!current) renderHome();
  } else renderHome();
}

// ---------------------------------------------------------------- actions
const actions = {
  grip: () => sheet.classList.toggle('collapsed'),
  notifs: () => showNotifications(),
  profile: () => profileForm(),
  locate: () => locate(false).then(() => me && map?.setView(me, 16)),
  sos: () => sendSOS(current?.id),
  tab: (el) => { tab = el.dataset.t; renderHome(); },
  usegps: async () => { await locate(false); if (me) setPoint('a', { lat: me[0], lng: me[1], label: await reverse(me[0], me[1]) }); },
  pick: (el) => startPicking(el.dataset.w),
  confirmpick: () => endPicking(true),
  cancelpick: () => endPicking(false),
  sug: (el) => { const box = $(`[data-sug=${el.dataset.w}]`); const r = box._res[+el.dataset.i]; box.classList.add('hidden'); setPoint(el.dataset.w, r); },
  usefav: (el) => { const f = favorites.find((x) => x.id === +el.dataset.id); tab = 'home'; setPoint(form.a ? 'b' : 'a', { lat: f.lat, lng: f.lng, label: f.label + (f.addr ? ' — ' + f.addr : '') }); },
  addfav: async (el) => {
    const p = form[el.dataset.w]; const label = await promptBox(t('add_favorite'), { label: t('label'), placeholder: 'Maison' });
    if (!label) return;
    await api('POST', '/api/favorites', { label, addr: p.label, lat: p.lat, lng: p.lng });
    favorites = (await api('GET', '/api/favorites')).favorites; renderHome();
  },
  delfav: async (el) => { await api('DELETE', `/api/favorites/${el.dataset.id}`); favorites = favorites.filter((f) => f.id !== +el.dataset.id); renderHome(); },
  type: (el) => { form.type = el.dataset.v; renderHome(); },
  pay: (el) => { form.payment = el.dataset.v; renderHome(); },
  sched: (el) => { form.schedule = el.dataset.v === '1'; renderHome(); },
  step: (el) => { form.price = Math.max(state.config?.min_price || 0, (form.price || 0) + Number(el.dataset.d)); form.priceTouched = true; renderHome(); },
  submit: async () => {
    const body = {
      type: form.type, description: form.desc, pickup_lat: form.a.lat, pickup_lng: form.a.lng, pickup_addr: form.a.label,
      drop_lat: form.b.lat, drop_lng: form.b.lng, drop_addr: form.b.label, proposed_price: form.price, payment_method: form.payment,
      recipient_name: form.rname, recipient_phone: form.rphone || undefined, promo_code: form.promo || undefined,
      scheduled_at: form.schedule && form.scheduled_at ? new Date(form.scheduled_at).getTime() : undefined,
    };
    const r = await api('POST', '/api/deliveries', body);
    Object.assign(form, { b: null, quote: null, price: null, priceTouched: false, desc: '', rname: '', rphone: '', promo: '', schedule: false });
    track(r.id);
  },
  histdetail: (el) => historyDetail(+el.dataset.id),
  // suivi
  accept: async (el) => { await api('POST', `/api/deliveries/${current.id}/accept`, { offer_id: +el.dataset.id }); toast('✅', 'ok'); refreshCurrent(true); },
  raise: async (el) => { await api('POST', `/api/deliveries/${current.id}/raise`, { price: current.proposed_price + Number(el.dataset.d) }); refreshCurrent(true); },
  cancel: async () => {
    if (!(await confirmBox(t('cancel_request') + ' ?', t('cancel'), true))) return;
    await api('POST', `/api/deliveries/${current.id}/cancel`, { reason: 'Annulée par le client' }); stopTracking(); renderHome();
  },
  send: async () => { const inp = $('[data-chat-input]'); const v = inp.value.trim(); if (!v) return; inp.value = ''; await api('POST', `/api/deliveries/${current.id}/messages`, { body: v }); refreshCurrent(); },
  complaint: () => complaintForm(current?.id),
  star: (el) => { $$('.stars-input button').forEach((b, i) => b.classList.toggle('on', i < +el.dataset.v)); $('.stars-input').dataset.val = el.dataset.v; },
  rate: async () => {
    const v = +($('.stars-input').dataset.val || 0); if (!v) return;
    await api('POST', `/api/deliveries/${current.id}/rate`, { rating: v, comment: $('[data-rate-comment]').value });
    toast(t('thanks'), 'ok'); stopTracking(); renderHome();
  },
  newreq: () => { stopTracking(); renderHome(); },
  invoice: () => invoice(current),
};

// ---------------------------------------------------------------- suivi d'une livraison
function stopTracking() {
  poller?.stop(); poller = null; current = null; lastSig = ''; lastMsgId = 0; lastRouteFrom = null;
  routeLayer?.remove(); routeLayer = null;
  for (const k of ['A', 'B', 'courier']) if (mk[k]) { mk[k].remove(); delete mk[k]; }
}

function track(id) {
  stopTracking();
  current = { id };
  poller = every(4000, () => refreshCurrent());
}

async function refreshCurrent(force) {
  if (!current) return;
  const d = await api('GET', `/api/deliveries/${current.id}?msg_after=0`);
  current = d;
  upsertMarker(map, mk, 'A', [d.pickup_lat, d.pickup_lng], icons.a());
  upsertMarker(map, mk, 'B', [d.drop_lat, d.drop_lng], icons.b());
  if (d.status !== 'open') clearNearby();
  if (d.courier?.lat != null && ['assigned', 'picked_up'].includes(d.status)) {
    const c = [d.courier.lat, d.courier.lng];
    upsertMarker(map, mk, 'courier', c, icons.bike(d.status === 'picked_up' ? 'busy' : ''), { zIndexOffset: 900 });
    const target = d.status === 'assigned' ? [d.pickup_lat, d.pickup_lng] : [d.drop_lat, d.drop_lng];
    const moved = !lastRouteFrom || lastRouteFrom.st !== d.status || haversineM(lastRouteFrom.p, c) > 80;
    if (moved) {
      const first = !lastRouteFrom;
      lastRouteFrom = { p: c, st: d.status };
      const r = await drawRoute(c, target, first);
      current._eta = r.min || etaMin(r.km); current._km = r.km;
    }
  } else if (!routeLayer) {
    drawRoute([d.pickup_lat, d.pickup_lng], [d.drop_lat, d.drop_lng], true);
  }
  const sig = JSON.stringify([d.status, d.proposed_price, d.offers?.map((o) => [o.id, o.price, o.status]), d.courier?.id, d.rating, current._eta]);
  if (sig !== lastSig || force) { lastSig = sig; renderTracking(d); }
  const msgs = d.messages || [];
  if (msgs.length && msgs[msgs.length - 1].id !== lastMsgId) {
    lastMsgId = msgs[msgs.length - 1].id;
    const box = $('[data-chat]'); if (box) { box.innerHTML = chatHtml(msgs, state.user.id); box.scrollTop = box.scrollHeight; }
  }
  if (['cancelled', 'expired'].includes(d.status)) { poller?.stop(); }
  if (d.status === 'delivered' && d.rating) poller?.stop();
}
const haversineM = (a, b) => { const R = 6371e3, r = (x) => (x * Math.PI) / 180; const x = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

function routeBlock(d) {
  return `<div class="route-line"><span class="dot"></span><span class="small ellipsis">${esc(d.pickup_addr || '—')}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(d.drop_addr || '—')}</span></div>`;
}

function renderTracking(d) {
  sheet.classList.remove('collapsed');
  const body = $('#sheet-body');
  const steps = ['open', 'assigned', 'picked_up', 'delivered'];
  const idx = steps.indexOf(d.status);
  const timeline = idx >= 0 ? `<div class="timeline">${steps.map((s, i) => `<div class="tl ${i <= idx ? 'done' : ''}"><i></i>${t('st_' + s)}</div>`).join('')}</div>` : '';
  let html = `<div class="row between" style="margin-bottom:8px"><span class="small muted">#${d.id} · ${t(d.type)}</span>${statusPill(d.status)}</div>${timeline}<div class="card" style="margin:10px 0">${routeBlock(d)}</div>`;

  if (d.status === 'open') {
    html += `<div class="searching" style="margin:6px 0 12px"><div class="radar"></div><div><b>${t('searching')}</b><div class="small muted">${t('your_price')} : <b>${ar(d.proposed_price)}</b>${d.discount ? ` (−${ar(d.discount)} promo)` : ''}${d.scheduled_at ? ` · 🗓 ${dt(d.scheduled_at)}` : ''}</div></div></div>
      <h3>${t('offers')} (${d.offers?.length || 0})</h3>
      <div class="list">${(d.offers || []).map((o) => `<div class="card offer ${o.price <= d.proposed_price ? 'hl' : ''}">
        <div class="avatar">${esc(initials(o.courier_name))}</div>
        <div class="grow"><b>${esc(o.courier_name)}</b><div class="small muted">${stars(o.rating)} · ${o.deliveries_done} 🚲 · ${o.eta_min ? `~${o.eta_min} ${t('min')}` : km(o.distance_km)}</div></div>
        <div style="text-align:right"><div class="price">${o.price.toLocaleString('fr-FR')} <small>Ar</small></div><button class="btn primary sm" data-act="accept" data-id="${o.id}">${t('accept')}</button></div>
      </div>`).join('') || `<p class="small muted">${t('no_offers')}</p>`}</div>
      <div class="row" style="margin-top:12px"><span class="small muted grow">${t('raise')}</span><button class="btn sm sun" data-act="raise" data-d="500">+500</button><button class="btn sm sun" data-act="raise" data-d="1000">+1 000</button><button class="btn sm sun" data-act="raise" data-d="2000">+2 000</button></div>
      <button class="btn danger block" style="margin-top:12px" data-act="cancel">${t('cancel_request')}</button>`;
  } else if (d.status === 'assigned' || d.status === 'picked_up') {
    const c = d.courier || {};
    const stale = c.last_seen && Date.now() - c.last_seen > 60e3;
    html += `<div class="card offer" style="margin-bottom:10px"><div class="avatar">${esc(initials(c.name))}</div>
        <div class="grow"><div class="small muted">${t('your_courier')}</div><b>${esc(c.name)}</b> ${stars(c.rating)}<div class="small muted">🚲 ${t('eta')} : <b>${current._eta ? `~${current._eta} ${t('min')}` : '…'}</b>${current._km ? ` · ${km(current._km)}` : ''}</div>
        ${stale ? `<div class="tiny" style="color:var(--orange)">⚠ ${t('offline_mode')} (${time(c.last_seen)})</div>` : ''}</div>
        <div class="price">${(d.final_price ?? d.proposed_price).toLocaleString('fr-FR')} <small>Ar</small></div></div>
      <div class="row"><a class="btn grow" href="tel:${esc(c.phone)}">📞 ${t('call')}</a><button class="btn grow" data-act="complaint">⚠ ${t('complaint')}</button></div>
      <div class="card" style="margin-top:10px;text-align:center"><div class="small muted" style="margin-bottom:8px">${t('pin_title')}</div>
        <div class="pin-box">${[...d.pin].map((x) => `<span>${x}</span>`).join('')}</div><div class="tiny muted" style="margin-top:8px">${t('pin_help')}</div></div>
      <h3 style="margin-top:14px">💬 ${t('chat')}</h3>
      <div class="chat" data-chat>${chatHtml(d.messages || [], state.user.id)}</div>
      <div class="row" style="margin-top:6px"><input class="input grow" data-chat-input placeholder="${t('chat')}…" maxlength="500"><button class="btn primary" data-act="send">${t('send')}</button></div>
      <div class="small muted" style="margin-top:10px">${t('payment')} : <b>${t(d.payment_method)}</b>${d.payment_method !== 'cash' && state.config?.payment_numbers?.[d.payment_method] ? ` — ${t('pay_to')} <b>${esc(state.config.payment_numbers[d.payment_method])}</b>` : ''}</div>
      ${d.status === 'assigned' ? `<button class="btn danger block" style="margin-top:10px" data-act="cancel">${t('cancel')}</button>` : ''}`;
    lastMsgId = d.messages?.length ? d.messages[d.messages.length - 1].id : 0;
  } else if (d.status === 'delivered') {
    html += `<div style="text-align:center;margin:8px 0 12px"><div style="font-size:48px">🎉</div><h2>${t('st_delivered')} !</h2><div class="big-price">${ar(d.final_price)}</div><div class="small muted">${t(d.payment_method)}</div></div>`;
    if (!d.rating) html += `<h3 style="text-align:center">${t('rate')} — ${esc(d.courier?.name || '')}</h3>
        <div class="stars-input">${[1, 2, 3, 4, 5].map((v) => `<button data-act="star" data-v="${v}">★</button>`).join('')}</div>
        <textarea class="input" data-rate-comment placeholder="${t('comment')}" rows="2" style="margin-top:10px"></textarea>
        <button class="btn primary lg block" style="margin-top:10px" data-act="rate">${t('send')}</button>`;
    html += `<div class="row" style="margin-top:10px"><button class="btn grow" data-act="invoice">🧾 Facture</button><button class="btn grow" data-act="newreq">＋ ${t('home')}</button></div>`;
  } else {
    html += `<p class="muted">${d.cancel_reason ? esc(d.cancel_reason) : ''}</p><button class="btn primary block" data-act="newreq">＋ ${t('find_courier')}</button>`;
  }
  body.innerHTML = html;
  const box = $('[data-chat]'); if (box) box.scrollTop = box.scrollHeight;
  $('[data-chat-input]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.send(); });
}

async function historyDetail(id) {
  const d = await api('GET', `/api/deliveries/${id}`);
  const m = modal(`#${d.id}`, `<div class="stack">
    <div class="row between">${statusPill(d.status)}<span class="small muted">${dt(d.created_at)}</span></div>
    <div class="card">${routeBlock(d)}</div>
    <div class="row between"><span class="muted">${t('distance')}</span><b>${km(d.distance_km)}</b></div>
    <div class="row between"><span class="muted">Prix</span><b>${ar(d.final_price ?? d.proposed_price)}</b></div>
    <div class="row between"><span class="muted">${t('payment')}</span><b>${t(d.payment_method)}</b></div>
    ${d.courier ? `<div class="row between"><span class="muted">${t('your_courier')}</span><b>${esc(d.courier.name)}</b></div>` : ''}
    ${d.rating ? `<div class="row between"><span class="muted">Note</span><span class="stars">${'★'.repeat(d.rating)}</span></div>` : ''}
    <div class="row">${['open', 'assigned', 'picked_up'].includes(d.status) || (d.status === 'delivered' && !d.rating) ? `<button class="btn primary grow" data-open>${t('details_btn')}</button>` : ''}
    ${d.status === 'delivered' ? '<button class="btn grow" data-inv>🧾 Facture</button>' : ''}<button class="btn grow" data-cmp>⚠ ${t('complaint')}</button></div></div>`);
  m.el.querySelector('[data-open]')?.addEventListener('click', () => { m.close(); track(d.id); });
  m.el.querySelector('[data-inv]')?.addEventListener('click', () => invoice(d));
  m.el.querySelector('[data-cmp]').addEventListener('click', () => { m.close(); complaintForm(d.id); });
}

function invoice(d) {
  const w = window.open('', '_blank');
  if (!w) return toast('Popup bloquée', 'err');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Facture Alefa #${d.id}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:30px auto;color:#14211c;padding:0 16px}h1{color:#0b6e4f;margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:9px 0;border-bottom:1px solid #e4ebe8}td:last-child{text-align:right;font-weight:600}.tot td{font-size:1.2em;border:0}.m{color:#85938d;font-size:.9em}</style>
  <h1>Alefa</h1><div class="m">Livraison à vélo — Antananarivo</div>
  <h2 style="margin-top:28px">Reçu de livraison n° ${d.id}</h2><div class="m">Émis le ${new Date().toLocaleDateString('fr-FR')}</div>
  <table><tr><td>Client</td><td>${esc(d.client?.name || state.user.name)}</td></tr><tr><td>Livreur</td><td>${esc(d.courier?.name || '')}</td></tr>
  <tr><td>Départ</td><td>${esc(d.pickup_addr || '')}</td></tr><tr><td>Arrivée</td><td>${esc(d.drop_addr || '')}</td></tr>
  <tr><td>Date de livraison</td><td>${dt(d.delivered_at)}</td></tr><tr><td>Distance</td><td>${km(d.distance_km)}</td></tr><tr><td>Type</td><td>${esc(d.type)}</td></tr>
  ${d.discount ? `<tr><td>Remise (${esc(d.promo_code)})</td><td>−${ar(d.discount)}</td></tr>` : ''}<tr><td>Mode de paiement</td><td>${esc(t(d.payment_method))}</td></tr>
  <tr class="tot"><td>Total payé</td><td>${ar(d.final_price)}</td></tr></table><p class="m" style="margin-top:30px">Merci d'avoir choisi Alefa.</p>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}
