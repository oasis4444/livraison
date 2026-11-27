// Page d'accueil publique (visiteur non connecté) : présentation, tarifs réels, calculateur, suivi d'un colis.
// Les tarifs et conditions viennent de /api/conditions : la page reste juste quand le centre change ses prix.
import { state, api, esc, ar, setLang, makeMap, geocode, code128Svg, toastErr, TANA, drawRoad, chatBubble } from './core.js';

const L2 = (fr, mg) => (state.lang === 'mg' ? mg : fr);
const ICON = {
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  cam: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  bus: '<rect x="4" y="3.5" width="16" height="14" rx="2"/><path d="M4 11h16M7.5 20.5v-3M16.5 20.5v-3"/><circle cx="8" cy="14.5" r=".8"/><circle cx="16" cy="14.5" r=".8"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l2 8h-6M14 5h2"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

export async function mountHome(app, { onAuth }) {
  document.title = 'Alefa — Livraison de colis à Antananarivo';
  if (!document.querySelector('link[data-home-css]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/home.css'; l.dataset.homeCss = '1'; document.head.append(l);
  }
  const c = await api('GET', '/api/conditions').catch(() => null);
  app.className = 'home';
  app.innerHTML = page(c).replace(/ ([?!;»])/g, '\u00a0$1'); // espaces insécables (typographie française)
  const go = (mode) => (e) => { e?.preventDefault(); onAuth(mode); };
  chatBubble('guest', { phone: c?.support_phone || '038 51 201 42', onLogin: go('login') });
  app.querySelectorAll('[data-login]').forEach((b) => (b.onclick = go('login')));
  app.querySelectorAll('[data-register]').forEach((b) => (b.onclick = go('register')));
  app.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); mountHome(app, { onAuth }); }));
  app.querySelectorAll('[data-terms]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); import('./terms.js').then((m) => m.showConditions()); }));
  const nav = app.querySelector('.h-nav');
  app.querySelector('[data-burger]').onclick = () => nav.classList.toggle('open');
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
  // En-tête : ombre au défilement.
  const head = app.querySelector('.h-head');
  const onScroll = () => head.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  trackForm(app);
  calculator(app, c);
  // Apparition douce des sections.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    app.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  } else app.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  if (location.hash && location.hash.length > 1) setTimeout(() => app.querySelector(location.hash)?.scrollIntoView(), 50);
}

function page(c) {
  const zones = c?.zones || null, cats = c?.categories || [], o = c?.options || {};
  const minFee = zones ? zones[0][2] : (c?.default_fee || 2000);
  const phone = c?.support_phone || '';
  const addr = c?.centre_addr || 'Lot II V 89 Ampandrana, Antananarivo';
  return `
  <header class="h-head"><div class="h-wrap h-bar">
    <a href="/" class="h-logo"><img src="/icon.svg" alt="" width="34" height="34"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a>
    <nav class="h-nav">
      <a href="#fonctionnement">${L2('Fonctionnement', 'Fomba fiasa')}</a><a href="#tarifs">${L2('Tarifs', 'Saran-dalana')}</a>
      <a href="#estimer">${L2('Estimer', 'Kajy')}</a><a href="#pros">${L2('Boutiques', 'Mpivarotra')}</a><a href="/suivi">${L2('Suivre un colis', 'Arahina ny colis')}</a>
      <div class="h-nav-cta"><button class="h-btn ghost" data-login>${L2('Connexion', 'Hiditra')}</button><button class="h-btn sun" data-register>${L2('Créer un compte', 'Hisoratra anarana')}</button></div>
    </nav>
    <div class="h-right"><div class="h-lang"><button data-lang="fr" class="${state.lang !== 'mg' ? 'on' : ''}">FR</button><button data-lang="mg" class="${state.lang === 'mg' ? 'on' : ''}">MG</button></div>
      <button class="h-btn ghost hide-sm" data-login>${L2('Connexion', 'Hiditra')}</button>
      <button class="h-btn sun hide-sm" data-register>${L2('Envoyer un colis', 'Handefa entana')}</button>
      <button class="h-burger" data-burger aria-label="Menu"><span></span><span></span></button></div>
  </div></header>

  <section class="h-hero"><div class="h-wrap h-hero-grid">
    <div class="h-hero-txt">
      <span class="h-eyebrow"><i></i>Antananarivo · ${L2('vélo et moto', 'bisikileta sy moto')}</span>
      <h1>${L2('Vos colis livrés partout dans <em>Tana</em>, sans surprise.', 'Tonga any amin\'ny tompony <em>eto Tana</em> ny entanao, mazava ny vidiny.')}</h1>
      <p class="h-lead">${L2('Un livreur vient chercher le colis chez vous, gratuitement. Le prix exact s\'affiche avant l\'envoi, chaque étape est photographiée, et le destinataire paie à la réception, en espèces ou Mobile Money.',
        'Misy livreur maka ny entana ao aminao, maimaim-poana. Hitanao mialoha ny vidiny marina, alaina sary ny dingana tsirairay, ary ny mpandray no mandoa rehefa voarainy ny entana, vola an-tanana na Mobile Money.')}</p>
      <div class="h-cta"><button class="h-btn sun lg" data-register>${L2('Envoyer un colis', 'Handefa entana')} ${ic('arrow')}</button><a class="h-btn line lg" href="#estimer">${L2('Estimer le prix', 'Kajio ny vidiny')}</a></div>
      <form class="h-track" data-track>
        <span class="h-track-l">${ic('pin')}${L2('Suivre un colis', 'Arahina ny colis')}</span>
        <input name="ref" placeholder="${L2('N° du colis (AL…)', 'Laharan\'ny colis (AL…)')}" required autocomplete="off">
        <input name="phone" type="tel" inputmode="tel" placeholder="${L2('Votre téléphone', 'Laharana finday')}" required>
        <button type="submit" aria-label="${L2('Suivre', 'Araho')}">${ic('arrow')}</button>
      </form>
    </div>
    <div class="h-hero-art" aria-hidden="true">${labelArt(minFee)}</div>
  </div>
  <div class="h-wrap"><ul class="h-promises">
    <li>${ic('box')}<div><b>${L2('Récupération offerte', 'Maimaim-poana ny fakana')}</b><span>${L2('pour les colis S et M', 'ho an\'ny colis S sy M')}</span></div></li>
    <li>${ic('tag')}<div><b>${L2(`Dès ${ar(minFee)}`, `Manomboka ${ar(minFee)}`)}</b><span>${L2('prix exact avant l\'envoi', 'hita mialoha ny vidiny')}</span></div></li>
    <li>${ic('cam')}<div><b>${L2('Photo et code', 'Sary sy kaody')}</b><span>${L2('à chaque étape du trajet', 'isaky ny dingana')}</span></div></li>
    <li>${ic('cash')}<div><b>${L2('Payé à la réception', 'Aloa rehefa voaray')}</b><span>${L2('espèces ou Mobile Money', 'vola na Mobile Money')}</span></div></li>
  </ul></div></section>
  <section class="h-cover"><div class="h-wrap"><img src="/img/couverture.jpg" width="1600" height="594" loading="lazy" alt="${L2('Alefa.mg — service de livraison à moto ou à vélo à Antananarivo, à partir de 2 000 Ar, de 8 h à 17 h. Récupération gratuite. 038 51 201 42.', 'Alefa.mg — fanaterana amin\'ny moto na bisikileta ao Antananarivo, manomboka 2 000 Ar, 8 ora – 17 ora. Maimaim-poana ny fakana. 038 51 201 42.')}"></div></section>

  <section class="h-sec" id="fonctionnement"><div class="h-wrap">
    <div class="h-head2 reveal"><span class="h-kicker">${L2('Fonctionnement', 'Fomba fiasa')}</span><h2>${L2('De votre porte à celle du destinataire.', 'Avy eo am-baravaranao ka hatrany amin\'ny mpandray.')}</h2>
      <p>${L2('Quatre étapes, toutes visibles dans l\'application et sur le lien de suivi envoyé au destinataire.', 'Dingana efatra, hita daholo ao amin\'ny application sy amin\'ny rohy fanarahana alefa amin\'ny mpandray.')}</p></div>
    <ol class="h-steps reveal">
      ${[['box', L2('Vous créez l\'envoi', 'Mamorona ny fandefasana'), L2('Adresse, taille du colis (S, M ou L) et options. Le prix total s\'affiche avant de valider.', 'Adiresy, haben\'ny colis (S, M, L, XL) sy safidy. Hita ny vidiny feno alohan\'ny hanamafisana.')],
        ['cam', L2('Un livreur le récupère', 'Alain\'ny livreur'), L2('Il photographie le colis, vérifie la catégorie et y inscrit son code. Vous êtes prévenu.', 'Alainy sary ny colis, hamarininy ny karazany ary soratany ny kaodiny. Ampahafantarina ianao.')],
        ['route', L2('Il traverse la ville', 'Mamakivaky ny tanàna'), L2('Par notre centre d\'Ampandrana, ou en direct quand le trajet est le même. Créneau annoncé au destinataire.', 'Mandalo ny centre-nay eny Ampandrana, na mivantana raha mitovy làlana. Ampahafantarina ny ora ny mpandray.')],
        ['lock', L2('Remise avec code PIN', 'Atolotra amin\'ny kaody PIN'), L2('Le destinataire paie, donne son code PIN : la livraison est confirmée, photo à l\'appui.', 'Mandoa ny mpandray, omeny ny kaody PIN : voamarina ny fanaterana, misy sary porofo.')]]
        .map(([k, h, p], i) => `<li><div class="h-step-n">${ic(k)}<span>${i + 1}</span></div><h3>${h}</h3><p>${p}</p></li>`).join('')}
    </ol></div></section>

  <section class="h-sec alt" id="tarifs"><div class="h-wrap">
    <div class="h-head2 reveal"><span class="h-kicker">${L2('Tarifs', 'Saran-dalana')}</span><h2>${L2('Un prix selon la distance, rien à négocier.', 'Arakaraka ny halavirana ny vidiny, tsy misy ady varotra.')}</h2>
      <p>${L2('Distance calculée entre la récupération et la livraison. Les suppléments de taille et les options s\'ajoutent, et tout est détaillé avant l\'envoi.', 'Kajiana ny halavirana eo amin\'ny fakana sy ny fanaterana. Ampiana ny haben\'ny entana sy ny safidy, ary aseho amin\'ny antsipiriany mialoha.')}</p></div>
    ${zones ? `<div class="h-zones reveal">${zones.map(([n, km, fee], i) => `<div class="h-zone ${i === 0 ? 'hl' : ''}"><span class="h-zone-n">${km == null ? L2('Périphérie', 'Manodidina') : `Zone ${n}`}</span>
      <b>${ar(fee)}</b><span class="h-zone-d">${km == null ? L2(`plus de ${zones[i - 1][1]} km`, `mihoatra ny ${zones[i - 1][1]} km`) : i ? L2(`de ${zones[i - 1][1]} à ${km} km`, `${zones[i - 1][1]} ka hatramin'ny ${km} km`) : L2(`jusqu'à ${km} km`, `hatramin'ny ${km} km`)}</span>
      <div class="h-bar-km"><i style="width:${Math.min(100, ((km ?? (zones[i - 1][1] * 1.4)) / (zones[zones.length - 2][1] * 1.4)) * 100)}%"></i></div></div>`).join('')}</div>` : ''}
    <div class="h-cats reveal">
      <div class="h-cats-t"><h3>${L2('Taille du colis', 'Haben\'ny colis')}</h3><p>${L2('On retient la plus grande des deux : poids ou dimension.', 'Ny lehibe indrindra amin\'ny lanja sy ny habe no raisina.')}</p></div>
      ${cats.map((k, i) => `<div class="h-cat"><span class="h-cat-k">${k.k}</span><div><b>${k.fee == null ? L2('Sur devis', 'Devis') : k.fee ? `+ ${ar(k.fee)}` : L2('Inclus', 'Tafiditra')}</b>
        <span>${k.kg ? `${L2('jusqu\'à', 'hatramin\'ny')} ${k.kg} kg · ${k.cm} cm` : L2(`au-delà de ${cats[i - 1]?.kg} kg · dès ${ar(o.xl_min || 15000)}`, `mihoatra ny ${cats[i - 1]?.kg} kg · manomboka ${ar(o.xl_min || 15000)}`)}</span><small>${esc((k.ex || '').replace(/\s*—\s*sur devis.*$/i, ''))}</small></div></div>`).join('')}
    </div>
    <div class="h-opts reveal">
      ${[[L2('Fragile', 'Mora vaky'), `+ ${ar(o.fragile)}`], [L2('Express, dans l\'heure', 'Express, ao anatin\'ny ora iray'), `+ ${ar(o.express)}`], [L2('Plusieurs colis, même adresse', 'Colis maromaro, adiresy iray'), `− ${o.multi_discount ?? 50} %`],
        [L2('Gros colis récupéré (L)', 'Entana lehibe alaina (L)'), L2(`+ ${ar(o.pickup_large)} ou dépôt au centre`, `+ ${ar(o.pickup_large)} na apetraka ao amin'ny centre`)]]
        .map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}
      <a href="#" data-terms class="h-link">${L2('Toutes les conditions et tarifs', 'Ny fepetra sy saran-dalana rehetra')} ${ic('arrow')}</a>
    </div></div></section>

  <section class="h-sec" id="estimer"><div class="h-wrap"><div class="h-calc reveal">
    <div class="h-calc-f">
      <span class="h-kicker">${L2('Estimer', 'Kajy')}</span><h2>${L2('Combien pour votre envoi ?', 'Ohatrinona ny fandefasanao?')}</h2>
      <p class="h-muted">${L2('Tapez les deux adresses ou touchez la carte (départ puis arrivée).', 'Soraty ny adiresy roa na tsindrio ny sarintany (fiaingana dia fahatongavana).')}</p>
      <label class="h-field"><span class="dot g"></span><input data-addr="p" placeholder="${L2('Récupération : quartier, repère…', 'Fakana : fokontany, marika…')}" autocomplete="off"><div class="h-sug" data-sug="p"></div></label>
      <label class="h-field"><span class="dot o"></span><input data-addr="d" placeholder="${L2('Livraison : quartier, repère…', 'Fanaterana : fokontany, marika…')}" autocomplete="off"><div class="h-sug" data-sug="d"></div></label>
      <div class="h-seg" data-cat>${(c?.categories || [{ k: 'S' }, { k: 'M' }, { k: 'L' }]).map((x) => x.k).map((k, i) => `<button type="button" data-k="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div>
      <div class="h-result" data-res><span class="h-muted">${L2('Le prix apparaîtra ici.', 'Eto no hiseho ny vidiny.')}</span></div>
      <button class="h-btn sun lg block" data-register>${L2('Envoyer ce colis', 'Alefaso ity colis ity')} ${ic('arrow')}</button>
    </div>
    <div class="h-calc-map"><div data-map></div><button type="button" class="h-map-reset" data-reset>${L2('Recommencer', 'Averina')}</button></div>
  </div></div></section>

  <section class="h-sec dark" id="pros"><div class="h-wrap h-pros">
    <div class="reveal"><span class="h-kicker sun">${L2('Boutiques et vendeurs en ligne', 'Fivarotana sy mpivarotra an-tserasera')}</span>
      <h2>${L2('Vous vendez, Alefa livre et encaisse pour vous.', 'Mivarotra ianao, Alefa no manatitra sy mandray ny vola ho anao.')}</h2>
      <p>${L2('Le livreur encaisse la valeur de la marchandise à la livraison. Le centre vous la reverse, avec le détail colis par colis.', 'Ny livreur no mandray ny vidin\'ny entana rehefa manatitra. Averin\'ny centre aminao izany, misy antsipiriany isaky ny colis.')}</p>
      <ul class="h-pro-list">
        ${[['file', L2('Import de vos commandes', 'Fampidirana ny baiko'), L2('Un fichier Excel ou CSV : une ligne, un colis.', 'Rakitra Excel na CSV : andalana iray, colis iray.')],
          ['plug', L2('Branché à votre logiciel de vente', 'Mifandray amin\'ny rindranasa fivarotanao'), L2('API et bouton « Envoyer avec Alefa », statuts synchronisés.', 'API sy bokotra « Alefaso amin\'ny Alefa », mitovy ny sata.')],
          ['bus', L2('Envoi en province', 'Fandefasana any amin\'ny faritany'), L2('Remise à la coopérative de votre choix, photo et frais notés.', 'Atolotra amin\'ny koperativa tianao, misy sary sy saran-dalana voasoratra.')],
          ['chart', L2('Tableau de bord', 'Tabilao fanaraha-maso'), L2('Colis du jour, sommes encaissées, réclamations.', 'Colis anio, vola voaray, fitarainana.')]]
          .map(([k, h, p]) => `<li>${ic(k)}<div><b>${h}</b><span>${p}</span></div></li>`).join('')}
      </ul>
      <button class="h-btn sun lg" data-register>${L2('Ouvrir un compte boutique', 'Hanokatra kaonty fivarotana')} ${ic('arrow')}</button></div>
    <div class="h-pro-art reveal" aria-hidden="true">${dashArt()}</div>
  </div></section>

  <section class="h-sec" id="confiance"><div class="h-wrap">
    <div class="h-head2 reveal"><span class="h-kicker">${L2('Sécurité', 'Fiarovana')}</span><h2>${L2('Votre colis ne disparaît jamais des radars.', 'Tsy very maso mihitsy ny colis-nao.')}</h2></div>
    <div class="h-trust reveal">
      ${[['lock', L2('Code PIN à la remise', 'Kaody PIN amin\'ny fanolorana'), L2('Sans le code du destinataire, la livraison n\'est pas confirmée.', 'Raha tsy misy ny kaodin\'ny mpandray, tsy voamarina ny fanaterana.')],
        ['tag', L2('Étiquette à code-barres', 'Marika misy code-barres'), L2('Scannée au dépôt au centre, à la reprise et à la livraison.', 'Scannena rehefa apetraka ao amin\'ny centre, alaina indray, sy atolotra.')],
        ['pin', L2('Suivi en direct', 'Fanarahana mivantana'), L2('Le destinataire voit le livreur approcher, sans créer de compte.', 'Hitan\'ny mpandray ny fanatonan\'ny livreur, tsy mila kaonty.')],
        ['chat', L2('Service client', 'Sampana mpanjifa'), L2('Discussion dans l\'application, réclamation sous 48 h avec photo.', 'Resaka ao amin\'ny application, fitarainana ao anatin\'ny 48 ora misy sary.')]]
        .map(([k, h, p]) => `<div class="h-trust-c">${ic(k)}<h3>${h}</h3><p>${p}</p></div>`).join('')}
    </div></div></section>

  <section class="h-sec alt" id="faq"><div class="h-wrap h-faq-grid">
    <div class="reveal"><span class="h-kicker">${L2('Questions', 'Fanontaniana')}</span><h2>${L2('Ce qu\'on nous demande souvent.', 'Fanontaniana matetika.')}</h2>
      <p class="h-muted">${L2('Une autre question ?', 'Manana fanontaniana hafa?')} ${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : L2('Écrivez-nous depuis l\'application.', 'Manorata aminay ao amin\'ny application.')}</p></div>
    <div class="h-faq reveal">
      ${[[L2('Quand mon colis est-il livré ?', 'Rahoviana no tonga ny entana?'), L2('Récupéré le matin, il est livré l\'après-midi. Récupéré l\'après-midi, il est livré le lendemain matin au plus tard. L\'option Express livre dans l\'heure.', 'Raha alaina maraina, atolotra tolakandro. Raha alaina tolakandro, atolotra rahampitso maraina farafahabetiny. Ny Express kosa ao anatin\'ny ora iray.')],
        [L2('Qui paie, et comment ?', 'Iza no mandoa, ary ahoana?'), L2('Le destinataire paie la marchandise et les frais au livreur, en espèces, MVola, Orange Money ou Airtel Money. Si la marchandise est déjà payée, seuls les frais sont encaissés.', 'Ny mpandray no mandoa ny entana sy ny saran-dalana amin\'ny livreur, vola an-tanana, MVola, Orange Money na Airtel Money. Raha efa voaloa ny entana, ny saran-dalana ihany no raisina.')],
        [L2('Et si mon colis est plus gros que prévu ?', 'Ahoana raha lehibe noho ny voalaza ny entana?'), L2('Le livreur corrige la catégorie à la récupération et vous recevez le nouveau prix. Vous pouvez alors annuler sans frais.', 'Ovain\'ny livreur ny karazany rehefa maka, ary ampahafantarina anao ny vidiny vaovao. Afaka foananao maimaim-poana izany.')],
        [L2('Le destinataire est absent ?', 'Tsy eo ny mpandray?'), L2(`Le livreur fait ${c?.max_attempts || 2} tentatives. Ensuite le colis revient chez vous, et les frais restent dus.`, `Manandrana in-${c?.max_attempts || 2} ny livreur. Avy eo averina aminao ny colis, ary tsy maintsy aloa ny saran-dalana.`)],
        [L2('Que transportez-vous ?', 'Inona no entinareo?'), L2('Des colis et des documents qui tiennent sur un vélo ou une moto (jusqu\'à 25 kg et 80 cm). Pas de repas, de meubles, de matelas ni de gros électroménager. Interdits : argent liquide, armes, produits dangereux ou illégaux, animaux vivants.', 'Colis sy taratasy zakan\'ny bisikileta na moto (hatramin\'ny 25 kg sy 80 cm). Tsy entinay ny sakafo, fanaka, kidoro na fitaovana lehibe. Voarara : vola, fitaovam-piadiana, entana mampidi-doza na tsy ara-dalàna, biby velona.')],
        [L2('Où le livreur récupère-t-il et livre-t-il ?', 'Aiza no alain\'ny livreur sy aterany ny entana?'), L2('En bord de route, ou dans un bâtiment de premier plan accessible depuis la rue. Le livreur ne s\'enfonce pas en deuxième plan (cour intérieure, ruelle) : on vient le retrouver au bord de la route. Donnez un repère précis (portail, boutique, pharmacie).', 'Amoron-dalana, na trano voalohany manatrika ny lalana. Tsy miditra any anaty kianja na lalan-kely ny livreur : ianao no mivoaka eny amoron-dalana. Omeo marika mazava (vavahady, fivarotana, fivarotam-panafody).')],
        [L2('Je suis livreur, comment vous rejoindre ?', 'Livreur aho, ahoana no hidirako?'), L2(`Passez au centre (${esc(addr)}) avec votre vélo ou votre moto : nous créons votre compte livreur.`, `Mandalova ao amin'ny centre (${esc(addr)}) miaraka amin'ny bisikileta na moto : izahay no hamorona ny kaonty livreur-nao.`)]]
        .map(([q, a], i) => `<details ${i ? '' : 'open'}><summary>${q}<i></i></summary><p>${a}</p></details>`).join('')}
    </div></div></section>

  <section class="h-final"><div class="h-wrap h-final-in reveal">
    <div><h2>${L2('Votre premier colis part aujourd\'hui ?', 'Handeha anio ve ny colis voalohany?')}</h2><p>${L2('Compte gratuit en une minute. Vous ne payez rien à l\'avance.', 'Maimaim-poana ny kaonty, iray minitra monja. Tsy mandoa mialoha ianao.')}</p></div>
    <div class="h-cta"><button class="h-btn sun lg" data-register>${L2('Créer mon compte', 'Hamorona kaonty')} ${ic('arrow')}</button><button class="h-btn line-w lg" data-login>${L2('J\'ai déjà un compte', 'Efa manana kaonty')}</button></div>
  </div></section>

  <footer class="h-foot"><div class="h-wrap h-foot-grid">
    <div><a href="/" class="h-logo w"><img src="/icon.svg" alt="" width="30" height="30"><span>Alefa<i class="brand-mg"><b>.</b>mg</i></span></a>
      <p>${L2('Livraison de colis à vélo et à moto dans Antananarivo et ses environs.', 'Fanaterana entana amin\'ny bisikileta sy moto eto Antananarivo sy ny manodidina.')}</p></div>
    <div><b>${L2('Service', 'Tolotra')}</b><a href="#tarifs">${L2('Tarifs', 'Saran-dalana')}</a><a href="#estimer">${L2('Estimer un prix', 'Kajio ny vidiny')}</a><a href="/suivi">${L2('Suivre un colis', 'Arahina ny colis')}</a><a href="#" data-terms>${L2('Conditions de livraison', 'Fepetra fanaterana')}</a></div>
    <div><b>${L2('Accès', 'Fidirana')}</b><a href="#" data-login>${L2('Connexion', 'Hiditra')}</a><a href="#" data-register>${L2('Créer un compte', 'Hisoratra anarana')}</a><a href="/livreur">${L2('Espace livreur', 'Ho an\'ny livreur')}</a></div>
    <div><b>Contact</b><span>${esc(addr)}</span>${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : ''}<span>${L2('Lundi au samedi, 8 h – 17 h', 'Alatsinainy ka hatramin\'ny Asabotsy, 8 ora – 17 ora')}</span></div>
  </div><div class="h-wrap h-foot-b">© ${new Date().getFullYear()} Alefa · Antananarivo</div></footer>`;
}

// Visuel du héros : l'étiquette du colis telle qu'elle existe vraiment dans Alefa (code-barres, code PIN, étapes).
function labelArt(fee) {
  return `<div class="h-label">
    <div class="h-label-top"><span class="h-label-brand"><img src="/icon.svg" alt="" width="22" height="22">Alefa</span><span class="h-live"><i></i>${L2('En livraison', 'Eo am-panaterana')}</span></div>
    <div class="h-label-ref"><small>${L2('Colis', 'Colis')}</small><b>AL-7K2Q</b><span class="h-label-cat">M</span></div>
    <div class="h-label-route"><div><i class="g"></i><small>${L2('De', 'Avy')}</small><b>Ampandrana</b></div><svg viewBox="0 0 60 12"><path d="M0 6h54" stroke-dasharray="3 4"/><path d="M50 2l6 4-6 4"/></svg><div><i class="o"></i><small>${L2('À', 'Ho any')}</small><b>Ivandry</b></div></div>
    <ol class="h-label-steps"><li class="ok">${L2('Récupéré', 'Voaray')}<span>09:42</span></li><li class="ok">${L2('Au centre', 'Ao amin\'ny centre')}<span>11:15</span></li><li class="now">${L2('En route', 'An-dalana')}<span>14:08</span></li><li>${L2('Livré', 'Tonga')}</li></ol>
    <div class="h-label-bc">${code128Svg('AL7K2Q', { height: 46, module: 2 })}<span>${L2('À payer', 'Aloa')} <b>${ar(fee + 1000 + 25000)}</b></span></div>
  </div>
  <div class="h-float pin">${ic('lock')}<div><small>${L2('Code PIN', 'Kaody PIN')}</small><b>4 8 2 1</b></div></div>
  <div class="h-float near">${ic('bike')}<div><small>${L2('Votre livreur', 'Ny livreur-nao')}</small><b>${L2('à 600 m', '600 m sisa')}</b></div></div>`;
}

function dashArt() {
  const rows = [['AL-3F9B', 'Analakely', 'ok', 18000], ['AL-8P2D', 'Ankorondrano', 'go', 42500], ['AL-1Q7M', 'Fianarantsoa', 'bus', 0], ['AL-6T4K', '67 Ha', 'ok', 9000]];
  return `<div class="h-dash"><div class="h-dash-top"><b>${L2('Aujourd\'hui', 'Androany')}</b><span>Boutique Soa</span></div>
    <div class="h-dash-kpi"><div><small>${L2('Colis', 'Colis')}</small><b>24</b></div><div><small>${L2('Livrés', 'Tonga')}</small><b>19</b></div><div><small>${L2('Encaissé', 'Voaray')}</small><b>412 500</b></div></div>
    <div class="h-dash-bars">${[40, 62, 48, 80, 66, 92, 74].map((h) => `<i style="height:${h}%"></i>`).join('')}</div>
    ${rows.map(([r, p, s, v]) => `<div class="h-dash-row"><span class="st ${s}"></span><b>${r}</b><span>${p}</span><em>${v ? ar(v) : L2('Coopérative', 'Koperativa')}</em></div>`).join('')}</div>`;
}

function trackForm(app) {
  const f = app.querySelector('[data-track]');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(f), b = f.querySelector('button'); b.disabled = true;
    try { const r = await api('GET', `/api/track-find?ref=${encodeURIComponent(d.get('ref'))}&phone=${encodeURIComponent(d.get('phone'))}`); location.href = `/suivi/${r.token}`; }
    catch (err) { toastErr(err); b.disabled = false; }
  });
}

// Calculateur : deux adresses (recherche ou clic sur la carte) + taille → prix réel du serveur.
function calculator(app, c) {
  const box = app.querySelector('#estimer');
  const res = box.querySelector('[data-res]');
  const pts = { p: null, d: null };
  let cat = 'S', map = null, layer = null, tmr;
  const initMap = () => {
    if (map) return;
    map = makeMap(box.querySelector('[data-map]'), { center: TANA, zoom: 13, zoomControl: true });
    if (!map) return;
    layer = L.layerGroup().addTo(map);
    map.on('click', (e) => { const k = !pts.p ? 'p' : !pts.d ? 'd' : 'd'; set(k, { lat: e.latlng.lat, lng: e.latlng.lng, label: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}` }); });
  };
  // La carte se charge quand la section devient visible (page plus légère).
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { initMap(); io.disconnect(); } }, { rootMargin: '200px' }); io.observe(box); } else initMap();
  const draw = () => {
    if (!layer) return;
    layer.clearLayers();
    const mk = (p, cls) => L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<span class="h-mk ${cls}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(layer);
    if (pts.p) mk(pts.p, 'g'); if (pts.d) mk(pts.d, 'o');
    if (pts.p && pts.d) {
      map.fitBounds([[pts.p.lat, pts.p.lng], [pts.d.lat, pts.d.lng]], { padding: [50, 50], maxZoom: 15 });
      const seq = (draw.seq = (draw.seq || 0) + 1);
      drawRoad(map, [pts.p.lat, pts.p.lng], [pts.d.lat, pts.d.lng], { vehicle: ['L', 'XL'].includes(cat) ? 'moto' : 'velo' }).then((r) => {
        if (!r) return; if (seq !== draw.seq) return r.layer.remove();
        r.layer.addTo(layer); if (!r.approx) { try { map.fitBounds(L.latLngBounds(r.coords), { padding: [40, 40], maxZoom: 16 }); } catch {} }
      });
    }
    else if (pts.p || pts.d) map.setView([(pts.p || pts.d).lat, (pts.p || pts.d).lng], 14);
  };
  const set = (k, p) => { pts[k] = p; box.querySelector(`[data-addr="${k}"]`).value = p.label; draw(); price(); };
  const price = async () => {
    if (!pts.p || !pts.d) return;
    res.innerHTML = `<span class="h-muted">${L2('Calcul…', 'Kajiana…')}</span>`;
    try {
      const r = await api('POST', '/api/estimate', { pickup_lat: pts.p.lat, pickup_lng: pts.p.lng, drop_lat: pts.d.lat, drop_lng: pts.d.lng, category: cat });
      res.innerHTML = `<div class="h-res-top"><span>${r.distance_km != null ? `${String(Math.round(r.distance_km * 10) / 10).replace('.', ',')} km${r.zone ? ` · ${esc(r.zone)}` : ''}` : ''}</span><b>${r.review === 'devis' ? L2('Sur devis', 'Devis') : ar(r.fee)}</b></div>
        ${(r.lines || []).map(([l, a]) => `<div class="h-res-l"><span>${esc(l)}</span><span>${ar(a)}</span></div>`).join('')}
        <small class="h-muted">${r.review === 'devis' ? L2(`XL : le centre vous envoie un devis, à partir de ${ar(c?.options?.xl_min || 15000)}.`, `XL : ny centre no mandefa devis, manomboka ${ar(c?.options?.xl_min || 15000)}.`) : L2('Estimation : le prix définitif s\'affiche à la création de l\'envoi.', 'Tombana : hiseho ny vidiny farany rehefa mamorona ny fandefasana.')}</small>`;
    } catch (e) { res.innerHTML = `<span class="h-muted">${esc(e.message)}</span>`; }
  };
  box.querySelectorAll('[data-addr]').forEach((inp) => {
    const k = inp.dataset.addr, sug = box.querySelector(`[data-sug="${k}"]`);
    inp.addEventListener('focus', initMap);
    inp.addEventListener('input', () => {
      clearTimeout(tmr);
      if (inp.value.trim().length < 3) { sug.innerHTML = ''; return; }
      tmr = setTimeout(async () => {
        const list = await geocode(inp.value + ', Antananarivo').catch(() => []);
        sug.innerHTML = list.slice(0, 5).map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</button>`).join('');
        sug.querySelectorAll('button').forEach((b) => (b.onclick = () => { sug.innerHTML = ''; set(k, list[b.dataset.i]); }));
      }, 450);
    });
  });
  box.querySelector('[data-cat]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    cat = b.dataset.k; box.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); price();
  });
  box.querySelector('[data-reset]').onclick = () => { pts.p = pts.d = null; box.querySelectorAll('[data-addr]').forEach((i) => (i.value = '')); res.innerHTML = `<span class="h-muted">${L2('Le prix apparaîtra ici.', 'Eto no hiseho ny vidiny.')}</span>`; draw(); };
}
