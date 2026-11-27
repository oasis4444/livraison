// Point d'entrée : authentification puis interface selon le rôle.
import { state, t, setLang, api, esc, $, bind, toast, toastErr, langSwitch, TOKEN_KEY, tokenKeyFor } from './core.js';

setLang(state.lang);
const app = $('#app');
// Espace livreur séparé : /livreur (connexion livreur uniquement, application installable à part).
const COURIER_SPACE = location.pathname.replace(/\/+$/, '') === '/livreur';
// Lien « Alefa » depuis un logiciel de vente : /envoyer?ref=…&nom=…&tel=…&adresse=…&valeur=…
if (location.pathname.replace(/\/+$/, '') === '/envoyer') {
  sessionStorage.setItem('alefa_send', location.search.slice(1));
  history.replaceState(null, '', '/');
}
if (COURIER_SPACE) {
  $('#manifest').href = '/manifest-livreur.webmanifest';
  document.title = 'Alefa Livreur';
  document.querySelector('meta[name=theme-color]').content = '#0f2638';
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Suivi public d'un colis : /suivi/<jeton> (sans compte, position du livreur visible uniquement pendant la livraison).
const TRACK = location.pathname.match(/^\/suivi\/([A-Za-z0-9_-]{8,40})\/?$/);
const TRACK_FIND = /^\/suivi\/?$/.test(location.pathname);
// « Suivre mon colis » : numéro du colis ou de la commande + téléphone → carte en direct (sans compte).
function trackFindView() {
  const mg = state.lang === 'mg', q = new URLSearchParams(location.search);
  app.className = 'auth';
  app.innerHTML = `<div class="auth-card stack">
    <div class="row between"><div class="row" style="gap:8px"><img src="/icon.svg" alt="" style="width:34px"><b>Alefa<i class="brand-mg"><b>.</b>mg</i></b></div>${langSwitch()}</div>
    <h2>📍 ${mg ? 'Arahina ny colis-ko' : 'Suivre mon colis'}</h2>
    <form class="stack" data-f>
      <label class="field"><span>${mg ? 'Laharan\'ny colis na ny baiko' : 'Numéro du colis ou de la commande'}</span><input class="input" name="ref" required placeholder="AL7X2K9QP · L-00004" value="${esc(q.get('ref') || '')}" autocapitalize="characters"></label>
      <label class="field"><span>${mg ? 'Laharan\'ny finday (mpandray na mpandefa)' : 'Votre téléphone (destinataire ou expéditeur)'}</span><input class="input" name="phone" type="tel" required placeholder="034 12 345 67"></label>
      <button class="btn primary lg block">${mg ? 'Jereo' : 'Voir où est mon colis'}</button>
    </form>
    <p class="small muted" style="text-align:center"><a href="/">${mg ? '← Hiditra' : '← Connexion'}</a></p></div>`;
  bind(app, { lang: (el) => { setLang(el.dataset.l); trackFindView(); } });
  app.querySelector('[data-f]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { const r = await api('GET', `/api/track-find?ref=${encodeURIComponent(f.get('ref'))}&phone=${encodeURIComponent(f.get('phone'))}`); location.href = `/suivi/${r.token}`; }
    catch (err) { toastErr(err); }
  });
}
async function trackView(token) {
  const core = await import('./core.js');
  const mg = state.lang === 'mg';
  app.className = '';
  app.innerHTML = `<div style="display:flex;flex-direction:column;height:100dvh;width:100%">
    <div style="padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--line);background:var(--card)"><img src="/icon.svg" alt="" style="width:34px"><div class="grow"><b>Alefa</b> <span class="muted small">${mg ? 'Fanarahana entana' : 'Suivi de colis'}</span><div class="small" data-h>…</div></div>${langSwitch()}</div>
    <div data-map style="flex:1;min-height:300px"></div>
    <div style="padding:12px 16px;background:var(--card);border-top:1px solid var(--line);max-height:60vh;overflow:auto" data-info>…</div></div>`;
  bind(app, { lang: (el) => { setLang(el.dataset.l); trackView(token); } });
  const map = core.makeMap(app.querySelector('[data-map]'), { zoom: 13, zoomControl: true });
  core.chatBubble('guest', { cls: 'trk-bub' });
  const mk = {}; let fitted = false, reschedOpen = false;
  const tick = async () => {
    let r; try { r = await api('GET', `/api/track/${token}`); } catch (e) { app.querySelector('[data-info]').textContent = e.message; return; }
    app.querySelector('[data-h]').innerHTML = `<b>${esc(r.ref)}</b>${r.external_ref ? ` · ${esc(r.external_ref)}` : ''}`;
    const eta = r.eta && !r.confirmed ? Math.max(1, Math.round((r.eta - Date.now()) / 60e3)) : null;
    if (reschedOpen) return; // ne pas effacer le choix d'un nouveau créneau en cours
    const fmt = (t) => `${new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${core.time(t)}`;
    const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
    // Titre écrit pour le client : « Parti du centre » (le livreur va chercher le colis) ne doit pas faire croire que le colis arrive.
    const STEP_TXT = {
      pending: ['Commande reçue — un livreur va être attribué', 'Voaray ny baiko — hisy livreur voatendry tsy ho ela'],
      scheduled: ['Récupération programmée', 'Voalahatra ny fakana ny entana'],
      departed: ['Le livreur part récupérer le colis', 'Handeha haka ny entana ny livreur'],
      at_pickup: ['Le livreur est chez l\'expéditeur', 'Eo amin\'ny mpandefa ny livreur'],
      to_centre: ['Colis récupéré — en route vers le centre Alefa', 'Voaray ny entana — mankany amin\'ny centre Alefa'],
      at_centre: ['Au centre Alefa — bientôt en livraison', 'Ao amin\'ny centre Alefa — ho aterina tsy ho ela'],
      picked_up: ['Colis récupéré — bientôt en route vers vous', 'Voaray ny entana — ho entina aminao tsy ho ela'],
      en_route: ['En route vers vous', 'Eny an-dalana ho aminao'],
      nearby: ['Le livreur arrive !', 'Efa akaiky ny livreur !'],
      awaiting_recipient: ['Colis remis — confirmation en cours', 'Natolotra ny entana — eo am-panamarinana'],
      awaiting_courier: ['Colis remis — confirmation en cours', 'Natolotra ny entana — eo am-panamarinana'],
      delivered: ['Livré — merci d\'avoir choisi Alefa', 'Tonga — misaotra nisafidy an\'i Alefa'],
      refused: ['Refusé par le destinataire', 'Nolavin\'ny mpandray'],
      returning: ['Retour vers l\'expéditeur', 'Haverina amin\'ny mpandefa'],
      returned: ['Rendu à l\'expéditeur', 'Naverina tamin\'ny mpandefa'],
      cancelled: ['Envoi annulé', 'Nofoanana ny fandefasana'],
    };
    const KO = ['refused', 'returning', 'returned', 'cancelled'];
    const ko = KO.includes(r.step), over = ko || r.step === 'delivered';
    const title = STEP_TXT[r.step]?.[mg ? 1 : 0] || r.step_label || r.step;
    const TL = { received: mg ? 'Voaray ny baiko' : 'Commande reçue', picked: mg ? 'Nalaina' : 'Récupéré', centre: mg ? 'Ao amin\'ny centre' : 'Au centre', delivery: mg ? 'Ho aminao' : 'En livraison', delivered: mg ? 'Tonga' : 'Livré' };
    // Heure lisible : « 14:32 » aujourd'hui, « hier 09:10 », sinon « 23/11 16:26 ».
    const when = (t) => {
      const d = new Date(t), today = new Date(), y = new Date(Date.now() - 864e5);
      if (d.toDateString() === today.toDateString()) return core.time(t);
      if (d.toDateString() === y.toDateString()) return `${mg ? 'omaly' : 'hier'} ${core.time(t)}`;
      return fmt(t);
    };
    const tl = r.timeline || [];
    const cur = over ? -1 : tl.findIndex((x) => !x.at); // étape en cours = la première pas encore faite
    const timeline = `<div class="trk">${tl.map((x, i) => {
      const last = i === tl.length - 1, isKo = last && ko;
      const cls = isKo ? 'ko' : x.at ? 'done' : i === cur ? 'cur' : '';
      const label = isKo ? (mg ? 'Tsy tonga' : r.step === 'cancelled' ? 'Annulé' : 'Retour') : TL[x.k] || x.label;
      // Sous l'étape à venir : l'heure d'arrivée estimée si on la connaît, sinon « en cours » (jamais une heure passée).
      const sub = x.at ? when(x.at) : i !== cur ? '' : r.eta && x.k === 'delivered' ? `${mg ? 'tokony' : 'vers'} ${core.time(r.eta)}` : (mg ? 'mandeha' : 'en cours');
      return `<div class="trk-s ${cls}"><div class="trk-d">${x.at && !isKo ? '✓' : isKo ? '✕' : ''}</div><div class="trk-l">${esc(label)}</div><div class="trk-t">${sub}</div></div>`;
    }).join('')}</div>`;
    const stale = r.position_at && Date.now() - r.position_at > 2 * 60e3;
    app.querySelector('[data-info]').innerHTML = `<div class="trk-title ${ko ? 'ko' : r.step === 'delivered' ? 'ok' : ''}">${esc(title)}</div>${timeline}
      ${r.on_delivery && !r.done_at && !r.province ? `<div class="card" style="background:var(--sun-soft);border:0;text-align:center;margin:6px 0">
          <div class="small">${mg ? 'Aloa amin\'ny livreur' : 'À payer au livreur'}</div><div style="font-size:2rem;font-weight:900">${core.ar(r.amount_to_pay)}</div>
          ${r.amount_to_pay ? `<div class="tiny muted">${r.value ? `${mg ? 'entana' : 'marchandise'} ${core.ar(r.value)} + ` : ''}${mg ? 'frais' : 'frais'} ${core.ar(r.fee)}</div>` : `<div class="tiny muted">📱 ${mg ? 'efa voaloa daholo' : 'tout est déjà payé'}</div>`}
          ${r.pin ? `<div class="small" style="margin-top:8px">${mg ? 'Kaody omena ny livreur' : 'Code à donner au livreur'}</div><div style="font-size:2.4rem;font-weight:900;letter-spacing:.35em">${esc(r.pin)}</div>` : ''}
          ${r.courier_phone ? `<a class="btn primary lg block" href="tel:${esc(r.courier_phone)}" style="margin-top:8px">📞 ${mg ? 'Antsoy ny livreur' : 'Appeler le livreur'}</a>` : ''}</div>` : ''}
      ${r.can_confirm ? `<button class="btn primary lg block" data-recv style="margin:8px 0;white-space:normal;line-height:1.3">✅ ${mg ? 'Tonga ny entana — alefaso ny kaody amin\'ny livreur' : 'J\'ai reçu mon colis — envoyer le code au livreur'}</button>` : ''}
      ${r.confirmed && !r.done_at ? `<div class="small" style="color:var(--green)"><b>✅ ${mg ? 'Voaray ny fanamarinanao, nalefa tany amin\'ny livreur ny kaody' : 'Merci ! Le code a été transmis au livreur'}</b></div>` : ''}
      ${r.contents || r.size ? `<div class="small muted">📦 ${esc([r.contents, r.size].filter(Boolean).join(' · '))}${r.category ? ` · ${esc(r.category)}` : ''}${r.fragile ? ' · fragile' : ''}</div>` : ''}
      ${r.province ? `<div class="small">🚌 ${mg ? 'Alefa any' : 'Envoi vers'} <b>${esc(r.province.city)}</b> · ${esc(r.province.coop)}${r.province.plate ? `<br>🚐 ${mg ? 'Fiara' : 'Véhicule'} <b>${esc(r.province.plate)}</b>${r.province.driver_phone ? ` · 📞 <a href="tel:${esc(r.province.driver_phone)}">${esc(core.phoneFmt(r.province.driver_phone))}</a>` : ''} · ${mg ? 'saran-dalana' : 'transport'} <b>${core.ar(r.province.fee || 0)}</b> ${r.province.fee_status === 'pa' ? `<b>PA</b> (${mg ? 'aloa rehefa tonga' : 'à payer à l\'arrivée'})` : `✅ ${mg ? 'efa voaloa' : 'déjà payé'}`}` : ''}</div>`
        : !r.on_delivery && r.amount_to_pay != null && !r.done_at ? `<div class="small">💵 ${mg ? 'Aloa amin\'ny livreur' : 'À payer au livreur'} : <b>${core.ar(r.amount_to_pay)}</b>${r.value_paid ? ` <span class="muted">(📱 ${mg ? 'efa voaloa daholo' : 'tout est déjà payé'})</span>` : ''}</div>` : ''}
      ${r.windows && !r.done_at ? `<div class="small">🏁 ${mg ? 'Ho tonga' : 'Livraison prévue'} : <b>${new Date(r.windows.delivery[0]).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${core.time(r.windows.delivery[0])}–${core.time(r.windows.delivery[1])}</b></div>` : ''}
      ${r.reschedule?.length ? `<button class="btn block" data-resched style="margin-top:6px">🕘 ${mg ? 'Tsy eo aho / hanova ora' : 'Je ne suis pas disponible / changer l\'heure'}</button>` : ''}
      ${r.relay && ['to_centre', 'at_centre'].includes(r.step) ? `<div class="small muted">🏢 ${mg ? 'Mandalo ao amin\'ny centre Alefa ny colis-nao, avy eo livreur iray hafa no hitondra azy any aminao.' : 'Votre colis passe par le centre Alefa, puis un autre livreur vous l\'apporte.'}</div>` : ''}
      <div class="small muted">${r.courier ? `${core.vehIcon(r.vehicle)} ${esc(r.courier)}` : r.done_at ? '' : (mg ? 'Mbola miandry livreur' : 'Livreur bientôt attribué')}${eta ? ` · ${mg ? 'Tonga ao anatin\'ny' : 'Arrivée dans'} ~${eta} min` : ''}
        ${r.position_at ? ` · ${mg ? 'toerana' : 'position'} ${mg ? 'tamin\'ny' : 'il y a'} ${ago(r.position_at)}${stale ? ` <span style="color:var(--orange)">(${mg ? 'mety tsy misy réseau ny livreur' : 'le livreur a peut-être perdu le réseau'})</span>` : ''}` : ''}</div>`;
    const rs = app.querySelector('[data-resched]');
    if (rs) rs.onclick = () => {
      reschedOpen = true;
      const box = document.createElement('div');
      box.className = 'card stack'; box.style.marginTop = '6px';
      box.innerHTML = `<b class="small">${mg ? 'Safidio ny ora mety aminao' : 'Choisissez un créneau qui vous convient'}</b>${r.reschedule.map((w) => `<button class="btn block" data-w="${w.from}">${new Date(w.from).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' })} · ${core.time(w.from)}–${core.time(w.to)}</button>`).join('')}<button class="btn ghost block" data-wx>${mg ? 'Hiverina' : 'Annuler'}</button>`;
      rs.replaceWith(box);
      box.onclick = async (e) => {
        if (e.target.closest('[data-wx]')) { reschedOpen = false; return tick(); }
        const b = e.target.closest('[data-w]'); if (!b) return;
        try { await api('POST', `/api/track/${token}/reschedule`, { deliver_at: Number(b.dataset.w) }); reschedOpen = false; await tick(); } catch (err) { box.insertAdjacentHTML('beforeend', `<div class="small" style="color:var(--red)">${esc(err.message)}</div>`); }
      };
    };
    const rb = app.querySelector('[data-recv]');
    if (rb) rb.onclick = async () => {
      rb.disabled = true;
      try { await api('POST', `/api/track/${token}/confirm`, {}); await tick(); } catch (e) { rb.disabled = false; app.querySelector('[data-info]').insertAdjacentHTML('beforeend', `<div class="small" style="color:var(--red)">${esc(e.message)}</div>`); }
    };
    if (!map) return;
    const pts = [];
    if (r.pickup) { core.upsertMarker(map, mk, 'a', r.pickup, core.icons.a()); pts.push(r.pickup); }
    if (r.drop) { core.upsertMarker(map, mk, 'b', r.drop, core.icons.b()); pts.push(r.drop); }
    if (r.position) { core.upsertMarker(map, mk, 'c', r.position, core.icons.bike('', r.courier || '', r.vehicle)); pts.push(r.position); }
    else if (mk.c) { mk.c.remove(); delete mk.c; }
    if (!fitted && pts.length) { fitted = true; pts.length === 1 ? map.setView(pts[0], 15) : map.fitBounds(pts, { padding: [40, 40] }); }
    // Itinéraire par les rues : du livreur jusqu'à vous pendant la livraison, sinon récupération → livraison.
    const from = r.position && r.on_delivery ? r.position : r.pickup;
    const key = from && r.drop ? [from, r.drop].flat().map((x) => Number(x).toFixed(3)).join(',') : '';
    if (key && key !== roadKey) {
      roadKey = key;
      const rr = await core.drawRoad(map, from, r.drop, { vehicle: r.vehicle, color: r.position && r.on_delivery ? '#e8890c' : '#1a6fa3' });
      if (roadKey !== key) rr?.layer.remove(); else { road?.layer.remove(); road = rr; }
    }
  };
  let road = null, roadKey = '';
  await tick(); setInterval(tick, 8000);
}

async function boot() {
  if (TRACK) return trackView(TRACK[1]);
  if (TRACK_FIND) return trackFindView();
  state.config = await api('GET', '/api/config').catch(() => ({ zones: [] }));
  if (state.token) {
    try {
      const r = await api('GET', '/api/me');
      state.user = r.user; state.courier = r.courier; state.axe = r.axe; state.terms = r.terms;
      if (r.user.lang && !localStorage.getItem('alefa_lang')) setLang(r.user.lang);
    } catch { state.token = null; localStorage.removeItem(TOKEN_KEY); }
  }
  app.className = '';
  if (!state.user) {
    if (COURIER_SPACE) return courierLoginView();
    // Visiteur : page d'accueil. Application installée ou lien #connexion / #inscription : directement le formulaire.
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
    const h = location.hash;
    if (standalone || h === '#connexion' || h === '#inscription') return authView(h === '#inscription' ? 'register' : 'login');
    return showHome();
  }
  const role = state.user.role;
  // Un seul lien pour tous : chacun est envoyé vers son espace selon son rôle.
  // La session est rangée avec l'espace de son rôle, puis on y va.
  const move = (to) => { localStorage.setItem(tokenKeyFor(role), state.token); if (tokenKeyFor(role) !== TOKEN_KEY) localStorage.removeItem(TOKEN_KEY); location.replace(to); };
  if (COURIER_SPACE && role !== 'courier') return move('/');
  if (!COURIER_SPACE && role === 'courier') return move('/livreur');
  const mod = await import(role === 'admin' ? './admin.js' : role === 'courier' ? './courier.js' : './space.js');
  mod.mount(app);
  if (role === 'client' && state.terms && !state.terms.accepted) import('./terms.js').then((m) => m.ensureTerms(state.terms, () => { state.terms.accepted = true; })).catch(() => {});
}

function courierLoginView() {
  app.innerHTML = `<div class="auth courier-auth"><div class="auth-card">
    ${langSwitch()}
    <div class="auth-brand"><img src="/icon.svg" alt=""><div><b>Alefa <span style="color:var(--green)">Livreur</span></b><span class="muted small">${t('courier_space')}</span></div></div>
    <form class="stack" data-form autocomplete="on">
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="034 12 345 67" required autocomplete="tel"></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
      <div class="card small" style="background:var(--sun-soft);border:0">📍 ${t('gps_required_login')}</div>
      <button class="btn primary lg block" type="submit">${t('sign_in')}</button>
      <p class="small muted" style="text-align:center">${t('courier_contact')}</p>
    </form></div></div>`;
  bind(app, { lang: (el) => { setLang(el.dataset.l); courierLoginView(); } });
  const form = app.querySelector('[data-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/login', Object.fromEntries(new FormData(form)));
      localStorage.setItem(tokenKeyFor(r.user.role), r.token); state.token = r.token;
      boot();
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

async function showHome() {
  const { mountHome } = await import('./home.js');
  window.scrollTo(0, 0);
  return mountHome(app, { onAuth: (m) => { history.replaceState(null, '', m === 'register' ? '#inscription' : '#connexion'); authView(m); } });
}

function authView(mode = 'login', role = 'client') {
  app.className = '';
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="row between" style="margin-bottom:6px"><a href="/" class="small" data-act="home" style="text-decoration:none;font-weight:600">← ${state.lang === 'mg' ? 'Fandraisana' : 'Accueil'}</a>${langSwitch()}</div>
    <div class="auth-brand"><img src="/icon.svg" alt=""><div><b>Alefa<i class="brand-mg"><b>.</b>mg</i></b><span class="muted small">${t('tagline')}</span></div></div>
    <div class="seg" style="margin-bottom:16px"><button data-act="mode" data-m="login" class="${mode === 'login' ? 'on' : ''}">${t('login')}</button><button data-act="mode" data-m="register" class="${mode === 'register' ? 'on' : ''}">${t('register')}</button></div>
    <form class="stack" data-form autocomplete="on">
      ${mode === 'register' ? `
        <label class="field"><span>${t('name')}</span><input class="input" name="name" required minlength="2" autocomplete="name"></label>` : ''}
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="034 12 345 67" required autocomplete="tel"></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required minlength="${mode === 'register' ? 6 : 1}" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"></label>
      ${mode === 'register' ? `
        <label class="row small"><input type="checkbox" name="is_business"> ${t('business')}</label>
        <label class="field hidden" data-company><span>${t('company')}</span><input class="input" name="company"></label>
        <div class="card" style="background:var(--bg);border:0" data-terms-sum><span class="small muted">…</span></div>
        <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="accept_terms" data-accept> <span>${state.lang === 'mg' ? 'Novakiako ary ekeko ny' : 'J\'ai lu et j\'accepte les'} <a href="#" data-act="terms">${state.lang === 'mg' ? 'fepetra sy ny saran\'ny fanaterana' : 'conditions de livraison et les tarifs'}</a> ${state.lang === 'mg' ? 'Alefa.' : 'd\'Alefa.'}</span></label>` : ''}
      <button class="btn primary lg block" type="submit">${mode === 'register' ? t('create_account') : t('sign_in')}</button>
      <p class="small muted" style="text-align:center">📍 <a href="/suivi">${state.lang === 'mg' ? 'Arahina ny colis-ko' : 'Suivre mon colis'}</a> · 🚲 <a href="/livreur">${t('courier_space_link')}</a></p>
    </form>
  </div></div>`;
  bind(app.firstElementChild, { // sur le contenu (remplacé à chaque affichage) : pas d'écouteurs en double
    mode: (el) => { history.replaceState(null, '', el.dataset.m === 'register' ? '#inscription' : '#connexion'); authView(el.dataset.m, role); },
    home: (el, e) => { e?.preventDefault(); history.replaceState(null, '', '/'); showHome(); },
    role: (el) => authView('register', el.dataset.r),
    lang: (el) => { setLang(el.dataset.l); authView(mode, role); },
    terms: () => import('./terms.js').then((m) => m.showConditions()),
  });
  if (mode === 'register') import('./terms.js').then(async (m) => { const c = await m.loadConditions(); const el = app.querySelector('[data-terms-sum]'); if (el) el.innerHTML = m.summaryHtml(c); }).catch(() => {});
  const form = app.querySelector('[data-form]');
  form.is_business?.addEventListener('change', (e) => app.querySelector('[data-company]').classList.toggle('hidden', !e.target.checked));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    data.is_business = !!data.is_business;
    data.lang = state.lang;
    if (mode === 'register') {
      data.role = 'client';
      data.accept_terms = !!form.querySelector('[data-accept]')?.checked;
      if (!data.accept_terms) { btn.disabled = false; return toast(state.lang === 'mg' ? 'Asio marika ny « ekeko ny fepetra »' : 'Cochez « J\'ai lu et j\'accepte les conditions »', 'err'); }
    }
    try {
      const r = await api('POST', mode === 'register' ? '/api/auth/register' : '/api/auth/login', data);
      localStorage.setItem(tokenKeyFor(r.user.role), r.token);
      state.token = r.token;
      if (/^#(connexion|inscription)$/.test(location.hash)) history.replaceState(null, '', '/');
      toast(`Tonga soa, ${r.user.name} !`, 'ok');
      boot();
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

boot().catch((e) => { app.className = ''; app.innerHTML = `<div class="auth"><div class="auth-card"><h2>${esc(t('error'))}</h2><p>${esc(e.message)}</p><a class="btn primary" href="/">↻</a></div></div>`; });
