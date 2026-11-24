// Nouvel envoi (espace client) en 4 étapes : trajet → colis → paiement → confirmation.
// Le prix vient toujours du serveur (/api/shipments/quote) ; à la fin, la création passe par POST /api/shipments.
import { state, api, esc, ar, km, toast, toastErr, geocode, reverse, getPosition, makeMap, upsertMarker, icons, phoneFmt, time, drawRoad } from './core.js';
import { winTxt } from './colis.js';

const L2 = (fr, mg) => (state.lang === 'mg' ? mg : fr);
const dayLbl = (ms) => {
  const d = new Date(ms + 3 * 3600e3).toISOString().slice(0, 10), d0 = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  if (d === d0) return L2('Aujourd\'hui', 'Anio');
  if (d === new Date(Date.now() + 27 * 3600e3).toISOString().slice(0, 10)) return L2('Demain', 'Rahampitso');
  return new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' });
};
const winLbl = (w) => `${dayLbl(w.from)} ${w.part === 'am' ? L2('matin', 'maraina') : L2('après-midi', 'tolakandro')} · ${time(w.from)}–${time(w.to)}`;
const KINDS = [['colis', 'Colis', 'Colis', 'Vêtements, objets, cartons', 'Akanjo, entana, baoritra', '📦'], ['document', 'Document', 'Taratasy', 'Enveloppe, dossier, papiers', 'Valopy, antontan-taratasy', '📄']];

export async function sendWizard(root, { prefill = null, onDone, onCancel } = {}) {
  const P = prefill || {};
  const f = {
    step: 1, pickup: null, drop: null, rname: P.nom || '', rphone: P.tel || '', kind: P.type || 'colis', desc: P.desc || P.description || '', cat: (P.categorie || P.category || '').toUpperCase() || '',
    fragile: false, qty: 1, kg: '', dims: ['', '', ''], when: 'soon', pw: '', dw: '', pick: 'home', value: P.valeur ? String(P.valeur).replace(/\D/g, '') : '', pay: 'cash', ref: P.ref || '',
    prov: false, city: '', coop: '', quote: null,
  };
  let cond = null, wins = [], map = null, mk = {};
  const [c0, w0] = await Promise.all([api('GET', '/api/conditions').catch(() => null), api('GET', '/api/shipments/windows').catch(() => ({ windows: [] }))]);
  cond = c0; wins = w0.windows || [];
  const STEPS = [L2('Trajet', 'Lalana'), L2('Colis', 'Colis'), L2('Paiement', 'Fandoavana'), L2('Confirmation', 'Fanamafisana')];

  const shell = () => {
    root.innerHTML = `<div class="sp-page">
      <div class="sp-head"><h1>${L2('Nouvel envoi', 'Fandefasana vaovao')}</h1><p>${L2(`Étape ${f.step} sur 4 — ${STEPS[f.step - 1]}`, `Dingana ${f.step} amin'ny 4 — ${STEPS[f.step - 1]}`)}</p></div>
      <div class="wz-prog">${STEPS.map((s, i) => `<div class="${i < f.step ? 'on' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>
      ${P.ref ? `<div class="sp-note">${L2('Commande reçue du logiciel de vente', 'Baiko avy amin\'ny logiciel de vente')} : <b>${esc(P.ref)}</b></div>` : ''}
      <div class="wz-grid ${f.step === 1 ? 'with-map' : ''}"><div class="sp-card wz-body" data-body></div>${f.step === 1 ? `<div class="sp-card wz-map"><div data-map></div><div class="wz-maphint">${L2('Faites glisser les repères jusqu\'au point exact, en bord de route.', 'Tariho ny marika mankany amin\'ny toerana marina, amoron-dalana.')}</div><div class="wz-route" data-route></div></div>` : ''}</div></div>`;
    const body = root.querySelector('[data-body]');
    body.innerHTML = [step1, step2, step3, step4][f.step - 1]();
    wire(body);
    if (f.step === 1) {
      map = makeMap(root.querySelector('[data-map]'), { zoom: 12, zoomControl: true }); mk = {}; drawMap();
      // Toucher la carte : place le point de récupération, puis celui de livraison.
      map?.on('click', async (e) => {
        const k = !f.pickup?.lat ? 'pickup' : !f.drop?.lat ? 'drop' : null; if (!k) return;
        const label = await reverse(e.latlng.lat, e.latlng.lng);
        f[k] = { label, lat: e.latlng.lat, lng: e.latlng.lng }; const inp = root.querySelector(`[data-a=${k}]`); if (inp) inp.value = label; drawMap(); quote();
      });
    }
    root.scrollIntoView?.({ block: 'start' }); window.scrollTo?.(0, 0);
  };

  // ---------------------------------------------------------------- étape 1 : trajet
  const addr = (k, label, dot, ph) => `<label class="wz-f"><span>${label}</span><div class="wz-addr"><i class="dot ${dot}"></i><input data-a="${k}" value="${esc(f[k]?.label || (k === 'drop' ? P.adresse || '' : P.depart || ''))}" placeholder="${ph}" autocomplete="off">
    ${k === 'pickup' ? `<button type="button" data-gps title="${L2('Ma position', 'Ny toerako')}">◎</button>` : ''}<div class="wz-sug hidden" data-s="${k}"></div></div></label>`;
  const step1 = () => `
    ${addr('pickup', L2('Où récupérer le colis ?', 'Aiza no haka ny colis?'), 'g', L2('Quartier, rue, repère…', 'Fokontany, arabe, marika…'))}
    <div class="wz-row"><label class="wz-f"><span>${L2('Nom du destinataire', 'Anaran\'ny mpandray')}</span><input data-k="rname" value="${esc(f.rname)}" placeholder="Rasoa"></label>
      <label class="wz-f"><span>${L2('Téléphone du destinataire', 'Findain\'ny mpandray')}</span><input data-k="rphone" type="tel" inputmode="tel" value="${esc(f.rphone)}" placeholder="034 12 345 67"></label></div>
    ${addr('drop', f.prov ? L2('Gare de la coopérative (à Tana)', 'Fijanonan\'ny koperativa (eto Tana)') : L2('Où livrer ?', 'Aiza no hanaterana?'), 'o', L2('Quartier, rue, repère…', 'Fokontany, arabe, marika…'))}
    <label class="wz-toggle"><input type="checkbox" data-k="prov" ${f.prov ? 'checked' : ''}><span><b>🚌 ${L2('Envoi en province', 'Alefa any amin\'ny faritany')}</b><small>${L2('Remis à une coopérative (taxi-brousse) à Tana', 'Atolotra amin\'ny koperativa eto Tana')}</small></span><i></i></label>
    <p class="wz-note">${L2('Récupération et livraison <b>en bord de route</b> ou dans un bâtiment de premier plan. Le livreur n\'entre pas dans les ruelles ou cours intérieures : précisez un repère (portail, boutique…).', 'Fakana sy fanaterana <b>amoron-dalana</b> na trano voalohany manatrika ny lalana. Tsy miditra lalan-kely ny livreur : omeo marika mazava (vavahady, fivarotana…).')}</p>
    ${f.prov ? `<div class="wz-row"><label class="wz-f"><span>${L2('Ville de destination', 'Tanàna hanaterana')}</span><input data-k="city" value="${esc(f.city)}" placeholder="Fianarantsoa"></label>
      <label class="wz-f"><span>${L2('Coopérative', 'Koperativa')}</span><input data-k="coop" value="${esc(f.coop)}" placeholder="Kofmad, Sonatra…"></label></div>` : ''}
    ${nav(false)}`;

  // ---------------------------------------------------------------- étape 2 : colis
  const step2 = () => {
    const cats = cond?.categories || [];
    return `
    <div class="wz-f"><span>${L2('Type d\'envoi', 'Karazana entana')}</span><div class="wz-choice c2">${KINDS.map(([k, fr, mg, dfr, dmg, em]) => `<button type="button" data-kind="${k}" class="${f.kind === k ? 'on' : ''}"><span class="wz-em">${em}</span><b>${L2(fr, mg)}</b><small>${L2(dfr, dmg)}</small></button>`).join('')}</div></div>
    <label class="wz-f"><span>${L2('Que contient le colis ?', 'Inona no ao anatiny?')}</span><input data-k="desc" value="${esc(f.desc)}" placeholder="${L2('Ex : 2 robes, chaussures', 'Ohatra : akanjo 2, kiraro')}" maxlength="300"></label>
    <div class="wz-f"><span>${L2('Taille du colis', 'Haben\'ny colis')} <a href="#" data-cond>${L2('Voir les conditions', 'Jereo ny fepetra')}</a></span>
      <div class="wz-choice c4">${cats.map((k, i) => `<button type="button" data-cat="${k.k}" class="${f.cat === k.k ? 'on' : ''}"><b class="big">${k.k}</b><em>${k.fee == null ? L2('sur devis', 'devis') : k.fee ? '+' + ar(k.fee) : L2('inclus', 'tafiditra')}</em>
        <small>${k.kg ? `≤ ${k.kg} kg · ${k.cm} cm` : L2(`> ${cats[i - 1]?.kg} kg`, `> ${cats[i - 1]?.kg} kg`)}</small><small class="ex">${esc((k.ex || '').replace(/\s*—.*$/, ''))}</small><span class="veh">${k.vehicle === 'moto' ? '🏍️ Moto' : k.vehicle === 'velo' ? `🚲 ${L2('Vélo', 'Bisikileta')}` : `🚚 ${L2('Selon devis', 'Arakaraka ny devis')}`}</span></button>`).join('')}</div></div>
    ${['L', 'XL'].includes(f.cat) ? `<div class="wz-f"><span>${L2('Gros colis : récupération', 'Entana lehibe : fakana')}</span><div class="wz-choice c2">
      <button type="button" data-pick="home" class="${f.pick === 'home' ? 'on' : ''}"><b>${L2('Chez moi', 'Ao aminay')}</b><small>+ ${ar(cond?.options?.pickup_large)}</small></button>
      <button type="button" data-pick="centre" class="${f.pick === 'centre' ? 'on' : ''}"><b>${L2('Je dépose au centre', 'Apetrako ao amin\'ny centre')}</b><small>${esc(cond?.centre_addr || 'Ampandrana')}</small></button></div></div>` : ''}
    <label class="wz-toggle"><input type="checkbox" data-k="fragile" ${f.fragile ? 'checked' : ''}><span><b>🥚 ${L2('Colis fragile', 'Mora vaky')}</b><small>${L2('Verre, écran, gâteau', 'Fitaratra, écran, mofomamy')} · + ${ar(cond?.options?.fragile)}</small></span><i></i></label>
    <div class="wz-row"><label class="wz-f"><span>${L2('Nombre de colis (même adresse)', 'Isan\'ny colis (adiresy iray)')}</span><input data-k="qty" type="number" min="1" max="50" value="${f.qty}"></label>
      <label class="wz-f"><span>${L2('Poids (kg, facultatif)', 'Lanja (kg, tsy voatery)')}</span><input data-k="kg" inputmode="decimal" value="${esc(f.kg)}" placeholder="2"></label></div>
    <div class="wz-f"><span>${L2('Quand ?', 'Rahoviana?')}</span><div class="wz-choice c3">
      <button type="button" data-when="soon" class="${f.when === 'soon' ? 'on' : ''}"><span class="wz-em">🕘</span><b>${L2('Au plus tôt', 'Haingana indrindra')}</b><small>${wins[0] ? winLbl(wins[0]) : ''}</small></button>
      <button type="button" data-when="express" class="${f.when === 'express' ? 'on' : ''}"><span class="wz-em">⚡</span><b>Express</b><small>${L2('Dans l\'heure, direct', 'Ao anatin\'ny ora iray')} · + ${ar(cond?.options?.express)}</small></button>
      <button type="button" data-when="plan" class="${f.when === 'plan' ? 'on' : ''}"><span class="wz-em">📅</span><b>${L2('Planifier', 'Alahatra')}</b><small>${L2('Choisir les créneaux', 'Safidio ny ora')}</small></button></div></div>
    ${f.when === 'plan' ? `<div class="wz-row"><label class="wz-f"><span>${L2('Récupération', 'Fakana')}</span><select data-k="pw">${wins.slice(0, 6).map((w) => `<option value="${w.from}" ${String(w.from) === f.pw ? 'selected' : ''}>${winLbl(w)}</option>`).join('')}</select></label>
      <label class="wz-f"><span>${L2('Livraison', 'Fanaterana')}</span><select data-k="dw">${delivOpts()}</select></label></div>` : ''}
    <p class="wz-note">${L2('Interdit : argent liquide, armes, produits dangereux ou illégaux, animaux vivants.', 'Tsy azo alefa : vola, fitaovam-piadiana, entana mampidi-doza na tsy ara-dalàna, biby velona.')}</p>
    ${priceBar()}${nav(true)}`;
  };
  const delivOpts = () => {
    const pi = Math.max(0, wins.findIndex((w) => String(w.from) === f.pw));
    return wins.slice(pi + 1, pi + 6).map((w, i) => `<option value="${i ? w.from : ''}" ${String(w.from) === f.dw ? 'selected' : ''}>${i ? '' : L2('Au plus tôt · ', 'Haingana indrindra · ')}${winLbl(w)}</option>`).join('');
  };

  // ---------------------------------------------------------------- étape 3 : paiement
  const step3 = () => `
    <div class="wz-f"><span>${L2('La marchandise', 'Ny entana')}</span><div class="wz-choice c3">
      <button type="button" data-pay="cash" class="${f.pay === 'cash' ? 'on' : ''}"><span class="wz-em">💵</span><b>${L2('À encaisser', 'Raisina')}</b><small>${L2('Le livreur encaisse la valeur auprès du destinataire (espèces ou Mobile Money)', 'Raisin\'ny livreur amin\'ny mpandray ny vidiny (vola na Mobile Money)')}</small></button>
      <button type="button" data-pay="mm" class="${f.pay === 'mm' ? 'on' : ''}"><span class="wz-em">📱</span><b>${L2('Déjà payée', 'Efa voaloa')}</b><small>${L2('Le client vous a déjà payé par Mobile Money', 'Efa nandoa tamin\'ny Mobile Money ny mpividy')}</small></button>
      <button type="button" data-pay="none" class="${f.pay === 'none' ? 'on' : ''}"><span class="wz-em">🎁</span><b>${L2('Rien à encaisser', 'Tsy misy raisina')}</b><small>${L2('Cadeau, document, objet personnel', 'Fanomezana, taratasy, entana manokana')}</small></button></div></div>
    ${f.pay !== 'none' ? `<label class="wz-f"><span>${L2('Valeur de la marchandise (Ar)', 'Vidin\'ny entana (Ar)')}</span><input data-k="value" inputmode="numeric" value="${esc(f.value)}" placeholder="25000"></label>` : ''}
    <div class="wz-explain">${f.pay === 'mm' || f.prov
      ? L2(`Les frais de livraison sont payés <b>au livreur à la récupération</b>${f.prov ? ' (envoi en province)' : ''}.`, `Aloa amin'ny livreur <b>rehefa haka ny entana</b> ny saran-dalana${f.prov ? ' (faritany)' : ''}.`)
      : L2('Le destinataire paie <b>les frais de livraison</b>' + (f.pay === 'cash' ? ' <b>et la marchandise</b>' : '') + ' au livreur, en espèces ou Mobile Money. Alefa vous reverse la valeur encaissée.', 'Ny mpandray no mandoa <b>ny saran-dalana</b>' + (f.pay === 'cash' ? ' <b>sy ny vidin\'ny entana</b>' : '') + ' amin\'ny livreur. Averin\'ny Alefa aminao ny vola voaray.')}</div>
    <div class="wz-f"><span>${L2('Moyens de paiement acceptés par le livreur', 'Fandoavana raisin\'ny livreur')}</span><div class="wz-paychips"><span>💵 ${L2('Espèces', 'Vola an-tanana')}</span><span>📱 MVola</span><span>📱 Orange Money</span><span>📱 Airtel Money</span></div></div>
    <label class="wz-f"><span>${L2('N° de commande (facultatif)', 'Laharan\'ny baiko (tsy voatery)')}</span><input data-k="ref" value="${esc(f.ref)}" placeholder="CMD-1042"></label>
    ${priceBar()}${nav(true)}`;

  // ---------------------------------------------------------------- étape 4 : résumé
  const step4 = () => {
    const q = f.quote, v = f.pay === 'none' ? 0 : Number(f.value) || 0;
    const feeAtPickup = f.pay === 'mm' || f.prov;
    const due = f.prov ? 0 : (f.pay === 'cash' ? v : 0) + (feeAtPickup ? 0 : q?.fee || 0);
    const veh = q?.moto_only || ['L', 'XL'].includes(f.cat) ? 'Moto' : L2('Vélo', 'Bisikileta');
    const whenTxt = f.when === 'express' ? L2('Express, dans l\'heure', 'Express, ao anatin\'ny ora iray') : f.when === 'plan' && f.pw ? winLbl(wins.find((w) => String(w.from) === f.pw) || wins[0]) : wins[0] ? `${L2('Au plus tôt', 'Haingana indrindra')} · ${winLbl(wins[0])}` : L2('Au plus tôt', 'Haingana indrindra');
    const row = (k, v2) => `<div class="wz-sum-r"><span>${k}</span><b>${v2}</b></div>`;
    return `<h2 class="wz-h2">${L2('Résumé', 'Famintinana')}</h2>
      <div class="wz-sum">
        ${row(L2('Récupération', 'Fakana'), esc(f.pickup?.label || ''))}
        ${row(f.prov ? L2('Coopérative', 'Koperativa') : L2('Livraison', 'Fanaterana'), esc(f.drop?.label || '') + (f.prov ? ` → ${esc(f.city)} (${esc(f.coop)})` : ''))}
        ${row(L2('Destinataire', 'Mpandray'), `${esc(f.rname)} · ${esc(phoneFmt(f.rphone) || f.rphone)}`)}
        ${row(L2('Envoi', 'Entana'), `${esc(KINDS.find((k) => k[0] === f.kind)?.[L2(1, 2)] || '')} · ${esc(f.desc)}${f.qty > 1 ? ` · ${f.qty} colis` : ''}`)}
        ${row(L2('Taille', 'Habe'), `${f.cat || 'S'} · ${veh}${f.fragile ? ' · fragile' : ''}`)}
        ${q?.distance_km != null ? row(L2('Distance', 'Halavirana'), `${km(q.distance_km)}${q.zone ? ` · ${esc(q.zone)}` : ''}`) : ''}
        ${row(L2('Quand', 'Rahoviana'), esc(whenTxt))}
        ${row(L2('Marchandise', 'Entana'), f.pay === 'none' ? L2('Rien à encaisser', 'Tsy misy raisina') : f.pay === 'mm' ? `${ar(v)} · ${L2('déjà payée', 'efa voaloa')}` : `${ar(v)} · ${L2('à encaisser', 'raisina')}`)}
      </div>
      <div class="wz-total">
        <small>${f.prov ? L2('Frais à payer à la récupération', 'Aloa rehefa haka') : L2('À encaisser auprès du destinataire', 'Raisina amin\'ny mpandray')}</small>
        <b>${q?.review === 'devis' ? L2('Sur devis', 'Devis') : ar(f.prov ? q?.fee : due)}</b>
        ${(q?.lines || []).map(([l, a]) => `<div><span>${esc(l)}</span><span>${ar(a)}</span></div>`).join('')}
        ${f.pay === 'cash' && v && !f.prov ? `<div><span>${L2('Marchandise', 'Entana')}</span><span>${ar(v)}</span></div>` : ''}
        ${feeAtPickup && !f.prov ? `<p>${L2(`Frais de ${ar(q?.fee)} payés au livreur à la récupération.`, `Saran-dalana ${ar(q?.fee)} aloa amin'ny livreur rehefa haka.`)}</p>` : ''}
        ${q?.review === 'devis' ? `<p>${L2(`XL : le centre vous envoie un devis (minimum ${ar(cond?.options?.xl_min)}) avant la récupération.`, `XL : mandefa devis ny centre (farafahakeliny ${ar(cond?.options?.xl_min)}).`)}</p>` : q?.review ? `<p>${L2('Le centre vérifie cet envoi avant de le programmer.', 'Hamarinin\'ny centre aloha ity fandefasana ity.')}</p>` : ''}
      </div>
      <p class="wz-note">${L2('En confirmant, vous acceptez les', 'Amin\'ny fanamafisana dia manaiky ny')} <a href="#" data-cond>${L2('conditions de livraison et tarifs', 'fepetra sy saran-dalana')}</a>.</p>
      <div class="wz-nav"><button type="button" class="sp-btn line" data-back>${L2('Retour', 'Hiverina')}</button><button type="button" class="sp-btn sun grow" data-ok>✅ ${L2('Confirmer l\'envoi', 'Hamafiso ny fandefasana')}${q && q.review !== 'devis' ? ` · ${L2('frais', 'saran-dalana')} ${ar(q.fee)}` : ''}</button></div>`;
  };

  const priceBar = () => `<div class="wz-price" data-price>${f.quote ? priceTxt() : `<span>${L2('Calcul du prix…', 'Kajiana ny vidiny…')}</span>`}</div>`;
  const priceTxt = () => { const q = f.quote; return `<span>${q.distance_km != null ? `${km(q.distance_km)}${q.zone ? ` · ${esc(q.zone)}` : ''}` : L2('Frais de livraison', 'Saran-dalana')}</span><b>${q.review === 'devis' ? L2('Sur devis', 'Devis') : ar(q.fee)}</b>`; };
  const nav = (back) => `<div class="wz-nav">${back ? `<button type="button" class="sp-btn line" data-back>${L2('Retour', 'Hiverina')}</button>` : onCancel ? `<button type="button" class="sp-btn line" data-cancel>${L2('Annuler', 'Foanana')}</button>` : ''}<button type="button" class="sp-btn dark grow" data-next>${L2('Continuer', 'Tohizana')}</button></div>`;

  const quote = async () => {
    if (!f.drop?.lat && !f.pickup?.lat) { f.quote = null; return; }
    try {
      f.quote = await api('POST', '/api/shipments/quote', {
        pickup_lat: f.pickup?.lat, pickup_lng: f.pickup?.lng, drop_lat: f.drop?.lat, drop_lng: f.drop?.lng, category: f.cat || 'S', fragile: f.fragile, express: f.when === 'express',
        centre_drop: f.pick === 'centre', qty: f.qty, weight: f.kg, value: f.pay === 'none' ? 0 : Number(f.value) || 0, value_paid: f.pay === 'mm',
      });
      if (f.quote.category && f.cat && f.quote.category !== f.cat && f.step === 2) { f.cat = f.quote.category; toast(L2(`Avec ce poids, le colis passe en ${f.cat}`, `Noho ny lanjany dia lasa ${f.cat} ny colis`)); shell(); return; }
      f.bigErr = null;
    } catch (e) { f.quote = null; f.bigErr = e.code === 'too_big' ? e.message : null; }
    const pb = root.querySelector('[data-price]');
    if (pb && f.bigErr) { pb.classList.add('err'); pb.innerHTML = `<span>${esc(f.bigErr)}</span>`; }
    else if (pb && f.quote) { pb.classList.remove('err'); pb.innerHTML = priceTxt(); }
  };
  const drawMap = () => {
    if (!map) return;
    const pts = [];
    for (const [k, ic] of [['pickup', icons.a()], ['drop', icons.b()]]) {
      if (f[k]?.lat != null) {
        const m = upsertMarker(map, mk, k, [f[k].lat, f[k].lng], ic, { draggable: true });
        // Repère déplaçable : on ajuste au portail exact, l'adresse se met à jour.
        if (m && !m._alefaDrag) { m._alefaDrag = true; m.on?.('dragend', async () => { const p = m.getLatLng(); const label = await reverse(p.lat, p.lng); f[k] = { label, lat: p.lat, lng: p.lng }; const inp = root.querySelector(`[data-a=${k}]`); if (inp) inp.value = label; drawMap(); quote(); }); }
        pts.push([f[k].lat, f[k].lng]);
      } else if (mk[k]) { mk[k].remove(); delete mk[k]; }
    }
    if (mk.line) { mk.line.remove(); delete mk.line; }
    const info = root.querySelector('[data-route]'); if (info) info.innerHTML = '';
    if (pts.length === 2) {
      map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
      const seq = (drawMap.seq = (drawMap.seq || 0) + 1);
      // Itinéraire réel par les rues (vélo, ou moto pour L / XL).
      drawRoad(map, pts[0], pts[1], { vehicle: ['L', 'XL'].includes(f.cat) ? 'moto' : 'velo' }).then((r) => {
        if (!r || seq !== drawMap.seq || !map) { r?.layer.remove(); return; }
        mk.line = r.layer;
        if (!r.approx) { try { map.fitBounds(L.latLngBounds(r.coords), { padding: [40, 40], maxZoom: 16 }); } catch {} }
        const i2 = root.querySelector('[data-route]');
        if (i2) i2.innerHTML = r.approx ? '' : `🛣️ ${km(r.km)} ${L2('par la route', 'amin\'ny lalana')} · ⏱️ ~${r.min} min ${['L', 'XL'].includes(f.cat) ? '🏍️' : '🚲'}`;
      });
    } else if (pts.length) map.setView(pts[0], 15);
  };

  let tmr;
  const wire = (body) => {
    body.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k) { f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (['qty', 'kg', 'value'].includes(k)) { if (k === 'qty') f.qty = Math.max(1, Number(f.qty) || 1); clearTimeout(tmr); tmr = setTimeout(quote, 400); } }
      const a = e.target.dataset.a; if (!a) return;
      f[a] = null; drawMap();
      clearTimeout(tmr);
      const box = body.querySelector(`[data-s=${a}]`), v = e.target.value.trim();
      if (v.length < 3) return box.classList.add('hidden');
      tmr = setTimeout(async () => {
        const res = await geocode(v + ', Antananarivo').catch(() => []);
        box._res = res;
        box.innerHTML = res.map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('') + `<button type="button" data-i="-1">${L2('Garder', 'Tazomina')} « ${esc(v)} » (${L2('sans GPS', 'tsy misy GPS')})</button>`;
        box.classList.remove('hidden');
      }, 450);
    });
    body.addEventListener('change', (e) => {
      const k = e.target.dataset.k;
      if (k === 'prov') { f.prov = e.target.checked; shell(); }
      if (k === 'pw') { f.pw = e.target.value; f.dw = ''; body.querySelector('[data-k=dw]').innerHTML = delivOpts(); }
      if (k === 'dw') f.dw = e.target.value;
    });
    body.addEventListener('click', async (e) => {
      const sb = e.target.closest('.wz-sug button');
      if (sb) {
        const box = sb.closest('.wz-sug'), k = box.dataset.s, inp = body.querySelector(`[data-a=${k}]`), x = box._res?.[+sb.dataset.i];
        f[k] = x ? { label: x.label, lat: x.lat, lng: x.lng } : { label: inp.value.trim(), lat: null, lng: null };
        inp.value = f[k].label; box.classList.add('hidden'); drawMap(); quote(); return;
      }
      if (e.target.closest('[data-gps]')) {
        try { const [lat, lng] = await getPosition(); const label = await reverse(lat, lng); f.pickup = { label, lat, lng }; body.querySelector('[data-a=pickup]').value = label; drawMap(); quote(); } catch (err) { toastErr(err); }
        return;
      }
      if (e.target.closest('[data-cond]')) { e.preventDefault(); return import('./terms.js').then((m) => m.showConditions()); }
      const pick = (attr, key, requote = true) => { const b = e.target.closest(`[data-${attr}]`); if (!b) return false; f[key] = b.dataset[attr]; if (key === 'when' && f.when === 'plan' && !f.pw && wins[0]) f.pw = String(wins[0].from); shell(); if (requote) quote(); return true; };
      if (pick('kind', 'kind', false) || pick('cat', 'cat') || pick('pick', 'pick') || pick('when', 'when') || pick('pay', 'pay')) return;
      if (e.target.matches('[data-k=fragile]')) { f.fragile = e.target.checked; quote(); }
      if (e.target.closest('[data-cancel]')) return onCancel?.();
      if (e.target.closest('[data-back]')) { f.step--; return shell(); }
      if (e.target.closest('[data-next]')) {
        const err = check(); if (err) return toast(err, 'err');
        f.step++; shell(); if (f.step >= 2) quote(); return;
      }
      if (e.target.closest('[data-ok]')) submit(e.target.closest('[data-ok]'));
    });
  };
  const check = () => {
    if (f.step === 1) {
      const pk = root.querySelector('[data-a=pickup]').value.trim(), dr = root.querySelector('[data-a=drop]').value.trim();
      if (pk.length < 3) return L2('Indiquez où récupérer le colis', 'Lazao hoe aiza no haka ny colis');
      if (dr.length < 3) return L2('Indiquez où livrer', 'Lazao hoe aiza no hanaterana');
      f.pickup ||= { label: pk, lat: null, lng: null }; f.drop ||= { label: dr, lat: null, lng: null };
      if (f.rname.trim().length < 2) return L2('Nom du destinataire', 'Anaran\'ny mpandray');
      if (f.rphone.replace(/\D/g, '').length < 9) return L2('Téléphone du destinataire invalide', 'Diso ny laharan\'ny mpandray');
      if (f.prov && (!f.city.trim() || !f.coop.trim())) return L2('Ville et coopérative', 'Tanàna sy koperativa');
    }
    if (f.step === 2) {
      if (f.bigErr) return f.bigErr;
      if (f.desc.trim().length < 2) return L2('Dites ce que contient le colis', 'Lazao ny ao anaty colis');
      if (!f.cat) return L2('Choisissez la taille du colis (S, M ou L)', 'Safidio ny haben\'ny colis (S, M na L)');
    }
    if (f.step === 3 && f.pay !== 'none' && !(Number(f.value) > 0)) return L2('Indiquez la valeur de la marchandise', 'Lazao ny vidin\'ny entana');
    return null;
  };
  const submit = async (btn) => {
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/shipments', {
        pickup_addr: f.pickup.label, pickup_lat: f.pickup.lat, pickup_lng: f.pickup.lng, recipient_name: f.rname.trim(), recipient_phone: f.rphone.trim(),
        drop_addr: f.drop.label, drop_lat: f.drop.lat, drop_lng: f.drop.lng, declared_value: f.pay === 'none' ? 0 : Number(f.value) || 0, description: f.desc.trim(), kind: f.kind,
        weight: f.kg ? String(f.kg).replace(',', '.') : undefined, qty: f.qty, category: f.cat, fragile: f.fragile || undefined, express: f.when === 'express' || undefined,
        centre_drop: ['L', 'XL'].includes(f.cat) && f.pick === 'centre' ? true : undefined, value_paid: f.pay === 'mm', external_ref: f.ref.trim() || undefined,
        pickup_at: f.when === 'plan' ? Number(f.pw) || undefined : undefined, deliver_at: f.when === 'plan' ? Number(f.dw) || undefined : undefined,
        province: f.prov || undefined, dest_city: f.prov ? f.city.trim() : undefined, coop_name: f.prov ? f.coop.trim() : undefined,
      });
      done(r);
    } catch (err) { btn.disabled = false; if (err.code !== 'terms_required') toastErr(err); }
  };
  const done = (r) => {
    const s = r.shipment;
    root.innerHTML = `<div class="sp-page"><div class="sp-card wz-done">
      <div class="wz-check">✓</div>
      <h1>${r.duplicate ? L2('Commande déjà envoyée', 'Efa nalefa io baiko io') : L2('Envoi enregistré', 'Voaray ny fandefasana')}</h1>
      <p>${L2('Colis', 'Colis')} <b>${esc(s.ref)}</b> · ${esc(winTxt(s) || '')}</p>
      <div class="wz-pin"><small>${L2('Code PIN à transmettre au destinataire', 'Kaody PIN homena ny mpandray')} (${esc(s.recipient.name)})</small><div>${[...(s.delivery_pin || '')].map((x) => `<span>${x}</span>`).join('')}</div></div>
      <div class="wz-nav"><a class="sp-btn line grow" href="sms:${esc(s.recipient.phone)}?body=${encodeURIComponent(`Alefa : votre colis ${s.ref} arrive. Montant à payer ${s.amount_to_collect} Ar. Code de réception : ${s.delivery_pin}. Suivi : ${location.origin}/suivi/${s.track_token || ''}`)}">${L2('Envoyer par SMS', 'Alefaso SMS')}</a>
        <button class="sp-btn dark grow" data-see>${L2('Suivre ce colis', 'Araho ity colis ity')}</button></div>
      <button class="sp-btn line block" data-again>${L2('Nouvel envoi', 'Fandefasana vaovao')}</button></div></div>`;
    root.querySelector('[data-see]').onclick = () => onDone?.(s, 'see');
    root.querySelector('[data-again]').onclick = () => sendWizard(root, { onDone, onCancel });
    onDone?.(s, 'created');
  };
  shell();
  if (!P.depart && !f.pickup) root.querySelector('[data-gps]') && getPosition().then(async ([lat, lng]) => { if (f.pickup || f.step !== 1) return; const label = await reverse(lat, lng); f.pickup = { label, lat, lng }; const i = root.querySelector('[data-a=pickup]'); if (i && !i.value) i.value = label; drawMap(); }).catch(() => {});
  if (P.adresse && P.lat && P.lng) { f.drop = { label: P.adresse, lat: Number(P.lat), lng: Number(P.lng) }; drawMap(); }
  else if (P.adresse) setTimeout(() => root.querySelector('[data-a=drop]')?.dispatchEvent(new Event('input', { bubbles: true })), 50);
}
