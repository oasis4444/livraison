// Test de bout en bout dans un vrai navigateur (Playwright) : client + livreur + admin.
// Leaflet, les tuiles et le géocodage sont remplacés par des bouchons (environnement sans Internet).
// Usage : node tests/e2e.mjs   (nécessite playwright et un serveur lancé par ce script)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = 8798, BASE = `http://localhost:${PORT}`, DB = '/tmp/alefa-e2e-colis.db';
rmSync(DB, { force: true }); mkdirSync('tests/screens', { recursive: true });
const server = spawn('node', ['--no-warnings', 'tools/dev-server.mjs'], { env: { ...process.env, PORT, DB_FILE: DB }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1200));
const sql = execFileSync('node', ['tools/create-admin.mjs', '0340000000', 'Admin Alefa', 'admin12345']).toString();
const { DatabaseSync } = await import('node:sqlite');
new DatabaseSync(DB).exec(sql + "\nUPDATE settings SET value = 'auto' WHERE key = 'dispatch_mode';"); // parcours historique : attribution automatique

const LEAFLET_STUB = `
(() => {
  const mkLayer = (extra = {}) => { const o = { addTo(m) { m?._layers?.add(o); return o; }, remove() { return o; }, on() { return o; }, off() { return o; }, bindTooltip() { return o; }, ...extra }; return o; };
  const b = (pts) => ({ pad() { return this; }, pts });
  window.L = {
    map(el, o) { const m = { _c: o.center, _layers: new Set(), setView(c) { m._c = Array.isArray(c) ? c : [c.lat, c.lng]; return m; }, getCenter() { return { lat: m._c[0], lng: m._c[1] }; },
      fitBounds() { return m; }, invalidateSize() {}, remove() {}, on() { return m; }, off() { return m; }, hasLayer() { return true; }, removeLayer() { return m; }, attributionControl: { setPrefix() {} } }; el.dataset.stubmap = '1'; window.__maps = (window.__maps || []).concat(m); return m; },
    tileLayer() { return mkLayer(); }, divIcon(o) { return o; },
    marker(ll, o) { let p = ll; const mk = mkLayer({ setLatLng(x) { p = x; return mk; }, getLatLng() { return { lat: p[0] ?? p.lat, lng: p[1] ?? p.lng }; }, setIcon() { return mk; }, icon: o.icon }); return mk; },
    polyline(c) { return mkLayer({ getBounds: () => b(c), setLatLngs() {} }); }, layerGroup(a) { return mkLayer(); }, latLngBounds: b,
    circle() { return mkLayer({ setLatLng() {}, setRadius() {}, setStyle() {} }); }, featureGroup() { return { getBounds: () => b([]) }; },
  };
})();`;


const browser = await chromium.launch();
const errors = [];
const watch = (p, name) => { p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errors.push(`${name} console: ${m.text()}`)); };
const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };
async function ctx(geo, vw = { width: 400, height: 860 }) {
  const c = await browser.newContext({ viewport: vw, ...(geo ? { geolocation: geo, permissions: ["geolocation"] } : {}), locale: "fr-FR" });
  await c.route('https://unpkg.com/**', (r) => r.request().url().endsWith('.js') ? r.fulfill({ contentType: 'text/javascript', body: LEAFLET_STUB }) : r.fulfill({ contentType: 'text/css', body: '' }));
  await c.route('https://nominatim.openstreetmap.org/**', (r) => r.request().url().includes('/reverse')
    ? r.fulfill({ json: { address: { road: 'Rue Andrianampoinimerina', suburb: 'Analakely' } } })
    : r.fulfill({ json: [/ivandry/i.test(decodeURIComponent(r.request().url())) ? { display_name: 'Ivandry, Antananarivo, Madagascar', lat: '-18.8752', lon: '47.5328' }
      : /analakely/i.test(decodeURIComponent(r.request().url())) ? { display_name: 'Analakely, Antananarivo, Madagascar', lat: '-18.9055', lon: '47.5255' }
      : { display_name: 'Behoririka, Antananarivo, Madagascar', lat: '-18.9020', lon: '47.5170' }] }));
  await c.route('https://routing.openstreetmap.de/**', (r) => r.abort());
  return c;
}
const api = async (method, path, body, headers = {}) => { const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const admin = await (await ctx(null, { width: 1360, height: 860 })).newPage(); watch(admin, 'admin');
const courier = await (await ctx({ latitude: -18.9050, longitude: 47.5250 })).newPage(); watch(courier, 'courier');
const client = await (await ctx({ latitude: -18.9020, longitude: 47.5170 })).newPage(); watch(client, 'client');
let apiKey;
try {
  await step('admin : axe + livreur + logiciel de vente connecté', async () => {
    await admin.goto(BASE);
    await admin.fill('[name=phone]', '0340000000'); await admin.fill('[name=password]', 'admin12345'); await admin.click('[type=submit]');
    await admin.waitForSelector('text=Colis du centre');
    await admin.click('[data-v=axes]'); await admin.click('[data-act=axe]');
    await admin.fill('[data-n]', 'Centre-ville'); await admin.fill('[data-r]', '3');
    await admin.evaluate(() => window.__maps.at(-1).setView([-18.9055, 47.5255]));
    await admin.click('[data-ok]'); await admin.waitForSelector('text=Rayon 3 km');
    await admin.click('[data-v=couriers]'); await admin.click('[data-act=newcourier]');
    await admin.fill('[data-v=name]', 'Hery Vélo'); await admin.fill('[data-v=phone]', '034 11 111 11'); await admin.fill('[data-v=cin]', '101 211 123 456'); await admin.fill('[data-v=password]', 'velo1234');
    await admin.click('[data-ok]'); await admin.waitForSelector('text=Livreur créé'); await admin.click('.modal-back [data-x]');
    await admin.click('[data-v=api]'); await admin.click('[data-act=newmerchant]');
    await admin.fill('[data-n]', 'Boutique Soa'); await admin.fill('[data-p]', '032 99 999 99'); await admin.click('[data-ok]');
    await admin.waitForSelector('text=Logiciel connecté');
    apiKey = (await admin.textContent('.modal pre')).trim();
    await admin.screenshot({ path: 'tests/screens/20-admin-api.png' });
    await admin.click('.modal-back [data-x]');
  });
  await step('admin : saisit l\'heure de départ et l\'axe du livreur ; le livreur les voit sans pouvoir les changer', async () => {
    await admin.click('[data-v=couriers]'); await admin.click('[data-act=planning]');
    await admin.click('.modal [data-add]');
    const min = new Date(Date.now() + 3 * 3600e3).getUTCHours() * 60 + new Date(Date.now() + 3 * 3600e3).getUTCMinutes();
    const st = Math.min(1380, min + 30), hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    await admin.fill('.modal [data-k=start]', hhmm(st)); await admin.fill('.modal [data-k=end]', hhmm(Math.min(1439, st + 120)));
    await admin.dispatchEvent('.modal [data-k=end]', 'change'); await admin.dispatchEvent('.modal [data-k=start]', 'change');
    await admin.click('.modal [data-save]'); await admin.waitForSelector('text=indiquez le lieu de départ et le lieu d\'arrivée');
    await admin.fill('.modal [data-k=from]', 'Analakely'); await admin.dispatchEvent('.modal [data-k=from]', 'change');
    await admin.fill('.modal [data-k=to]', 'Ivandry'); await admin.dispatchEvent('.modal [data-k=to]', 'change');
    await admin.waitForSelector('.modal >> text=✓ Analakely → Ivandry');
    await admin.screenshot({ path: 'tests/screens/20-admin-axe-depart-arrivee.png' });
    await admin.click('.modal [data-save]'); await admin.waitForSelector('text=Planning enregistré');
    await courier.goto(BASE + '/livreur');
    await courier.fill('[name=phone]', '034 11 111 11'); await courier.fill('[name=password]', 'velo1234'); await courier.click('[type=submit]');
    await courier.waitForSelector('[data-t=plan]');
    await courier.click('[data-t=plan]'); await courier.waitForSelector('[data-plan] >> text=Centre-ville');
    await courier.waitForSelector('[data-plan] >> text=Analakely → 🏁 Ivandry');
    if (await courier.locator('[data-plan] [data-save], [data-plan] [data-add]').count()) throw new Error('le livreur peut encore modifier son planning');
    await courier.waitForSelector('[data-allsched] >> text=Centre-ville');
    await courier.screenshot({ path: 'tests/screens/21-livreur-departs.png' });
  });
  await step('logiciel de vente : commande envoyée par l\'API', async () => {
    const r = await api('POST', '/api/v1/shipments', { external_ref: 'CMD-1042', declared_value: 25000, description: 'Robe taille M',
      sender: { address: 'Boutique Soa, Analakely', lat: -18.9055, lng: 47.5255 }, recipient: { name: 'Rasoa', phone: '0331234567', address: 'Behoririka', lat: -18.902, lng: 47.517 } }, { 'X-API-Key': apiKey });
    if (r.status !== 201 || r.data.shipment.status !== 'assigned') throw new Error(JSON.stringify(r));
  });
  await step('client (destinataire) : voit les heures & axes et son colis', async () => {
    await client.goto(BASE);
    await client.click('[data-m=register]');
    await client.fill('[name=name]', 'Rasoa Rakoto'); await client.fill('[name=phone]', '033 12 345 67'); await client.fill('[name=password]', 'secret12'); await client.click('[type=submit]');
    await client.waitForSelector('[data-ext="CMD-1042"]');
    await client.screenshot({ path: 'tests/screens/22-client-colis.png' });
    if (await client.locator('[data-t=sched]').count()) throw new Error('le client ne doit pas voir les heures & axes');
  });
  await step('client (expéditeur) : envoie un colis depuis l\'application', async () => {
    await client.click('[data-t=colis]'); await client.click('[data-act=sendparcel]');
    await client.click('[data-gps]'); await client.waitForFunction(() => document.querySelector('[data-a=pickup]').value.length > 3);
    await client.fill('[data-rn]', 'Koto'); await client.fill('[data-rp]', '034 77 777 77');
    await client.fill('[data-a=drop]', 'Behoririka'); await client.click('[data-s=drop] button >> nth=0');
    await client.fill('[data-v]', '12000'); await client.waitForSelector('[data-qok]');
    if (await client.locator('[data-dep]').count()) throw new Error('le client ne doit pas choisir le départ');
    // contenu et taille obligatoires
    await client.click('.modal [data-ok]'); await client.waitForSelector('text=Indiquez ce que contient le colis');
    await client.fill('[data-d]', 'Chaussures'); await client.click('[data-sz^="30|"]');
    if (await client.inputValue('[data-dl]') !== '30') throw new Error('taille M non remplie');
    await client.fill('[data-kg]', '1,2');
    await client.screenshot({ path: 'tests/screens/24-client-envoi.png' });
    await client.click('.modal [data-ok]'); await client.waitForSelector('text=Code à transmettre au destinataire');
    await client.click('.modal-back [data-x]');
  });
  await step('lien « Alefa » depuis le logiciel de vente : formulaire prérempli', async () => {
    await client.goto(BASE + '/envoyer?ref=L-77&nom=Koto&tel=0347777777&adresse=Behoririka&valeur=15000&desc=Sac');
    await client.waitForSelector('text=Commande reçue du logiciel de vente');
    await client.waitForSelector('[data-s=drop] button');
    await client.click('[data-s=drop] button >> nth=0'); await client.waitForSelector('[data-qok]');
    await client.screenshot({ path: 'tests/screens/32-lien-alefa.png' });
    await client.click('.modal [data-ok]'); await client.waitForSelector('.pin-box');
    await client.click('.modal-back [data-x]');
  });
  await step('import Excel/CSV : une ligne = un colis', async () => {
    await client.click('[data-act=importparcels]');
    await client.fill('.modal [data-pk]', 'Chez moi, Behoririka');
    await client.setInputFiles('.modal [data-file]', 'tests/fixture-import.csv');
    await client.waitForSelector('text=IMP-2');
    await client.click('.modal [data-ok]');
    await client.waitForSelector('text=✅ 2 colis', { timeout: 20000 });
    await client.screenshot({ path: 'tests/screens/33-import-resultat.png' });
    await client.click('.modal-back [data-x]');
  });
  await step('import direct de l\'export Excel du logiciel de vente (format Tsena)', async () => {
    await client.click('[data-act=importparcels]');
    await client.fill('.modal [data-pk]', 'Boutique, Behoririka');
    await client.setInputFiles('.modal [data-file]', 'tests/fixture-tsena.csv');
    await client.waitForSelector('text=2 commande(s) « En attente de livraison » sur 4');
    await client.screenshot({ path: 'tests/screens/34-import-tsena.png' });
    await client.click('.modal [data-ok]');
    await client.waitForSelector('text=✅ 2 colis', { timeout: 20000 });
    const v = await client.evaluate(() => fetch('/api/shipments', { headers: { authorization: 'Bearer ' + localStorage.getItem('alefa_token') } }).then((r) => r.json()).then((j) => j.shipments.filter((x) => /CMD-010/.test(x.external_ref || '')).map((x) => [x.external_ref, x.declared_value, x.recipient.name, x.recipient.address])));
    const m = Object.fromEntries(v.map((x) => [x[0], x]));
    if (m['CMD-0101'][1] !== 35000 || m['CMD-0102'][2] !== 'Tiana Fb' || !/Marché, Isotry/.test(m['CMD-0102'][3])) throw new Error(JSON.stringify(v));
    await client.click('.modal-back [data-x]');
  });
  await step('coller la sauvegarde Tsena Ampandrana', async () => {
    await client.click('[data-act=importparcels]');
    await client.fill('.modal [data-pk]', 'Tsena Ampandrana, Ampandrana');
    await client.fill('.modal [data-paste]', (await import('node:fs')).readFileSync('tests/fixture-tsena-backup.json', 'utf8'));
    await client.waitForSelector('text=Tsena : 1');
    await client.screenshot({ path: 'tests/screens/35-coller-tsena.png' });
    await client.click('.modal [data-ok]');
    await client.waitForSelector('text=✅ 1 colis', { timeout: 20000 });
    await client.click('.modal-back [data-x]');
  });
  await step('livreur part du centre → le client le voit en direct (statut + carte)', async () => {
    await courier.click('[data-t=colis]'); await courier.waitForSelector('[data-ext="CMD-1042"]');
    await courier.click('[data-act=depart]'); await courier.waitForSelector('.modal [data-go]');
    // destination : l'arrivée du créneau en cours si elle existe, sinon le livreur la tape
    if (!(await courier.inputValue('.modal [data-dest]'))) {
      await courier.fill('.modal [data-dest]', 'Ivandry'); await courier.click('.modal [data-sg] [data-i="0"]');
    }
    await courier.screenshot({ path: 'tests/screens/28-livreur-je-pars.png' });
    await courier.click('.modal [data-go]');
    await courier.waitForSelector('text=Chez l\'expéditeur', { timeout: 15000 });
    await courier.waitForSelector('[data-act=endrun]');
    await client.click('[data-t=colis]'); await client.waitForSelector('.live-card', { timeout: 15000 });
    await client.waitForSelector('.live-card >> text=Chez l\'expéditeur');
    await client.screenshot({ path: 'tests/screens/29-client-suivi-direct.png' });
    await admin.click('[data-v=live]'); await admin.waitForSelector('text=Mouvements'); await admin.waitForSelector('.feed >> text=Parti du centre');
    await admin.screenshot({ path: 'tests/screens/30-admin-carte-direct.png' });
  });
  await step('livreur : récupère (photo + valeur) puis livre', async () => {
    await courier.waitForSelector('[data-ext="CMD-1042"]');
    await courier.click('[data-act=ship][data-ext="CMD-1042"]');
    await courier.click('text=📦 Récupérer');
    await courier.setInputFiles('[data-file]', 'tests/fixture-colis.jpg');
    await courier.waitForSelector('[data-prev][src^="data:image"]');
    await courier.fill('.modal [data-v]', '25000');
    await courier.screenshot({ path: 'tests/screens/25-livreur-recuperation.png' });
    await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=À livrer');
    // le destinataire n'a pas de compte : on propose tout de suite au livreur de lui envoyer le lien
    await courier.waitForSelector('text=Envoyer le lien au destinataire');
    const sms = await courier.getAttribute('.modal a[href^="sms:"]', 'href'); if (!/suivi%2F[0-9a-f]{24}|suivi\/[0-9a-f]{24}/.test(decodeURIComponent(sms))) throw new Error('lien SMS : ' + sms);
    await courier.screenshot({ path: 'tests/screens/26-livreur-lien-destinataire.png' });
    await courier.click('.modal [data-later]');
    await courier.click('[data-act=ship][data-ext="CMD-1042"]');
    await courier.waitForSelector('[data-ph][src^="blob:"]');
    const pin = await client.evaluate(() => fetch('/api/shipments', { headers: { authorization: 'Bearer ' + localStorage.getItem('alefa_token') } }).then((r) => r.json()).then((j) => j.shipments.find((x) => x.external_ref === 'CMD-1042').delivery_pin));
    await client.waitForSelector(`text=🔑 ${pin}`);
    await courier.click('text=✅ Livré et payé');
    // preuve : sans photo du colis remis, impossible de confirmer
    await courier.fill('.modal [data-pin]', '1234'); await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Prenez une photo du colis remis');
    await courier.setInputFiles('.modal [data-dphoto]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('.modal [data-dprev][src^="data:image"]');
    await courier.fill('.modal [data-pin]', pin === '0000' ? '1111' : '0000'); await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Code incorrect');
    await courier.fill('.modal [data-pin]', pin);
    await courier.screenshot({ path: 'tests/screens/31-livreur-pin.png' });
    await courier.click('.modal [data-ok]');
    await courier.waitForSelector('text=Terminés aujourd');
    await courier.screenshot({ path: 'tests/screens/26-livreur-missions.png' });
  });
  await step('centre : encaissement du livreur puis paiement du vendeur', async () => {
    await admin.click('[data-v=parcels]'); await admin.selectOption('[data-pf=status]', ''); await admin.click('[data-act=pfilter]');
    await admin.waitForSelector('tr.click >> text=📞');
    await admin.screenshot({ path: 'tests/screens/27-admin-colis.png' });
    await admin.click('[data-v=cash]'); await admin.click('[data-act=settle]'); await admin.click('[data-yes]');
    await admin.waitForSelector('text=encaissés');
    await admin.click('[data-act=payvendor]'); await admin.click('[data-yes]'); await admin.fill('.modal [data-v]', 'MVola 12345'); await admin.click('.modal [data-yes]');
    await admin.waitForSelector('text=payés');
    await admin.screenshot({ path: 'tests/screens/28-admin-caisse.png' });
    const d = await api('GET', '/api/v1/shipments/CMD-1042', null, { 'X-API-Key': apiKey });
    if (d.data.shipment.status !== 'delivered' || !d.data.shipment.has_photo) throw new Error(JSON.stringify(d.data));
  });
  await step('admin : saisit un trajet Analakely → Ivandry pour le livreur ; un colis sur le chemin lui est proposé et il l\'accepte', async () => {
    await admin.click('[data-v=couriers]'); await admin.click('[data-act=planning]'); await admin.waitForSelector('.modal [data-tadd]');
    await admin.fill('.modal [data-from]', 'Analakely'); await admin.fill('.modal [data-to]', 'Ivandry');
    await admin.click('.modal [data-tadd]'); await admin.waitForSelector('.modal [data-trip]');
    await admin.screenshot({ path: 'tests/screens/30-admin-trajet-livreur.png' });
    await admin.click('.modal-back [data-x]');
    await courier.click('[data-t=plan]'); await courier.waitForSelector('[data-trips] [data-trip]');
    if (await courier.locator('[data-trips] [data-cancel]').count()) throw new Error('le livreur peut annuler le trajet');
    await courier.screenshot({ path: 'tests/screens/30-livreur-trajet.png' });
    const r = await api('POST', '/api/v1/shipments', { external_ref: 'TRAJET-1', declared_value: 5000, sender: { address: 'Analakely', lat: -18.9055, lng: 47.5255 },
      recipient: { name: 'Fara', phone: '0345556677', address: 'Ivandry', lat: -18.8752, lng: 47.5328 } }, { 'X-API-Key': apiKey });
    if (r.data.shipment?.status !== 'assigned' || !r.data.shipment.trip_id) throw new Error('non affecté au trajet : ' + JSON.stringify(r.data));
    globalThis.__track = r.data.shipment.track_token;
    await courier.click('[data-t=colis]'); await courier.waitForSelector('text=Nouvelles missions à accepter');
    await courier.click(`[data-act=ship][data-id="${r.data.shipment.id}"]`);
    await courier.click('text=Accepter la mission'); await courier.waitForSelector('text=Mission acceptée');
  });
  await step('même navigateur : admin et livreur connectés en même temps, l\'actualisation garde chaque espace', async () => {
    const lp = await admin.context().newPage(); watch(lp, 'admin-livreur');
    await lp.goto(BASE + '/livreur'); await lp.waitForSelector('text=Alefa Livreur');
    await lp.fill('[name=phone]', '034 11 111 11'); await lp.fill('[name=password]', 'velo1234'); await lp.click('[type=submit]');
    await lp.waitForSelector('[data-t=plan]');
    await admin.reload(); await admin.waitForSelector('text=Logiciels de vente', { timeout: 15000 });
    if (!admin.url().startsWith(BASE + '/') || admin.url().includes('/livreur')) throw new Error('admin renvoyé vers ' + admin.url());
    await lp.reload(); await lp.waitForSelector('[data-t=plan]');
    await lp.close();
  });
  await step('suivi public sans compte : /suivi/<jeton>, le client appuie sur « J\'ai reçu », le code arrive chez le livreur', async () => {
    const p = await (await ctx(null)).newPage(); watch(p, 'suivi');
    await p.goto(BASE + '/suivi/' + globalThis.__track); await p.waitForSelector('text=TRAJET-1');
    // le livreur récupère le colis (photo + valeur)
    const photo = 'data:image/jpeg;base64,' + (await import('node:fs')).readFileSync('tests/fixture-colis.jpg').toString('base64');
    const id = await courier.evaluate(async ({ photo }) => {
      const tok = localStorage.getItem('alefa_token_livreur'), h = { authorization: 'Bearer ' + tok, 'content-type': 'application/json' };
      const list = await (await fetch('/api/shipments', { headers: h })).json(); const s = list.shipments.find((x) => x.external_ref === 'TRAJET-1');
      const r = await fetch(`/api/shipments/${s.id}/pickup`, { method: 'POST', headers: h, body: JSON.stringify({ value: 5000, photo }) }); if (!r.ok) throw new Error(await r.text());
      return s.id;
    }, { photo });
    await courier.click('[data-t=colis]'); await courier.click(`[data-act=ship][data-id="${id}"]`);
    await courier.click('button:has-text("Livré et payé")'); await courier.waitForSelector('text=appuyer sur « J\'ai reçu »');
    await p.reload(); await p.click('[data-recv]'); await p.waitForSelector('text=Le code a été transmis au livreur');
    await p.screenshot({ path: 'tests/screens/31-suivi-public.png' });
    await courier.waitForSelector('text=Le client a confirmé — code reçu', { timeout: 10000 });
    const pin = await courier.inputValue('[data-pin]'); if (!/^\d{4}$/.test(pin)) throw new Error('code non reçu : ' + pin);
    await courier.screenshot({ path: 'tests/screens/32-livreur-code-recu.png' });
    await courier.setInputFiles('.modal [data-dphoto]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('.modal [data-dprev][src^="data:image"]');
    await courier.click('[data-ok]'); await courier.waitForSelector('.toast >> text=Livré', { timeout: 10000 }).catch(() => {});
    let st = '';
    for (let i = 0; i < 20 && st !== 'delivered'; i++) { await courier.waitForTimeout(500); st = await courier.evaluate(async (id) => (await (await fetch(`/api/shipments/${id}`, { headers: { authorization: 'Bearer ' + localStorage.getItem('alefa_token_livreur') } })).json()).shipment.status, id); }
    if (st !== 'delivered') throw new Error('statut ' + st);
  });
  await step('admin : livreurs proposés, relais par le centre (Hery récupère → centre → Tiana livre), compteurs par livreur', async () => {
    const tok = await admin.evaluate(() => localStorage.getItem('alefa_token'));
    const A = (m, p, b) => admin.evaluate(async ({ m, p, b, tok }) => { const r = await fetch(p, { method: m, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return r.json(); }, { m, p, b, tok });
    await A('POST', '/api/admin/users', { role: 'courier', phone: '034 22 222 22', name: 'Tiana Vélo', cin: '101 211 123 457', password: 'velo1234' });
    const koto = (await A('GET', '/api/admin/shipments?q=Koto')).shipments[0];
    await admin.click('[data-v=parcels]'); await admin.click(`tr[data-ref="${koto.ref}"]`);
    await admin.waitForSelector('text=Livreurs proposés');
    const ids = await A('GET', `/api/admin/shipments/${koto.id}/suggest`);
    const hery = ids.pickup.find((c) => c.name === 'Hery Vélo').id, tiana = ids.delivery.find((c) => c.name === 'Tiana Vélo').id;
    await admin.check(`input[name=p][value="${hery}"]`); await admin.check(`input[name=d][value="${tiana}"]`);
    await admin.waitForSelector('text=Relais :');
    await admin.screenshot({ path: 'tests/screens/40-admin-livreurs-proposes.png' });
    await admin.click('[data-save]'); await admin.waitForSelector('text=Livreurs enregistrés');
    let x = (await A('GET', `/api/shipments/${koto.id}`)).shipment;
    if (!x.relay || x.pickup_courier.id !== hery || x.delivery_courier.id !== tiana) throw new Error('relais non enregistré ' + JSON.stringify([x.relay, x.pickup_courier, x.delivery_courier]));
    // Hery récupère (photo + valeur), puis « Déposé au centre » depuis son application
    const photo = 'data:image/jpeg;base64,' + (await import('node:fs')).readFileSync('tests/fixture-colis.jpg').toString('base64');
    await courier.evaluate(async ({ id, photo }) => { const h = { authorization: 'Bearer ' + localStorage.getItem('alefa_token_livreur'), 'content-type': 'application/json' };
      await fetch(`/api/shipments/${id}/accept`, { method: 'POST', headers: h, body: '{}' }); const r = await fetch(`/api/shipments/${id}/pickup`, { method: 'POST', headers: h, body: JSON.stringify({ value: 12000, photo }) }); if (!r.ok) throw new Error(await r.text()); }, { id: koto.id, photo });
    await courier.click('[data-t=colis]'); await courier.waitForSelector('text=À déposer au centre');
    await courier.click(`[data-act=ship][data-id="${koto.id}"]`); await courier.click('text=Déposé au centre');
    await courier.waitForSelector('.toast >> text=Au centre');
    // le centre remet le colis à Tiana
    await admin.click('[data-v=parcels]'); await admin.click(`tr[data-ref="${koto.ref}"]`); await admin.click('text=Remis à Tiana');
    x = (await A('GET', `/api/shipments/${koto.id}`)).shipment;
    if (x.step !== 'en_route' || x.courier.id !== tiana) throw new Error('reprise au centre : ' + x.step);
    await admin.click('[data-v=couriers]'); await admin.waitForSelector('text=Colis par livreur');
    const row = await admin.textContent('tr:has-text("Hery Vélo")'); if (!/Hery Vélo\s*\d*[1-9]/.test(row.replace(/\s+/g, ' '))) throw new Error('compteur Hery : ' + row);
    await admin.screenshot({ path: 'tests/screens/41-admin-colis-par-livreur.png' });
  });
  await step('« Suivre mon colis » : numéro + téléphone, sans compte', async () => {
    const p = await (await ctx(null)).newPage(); watch(p, 'suivi-num');
    await p.goto(BASE + '/'); await p.click('text=Suivre mon colis');
    await p.fill('[name=ref]', 'CMD-1042'); await p.fill('[name=phone]', '034 99 999 99'); await p.click('text=Voir où est mon colis');
    await p.waitForSelector('text=Aucun colis');
    const tel = await admin.evaluate(async () => (await (await fetch('/api/admin/shipments?q=CMD-1042', { headers: { authorization: 'Bearer ' + localStorage.getItem('alefa_token') } })).json()).shipments[0].recipient.phone);
    await p.fill('[name=phone]', tel); await p.click('text=Voir où est mon colis');
    await p.waitForURL(/\/suivi\/[0-9a-f]{24}/); await p.waitForSelector('text=CMD-1042');
  });
  if (errors.length) { console.log('\nErreurs JS :\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nAucune erreur JavaScript ✔');
} catch (e) {
  console.log('ÉCHEC\n', e.message, '\n', errors.join('\n'));
  await Promise.all([client.screenshot({ path: 'tests/screens/fail-client.png' }), courier.screenshot({ path: 'tests/screens/fail-courier.png' }), admin.screenshot({ path: 'tests/screens/fail-admin.png' })]).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); server.kill(); }
