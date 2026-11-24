// Conditions de livraison et tarifs d'Alefa : résumé (inscription), texte complet (profil, lien), nouvelle acceptation.
// Les montants viennent des réglages (Paramètres) : le texte reste juste quand les tarifs changent.
import { state, api, esc, ar, modal, toast, toastErr } from './core.js';

let cache = null;
export async function loadConditions(force = false) {
  if (!cache || force) cache = await api('GET', '/api/conditions');
  return cache;
}
const dateFr = (v) => { try { return new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return v; } };

export function summaryHtml(c) {
  const mg = state.lang === 'mg';
  const M = c.categories.find((x) => x.k === 'M'), L = c.categories.find((x) => x.k === 'L');
  const minFee = c.zones ? c.zones[0][2] : c.default_fee;
  if (mg) return `<b>Alefa raha fintinina</b><ul class="small" style="margin:6px 0 0 18px;padding:0">
    <li><b>Maimaim-poana ny fakana</b> ny entana any amin'ny mpandefa ho an'ny entana kely sy salantsalany (S sy M).</li>
    <li><b>Manomboka amin'ny ${ar(minFee)} ny fanaterana</b> ao Antananarivo. Miankina amin'ny halaviran-dalana sy ny haben'ny entana ny vidiny.</li>
    <li><b>Entana lehibe :</b> fanampiny ${ar(M.fee)} (M) na ${ar(L.fee)} (L). Tsy entinay ny entana tsy zaka ny bisikileta na ny moto.</li>
    <li><b>Toerana fakana sy fanaterana :</b> amoron-dalana na trano voalohany manatrika ny lalana ihany. Tsy mandeha any anaty kianja na lalan-kely lalina ny livreur.</li>
    <li><b>Aseho mazava ny vidiny marina</b> alohan'ny handefasana. Raha lehibe noho ny voalaza ny entana, afaka manitsy ny sokajy ny livreur ary ampahafantarina ianao.</li>
    <li>Ny mpandray no mandoa <b>ny vidin'ny entana sy ny saran-dalana</b> amin'ny livreur, vola an-tanana na Mobile Money.</li>
    <li>Angatahina ny <b>kaody PIN</b> rehefa atolotra ny entana. Azonao arahina mivantana ny fanaterana.</li>
    <li>Tsy azo alefa : vola, entana mampidi-doza na tsy ara-dalàna, biby velona.</li></ul>`;
  return `<b>Alefa en bref</b><ul class="small" style="margin:6px 0 0 18px;padding:0">
    <li><b>Récupération gratuite</b> chez l'expéditeur pour les petits et moyens colis (S et M).</li>
    <li><b>Livraison à partir de ${ar(minFee)}</b> dans Antananarivo. Le prix dépend de la distance et de la taille du colis.</li>
    <li><b>Gros colis :</b> supplément de ${ar(M.fee)} (M) ou ${ar(L.fee)} (L). Nous ne transportons pas ce qui ne tient pas sur un vélo ou une moto.</li>
    <li><b>Lieux de récupération et de livraison :</b> en bord de route ou dans un bâtiment de premier plan, accessible depuis la rue. Le livreur ne s'enfonce pas dans les ruelles ou les cours intérieures.</li>
    <li>Le <b>prix exact est affiché avant chaque envoi</b>. Si le colis est plus gros que déclaré, le livreur peut corriger la catégorie et vous êtes prévenu.</li>
    <li>Le destinataire paie <b>la valeur + les frais</b> au livreur, en espèces ou par Mobile Money.</li>
    <li>Un <b>code PIN</b> est demandé à la remise du colis. Vous suivez la livraison en direct.</li>
    <li>Objets interdits : argent liquide, produits dangereux ou illégaux, animaux vivants.</li></ul>`;
}
export const acceptLabel = () => (state.lang === 'mg' ? 'Novakiako ary ekeko ny fepetra sy ny saran\'ny fanaterana Alefa.' : 'J\'ai lu et j\'accepte les conditions de livraison et les tarifs d\'Alefa.');

// Texte complet (articles 1 à 7), toujours consultable.
export function fullHtml(c) {
  const o = c.options, cat = (k) => c.categories.find((x) => x.k === k);
  const zones = c.zones || [];
  const z = (km) => { const r = zones.find(([, max]) => max != null && km <= max) || zones[zones.length - 1]; return r ? r[2] : c.default_fee; };
  return `<div class="stack small terms">
    <p class="muted">Version du ${esc(dateFr(c.version || ''))}</p>
    <h3>Article 1 — Objet et fonctionnement du service</h3>
    <p>Alefa est un service de livraison de colis à vélo et à moto dans Antananarivo et ses environs. En créant un compte, le client (expéditeur ou destinataire) accepte les présentes conditions.</p>
    <ol style="margin:0 0 0 18px;padding:0"><li>L'expéditeur crée l'envoi dans l'application et choisit la catégorie de taille du colis.</li><li>Un livreur Alefa récupère le colis chez l'expéditeur et le prend en photo.</li>
      <li>Le colis passe par le centre Alefa (Ampandrana), sauf si la récupération et la livraison sont sur le même trajet.</li><li>Un livreur l'apporte au destinataire pendant le créneau annoncé.</li>
      <li>Le destinataire paie le montant affiché et donne son code PIN. La livraison est alors confirmée.</li></ol>
    <p>Les délais affichés sont des estimations. Ils peuvent changer en cas de pluie forte, d'embouteillage ou d'événement imprévu. Le client est alors prévenu.</p>
    <h3>Article 2 — Tarifs selon la distance</h3>
    <p>La récupération chez l'expéditeur est gratuite pour les colis S et M. Les frais de livraison dépendent de la distance entre le lieu de récupération et le lieu de livraison :</p>
    ${zones.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zone</th><th>Distance</th><th>Frais (colis S)</th></tr></thead><tbody>
      ${zones.map(([n, km, fee], i) => `<tr><td>${km == null ? 'Périphérie' : `Zone ${n}`}</td><td>${km == null ? `plus de ${zones[i - 1][1]} km` : i ? `de ${zones[i - 1][1]} à ${km} km` : `jusqu'à ${km} km`}</td><td>${ar(fee)}${km == null ? ' ou sur devis' : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p>Frais de livraison : ${ar(c.default_fee)} (selon l'axe).</p>`}
    <p>La distance est calculée automatiquement par l'application. Le montant total est toujours affiché avant la validation de l'envoi.</p>
    <h3>Article 3 — Catégories de taille et de poids</h3>
    <p>Chaque colis est classé dans une catégorie. On retient la plus élevée des deux : celle du poids ou celle de la taille.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Catégorie</th><th>Exemples</th><th>Limites</th><th>Supplément</th><th>Récupération</th></tr></thead><tbody>
      ${c.categories.map((k, i) => `<tr><td><b>${k.k}</b></td><td>${esc(k.ex)}</td><td>${k.kg ? `${i ? `de ${c.categories[i - 1].kg} à ` : 'jusqu\'à '}${k.kg} kg, jusqu'à ${k.cm} cm` : `plus de ${c.categories[i - 1].kg} kg ou plus de ${c.categories[i - 1].cm} cm`}</td>
        <td>${k.fee == null ? `sur devis, minimum ${ar(o.xl_min)}` : k.fee ? `+ ${ar(k.fee)}` : 'inclus'}</td><td>${k.k === 'XL' ? 'incluse dans le devis' : k.k === 'L' ? `${ar(o.pickup_large)}, ou dépôt au centre gratuit` : 'gratuite'}</td></tr>`).join('')}</tbody></table></div>
    <p>Exemples de prix : une robe livrée à 2 km : ${ar(z(2))} · un carton de 6 kg livré à 5 km : ${ar(z(5))} + ${ar(cat('M').fee)} = ${ar(z(5) + cat('M').fee)} · un colis L livré à 9 km : ${ar(z(9))} + ${ar(cat('L').fee)} = ${ar(z(9) + cat('L').fee)}, plus ${ar(o.pickup_large)} de récupération s'il n'est pas déposé au centre.</p>
    <p>L'expéditeur déclare la catégorie à la création de l'envoi. Le livreur la vérifie à la récupération et prend une photo. Si le colis est plus gros ou plus lourd que déclaré, la catégorie est corrigée et l'expéditeur reçoit le nouveau prix. Il peut accepter ou annuler sans frais à ce moment-là.</p>
    <p>Limites par véhicule : ${c.limits.bike_kg} kg à vélo, ${c.limits.moto_kg} kg à moto. Au-delà, l'envoi passe obligatoirement sur devis.</p>
    <h3>Article 4 — Options et suppléments</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Option</th><th>Prix</th><th>Précision</th></tr></thead><tbody>
      <tr><td>Fragile</td><td>+ ${ar(o.fragile)}</td><td>Verre, écran, gâteau. L'emballage reste à la charge de l'expéditeur.</td></tr>
      <tr><td>Express</td><td>+ ${ar(o.express)}</td><td>Livraison dans l'heure, directement, sans passage par le centre.</td></tr>
      <tr><td>Attente</td><td>+ ${ar(o.wait)}</td><td>Si le destinataire fait attendre le livreur plus de 10 minutes.</td></tr>
      <tr><td>Plusieurs colis, même adresse</td><td>− ${o.multi_discount} %</td><td>Réduction sur les frais à partir du 2e colis du même envoi.</td></tr>
      <tr><td>Encaissement d'une grosse valeur</td><td>+ ${o.big_value_pct} %</td><td>Pour une marchandise de plus de ${ar(o.big_value)} à encaisser.</td></tr></tbody></table></div>
    <p>Les options choisies apparaissent dans le détail du prix avant la validation.</p>
    <h3>Article 5 — Obligations de l'expéditeur et objets interdits</h3>
    <p>L'expéditeur s'engage à : déclarer honnêtement le contenu, la valeur et la catégorie de taille du colis ; emballer le colis correctement, surtout s'il est fragile ; être présent ou joignable à l'heure de récupération ; donner un numéro de téléphone valide pour le destinataire.</p>
    <p>Sont interdits : l'argent liquide, les armes, les produits inflammables ou dangereux, les drogues et produits illégaux, les animaux vivants. Alefa peut refuser ou ouvrir en présence de l'expéditeur un colis douteux.</p>
    <p>Alefa transporte des colis et des documents. Les repas, produits frais et objets qui ne tiennent pas sur un vélo ou une moto (meubles, matelas, gros électroménager…) ne sont pas acceptés.</p>
    <p><b>Accès.</b> La récupération et la livraison se font en bord de route ou dans un bâtiment de premier plan, accessible directement depuis la rue. Le livreur ne va pas chercher ou livrer en deuxième plan (cour intérieure, ruelle, escaliers à travers un quartier) : l'expéditeur ou le destinataire vient au bord de la route. Indiquez un repère précis (portail, boutique, pharmacie…).</p>
    <h3>Article 6 — Paiement, refus, annulation et retour</h3>
    <p><b>Paiement.</b> Le destinataire paie au livreur la valeur de la marchandise et les frais de livraison, en espèces, par MVola, Orange Money ou Airtel Money. Alefa reverse la valeur encaissée à l'expéditeur selon le calendrier convenu.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Situation</th><th>Qui paie quoi</th></tr></thead><tbody>
      <tr><td>Annulation avant la récupération</td><td>Gratuite</td></tr>
      <tr><td>Le destinataire refuse le colis</td><td>Le destinataire paie les frais de livraison. Le colis revient à l'expéditeur.</td></tr>
      <tr><td>Destinataire injoignable après ${c.max_attempts} tentatives</td><td>Le colis revient à l'expéditeur, qui paie les frais de livraison.</td></tr>
      <tr><td>Annulation par l'expéditeur après la récupération</td><td>Le colis lui revient et il paie les frais de livraison.</td></tr>
      <tr><td>Retour à l'expéditeur</td><td>${o.return_percent} % des frais de livraison en plus.</td></tr>
      <tr><td>Colis non récupéré au centre après ${c.centre_keep_days} jours</td><td>Alefa contacte l'expéditeur. Des frais de garde peuvent s'appliquer.</td></tr></tbody></table></div>
    <h3>Article 7 — Suivi, code PIN, responsabilité et réclamations</h3>
    <p><b>Suivi.</b> L'expéditeur et le destinataire suivent le colis en direct sur la page « Suivre mon colis ». La position du livreur n'est visible que pendant la livraison.</p>
    <p><b>Code PIN.</b> Le destinataire donne son code PIN au livreur à la remise du colis. Sans ce code, la livraison n'est pas confirmée. Le client ne doit jamais communiquer ce code avant d'avoir reçu le colis.</p>
    <p><b>Responsabilité.</b> En cas de perte ou de casse prouvée par la faute d'Alefa, le remboursement est limité à la valeur déclarée${c.liability_cap ? `, dans la limite de ${ar(c.liability_cap)}` : ''}. Alefa n'est pas responsable d'un dommage dû à un mauvais emballage ou à un contenu mal déclaré.</p>
    <p><b>Réclamations.</b> Toute réclamation se fait dans les 48 heures après la livraison, avec le bouton « Réclamation » de l'application, en joignant une photo si possible. Alefa répond sous 72 heures.</p>
    <p><b>Modification des conditions.</b> Alefa peut modifier ses tarifs et conditions. Le client est prévenu dans l'application et doit les accepter à nouveau pour continuer à envoyer des colis.</p>
    <p><b>Contact.</b> Alefa — ${esc(c.centre_addr || 'Lot II V 89 Ampandrana, Antananarivo')}${c.support_phone ? ` — téléphone : <a href="tel:${esc(c.support_phone)}">${esc(c.support_phone)}</a>` : ''}.</p>
    <hr><div>${summaryHtml({ ...c })}</div></div>`;
}

export async function showConditions() {
  if (opening || document.querySelector('.modal .terms')) return; // un seul exemplaire (clic relayé plusieurs fois)
  opening = true;
  try { const c = await loadConditions(); modal('Conditions de livraison et tarifs', fullHtml(c), { wide: true }); } catch (e) { toastErr(e); } finally { opening = false; }
}
let opening = false;

// Nouvelle version des conditions : à accepter avant de continuer à envoyer des colis.
export async function ensureTerms(terms, onDone) {
  if (!terms || terms.accepted) return true;
  const c = await loadConditions(true);
  const mg = state.lang === 'mg';
  const m = modal(mg ? 'Fepetra vaovao' : 'Nouvelles conditions et tarifs', `<div class="stack">
    <p class="small">${mg ? 'Niova ny fepetra sy ny saran\'ny fanaterana' : 'Les conditions et tarifs ont changé'} (${esc(dateFr(c.version))}).</p>
    <div class="card" style="background:var(--bg);border:0">${summaryHtml(c)}</div>
    <a href="#" data-full class="small">${mg ? 'Vakio ny lahatsoratra feno' : 'Lire le texte complet'}</a>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" data-acc> <span>${acceptLabel()}</span></label>
    <button class="btn primary lg block" data-ok>${mg ? 'Manaiky' : 'Accepter et continuer'}</button></div>`);
  m.el.querySelector('[data-full]').onclick = (e) => { e.preventDefault(); showConditions(); };
  m.el.querySelector('[data-ok]').onclick = async () => {
    if (!m.el.querySelector('[data-acc]').checked) return toast(mg ? 'Asio marika ny boaty' : 'Cochez la case pour accepter', 'err');
    try { await api('POST', '/api/terms/accept', {}); m.close(); toast(mg ? 'Voaray, misaotra' : 'Merci, conditions acceptées', 'ok'); onDone?.(); } catch (e) { toastErr(e); }
  };
  return false;
}
