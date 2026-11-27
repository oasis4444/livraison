// Central IA : connaissances écrites à partir des Paramètres réels d'Alefa (tarifs, conditions, fonctionnement),
// en français et en malgache. Envoyées avec les données : l'assistant sait répondre aux questions « comment ? »
// et « combien coûte ? » même quand rien n'est dans les tableaux de chiffres. Jamais de secret ni de mot de passe.
import { catTable, centreShare } from './rules.js';

const ar = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} Ar`;
const hm = (v, d) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return m ? `${Number(m[1])} h ${m[2]}` : d; };

export function buildKnowledge(st) {
  const n = (k, d) => (st[k] === undefined || st[k] === '' ? d : Number(st[k]));
  const cats = catTable(st);
  const phone = st.support_phone || '038 51 201 42';
  const addr = st.centre_addr || 'Lot II V 89 Ampandrana, Antananarivo';
  const zonesOn = st.zones_enabled === '1';
  const z = [[n('zone1_km', 3), n('zone1_fee', 2000)], [n('zone2_km', 7), n('zone2_fee', 3000)], [n('zone3_km', 12), n('zone3_fee', 4000)]];
  const z4 = n('zone4_fee', 5000);
  const am = `${hm(st.am_start, '8 h 00')} à ${hm(st.am_end, '12 h 00')}`, pm = `${hm(st.pm_start, '13 h 00')} à ${hm(st.pm_end, '17 h 00')}`;
  const tiers = [[n('share_t1_max', 4000), n('share_t1', 1000)], [n('share_t2_max', 8000), n('share_t2', 2000)], [null, n('share_t3', 3000)]];
  const cap = n('cash_cap', 200000), capH = n('cash_cap_hours', 48);
  const docs = [];
  const add = (titre, texte) => docs.push({ titre, texte: texte.replace(/\n{3,}/g, '\n\n').trim() });

  add('Alefa.mg — présentation et contact', `Alefa.mg est un service de livraison de colis à vélo et à moto dans Antananarivo et ses environs, avec envoi vers les provinces par coopérative.
Slogan : livraison rapide et sécurisée, à moto ou à vélo. Récupération gratuite chez l'expéditeur (colis S et M), livraison aux clients de la boutique.
Centre Alefa : ${addr}. Téléphone du service client : ${phone}. Horaires : du lundi au samedi, de 8 h à 17 h. Réservation aussi par Messenger (page Facebook « Alefa.mg - Service de livraison »).
Application : un seul lien pour les clients, les livreurs et l'administration ; chacun arrive dans son espace selon son compte.

Alefa.mg dia sampan-draharaha fanaterana entana amin'ny bisikileta sy moto eto Antananarivo sy ny manodidina, ary mandefa any amin'ny faritany amin'ny alalan'ny koperativa.
Centre : ${addr}. Laharana service client : ${phone}. Misokatra Alatsinainy ka hatramin'ny Asabotsy, 8 ora ka hatramin'ny 17 ora.`);

  add('Fonctionnement d\'une livraison de colis (étapes)', `1. L'expéditeur (souvent une boutique) crée l'envoi dans l'application : adresse de récupération, destinataire, adresse de livraison, taille du colis (S, M, L), type (colis ou document), options, et ce que le livreur doit encaisser. Le prix total s'affiche avant de valider.
2. L'administration programme le colis (choisit le livreur) ; un colis sans livreur est « à programmer ». Un livreur qui part du centre peut aussi prendre les colis sur son chemin (le premier qui confirme les prend).
3. Le livreur récupère le colis chez l'expéditeur : photo, vérification de la taille, code du colis écrit dessus (étiquette à code-barres). Récupération seulement au bord de la route ou au premier plan, pas dans les endroits difficiles d'accès.
4. Le colis passe par le centre d'Ampandrana (dépôt puis reprise, avec scan du code), sauf si la récupération et la livraison sont sur le même trajet (livraison directe).
5. Le livreur livre pendant le créneau annoncé. Le destinataire paie la valeur de la marchandise et les frais, puis donne son code PIN : la livraison est confirmée avec une photo.
Statuts : à programmer (pending), programmé (assigned), récupéré / en route (picked_up), livré (delivered), refusé (refused), retourné (returned), annulé (cancelled).
Créneaux : matin ${am}, après-midi ${pm}. Récupéré le matin → livré l'après-midi ; récupéré l'après-midi → livré le lendemain matin au plus tard ; le client peut demander plus tard. Option express : livraison dans l'heure, sans passer par le centre.

Dingana : mamorona ny fandefasana ny mpandefa → omen'ny admin livreur → alain'ny livreur (sary sy kaody) → mandalo ny centre na mivantana → atolotra, mandoa ny mpandray ary manome ny kaody PIN.`);

  add('Tarifs des livraisons de colis (zones de distance)', `${zonesOn ? `Les frais dépendent de la distance entre la récupération et la livraison (distance route estimée) :
- Zone 1 : jusqu'à ${z[0][0]} km → ${ar(z[0][1])}
- Zone 2 : de ${z[0][0]} à ${z[1][0]} km → ${ar(z[1][1])}
- Zone 3 : de ${z[1][0]} à ${z[2][0]} km → ${ar(z[2][1])}
- Périphérie : plus de ${z[2][0]} km → ${ar(z4)} (ou sur devis)
Le tarif minimum est donc ${ar(z[0][1])} (« à partir de ${ar(z[0][1])} »).` : `Les frais suivent l'axe du livreur ; frais par défaut ${ar(n('default_fee', 3000))}.`}
Suppléments de taille : ${cats.map((c) => `${c.k} ${c.fee ? `+${ar(c.fee)}` : 'inclus'}`).join(', ')}.
Options : fragile +${ar(n('opt_fragile', 1000))} ; express +${ar(n('opt_express', 2000))} ; attente de plus de 10 minutes chez le destinataire +${ar(n('opt_wait', 500))} ; plusieurs colis à la même adresse : −${n('multi_discount', 50)} % sur les frais à partir du 2e ; encaissement d'une marchandise de plus de ${ar(n('big_value', 200000))} : +${n('big_value_pct', 1)} %.
Récupération : gratuite pour S et M ; pour L : +${ar(n('pickup_fee_large', 2000))}, ou dépôt gratuit au centre par l'expéditeur.
Exemple : un colis M livré à 5 km = ${zonesOn ? `${ar(z[1][1])} + ${ar(cats[1]?.fee || 0)} = ${ar(z[1][1] + (cats[1]?.fee || 0))}` : 'frais de l\'axe + supplément M'}.

Saran-dalana : arakaraka ny halavirana (zone 1 ka hatramin'ny périphérie) ${zonesOn ? `manomboka ${ar(z[0][1])}` : ''}, ampiana ny haben'ny entana sy ny safidy (fragile, express). Maimaim-poana ny fakana entana kely sy salantsalany.`);

  add('Tailles de colis acceptées (S, M, L) et objets interdits', `Alefa transporte seulement ce qui tient sur un vélo ou une moto : colis et documents (pas de repas, pas de meubles ni de matelas).
${cats.map((c) => `- ${c.k} : jusqu'à ${c.kg} kg et ${c.cm} cm${c.ex ? ` (ex. ${c.ex})` : ''} ; véhicule : ${c.vehicle === 'moto' ? 'moto' : 'vélo'} ; supplément ${c.fee ? ar(c.fee) : 'aucun'}.`).join('\n')}
${st.xl_enabled === '1' ? `XL : sur devis, minimum ${ar(n('xl_min_fee', 15000))}.` : 'Pas de XL : au-delà de L, l\'envoi est refusé.'}
On retient la plus grande des deux : catégorie du poids ou de la taille. Limites : ${n('bike_max_kg', 15)} kg à vélo, ${n('moto_max_kg', 30)} kg à moto. Valeur de plus de ${ar(n('max_value', 300000))} : validation par l'administration.
Si le colis est plus gros que déclaré, le livreur corrige la catégorie à la récupération et l'expéditeur reçoit le nouveau prix ; il peut alors annuler sans frais.
Objets interdits : argent liquide, armes, produits inflammables ou dangereux, drogues et produits illégaux, animaux vivants.

Entana azo alefa : izay zakan'ny bisikileta na moto ihany. Tsy azo alefa : vola, fitaovam-piadiana, entana mampidi-doza na tsy ara-dalàna, biby velona.`);

  add('Conditions : paiement, refus, annulation, retour, réclamations', `Paiement : le destinataire paie au livreur la valeur de la marchandise et les frais, en espèces, MVola, Orange Money ou Airtel Money. Si la marchandise est déjà payée par Mobile Money, le livreur n'encaisse que les frais (et rien si les frais sont aussi payés).
Annulation avant la récupération : gratuite. Annulation par l'expéditeur après la récupération : le colis lui revient et il paie les frais.
Refus par le destinataire : le destinataire paie les frais, le colis revient à l'expéditeur.
Destinataire injoignable : ${n('max_attempts', 2)} tentatives, puis retour à l'expéditeur qui paie les frais. Retour à l'expéditeur : +${n('return_fee_percent', 50)} % des frais.
Colis non récupéré au centre après ${n('centre_keep_days', 7)} jours : Alefa contacte l'expéditeur.
Responsabilité : remboursement limité à la valeur déclarée${Number(st.liability_cap) ? `, au maximum ${ar(st.liability_cap)}` : ''}, sauf mauvais emballage ou contenu mal déclaré.
Réclamations : dans les 48 heures après la livraison, avec le bouton « Réclamation » et une photo ; réponse sous 72 heures.
Code PIN : le destinataire le donne au livreur à la remise ; sans lui la livraison n'est pas confirmée. Suivi en direct par lien (position du livreur visible seulement pendant la livraison).
Les clients acceptent les conditions à l'inscription et de nouveau quand elles changent (version ${st.terms_version || '—'}).`);

  add('Argent : part du centre, livreurs, caisse et vendeurs', `Part du centre sur les frais de chaque colis livré : jusqu'à ${ar(tiers[0][0])} → ${ar(tiers[0][1])} ; jusqu'à ${ar(tiers[1][0])} → ${ar(tiers[1][1])} ; au-delà → ${ar(tiers[2][1])}. Le reste va au livreur qui livre. La récupération ne rapporte rien au livreur qui récupère.
Exemples : frais ${ar(3000)} → centre ${ar(centreShare(st, 3000))}, livreur ${ar(3000 - centreShare(st, 3000))} ; frais ${ar(6000)} → centre ${ar(centreShare(st, 6000))}, livreur ${ar(6000 - centreShare(st, 6000))}.
Mobile Money : quand les frais sont payés par Mobile Money, le livreur qui récupère les encaisse et les remet au centre, qui paie ensuite le livreur qui livre.
Caisse : chaque livreur remet au centre l'argent encaissé (valeur des marchandises + frais − sa part). Plafond : un livreur qui garde plus de ${ar(cap)} ou de l'argent depuis plus de ${capH} h ne reçoit plus de missions (l'administration peut forcer).
Vendeurs : le centre reverse la valeur encaissée à chaque boutique (versement en espèces ou Mobile Money, avec référence) ; menu « Caisse & vendeurs ».

Vola : anjaran'ny centre ${ar(tiers[0][1])} / ${ar(tiers[1][1])} / ${ar(tiers[2][1])} arakaraka ny saran-dalana ; ny ambiny ho an'ny livreur manatitra. Ny livreur dia mamerina ny vola voaray any amin'ny centre, ary ny centre no mandoa ny mpivarotra.`);

  add('Utilisation de l\'administration Alefa (menus)', `Tableau de bord : activité du jour, colis à programmer, alertes, livraisons du jour par livreur.
Suivi des livraisons : carte et liste filtrable, colis en retard en rouge (sans livreur depuis longtemps, créneau dépassé, oublié au centre), temps passé à chaque étape.
Carte en direct : position des livreurs en service, une couleur par livreur.
Colis : liste complète (expéditeur, destinataire, livreurs, valeur, frais, payé ou non) ; filtres appliqués tout seuls ; + Colis pour en créer, Import Excel pour en créer plusieurs, Excel pour exporter.
Caisse & vendeurs : argent à récupérer auprès de chaque livreur, règlement de la caisse, paiement des vendeurs.
Rapport livreurs : colis récupérés et livrés, valeurs, frais, parts, par période.
Paiements & soldes, Courses express (courses à la demande), Livreurs (comptes, véhicule vélo ou moto, validation), Axes & planning (créneaux et trajets des livreurs), Clients, Service client (discussion et appels), Réclamations & SOS, Rapports, Équipe et rôles, Logiciels de vente (API), Paramètres (tarifs, zones, conditions, créneaux, SMS).
Rôles de l'équipe : administrateur (tout), opérateur (suivi, colis, livreurs, clients, service client), caisse (colis, caisse, paiements, rapports), service client (suivi, colis, clients, service client, réclamations). Seul l'administrateur crée les comptes de l'équipe.
Assistant IA (bouton robot) : questions sur l'activité en français ou en malgache.`);

  add('Espace client et espace livreur', `Client : Accueil (envois en cours, chiffres du mois), Nouvel envoi en 4 étapes (trajet → colis → paiement → résumé avec le total), Mes colis, Course express, Service client, Conditions et tarifs, Profil. Il suit chaque colis (étapes, livreur, carte) et peut discuter ou appeler le livreur dans l'application une fois le colis confirmé.
Livreur : Ma tournée du jour (actions dans l'ordre du trajet : récupéré → déposé au centre → pris au centre → livré), « Je pars du centre » pour recevoir les colis sur son chemin, photo et code du colis à chaque étape, bouton Injoignable, son argent à remettre, son planning (consultation seulement).
Confidentialité : le client ne voit le livreur qu'après confirmation ; le livreur ne voit les noms et téléphones qu'après avoir confirmé.`);
  return docs;
}
