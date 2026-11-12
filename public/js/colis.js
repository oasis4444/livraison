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
export const c = (k) => (state.lang === 'mg' ? L_MG : L_FR)[k] ?? L_FR[k] ?? k;

const PILL = { pending: 'pending', assigned: 'assigned', picked_up: 'picked_up', delivered: 'delivered', refused: 'cancelled', cancelled: 'cancelled' };
export const shipPill = (s) => `<span class="status-pill st-${PILL[s.status]}">${esc(c('sh_' + s.status))}${s.to_return ? ' · ' + esc(c('to_return')) : s.returned ? ' · ' + esc(c('returned')) : ''}</span>`;
const dayLabel = (ms) => { const d0 = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), d = new Date(ms + 3 * 3600e3).toISOString().slice(0, 10); return d === d0 ? c('today') : c('tomorrow'); };

export function shipCard(s, extra = '') {
  return `<div class="card" data-act="ship" data-id="${s.id}" style="cursor:pointer">
    <div class="row between"><span class="small"><b>${esc(s.ref)}</b>${s.external_ref ? ` <span class="muted">· ${esc(s.external_ref)}</span>` : ''}</span>${shipPill(s)}</div>
    <div class="route-line" style="margin:6px 0"><span class="dot"></span><span class="small ellipsis">${esc(s.sender.name)} — ${esc(s.sender.address)}</span><span class="bar"></span><span></span><span class="dot b"></span><span class="small ellipsis">${esc(s.recipient.name)} — ${esc(s.recipient.address)}</span></div>
    <div class="row between small"><span class="muted">${s.departure_at ? `🕘 ${dayLabel(s.departure_at)} ${time(s.departure_at)} · ${esc(s.axe || '')}` : s.courier ? `🚲 ${esc(s.courier.name || '')}` : '⏳'}</span><b>${ar(s.amount_to_collect)}</b></div>${extra}</div>`;
}

// ---------------------------------------------------------------- heures & axes (visibles par tous les clients)
let axeLayers = [];
export async function scheduleHtml(map) {
  const r = await api('GET', '/api/schedule');
  if (map && window.L) {
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
export function sendForm({ me, onDone, adminMode = false }) {
  const f = { pickup: null, drop: null, slot: '' };
  const m = modal(c('send_parcel'), `<div class="stack">
    ${adminMode ? `<label class="field"><span>Téléphone de l'expéditeur (compte client)</span><input class="input" data-sp type="tel"></label>` : ''}
    <label class="field"><span>🟢 ${c('pickup_addr')}</span><div class="addr"><span class="ic"></span><input class="input" data-a="pickup" autocomplete="off" placeholder="Quartier, rue, repère…"><div class="act">${me ? '<button data-gps>◎</button>' : ''}</div><div class="suggest hidden" data-s="pickup"></div></div></label>
    <div class="row"><label class="field grow"><span>${c('rname')}</span><input class="input" data-rn></label><label class="field grow"><span>${c('rphone')}</span><input class="input" data-rp type="tel" placeholder="034 12 345 67"></label></div>
    <label class="field"><span>🟠 ${c('drop_addr')}</span><div class="addr"><span class="ic b"></span><input class="input" data-a="drop" autocomplete="off" placeholder="Quartier, rue, repère…"><div class="suggest hidden" data-s="drop"></div></div></label>
    <div class="row"><label class="field grow"><span>${c('value')} (Ar)</span><input class="input" data-v inputmode="numeric" placeholder="20000"></label><label class="field grow"><span>${c('desc')}</span><input class="input" data-d></label></div>
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
  el.querySelector('[data-ok]').onclick = async () => {
    const txt = (s) => el.querySelector(s).value.trim();
    const pk = f.pickup || { label: txt('[data-a=pickup]') }, dr = f.drop || { label: txt('[data-a=drop]') };
    const dep = el.querySelector('[data-dep]')?.value || '';
    try {
      const r = await api('POST', '/api/shipments', {
        sender_phone: adminMode ? txt('[data-sp]') : undefined,
        pickup_addr: pk.label, pickup_lat: pk.lat, pickup_lng: pk.lng, recipient_name: txt('[data-rn]'), recipient_phone: txt('[data-rp]'),
        drop_addr: dr.label, drop_lat: dr.lat, drop_lng: dr.lng, declared_value: Number(txt('[data-v]').replace(/\D/g, '')) || 0, description: txt('[data-d]'),
        slot_id: dep ? Number(dep.split('|')[0]) : undefined, departure_at: dep ? Number(dep.split('|')[1]) : undefined,
      });
      m.close(); toast(`${r.shipment.ref} · ${c('sh_' + r.shipment.status)}`, 'ok'); onDone?.(r.shipment);
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
    <div class="small"><b>Suivi</b>${s.events.map((e) => `<div class="row between" style="border-bottom:1px solid var(--line);padding:3px 0"><span>${esc(c('sh_' + e.status) !== 'sh_' + e.status ? c('sh_' + e.status) : e.status)}${e.note ? ` <span class="muted">— ${esc(e.note)}</span>` : ''}</span><span class="muted tiny">${dt(e.at)}</span></div>`).join('')}</div>
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
      btn(`${c('delivered_ok')} · ${ar(s.amount_to_collect)}`, 'primary lg', async () => {
        const v = await promptBox(c('delivered_ok'), { label: c('collected') + ' (Ar)', type: 'number', value: s.amount_to_collect }); if (v == null) return;
        await api('POST', `/api/shipments/${s.id}/deliver`, { collected: Number(v) }); toast(c('sh_delivered'), 'ok'); done();
      });
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
