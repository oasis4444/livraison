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
  if (!window.L) { el.innerHTML = '<div style="padding:90px 20px;text-align:center;color:#85938d">Carte indisponible (connexion)</div>'; return null; }
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
  map.attributionControl.setPrefix(false);
  setTimeout(() => map.invalidateSize(), 120);
  return map;
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
export async function drawRoad(map, from, to, { vehicle, color = '#0b6e4f' } = {}) {
  if (!map || !window.L || !from || !to) return null;
  const r = await bikeRoute(from, to, vehicle);
  const layer = L.layerGroup(r.approx
    ? [L.polyline(r.coords, { color, weight: 2.5, opacity: .7, dashArray: '4 7' })]
    : [L.polyline(r.coords, { color, weight: 10, opacity: .16, lineCap: 'round', lineJoin: 'round' }), L.polyline(r.coords, { color, weight: 4.5, opacity: .95, lineCap: 'round', lineJoin: 'round' })]).addTo(map);
  return { layer, coords: r.coords, km: r.km, min: r.min ?? etaMin(r.km, vehicle), approx: !!r.approx };
}
export function etaMin(kmv, vehicle) { return Math.max(2, Math.round((kmv / (vehicle === 'moto' ? 25 : 14)) * 60)); }

// Recherche d'adresse (Nominatim, limité à Madagascar, priorité Antananarivo)
export async function geocode(qs) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=mg&accept-language=fr&viewbox=47.40,-18.80,47.65,-19.02&bounded=0&q=${encodeURIComponent(qs)}`;
  const r = await fetch(u); return (await r.json()).map((x) => ({ label: x.display_name.split(',').slice(0, 3).join(','), lat: +x.lat, lng: +x.lon }));
}
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
export function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(.18, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .35);
    o.start(); o.stop(audioCtx.currentTime + .35);
  } catch {}
  navigator.vibrate?.([120, 60, 120]);
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
  if ('Notification' in window && Notification.permission === 'default') setTimeout(() => Notification.requestPermission().catch(() => {}), 4000);
  let first = true;
  return every(5000, async () => {
    const r = await api('GET', `/api/notifications?after=${state.lastNotif}`);
    const fresh = r.notifications.filter((n) => n.id > state.lastNotif);
    if (fresh.length) state.lastNotif = Math.max(...fresh.map((n) => n.id));
    state.unread = r.unread;
    $$('[data-unread]').forEach((el) => { el.textContent = r.unread || ''; el.classList.toggle('hidden', !r.unread); });
    if (!first) {
      for (const n of fresh.reverse()) {
        toast(n.body || '', n.kind === 'sos' ? 'err' : '', n.title, n.target && notifOpener ? () => openNotif(n) : null);
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const sys = new Notification(n.title, { body: n.body || '', icon: '/icon-192.png', tag: 'alefa-' + n.id });
          sys.onclick = () => { window.focus(); sys.close(); openNotif(n); };
        }
      }
      if (fresh.length) { beep(); onNew?.(fresh); }
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

export function profileForm() {
  const u = state.user;
  const m = modal(t('profile'), `<div class="stack">
    <div class="row"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><div class="muted small">${esc(phoneFmt(u.phone))}</div></div></div>
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
}

export function chatHtml(msgs, myId) {
  return msgs.map((m) => `<div class="bubble ${m.sender_id === myId ? 'me' : ''}">${esc(m.body)}<time>${time(m.at)}</time></div>`).join('');
}

// ---------------------------------------------------------------- service client (client / livreur ↔ centre)
const bubbles = (msgs, mineIsCentre) => msgs.map((x) => {
  const mine = mineIsCentre ? x.from_centre : !x.from_centre;
  return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin:4px 0"><div style="max-width:80%;padding:8px 10px;border-radius:12px;background:${mine ? 'var(--green-soft)' : 'var(--bg)'}">
    ${x.shipment ? `<div class="tiny muted">📦 ${esc(x.shipment)}</div>` : ''}<div class="small" style="white-space:pre-wrap">${esc(x.body)}</div>
    <div class="tiny muted" style="text-align:right">${x.from_centre ? (x.author ? esc(x.author.split(' ')[0]) + ' · ' : '') + 'Alefa' : ''} ${dt(x.at)}</div></div></div>`;
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
// Fenêtre « 💬 Service client » pour un client ou un livreur.
export async function supportChat(refs = []) {
  const mg = state.lang === 'mg';
  const m = modal(`💬 ${mg ? 'Service client Alefa' : 'Service client Alefa'}`, '<div data-chat></div>');
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
