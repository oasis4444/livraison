// Colis du centre : éléments partagés entre client, livreur et administration.
import { state, t, api, esc, $, ar, km, dt, time, hm, modal, toast, toastErr, confirmBox, promptBox, phoneFmt, geocode, reverse, getPosition } from './core.js';

const L_FR = {
  sh_pending: 'À programmer', sh_assigned: 'Programmé', sh_picked_up: 'Récupéré · en route', sh_delivered: 'Livré', sh_refused: 'Refusé', sh_cancelled: 'Annulé',
  returned: 'rendu à l\'expéditeur', to_return: 'à rendre à l\'expéditeur', colis: 'Colis', schedule_tab: 'Heures & axes', send_parcel: 'Envoyer un colis',
  sender: 'Expéditeur (récupération)', recipient: 'Destinataire (livraison)', value: 'Valeur de la marchandise', fee: 'Frais de livraison', to_collect: 'À encaisser',
  departure: 'Départ', auto_dep: 'Automatique (prochain départ)', no_dep: 'Aucun départ prévu vers cette adresse : le centre programmera le colis.',
  today: 'Aujourd\'hui', tomorrow: 'Demain', back_at: 'retour', parcels: 'colis', no_schedule: 'Aucun départ programmé pour le moment.',
  pickup_btn: 'Récupérer', photo: 'Photo du colis', take_photo: '📷 Prendre la photo', deliver_btn: 'Livrer', delivered_ok: '✅ Livré et payé', refused_btn: '↩️ Refusé par le destinataire',
  cancel_btn: '✖ Annuler (injoignable…)', returned_btn: '↩️ Rendu à l\'expéditeur', collected: 'Montant encaissé', reason: 'Motif', my_schedule: 'Mes départs',
  add_dep: '＋ Départ', dep_time: 'Heure de départ', ret_time: 'Heure de retour', axe: 'Axe', save: 'Enregistrer', to_pickup: 'À récupérer', to_deliver: 'À livrer',
  done_today: 'Terminés aujourd\'hui', balance_vendor: 'Le centre vous doit', with_courier: 'dont encore chez le livreur', history: 'Historique',
  from_centre: 'Départs depuis le centre', my_parcels: 'Mes colis', empty: 'Rien pour le moment.', pickup_addr: 'Adresse de récupération', drop_addr: 'Adresse de livraison',
  rname: 'Nom du destinataire', rphone: 'Téléphone du destinataire', desc: 'Contenu (facultatif)', create: 'Envoyer', my_position: 'Ma position',
  pay_info: 'Le destinataire paie la valeur + les frais. En cas de refus, il paie les frais ; en cas d\'annulation après récupération, le colis vous revient et vous payez les frais.',
};
const L_MG = {
  sh_pending: 'Mbola tsy voalahatra', sh_assigned: 'Voalahatra', sh_picked_up: 'Voaray · an-dalana', sh_delivered: 'Tonga', sh_refused: 'Nolavina', sh_cancelled: 'Nofoanana',
  returned: 'naverina tamin\'ny mpandefa', to_return: 'haverina amin\'ny mpandefa', colis: 'Entana', schedule_tab: 'Ora & axe', send_parcel: 'Handefa entana',
  sender: 'Mpandefa (alaina)', recipient: 'Mpandray (aterina)', value: 'Vidin\'ny entana', fee: 'Saran-dalana', to_collect: 'Vola horaisina',
  departure: 'Fiaingana', auto_dep: 'Ho azy (fiaingana manaraka)', no_dep: 'Tsy misy fiaingana mankany amin\'io adiresy io: ny centre no handamina azy.',
  today: 'Androany', tomorrow: 'Rahampitso', back_at: 'miverina', parcels: 'entana', no_schedule: 'Tsy mbola misy fiaingana voalahatra.',
  pickup_btn: 'Haka', photo: 'Sarin\'ny entana', take_photo: '📷 Maka sary', deliver_btn: 'Hanatitra', delivered_ok: '✅ Tonga sy voaloa', refused_btn: '↩️ Nolavin\'ny mpandray',
  cancel_btn: '✖ Foanana (tsy hita…)', returned_btn: '↩️ Naverina tamin\'ny mpandefa', collected: 'Vola voaray', reason: 'Antony', my_schedule: 'Ny fiaingako',
  add_dep: '＋ Fiaingana', dep_time: 'Ora hiaingana', ret_time: 'Ora hiverenana', axe: 'Axe', save: 'Tehirizina', to_pickup: 'Halaina', to_deliver: 'Haterina',
  done_today: 'Vita androany', balance_vendor: 'Tokony homen\'ny centre anao', with_courier: 'ka mbola eo amin\'ny livreur', history: 'Tantara',
  from_centre: 'Fiaingana avy amin\'ny centre', my_parcels: 'Ny entako', empty: 'Tsy misy aloha.', pickup_addr: 'Adiresy halaina', drop_addr: 'Adiresy hanaterana',
  rname: 'Anaran\'ny mpandray', rphone: 'Findain\'ny mpandray', desc: 'Inona ao anatiny (tsy voatery)', create: 'Alefa', my_position: 'Toerana misy ahy',
  pay_info: 'Ny mpandray no mandoa ny vidin\'entana + saran-dalana. Raha lavina, ny saran-dalana ihany no aloany; raha foanana rehefa voaray, miverina aminao ny entana ary ianao no mandoa ny saran-dalana.',
};
const STEP = {
  fr: { pending: 'À programmer', scheduled: 'Programmé', departed: 'Parti du centre', at_pickup: 'Chez l\'expéditeur', picked_up: 'Récupéré', en_route: 'En route',
    nearby: 'Tout proche', delivered: 'Livré', refused: 'Refusé', cancelled: 'Annulé', returning: 'Retour expéditeur', returned: 'Rendu à l\'expéditeur', fee: 'Frais modifiés', assigned: 'Programmé',
    awaiting_recipient: 'Remis · à confirmer par le destinataire', awaiting_courier: 'Reçu · à confirmer par le livreur', courier_confirmed: 'Remise déclarée par le livreur',
    recipient_confirmed: 'Réception confirmée', pin_fail: 'Code PIN erroné', disputed: 'Réception contestée' },
  mg: { pending: 'Mbola tsy voalahatra', scheduled: 'Voalahatra', departed: 'Lasa (niala centre)', at_pickup: 'Tonga eo amin\'ny mpandefa', picked_up: 'Voaray', en_route: 'An-dalana',
    nearby: 'Efa akaiky', delivered: 'Tonga', refused: 'Nolavina', cancelled: 'Nofoanana', returning: 'Haverina amin\'ny mpandefa', returned: 'Naverina tamin\'ny mpandefa', fee: 'Saran-dalana novaina', assigned: 'Voalahatra',
    awaiting_recipient: 'Natolotra · miandry fanamarinan\'ny mpandray', awaiting_courier: 'Voaray · miandry fanamarinan\'ny livreur', courier_confirmed: 'Nambaran\'ny livreur fa natolotra',
    recipient_confirmed: 'Nohamafisin\'ny mpandray fa voaray', pin_fail: 'Kaody PIN diso', disputed: 'Nolavin\'ny mpandray fa tsy voaray' },
};
export const stepLabel = (k) => (STEP[state.lang] || STEP.fr)[k] || STEP.fr[k] || k;
export const STEPS_FLOW = ['scheduled', 'departed', 'at_pickup', 'picked_up', 'en_route', 'nearby', 'awaiting_recipient', 'delivered'];
export const stepBar = (s) => { const i = STEPS_FLOW.indexOf(s.step === 'awaiting_courier' ? 'awaiting_recipient' : s.step); return i < 0 ? '' : `<div class="steps">${STEPS_FLOW.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>`; };
export const c = (k) => (state.lang === 'mg' ? L_MG : L_FR)[k] ?? L_FR[k] ?? k;

const PILL = { pending: 'pending', scheduled: 'assigned', departed: 'assigned', at_pickup: 'assigned', picked_up: 'picked_up', en_route: 'picked_up', nearby: 'picked_up', awaiting_recipient: 'pending', awaiting_courier: 'pending', delivered: 'delivered', refused: 'cancelled', cancelled: 'cancelled', returning: 'cancelled', returned: 'cancelled' };
export const shipPill = (s) => `<span class="status-pill st-${PILL[s.step] || 'pending'}">${esc(stepLabel(s.step))}</span>`;
const dayLabel = (ms) => { const d0 = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), d = new Date(ms + 3 * 3600e3).toISOString().slice(0, 10); return d === d0 ? c('today') : c('tomorrow'); };

export function shipCard(s, extra = '') {
  return `<div class="card" data-act="ship" data-id="${s.id}" style="cursor:pointer">
    <div class="row between"><span class="small"><b>${esc(s.ref)}</b>${s.external_ref ? ` <span class="muted">· ${esc(s.external_ref)}</span>` : ''}</span>${shipPill(s)}</div>
    <div class="route-line" style="margin:6px 0"><span class="dot"></span><span class="small ellipsis">${esc(s.sender.name)} — ${esc(s.sender.address)}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(s.recipient.name)} — ${esc(s.recipient.address)}</span></div>
    <div class="row between small"><span class="muted">${s.departure_at ? `🕘 ${dayLabel(s.departure_at)} ${time(s.departure_at)} · ${esc(s.axe || '')}` : s.courier ? `🚲 ${esc(s.courier.name || '')}` : '⏳'}</span><b>${ar(s.amount_to_collect)}</b></div>${stepBar(s)}${extra}</div>`;
}

// ---------------------------------------------------------------- heures & axes (visibles par tous les clients)
let axeLayers = [];
let axeSig = '';
export async function scheduleHtml(map, onDeps) {
  const r = await api('GET', '/api/schedule');
  onDeps?.(r.departures);
  const sig = JSON.stringify(r.axes);
  if (map && window.L && (sig !== axeSig || !axeLayers.length || !map.hasLayer(axeLayers[0]))) {
    axeSig = sig;
    axeLayers.forEach((l) => l.remove());
    axeLayers = r.axes.map((a) => L.circle([a.center_lat, a.center_lng], { radius: a.radius_km * 1000, color: a.color, weight: 2, fillOpacity: .06, interactive: false }).addTo(map));
  }
  const groups = {};
  for (const d of r.departures) (groups[dayLabel(d.departure_at)] ||= []).push(d);
  return `<div class="small muted" style="margin-bottom:8px">🏢 ${esc(r.centre?.name || '')} · ${esc(c('fee'))} : <b>${ar(r.default_fee)}</b></div>
    ${Object.entries(groups).map(([day, list]) => `<h3>${esc(day)}</h3><div class="list">${list.map((d) => `<div class="card row" style="padding:10px 12px">
      <div style="text-align:center;min-width:56px"><div style="font-size:1.25rem;font-weight:850">${time(d.departure_at)}</div><div class="tiny muted">${c('back_at')} ${time(d.return_at)}</div></div>
      <div class="grow"><b><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(d.color)}"></span> ${esc(d.axe)}</b><div class="small muted">🚲 ${esc(d.courier)} · ${d.load} ${c('parcels')}${d.started ? ' · 🟢' : ''}</div></div></div>`).join('')}</div>`).join('') || `<p class="muted">${c('no_schedule')}</p>`}
    ${r.axes.length ? `<h3 style="margin-top:12px">Axes</h3><div class="chips">${r.axes.map((a) => `<span class="chip" style="border-color:${esc(a.color)}">${esc(a.name)}${a.fee ? ` · ${ar(a.fee)}` : ''}</span>`).join('')}</div>` : ''}`;
}

// ---------------------------------------------------------------- formulaire d'envoi (client ou centre)
export function sendForm({ me, onDone, adminMode = false, prefill = null }) {
  const f = { pickup: null, drop: null, slot: '' };
  const P = prefill || {};
  const m = modal(c('send_parcel'), `<div class="stack">
    ${adminMode ? `<label class="field"><span>Téléphone de l'expéditeur (compte client)</span><input class="input" data-sp type="tel" value="${esc(P.vendeur || '')}"></label>` : ''}
    ${P.ref ? `<div class="card small" style="background:var(--sun-soft);border:0">🔗 ${state.lang === 'mg' ? 'Baiko avy amin\'ny logiciel de vente' : 'Commande reçue du logiciel de vente'} : <b>${esc(P.ref)}</b></div>` : ''}
    <label class="field"><span>🟢 ${c('pickup_addr')}</span><div class="addr"><span class="ic"></span><input class="input" data-a="pickup" autocomplete="off" placeholder="Quartier, rue, repère…"><div class="act">${me ? '<button data-gps>◎</button>' : ''}</div><div class="suggest hidden" data-s="pickup"></div></div></label>
    <div class="row"><label class="field grow"><span>${c('rname')}</span><input class="input" data-rn value="${esc(P.nom || '')}"></label><label class="field grow"><span>${c('rphone')}</span><input class="input" data-rp type="tel" placeholder="034 12 345 67" value="${esc(P.tel || '')}"></label></div>
    <label class="field"><span>🟠 ${c('drop_addr')}</span><div class="addr"><span class="ic b"></span><input class="input" data-a="drop" autocomplete="off" placeholder="Quartier, rue, repère…" value="${esc(P.adresse || '')}"><div class="suggest hidden" data-s="drop"></div></div></label>
    <div class="row"><label class="field grow"><span>${c('value')} (Ar)</span><input class="input" data-v inputmode="numeric" placeholder="20000" value="${esc(P.valeur || '')}"></label><label class="field grow"><span>${c('desc')}</span><input class="input" data-d value="${esc(P.desc || P.description || '')}"></label></div>
    <label class="field"><span>${state.lang === 'mg' ? 'Laharan\'ny baiko (tsy voatery)' : 'N° de commande (facultatif)'}</span><input class="input" data-ref value="${esc(P.ref || '')}" placeholder="CMD-1042"></label>
    <div class="card" style="background:var(--bg);border:0" data-q><span class="small muted">${c('fee')} : —</span></div>
    <p class="tiny muted">${c('pay_info')}</p>
    <button class="btn primary lg block" data-ok>${c('create')}</button></div>`);
  const el = m.el;
  let tmr;
  const quote = async () => {
    const box = el.querySelector('[data-q]');
    if (!f.drop) return;
    const r = await api('POST', '/api/shipments/quote', { drop_lat: f.drop.lat, drop_lng: f.drop.lng }).catch(() => null);
    if (!r) return;
    const v = Number(el.querySelector('[data-v]').value.replace(/\D/g, '')) || 0;
    box.innerHTML = `<div class="row between"><span>${c('fee')}</span><b>${ar(r.fee)}</b></div><div class="row between"><span>${c('to_collect')}</span><b>${ar(v + r.fee)}</b></div>
      <label class="field" style="margin-top:8px"><span>${c('departure')}</span><select class="input" data-dep><option value="">${c('auto_dep')}</option>
      ${r.departures.map((d) => `<option value="${d.slot_id}|${d.departure_at}">${dayLabel(d.departure_at)} ${time(d.departure_at)} · ${esc(d.axe)} · 🚲 ${esc(d.courier)}</option>`).join('')}</select></label>
      ${r.departures.length ? '' : `<div class="tiny" style="color:var(--orange)">${c('no_dep')}</div>`}`;
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.a;
    if (e.target.matches('[data-v]')) return quote();
    if (!k) return;
    f[k] = null;
    clearTimeout(tmr);
    const box = el.querySelector(`[data-s=${k}]`), v = e.target.value.trim();
    if (v.length < 3) return box.classList.add('hidden');
    tmr = setTimeout(async () => {
      const res = await geocode(v + ', Antananarivo').catch(() => []);
      box._res = res;
      box.innerHTML = res.map((x, i) => `<button data-i="${i}">${esc(x.label)}</button>`).join('') + `<button data-i="-1">✓ « ${esc(v)} » (sans GPS)</button>`;
      box.classList.remove('hidden');
    }, 450);
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('.suggest button');
    if (b) {
      const box = b.closest('.suggest'), k = box.dataset.s, inp = el.querySelector(`[data-a=${k}]`);
      const x = box._res?.[+b.dataset.i];
      f[k] = x ? { label: x.label, lat: x.lat, lng: x.lng } : { label: inp.value.trim(), lat: null, lng: null };
      inp.value = f[k].label; box.classList.add('hidden');
      if (k === 'drop') quote();
    }
    if (e.target.closest('[data-gps]')) {
      try { const [lat, lng] = await getPosition(); const label = await reverse(lat, lng); f.pickup = { label, lat, lng }; el.querySelector('[data-a=pickup]').value = label; } catch (err) { toastErr(err); }
    }
  });
  // Préremplissage : adresse de départ fournie, coordonnées de livraison fournies, sinon recherche de l'adresse.
  if (P.depart) el.querySelector('[data-a=pickup]').value = P.depart;
  if (P.lat && P.lng) { f.drop = { label: P.adresse || '', lat: Number(P.lat), lng: Number(P.lng) }; quote(); }
  else if (P.adresse) setTimeout(() => el.querySelector('[data-a=drop]').dispatchEvent(new Event('input', { bubbles: true })), 50);
  if (me && !P.depart) setTimeout(() => el.querySelector('[data-gps]')?.click(), 100);
  el.querySelector('[data-ok]').onclick = async () => {
    const txt = (s) => el.querySelector(s).value.trim();
    const pk = f.pickup || { label: txt('[data-a=pickup]') }, dr = f.drop || { label: txt('[data-a=drop]') };
    const dep = el.querySelector('[data-dep]')?.value || '';
    try {
      const r = await api('POST', '/api/shipments', {
        sender_phone: adminMode ? txt('[data-sp]') : undefined,
        pickup_addr: pk.label, pickup_lat: pk.lat, pickup_lng: pk.lng, recipient_name: txt('[data-rn]'), recipient_phone: txt('[data-rp]'),
        drop_addr: dr.label, drop_lat: dr.lat, drop_lng: dr.lng, declared_value: Number(txt('[data-v]').replace(/\D/g, '')) || 0, description: txt('[data-d]'),
        slot_id: dep ? Number(dep.split('|')[0]) : undefined, departure_at: dep ? Number(dep.split('|')[1]) : undefined, external_ref: txt('[data-ref]') || undefined,
      });
      m.close();
      modal(r.duplicate ? (state.lang === 'mg' ? 'Efa nalefa io baiko io' : 'Commande déjà envoyée') : '✅ ' + r.shipment.ref, `<div class="stack" style="text-align:center">
        <div>${esc(stepLabel(r.shipment.step))}${r.shipment.departure_at ? ` · ${dayLabel(r.shipment.departure_at)} ${time(r.shipment.departure_at)}` : ''}</div>
        <div class="small muted">${state.lang === 'mg' ? 'Kaody homena ny mpandray' : 'Code à transmettre au destinataire'} (${esc(r.shipment.recipient.name)} · ${esc(phoneFmt(r.shipment.recipient.phone))})</div>
        <div class="pin-box">${[...(r.shipment.delivery_pin || '')].map((x) => `<span>${x}</span>`).join('')}</div>
        <a class="btn block" href="sms:${esc(r.shipment.recipient.phone)}?body=${encodeURIComponent(`Alefa : votre colis ${r.shipment.ref} arrive. Montant ${r.shipment.amount_to_collect} Ar. Code de réception : ${r.shipment.delivery_pin}`)}">💬 SMS</a></div>`);
      onDone?.(r.shipment);
    } catch (err) { toastErr(err); }
  };
  return m;
}

// ---------------------------------------------------------------- photo : compression avant envoi (≈ 100 Ko)
export function compressImage(file, max = 1024, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Photo illisible'));
    img.src = URL.createObjectURL(file);
  });
}

async function photoUrl(id) {
  const res = await fetch(`/api/shipments/${id}/photo`, { headers: { authorization: `Bearer ${state.token}` } });
  return res.ok ? URL.createObjectURL(await res.blob()) : null;
}

// ---------------------------------------------------------------- détail d'un colis
export async function shipDetail(id, { role, onChange, courierMarker } = {}) {
  const { shipment: s } = await api('GET', `/api/shipments/${id}`);
  const isCourier = role === 'courier', isAdmin = role === 'admin';
  const call = (p, n) => (p ? `<a class="btn sm" href="tel:${esc(p)}">📞 ${esc(n || phoneFmt(p))}</a>` : '');
  const m = modal(s.ref, `<div class="stack">
    <div class="row between">${shipPill(s)}<span class="small muted">${dt(s.created_at)}${s.external_ref ? ' · ' + esc(s.external_ref) : ''}</span></div>
    <div class="card"><div class="small muted">🟢 ${c('sender')}</div><b>${esc(s.sender.name)}</b> <span class="small">${esc(s.sender.address)}</span>
      <div class="row" style="margin-top:6px">${call(s.sender.phone)}${isCourier && s.sender.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.sender.lat},${s.sender.lng}&travelmode=bicycling">🧭</a>` : ''}</div></div>
    <div class="card"><div class="small muted">🟠 ${c('recipient')}</div><b>${esc(s.recipient.name)}</b> <span class="small">${esc(s.recipient.address)}</span>
      <div class="row" style="margin-top:6px">${call(s.recipient.phone)}${isCourier && s.recipient.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.recipient.lat},${s.recipient.lng}&travelmode=bicycling">🧭</a>` : ''}</div></div>
    ${s.description ? `<div class="small">📝 ${esc(s.description)}</div>` : ''}
    <div class="card" style="background:var(--bg);border:0">
      <div class="row between small"><span>${c('value')}</span><b>${ar(s.value ?? s.declared_value)}${s.value != null && s.value !== s.declared_value && s.declared_value ? ` <span class="muted">(annoncée ${ar(s.declared_value)})</span>` : ''}</b></div>
      <div class="row between small"><span>${c('fee')}</span><b>${ar(s.fee)} ${(isAdmin || isCourier) && ['pending', 'assigned', 'picked_up'].includes(s.status) ? '<button class="btn sm" data-fee>✎</button>' : ''}</b></div>
      <div class="row between"><span>${c('to_collect')}</span><b style="font-size:1.15rem">${ar(s.amount_to_collect)}</b></div>
      ${s.collected ? `<div class="row between small"><span>${c('collected')}</span><b>${ar(s.collected)}</b></div>` : ''}
      ${s.return_fee ? `<div class="row between small" style="color:var(--red)"><span>Frais de retour (expéditeur)</span><b>${ar(s.return_fee)}</b></div>` : ''}
    </div>
    ${s.courier ? `<div class="small">🚲 <b>${esc(s.courier.name || '')}</b>${s.departure_at ? ` · ${c('departure')} ${dayLabel(s.departure_at)} ${time(s.departure_at)} · ${esc(s.axe || '')}` : ''} ${s.courier.phone && !isCourier ? call(s.courier.phone) : ''}</div>` : ''}
    ${s.has_photo ? `<img data-ph alt="${c('photo')}" style="width:100%;border-radius:12px;max-height:320px;object-fit:cover;background:var(--bg)">` : ''}
    ${s.delivery_pin && ['pending', 'assigned', 'picked_up'].includes(s.status) ? `<div class="card" style="text-align:center;background:var(--green-soft);border:0">
      <div class="small muted">${state.lang === 'mg' ? 'Kaody fanamarinana (omena ny livreur rehefa voaray ny entana)' : 'Code de confirmation (à donner au livreur à la réception)'}</div>
      <div class="pin-box" style="margin-top:6px">${[...s.delivery_pin].map((x) => `<span>${x}</span>`).join('')}</div>
      ${role === 'sender' ? `<div class="tiny muted" style="margin-top:6px">${state.lang === 'mg' ? 'Alefaso amin\'ny mpandray ity kaody ity (SMS, appel).' : 'Transmettez ce code au destinataire (SMS, appel).'}</div>` : ''}</div>` : ''}
    ${stepBar(s)}
    <div class="small"><b>Suivi</b>${s.events.map((e) => `<div class="row between" style="border-bottom:1px solid var(--line);padding:3px 0"><span>${esc(e.status === 'assigned' ? stepLabel('scheduled') : stepLabel(e.status))}${e.note ? ` <span class="muted">— ${esc(e.note)}</span>` : ''}</span><span class="muted tiny">${dt(e.at)}</span></div>`).join('')}</div>
    <div class="stack" data-actions></div></div>`);
  const el = m.el;
  if (s.has_photo) photoUrl(s.id).then((u) => { const im = el.querySelector('[data-ph]'); if (u && im) im.src = u; });
  if (courierMarker && s.courier?.lat != null) courierMarker(s);
  const acts = el.querySelector('[data-actions]');
  const done = () => { m.close(); onChange?.(); };
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn block ${cls}`; b.textContent = label; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toastErr(e); } b.disabled = false; }; acts.append(b); };
  el.querySelector('[data-fee]')?.addEventListener('click', async () => {
    const v = await promptBox(c('fee'), { label: 'Ariary', type: 'number', value: s.fee }); if (v == null || v === '') return;
    await api('POST', `/api/shipments/${s.id}/fee`, { fee: Number(v) }).then(done).catch(toastErr);
  });
  if (isCourier) {
    if (s.status === 'assigned') btn(`📦 ${c('pickup_btn')}`, 'primary lg', () => { m.close(); pickupForm(s, () => onChange?.()); });
    if (s.status === 'picked_up') {
      if (!s.courier_confirmed_at) btn(`${c('delivered_ok')} · ${ar(s.amount_to_collect)}`, 'primary lg', () => { m.close(); deliverForm(s, () => onChange?.()); });
      else acts.insertAdjacentHTML('beforeend', `<div class="card small" style="background:var(--sun-soft);border:0">⏳ ${esc(stepLabel('awaiting_recipient'))}</div>`);
      btn(c('refused_btn'), 'sun', async () => {
        const note = await promptBox(c('refused_btn'), { label: c('reason') }); if (!note) return;
        const v = await promptBox(c('fee'), { label: c('collected') + ' (Ar)', type: 'number', value: s.fee }); if (v == null) return;
        await api('POST', `/api/shipments/${s.id}/refuse`, { note, collected: Number(v) }); done();
      });
      btn(c('cancel_btn'), 'danger', async () => {
        const note = await promptBox(c('cancel_btn'), { label: c('reason') }); if (!note) return;
        await api('POST', `/api/shipments/${s.id}/cancel`, { note }); done();
      });
    }
    if (s.to_return) btn(c('returned_btn'), 'primary lg', async () => { if (await confirmBox(c('returned_btn') + ' ?', 'OK')) { await api('POST', `/api/shipments/${s.id}/returned`, {}); done(); } });
  }
  if ((role === 'recipient' || isAdmin) && s.status === 'picked_up' && !s.recipient_confirmed_at) {
    btn(state.lang === 'mg' ? '✅ Voaray ny entana' : '✅ J\'ai reçu le colis', 'primary lg', async () => {
      if (!(await confirmBox(isAdmin ? 'Confirmer la réception à la place du destinataire (preuve hors application) ?' : (state.lang === 'mg' ? `Hamafisinao fa voarainao ny entana ary nandoa ${ar(s.amount_to_collect)} ianao?` : `Confirmez-vous avoir reçu le colis et payé ${ar(s.amount_to_collect)} ?`), 'OK'))) return;
      const r = await api('POST', `/api/shipments/${s.id}/confirm`, isAdmin ? { note: 'Confirmé par téléphone' } : {});
      toast(r.delivered ? stepLabel('delivered') : stepLabel('recipient_confirmed'), 'ok'); done();
    });
    btn(state.lang === 'mg' ? '⚠ Tsy voaray' : '⚠ Je n\'ai pas reçu le colis', 'danger', async () => {
      const note = await promptBox(state.lang === 'mg' ? 'Inona no nitranga?' : 'Que s\'est-il passé ?', { label: c('reason') }); if (!note) return;
      await api('POST', `/api/shipments/${s.id}/confirm`, { received: false, note }); toast(stepLabel('disputed'), 'err'); done();
    });
  }
  if (!isCourier && ['pending', 'assigned'].includes(s.status) && (isAdmin || role === 'sender')) {
    btn('✖ ' + (state.lang === 'mg' ? 'Foanana' : 'Annuler le colis'), 'danger', async () => {
      const note = await promptBox(state.lang === 'mg' ? 'Foanana' : 'Annuler', { label: c('reason') }); if (!note) return;
      await api('POST', `/api/shipments/${s.id}/cancel`, { note }); done();
    });
  }
  if (isAdmin && s.status === 'picked_up') btn('✖ Annuler → retour expéditeur (frais à sa charge)', 'danger', async () => {
    const note = await promptBox('Annuler après récupération', { label: c('reason') }); if (!note) return;
    await api('POST', `/api/shipments/${s.id}/cancel`, { note }); done();
  });
  return { modal: m, shipment: s, actions: acts, button: btn };
}

// Remise au destinataire : code PIN (preuve immédiate) ou confirmation par le destinataire dans son application.
function deliverForm(s, done) {
  const mg = state.lang === 'mg';
  const m = modal(`${c('deliver_btn')} · ${s.ref}`, `<div class="stack">
    <label class="field"><span>${c('collected')} (Ar)</span><input class="input" data-v inputmode="numeric" value="${s.amount_to_collect}" style="font-size:1.3rem;font-weight:800"></label>
    <label class="field"><span>${mg ? 'Kaody 4 isa avy amin\'ny mpandray' : 'Code à 4 chiffres donné par le destinataire'}</span>
      <input class="input" data-pin inputmode="numeric" maxlength="4" placeholder="••••" style="text-align:center;font-size:1.8rem;letter-spacing:.5em;font-weight:850"></label>
    <button class="btn primary lg block" data-ok>✅ ${mg ? 'Hamafisina amin\'ny kaody' : 'Confirmer avec le code'}</button>
    <button class="btn block" data-nopin style="white-space:normal;line-height:1.3">${mg ? 'Tsy manana kaody → ny mpandray no hanamarina amin\'ny application-ny' : 'Pas de code → le destinataire confirmera dans son application'}</button>
    <p class="tiny muted">${mg ? 'Tsy ho « Tonga » ny entana raha tsy samy manamarina ianao sy ny mpandray.' : 'Le colis n\'est « Livré » qu\'une fois confirmé par vous ET par le destinataire.'}</p></div>`);
  const send = async (withPin) => {
    const pin = m.el.querySelector('[data-pin]').value.trim();
    if (withPin && !/^\d{4}$/.test(pin)) return toast(mg ? 'Kaody 4 isa' : 'Code à 4 chiffres', 'err');
    let pos = [];
    try { pos = await getPosition({ timeout: 5000 }); } catch {}
    try {
      const r = await api('POST', `/api/shipments/${s.id}/deliver`, { collected: Number(m.el.querySelector('[data-v]').value.replace(/\D/g, '')), pin: withPin ? pin : undefined, lat: pos[0], lng: pos[1] });
      m.close(); toast(r.delivered ? stepLabel('delivered') : stepLabel('awaiting_recipient'), 'ok'); done();
    } catch (err) { toastErr(err); }
  };
  m.el.querySelector('[data-ok]').onclick = () => send(true);
  m.el.querySelector('[data-nopin]').onclick = () => send(false);
}

function pickupForm(s, done) {
  const m = modal(`${c('pickup_btn')} · ${s.ref}`, `<div class="stack">
    <label class="btn sun lg block" style="cursor:pointer">${c('take_photo')}<input type="file" accept="image/*" capture="environment" data-file hidden></label>
    <img data-prev alt="" style="width:100%;border-radius:12px;display:none;max-height:280px;object-fit:cover">
    <label class="field"><span>${c('value')} (Ar)</span><input class="input" data-v inputmode="numeric" value="${s.declared_value || ''}" style="font-size:1.3rem;font-weight:800"></label>
    <label class="field"><span>${c('fee')} (Ar)</span><input class="input" data-fee inputmode="numeric" value="${s.fee}"></label>
    <div class="card small" style="background:var(--bg);border:0" data-tot></div>
    <button class="btn primary lg block" data-ok>✅ ${c('pickup_btn')}</button></div>`);
  let photo = null;
  const el = m.el;
  const tot = () => { el.querySelector('[data-tot]').innerHTML = `${c('to_collect')} : <b>${ar((Number(el.querySelector('[data-v]').value) || 0) + (Number(el.querySelector('[data-fee]').value) || 0))}</b>`; };
  tot(); el.addEventListener('input', tot);
  el.querySelector('[data-file]').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { photo = await compressImage(f); const im = el.querySelector('[data-prev]'); im.src = photo; im.style.display = 'block'; } catch (err) { toastErr(err); }
  });
  el.querySelector('[data-ok]').onclick = async () => {
    if (!photo) return toast(c('photo') + ' ?', 'err');
    let pos = [];
    try { pos = await getPosition({ timeout: 5000 }); } catch {}
    try {
      await api('POST', `/api/shipments/${s.id}/pickup`, { photo, value: Number(el.querySelector('[data-v]').value.replace(/\D/g, '')), fee: Number(el.querySelector('[data-fee]').value.replace(/\D/g, '')), lat: pos[0], lng: pos[1] });
      m.close(); toast(c('sh_picked_up'), 'ok'); done();
    } catch (err) { toastErr(err); }
  };
}

// ---------------------------------------------------------------- planning du livreur (saisi par lui-même)
const DAYS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'];
const toMin = (v) => { const [h, mi] = String(v || '0:0').split(':').map(Number); return h * 60 + (mi || 0); };
export async function courierScheduleEditor(container, onSaved) {
  const { slots: cur, axes } = await api('GET', '/api/courier/schedule');
  let slots = cur.map((x) => ({ axe_id: x.axe_id, start_min: x.start_min, end_min: x.end_min, days: x.days }));
  const render = () => {
    slots.sort((a, b) => a.start_min - b.start_min);
    container.innerHTML = `<div class="small muted" style="margin-bottom:8px">${state.lang === 'mg' ? 'Ampidiro ny ora hialanao eo amin\'ny centre sy ny axe halehanao. Hitan\'ny client rehetra izany.' : 'Indiquez vos heures de départ du centre et l\'axe parcouru. Tous les clients les voient.'}</div>
      ${axes.length ? '' : '<p class="muted">Aucun axe : demandez au centre d\'en créer.</p>'}
      <div class="list">${slots.map((x, i) => `<div class="card" data-i="${i}" style="padding:10px">
        <div class="row"><select class="input grow" data-k="axe_id">${axes.map((a) => `<option value="${a.id}" ${a.id === x.axe_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select><button class="btn sm danger" data-del>✕</button></div>
        <div class="row" style="margin-top:6px"><label class="field grow"><span>${c('dep_time')}</span><input class="input" type="time" data-k="start" value="${hm(x.start_min)}"></label><label class="field grow"><span>${c('ret_time')}</span><input class="input" type="time" data-k="end" value="${x.end_min >= 1440 ? '23:59' : hm(x.end_min)}"></label></div>
        <div class="chips" style="margin-top:6px">${DAYS.map((d, j) => `<button class="chip ${String(x.days).includes(String(j + 1)) ? 'on' : ''}" data-day="${j + 1}" style="padding:.25rem .55rem">${d}</button>`).join('')}</div></div>`).join('') || `<p class="muted">${c('empty')}</p>`}</div>
      <div class="row" style="margin-top:10px"><button class="btn grow" data-add ${axes.length ? '' : 'disabled'}>${c('add_dep')}</button><button class="btn primary grow" data-save>${c('save')}</button></div>`;
  };
  render();
  container.onchange = (e) => {
    const row = e.target.closest('[data-i]'); if (!row) return; const x = slots[+row.dataset.i];
    if (e.target.dataset.k === 'axe_id') x.axe_id = +e.target.value;
    if (e.target.dataset.k === 'start') x.start_min = toMin(e.target.value);
    if (e.target.dataset.k === 'end') { const v = toMin(e.target.value); x.end_min = v === 1439 ? 1440 : v; }
  };
  container.onclick = async (e) => {
    const row = e.target.closest('[data-i]');
    if (row && e.target.closest('[data-del]')) { slots.splice(+row.dataset.i, 1); return render(); }
    const d = e.target.closest('[data-day]')?.dataset.day;
    if (row && d) { const x = slots[+row.dataset.i]; x.days = String(x.days).includes(d) ? String(x.days).replace(d, '') : [...String(x.days) + d].sort().join(''); return render(); }
    if (e.target.closest('[data-add]')) { const last = slots[slots.length - 1]; const st = last ? Math.min(1380, last.end_min) : 480; slots.push({ axe_id: axes[0].id, start_min: st, end_min: Math.min(1440, st + 120), days: '1234567' }); return render(); }
    if (e.target.closest('[data-save]')) { try { await api('PUT', '/api/courier/schedule', { slots }); toast(c('save') + ' ✓', 'ok'); onSaved?.(); } catch (err) { toastErr(err); } }
  };
}

// ---------------------------------------------------------------- import Excel / CSV (une ligne = un colis)
const COLS = {
  external_ref: ['ref', 'reference', 'référence', 'n°', 'no', 'commande', 'n° commande', 'no commande', 'order', 'facture', 'id'],
  status: ['statut', 'status', 'etat', 'état'],
  paid: ['payé', 'paye', 'déjà payé', 'acompte', 'avance'],
  zone: ['zone', 'secteur'],
  facebook: ['facebook', 'nom facebook'],
  recipient_name: ['nom', 'destinataire', 'client', 'name', 'anarana', 'mpandray'],
  recipient_phone: ['telephone', 'téléphone', 'tel', 'tél', 'phone', 'contact', 'finday', 'numero', 'numéro'],
  drop_addr: ['adresse', 'adresse de livraison', 'address', 'quartier', 'lieu', 'adiresy', 'livraison'],
  declared_value: ['valeur', 'montant', 'prix', 'total', 'value', 'vidiny', 'somme'],
  description: ['description', 'article', 'produit', 'contenu', 'designation', 'désignation', 'entana'],
  drop_lat: ['lat', 'latitude'], drop_lng: ['lng', 'lon', 'longitude'],
};
const norm = (h) => String(h || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
function mapHeader(h) {
  const n = norm(h);
  for (const [k, list] of Object.entries(COLS)) if (list.some((x) => norm(x) === n)) return k;
  for (const [k, list] of Object.entries(COLS)) if (list.some((x) => n.includes(norm(x)))) return k;
  return null;
}
function parseCsv(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
function loadScript(src) {
  return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Lecture Excel indisponible : enregistrez le fichier en CSV')); document.head.append(s); });
}
async function readTable(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    await loadScript('https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  }
  return parseCsv((await file.text()).replace(/^﻿/, ''));
}
export function templateCsv() {
  const csv = '﻿ref;nom;telephone;adresse;valeur;description\r\nCMD-1042;Rasoa Rakoto;034 12 345 67;Behoririka, près de la pharmacie;25000;Robe taille M\r\nCMD-1043;Hery;033 11 222 33;Ankorondrano, immeuble Fitaratra;12000;Chaussures\r\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'alefa-modele-colis.csv'; a.click();
}

export function importForm({ adminMode = false, onDone } = {}) {
  const mg = state.lang === 'mg';
  let rows = [];
  const m = modal(mg ? 'Hampiditra Excel / CSV' : 'Importer un fichier Excel / CSV', `<div class="stack">
    <p class="small muted">${mg ? 'Avoahy avy amin\'ny logiciel de vente ny lisitry ny baiko (Excel na CSV). Andalana iray = colis iray.' : 'Exportez la liste des commandes depuis votre logiciel de vente (Excel ou CSV). Une ligne = un colis.'}
      ${mg ? 'Tsanganana' : 'Colonnes'} : <b>ref · nom · telephone · adresse · valeur · description</b>. <a href="#" data-tpl>⬇ ${mg ? 'Modely' : 'Modèle'}</a></p>
    ${adminMode ? `<label class="field"><span>Téléphone de l'expéditeur (compte client)</span><input class="input" data-sp type="tel"></label>` : ''}
    <label class="field"><span>🟢 ${c('pickup_addr')} (${mg ? 'ho an\'ny colis rehetra' : 'pour tous les colis'})</span><div class="row"><input class="input grow" data-pk placeholder="Boutique, quartier…"><button class="btn" data-gps>◎</button></div></label>
    <label class="btn sun lg block" style="cursor:pointer">📄 ${mg ? 'Safidio ny rakitra' : 'Choisir le fichier'}<input type="file" accept=".csv,.txt,.xlsx,.xls,.ods" data-file hidden></label>
    <div data-prev></div>
    <label class="row small"><input type="checkbox" data-geo checked> ${mg ? 'Hitady ho azy ny toerana GPS amin\'ny adiresy (1 segondra isaky ny adiresy)' : 'Rechercher automatiquement la position GPS des adresses (≈ 1 s par adresse)'}</label>
    <button class="btn primary lg block" data-ok disabled>${mg ? 'Alefa daholo' : 'Envoyer tous les colis'}</button></div>`, { wide: true });
  const el = m.el;
  let pk = null;
  el.querySelector('[data-tpl]').onclick = (e) => { e.preventDefault(); templateCsv(); };
  el.querySelector('[data-gps]').onclick = async () => { try { const [lat, lng] = await getPosition(); pk = { lat, lng }; el.querySelector('[data-pk]').value = await reverse(lat, lng); } catch (e) { toastErr(e); } };
  el.querySelector('[data-file]').onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const table = await readTable(file);
      const hi = table.findIndex((r) => r.filter((h) => mapHeader(h)).length >= 2);
      if (hi < 0) throw new Error(mg ? 'Tsy hita ny tsanganana (nom, telephone, adresse…)' : 'Colonnes introuvables (nom, telephone, adresse…) : utilisez le modèle');
      const keys = table[hi].map(mapHeader);
      const num = (v) => Number(String(v || '0').replace(/[^\d]/g, '')) || 0;
      let raw = table.slice(hi + 1).map((r) => { const o = {}; keys.forEach((k, i) => { if (k && !o[k] && String(r[i] ?? '').trim()) o[k] = String(r[i]).trim(); }); return o; })
        .filter((o) => o.recipient_phone || o.recipient_name);
      // Export « Ventes et commandes » d'un logiciel de vente (ex. Tsena) : on garde les commandes à livrer,
      // valeur = total − déjà payé, adresse = lieu + zone.
      const hasStatus = keys.includes('status');
      const READY = /attente de livraison|a livrer|prete|pret a livrer|a expedier/;
      const total = raw.length;
      if (hasStatus) raw = raw.filter((o) => READY.test(norm(o.status)));
      rows = raw.map((o) => ({
        ...o,
        recipient_name: o.recipient_name || o.facebook || 'Client',
        drop_addr: [o.drop_addr, o.zone].filter(Boolean).join(', ') || o.zone || '',
        declared_value: Math.max(0, num(o.declared_value) - num(o.paid)),
        drop_lat: o.drop_lat ? Number(String(o.drop_lat).replace(',', '.')) : undefined, drop_lng: o.drop_lng ? Number(String(o.drop_lng).replace(',', '.')) : undefined,
      })).map(({ status, paid, zone, facebook, ...r }) => r);
      el._hasStatus = hasStatus; el._total = total;
      el.querySelector('[data-prev]').innerHTML = `${hasStatus ? `<div class="card small" style="background:var(--green-soft);border:0">✅ ${mg ? `Export logiciel de vente : <b>${rows.length}</b> baiko « En attente de livraison » amin'ny ${total}. Vidiny = Total − efa naloa.` : `Export du logiciel de vente : <b>${rows.length}</b> commande(s) « En attente de livraison » sur ${total}. Valeur = total − déjà payé.`}</div>` : ''}
        <label class="field" style="margin-top:6px"><span>${mg ? 'Saran-dalana efa tafiditra ao amin\'ny Total, esorina (Ar)' : 'Frais de livraison déjà compris dans le total, à retirer (Ar)'}</span><input class="input" data-feein inputmode="numeric" value="0" style="max-width:160px"></label>
        <div class="small"><b>${rows.length}</b> ${c('parcels')} · ${mg ? 'tsanganana hita' : 'colonnes reconnues'} : ${keys.filter(Boolean).join(', ')}</div>
        <div class="tbl-wrap" style="max-height:220px;overflow:auto;margin-top:6px"><table class="tbl"><thead><tr><th>Réf</th><th>${c('rname')}</th><th>Tél</th><th>${c('drop_addr')}</th><th class="num">${c('value')}</th></tr></thead><tbody>
        ${rows.slice(0, 50).map((r) => `<tr><td>${esc(r.external_ref || '')}</td><td>${esc(r.recipient_name || '')}</td><td>${esc(r.recipient_phone || '')}</td><td class="small">${esc(r.drop_addr || '')}</td><td class="num">${ar(r.declared_value)}</td></tr>`).join('')}</tbody></table></div>`;
      el.querySelector('[data-ok]').disabled = !rows.length;
    } catch (err) { toastErr(err); }
  };
  el.querySelector('[data-ok]').onclick = async (e) => {
    const btn = e.target; btn.disabled = true;
    try {
      if (el.querySelector('[data-geo]').checked) {
        for (const [i, r] of rows.entries()) {
          if (r.drop_lat || !r.drop_addr) continue;
          btn.textContent = `📍 ${i + 1}/${rows.length}…`;
          const g = await geocode(r.drop_addr + ', Antananarivo').catch(() => []);
          if (g[0]) { r.drop_lat = g[0].lat; r.drop_lng = g[0].lng; }
          await new Promise((res) => setTimeout(res, 1100));
        }
      }
      btn.textContent = '…';
      const feeIn = Number((el.querySelector('[data-feein]')?.value || '0').replace(/\D/g, '')) || 0;
      if (feeIn) rows = rows.map((r) => ({ ...r, declared_value: Math.max(0, r.declared_value - feeIn) }));
      const res = await api('POST', '/api/shipments/bulk', { rows, pickup_addr: el.querySelector('[data-pk]').value.trim() || undefined, pickup_lat: pk?.lat, pickup_lng: pk?.lng, sender_phone: adminMode ? el.querySelector('[data-sp]').value : undefined });
      m.close();
      const r = modal(`✅ ${res.created} ${c('parcels')}${res.duplicates ? ` · ${res.duplicates} ${mg ? 'efa nalefa' : 'déjà envoyés'}` : ''}${res.errors ? ` · ⚠ ${res.errors}` : ''}`, `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Réf</th><th>${c('rname')}</th><th>Code</th><th>Statut</th></tr></thead><tbody>
        ${res.results.map((x) => `<tr><td>${x.line}</td><td>${x.ok ? `<b>${esc(x.ref)}</b> <span class="muted tiny">${esc(x.external_ref || '')}</span>` : ''}</td><td>${esc(x.recipient || '')}</td><td>${x.pin ? `<b>${esc(x.pin)}</b>` : ''}</td>
        <td class="small">${x.ok ? esc(x.duplicate ? (mg ? 'efa nalefa' : 'déjà envoyé') : stepLabel(x.step)) : `<span style="color:var(--red)">${esc(x.error)}</span>`}</td></tr>`).join('')}</tbody></table></div>
        <button class="btn block" data-dl style="margin-top:10px">⬇ ${mg ? 'Hampidina (misy kaody)' : 'Télécharger (avec les codes)'}</button>`, { wide: true });
      r.el.querySelector('[data-dl]').onclick = () => {
        const csv = '﻿ligne;ref_alefa;ref_commande;destinataire;telephone;code;statut\r\n' + res.results.map((x) => [x.line, x.ref || '', x.external_ref || '', x.recipient || '', x.recipient_phone || '', x.pin || '', x.ok ? (x.duplicate ? 'doublon' : x.step) : 'ERREUR ' + x.error].join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'alefa-import-resultat.csv'; a.click();
      };
      onDone?.();
    } catch (err) { toastErr(err); btn.disabled = false; btn.textContent = mg ? 'Alefa daholo' : 'Envoyer tous les colis'; }
  };
}
