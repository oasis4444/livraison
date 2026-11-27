// Espace client : menu latéral (ordinateur) ou barre du bas (téléphone), tableau de bord, nouvel envoi en 4 étapes,
// mes colis (envoyés et reçus), page de suivi (carte + étapes + détails). La course express (carte) reste disponible.
import { state, api, esc, ar, km, dt, time, toastErr, phoneFmt, initials, every, stopAll, makeMap, upsertMarker, icons, vehIcon,
  startNotifications, showNotifications, setNotifOpener, supportChat, profileForm, logout, drawRoad, chatBubble } from './core.js';
import { shipDetail, importForm, winTxt, stepLabel } from './colis.js';
import { sendWizard } from './wizard.js';

const L2 = (fr, mg) => (state.lang === 'mg' ? mg : fr);
const SV = {
  home: '<path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z"/>', plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>', box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
const ic = (k) => `<svg class="sp-ic" viewBox="0 0 24 24" aria-hidden="true">${SV[k]}</svg>`;
const ACTIVE = (s) => !['delivered', 'cancelled', 'refused'].includes(s.status) || (['refused', 'cancelled'].includes(s.status) && s.picked_at && !s.returned_at);
const KIND = { document: ['Document', 'Taratasy'], colis: ['Colis', 'Colis'], alimentaire: ['Alimentaire', 'Sakafo'] }; // « alimentaire » : anciens envois seulement
const TONE = { delivered: 'ok', cancelled: 'off', refused: 'bad' };

let root, main, view = 'home', list = [], bal = null, viewTimer = null, expressLive = false;

export async function mount(el) {
  root = el;
  if (!document.querySelector('link[data-space-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/space.css'; l.dataset.spaceCss = '1'; document.head.append(l); }
  const u = state.user;
  const navs = [['home', 'home', L2('Accueil', 'Fandraisana')], ['new', 'plus', L2('Nouvel envoi', 'Handefa')], ['parcels', 'box', L2('Mes colis', 'Ny colis-ko')], ['express', 'bolt', L2('Course express', 'Dia haingana')]];
  const more = [['support', 'chat', L2('Service client', 'Sampana mpanjifa')], ['terms', 'book', L2('Conditions et tarifs', 'Fepetra sy saran-dalana')], ['profile', 'user', L2('Profil', 'Mombamomba')]];
  root.className = 'sp';
  root.innerHTML = `<aside class="sp-side">
      <a class="sp-logo" href="/"><img src="/icon.svg" alt="" width="34" height="34"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a>
      <div class="sp-label">${L2('Espace client', 'Toeran\'ny mpanjifa')}</div>
      <nav>${navs.map(([k, i, l]) => `<button data-nav="${k}">${ic(i)}<span>${l}</span></button>`).join('')}<hr>${more.map(([k, i, l]) => `<button data-nav="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>
      <div class="sp-me"><span class="sp-av">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><small>${esc(phoneFmt(u.phone))}</small></div><button data-out title="${L2('Déconnexion', 'Hivoaka')}">${ic('out')}</button></div>
    </aside>
    <div class="sp-main">
      <header class="sp-top"><a class="sp-logo m" href="/"><img src="/icon.svg" alt="" width="30" height="30"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a><div class="grow"></div>
        <button class="sp-bell" data-nav="notifs" aria-label="Notifications">${ic('bell')}<span class="sp-dot hidden" data-unread></span></button>
        <button class="sp-chip" data-nav="profile"><span class="sp-av">${esc(initials(u.name))}</span><span>${esc(u.name.split(' ')[0])}</span></button></header>
      <main data-main></main>
    </div>
    <nav class="sp-tab">${[['home', 'home', L2('Accueil', 'Fandraisana')], ['parcels', 'box', L2('Colis', 'Colis')], ['new', 'plus', L2('Envoyer', 'Handefa')], ['support', 'chat', L2('Aide', 'Fanampiana')], ['menu', 'more', L2('Plus', 'Hafa')]]
      .map(([k, i, l]) => `<button data-nav="${k}" class="${k === 'new' ? 'big' : ''}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
  main = root.querySelector('[data-main]');
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]'); if (b) { e.preventDefault(); go(b.dataset.nav, b.dataset); }
    if (e.target.closest('[data-out]')) logout();
  });
  setNotifOpener((tg) => {
    if (tg.type === 'shipment') return go('track', { id: tg.id });
    if (tg.type === 'chat') { go('track', { id: tg.id }); return import('./talk.js').then((t) => t.openShipChat(tg.id)); }
    if (tg.type === 'support') return supportChat();
    if (tg.type === 'payouts') return go('parcels');
    if (tg.type === 'delivery') return go('express');
  });
  startNotifications(() => { if (['home', 'parcels'].includes(view)) render(); });
  const bub = chatBubble('user', { cls: 'sp-bub', poll: async () => (await api('GET', '/api/support/unread')).unread, onOpen: () => { bub.setCount(0); supportChat(); } });
  window.addEventListener('popstate', () => { const h = location.hash.slice(1).split('/'); go(h[0] || 'home', { id: h[1] }, true); });
  // Lien « Alefa » depuis un logiciel de vente : nouvel envoi déjà rempli.
  const pending = sessionStorage.getItem('alefa_send');
  if (pending) { sessionStorage.removeItem('alefa_send'); return go('new', { prefill: Object.fromEntries(new URLSearchParams(pending)) }); }
  const h = location.hash.slice(1).split('/');
  // Course express en cours (ancienne application carte) : on y retourne directement.
  const dl = (await api('GET', '/api/deliveries').catch(() => ({ deliveries: [] }))).deliveries;
  expressLive = dl.some((d) => ['open', 'assigned', 'picked_up'].includes(d.status));
  if (h[0] === 'express') return go('express');
  go(['home', 'new', 'parcels', 'track'].includes(h[0]) ? h[0] : 'home', { id: h[1] }, true);
}

async function load() {
  const [l, b] = await Promise.all([api('GET', '/api/shipments'), api('GET', '/api/shipments/balance').catch(() => null)]);
  list = l.shipments; bal = b;
}

function go(v, d = {}, fromHistory = false) {
  if (v === 'notifs') return showNotifications();
  if (v === 'support') return supportChat(list.filter(ACTIVE).map((x) => x.ref));
  if (v === 'profile') return profileForm();
  if (v === 'terms') return import('./terms.js').then((m) => m.showConditions());
  if (v === 'menu') return menuSheet();
  if (v === 'express') { stopAll(); root.className = ''; if (location.hash !== '#express') history.replaceState(null, '', '#express'); return import('./client.js').then((m) => m.mount(root)); }
  viewTimer?.stop(); viewTimer = null;
  view = v;
  const hash = v === 'home' ? '' : v === 'track' ? `#track/${d.id}` : `#${v}`;
  if (!fromHistory && location.hash !== hash) history.pushState(null, '', hash || location.pathname);
  root.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === (v === 'track' ? 'parcels' : v)));
  window.scrollTo(0, 0);
  if (v === 'new') return sendWizard(main, { prefill: d.prefill, onCancel: () => go('home'), onDone: (s, why) => { if (why === 'see') go('track', { id: s.id }); else load().catch(() => {}); } });
  if (v === 'track') return trackPage(Number(d.id));
  render();
}

async function render() {
  if (view === 'home') { if (!list.length) main.innerHTML = skeleton(); await load().catch(toastErr); if (view === 'home') homeView(); }
  if (view === 'parcels') { if (!list.length) main.innerHTML = skeleton(); await load().catch(toastErr); if (view === 'parcels') parcelsView(); }
}
const skeleton = () => `<div class="sp-page"><div class="sp-skel"></div><div class="sp-skel"></div></div>`;

function menuSheet() {
  const back = document.createElement('div');
  back.className = 'sp-sheet-back';
  back.innerHTML = `<div class="sp-sheet">${[['express', 'bolt', L2('Course express (carte)', 'Dia haingana (sarintany)')], ['terms', 'book', L2('Conditions et tarifs', 'Fepetra sy saran-dalana')], ['notifs', 'bell', 'Notifications'], ['profile', 'user', L2('Profil et langue', 'Mombamomba sy fiteny')]]
    .map(([k, i, l]) => `<button data-nav="${k}">${ic(i)}<span>${l}</span></button>`).join('')}<button data-out class="danger">${ic('out')}<span>${L2('Déconnexion', 'Hivoaka')}</span></button></div>`;
  back.addEventListener('click', (e) => { back.remove(); const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); if (e.target.closest('[data-out]')) logout(); });
  document.body.append(back);
}

// ---------------------------------------------------------------- tableau de bord
function homeView() {
  const sent = list.filter((x) => x.mine_as === 'sender'), recv = list.filter((x) => x.mine_as === 'recipient');
  const active = list.filter(ACTIVE), done = sent.filter((x) => x.status === 'delivered');
  const now = new Date(), month = sent.filter((x) => new Date(x.created_at).getMonth() === now.getMonth() && new Date(x.created_at).getFullYear() === now.getFullYear());
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Indian/Antananarivo' }));
  const hello = state.lang === 'mg' ? (hour < 12 ? 'Manao ahoana' : 'Salama') : hour < 18 ? 'Bonjour' : 'Bonsoir';
  main.innerHTML = `<div class="sp-page">
    <div class="sp-head"><h1>${hello} ${esc(state.user.name.split(' ')[0])}</h1><p>${L2('Voici où en sont vos envois.', 'Ireto ny vaovaon\'ny entanao.')}</p></div>
    ${expressLive ? `<button class="sp-alert go" data-nav="express"><b>${L2('Course express en cours', 'Dia haingana mandeha')}</b> · ${L2('ouvrir la carte', 'sokafy ny sarintany')} ${ic('arrow')}</button>` : ''}
    <button class="sp-hero" data-nav="new"><div><b>${L2('Nouvel envoi', 'Fandefasana vaovao')}</b><span>${L2('Récupération gratuite, prix affiché avant de valider.', 'Maimaim-poana ny fakana, hita mialoha ny vidiny.')}</span></div><i>${ic('arrow')}</i></button>
    <div class="sp-kpis">
      ${kpi('truck', L2('En cours', 'Mandeha'), active.length)}
      ${kpi('check', L2('Livrés ce mois', 'Tonga tamin\'ity volana ity'), month.filter((x) => x.status === 'delivered').length)}
      ${kpi('box', L2('Envois au total', 'Fandefasana rehetra'), sent.length)}
      ${kpi('cash', L2('À vous reverser', 'Haverina aminao'), ar(bal?.due || 0), bal?.with_courier ? L2(`dont ${ar(bal.with_courier)} encore chez le livreur`, `${ar(bal.with_courier)} mbola any amin'ny livreur`) : '', 'sun')}
    </div>
    <section class="sp-sec"><div class="sp-sec-h"><h2>${L2('En cours', 'Mandeha')}</h2>${active.length ? `<button class="sp-link" data-nav="parcels">${L2('Tout voir', 'Jereo daholo')} ${ic('arrow')}</button>` : ''}</div>
      ${active.length ? `<div class="sp-live">${active.slice(0, 4).map(liveCard).join('')}</div>`
        : `<div class="sp-empty">${ic('box')}<p>${L2('Aucun colis en route pour le moment.', 'Tsy misy colis an-dalana amin\'izao.')}</p><button class="sp-btn sun" data-nav="new">${L2('Envoyer un colis', 'Handefa colis')}</button></div>`}</section>
    <section class="sp-sec"><div class="sp-sec-h"><h2>${L2('Envois récents', 'Fandefasana farany')}</h2><div class="row" style="gap:6px"><button class="sp-btn line sm" data-imp>${ic('up')} Excel</button></div></div>
      ${sent.length ? `<div class="sp-card sp-table">${sent.slice(0, 6).map(row).join('')}</div>` : `<p class="sp-muted">${L2('Vos envois apparaîtront ici.', 'Eto no hiseho ny fandefasanao.')}</p>`}</section>
    ${done.length || bal?.payouts?.length ? `<section class="sp-sec"><div class="sp-sec-h"><h2>${L2('Derniers versements', 'Vola naverina farany')}</h2></div>
      ${(bal?.payouts || []).length ? `<div class="sp-card sp-table">${bal.payouts.slice(0, 5).map((p) => `<div class="sp-row"><span class="sp-st ok"></span><div class="grow"><b>${ar(p.amount)}</b><small>${esc(p.note || '')}</small></div><span class="sp-muted">${dt(p.at)}</span></div>`).join('')}</div>`
        : `<p class="sp-muted">${L2('Aucun versement pour l\'instant.', 'Mbola tsy misy vola naverina.')}</p>`}</section>` : ''}
  </div>`;
  wireList();
  main.querySelector('[data-imp]').onclick = () => importForm({ onDone: () => render() });
  viewTimer = every(15000, async () => { if (view !== 'home') return; const sig = JSON.stringify(list.map((x) => [x.id, x.step])); await load().catch(() => {}); if (view === 'home' && sig !== JSON.stringify(list.map((x) => [x.id, x.step]))) homeView(); }, false);
}
const kpi = (i, l, v, sub = '', tone = '') => `<div class="sp-kpi ${tone}"><span>${ic(i)}</span><small>${l}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
const progress = (s) => {
  const order = ['pending', 'scheduled', 'departed', 'at_pickup', 'picked_up', 'to_centre', 'at_centre', 'en_route', 'nearby', 'awaiting_recipient', 'awaiting_courier', 'delivered'];
  const i = order.indexOf(s.step === 'assigned' ? 'scheduled' : s.step);
  return s.status === 'delivered' ? 100 : Math.max(8, Math.round(((i < 0 ? 0 : i) / (order.length - 1)) * 100));
};
function liveCard(s) {
  const mine = s.mine_as === 'recipient';
  return `<button class="sp-card sp-lc" data-ship="${s.id}" data-ext="${esc(s.external_ref || s.ref)}">
    <div class="sp-lc-t"><span class="sp-ref">${esc(s.ref)}</span>${mine ? `<span class="sp-tag in">${L2('À recevoir', 'Ho raisina')}</span>` : ''}<span class="sp-pill ${s.late ? 'bad' : ''}">${esc(stepLabel(s.step))}</span></div>
    <div class="sp-route"><div><i class="g"></i>${esc((s.sender.address || '').split(',')[0])}</div><div><i class="o"></i>${esc((s.recipient.address || '').split(',')[0])}</div></div>
    <div class="sp-bar"><i style="width:${progress(s)}%"></i></div>
    <div class="sp-lc-b"><span>${esc(winTxt(s).replace(/[🕘🏁]\s?/gu, '') || (s.late ? s.late : ''))}</span><b>${ar(s.amount_to_collect)}</b></div></button>`;
}
function row(s) {
  return `<button class="sp-row" data-ship="${s.id}" data-ext="${esc(s.external_ref || s.ref)}"><span class="sp-st ${TONE[s.status] || (s.late ? 'bad' : 'go')}"></span>
    <div class="grow"><b>${esc(s.recipient.name || L2('Destinataire', 'Mpandray'))} <span class="sp-ref">${esc(s.ref)}</span></b><small>${esc((s.recipient.address || '').split(',').slice(0, 2).join(','))}${s.kind ? ` · ${esc(KIND[s.kind]?.[state.lang === 'mg' ? 1 : 0] || '')}` : ''}${s.category ? ` · ${esc(s.category)}` : ''}</small></div>
    <div class="sp-row-r"><span class="sp-pill sm ${TONE[s.status] || ''}">${esc(stepLabel(s.step))}</span><small>${dt(s.created_at)}</small></div><b class="sp-amt">${ar(s.amount_to_collect)}</b></button>`;
}
function wireList() { main.querySelectorAll('[data-ship]').forEach((b) => (b.onclick = () => go('track', { id: b.dataset.ship }))); }

// ---------------------------------------------------------------- mes colis
let filter = 'active', q = '';
function parcelsView() {
  const F = { active: (s) => ACTIVE(s), sent: (s) => s.mine_as === 'sender', recv: (s) => s.mine_as === 'recipient', done: (s) => s.status === 'delivered', other: (s) => ['cancelled', 'refused'].includes(s.status) };
  const qq = q.trim().toLowerCase();
  const shown = list.filter(F[filter]).filter((s) => !qq || [s.ref, s.external_ref, s.recipient.name, s.recipient.phone, s.recipient.address, s.description].some((v) => String(v || '').toLowerCase().includes(qq)));
  const cnt = (k) => list.filter(F[k]).length;
  main.innerHTML = `<div class="sp-page">
    <div class="sp-head row-h"><div><h1>${L2('Mes colis', 'Ny colis-ko')}</h1><p>${L2('Envoyés et reçus, avec leur suivi.', 'Nalefa sy voaray, miaraka amin\'ny fanarahana.')}</p></div>
      <div class="row" style="gap:8px"><button class="sp-btn line" data-imp>${ic('up')} ${L2('Importer (Excel)', 'Hampiditra (Excel)')}</button><button class="sp-btn sun" data-nav="new">${ic('plus')} ${L2('Nouvel envoi', 'Handefa')}</button></div></div>
    <div class="sp-filters">${[['active', L2('En cours', 'Mandeha')], ['sent', L2('Envoyés', 'Nalefa')], ['recv', L2('Reçus', 'Voaray')], ['done', L2('Livrés', 'Tonga')], ['other', L2('Annulés, refusés', 'Nofoanana, nolavina')]]
      .map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l} <i>${cnt(k)}</i></button>`).join('')}
      <input data-q placeholder="${L2('Rechercher : n°, nom, téléphone…', 'Hitady : laharana, anarana, finday…')}" value="${esc(q)}"></div>
    ${shown.length ? `<div class="sp-card sp-table">${shown.map(row).join('')}</div>` : `<div class="sp-empty">${ic('inbox')}<p>${L2('Aucun colis ici.', 'Tsy misy colis eto.')}</p></div>`}
  </div>`;
  wireList();
  main.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; parcelsView(); }));
  const inp = main.querySelector('[data-q]');
  inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; parcelsView(); const n = main.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
  main.querySelector('[data-imp]').onclick = () => importForm({ onDone: () => render() });
}

// ---------------------------------------------------------------- page de suivi d'un colis
async function trackPage(id) {
  main.innerHTML = skeleton();
  let s;
  try { s = (await api('GET', `/api/shipments/${id}`)).shipment; } catch (e) { main.innerHTML = `<div class="sp-page"><p>${esc(e.message)}</p></div>`; return; }
  const mine = list.find((x) => x.id === id)?.mine_as || (s.recipient.phone === state.user.phone ? 'recipient' : 'sender');
  main.innerHTML = `<div class="sp-page">
    <button class="sp-link back" data-nav="parcels">${ic('back')} ${L2('Mes colis', 'Ny colis-ko')}</button>
    <div class="sp-head row-h"><div><h1>${L2('Colis', 'Colis')} ${esc(s.ref)}</h1><p data-sub>${esc(stepLabel(s.step))}</p></div><span class="sp-pill lg ${TONE[s.status] || (s.late ? 'bad' : '')}" data-pill>${esc(stepLabel(s.step))}</span></div>
    ${s.late ? `<div class="sp-alert">${L2('En retard', 'Tara')} : ${esc(s.late)}</div>` : ''}
    <div class="sp-track">
      <div class="sp-card sp-map"><div data-map></div><div class="sp-legend"><span><i class="g"></i>${L2('Récupération', 'Fakana')}</span><span><i class="o"></i>${L2('Livraison', 'Fanaterana')}</span><span><i class="c"></i>${L2('Livreur (en livraison)', 'Livreur (eo am-panaterana)')}</span><span><i class="r"></i>${L2('Itinéraire', 'Lalana')}</span></div></div>
      <div class="sp-col">
        <div class="sp-card"><h3>${L2('Étapes', 'Dingana')}</h3><div class="sp-route-info" data-rinfo></div><ol class="sp-tl" data-tl></ol><div data-live></div></div>
        <div class="sp-card"><h3>${L2('Détails', 'Antsipiriany')}</h3>
          <div class="sp-kv">
            <div><span>${L2('Expéditeur', 'Mpandefa')}</span><b>${esc(s.sender.name || '—')}<small>${esc(s.sender.address || '')}</small></b></div>
            <div><span>${L2('Destinataire', 'Mpandray')}</span><b>${esc(s.recipient.name || '—')} ${s.recipient.phone ? `<a href="tel:${esc(s.recipient.phone)}">${esc(phoneFmt(s.recipient.phone))}</a>` : ''}<small>${esc(s.recipient.address || '')}</small></b></div>
            <div><span>${L2('Contenu', 'Ao anatiny')}</span><b>${esc([s.kind ? KIND[s.kind]?.[state.lang === 'mg' ? 1 : 0] : '', s.description, s.qty > 1 ? `${s.qty} colis` : ''].filter(Boolean).join(' · ') || '—')}</b></div>
            <div><span>${L2('Taille', 'Habe')}</span><b>${esc(s.category || 'S')} · ${s.moto_only || ['L', 'XL'].includes(s.category) ? 'Moto' : L2('Vélo', 'Bisikileta')}${s.fragile ? ' · fragile' : ''}${s.express ? ' · express' : ''}</b></div>
            ${s.province ? `<div><span>${L2('Province', 'Faritany')}</span><b>${esc(s.province.city)} · ${esc(s.province.coop)}${s.province.plate ? `<small>${L2('Véhicule', 'Fiara')} ${esc(s.province.plate)}${s.province.driver_phone ? ` · ${esc(phoneFmt(s.province.driver_phone))}` : ''}</small>` : ''}</b></div>` : ''}
            ${s.distance_km != null ? `<div><span>${L2('Distance', 'Halavirana')}</span><b>${km(s.distance_km)}</b></div>` : ''}
            ${winTxt(s) ? `<div><span>${L2('Créneaux', 'Ora')}</span><b>${esc(winTxt(s).replace(/[🕘🏁]\s?/gu, ''))}</b></div>` : ''}
            ${s.courier ? `<div><span>${L2('Livreur', 'Livreur')}</span><b>${esc(s.courier.name || '')} ${s.courier.phone ? `<a href="tel:${esc(s.courier.phone)}">${esc(phoneFmt(s.courier.phone))}</a>` : ''}</b></div>` : ''}
          </div>
          <div class="sp-money">
            ${s.value ? `<div><span>${L2('Marchandise', 'Entana')}${s.payment?.value_paid ? ` (${L2('déjà payée', 'efa voaloa')})` : ''}</span><span>${ar(s.value)}</span></div>` : ''}
            ${(s.fee_detail || [[L2('Frais de livraison', 'Saran-dalana'), s.fee]]).map(([l, a]) => `<div><span>${esc(l)}</span><span>${ar(a)}</span></div>`).join('')}
            <div class="tot"><span>${L2('À encaisser auprès du destinataire', 'Raisina amin\'ny mpandray')}</span><b>${ar(s.amount_to_collect)}</b></div>
            ${s.payment?.fee_at_pickup ? `<small>${L2('Frais payés au livreur à la récupération', 'Saran-dalana aloa rehefa haka')} : ${ar(s.payment.fee_at_pickup)}</small>` : ''}
          </div>
          ${s.delivery_pin && ['pending', 'assigned', 'picked_up'].includes(s.status) && mine === 'sender' ? `<div class="sp-pin"><small>${L2('Code PIN du destinataire', 'Kaody PIN an\'ny mpandray')}</small><b>${esc(s.delivery_pin)}</b></div>` : ''}
          <div class="sp-acts"><button class="sp-btn line grow" data-chat>${L2('Discuter', 'Hiresaka')}</button>${s.courier && !s.courier_hidden && ['assigned', 'picked_up'].includes(s.status) ? `<button class="sp-btn sun grow" data-callc>${L2('Appeler le livreur', 'Antsoy ny livreur')}</button>` : ''}</div>
          <div class="sp-acts"><button class="sp-btn dark grow" data-more>${L2('Actions et preuves', 'Hetsika sy porofo')}</button>
            ${s.track_token ? `<a class="sp-btn line" href="sms:${esc(s.recipient.phone)}?body=${encodeURIComponent(`Alefa ${s.ref} : ${location.origin}/suivi/${s.track_token}`)}">${L2('Envoyer le suivi', 'Alefaso ny rohy')}</a>` : ''}</div>
        </div>
      </div>
    </div></div>`;
  main.querySelector('[data-more]').onclick = () => shipDetail(s.id, { role: mine, onChange: () => trackPage(id) });
  main.querySelector('[data-chat]').onclick = () => import('./talk.js').then((t) => t.openShipChat(s.id, { ref: s.ref }));
  const cc = main.querySelector('[data-callc]'); if (cc) cc.onclick = () => import('./talk.js').then((t) => t.callUser({ to: 'courier', shipment_id: s.id, name: s.courier?.name }));
  const map = makeMap(main.querySelector('[data-map]'), { zoom: 13, zoomControl: true });
  const mk = {}; let fitted = false, road = null, roadKey = '';
  const tick = async () => {
    if (view !== 'track') return;
    let r = null; if (s.track_token) r = await api('GET', `/api/track/${s.track_token}`).catch(() => null);
    const tl = main.querySelector('[data-tl]'); if (!tl) return;
    const items = r?.timeline || [{ k: 'received', label: L2('Commande reçue', 'Voaray ny baiko'), at: s.created_at }, { k: 'picked', label: L2('Récupéré', 'Nalaina'), at: s.picked_at }, { k: 'delivered', label: L2('Livré', 'Tonga'), at: s.done_at }];
    const TL = { received: L2('Envoi enregistré', 'Voaray ny fandefasana'), picked: L2('Colis récupéré', 'Nalaina ny colis'), centre: L2('Au centre Alefa', 'Ao amin\'ny centre Alefa'), delivery: L2('En livraison', 'Eo am-panaterana'), delivered: L2('Livré', 'Tonga') };
    const cur = items.findIndex((x) => !x.at);
    tl.innerHTML = items.map((x, i) => `<li class="${x.at ? 'done' : i === cur ? 'now' : ''}"><i>${x.at ? ic('check') : i + 1}</i><div><b>${esc(x.k === 'delivered' && /^Refus/.test(x.label) ? x.label : TL[x.k] || x.label)}</b><small>${x.at ? dt(x.at) : i === cur ? L2('Prochaine étape', 'Dingana manaraka') : ''}</small></div></li>`).join('');
    const eta = r?.eta && !r.confirmed ? Math.max(1, Math.round((r.eta - Date.now()) / 60e3)) : null;
    const live = main.querySelector('[data-live]');
    live.innerHTML = `${r?.position ? `<div class="sp-eta">${vehIcon(r.vehicle)} <b>${esc(r.courier || '')}</b>${eta ? ` · ${L2('arrivée dans', 'tonga ao anatin\'ny')} ~${eta} min` : ''}</div>` : ''}
      ${r?.on_delivery && !r.done_at && mine === 'recipient' ? `<div class="sp-livepin"><div><small>${L2('À payer au livreur', 'Aloa amin\'ny livreur')}</small><b>${ar(r.amount_to_pay)}</b></div>${r.pin ? `<div><small>${L2('Votre code PIN', 'Ny kaody PIN-nao')}</small><b class="pin">${esc(r.pin)}</b></div>` : ''}</div>
        ${r.courier_phone ? `<a class="sp-btn line block" href="tel:${esc(r.courier_phone)}">${L2('Appeler le livreur', 'Antsoy ny livreur')}</a>` : ''}
        ${r.can_confirm ? `<button class="sp-btn sun block" data-recv>${L2('J\'ai reçu mon colis', 'Voaraiko ny colis')}</button>` : ''}` : ''}`;
    const rb = live.querySelector('[data-recv]');
    if (rb) rb.onclick = async () => { rb.disabled = true; try { await api('POST', `/api/track/${s.track_token}/confirm`, {}); await tick(); } catch (e) { rb.disabled = false; toastErr(e); } };
    if (!map) return;
    const pts = [];
    const P = r?.pickup || (s.sender.lat != null ? [s.sender.lat, s.sender.lng] : null), D = r?.drop || (s.recipient.lat != null ? [s.recipient.lat, s.recipient.lng] : null);
    if (P) { upsertMarker(map, mk, 'a', P, icons.a()); pts.push(P); }
    if (D) { upsertMarker(map, mk, 'b', D, icons.b()); pts.push(D); }
    if (r?.position) { upsertMarker(map, mk, 'c', r.position, icons.bike('', r.courier || '', r.vehicle)); pts.push(r.position); } else if (mk.c) { mk.c.remove(); delete mk.c; }
    if (!fitted && pts.length) { fitted = true; pts.length === 1 ? map.setView(pts[0], 15) : map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 }); }
    // Itinéraire par les rues : du livreur au destinataire pendant la livraison, sinon de la récupération à la livraison.
    const from = r?.position && r?.on_delivery ? r.position : P, veh = s.moto_only || ['L', 'XL'].includes(s.category) ? 'moto' : (r?.vehicle || 'velo');
    const key = from && D ? [from, D].flat().map((x) => Number(x).toFixed(3)).join(',') : '';
    if (key && key !== roadKey) {
      roadKey = key;
      const rr = await drawRoad(map, from, D, { vehicle: veh, color: r?.position && r?.on_delivery ? '#e8890c' : '#1a6fa3' });
      if (view !== 'track' || roadKey !== key) { rr?.layer.remove(); return; }
      road?.layer.remove(); road = rr;
      const ri = main.querySelector('[data-rinfo]');
      if (ri && rr && !rr.approx) ri.textContent = `🛣️ ${km(rr.km)} · ⏱️ ~${rr.min} min ${veh === 'moto' ? '🏍️' : '🚲'}${r?.position && r?.on_delivery ? ` · ${L2('jusqu\'au destinataire', 'hatrany amin\'ny mpandray')}` : ''}`;
    }
  };
  await tick();
  if (ACTIVE(s)) viewTimer = every(8000, tick, false);
}
