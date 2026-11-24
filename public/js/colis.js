// Colis du centre : éléments partagés entre client, livreur et administration.
import { state, t, api, esc, $, ar, km, dt, time, hm, modal, toast, toastErr, confirmBox, promptBox, phoneFmt, geocode, reverse, getPosition, vehIcon } from './core.js';

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
    recipient_confirmed: 'Réception confirmée', pin_fail: 'Code PIN erroné', disputed: 'Réception contestée',
    accepted: 'Mission acceptée', declined: 'Mission refusée par un livreur', released: 'Trajet annulé — réaffecté', updated: 'Modifié par la boutique',
    to_centre: 'Vers le centre (relais)', at_centre: 'Au centre', centre_out: 'Repris au centre' },
  mg: { pending: 'Mbola tsy voalahatra', scheduled: 'Voalahatra', departed: 'Lasa (niala centre)', at_pickup: 'Tonga eo amin\'ny mpandefa', picked_up: 'Voaray', en_route: 'An-dalana',
    nearby: 'Efa akaiky', delivered: 'Tonga', refused: 'Nolavina', cancelled: 'Nofoanana', returning: 'Haverina amin\'ny mpandefa', returned: 'Naverina tamin\'ny mpandefa', fee: 'Saran-dalana novaina', assigned: 'Voalahatra',
    awaiting_recipient: 'Natolotra · miandry fanamarinan\'ny mpandray', awaiting_courier: 'Voaray · miandry fanamarinan\'ny livreur', courier_confirmed: 'Nambaran\'ny livreur fa natolotra',
    recipient_confirmed: 'Nohamafisin\'ny mpandray fa voaray', pin_fail: 'Kaody PIN diso', disputed: 'Nolavin\'ny mpandray fa tsy voaray',
    accepted: 'Neken\'ny livreur', declined: 'Nolavin\'ny livreur iray', released: 'Nofoanana ny dia — natolotra livreur hafa', updated: 'Novain\'ny boutique',
    to_centre: 'Mankany amin\'ny centre (relais)', at_centre: 'Ao amin\'ny centre', centre_out: 'Nalaina tao amin\'ny centre' },
};
export const stepLabel = (k) => (STEP[state.lang] || STEP.fr)[k] || STEP.fr[k] || k;
export const STEPS_FLOW = ['scheduled', 'departed', 'at_pickup', 'picked_up', 'en_route', 'nearby', 'awaiting_recipient', 'delivered'];
export const STEPS_RELAY = ['scheduled', 'departed', 'at_pickup', 'to_centre', 'at_centre', 'en_route', 'nearby', 'awaiting_recipient', 'delivered'];
export const stepBar = (s) => { const F = s.relay ? STEPS_RELAY : STEPS_FLOW; const k = s.step === 'awaiting_courier' ? 'awaiting_recipient' : s.relay && s.step === 'picked_up' ? 'en_route' : s.step; const i = F.indexOf(k); return i < 0 ? '' : `<div class="steps">${F.map((_, j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div>`; };
/** « Robe · 30×25×8 cm · 0,6 kg » */
export const sizeTxt = (s) => [s.contents || s.description, s.size ? `${s.size.l}×${s.size.w}×${s.size.h} cm` : '', s.weight_kg ? `${String(s.weight_kg).replace('.', ',')} kg` : ''].filter(Boolean).join(' · ');
export const c = (k) => (state.lang === 'mg' ? L_MG : L_FR)[k] ?? L_FR[k] ?? k;

const PILL = { to_centre: 'picked_up', at_centre: 'assigned', pending: 'pending', scheduled: 'assigned', departed: 'assigned', at_pickup: 'assigned', picked_up: 'picked_up', en_route: 'picked_up', nearby: 'picked_up', awaiting_recipient: 'pending', awaiting_courier: 'pending', delivered: 'delivered', refused: 'cancelled', cancelled: 'cancelled', returning: 'cancelled', returned: 'cancelled' };
export const shipPill = (s) => `<span class="status-pill st-${PILL[s.step] || 'pending'}">${esc(stepLabel(s.step))}</span>`;
const dayLabel = (ms) => {
  const iso = (x) => new Date(x + 3 * 3600e3).toISOString().slice(0, 10), d = iso(ms);
  return d === iso(Date.now()) ? c('today') : d === iso(Date.now() + 864e5) ? c('tomorrow') : `${d.slice(8, 10)}/${d.slice(5, 7)}`;
};

// Créneaux prévus : récupération et livraison (matin / après-midi).
export function winTxt(s) {
  if (!s.windows || ['delivered', 'refused', 'cancelled'].includes(s.status)) return '';
  const mg = state.lang === 'mg';
  const w = ([a, b]) => `${dayLabel(a)} ${time(a)}–${time(b)}`;
  return [['pending', 'assigned'].includes(s.status) ? `🕘 ${mg ? 'Haka' : 'Récup.'} ${w(s.windows.pickup)}` : null, `🏁 ${mg ? 'Hatitra' : 'Livraison'} ${w(s.windows.delivery)}`].filter(Boolean).join(' · ');
}

export function shipCard(s, extra = '') {
  return `<div class="card" data-act="ship" data-id="${s.id}" style="cursor:pointer">
    <div class="row between"><span class="small"><b>${esc(s.ref)}</b>${s.external_ref ? ` <span class="muted">· ${esc(s.external_ref)}</span>` : ''}</span>${shipPill(s)}</div>
    <div class="route-line" style="margin:6px 0"><span class="dot"></span><span class="small ellipsis">${esc(s.sender.name)} — ${esc(s.sender.address)}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(s.recipient.name)} — ${esc(s.recipient.address)}</span></div>
    ${sizeTxt(s) ? `<div class="tiny muted ellipsis">📦 ${esc(sizeTxt(s))}</div>` : ''}
    ${winTxt(s) ? `<div class="tiny ellipsis">${winTxt(s)}</div>` : ''}
    ${s.review ? `<div class="tiny" style="color:var(--orange)">⚠️ ${state.lang === 'mg' ? 'Andrasana ny fanamarinan\'ny centre' : 'En attente de validation du centre'}</div>` : ''}
    ${s.relay ? `<div class="tiny" style="color:var(--blue,#2563eb)">🏢 ${state.lang === 'mg' ? 'Relais' : 'Relais'} : ${esc(s.pickup_courier?.name?.split(' ')[0] || '?')} → centre → ${esc(s.delivery_courier?.name?.split(' ')[0] || '?')}</div>` : ''}
    <div class="row between small"><span class="muted">${s.departure_at ? `🕘 ${dayLabel(s.departure_at)} ${time(s.departure_at)} · ${esc(s.axe || '')}` : s.courier ? `🚲 ${esc(s.courier.name || '')}` : '⏳'}</span><b>${s.province ? `🚌 ${esc(s.province.city)}` : ''}${s.payment?.value_paid ? '📱 ' : ''}${ar(s.amount_to_collect)}</b></div>${stepBar(s)}${extra}</div>`;
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
  for (const tr of r.trips || []) (groups[dayLabel(tr.departure_at)] ||= []).push({ ...tr, axe: `${tr.from.split(',')[0]} → ${tr.to.split(',')[0]}`, color: '#0f7a55', trip: true });
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.departure_at - b.departure_at);
  return `<div class="small muted" style="margin-bottom:8px">🏢 ${esc(r.centre?.name || '')} · ${esc(c('fee'))} : <b>${ar(r.default_fee)}</b></div>
    ${Object.entries(groups).map(([day, list]) => `<h3>${esc(day)}</h3><div class="list">${list.map((d) => `<div class="card row" style="padding:10px 12px">
      <div style="text-align:center;min-width:56px"><div style="font-size:1.25rem;font-weight:850">${time(d.departure_at)}</div><div class="tiny muted">${c('back_at')} ${time(d.return_at)}</div></div>
      <div class="grow"><b><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(d.color)}"></span> ${esc(d.axe)}</b>${d.from_addr ? `<div class="small">📍 ${esc(d.from_addr.split(',')[0])} → 🏁 ${esc(d.to_addr.split(',')[0])}</div>` : ''}<div class="small muted">${d.trip ? '🛣' : vehIcon(d.vehicle)} ${esc(d.courier)} · ${d.load}${d.capacity ? '/' + d.capacity : ''} ${c('parcels')}${d.started ? ' · 🟢' : ''}</div></div></div>`).join('')}</div>`).join('') || `<p class="muted">${c('no_schedule')}</p>`}
    ${r.axes.length ? `<h3 style="margin-top:12px">Axes</h3><div class="chips">${r.axes.map((a) => `<span class="chip" style="border-color:${esc(a.color)}">${esc(a.name)}${a.fee ? ` · ${ar(a.fee)}` : ''}</span>`).join('')}</div>` : ''}`;
}

// ---------------------------------------------------------------- formulaire d'envoi (client ou centre)
export function sendForm({ me, onDone, adminMode = false, prefill = null }) {
  const f = { pickup: null, drop: null, slot: '', pay: 'cash' };
  const mg = state.lang === 'mg';
  const P = prefill || {};
  const m = modal(c('send_parcel'), `<div class="stack">
    ${adminMode ? `<label class="field"><span>Téléphone de l'expéditeur (compte client)</span><input class="input" data-sp type="tel" value="${esc(P.vendeur || '')}"></label>` : ''}
    ${P.ref ? `<div class="card small" style="background:var(--sun-soft);border:0">🔗 ${state.lang === 'mg' ? 'Baiko avy amin\'ny logiciel de vente' : 'Commande reçue du logiciel de vente'} : <b>${esc(P.ref)}</b></div>` : ''}
    <label class="field"><span>🟢 ${c('pickup_addr')}</span><div class="addr"><span class="ic"></span><input class="input" data-a="pickup" autocomplete="off" placeholder="Quartier, rue, repère…"><div class="act">${me ? '<button data-gps>◎</button>' : ''}</div><div class="suggest hidden" data-s="pickup"></div></div></label>
    <div class="row"><label class="field grow"><span>${c('rname')}</span><input class="input" data-rn value="${esc(P.nom || '')}"></label><label class="field grow"><span>${c('rphone')}</span><input class="input" data-rp type="tel" placeholder="034 12 345 67" value="${esc(P.tel || '')}"></label></div>
    <label class="field"><span>🟠 ${c('drop_addr')}</span><div class="addr"><span class="ic b"></span><input class="input" data-a="drop" autocomplete="off" placeholder="Quartier, rue, repère…" value="${esc(P.adresse || '')}"><div class="suggest hidden" data-s="drop"></div></div></label>
    <label class="field"><span>📦 ${state.lang === 'mg' ? 'Inona no ao anaty colis?' : 'Que contient le colis ?'}${adminMode ? '' : ' *'}</span><input class="input" data-d placeholder="${state.lang === 'mg' ? 'Ohatra : akanjo 2, kiraro' : 'Ex : 2 robes, chaussures'}" value="${esc(P.desc || P.description || '')}"></label>
    <div class="field"><span>📐 ${state.lang === 'mg' ? 'Haben\'ny colis (cm) : lava × sakany × haavony' : 'Taille du colis (cm) : longueur × largeur × hauteur'}${adminMode ? '' : ' *'}</span>
      <div class="row" style="gap:6px;align-items:center"><input class="input" data-dl inputmode="decimal" placeholder="30" style="width:80px"> × <input class="input" data-dw inputmode="decimal" placeholder="20" style="width:80px"> × <input class="input" data-dh inputmode="decimal" placeholder="10" style="width:80px">
        <input class="input" data-kg inputmode="decimal" placeholder="kg" style="width:80px" title="${state.lang === 'mg' ? 'Lanja (kg), tsy voatery' : 'Poids (kg), facultatif'}"></div>
      <div class="row wrap" style="gap:6px;margin-top:6px">${[['S', 20, 15, 5], ['M', 30, 25, 15], ['L', 45, 35, 25], ['XL', 60, 40, 40]].map(([k, l, w, h]) => `<button type="button" class="btn sm" data-sz="${l}|${w}|${h}">${k} · ${l}×${w}×${h}</button>`).join('')}</div></div>
    <label class="field"><span>${c('value')} (Ar)</span><input class="input" data-v inputmode="numeric" placeholder="20000" value="${esc(P.valeur || '')}"></label>
    <div class="field"><span>💳 ${mg ? 'Ny vidin\'entana' : 'Paiement de la marchandise'}</span>
      <div class="seg" data-pay><button type="button" class="on" data-pv="cash">💵 ${mg ? 'Vola an-tanana, raisin\'ny livreur' : 'Espèces, à encaisser par le livreur'}</button><button type="button" data-pv="mm">📱 ${mg ? 'Efa nalefa Mobile Money' : 'Déjà payée par Mobile Money'}</button></div>
</div>
    <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-prov> <b>🚌 ${mg ? 'Alefa any amin\'ny province (amin\'ny koperativa)' : 'Envoi en province (par coopérative)'}</b></label>
    <div class="stack hidden" data-provf style="gap:8px"><label class="field"><span>${mg ? 'Tanàna hanaterana' : 'Ville de destination'} *</span><input class="input" data-city placeholder="Fianarantsoa"></label>
      <label class="field"><span>${mg ? 'Koperativa' : 'Coopérative'} *</span><input class="input" data-coop placeholder="Kofmad, Sonatra…"></label>
      <div class="tiny muted">${mg ? 'Ny « adiresy fanaterana » dia ny toeram-pijanonan\'ny koperativa eto Antananarivo. Ny livreur no manatitra any, maka sary, ary manoratra ny fiara sy ny saran-dalana (PA na efa voaloa).' : 'L\'« adresse de livraison » est la gare de la coopérative à Antananarivo. Le livreur y remet le colis, photographie, et note le véhicule et les frais de transport (PA ou déjà payés).'}</div></div>
    <label class="field"><span>${state.lang === 'mg' ? 'Laharan\'ny baiko (tsy voatery)' : 'N° de commande (facultatif)'}</span><input class="input" data-ref value="${esc(P.ref || '')}" placeholder="CMD-1042"></label>
    <div class="row wrap" data-win style="gap:8px"><label class="field grow"><span>🕘 ${mg ? 'Ora hakana ny entana' : 'Récupération'}</span><select class="input" data-pw></select></label>
      <label class="field grow"><span>🏁 ${mg ? 'Ora hanaterana' : 'Livraison'}</span><select class="input" data-dw2></select></label></div>
    <div class="card" style="background:var(--bg);border:0" data-q><span class="small muted">${c('fee')} : —</span></div>
    <p class="tiny muted">${c('pay_info')}</p>
    <button class="btn primary lg block" data-ok>${c('create')}</button></div>`);
  const el = m.el;
  let tmr;
  const quote = async () => {
    const box = el.querySelector('[data-q]');
    if (!f.drop) return;
    const v = Number(el.querySelector('[data-v]').value.replace(/\D/g, '')) || 0;
    const r = await api('POST', '/api/shipments/quote', { drop_lat: f.drop.lat, drop_lng: f.drop.lng, value: v, weight: el.querySelector('[data-kg]').value }).catch(() => null);
    if (!r) return;
    const prov = el.querySelector('[data-prov]').checked;
    const due = prov ? 0 : (f.pay === 'mm' ? 0 : v) + r.fee;
    box.innerHTML = `<div class="row between"><span>${c('fee')}</span><b>${ar(r.fee)}</b></div>${r.weight_extra ? `<div class="tiny muted">${mg ? 'Anatin\'izany ny lanja' : 'Dont supplément poids'} : ${ar(r.weight_extra)}${r.moto_only ? ' · 🏍️ moto' : ''}</div>` : ''}
      <div class="row between"><span>${c('to_collect')}</span><b>${ar(due)}</b></div>
      ${f.pay === 'mm' && !prov ? `<div class="small">💵 ${mg ? 'Ny frais' : 'Frais'} <b>${ar(r.fee)}</b> ${mg ? 'aloanao amin\'ny livreur rehefa haka ny entana' : 'à payer au livreur à la récupération'}</div>` : ''}
      ${r.review ? `<div class="small" style="color:var(--orange)">⚠️ ${r.review === 'value' ? (mg ? `Mihoatra ny ${ar(r.max_value)} ny vidin'entana : ny centre aloha no manamarina.` : `Valeur au-delà de ${ar(r.max_value)} : le centre doit d'abord valider.`) : (mg ? 'Mavesatra loatra : ny centre aloha no manamarina sy milaza ny vidiny.' : 'Trop lourd : le centre doit d\'abord valider et fixer le prix.')}</div>` : ''}
      ${prov ? `<div class="tiny muted">${mg ? 'Province : tsy misy vola raisina any amin\'ny koperativa ; esorina amin\'ny vola aloa anao ny frais Alefa.' : 'Province : rien à encaisser à la coopérative ; les frais Alefa sont retenus sur votre paiement.'}</div>` : f.pay === 'mm' ? `<div class="tiny muted">${mg ? 'Efa voaloa ny entana : ny frais ihany no raisin\'ny livreur.' : 'Marchandise déjà payée : le livreur n\'encaisse que les frais.'}</div>` : ''}
      ${adminMode ? `<label class="field" style="margin-top:8px"><span>${c('departure')}</span><select class="input" data-dep><option value="">${c('auto_dep')}</option>
      ${r.departures.map((d) => `<option value="${d.slot_id}|${d.departure_at}">${dayLabel(d.departure_at)} ${time(d.departure_at)} · ${esc(d.axe)}${d.from_addr ? ` (${esc(d.from_addr.split(',')[0])} → ${esc(d.to_addr.split(',')[0])})` : ''} · ${vehIcon(d.vehicle)} ${esc(d.courier)}</option>`).join('')}</select></label>
      ${r.departures.length ? '' : `<div class="tiny" style="color:var(--orange)">${c('no_dep')}</div>`}` : `<div class="tiny muted" data-qok>${mg ? 'Ny centre no mandahatra ny livreur haka ny entana.' : 'Le centre programme le livreur qui viendra récupérer le colis.'}</div>`}`;
  };
  // Créneaux matin / après-midi : récupération (le plus tôt par défaut) et livraison (au plus tard le créneau suivant).
  let wins = [];
  const winLabel = (w) => {
    const d0 = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), d = new Date(w.from + 3 * 3600e3).toISOString().slice(0, 10);
    const day = d === d0 ? (mg ? 'Anio' : 'Aujourd\'hui') : d === new Date(Date.now() + 27 * 3600e3).toISOString().slice(0, 10) ? (mg ? 'Rahampitso' : 'Demain') : dayLabel(w.from);
    return `${day} ${w.part === 'am' ? (mg ? 'maraina' : 'matin') : (mg ? 'tolakandro' : 'après-midi')} (${time(w.from)}–${time(w.to)})`;
  };
  const fillDeliv = () => {
    const pi = Math.max(0, wins.findIndex((w) => String(w.from) === el.querySelector('[data-pw]').value));
    const later = wins.slice(pi + 1);
    el.querySelector('[data-dw2]').innerHTML = later.map((w, i) => `<option value="${i ? w.from : ''}">${i ? '' : (mg ? 'Haingana indrindra · ' : 'Au plus tôt · ')}${winLabel(w)}</option>`).join('');
  };
  api('GET', '/api/shipments/windows').then((r) => {
    wins = r.windows;
    el.querySelector('[data-pw]').innerHTML = wins.slice(0, 6).map((w, i) => `<option value="${w.from}">${i ? '' : (mg ? 'Haingana indrindra · ' : 'Au plus tôt · ')}${winLabel(w)}</option>`).join('');
    fillDeliv();
  }).catch(() => el.querySelector('[data-win]').classList.add('hidden'));
  el.addEventListener('change', (e) => { if (e.target.matches('[data-pw]')) fillDeliv(); });
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.a;
    if (e.target.matches('[data-v], [data-kg]')) return quote();
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
    const pv = e.target.closest('[data-pv]');
    if (pv) { f.pay = pv.dataset.pv; el.querySelectorAll('[data-pv]').forEach((x) => x.classList.toggle('on', x === pv)); quote(); }
    if (e.target.matches('[data-prov]')) { el.querySelector('[data-provf]').classList.toggle('hidden', !e.target.checked); quote(); }
    const sz = e.target.closest('[data-sz]');
    if (sz) { const [l, w, h] = sz.dataset.sz.split('|'); el.querySelector('[data-dl]').value = l; el.querySelector('[data-dw]').value = w; el.querySelector('[data-dh]').value = h; }
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
        size: txt('[data-dl]') || txt('[data-dw]') || txt('[data-dh]') ? { l: txt('[data-dl]').replace(',', '.'), w: txt('[data-dw]').replace(',', '.'), h: txt('[data-dh]').replace(',', '.') } : undefined,
        weight: txt('[data-kg]') ? txt('[data-kg]').replace(',', '.') : undefined,
        slot_id: dep ? Number(dep.split('|')[0]) : undefined, departure_at: dep ? Number(dep.split('|')[1]) : undefined, external_ref: txt('[data-ref]') || undefined,
        value_paid: f.pay === 'mm',
        pickup_at: Number(el.querySelector('[data-pw]').value) || undefined, deliver_at: Number(el.querySelector('[data-dw2]').value) || undefined,
        province: el.querySelector('[data-prov]').checked || undefined, dest_city: txt('[data-city]') || undefined, coop_name: txt('[data-coop]') || undefined,
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
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      // Toujours en JPEG léger (< ~450 Ko) pour passer même sur une connexion lente.
      let q = quality, out = cv.toDataURL('image/jpeg', q);
      while (out.length > 450_000 && q > 0.35) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      resolve(out);
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
    ${sizeTxt(s) ? `<div class="small">📦 ${esc(sizeTxt(s))}</div>` : ''}
    ${s.relay ? `<div class="card small" style="background:var(--bg);border:0">🏢 <b>${state.lang === 'mg' ? 'Relais amin\'ny centre' : 'Relais par le centre'}</b><br>
      🟢 ${state.lang === 'mg' ? 'Maka' : 'Récupération'} : <b>${esc(s.pickup_courier?.name || '—')}</b> → 🏢 centre${s.centre_in_at ? ` <span class="muted">(${dt(s.centre_in_at)})</span>` : ''}<br>
      🟠 ${state.lang === 'mg' ? 'Manatitra' : 'Livraison'} : <b>${esc(s.delivery_courier?.name || '—')}</b>${s.centre_out_at ? ` <span class="muted">(${state.lang === 'mg' ? 'nalaina' : 'repris'} ${dt(s.centre_out_at)})</span>` : ''}</div>` : ''}
    ${s.delivery_proof && (isAdmin || role === 'sender') ? `<div class="card small" style="background:var(--bg);border:0">🧾 <b>${state.lang === 'mg' ? 'Porofo fanaterana' : 'Preuve de livraison'}</b>
      ${s.delivery_proof.dist_m != null ? ` · 📍 ${s.delivery_proof.dist_m} m ${state.lang === 'mg' ? 'miala ny adiresy' : 'de l\'adresse'}${s.delivery_proof.dist_m > 300 ? ' ⚠️' : ' ✅'}` : ' · 📍 —'}
      ${s.delivery_proof.photo ? `<img data-dph alt="" style="width:100%;border-radius:12px;max-height:320px;object-fit:cover;margin-top:6px;background:var(--bg)">` : ''}</div>` : ''}
    ${winTxt(s) ? `<div class="small">${winTxt(s)}</div>` : ''}
    ${s.review ? `<div class="card small" style="background:var(--sun-soft);border:0">⚠️ <b>${state.lang === 'mg' ? 'Andrasana ny fanamarinan\'ny centre' : 'En attente de validation du centre'}</b> · ${esc(s.review)}</div>` : ''}
    ${s.payment?.fee_at_pickup ? `<div class="small">💵 ${state.lang === 'mg' ? 'Frais raisina rehefa haka' : 'Frais encaissés à la récupération'} : <b>${ar(s.payment.fee_at_pickup)}</b>${s.payment.pickup_fee != null ? ' ✓' : ''}</div>` : ''}
    ${s.shares && (isCourier || isAdmin) ? `<div class="small muted">${state.lang === 'mg' ? 'Anjara' : 'Parts'} : centre ${ar(s.shares.centre)} · ${state.lang === 'mg' ? 'livreur' : 'livreur'} ${ar(s.shares.courier)} · ${s.shares.paid ? '✅ ' + (state.lang === 'mg' ? 'voaloa' : 'réglé') : '⏳ ' + (state.lang === 'mg' ? 'tsy mbola voaloa' : 'non réglé')}</div>` : ''}
    ${provinceCard(s)}
    ${s.payment?.value_paid ? `<div class="card small" style="background:var(--green-soft);border:0">📱 <b>${state.lang === 'mg' ? 'Efa voaloa Mobile Money ny entana' : 'Marchandise déjà payée par Mobile Money'}</b>${s.payment.ref ? ` · ${esc(s.payment.ref)}` : ''}<br>${state.lang === 'mg' ? 'Ny frais ihany no raisina.' : 'Seuls les frais sont à encaisser.'}</div>` : ''}
    <div class="card" style="background:var(--bg);border:0">
      <div class="row between small"><span>${c('value')}</span><b>${ar(s.value ?? s.declared_value)}${s.value != null && s.value !== s.declared_value && s.declared_value ? ` <span class="muted">(annoncée ${ar(s.declared_value)})</span>` : ''}</b></div>
      <div class="row between small"><span>${c('fee')}</span><b>${ar(s.fee)} ${(isAdmin || isCourier) && ['pending', 'assigned', 'picked_up'].includes(s.status) ? '<button class="btn sm" data-fee>✎</button>' : ''}</b></div>
      <div class="row between"><span>${c('to_collect')}</span><b style="font-size:1.15rem">${ar(s.amount_to_collect)}</b></div>
      ${s.collected ? `<div class="row between small"><span>${c('collected')}</span><b>${ar(s.collected)}</b></div>` : ''}
      ${s.return_fee ? `<div class="row between small" style="color:var(--red)"><span>Frais de retour (expéditeur)</span><b>${ar(s.return_fee)}</b></div>` : ''}
    </div>
    ${s.courier ? `<div class="small">🚲 <b>${esc(s.courier.name || '')}</b>${s.departure_at ? ` · ${c('departure')} ${dayLabel(s.departure_at)} ${time(s.departure_at)} · ${esc(s.axe || '')}` : ''} ${s.courier.phone && !isCourier ? call(s.courier.phone) : ''}</div>` : ''}
    ${s.has_photo ? `<img data-ph alt="${c('photo')}" style="width:100%;border-radius:12px;max-height:320px;object-fit:cover;background:var(--bg)">` : ''}
    ${isCourier && s.delivery_pin && s.status === 'picked_up' ? `<div class="card" style="text-align:center;background:var(--green-soft);border:0">
      <div class="small"><b>✅ ${state.lang === 'mg' ? 'Nanamarina ny client — kaody voaray' : 'Le client a confirmé — code reçu'}</b></div>
      <div class="pin-box" style="margin-top:6px">${[...s.delivery_pin].map((x) => `<span>${x}</span>`).join('')}</div></div>`
    : s.delivery_pin && !isCourier && ['pending', 'assigned', 'picked_up'].includes(s.status) ? (role === 'recipient'
      ? `<details class="small muted"><summary>${state.lang === 'mg' ? 'Asehoy ny kaody (raha tsy misy Internet ny livreur)' : 'Afficher le code (si le livreur n\'a pas Internet)'}</summary>
          <div class="pin-box" style="margin-top:6px">${[...s.delivery_pin].map((x) => `<span>${x}</span>`).join('')}</div></details>`
      : `<div class="card" style="text-align:center;background:var(--green-soft);border:0">
      <div class="small muted">${state.lang === 'mg' ? 'Kaody fanamarinana : alefa ho azy amin\'ny livreur rehefa manindry « Voaray » ny client' : 'Code de confirmation : transmis automatiquement au livreur quand le client appuie sur « J\'ai reçu »'}</div>
      <div class="pin-box" style="margin-top:6px">${[...s.delivery_pin].map((x) => `<span>${x}</span>`).join('')}</div></div>`) : ''}
    ${stepBar(s)}
    ${s.track_token && !isCourier && ['pending', 'assigned', 'picked_up'].includes(s.status) ? `<div class="row wrap small">🔗 <a href="/suivi/${esc(s.track_token)}" target="_blank" rel="noopener">${state.lang === 'mg' ? 'Rohy fanarahana amin\'ny sarintany' : 'Lien de suivi sur la carte'}</a>
      <a class="btn sm" href="sms:${esc(s.recipient.phone)}?body=${encodeURIComponent(`Alefa ${s.ref} : ${location.origin}/suivi/${s.track_token}`)}">✉ SMS</a></div>` : ''}
    <div class="small"><b>Suivi</b>${s.events.map((e) => `<div class="row between" style="border-bottom:1px solid var(--line);padding:3px 0"><span>${esc(e.status === 'assigned' ? stepLabel('scheduled') : stepLabel(e.status))}${e.note ? ` <span class="muted">— ${esc(e.note)}</span>` : ''}</span><span class="muted tiny">${dt(e.at)}</span></div>`).join('')}</div>
    <div class="stack" data-actions></div></div>`);
  const el = m.el;
  if (s.has_photo) photoUrl(s.id).then((u) => { const im = el.querySelector('[data-ph]'); if (u && im) im.src = u; });
  if (s.delivery_proof?.photo && el.querySelector('[data-dph]')) fetch(`/api/shipments/${s.id}/delivery-photo`, { headers: { authorization: `Bearer ${state.token}` } }).then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) el.querySelector('[data-dph]').src = URL.createObjectURL(b); });
  if (courierMarker && s.courier?.lat != null) courierMarker(s);
  const acts = el.querySelector('[data-actions]');
  const done = () => { m.close(); onChange?.(); };
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn block ${cls}`; b.textContent = label; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toastErr(e); } b.disabled = false; }; acts.append(b); };
  el.querySelector('[data-fee]')?.addEventListener('click', async () => {
    const v = await promptBox(c('fee'), { label: 'Ariary', type: 'number', value: s.fee }); if (v == null || v === '') return;
    await api('POST', `/api/shipments/${s.id}/fee`, { fee: Number(v) }).then(done).catch(toastErr);
  });
  if (isCourier) {
    if (s.status === 'assigned' && !s.accepted_at && s.courier?.id === state.user?.id) {
      btn(state.lang === 'mg' ? '👍 Ekeko ity iraka ity' : '👍 Accepter la mission', 'primary lg', async () => { await api('POST', `/api/shipments/${s.id}/accept`, {}); toast(stepLabel('accepted'), 'ok'); done(); });
      btn(state.lang === 'mg' ? '👎 Laviko' : '👎 Refuser', 'danger', async () => {
        const reason = await promptBox(state.lang === 'mg' ? 'Nahoana?' : 'Pourquoi ?', { label: c('reason'), placeholder: state.lang === 'mg' ? 'Ohatra : feno, tsy eo amin\'ny lalako' : 'Ex : plein, pas sur mon chemin' }); if (reason === null) return;
        const r = await api('POST', `/api/shipments/${s.id}/decline`, { reason });
        toast(r.reassigned_to ? `→ ${r.reassigned_to}` : stepLabel('declined'), 'ok'); done();
      });
    }
    if (s.status === 'assigned' && s.courier?.id === state.user?.id) btn(`📦 ${c('pickup_btn')}`, s.accepted_at ? 'primary lg' : '', () => { m.close(); pickupForm(s, () => onChange?.()); });
    const me = state.user?.id;
    if (s.step === 'to_centre' && s.courier?.id === me) btn(`🏢 ${state.lang === 'mg' ? 'Napetrako tao amin\'ny centre' : 'Déposé au centre'}`, 'primary lg', async () => { await api('POST', `/api/shipments/${s.id}/drop-centre`, {}); toast(stepLabel('at_centre'), 'ok'); done(); });
    else if (s.step === 'at_centre' && s.delivery_courier?.id === me) btn(`📦 ${state.lang === 'mg' ? 'Noraisiko tao amin\'ny centre' : 'Pris au centre'}`, 'primary lg', async () => { await api('POST', `/api/shipments/${s.id}/take-centre`, {}); toast(stepLabel('centre_out'), 'ok'); done(); sendLinkPrompt(s); });
    else if (s.relay && s.status === 'assigned' && s.delivery_courier?.id === me && s.pickup_courier?.id !== me)
      acts.insertAdjacentHTML('beforeend', `<div class="card small" style="background:var(--sun-soft);border:0">🏢 ${state.lang === 'mg' ? `${esc(s.pickup_courier?.name?.split(' ')[0] || '')} no maka azy ary mametraka azy ao amin'ny centre ; avy eo ianao no manatitra.` : `${esc(s.pickup_courier?.name?.split(' ')[0] || '')} le récupère et le dépose au centre ; vous le livrez ensuite.`}</div>`);
    if (s.status === 'picked_up' && !['to_centre', 'at_centre'].includes(s.step)) {
      if (!s.courier_confirmed_at) btn(s.province ? `🚌 ${state.lang === 'mg' ? 'Atolotra amin\'ny koperativa' : 'Remettre à la coopérative'} ${esc(s.province.coop)}` : `${c('delivered_ok')} · ${ar(s.amount_to_collect)}`, 'primary lg', () => { m.close(); deliverForm(s, () => onChange?.()); });
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
    btn(state.lang === 'mg' ? '✅ Tonga ny entana — alefaso ny kaody amin\'ny livreur' : '✅ J\'ai reçu le colis — envoyer le code au livreur', 'primary lg', async () => {
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
  if (isAdmin && s.step === 'to_centre') btn('🏢 Reçu au centre', 'primary', async () => { await api('POST', `/api/shipments/${s.id}/drop-centre`, {}); done(); });
  if (isAdmin && s.step === 'at_centre') btn(`📦 Remis à ${s.delivery_courier?.name?.split(' ')[0] || 'livreur'}`, 'primary', async () => { await api('POST', `/api/shipments/${s.id}/take-centre`, {}); done(); });
  if (isAdmin && s.status === 'picked_up') btn('✖ Annuler → retour expéditeur (frais à sa charge)', 'danger', async () => {
    const note = await promptBox('Annuler après récupération', { label: c('reason') }); if (!note) return;
    await api('POST', `/api/shipments/${s.id}/cancel`, { note }); done();
  });
  return { modal: m, shipment: s, actions: acts, button: btn };
}

// Remise au destinataire : code PIN (preuve immédiate) ou confirmation par le destinataire dans son application.
// Province : carte « coopérative » (ville, coopérative, véhicule, frais de transport PA / payé).
export function provinceCard(s) {
  const p = s.province; if (!p) return '';
  const mg = state.lang === 'mg';
  return `<div class="card small" style="background:var(--sun-soft);border:0">🚌 <b>${mg ? 'Alefa any' : 'Envoi en province'} : ${esc(p.city)}</b> · ${mg ? 'koperativa' : 'coopérative'} <b>${esc(p.coop)}</b>
    ${p.plate ? `<br>🚐 ${mg ? 'Fiara' : 'Véhicule'} : <b>${esc(p.plate)}</b>${p.driver_phone ? ` · 📞 <a href="tel:${esc(p.driver_phone)}">${esc(phoneFmt(p.driver_phone))}</a>` : ''}
      <br>💰 ${mg ? 'Saran-dalana' : 'Transport'} : <b>${ar(p.fee || 0)}</b> · ${p.fee_status === 'pa' ? `<b>PA</b> (${mg ? 'aloa rehefa tonga' : 'payé à l\'arrivée'})` : `✅ ${mg ? 'efa voaloa' : 'déjà payé'}`}` : ''}</div>`;
}

// Remise à la coopérative (province) : photo, véhicule, téléphone du chauffeur, frais de transport PA ou déjà payés.
function coopForm(s, done) {
  const mg = state.lang === 'mg';
  const p = s.province;
  const m = modal(`🚌 ${s.ref} → ${esc(p.city)}`, `<div class="stack">
    <div class="small">${mg ? 'Atolory' : 'Remettez à'} <b>${esc(p.coop)}</b> (${esc(s.recipient.address)}) · ${mg ? 'ho an\'i' : 'pour'} <b>${esc(s.recipient.name)}</b> ${esc(phoneFmt(s.recipient.phone))}</div>
    <label class="field"><span>📷 ${mg ? 'Sarin\'ny entana natolotra *' : 'Photo du colis remis *'}</span><input class="input" data-dphoto type="file" accept="image/*" capture="environment"></label>
    <img data-dprev alt="" style="display:none;width:100%;max-height:180px;object-fit:cover;border-radius:10px">
    <label class="field"><span>🚐 ${mg ? 'Fiara : laharana (plaque) / marika *' : 'Véhicule : immatriculation / repère *'}</span><input class="input" data-plate placeholder="1234 TBA"></label>
    <label class="field"><span>📞 ${mg ? 'Laharan\'ny mpamily na koperativa' : 'Téléphone du chauffeur ou de la coopérative'}</span><input class="input" data-dphone type="tel" placeholder="034 12 345 67"></label>
    <label class="field"><span>💰 ${mg ? 'Saran-dalan\'ny fiara (Ar) *' : 'Frais de transport (Ar) *'}</span><input class="input" data-cfee inputmode="numeric" placeholder="15000" style="font-size:1.2rem;font-weight:800"></label>
    <div class="seg" data-cst><button type="button" class="on" data-st="pa"><b>PA</b> · ${mg ? 'aloa rehefa tonga' : 'payé à l\'arrivée'}</button><button type="button" data-st="paid">✅ ${mg ? 'Efa voaloa' : 'Déjà payé'}</button></div>
    <button class="btn primary lg block" data-ok>✅ ${mg ? 'Voatolotra amin\'ny koperativa' : 'Remis à la coopérative'}</button></div>`);
  let photo = null, st = 'pa';
  m.el.querySelector('[data-dphoto]').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { photo = await compressImage(f); const im = m.el.querySelector('[data-dprev]'); im.src = photo; im.style.display = 'block'; } catch (err) { toastErr(err); }
  };
  m.el.querySelector('[data-cst]').onclick = (e) => { const b = e.target.closest('[data-st]'); if (!b) return; st = b.dataset.st; m.el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); };
  m.el.querySelector('[data-ok]').onclick = async () => {
    const v = (k) => m.el.querySelector(k).value.trim();
    if (!photo) return toast(mg ? 'Makà sary ny entana natolotra' : 'Prenez une photo du colis remis', 'err');
    if (!v('[data-plate]')) return toast(mg ? 'Soraty ny laharan\'ny fiara' : 'Indiquez le véhicule', 'err');
    if (v('[data-cfee]') === '') return toast(mg ? 'Soraty ny saran-dalana' : 'Indiquez les frais de transport', 'err');
    let pos = [];
    try { pos = await getPosition({ timeout: 5000 }); } catch {}
    try {
      await api('POST', `/api/shipments/${s.id}/deliver`, { photo, lat: pos[0], lng: pos[1], coop_plate: v('[data-plate]'), coop_driver_phone: v('[data-dphone]') || undefined,
        coop_fee: Number(v('[data-cfee]').replace(/\D/g, '')) || 0, coop_fee_status: st });
      m.close(); toast(mg ? 'Voatolotra amin\'ny koperativa ✅' : 'Remis à la coopérative ✅', 'ok'); done();
    } catch (err) { toastErr(err); }
  };
}

function deliverForm(s, done) {
  if (s.province) return coopForm(s, done);
  const mg = state.lang === 'mg';
  const got = s.delivery_pin && s.recipient_confirmed_at; // le client a appuyé sur « J'ai reçu » : code déjà transmis
  const m = modal(`${c('deliver_btn')} · ${s.ref}`, `<div class="stack">
    <label class="field"><span>${c('collected')} (Ar)</span><input class="input" data-v inputmode="numeric" value="${s.amount_to_collect}" style="font-size:1.3rem;font-weight:800"></label>
    ${got ? `<div class="card" style="text-align:center;background:var(--green-soft);border:0"><b>✅ ${mg ? 'Nanamarina ny client — kaody voaray ho azy' : 'Le client a confirmé — code reçu automatiquement'}</b></div>` : `<p class="small muted">${mg ? 'Asaivo manindry « Tonga ny entana » ao amin\'ny finday-ny ny client : ho tonga eto ho azy ny kaody.' : 'Demandez au client d\'appuyer sur « J\'ai reçu » sur son téléphone : le code arrive ici tout seul.'}</p>
      ${s.track_token ? `<a class="btn block" href="sms:${esc(s.recipient.phone)}?body=${encodeURIComponent(`Alefa ${s.ref} : votre colis est là. Appuyez sur « J'ai reçu » ici : ${location.origin}/suivi/${s.track_token}`)}">✉ ${mg ? 'Alefaso SMS ny rohy ho an\'ny client' : 'Envoyer le lien au client (SMS)'}</a>` : ''}`}
    <label class="field"><span>📷 ${mg ? 'Sarin\'ny colis natolotra (porofo) *' : 'Photo du colis remis (preuve) *'}</span>
      <input class="input" data-dphoto type="file" accept="image/*" capture="environment"></label>
    <img data-dprev alt="" style="display:none;width:100%;max-height:180px;object-fit:cover;border-radius:10px">
    <label class="field"><span>${mg ? 'Kaody 4 isa' : 'Code à 4 chiffres'}</span>
      <input class="input" data-pin inputmode="numeric" maxlength="4" placeholder="••••" value="${got ? esc(s.delivery_pin) : ''}" style="text-align:center;font-size:1.8rem;letter-spacing:.5em;font-weight:850"></label>
    <button class="btn primary lg block" data-ok>✅ ${mg ? 'Hamafisina amin\'ny kaody' : 'Confirmer avec le code'}</button>
    <button class="btn block" data-nopin style="white-space:normal;line-height:1.3">${mg ? 'Tsy manana kaody → ny mpandray no hanamarina amin\'ny application-ny' : 'Pas de code → le destinataire confirmera dans son application'}</button>
    <p class="tiny muted">${mg ? 'Tsy ho « Tonga » ny entana raha tsy samy manamarina ianao sy ny mpandray.' : 'Le colis n\'est « Livré » qu\'une fois confirmé par vous ET par le destinataire.'}</p></div>`);
  let photo = null;
  m.el.querySelector('[data-dphoto]').onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { photo = await compressImage(f); const im = m.el.querySelector('[data-dprev]'); im.src = photo; im.style.display = 'block'; } catch (err) { toastErr(err); }
  };
  const send = async (withPin) => {
    const pin = m.el.querySelector('[data-pin]').value.trim();
    if (withPin && !/^\d{4}$/.test(pin)) return toast(mg ? 'Kaody 4 isa' : 'Code à 4 chiffres', 'err');
    if (!photo) return toast(mg ? 'Makà sary ny colis natolotra' : 'Prenez une photo du colis remis', 'err');
    let pos = [];
    try { pos = await getPosition({ timeout: 5000 }); } catch {}
    try {
      const r = await api('POST', `/api/shipments/${s.id}/deliver`, { collected: Number(m.el.querySelector('[data-v]').value.replace(/\D/g, '')), pin: withPin ? pin : undefined, lat: pos[0], lng: pos[1], photo });
      m.close(); toast(r.delivered ? stepLabel('delivered') : stepLabel('awaiting_recipient'), 'ok'); done();
    } catch (err) { toastErr(err); }
  };
  m.el.querySelector('[data-ok]').onclick = () => send(true);
  m.el.querySelector('[data-nopin]').onclick = () => send(false);
  // En attendant le client : le code apparaît tout seul dès qu'il appuie sur « J'ai reçu ».
  if (!got) {
    const t = setInterval(async () => {
      if (!document.body.contains(m.el)) return clearInterval(t);
      try {
        const { shipment: x } = await api('GET', `/api/shipments/${s.id}`);
        if (x.delivery_pin && x.recipient_confirmed_at) {
          clearInterval(t);
          const inp = m.el.querySelector('[data-pin]'); inp.value = x.delivery_pin;
          inp.insertAdjacentHTML('beforebegin', `<div class="card" style="text-align:center;background:var(--green-soft);border:0;margin-bottom:6px"><b>✅ ${mg ? 'Nanamarina ny client — kaody voaray' : 'Le client a confirmé — code reçu'}</b></div>`);
          toast(`✅ ${mg ? 'Kaody voaray' : 'Code reçu'} : ${x.delivery_pin}`, 'ok');
        }
      } catch {}
    }, 4000);
  }
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
  const tot = () => { el.querySelector('[data-tot]').innerHTML = s.province ? `🚌 ${esc(s.province.city)} · ${esc(s.province.coop)} — ${state.lang === 'mg' ? 'tsy misy vola raisina' : 'rien à encaisser'}`
    : s.payment?.value_paid ? `📱 ${state.lang === 'mg' ? 'Efa voaloa ny entana.' : 'Marchandise déjà payée.'}<br>💵 <b>${state.lang === 'mg' ? 'Raiso amin\'ny mpandefa izao ny frais' : 'Encaissez maintenant les frais auprès de l\'expéditeur'} : ${ar(Number(el.querySelector('[data-fee]').value) || 0)}</b><br><span class="tiny muted">${state.lang === 'mg' ? 'Tsy anao io vola io : atolory ny centre (an\'ny livreur manatitra).' : 'Cet argent n\'est pas à vous : remettez-le au centre (il revient au livreur qui livre).'}</span>`
    : `${c('to_collect')} : <b>${ar((Number(el.querySelector('[data-v]').value) || 0) + (Number(el.querySelector('[data-fee]').value) || 0))}</b>`; };
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
      if (!s.relay) sendLinkPrompt(s); // en route vers le destinataire : on lui envoie le lien
    } catch (err) { toastErr(err); }
  };
}

// Le destinataire n'a pas de compte : il suit le colis et confirme la réception par un lien.
// Proposé au livreur dès qu'il part vers lui (après la récupération, ou en reprenant le colis au centre).
export function sendLinkPrompt(s) {
  if (!s.track_token || !s.recipient?.phone) return;
  const mg = state.lang === 'mg', url = `${location.origin}/suivi/${s.track_token}`;
  const body = mg ? `Alefa ${s.ref} : an-dalana ny entanao. Araho eto, ary tsindrio « Voaray » rehefa tonga : ${url}` : `Alefa ${s.ref} : votre colis est en route. Suivez-le ici et appuyez sur « J'ai reçu » à l'arrivée : ${url}`;
  const m = modal(mg ? '✉ Alefaso amin\'ny mpandray ny rohy' : '✉ Envoyer le lien au destinataire', `<div class="stack">
    <p class="small">${mg ? `Tsy manana kaonty ${esc(s.recipient.name)} : amin'ity rohy ity no hanarahany ny colis sy hanamarinany fa voarainy.` : `${esc(s.recipient.name)} n'a pas de compte : ce lien lui permet de suivre le colis et de confirmer la réception.`}</p>
    <a class="btn primary lg block" href="sms:${esc(s.recipient.phone)}?body=${encodeURIComponent(body)}">✉ SMS → ${esc(phoneFmt(s.recipient.phone))}</a>
    <a class="btn block" href="https://wa.me/${esc(String(s.recipient.phone).replace(/\D/g, ''))}?text=${encodeURIComponent(body)}" target="_blank" rel="noopener">WhatsApp</a>
    <button class="btn block" data-later>${mg ? 'Avy eo' : 'Plus tard'}</button></div>`);
  m.el.querySelector('[data-later]').onclick = () => m.close();
}

// ---------------------------------------------------------------- planning du livreur (saisi par lui-même)
const DAYS = ['L', 'Ma', 'Me', 'J', 'V', 'S', 'D'];
const toMin = (v) => { const [h, mi] = String(v || '0:0').split(':').map(Number); return h * 60 + (mi || 0); };
// Axes et heures du livreur : saisis par le centre, le livreur les consulte seulement.
export async function courierScheduleEditor(container) {
  const { slots } = await api('GET', '/api/courier/schedule');
  const mg = state.lang === 'mg';
  container.innerHTML = `<div class="small muted" style="margin-bottom:8px">${mg ? 'Ny centre no mametraka ny axe sy ny ora iaingananao. Hitan\'ny client rehetra izany.' : 'Vos axes et heures de départ sont fixés par le centre. Tous les clients les voient.'}</div>
    <div class="list">${slots.sort((a, b) => a.start_min - b.start_min).map((x) => `<div class="card" style="padding:10px">
      <div class="row between"><b>🧭 ${esc(x.axe_name || x.name || '')}</b><span class="small">${hm(x.start_min)} → ${x.end_min >= 1440 ? '24:00' : hm(x.end_min)}</span></div>
      ${x.from_addr ? `<div class="small">📍 ${esc(x.from_addr)} → 🏁 ${esc(x.to_addr)}${x.km ? ` · ${x.km} km` : ''}</div>` : ''}
      <div class="chips" style="margin-top:6px">${DAYS.map((d, j) => `<span class="chip ${String(x.days).includes(String(j + 1)) ? 'on' : ''}" style="padding:.2rem .5rem">${d}</span>`).join('')}</div></div>`).join('') || `<p class="muted">${mg ? 'Mbola tsy nomen\'ny centre axe ianao.' : 'Le centre ne vous a pas encore attribué d\'axe.'}</p>`}</div>`;
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
  size: ['taille', 'dimensions', 'dimension', 'mesures', 'haben', 'l x l x h'], weight: ['poids', 'weight', 'kg', 'lanja'],
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
// Sauvegarde copiée depuis Tsena Ampandrana (Paramètres → Copier la sauvegarde) : livraisons « En attente ».
export function rowsFromBackup(text) {
  let j; try { j = JSON.parse(String(text).trim()); } catch { return null; }
  const d = j?.data || j;
  const list = Array.isArray(d?.deliveries) ? d.deliveries : d?.deliveries ? Object.values(d.deliveries) : null;
  if (!list) return null;
  const waiting = list.filter((x) => !x.status || x.status === 'attente');
  return { total: list.length, rows: waiting.map((x) => ({
    external_ref: x.no || x.id, recipient_name: x.clientName || x.name || 'Client', recipient_phone: x.phone || '',
    drop_addr: x.address || '', declared_value: Math.max(0, Math.round(Number(x.amount) || 0)), description: x.note || '',
  })).filter((r) => r.recipient_phone) };
}

export function templateCsv() {
  const csv = '﻿ref;nom;telephone;adresse;valeur;description;taille;poids\r\nCMD-1042;Rasoa Rakoto;034 12 345 67;Behoririka, près de la pharmacie;25000;Robe taille M;30x25x8;0,5\r\nCMD-1043;Hery;033 11 222 33;Ankorondrano, immeuble Fitaratra;12000;Chaussures;35x22x12;1\r\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'alefa-modele-colis.csv'; a.click();
}

export function importForm({ adminMode = false, onDone } = {}) {
  const mg = state.lang === 'mg';
  let rows = [];
  const m = modal(mg ? 'Hampiditra Excel / CSV' : 'Importer un fichier Excel / CSV', `<div class="stack">
    <p class="small muted">${mg ? 'Avoahy avy amin\'ny logiciel de vente ny lisitry ny baiko (Excel na CSV). Andalana iray = colis iray.' : 'Exportez la liste des commandes depuis votre logiciel de vente (Excel ou CSV). Une ligne = un colis.'}
      ${mg ? 'Tsanganana' : 'Colonnes'} : <b>ref · nom · telephone · adresse · valeur · description</b>. <a href="#" data-tpl>⬇ ${mg ? 'Modely' : 'Modèle'}</a></p>
    ${adminMode ? `<div class="row"><label class="field grow"><span>Boutique (expéditeur)</span><input class="input" data-sn placeholder="Tsena Ampandrana"></label><label class="field grow"><span>Téléphone de la boutique</span><input class="input" data-sp type="tel" placeholder="034 12 345 67"></label></div>` : ''}
    <label class="field"><span>🟢 ${c('pickup_addr')} (${mg ? 'ho an\'ny colis rehetra' : 'pour tous les colis'})</span><div class="row"><input class="input grow" data-pk placeholder="Boutique, quartier…"><button class="btn" data-gps>◎</button></div></label>
    <div class="card" style="background:var(--bg);border:0"><b>📋 Tsena Ampandrana</b>
      <div class="small muted" style="margin:4px 0 6px">${mg ? 'Ao amin\'ny Tsena: Paramètres → Copier la sauvegarde → Copier. Avy eo apetaho (coller) eto:' : 'Dans Tsena : Paramètres → Copier la sauvegarde → Copier. Puis collez ici :'}</div>
      <textarea class="input" data-paste rows="3" placeholder="${mg ? 'Apetaho eto (Ctrl+V / ⌘V)' : 'Collez ici (Ctrl+V / ⌘V)'}" style="font-size:.8rem"></textarea></div>
    <label class="btn sun lg block" style="cursor:pointer">📄 ${mg ? 'Na safidio rakitra Excel / CSV' : 'Ou choisir un fichier Excel / CSV'}<input type="file" accept=".csv,.txt,.xlsx,.xls,.ods,.json" data-file hidden></label>
    <div data-prev></div>
    <label class="row small"><input type="checkbox" data-geo checked> ${mg ? 'Hitady ho azy ny toerana GPS amin\'ny adiresy (1 segondra isaky ny adiresy)' : 'Rechercher automatiquement la position GPS des adresses (≈ 1 s par adresse)'}</label>
    <button class="btn primary lg block" data-ok disabled>${mg ? 'Alefa daholo' : 'Envoyer tous les colis'}</button></div>`, { wide: true });
  const el = m.el;
  let pk = null;
  el.querySelector('[data-tpl]').onclick = (e) => { e.preventDefault(); templateCsv(); };
  el.querySelector('[data-gps]').onclick = async () => { try { const [lat, lng] = await getPosition(); pk = { lat, lng }; el.querySelector('[data-pk]').value = await reverse(lat, lng); } catch (e) { toastErr(e); } };
  const showBackup = (b) => {
    rows = b.rows;
    el.querySelector('[data-prev]').innerHTML = `<div class="card small" style="background:var(--green-soft);border:0">✅ Tsena : <b>${rows.length}</b> ${mg ? 'livraison « En attente » amin\'ny' : 'livraison(s) « En attente » sur'} ${b.total}</div>
      <div class="tbl-wrap" style="max-height:220px;overflow:auto;margin-top:6px"><table class="tbl"><thead><tr><th>N°</th><th>${c('rname')}</th><th>Tél</th><th>${c('drop_addr')}</th><th class="num">${c('value')}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.external_ref || '')}</td><td>${esc(r.recipient_name)}</td><td>${esc(r.recipient_phone)}</td><td class="small">${esc(r.drop_addr)}</td><td class="num">${ar(r.declared_value)}</td></tr>`).join('')}</tbody></table></div>`;
    el.querySelector('[data-ok]').disabled = !rows.length;
  };
  el.querySelector('[data-paste]').addEventListener('input', (e) => {
    const b = rowsFromBackup(e.target.value);
    if (b) showBackup(b); else if (e.target.value.trim().length > 20) toast(mg ? 'Tsy fantatra ilay soratra: adikao indray avy amin\'ny Tsena' : 'Texte non reconnu : recopiez la sauvegarde depuis Tsena', 'err');
  });
  el.querySelector('[data-file]').onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (/\.json$/i.test(file.name)) { const b = rowsFromBackup(await file.text()); return b ? showBackup(b) : toast('JSON non reconnu', 'err'); }
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
      const res = await api('POST', '/api/shipments/bulk', { rows, pickup_addr: el.querySelector('[data-pk]').value.trim() || undefined, pickup_lat: pk?.lat, pickup_lng: pk?.lng, sender_phone: adminMode ? el.querySelector('[data-sp]').value : undefined, sender_name: adminMode ? el.querySelector('[data-sn]').value : undefined });
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

// ---------------------------------------------------------------- trajets du livreur (départ → destination, itinéraire, capacité)
const L_TRIP = {
  fr: { title: 'Mes trajets', help: 'Indiquez d\'où vous partez, où vous allez et à quelle heure : les colis à récupérer et livrer sur votre chemin vous seront proposés.',
    from: 'Départ', to: 'Destination', when: 'Heure de départ', cap: 'Colis max', here: '📍 Ma position', add: '＋ Ajouter ce trajet', none: 'Aucun trajet prévu.', del: 'Annuler', route: 'Voir l\'itinéraire', day: 'Jour', load: 'colis' },
  mg: { title: 'Ny diako', help: 'Ampidiro ny toerana iaingananao, ny alehanao ary ny ora : homena anao ny entana halaina sy haterina eo amin\'ny lalanao.',
    from: 'Iaingana', to: 'Alehana', when: 'Ora iaingana', cap: 'Entana farafahabetsany', here: '📍 Toerana misy ahy', add: '＋ Ampidiro ity dia ity', none: 'Tsy misy dia voalahatra.', del: 'Foanana', route: 'Jereo ny lalana', day: 'Andro', load: 'entana' },
};
export async function courierTripsEditor(container, { map, bikeRoute, onChange, base = '/api/courier/trips', readOnly = false, vehicle } = {}) {
  const T = L_TRIP[state.lang] || L_TRIP.fr;
  let layer = null, from = null, to = null, route = null;
  const draw = (coords) => { if (!map || !window.L) return; layer?.remove(); layer = L.polyline(coords, { color: '#0f7a55', weight: 5, opacity: .8 }).addTo(map); try { map.fitBounds(layer.getBounds(), { padding: [30, 30] }); } catch {} };
  const load = async () => {
    const { trips } = await api('GET', base);
    const d0 = new Date(); const pad = (n) => String(n).padStart(2, '0');
    container.innerHTML = `<div class="small muted" style="margin-bottom:8px">${readOnly ? (state.lang === 'mg' ? 'Ny centre no mametraka ny dianao. Homena anao ny colis eo amin\'ny lalanao.' : 'Vos trajets sont fixés par le centre. Les colis sur votre chemin vous sont proposés.') : T.help}</div>
      <div class="card stack" style="padding:10px;${readOnly ? 'display:none' : ''}">
        <label class="field"><span>${T.from}</span><div class="row"><input class="input grow" data-from placeholder="Analakely"><button class="btn sm" data-here>${T.here}</button></div></label>
        <label class="field"><span>${T.to}</span><input class="input" data-to placeholder="Ivandry"></label>
        <div class="row"><label class="field grow"><span>${T.day}</span><input class="input" type="date" data-tday value="${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}"></label>
          <label class="field grow"><span>${T.when}</span><input class="input" type="time" data-when value="${pad(Math.min(23, d0.getHours() + 1))}:00"></label>
          <label class="field" style="width:90px"><span>${T.cap}</span><input class="input" type="number" min="1" max="60" value="10" data-cap></label></div>
        <div class="small muted" data-info></div>
        <div class="row"><button class="btn grow" data-preview>🗺 ${T.route}</button><button class="btn primary grow" data-tadd>${T.add}</button></div></div>
      <div class="list" style="margin-top:10px">${trips.map((x) => `<div class="card" style="padding:10px" data-trip="${x.id}">
        <div class="row between"><b>${dayLabel(x.depart_at)} ${time(x.depart_at)}</b><span class="small muted">${x.km ?? '?'} km · ${x.load}/${x.capacity} ${T.load}</span></div>
        <div class="small">${esc(x.from.address)} → ${esc(x.to.address)}</div>
        <div class="row" style="margin-top:6px"><button class="btn sm" data-show="${x.id}">🗺</button>${readOnly ? '' : `<button class="btn sm danger" data-cancel="${x.id}">${T.del}</button>`}</div></div>`).join('') || `<p class="muted">${T.none}</p>`}</div>`;
    container._trips = trips;
  };
  const resolve = async (input, cur) => {
    const v = input.value.trim(); if (!v) return null;
    if (cur && cur.address === v) return cur;
    const r = await geocode(v); if (!r.length) throw new Error(`« ${v} » ?`);
    return { address: v, lat: r[0].lat, lng: r[0].lng };
  };
  const compute = async () => {
    from = await resolve(container.querySelector('[data-from]'), from);
    to = await resolve(container.querySelector('[data-to]'), to);
    if (!from || !to) throw new Error(state.lang === 'mg' ? 'Fenoy ny iaingana sy ny alehana' : 'Indiquez le départ et la destination');
    const r = await bikeRoute([from.lat, from.lng], [to.lat, to.lng], vehicle);
    route = r.coords; draw(route);
    container.querySelector('[data-info]').textContent = `≈ ${r.km.toFixed(1)} km${r.approx ? ' (ligne droite)' : ''}`;
  };
  await load();
  container.onclick = async (e) => {
    try {
      if (e.target.closest('[data-here]')) {
        const [lat, lng] = await getPosition(); const label = await reverse(lat, lng);
        from = { address: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng }; container.querySelector('[data-from]').value = from.address; return;
      }
      if (e.target.closest('[data-preview]')) return await compute();
      if (e.target.closest('[data-tadd]')) {
        const b = e.target.closest('[data-tadd]'); b.disabled = true;
        try {
          await compute();
          const day = container.querySelector('[data-tday]').value, hhmm = container.querySelector('[data-when]').value;
          const depart_at = new Date(`${day}T${hhmm}:00+03:00`).getTime();
          const r = await api('POST', base, { from, to, route, depart_at, capacity: Number(container.querySelector('[data-cap]').value) || 10 });
          toast(`✓ ${r.assigned ? `+${r.assigned} ${T.load}` : ''}`, 'ok'); from = to = route = null; await load(); onChange?.();
        } finally { b.disabled = false; }
        return;
      }
      const sh = e.target.closest('[data-show]')?.dataset.show;
      if (sh) { const t = container._trips.find((x) => x.id === +sh); if (t) draw(t.route); return; }
      const cn = e.target.closest('[data-cancel]')?.dataset.cancel;
      if (cn && (await confirmBox(`${T.del} ?`, T.del, true))) { const r = await api('POST', `/api/courier/trips/${cn}/cancel`, {}); toast(r.moved ? `${r.moved} ${T.load} → ↺` : '✓', 'ok'); layer?.remove(); await load(); onChange?.(); }
    } catch (err) { toastErr(err); }
  };
}
