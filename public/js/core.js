// Noyau commun : API, session, traductions FR/MG, carte, notifications, interface.

// Une session par espace : l'administration/les clients (/) et les livreurs (/livreur) ne s'écrasent plus
// quand on les ouvre dans le même navigateur.
export const TOKEN_KEY = /^\/livreur\/?$/.test(location.pathname) ? 'alefa_token_livreur' : 'alefa_token';
export const tokenKeyFor = (role) => (role === 'courier' ? 'alefa_token_livreur' : 'alefa_token');
export const state = { token: localStorage.getItem(TOKEN_KEY), user: null, courier: null, config: null, lang: localStorage.getItem('alefa_lang') || 'fr', lastNotif: 0 };

// ---------------------------------------------------------------- i18n
const D = {
  fr: {
    tagline: 'Livraison de colis à vélo et à moto, Antananarivo', login: 'Connexion', register: 'Inscription', phone: 'Numéro de téléphone', password: 'Mot de passe',
    name: 'Nom complet', iam: 'Je suis', client: 'Client', courier: 'Livreur', cin: 'Numéro CIN', address: 'Adresse', emergency: 'Contact d\'urgence',
    business: 'Compte entreprise (boutique, société)', company: 'Nom de l\'entreprise', create_account: 'Créer mon compte', sign_in: 'Se connecter',
    no_account: 'Pas encore de compte ?', have_account: 'Déjà inscrit ?', logout: 'Déconnexion',
    where_from: 'Lieu de récupération', where_to: 'Lieu de livraison', my_position: 'Ma position', pick_on_map: 'Choisir sur la carte',
    what: 'Que faut-il livrer ?', colis: 'Colis', documents: 'Documents', marchandises: 'Marchandises', repas: 'Repas', autre: 'Autre',
    details: 'Détails (facultatif)', recipient: 'Destinataire', recipient_phone: 'Tél. destinataire', your_price: 'Votre prix', suggested: 'Prix conseillé',
    payment: 'Paiement', cash: 'Espèces', mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', schedule: 'Programmer',
    now: 'Maintenant', promo: 'Code promo', find_courier: 'Trouver un livreur', searching: 'Recherche de livreurs…', offers: 'Offres reçues',
    no_offers: 'Les livreurs à proximité voient votre demande. Les offres apparaîtront ici.', raise: 'Augmenter le prix', accept: 'Accepter', cancel: 'Annuler',
    cancel_request: 'Annuler la demande', your_courier: 'Votre livreur', call: 'Appeler', chat: 'Message', send: 'Envoyer', pin_title: 'Code de livraison',
    pin_help: 'Donnez ce code au livreur à la réception du colis.', st_open: 'En attente', st_assigned: 'Livreur en route', st_picked_up: 'Colis récupéré',
    st_delivered: 'Livrée', st_cancelled: 'Annulée', st_expired: 'Expirée', rate: 'Évaluez votre livreur', comment: 'Commentaire', thanks: 'Merci !',
    home: 'Accueil', history: 'Historique', favorites: 'Favoris', profile: 'Profil', complaint: 'Réclamation', sos: 'SOS', sos_confirm: 'Envoyer une alerte SOS à l\'équipe Alefa avec votre position ?',
    sos_sent: 'Alerte SOS envoyée. L\'équipe vous contacte.', min: 'min', eta: 'Arrivée estimée', distance: 'Distance', couriers_near: 'livreurs à proximité',
    available: 'Disponible', unavailable: 'Indisponible', requests: 'Demandes', wallet: 'Revenus', go_online: 'Passez disponible pour recevoir des demandes.',
    no_requests: 'Aucune demande à proximité pour le moment.', propose: 'Proposer', accept_price: 'Accepter', my_offer: 'Votre offre', waiting_client: 'En attente du client',
    to_pickup: 'jusqu\'au départ', picked: 'Colis récupéré', delivered_btn: 'Colis livré', enter_pin: 'Code PIN du destinataire', navigate: 'Itinéraire',
    pending_validation: 'Compte en attente de validation', pending_help: 'L\'équipe Alefa vérifie vos documents (CIN, vélo). Vous serez notifié dès la validation.',
    balance: 'Solde', today: 'Aujourd\'hui', week: '7 jours', total: 'Total', commission: 'Commission', transactions: 'Opérations', save: 'Enregistrer',
    language: 'Langue', change_password: 'Changer le mot de passe', current_password: 'Mot de passe actuel', new_password: 'Nouveau mot de passe',
    add_favorite: 'Ajouter cette adresse', label: 'Nom (Maison, Bureau…)', empty: 'Rien pour le moment.', details_btn: 'Détails', withdraw: 'Retirer',
    gps_denied: 'Activez la localisation GPS pour continuer.', set_points: 'Choisissez le départ et l\'arrivée.', tap_map: 'Touchez la carte pour placer le point',
    confirm_point: 'Valider ce point', scheduled_for: 'Programmée pour', describe_problem: 'Décrivez le problème', sent: 'Envoyé', error: 'Erreur',
    notifications: 'Notifications', mark_read: 'Tout marquer comme lu', new_offer: 'Nouvelle offre', abandon: 'Se désister', reason: 'Motif',
    courier_space: 'Espace livreur', courier_space_link: 'Espace livreur →', gps_required_login: 'Le GPS de votre téléphone doit être activé pour travailler.',
    gps_off_title: 'Activez votre GPS', gps_off_text: 'Votre position est obligatoire : sans GPS, vous ne recevez aucune demande et les clients ne vous voient pas.', gps_denied_title: 'Accès à la position refusé', gps_retry: 'Réessayer', gps_searching: 'Recherche du signal GPS…', gps_ok: 'GPS actif',
    gps_step_android: 'Android : faites glisser le haut de l\'écran → touchez « Position / Localisation » pour l\'activer.', gps_step_iphone: 'iPhone : Réglages → Confidentialité → Service de localisation → Activé (et Safari/Chrome : « Lorsque l\'app est active »).', gps_step_browser: 'Navigateur : touchez 🔒 à gauche de l\'adresse → Autorisations → Position → Autoriser, puis rechargez.',
    courier_contact: 'Vous êtes livreur ? Les comptes livreurs sont créés par l\'administration Alefa.', my_axe: 'Mon axe', next_axe: 'Ensuite', off_schedule: 'Hors de vos horaires de travail', free_axe: 'Toute la zone',
    pay_to: 'Payez au numéro', subscription_until: 'Abonnement valide jusqu\'au', offline_mode: 'Connexion perdue — dernière position affichée',
  },
  mg: {
    tagline: 'Fanaterana entana amin\'ny bisikileta sy moto, Antananarivo', login: 'Hiditra', register: 'Hisoratra anarana', phone: 'Laharana finday', password: 'Teny miafina',
    name: 'Anarana feno', iam: 'Izaho dia', client: 'Mpanjifa', courier: 'Mpitondra entana', cin: 'Laharana CIN', address: 'Adiresy', emergency: 'Olona antsoina raha misy loza',
    business: 'Kaonty orinasa (fivarotana, orinasa)', company: 'Anaran\'ny orinasa', create_account: 'Hamorona kaonty', sign_in: 'Hiditra',
    no_account: 'Mbola tsy manana kaonty?', have_account: 'Efa manana kaonty?', logout: 'Hivoaka',
    where_from: 'Toerana halaina', where_to: 'Toerana hanaterana', my_position: 'Ny toerana misy ahy', pick_on_map: 'Hifidy amin\'ny sarintany',
    what: 'Inona no haterina?', colis: 'Fonosana', documents: 'Taratasy', marchandises: 'Entana', repas: 'Sakafo', autre: 'Hafa',
    details: 'Antsipiriany (tsy voatery)', recipient: 'Mpandray', recipient_phone: 'Finday mpandray', your_price: 'Ny vidiny atolotrao', suggested: 'Vidiny soso-kevitra',
    payment: 'Fandoavam-bola', cash: 'Vola an-tanana', mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', schedule: 'Hikasa fotoana',
    now: 'Izao', promo: 'Kaody fihenam-bidy', find_courier: 'Hitady mpitondra', searching: 'Mitady mpitondra…', offers: 'Tolotra voaray',
    no_offers: 'Hitan\'ny mpitondra eo akaiky ny fangatahanao. Hiseho eto ny tolotra.', raise: 'Hampiakatra ny vidiny', accept: 'Ekena', cancel: 'Hanafoana',
    cancel_request: 'Hanafoana ny fangatahana', your_courier: 'Ny mpitondra anao', call: 'Hiantso', chat: 'Hafatra', send: 'Alefa', pin_title: 'Kaody fanaterana',
    pin_help: 'Omeo ny mpitondra io kaody io rehefa voaray ny entana.', st_open: 'Miandry', st_assigned: 'Eny an-dalana ny mpitondra', st_picked_up: 'Voaray ny entana',
    st_delivered: 'Tonga', st_cancelled: 'Nofoanana', st_expired: 'Lany daty', rate: 'Omeo naoty ny mpitondra', comment: 'Hevitra', thanks: 'Misaotra!',
    home: 'Fandraisana', history: 'Tantara', favorites: 'Tiana', profile: 'Mombamomba', complaint: 'Fitarainana', sos: 'SOS', sos_confirm: 'Handefa fanairana SOS any amin\'ny ekipa Alefa miaraka amin\'ny toerana misy anao?',
    sos_sent: 'Lasa ny SOS. Hiantso anao ny ekipa.', min: 'min', eta: 'Fotoana hahatongavana', distance: 'Halavirana', couriers_near: 'mpitondra eo akaiky',
    available: 'Vonona', unavailable: 'Tsy vonona', requests: 'Fangatahana', wallet: 'Vola miditra', go_online: 'Ataovy vonona ianao mba hahazo fangatahana.',
    no_requests: 'Tsy misy fangatahana eo akaiky amin\'izao.', propose: 'Hanolotra', accept_price: 'Ekena', my_offer: 'Ny tolotrao', waiting_client: 'Miandry ny mpanjifa',
    to_pickup: 'mankany amin\'ny toerana halaina', picked: 'Voaray ny entana', delivered_btn: 'Tonga ny entana', enter_pin: 'Kaody PIN an\'ny mpandray', navigate: 'Lalana',
    pending_validation: 'Miandry fankatoavana ny kaontinao', pending_help: 'Hamarinin\'ny ekipa Alefa ny taratasinao (CIN, bisikileta). Hampandrenesina ianao raha vita.',
    balance: 'Ambim-bola', today: 'Androany', week: '7 andro', total: 'Totaliny', commission: 'Komisiona', transactions: 'Fihetsiky ny vola', save: 'Tehirizina',
    language: 'Fiteny', change_password: 'Hanova teny miafina', current_password: 'Teny miafina ankehitriny', new_password: 'Teny miafina vaovao',
    add_favorite: 'Tehirizina ity adiresy ity', label: 'Anarana (Trano, Birao…)', empty: 'Tsy misy aloha.', details_btn: 'Antsipiriany', withdraw: 'Hanala',
    gps_denied: 'Alefaso ny GPS hanohizana.', set_points: 'Fidio ny toerana halaina sy hanaterana.', tap_map: 'Tsindrio ny sarintany hametrahana ny teboka',
    confirm_point: 'Hamafisina ity toerana ity', scheduled_for: 'Voakasa amin\'ny', describe_problem: 'Lazao ny olana', sent: 'Lasa', error: 'Nisy olana',
    notifications: 'Fampandrenesana', mark_read: 'Novakiana daholo', new_offer: 'Tolotra vaovao', abandon: 'Hiala', reason: 'Antony',
    courier_space: 'Toerana ho an\'ny mpitondra entana', courier_space_link: 'Ho an\'ny mpitondra entana →', gps_required_login: 'Tsy maintsy mirehitra ny GPS-n\'ny findainao vao afaka miasa.',
    gps_off_title: 'Alefaso ny GPS', gps_off_text: 'Tsy maintsy fantatra ny toerana misy anao: raha tsy misy GPS, tsy mahazo fangatahana ianao ary tsy hitan\'ny mpanjifa.', gps_denied_title: 'Tsy nomena alalana ny toerana', gps_retry: 'Andramo indray', gps_searching: 'Mitady ny GPS…', gps_ok: 'Mandeha ny GPS',
    gps_step_android: 'Android: sintony midina ny ambony efijery → tsindrio « Position / Localisation » hampandehanana azy.', gps_step_iphone: 'iPhone: Réglages → Confidentialité → Service de localisation → Activé.', gps_step_browser: 'Navigateur: tsindrio ny 🔒 eo akaikin\'ny adiresy → Autorisations → Position → Autoriser, dia avereno sokafana.',
    courier_contact: 'Mpitondra entana ianao? Ny administration Alefa no mamorona ny kaontin\'ny mpitondra.', my_axe: 'Ny faritra iasako', next_axe: 'Manaraka', off_schedule: 'Ivelan\'ny ora fiasanao', free_axe: 'Faritra rehetra',
    pay_to: 'Aloavy amin\'ny laharana', subscription_until: 'Manan-kery hatramin\'ny', offline_mode: 'Tapaka ny fifandraisana — toerana farany no aseho',
  },
};
export const t = (k) => D[state.lang]?.[k] ?? D.fr[k] ?? k;
export function setLang(l) { state.lang = l === 'mg' ? 'mg' : 'fr'; localStorage.setItem('alefa_lang', state.lang); document.documentElement.lang = state.lang; }

// ---------------------------------------------------------------- utilitaires
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ar = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} Ar`);
export const km = (n) => (n == null ? '—' : n < 1 ? `${Math.round(n * 1000)} m` : `${(Math.round(n * 10) / 10).toString().replace('.', ',')} km`);
export const dt = (ms) => (ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const time = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const initials = (n) => (n || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export const stars = (r) => (r == null ? `<span class="muted tiny">Nouveau</span>` : `<span class="stars">★ ${String(r).replace('.', ',')}</span>`);
export const statusPill = (s) => `<span class="status-pill st-${esc(s)}">${esc(t('st_' + s) !== 'st_' + s ? t('st_' + s) : s)}</span>`;
export const phoneFmt = (p) => (p || '').replace(/^\+261(\d{2})(\d{2})(\d{3})(\d{2})$/, '0$1 $2 $3 $4');
export const haversine = (a, b, c, d) => { const R = 6371, r = (x) => (x * Math.PI) / 180; const x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// ---------------------------------------------------------------- API
export async function api(method, path, body) {
  const headers = {};
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    state.offline = true;
    throw Object.assign(new Error(t('offline_mode')), { offline: true });
  }
  state.offline = false;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token) { logout(true); }
  if (res.status === 428 && data.error === 'terms_required') import('./terms.js').then((m) => m.ensureTerms({ accepted: false })).catch(() => {});
  if (!res.ok) throw Object.assign(new Error(data.message || t('error')), { status: res.status, code: data.error });
  return data;
}

export function logout(silent) {
  removeChatBubble();
  // ce téléphone ne reçoit plus les notifications de ce compte
  navigator.serviceWorker?.ready.then((r) => r.pushManager?.getSubscription()).then((sub) => sub && api('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint })).catch(() => {});
  if (!silent) api('POST', '/api/auth/logout').catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  state.token = null; state.user = null;
  stopAll();
  location.hash = '';
  location.reload();
}

// ---------------------------------------------------------------- minuteries
const timers = new Set();
export function every(ms, fn, immediate = true) {
  let stopped = false, busy = false;
  const tick = async () => { if (stopped || busy || document.hidden) return; busy = true; try { await fn(); } catch (e) { if (!e.offline) console.warn(e); } busy = false; };
  if (immediate) tick();
  const id = setInterval(tick, ms);
  const h = { stop: () => { stopped = true; clearInterval(id); timers.delete(h); } };
  timers.add(h);
  return h;
}
export function stopAll() { for (const h of [...timers]) h.stop(); }

// ---------------------------------------------------------------- toasts, modales
export function toast(msg, kind = '', title = '', onClick = null) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = title ? `<b>${esc(title)}</b>${esc(msg)}` : esc(msg);
  if (onClick) { el.style.cursor = 'pointer'; el.style.pointerEvents = 'auto'; el.title = 'Ouvrir'; el.onclick = () => { el.remove(); onClick(); }; }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 3800);
}
export const toastErr = (e) => toast(e.message || String(e), 'err');

export function modal(title, html, { wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-x aria-label="Fermer">✕</button></div><div class="modal-body">${html}</div></div>`;
  const close = () => { back.remove(); onClose?.(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-x]')) close(); });
  $('#modal-root').append(back);
  return { el: back.querySelector('.modal-body'), close };
}

export function confirmBox(text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const m = modal(' ', `<p style="font-size:1.05rem">${esc(text)}</p><div class="row" style="margin-top:16px"><button class="btn grow" data-no>${esc(t('cancel'))}</button><button class="btn grow ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`,
      { onClose: () => resolve(false) });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); };
    m.el.querySelector('[data-yes]').onclick = () => { resolve(true); m.el.closest('.modal-back').remove(); };
  });
}

export function promptBox(title, { label = '', type = 'text', value = '', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const m = modal(title, `<label class="field"><span>${esc(label)}</span><input class="input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" data-v></label>
      <div class="row" style="margin-top:14px"><button class="btn grow" data-no>${esc(t('cancel'))}</button><button class="btn primary grow" data-yes>OK</button></div>`, { onClose: () => resolve(null) });
    const inp = m.el.querySelector('[data-v]');
    setTimeout(() => inp.focus(), 50);
    const ok = () => { const v = inp.value; m.el.closest('.modal-back').remove(); resolve(v); };
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    m.el.querySelector('[data-yes]').onclick = ok;
    m.el.querySelector('[data-no]').onclick = () => m.close();
  });
}

// Lie les boutons [data-act] d'un conteneur à un objet de gestionnaires.
export function bind(root, handlers) {
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const link = e.target.closest('a[href]'); // lien (📞 appeler…) dans une ligne cliquable : on laisse le lien agir
    if (link && link !== el && el.contains(link)) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    if (el.tagName === 'BUTTON') el.disabled = true;
    try { await fn(el, e); } catch (err) { toastErr(err); } finally { if (el.isConnected && el.tagName === 'BUTTON') el.disabled = false; }
  });
}

// ---------------------------------------------------------------- carte (Leaflet + OpenStreetMap)
export const TANA = [-18.9100, 47.5250];
// Fond de carte : OpenFreeMap (vectoriel, net et lisible, sans clé) ; repli automatique sur OpenStreetMap classique.
const OSM_ATTR = '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
function baseLayers() {
  const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
  if (!(webgl && L.maplibreGL && window.maplibregl)) return { 'Plan': osm() };
  const vec = (style) => L.maplibreGL({ style: `https://tiles.openfreemap.org/styles/${style}`, attribution: OSM_ATTR });
  return { 'Plan': vec('liberty'), 'Clair': vec('positron'), 'Classique': osm() };
}
export function makeMap(el, { center = TANA, zoom = 14, zoomControl = false, layers = false } = {}) {
  if (!window.L) { el.innerHTML = '<div style="padding:90px 20px;text-align:center;color:#8399a8">Carte indisponible (connexion)</div>'; return null; }
  const map = L.map(el, { zoomControl, attributionControl: true, center, zoom, preferCanvas: false, maxZoom: 19 });
  const bases = baseLayers();
  const pref = localStorage.getItem('alefa_map') || 'Plan';
  const base = bases[pref] || bases.Plan;
  base.addTo(map);
  // Si le fond vectoriel ne se charge pas (réseau, appareil), on bascule sur la carte classique.
  if (base.getMaplibreMap && bases.Classique) {
    let ok = false;
    try { base.getMaplibreMap()?.once('load', () => { ok = true; }); } catch {}
    setTimeout(() => { if (!ok && map.hasLayer(base)) { map.removeLayer(base); bases.Classique.addTo(map); } }, 9000);
  }
  if (layers && Object.keys(bases).length > 1) {
    L.control.layers(bases, null, { position: 'topright', collapsed: true }).addTo(map);
    map.on('baselayerchange', (e) => { try { localStorage.setItem('alefa_map', e.name); } catch {} });
  }
  satToggle(map, base);
  map.attributionControl.setPrefix(false);
  setTimeout(() => map.invalidateSize(), 120);
  return map;
}
// Bouton « Plan / Satellite » sur toutes les cartes : vue satellite (Esri) avec les noms des rues par-dessus.
function satToggle(map, plan) {
  if (!L.Control || !L.DomUtil || !L.tileLayer) return;
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  let sat = null;
  const mkSat = () => L.layerGroup([
    L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' }),
    L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 18, opacity: .9 }),
    L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 18 }),
  ]);
  const Ctl = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('div', 'map-mode');
      box.innerHTML = '<button type="button" data-m="plan">Plan</button><button type="button" data-m="sat">Satellite</button>';
      L.DomEvent.disableClickPropagation(box);
      const set = (m) => {
        box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
        if (m === 'sat') { sat ||= mkSat(); if (!map.hasLayer(sat)) { sat.addTo(map); if (map.hasLayer(plan)) map.removeLayer(plan); } }
        else { if (sat && map.hasLayer(sat)) map.removeLayer(sat); if (!map.hasLayer(plan)) plan.addTo(map); }
        try { localStorage.setItem('alefa_mapmode', m); } catch {}
      };
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) set(b.dataset.m); });
      setTimeout(() => set(localStorage.getItem('alefa_mapmode') === 'sat' ? 'sat' : 'plan'), 0);
      return box;
    },
  });
  new Ctl({ position: 'topright' }).addTo(map);
}
// Véhicule du livreur : vélo (par défaut) ou moto.
export const vehIcon = (v) => (v === 'moto' ? '🏍️' : '🚲');
export const vehLabel = (v, mg) => (v === 'moto' ? 'Moto' : mg ? 'Bisikileta' : 'Vélo');
const icon = (html, size = [38, 38], anchor) => window.L && L.divIcon({ className: 'mk', html, iconSize: size, iconAnchor: anchor || [size[0] / 2, size[1] / 2] });
export const icons = {
  me: () => icon('<div class="mk-me"></div>', [20, 20]),
  a: () => icon('<div class="mk-pin mk-a"><b>A</b></div>', [34, 34], [17, 34]),
  b: () => icon('<div class="mk-pin mk-b"><b>B</b></div>', [34, 34], [17, 34]),
  bike: (cls = '', label = '', vehicle, color = '') => label
    ? icon(`<div class="mk-bike ${cls}" ${color ? `style="box-shadow:0 0 0 4px ${color}"` : ''}>${vehIcon(vehicle)}</div><div class="mk-label" ${color ? `style="background:${color};color:#fff"` : ''}>${esc(label)}</div>`, [38, 38])
    : icon(`<div class="mk-bike ${cls}" ${color ? `style="box-shadow:0 0 0 4px ${color}"` : ''}>${vehIcon(vehicle)}</div>`),
  dot: (color, label = '') => icon(`<div class="mk-dot" style="background:${color}"></div>${label ? `<div class="mk-label">${esc(label)}</div>` : ''}`, [16, 16]),
  req: (label) => icon(`<div class="mk-req">${esc(label)}</div>`, [80, 24], [40, 12]),
  sos: () => icon('<div class="mk-sos">!</div>', [30, 30]),
};
export function upsertMarker(map, store, key, latlng, ic, opts = {}) {
  if (!map) return null;
  let m = store[key];
  if (!m) { m = store[key] = L.marker(latlng, { icon: ic, ...opts }).addTo(map); }
  else { m.setLatLng(latlng); if (opts.refreshIcon) m.setIcon(ic); }
  return m;
}
export function pruneMarkers(store, keep) {
  for (const k of Object.keys(store)) if (!keep.has(k)) { store[k].remove(); delete store[k]; }
}

// Itinéraire vélo (OSRM, profil vélo) ; repli en ligne droite si le service ne répond pas.
const routeCache = new Map();
// Itinéraire selon le véhicule : vélo (routed-bike) ou moto (routed-car).
export async function bikeRoute(from, to, vehicle) {
  const prof = vehicle === 'moto' ? 'routed-car' : 'routed-bike';
  const key = prof + [from, to].flat().map((x) => x.toFixed(4)).join(',');
  if (routeCache.has(key)) return routeCache.get(key);
  const straight = { coords: [from, to], km: haversine(from[0], from[1], to[0], to[1]) * 1.3, approx: true };
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://routing.openstreetmap.de/${prof}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`, { signal: ctl.signal });
    const j = await r.json();
    const rt = j.routes?.[0];
    if (!rt) throw 0;
    const out = { coords: rt.geometry.coordinates.map(([x, y]) => [y, x]), km: rt.distance / 1000, min: Math.round(rt.duration / 60) };
    routeCache.set(key, out);
    return out;
  } catch { return straight; }
}
// Trace l'itinéraire réel (qui suit les rues) sur la carte : halo + trait ; pointillé fin seulement si le service ne répond pas.
// Renvoie { layer, km, min, approx } ; l'appelant retire l'ancien calque avec layer.remove().
export async function drawRoad(map, from, to, { vehicle, color = '#1a6fa3' } = {}) {
  if (!map || !window.L || !from || !to) return null;
  const r = await bikeRoute(from, to, vehicle);
  const layer = L.layerGroup(r.approx
    ? [L.polyline(r.coords, { color, weight: 2.5, opacity: .7, dashArray: '4 7' })]
    : [L.polyline(r.coords, { color, weight: 10, opacity: .16, lineCap: 'round', lineJoin: 'round' }), L.polyline(r.coords, { color, weight: 4.5, opacity: .95, lineCap: 'round', lineJoin: 'round' })]).addTo(map);
  return { layer, coords: r.coords, km: r.km, min: r.min ?? etaMin(r.km, vehicle), approx: !!r.approx };
}
export function etaMin(kmv, vehicle) { return Math.max(2, Math.round((kmv / (vehicle === 'moto' ? 25 : 14)) * 60)); }

// Recherche d'adresse : deux sources libres interrogées ensemble (Photon pour les lieux et commerces, Nominatim pour les rues),
// résultats fusionnés, sans doublon, ceux d'Antananarivo d'abord. Le repère se règle ensuite sur la carte pour être exact.
const geoCache = new Map();
const TANA_BOX = [47.40, -19.02, 47.65, -18.80];
const inTana = (lat, lng) => lng >= TANA_BOX[0] && lng <= TANA_BOX[2] && lat >= TANA_BOX[1] && lat <= TANA_BOX[3];
export async function geocode(qs) {
  const q = String(qs || '').replace(/,\s*Antananarivo\s*$/i, '').trim();
  if (q.length < 2) return [];
  if (geoCache.has(q)) return geoCache.get(q);
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  const photon = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=-18.9100&lon=47.5250&limit=8&lang=fr&bbox=43.0,-25.7,50.6,-11.9`, { signal: timeout(5000) })
    .then((r) => r.json()).then((j) => (j.features || []).map((f) => {
      const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
      const place = p.name && p.name !== p.street ? p.name : '';
      const street = [p.street, p.housenumber].filter(Boolean).join(' ');
      const area = p.district || p.locality || p.suburb || (p.city !== 'Antananarivo' ? p.city : '') || '';
      const label = [place, street, area].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || p.city || q;
      const kind = p.osm_value && !['house', 'residential', 'yes'].includes(p.osm_value) ? KIND_FR[p.osm_value] || '' : '';
      return { label, sub: [kind, p.city && p.city !== area ? p.city : ''].filter(Boolean).join(' · '), lat, lng };
    })).catch(() => []);
  const nomi = fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=mg&accept-language=fr&viewbox=47.40,-18.80,47.65,-19.02&bounded=0&q=${encodeURIComponent(q + ', Antananarivo')}`, { signal: timeout(6000) })
    .then((r) => r.json()).then((j) => j.map((x) => {
      const a = x.address || {};
      const label = [x.name && x.name !== a.road ? x.name : '', a.road, a.suburb || a.neighbourhood || a.quarter || a.city_district].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ') || x.display_name.split(',').slice(0, 3).join(',');
      return { label, sub: [KIND_FR[x.type] || '', a.city || a.town || ''].filter(Boolean).join(' · '), lat: +x.lat, lng: +x.lon };
    })).catch(() => []);
  const all = [...(await photon), ...(await nomi)];
  const out = [];
  for (const x of all) if (!out.some((y) => haversine(x.lat, x.lng, y.lat, y.lng) < 0.08 || y.label === x.label)) out.push(x);
  out.sort((a, b) => Number(inTana(b.lat, b.lng)) - Number(inTana(a.lat, a.lng)));
  const res = out.slice(0, 7);
  if (res.length) geoCache.set(q, res);
  return res;
}
const KIND_FR = { pharmacy: 'Pharmacie', school: 'École', university: 'Université', hospital: 'Hôpital', clinic: 'Clinique', bank: 'Banque', marketplace: 'Marché', supermarket: 'Supermarché',
  restaurant: 'Restaurant', cafe: 'Café', hotel: 'Hôtel', place_of_worship: 'Église / lieu de culte', fuel: 'Station-service', bus_station: 'Gare routière', bus_stop: 'Arrêt de bus', townhall: 'Mairie',
  police: 'Police', post_office: 'Poste', shop: 'Boutique', mall: 'Centre commercial', suburb: 'Quartier', neighbourhood: 'Quartier', quarter: 'Quartier', village: 'Village', primary: 'Route', secondary: 'Route',
  tertiary: 'Rue', residential: 'Rue', road: 'Rue', stadium: 'Stade', park: 'Parc', convenience: 'Épicerie', clothes: 'Boutique de vêtements', hardware: 'Quincaillerie', mobile_phone: 'Téléphonie' };
export async function reverse(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&accept-language=fr&lat=${lat}&lon=${lng}`);
    const j = await r.json();
    const a = j.address || {};
    return [a.road || a.pedestrian || a.amenity || a.building, a.suburb || a.neighbourhood || a.quarter, a.city_district].filter(Boolean).slice(0, 2).join(', ') || j.display_name?.split(',').slice(0, 2).join(',') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

// ---------------------------------------------------------------- GPS
export function getPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(t('gps_denied')));
    navigator.geolocation.getCurrentPosition((p) => resolve([p.coords.latitude, p.coords.longitude, p.coords.accuracy]),
      () => reject(new Error(t('gps_denied'))), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000, ...opts });
  });
}

// ---------------------------------------------------------------- notifications temps réel (actualisation 5 s)
let audioCtx;
// Son des notifications : carillon court à deux notes (type messagerie), vibration sur téléphone.
// Le navigateur n'autorise le son qu'après un premier geste de l'utilisateur : on « déverrouille » l'audio au premier clic.
function audio() { try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {} return audioCtx; }
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => audio(), { once: true, passive: true }));
function tone(ctx, f, t0, dur, vol = .22) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(g); o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.start(t0); o2.start(t0); o.stop(t0 + dur + .02); o2.stop(t0 + dur + .02);
}
export function beep(kind = 'msg') {
  if (localStorage.getItem('alefa_mute') === '1') return;
  try {
    const ctx = audio(); if (!ctx) return; const t = ctx.currentTime + .01;
    if (kind === 'alert') { tone(ctx, 880, t, .18, .3); tone(ctx, 660, t + .2, .18, .3); tone(ctx, 880, t + .4, .3, .3); }
    else { tone(ctx, 1046.5, t, .22); tone(ctx, 1318.5, t + .12, .45); }
  } catch {}
  navigator.vibrate?.(kind === 'alert' ? [200, 100, 200, 100, 300] : [90, 60, 90]);
}
// Tonalité d'attente pendant qu'on appelle quelqu'un.
let backTimer = null;
export function ringback(on) {
  clearInterval(backTimer); backTimer = null; if (!on) return;
  const once = () => { try { const ctx = audio(); const t = ctx.currentTime + .01; tone(ctx, 425, t, 1.1, .08); } catch {} };
  once(); backTimer = setInterval(once, 3500);
}
// Sonnerie d'appel entrant (répétée jusqu'à décrocher ou raccrocher).
let ringTimer = null;
export function ring(on) {
  clearInterval(ringTimer); ringTimer = null;
  if (!on) { navigator.vibrate?.(0); return; }
  const once = () => { try { const ctx = audio(); const t = ctx.currentTime + .01; for (let i = 0; i < 2; i++) { tone(ctx, 784, t + i * .45, .35, .28); tone(ctx, 988, t + i * .45 + .17, .25, .2); } } catch {} navigator.vibrate?.([400, 200, 400]); };
  once(); ringTimer = setInterval(once, 2200);
}

// ---------------------------------------------------------------- notifications push (site fermé)
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const u8 = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
const keyB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Résultat : 'on' | 'default' (pas encore demandé) | 'denied' | 'ios_install' (iPhone : ajouter à l'écran d'accueil) | 'unsupported'
export async function enablePush({ ask = false } = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'ios_install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') {
    if (!ask) return 'default';
    if ((await Notification.requestPermission()) !== 'granted') return Notification.permission;
  }
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('GET', '/api/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && keyB64(sub.options.applicationServerKey) !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
  await api('POST', '/api/push/subscribe', { ...sub.toJSON(), ua: navigator.userAgent.slice(0, 160) });
  state.pushOn = true;
  return 'on';
}
function pushBanner(kind) {
  const KEY = 'alefa_push_later';
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 3 * 864e5) return; } catch {}
  if (document.querySelector('.push-banner')) return; // (le bandeau « Installer » passe avant)
  const mg = state.lang === 'mg', ios = kind === 'ios_install';
  const el = document.createElement('div');
  el.className = 'push-banner';
  el.innerHTML = `<div class="push-ic">🔔</div><div class="grow"><b>${mg ? 'Mahazoa fampandrenesana na mihidy aza ny site' : 'Recevez vos alertes même site fermé'}</b>
    <small>${ios ? (mg ? 'iPhone : tsindrio ⬆️ « Partager » → « Sur l\'écran d\'accueil », sokafy avy eo Alefa.mg.' : 'iPhone : touchez ⬆️ « Partager » → « Sur l\'écran d\'accueil », puis ouvrez Alefa.mg depuis l\'icône.')
      : (mg ? 'Colis vaovao, hafatra, antso : maneno ao amin\'ny finday na tsy misokatra aza.' : 'Nouveaux colis, messages et appels sonnent sur le téléphone, même application fermée.')}</small></div>
    ${ios ? '' : `<button class="btn primary sm" data-pon>${mg ? 'Alefa' : 'Activer'}</button>`}<button class="push-x" data-plater aria-label="Plus tard">✕</button>`;
  document.body.append(el);
  el.querySelector('[data-plater]').onclick = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} el.remove(); };
  el.querySelector('[data-pon]')?.addEventListener('click', async () => {
    try {
      const r = await enablePush({ ask: true });
      el.remove();
      if (r === 'on') { toast(mg ? 'Voaomana ny fampandrenesana 🔔' : 'Notifications activées 🔔', 'ok'); api('POST', '/api/push/test', {}).catch(() => {}); }
      else if (r === 'denied') pushHelp();
    } catch (e) { toastErr(e); }
  });
}
// Notifications refusées : comment les réactiver (le site ne peut plus redemander).
export function pushHelp() {
  const mg = state.lang === 'mg';
  modal(mg ? '🔔 Hamerina ny fampandrenesana' : '🔔 Réactiver les notifications', `<div class="stack small">
    <p style="margin:0">${mg ? 'Nolavina ny fampandrenesana tamin\'ity finday ity. Hamerenana azy :' : 'Les notifications ont été refusées sur ce téléphone. Pour les réactiver :'}</p>
    <p style="margin:0"><b>Android (Chrome)</b> : ${mg ? 'tsindrio ny 🔒 eo akaikin\'ny adiresy → Autorisations → Notifications → Autoriser, dia avereno sokafana.' : 'touchez 🔒 à gauche de l\'adresse → Autorisations → Notifications → Autoriser, puis rouvrez le site.'}</p>
    <p style="margin:0"><b>${mg ? 'Application napetraka' : 'Application installée'}</b> : ${mg ? 'Paramètres ny finday → Applications → Alefa.mg → Notifications → Alefa.' : 'Paramètres du téléphone → Applications → Alefa.mg → Notifications → Activer.'}</p>
    <p style="margin:0"><b>iPhone</b> : ${mg ? 'Réglages → Notifications → Alefa.mg → Autoriser.' : 'Réglages → Notifications → Alefa.mg → Autoriser.'}</p></div>`);
}

// ---------------------------------------------------------------- installer l'application (icône sur l'écran)
// Android / ordinateur (Chrome, Edge, Samsung) : le navigateur propose l'installation → bouton « Installer ».
// iPhone (Safari) : pas d'installation automatique → explication « Partager → Sur l'écran d'accueil ».
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; showInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; document.querySelector('.inst-banner')?.remove(); try { localStorage.setItem('alefa_installed', '1'); } catch {} });
export function installBanner() {
  if (standalone()) return;
  try { if (localStorage.getItem('alefa_installed')) return; } catch {}
  // iPhone : explication tout de suite ; Android : bouton dès que le navigateur l'autorise ; sinon, aide après 4 s.
  if (isIOS()) return showInstall();
  if (installEvt) return showInstall();
  setTimeout(() => { if (!installEvt && /android/i.test(navigator.userAgent)) showInstall(); }, 4000);
}
let installAsked = false;
function showInstall() {
  if (standalone() || document.querySelector('.inst-banner')) return;
  const KEY = 'alefa_install_later';
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 3 * 864e5) return; } catch {}
  if (!installAsked && !installEvt && !isIOS() && !/android/i.test(navigator.userAgent)) return; // ordinateur sans proposition : rien
  installAsked = true;
  document.querySelector('.push-banner')?.remove();
  const mg = state.lang === 'mg', courier = location.pathname.startsWith('/livreur') || document.title.includes('Livreur');
  const name = courier ? 'Alefa Livreur' : 'Alefa.mg';
  const how = installEvt ? '' : isIOS()
    ? (mg ? 'Tsindrio ⬆️ « Partager » eo ambany, avy eo « Sur l\'écran d\'accueil » → « Ajouter ».' : 'Touchez ⬆️ « Partager » en bas, puis « Sur l\'écran d\'accueil » → « Ajouter ».')
    : (mg ? 'Tsindrio ⋮ eo ambony ankavanana, avy eo « Installer l\'application » na « Ajouter à l\'écran d\'accueil ».' : 'Touchez ⋮ en haut à droite, puis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».');
  const el = document.createElement('div');
  el.className = 'push-banner inst-banner';
  el.innerHTML = `<img src="/icon-192.png" alt="" width="40" height="40" style="border-radius:10px;flex:none"><div class="grow"><b>${mg ? `Apetraho eo amin'ny écran ny ${name}` : `Installez ${name} sur votre téléphone`}</b>
    <small>${how || (mg ? 'Icône eo amin\'ny écran, misokatra haingana toy ny application, mahazo fampandrenesana.' : 'Une icône sur l\'écran, ouverture rapide comme une application, notifications.')}</small></div>
    ${installEvt ? `<button class="btn primary sm" data-inst>${mg ? 'Apetraho' : 'Installer'}</button>` : ''}<button class="push-x" data-ilater aria-label="Plus tard">✕</button>`;
  document.body.append(el);
  el.querySelector('[data-ilater]').onclick = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} el.remove(); };
  el.querySelector('[data-inst]')?.addEventListener('click', async () => {
    const ev = installEvt; if (!ev) return;
    el.remove(); installEvt = null;
    try { ev.prompt(); const r = await ev.userChoice; if (r?.outcome !== 'accepted') localStorage.setItem(KEY, String(Date.now())); } catch {}
  });
}

// ---------------------------------------------------------------- « Où est mon colis ? » (client, destinataire, page de suivi)
// Lieu actuel en gros + depuis quand, petit plan Expéditeur → Centre → En route → Destinataire, et qui a récupéré / qui livre.
export function whereCard(w, team) {
  if (!w) return '';
  const mg = state.lang === 'mg';
  const ago = (t) => { if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60e3)); return m < 1 ? (mg ? 'izao' : 'à l\'instant') : m < 60 ? `${mg ? 'nanomboka' : 'depuis'} ${m} min` : m < 1440 ? `${mg ? 'nanomboka' : 'depuis'} ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${mg ? 'nanomboka ny' : 'depuis le'} ${new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${time(t)}`; };
  const relay = team?.relay;
  const PL = [['sender', mg ? 'Mpandefa' : 'Expéditeur'], ...(relay ? [['centre', 'Centre']] : []), ['road', mg ? 'An-dalana' : 'En route'], ['recipient', mg ? 'Mpandray' : 'Destinataire']];
  const at = { sender_waiting: 'sender', sender_planned: 'sender', pickup_coming: 'sender', to_centre: 'centre', at_centre: 'centre', on_way: 'road', nearby: 'road', handed: 'recipient', delivered: 'recipient', coop: 'recipient', returning: 'road', returned: 'sender', cancelled: 'sender' }[w.code];
  const pos = Math.max(0, PL.findIndex((p) => p[0] === at)), moving = ['to_centre', 'on_way', 'nearby', 'returning', 'pickup_coming'].includes(w.code);
  const bad = ['returning', 'returned', 'cancelled'].includes(w.code), ok = ['delivered', 'coop'].includes(w.code);
  const who = (p) => (p ? `<b>${vehIcon(p.vehicle)} ${esc(p.name || '—')}</b>${p.at ? ` <small>${time(p.at)}</small>` : ''}` : `<span class="muted">${mg ? 'mbola tsy fantatra' : 'pas encore choisi'}</span>`);
  const people = team?.hidden ? `<div class="wh-who muted small">${mg ? 'Hiseho ny anaran\'ny livreur rehefa nanamafy izy.' : 'Le nom du livreur s\'affiche dès qu\'il a confirmé la mission.'}</div>`
    : team?.same ? `<div class="wh-who"><span>${mg ? 'Naka sy manatitra' : 'Récupération et livraison'}</span>${who(team.pickup)}</div>`
    : team ? `<div class="wh-who"><span>${team.pickup?.at ? (mg ? 'Naka' : 'Récupéré par') : (mg ? 'Haka' : 'Récupération par')}</span>${who(team.pickup)}</div><div class="wh-who"><span>${ok ? (mg ? 'Nanatitra' : 'Livré par') : (mg ? 'Hanatitra' : 'Livraison par')}</span>${who(team.delivery)}</div>` : '';
  return `<div class="wh ${bad ? 'bad' : ok ? 'ok' : ''}">
    <small class="wh-k">${mg ? 'Aiza ny colis amin\'izao ?' : 'Où est le colis en ce moment ?'}</small>
    <div class="wh-now">${esc(mg ? w.label_mg : w.label)}</div><div class="wh-since">${ago(w.since)}</div>
    <div class="wh-path">${PL.map(([k, l], i) => `<div class="wh-st ${i < pos ? 'done' : i === pos ? (moving ? 'cur move' : 'cur') : ''}"><i></i><span>${l}</span></div>`).join('')}</div>
    ${people}</div>`;
}

// ---------------------------------------------------------------- GPS permanent (application « Traccar Client »)
// Le site ne peut pas suivre le téléphone quand il est fermé : une petite application gratuite le fait
// (arrière-plan, écran éteint, points gardés sans réseau) et envoie la position à Alefa avec la clé du livreur.
export async function gpsSetup({ base, name, admin = false }) {
  const mg = state.lang === 'mg';
  let info = await api('POST', base, {});
  const server = `${location.origin}${info.path}`;
  const m = modal(mg ? 'GPS maharitra' : 'GPS permanent', '<div data-g></div>', { wide: true });
  const draw = () => {
    const seen = info.last ? `${new Date(info.last).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '';
    m.el.querySelector('[data-g]').innerHTML = `<div class="stack small gps-setup">
      <p style="margin:0">${mg ? `Mba hanarahana ${name ? esc(name) : 'ny livreur'} na mihidy aza ny application na maty ny écran, apetraho ao amin'ny findainy ny application maimaim-poana <b>Traccar Client</b>. Tehirizany ny toerana raha tsy misy réseau, ary alefany rehefa tafaverina.`
        : `Pour suivre ${name ? esc(name) : 'le livreur'} même application fermée et écran éteint, installez sur son téléphone l'application gratuite <b>Traccar Client</b>. Sans réseau, elle garde les positions et les envoie au retour du réseau.`}</p>
      <div class="card gps-state">${info.last ? `<span class="pt ok">${mg ? 'Mandeha' : 'Fonctionne'}</span> ${mg ? 'Toerana farany voaray' : 'Dernière position reçue'} : <b>${seen}</b>` : `<span class="pt no">${mg ? 'Mbola tsy nisy toerana voaray' : 'Aucune position reçue pour l\'instant'}</span>`}</div>
      <ol class="gps-steps">
        <li>${mg ? 'Ampidino' : 'Installez'} <b>Traccar Client</b> : <a href="https://play.google.com/store/apps/details?id=org.traccar.client" target="_blank" rel="noopener">Android (Play Store)</a> · <a href="https://apps.apple.com/app/traccar-client/id843156974" target="_blank" rel="noopener">iPhone (App Store)</a></li>
        <li>${mg ? 'Ao amin\'ny application, soraty ireto' : 'Dans l\'application, remplissez'} :
          <div class="gps-kv"><span>${mg ? 'Identifiant de l\'appareil (Device identifier)' : 'Identifiant de l\'appareil (Device identifier)'}</span><code data-v="key">${esc(info.key)}</code><button class="btn sm" data-copy="key">${mg ? 'Adikao' : 'Copier'}</button></div>
          <div class="gps-kv"><span>${mg ? 'Adiresin\'ny serveur (Server URL)' : 'Adresse du serveur (Server URL)'}</span><code data-v="url">${esc(server)}</code><button class="btn sm" data-copy="url">${mg ? 'Adikao' : 'Copier'}</button></div>
          <div class="gps-kv"><span>${mg ? 'Fahamarinana (Location accuracy)' : 'Précision (Location accuracy)'}</span><code>${mg ? 'Avo (High)' : 'Haute (High)'}</code></div>
          <div class="gps-kv"><span>${mg ? 'Elanelam-potoana (Frequency)' : 'Fréquence (Frequency)'}</span><code>30 s</code></div></li>
        <li>${mg ? 'Alefaso ny <b>Service status</b> (ON). Omeo alalana « Toujours » ny toerana.' : 'Activez <b>Service status</b> (ON). Autorisez la localisation « Toujours » (Allow all the time).'}</li>
        <li>${mg ? 'Android : Paramètres → Applications → Traccar Client → Batterie → <b>Sans restriction</b>, mba tsy hampitsahatra azy ny finday.' : 'Android : Paramètres → Applications → Traccar Client → Batterie → <b>Sans restriction</b>, pour que le téléphone ne l\'arrête pas.'}</li>
      </ol>
      <p class="tiny muted" style="margin:0">${mg ? 'Aza zaraina amin\'olon-kafa ny identifiant : izay manana azy no afaka mandefa toerana amin\'ny anaran\'ity livreur ity.' : 'Ne partagez pas l\'identifiant : il permet d\'envoyer des positions au nom de ce livreur.'}</p>
      <div class="row wrap"><button class="btn sm" data-renew>${mg ? 'Identifiant vaovao' : 'Nouvel identifiant'}</button>${admin ? `<button class="btn sm danger" data-off>${mg ? 'Atsaharo' : 'Désactiver'}</button>` : ''}<button class="btn sm" data-refresh>${mg ? 'Hamarino' : 'Vérifier la réception'}</button></div></div>`;
  };
  draw();
  m.el.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]')?.dataset.copy;
    if (cp) { try { await navigator.clipboard.writeText(cp === 'key' ? info.key : server); toast(mg ? 'Voadika' : 'Copié', 'ok'); } catch { toast(cp === 'key' ? info.key : server); } }
    if (e.target.closest('[data-refresh]')) { info = await api('POST', base, {}); draw(); }
    if (e.target.closest('[data-renew]') && (await confirmBox(mg ? 'Hanova identifiant ? Tsy mandeha intsony ny taloha.' : 'Créer un nouvel identifiant ? L\'ancien ne fonctionnera plus.', 'OK'))) { info = await api('POST', base, { renew: true }); draw(); }
    if (e.target.closest('[data-off]') && (await confirmBox('Désactiver le GPS permanent de ce livreur ?', 'Désactiver', true))) { await api('DELETE', base); m.close(); toast('GPS permanent désactivé', 'ok'); }
  });
  return m;
}

// Ouverture d'une notification : chaque espace (admin, livreur, client) enregistre comment ouvrir la cible.
let notifOpener = null;
export const setNotifOpener = (fn) => { notifOpener = fn; };
export function openNotif(n) {
  if (!n?.target || !notifOpener) return false;
  try { notifOpener(n.target, n); } catch (e) { toastErr(e); }
  return true;
}
export function startNotifications(onNew) {
  import('./talk.js').then((m) => m.watchCalls()).catch(() => {}); // appels entrants (dans la plateforme)
  // Notifications push : reçues même site fermé. Déjà autorisées → abonnement silencieux ; sinon un bandeau propose de les activer.
  setTimeout(() => enablePush().then((r) => { if (r === 'default' || r === 'ios_install') pushBanner(r); }).catch(() => {}), 2500);
  let first = true;
  return every(5000, async () => {
    const r = await api('GET', `/api/notifications?after=${state.lastNotif}`);
    const fresh = r.notifications.filter((n) => n.id > state.lastNotif);
    if (fresh.length) state.lastNotif = Math.max(...fresh.map((n) => n.id));
    state.unread = r.unread;
    $$('[data-unread]').forEach((el) => { el.textContent = r.unread || ''; el.classList.toggle('hidden', !r.unread); });
    document.title = `${r.unread ? `(${r.unread}) ` : ''}${document.title.replace(/^\(\d+\)\s*/, '')}`; // compteur dans l'onglet
    if (!first) {
      for (const n of fresh.reverse()) {
        toast(n.body || '', n.kind === 'sos' ? 'err' : '', n.title, n.target && notifOpener ? () => openNotif(n) : null);
        if (document.hidden && !state.pushOn && 'Notification' in window && Notification.permission === 'granted') {
          // Notification du système (téléphone ou ordinateur), comme une messagerie ; passe par le service worker si possible.
          const opt = { body: n.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'alefa-' + n.id, renotify: true, vibrate: [90, 60, 90], data: { target: n.target || null } };
          navigator.serviceWorker?.getRegistration().then((reg) => (reg ? reg.showNotification(n.title, opt) : Promise.reject())).catch(() => {
            const sys = new Notification(n.title, opt); sys.onclick = () => { window.focus(); sys.close(); openNotif(n); };
          });
        }
      }
      if (fresh.length) { beep(fresh.some((n) => n.kind === 'sos') ? 'alert' : 'msg'); onNew?.(fresh); }

    }
    first = false;
  });
}
export async function showNotifications() {
  const r = await api('GET', '/api/notifications?after=0');
  const m = modal(t('notifications'), `<div class="list">${r.notifications.map((n, i) => `<div class="card${n.target && notifOpener ? ' notif-link' : ''}" data-ni="${i}" style="${n.read ? '' : 'border-color:var(--green)'}${n.target && notifOpener ? ';cursor:pointer' : ''}">
      <div class="row between"><b>${esc(n.title)}</b><span class="tiny muted">${dt(n.at)}</span></div>${n.body ? `<div class="small muted">${esc(n.body)}</div>` : ''}
      ${n.target && notifOpener ? `<div class="tiny" style="color:var(--green);margin-top:4px">${state.lang === 'mg' ? 'Tsindrio raha hijery ›' : 'Toucher pour ouvrir ›'}</div>` : ''}</div>`).join('') || `<p class="muted">—</p>`}</div>`);
  m.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ni]'); if (!c) return;
    const n = r.notifications[+c.dataset.ni];
    if (n?.target && notifOpener) { m.close(); openNotif(n); }
  });
  await api('POST', '/api/notifications/read', {});
  $$('[data-unread]').forEach((el) => el.classList.add('hidden'));
  return m;
}

export function langSwitch() {
  return `<div class="lang-switch"><button data-act="lang" data-l="fr" class="${state.lang === 'fr' ? 'on' : ''}">FR</button><button data-act="lang" data-l="mg" class="${state.lang === 'mg' ? 'on' : ''}">MG</button></div>`;
}

export async function sendSOS(deliveryId) {
  if (!(await confirmBox(t('sos_confirm'), 'SOS', true))) return;
  let pos = [];
  try { pos = await getPosition({ timeout: 6000 }); } catch {}
  await api('POST', '/api/complaints', { kind: 'sos', delivery_id: deliveryId || null, lat: pos[0], lng: pos[1], body: 'SOS' });
  toast(t('sos_sent'), 'ok');
}

export async function complaintForm(deliveryId) {
  const m = modal(t('complaint'), `<label class="field"><span>${t('describe_problem')}</span><textarea class="input" rows="4" data-b></textarea></label><button class="btn primary block" style="margin-top:12px" data-s>${t('send')}</button>`);
  m.el.querySelector('[data-s]').onclick = async () => {
    try { await api('POST', '/api/complaints', { kind: 'complaint', delivery_id: deliveryId || null, body: m.el.querySelector('[data-b]').value }); m.close(); toast(t('sent'), 'ok'); } catch (e) { toastErr(e); }
  };
}

const PAY_M = { mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', cash: 'Espèces au centre' };
export async function profileForm() {
  const u = state.user, mg = state.lang === 'mg';
  const editable = u.role !== 'courier'; // le numéro d'un livreur est changé par l'administration
  const pay = u.role === 'client' ? (await api('GET', '/api/me').catch(() => ({}))).payout || null : null;
  const m = modal(t('profile'), `<div class="stack">
    <div class="row"><div class="avatar">${esc(initials(u.name))}</div><div><b data-pname>${esc(u.name)}</b><div class="muted small" data-pphone>${esc(phoneFmt(u.phone))}</div></div></div>
    ${editable ? `<h3 style="margin-top:6px">${mg ? 'Ny mombamomba ahy' : 'Mes informations'}</h3>
    <label class="field"><span>${t('name')}</span><input class="input" data-name value="${esc(u.name)}" autocomplete="name"></label>
    <label class="field"><span>${t('phone')}</span><input class="input" data-phone type="tel" value="${esc(phoneFmt(u.phone))}" autocomplete="tel"><small class="tiny muted">${mg ? 'Io no laharana iditra. Ilaina ny tenimiafina raha ovaina.' : 'C\'est aussi votre identifiant de connexion. Le mot de passe actuel est demandé pour le changer.'}</small></label>
    <input class="input hidden" type="password" placeholder="${t('current_password')}" data-infopw autocomplete="current-password">
    <button class="btn primary block" data-info>${t('save')}</button>` : ''}
    ${u.role === 'client' ? `<h3 style="margin-top:18px">${mg ? 'Handraisako ny volako' : 'Recevoir mes paiements'}</h3>
    <p class="tiny muted" style="margin:0">${mg ? 'Alefan\'i Alefa amin\'ity laharana ity ny vidin\'ny entana nolafosina.' : 'Alefa vous verse ici la valeur des colis livrés (une fois l\'argent rapporté par le livreur).'}</p>
    <label class="field"><span>${mg ? 'Fomba' : 'Moyen'}</span><select class="input" data-pm>${Object.entries(PAY_M).map(([k, l]) => `<option value="${k}" ${(pay?.method || 'mvola') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field" data-pmphone><span>${mg ? 'Laharana Mobile Money' : 'Numéro Mobile Money'}</span><input class="input" type="tel" data-pp value="${esc(pay?.phone ? phoneFmt(pay.phone) : phoneFmt(u.phone))}"></label>
    <label class="field" data-pmphone><span>${mg ? 'Anaran\'ny tompon\'ny kaonty' : 'Nom du titulaire du compte'}</span><input class="input" data-ph value="${esc(pay?.holder || u.name)}"></label>
    <button class="btn block" data-paysave>${t('save')}</button>` : ''}
    <label class="field"><span>${t('language')}</span><div class="seg"><button data-l="fr" class="${state.lang === 'fr' ? 'on' : ''}">Français</button><button data-l="mg" class="${state.lang === 'mg' ? 'on' : ''}">Malagasy</button></div></label>
    <button class="btn block" data-terms>${state.lang === 'mg' ? 'Fepetra sy saran\'ny fanaterana' : 'Conditions et tarifs'}</button>
    <h3 style="margin-top:18px">${t('change_password')}</h3>
    <input class="input" type="password" placeholder="${t('current_password')}" data-cur autocomplete="current-password">
    <input class="input" type="password" placeholder="${t('new_password')}" data-new autocomplete="new-password">
    <button class="btn primary block" data-pw>${t('save')}</button>
    <button class="btn danger block" data-out>${t('logout')}</button>
  </div>`);
  m.el.querySelectorAll('[data-l]').forEach((b) => (b.onclick = async () => { setLang(b.dataset.l); await api('PATCH', '/api/me', { lang: state.lang }).catch(() => {}); location.reload(); }));
  m.el.querySelector('[data-pw]').onclick = async () => {
    try { await api('PATCH', '/api/me', { password: m.el.querySelector('[data-cur]').value, new_password: m.el.querySelector('[data-new]').value }); toast('OK', 'ok'); m.close(); } catch (e) { toastErr(e); }
  };
  m.el.querySelector('[data-out]').onclick = () => logout();
  m.el.querySelector('[data-terms]').onclick = () => import('./terms.js').then((x) => x.showConditions());
  // Nom et numéro : le mot de passe actuel n'est demandé que si le numéro change.
  const ph = m.el.querySelector('[data-phone]'), ipw = m.el.querySelector('[data-infopw]');
  const digits = (v) => String(v || '').replace(/\D/g, '').replace(/^261/, '0');
  if (ph) ph.oninput = () => ipw.classList.toggle('hidden', digits(ph.value) === digits(u.phone));
  const ib = m.el.querySelector('[data-info]');
  if (ib) ib.onclick = async () => {
    const name = m.el.querySelector('[data-name]').value.trim(), changed = digits(ph.value) !== digits(u.phone);
    if (changed && !ipw.value) { ipw.classList.remove('hidden'); ipw.focus(); return toast(t('current_password'), 'err'); }
    try {
      await api('PATCH', '/api/me', { name, ...(changed ? { phone: ph.value, password: ipw.value } : {}) });
      const r = await api('GET', '/api/me'); state.user = r.user;
      m.el.querySelector('[data-pname]').textContent = r.user.name; m.el.querySelector('[data-pphone]').textContent = phoneFmt(r.user.phone);
      ipw.value = ''; ipw.classList.add('hidden');
      toast(changed ? (state.lang === 'mg' ? 'Voatahiry. Ampiasao ny laharana vaovao rehefa hiditra.' : 'Enregistré. Utilisez le nouveau numéro pour vous connecter.') : 'OK', 'ok');
    } catch (e) { toastErr(e); }
  };
  // Moyen de paiement de l'expéditeur : le numéro n'est utile que pour le Mobile Money.
  const pm = m.el.querySelector('[data-pm]');
  if (pm) {
    const sync = () => m.el.querySelectorAll('[data-pmphone]').forEach((x) => x.classList.toggle('hidden', pm.value === 'cash'));
    pm.onchange = sync; sync();
    m.el.querySelector('[data-paysave]').onclick = async () => {
      try { await api('PATCH', '/api/me', { payout: { method: pm.value, phone: m.el.querySelector('[data-pp]').value, holder: m.el.querySelector('[data-ph]').value } }); toast('OK', 'ok'); } catch (e) { toastErr(e); }
    };
  }
}

export function chatHtml(msgs, myId) {
  return msgs.map((m) => `<div class="bubble ${m.sender_id === myId ? 'me' : ''}">${esc(m.body)}<time>${time(m.at)}</time></div>`).join('');
}

// ---------------------------------------------------------------- service client (client / livreur ↔ centre)
const bubbles = (msgs, mineIsCentre) => msgs.map((x) => {
  const mine = mineIsCentre ? x.from_centre : !x.from_centre;
  return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin:4px 0"><div style="max-width:80%;padding:8px 10px;border-radius:12px;background:${mine ? 'var(--green-soft)' : 'var(--bg)'}">
    ${x.shipment ? `<div class="tiny muted">📦 ${esc(x.shipment)}</div>` : ''}<div class="small" style="white-space:pre-wrap">${esc(x.body)}</div>
    <div class="tiny muted" style="text-align:right">${x.label != null ? esc(x.label) : x.from_centre ? (x.author ? esc(x.author.split(' ')[0]) + ' · ' : '') + 'Alefa' : ''} ${dt(x.at)}</div></div></div>`;
}).join('');
export function chatPanel(el, { load, send, centre = false, refs = [] }) {
  const mg = state.lang === 'mg';
  el.innerHTML = `<div data-msgs style="max-height:50vh;min-height:160px;overflow:auto;padding:4px"></div>
    <div class="stack" style="gap:6px;margin-top:8px">${refs.length ? `<select class="input" data-cref><option value="">${mg ? 'Momba ny colis (tsy voatery)' : 'À propos d\'un colis (facultatif)'}</option>${refs.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select>` : ''}
      <div class="row" style="gap:6px"><textarea class="input grow" data-cbody rows="2" placeholder="${mg ? 'Soraty eto ny hafatrao…' : 'Votre message…'}"></textarea><button class="btn primary" data-csend>➤</button></div></div>`;
  const box = el.querySelector('[data-msgs]');
  let last = '';
  const refresh = async () => {
    const msgs = await load();
    const sig = msgs.map((m) => m.id).join(',');
    if (sig === last) return;
    last = sig;
    box.innerHTML = bubbles(msgs, centre) || `<p class="muted small" style="text-align:center">${mg ? 'Manorata aminay, valianay haingana.' : 'Écrivez-nous, nous répondons rapidement.'}</p>`;
    box.scrollTop = box.scrollHeight;
  };
  el.querySelector('[data-csend]').onclick = async () => {
    const t = el.querySelector('[data-cbody]'), body = t.value.trim();
    if (!body) return;
    try { await send(body, el.querySelector('[data-cref]')?.value || undefined); t.value = ''; await refresh(); } catch (e) { toastErr(e); }
  };
  const timer = every(5000, refresh);
  return { refresh, stop: () => timer.stop() };
}
// ---------------------------------------------------------------- bulle de discussion (en bas à droite, sur toutes les pages)
// kind : 'guest' (site public : appeler, SMS, se connecter), 'user' (client/livreur : service client), 'admin' (boîte du service client).
const BUBBLE_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" fill="currentColor"/><circle cx="8.5" cy="10.8" r="1.3" fill="#ffe81a"/><circle cx="12" cy="10.8" r="1.3" fill="#ffe81a"/><circle cx="15.5" cy="10.8" r="1.3" fill="#ffe81a"/></svg>';
let bubbleTimer = null;
export function chatBubble(kind, { phone = '038 51 201 42', onLogin = null, onOpen = null, poll = null, cls = '' } = {}) {
  document.querySelector('.chat-bubble')?.remove(); bubbleTimer?.stop(); bubbleTimer = null;
  const mg = state.lang === 'mg', tel = String(phone || '').replace(/\s/g, '');
  const b = document.createElement('button');
  b.className = `chat-bubble ${cls}`; b.type = 'button';
  b.setAttribute('aria-label', mg ? 'Resaka amin\'ny sampana mpanjifa' : 'Discuter avec le service client');
  b.innerHTML = `${BUBBLE_IC}<span class="chat-bubble-n hidden" data-bn></span>`;
  const setN = (n) => { const e = b.querySelector('[data-bn]'); e.textContent = n > 9 ? '9+' : n; e.classList.toggle('hidden', !n); };
  b.onclick = () => {
    if (kind !== 'guest') return onOpen ? onOpen() : supportChat();
    const m = modal(`💬 ${mg ? 'Mifandraisa aminay' : 'Contactez Alefa.mg'}`, `<div class="stack">
      <p class="small muted" style="margin:0">${mg ? 'Alatsinainy ka hatramin\'ny Sabotsy, 8 ora – 17 ora.' : 'Du lundi au samedi, de 8 h à 17 h.'}</p>
      <a class="btn primary block lg" href="tel:${esc(tel)}">${symbol('phone')} ${mg ? 'Antsoy' : 'Appeler'} ${esc(phone)}</a>
      <a class="btn block" href="sms:${esc(tel)}">✉️ ${mg ? 'Handefa SMS' : 'Envoyer un SMS'}</a>
      ${onLogin ? `<button class="btn block" data-bl>💬 ${mg ? 'Hiresaka ao amin\'ny kaontiko' : 'Écrire au service client (avec mon compte)'}</button>` : ''}</div>`);
    m.el.querySelector('[data-bl]')?.addEventListener('click', () => { m.close(); onLogin(); });
  };
  document.body.append(b);
  if (poll) { const tick = async () => { try { setN(await poll()); } catch {} }; bubbleTimer = every(30000, tick, true); }
  return { setCount: setN, el: b };
}
export function removeChatBubble() { document.querySelector('.chat-bubble')?.remove(); bubbleTimer?.stop(); bubbleTimer = null; }

// Fenêtre « 💬 Service client » pour un client ou un livreur.
export async function supportChat(refs = []) {
  const mg = state.lang === 'mg';
  const m = modal(`💬 ${mg ? 'Service client Alefa' : 'Service client Alefa'}`, `<div class="chat-calls" style="margin-bottom:10px"><button class="btn sm primary" data-callsup>${symbol('phone')} ${mg ? 'Antsoy ny sampana mpanjifa' : 'Appeler le service client'}</button></div><div data-chat></div>`);
  m.el.querySelector('[data-callsup]').onclick = () => import('./talk.js').then((t) => t.callUser({ to: 'support', name: mg ? 'Sampana mpanjifa Alefa' : 'Service client Alefa' }));
  const p = chatPanel(m.el.querySelector('[data-chat]'), {
    load: async () => (await api('GET', '/api/support')).messages,
    send: (body, ref) => api('POST', '/api/support', { body, ref }), refs,
  });
  const close = m.close; m.close = () => { p.stop(); close(); };
  m.el.closest('.modal-back')?.addEventListener('click', (e) => { if (e.target.matches('[data-x], .modal-back')) p.stop(); });
  return m;
}

// ---------------------------------------------------------------- étiquette colis : code-barres Code 128 (jeu B) en SVG
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
export function code128Svg(text, { height = 60, module = 2 } = {}) {
  const codes = [104, ...[...String(text)].map((ch) => ch.charCodeAt(0) - 32)];
  const check = codes.reduce((a, c, i) => a + c * (i || 1), 0) % 103;
  const pattern = [...codes, check, 106].map((c) => C128[c]).join('');
  let x = 10 * module, bars = '';
  [...pattern].forEach((w, i) => { const wd = Number(w) * module; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${wd}" height="${height}"/>`; x += wd; });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x + 10 * module}" height="${height}" viewBox="0 0 ${x + 10 * module} ${height}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
}
export function printLabel(s) {
  const w = window.open('', '_blank', 'width=420,height=600');
  if (!w) return toast('Autorisez les fenêtres pour imprimer l\'étiquette', 'err');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Étiquette ${esc(s.ref)}</title><style>body{font-family:system-ui,sans-serif;margin:16px}.l{border:2px solid #000;border-radius:10px;padding:12px;max-width:360px}.c{font-size:44px;font-weight:900;letter-spacing:8px;text-align:center}.s{font-size:13px;margin-top:6px}svg{width:100%;height:70px}</style>
    <div class="l"><div style="display:flex;justify-content:space-between"><b>ALEFA</b><b>${esc(s.category || '')}${s.fragile ? ' · FRAGILE' : ''}</b></div>${code128Svg(s.ref)}<div class="c">${esc(s.ref.slice(-4))}</div>
    <div class="s"><b>À :</b> ${esc(s.recipient.name || '')} · ${esc(phoneFmt(s.recipient.phone || ''))}<br>${esc(s.recipient.address)}${s.province ? `<br><b>${esc(s.province.city)}</b> · ${esc(s.province.coop)}` : ''}</div>
    <div class="s"><b>De :</b> ${esc(s.sender.name || '')} · ${esc(s.sender.address)}</div><div class="s" style="text-align:center">${esc(s.ref)}</div></div><script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

// ---------------------------------------------------------------- symboles à la place des émoticônes
// Toute émoticône affichée (textes, notifications, tableaux, marqueurs) est remplacée par une icône au trait ;
// celles qui n'ont pas d'équivalent sont simplement retirées. Les listes (option) ne gardent que le texte.
const P = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l2 8h-6M14 5h2"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M8.5 16.5h5l3-6h-4l-2-3H8M16.5 10.5L15 6h3"/>',
  van: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  building: '<path d="M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  mobile: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>', bus: '<rect x="4" y="3.5" width="16" height="14" rx="2"/><path d="M4 11h16M7.5 20.5v-3M16.5 20.5v-3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>', send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>', compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>', camera: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>', down: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>', up: '<path d="M12 20V8M6 13l6-6 6 6M4 4h16"/>',
  back: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>', receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>', lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>', inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>', cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>', print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', nophone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2zM3 3l18 18"/>',
  doc: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>', store: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>', star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>', tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/>', gift: '<rect x="3.5" y="8" width="17" height="5"/><path d="M5 13v8h14v-8M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
  stop: '<path d="M7 11V5a1.5 1.5 0 0 1 3 0v5M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v7M16 9a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7c-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.5-1.5L7 13"/>',
  glass: '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8 21h8"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', party: '<path d="M4 20l5-14 9 9z"/><path d="M14 4l1 2M19 9l2-1M17 3l-1 3"/>',
  traffic: '<rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="7" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="17" r="1.3"/>',
};
const G = '#2e8cc9', O = '#e8890c', R = '#d64545';
const EMO = {
  '✅': ['check', G], '✔': ['check', G], '❌': ['x', R], '✖': ['x'], '⚠': ['alert', O], '🚨': ['alert', R], '🆘': ['alert', R], '🚲': ['bike'], '🛵': ['moto'], '🏍': ['moto'], '🚐': ['van'], '🚚': ['van'],
  '📦': ['box'], '📍': ['pin'], '🏢': ['building'], '📞': ['phone'], '📱': ['mobile'], '🚌': ['bus'], '🏁': ['flag'], '🕘': ['clock'], '⏰': ['clock', O], '⏱': ['clock'], '⏳': ['clock'],
  '💵': ['cash'], '💰': ['cash'], '💳': ['card'], '🚀': ['send'], '🧭': ['compass'], '💬': ['chat'], '📷': ['camera'], '👤': ['user'], '🔔': ['bell'], '⬇': ['down'], '⬆': ['up'], '📤': ['up'],
  '↩': ['back'], '🧾': ['receipt'], '🔒': ['lock'], '🔑': ['key'], '📥': ['inbox'], '📝': ['edit'], '✏': ['edit'], '👍': ['check', G], '👎': ['x', R], '⚡': ['bolt'], '🗺': ['map'], '🗓': ['cal'], '📅': ['cal'],
  '🎉': ['party', G], '🛣': ['route'], '🖨': ['print'], '🔗': ['link'], '📵': ['nophone'], '📄': ['doc'], '🏪': ['store'], '🛒': ['store'], '⭐': ['star', '#f5a400'], '⏸': ['pause'], '🔖': ['tag'],
  '🔎': ['search'], '📋': ['clip'], '🎁': ['gift'], '✋': ['stop'], '🥚': ['glass'], '✉': ['mail'], '🚦': ['traffic'],
  '🟢': ['dot', G], '🟠': ['dot', O], '🔴': ['dot', R], '⚪': ['dot', '#bccbd6'], '🟩': ['dot', G], '🟧': ['dot', O], '🔵': ['dot', '#2563eb'], '🟡': ['dot', '#f5b800'],
};
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMO_RE = new RegExp(`(?:${Object.keys(EMO).sort((a, b) => b.length - a.length).map(reEsc).join('|')})\\uFE0F?|[\\u{1F000}-\\u{1FAFF}]\\uFE0F?|\\uFE0F|\\u200D`, 'gu');
export function symbol(name, color) {
  if (name === 'dot') return `<i class="sym-dot" style="background:${color}"></i>`;
  return `<svg class="sym" viewBox="0 0 24 24" aria-hidden="true"${color ? ` style="color:${color}"` : ''}>${P[name] || ''}</svg>`;
}
const symFor = (m) => { const k = m.replace(/[️‍]/g, ''); const e = EMO[k]; return e ? symbol(e[0], e[1]) : ''; };
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'svg']);
function deEmoji(root) {
  if (!root) return;
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  if (root.nodeName === 'OPTION' || root.nodeName === 'SELECT') { root.querySelectorAll?.('option').forEach((o) => { if (EMO_RE.test(o.textContent)) o.textContent = o.textContent.replace(EMO_RE, '').replace(/^\s+/, ''); EMO_RE.lastIndex = 0; }); if (root.nodeName === 'OPTION' && EMO_RE.test(root.textContent)) root.textContent = root.textContent.replace(EMO_RE, '').trim(); EMO_RE.lastIndex = 0; return; }
  for (const a of ['placeholder', 'title', 'aria-label']) { const v = root.getAttribute?.(a); if (v && EMO_RE.test(v)) root.setAttribute(a, v.replace(EMO_RE, '').trim()); EMO_RE.lastIndex = 0; }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (SKIP.has(n.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT) });
  const texts = []; let n; while ((n = w.nextNode())) texts.push(n);
  texts.forEach(fixText);
  root.querySelectorAll?.('option, [placeholder], [title]').forEach((el) => { if (el.nodeName === 'OPTION') { if (EMO_RE.test(el.textContent)) el.textContent = el.textContent.replace(EMO_RE, '').trim(); } else for (const a of ['placeholder', 'title']) { const v = el.getAttribute(a); if (v && EMO_RE.test(v)) el.setAttribute(a, v.replace(EMO_RE, '').trim()); } EMO_RE.lastIndex = 0; });
}
function fixText(t) {
  const v = t.nodeValue; if (!v) return;
  EMO_RE.lastIndex = 0; if (!EMO_RE.test(v)) return; EMO_RE.lastIndex = 0;
  const p = t.parentNode; if (!p || SKIP.has(p.nodeName)) return;
  if (p.nodeName === 'OPTION' || p.nodeName === 'TITLE') { t.nodeValue = v.replace(EMO_RE, '').trim(); return; }
  const span = document.createElement('span'); span.className = 'sym-wrap';
  span.innerHTML = esc(v).replace(EMO_RE, (m) => symFor(m));
  const frag = document.createDocumentFragment(); while (span.firstChild) frag.append(span.firstChild);
  p.replaceChild(frag, t);
}

// ---------------------------------------------------------------- listes déroulantes soignées
// Chaque <select> reçoit une vraie liste déroulante (bouton + menu), au clavier comme à la souris.
// Le <select> d'origine reste en place (invisible) : formulaires, filtres et tests fonctionnent sans changement.
let ddOpen = null;
function closeDD() { if (!ddOpen) return; ddOpen.menu.remove(); ddOpen.btn.setAttribute('aria-expanded', 'false'); ddOpen.btn.closest('.dd')?.classList.remove('open'); ddOpen = null; }
function ddLabel(sel) { const o = sel.options[sel.selectedIndex]; return o ? o.textContent.trim() : ''; }
function enhanceSelect(sel) {
  if (sel._dd || sel.multiple || sel.size > 1 || sel.dataset.native != null || !sel.parentNode) return;
  sel._dd = true;
  const wrap = document.createElement('span'); wrap.className = 'dd';
  if (sel.style.width) wrap.style.width = sel.style.width;
  if (sel.classList.contains('grow')) wrap.classList.add('grow');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = `dd-btn ${sel.className}`; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="dd-v"></span><svg class="dd-ch" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  sel.parentNode.insertBefore(wrap, sel); wrap.append(sel, btn);
  sel.classList.add('dd-native'); sel.tabIndex = -1;
  const sync = () => { btn.querySelector('.dd-v').textContent = ddLabel(sel) || '—'; btn.disabled = sel.disabled; };
  sync();
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  const pick = (i) => { if (i < 0 || sel.options[i]?.disabled) return; const changed = sel.selectedIndex !== i; sel.selectedIndex = i; sync(); closeDD(); btn.focus(); if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); } };
  const open = () => {
    if (ddOpen?.btn === btn) return closeDD();
    closeDD();
    const menu = document.createElement('div'); menu.className = 'dd-menu'; menu.setAttribute('role', 'listbox');
    let html = '', lastGroup = null;
    [...sel.options].forEach((o, i) => {
      const g = o.parentNode.nodeName === 'OPTGROUP' ? o.parentNode.label : null;
      if (g !== lastGroup && g) html += `<div class="dd-grp">${esc(g)}</div>`; lastGroup = g;
      html += `<button type="button" role="option" data-i="${i}" class="${i === sel.selectedIndex ? 'on' : ''}" ${o.disabled ? 'disabled' : ''}><span>${esc(o.textContent.trim() || '—')}</span><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
    });
    menu.innerHTML = html;
    document.body.append(menu);
    const r = btn.getBoundingClientRect(), vh = window.innerHeight;
    menu.style.minWidth = `${Math.max(r.width, 180)}px`; menu.style.left = `${Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)}px`;
    const below = vh - r.bottom - 12, above = r.top - 12;
    if (below < 220 && above > below) { menu.style.bottom = `${vh - r.top + 6}px`; menu.style.maxHeight = `${Math.min(340, above)}px`; } else { menu.style.top = `${r.bottom + 6}px`; menu.style.maxHeight = `${Math.min(340, below)}px`; }
    menu.addEventListener('mousedown', (e) => e.preventDefault());
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    ddOpen = { btn, menu, sel, pick, hi: sel.selectedIndex };
    btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('open');
    menu.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
  btn.addEventListener('keydown', (e) => {
    const d = ddOpen?.btn === btn ? ddOpen : null;
    if (!d && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); return open(); }
    if (!d) return;
    const items = [...d.menu.querySelectorAll('[data-i]:not([disabled])')], idx = items.findIndex((b) => +b.dataset.i === d.hi);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const nb = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))]; if (nb) { d.hi = +nb.dataset.i; items.forEach((b) => b.classList.toggle('hi', b === nb)); nb.scrollIntoView({ block: 'nearest' }); } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.pick(d.hi); }
    else if (e.key === 'Escape' || e.key === 'Tab') closeDD();
  });
}
document.addEventListener('click', (e) => { if (ddOpen && !ddOpen.menu.contains(e.target)) closeDD(); });
window.addEventListener('resize', closeDD);
document.addEventListener('scroll', (e) => { if (ddOpen && !ddOpen.menu.contains(e.target)) closeDD(); }, true);

// Une seule surveillance de la page : nouvelles listes à habiller, émoticônes à remplacer.
function polish(node) {
  if (node.nodeType === 1) {
    if (node.nodeName === 'SELECT') enhanceSelect(node); else node.querySelectorAll?.('select').forEach(enhanceSelect);
  }
  deEmoji(node);
}
if (typeof document !== 'undefined' && document.body) {
  polish(document.body);
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fixText(m.target); else m.addedNodes.forEach(polish); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
