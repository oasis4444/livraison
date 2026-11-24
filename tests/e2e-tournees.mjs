// Test de bout en bout : répartition par l'admin, « Je pars du centre », offre au premier qui confirme, Mobile Money, province.
// Leaflet, les tuiles et le géocodage sont remplacés par des bouchons (environnement sans Internet).
// Usage : node tests/e2e.mjs   (nécessite playwright et un serveur lancé par ce script)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = 8797, BASE = `http://localhost:${PORT}`, DB = '/tmp/alefa-e2e-tournees.db';
rmSync(DB, { force: true }); mkdirSync('tests/screens', { recursive: true });
const server = spawn('node', ['--no-warnings', 'tools/dev-server.mjs'], { env: { ...process.env, PORT, DB_FILE: DB }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1200));
const sql = execFileSync('node', ['tools/create-admin.mjs', '0340000000', 'Admin Alefa', 'admin12345']).toString();
const { DatabaseSync } = await import('node:sqlite');
new DatabaseSync(DB).exec(sql + "\nUPDATE settings SET value = '0' WHERE key IN ('direct_km', 'zones_enabled');"); // répartition par l'admin (réglage par défaut), tarif normal

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


const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); // micro simulé pour les appels
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
  await c.route('https://photon.komoot.io/**', (r) => r.abort());
  await c.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  return c;
}
const api = async (method, path, body, headers = {}) => { const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };

// Lieu de récupération du client = sur le chemin Analakely → Ivandry.
const ON_PATH = { latitude: -18.8950, longitude: 47.5280 };
const admin = await (await ctx(null, { width: 1360, height: 860 })).newPage(); watch(admin, 'admin');
const courier = await (await ctx({ latitude: -18.9055, longitude: 47.5255 })).newPage(); watch(courier, 'courier');
const client = await (await ctx(ON_PATH)).newPage(); watch(client, 'client');
const tok = {};
const login = async (phone, password) => (await api('POST', '/api/auth/login', { phone, password })).data.token;
const auth = (t) => ({ authorization: `Bearer ${t}` });
let ref;
try {
  await step('mise en place : 2 livreurs, un client', async () => {
    tok.admin = await login('0340000000', 'admin12345');
    await api('PUT', '/api/admin/settings', { settings: { centre_addr: 'Analakely', centre_lat: -18.9055, centre_lng: 47.5255 } }, auth(tok.admin));
    for (const [phone, name, cin] of [['0341111111', 'Hery Vélo', '101211123456'], ['0342222222', 'Naina Moto', '101211123457']])
      if ((await api('POST', '/api/admin/users', { role: 'courier', phone, name, cin, password: 'velo1234', vehicle: name.includes('Moto') ? 'moto' : 'velo' }, auth(tok.admin))).status !== 201) throw new Error('livreur ' + name);
    tok.naina = await login('0342222222', 'velo1234');
    if ((await api('POST', '/api/auth/register', { accept_terms: true, name: 'Soa Boutique', phone: '0331234567', password: 'secret12' })).status !== 201) throw new Error('client');
  });
  await step('livreur : « Je pars du centre » vers Ivandry (tournée)', async () => {
    await courier.goto(BASE + '/livreur');
    await courier.fill('[name=phone]', '034 11 111 11'); await courier.fill('[name=password]', 'velo1234'); await courier.click('[type=submit]');
    await courier.waitForSelector('[data-act=depart]');
    await courier.click('[data-act=depart]'); await courier.waitForSelector('.modal [data-dest]');
    await courier.fill('.modal [data-dest]', 'Ivandry'); await courier.click('.modal [data-sg] [data-i="0"]');
    await courier.screenshot({ path: 'tests/screens/40-livreur-je-pars.png' });
    await courier.click('.modal [data-go]'); await courier.waitForSelector('text=En tournée');
    // un 2e livreur part aussi vers Ivandry
    const r = await api('POST', '/api/courier/depart', { to: { address: 'Ivandry', lat: -18.8752, lng: 47.5328 }, route: [[-18.9055, 47.5255], [-18.8752, 47.5328]] }, auth(tok.naina));
    if (!r.data.run) throw new Error('tournée Naina');
  });
  await step('client : colis payé par Mobile Money, envoyé en province', async () => {
    await client.goto(BASE + '/#connexion');
    await client.fill('[name=phone]', '033 12 345 67'); await client.fill('[name=password]', 'secret12'); await client.click('[type=submit]');
    await client.waitForSelector('.sp-hero');
    await client.click('.sp-tab [data-nav=new]'); await client.waitForSelector('.wz-body [data-a=pickup]');
    await client.click('[data-gps]'); await client.waitForFunction(() => document.querySelector('[data-a=pickup]').value.length > 3);
    await client.fill('[data-k=rname]', 'Rivo'); await client.fill('[data-k=rphone]', '034 55 555 55');
    await client.fill('[data-a=drop]', 'Analakely gare Kofmad'); await client.click('[data-s=drop] button >> nth=0');
    await client.click('.wz-toggle:has([data-k=prov])');
    await client.click('[data-next]'); await client.waitForSelector('text=Ville et coopérative');
    await client.fill('[data-k=city]', 'Fianarantsoa'); await client.fill('[data-k=coop]', 'Kofmad');
    await client.click('[data-next]');
    await client.fill('[data-k=desc]', 'Sac de riz');
    // catégorie L : moto, récupération L/XL +2 000 ou dépôt au centre
    await client.click('[data-cat=L]'); await client.waitForSelector('text=Je dépose au centre'); await client.waitForSelector('[data-price] b >> text=Ar');
    await client.click('[data-cond]'); await client.waitForSelector('td >> text=sac de riz');
    await client.screenshot({ path: 'tests/screens/40b-conditions-transport.png' });
    await client.click('.modal-back >> nth=-1 >> [data-x]');
    await client.click('[data-cat=M]'); // le livreur de ce test est à vélo : catégorie M
    // créneaux : récupération au choix, livraison au plus tôt le créneau suivant
    await client.click('[data-when=plan]'); await client.waitForFunction(() => document.querySelectorAll('[data-k=pw] option').length >= 3 && document.querySelector('[data-k=dw] option'));
    if (!/plus tôt/.test(await client.textContent('[data-k=dw] option'))) throw new Error('créneau de livraison');
    await client.click('[data-when=soon]');
    await client.click('[data-next]');
    await client.click('[data-pay=mm]');
    if (await client.locator('[data-pref]').count()) throw new Error('pas de référence Mobile Money à saisir');
    await client.fill('[data-k=value]', '40000');
    await client.click('[data-next]'); await client.waitForSelector('.wz-total >> text=Frais à payer à la récupération');
    await client.screenshot({ path: 'tests/screens/41-client-province-mobile-money.png' });
    await client.click('[data-ok]'); await client.waitForSelector('.wz-pin');
    ref = (await client.textContent('.wz-done p b')).trim();
    await client.click('[data-see]'); await client.waitForSelector('[data-tl] li');
    await client.waitForSelector('.sp-kv >> text=Fianarantsoa'); await client.waitForSelector('.sp-kv >> text=Livraison');
  });
  await step('livreur : le colis sur son chemin lui est proposé, il le prend en premier', async () => {
    await courier.click('[data-t=colis]'); await courier.waitForSelector('text=Colis sur ton chemin', { timeout: 15000 });
    await courier.waitForSelector(`[data-act=take]`);
    await courier.screenshot({ path: 'tests/screens/42-livreur-offre.png' });
    await courier.click('[data-act=take]'); await courier.waitForSelector('text=colis à toi');
    const r = await api('GET', '/api/courier/run', null, auth(tok.naina));
    const o = r.data.offers.find((x) => x.ref === ref);
    if (o?.status !== 'lost' || o.taken_by !== 'Hery') throw new Error('Naina devrait voir « déjà pris par Hery » : ' + JSON.stringify(o));
  });
  await step('admin : notifié, voit les livreurs en tournée avec leur numéro', async () => {
    await admin.goto(BASE + '/#connexion');
    await admin.fill('[name=phone]', '0340000000'); await admin.fill('[name=password]', 'admin12345'); await admin.click('[type=submit]');
    await admin.waitForSelector('text=Colis du centre');
    const n = await api('GET', '/api/notifications', null, auth(tok.admin));
    const list = n.data.notifications || n.data.items || [];
    if (!list.some((x) => /Nouveau colis à répartir/.test(x.title) && x.body.includes(ref))) throw new Error('notification admin absente');
    if (!list.some((x) => x.title.includes(`${ref} pris par Hery`))) throw new Error('notification « pris par Hery » absente');
    // clic sur la notification « … pris par Hery » → fiche du colis
    await admin.click('[data-act=notifs]'); await admin.waitForSelector(`.modal [data-ni] >> text=${ref} pris par Hery`);
    await admin.screenshot({ path: 'tests/screens/45-admin-notifications.png' });
    await admin.click(`.modal [data-ni] >> text=${ref} pris par Hery`);
    await admin.waitForSelector('text=Fianarantsoa');
    await admin.waitForSelector('text=Marchandise déjà payée par Mobile Money');
    await admin.screenshot({ path: 'tests/screens/43-admin-colis-province.png' });
  });
  await step('admin : suivi des livraisons (carte, filtres, chiffres par livreur)', async () => {
    while (await admin.locator('.modal-back [data-x]').count()) await admin.click('.modal-back [data-x] >> nth=-1');
    await admin.click('[data-v=ops]'); await admin.waitForSelector(`[data-ops-list] [data-ref="${ref}"]`);
    await admin.waitForSelector('[data-ops-table] >> text=Hery Vélo');
    await admin.click('[data-ostep] [data-k=delivery]'); await admin.waitForSelector('[data-ops-list] >> text=Aucun colis');
    await admin.click('[data-ostep] [data-k=pickup]'); await admin.waitForSelector(`[data-ops-list] [data-ref="${ref}"]`);
    await admin.selectOption('[data-oc]', { label: 'Naina Moto' }); await admin.waitForSelector('[data-ops-list] >> text=Aucun colis');
    await admin.selectOption('[data-oc]', ''); await admin.click('[data-ostep] [data-k=active]');
    await admin.screenshot({ path: 'tests/screens/46-admin-suivi-livraisons.png' });
    await admin.click('[data-v=dash]'); await admin.waitForSelector('text=Livraisons du jour par livreur');
  });
  await step('service client : le client écrit, l\'admin répond depuis la notification', async () => {
    await client.click('.sp-tab [data-nav=support]'); await client.waitForSelector('.modal [data-cbody]');
    await client.fill('.modal [data-cbody]', 'Bonjour, à quelle heure passe le livreur ?'); await client.click('.modal [data-csend]');
    await client.waitForSelector('.modal >> text=à quelle heure passe le livreur');
    await admin.waitForSelector('[data-v=support] .cnt', { timeout: 15000 });
    await admin.click('[data-act=notifs]'); await admin.click('.modal [data-ni] >> text=Client Soa Boutique');
    await admin.waitForSelector('[data-sthread] >> text=à quelle heure passe le livreur');
    await admin.fill('[data-sthread] [data-cbody]', 'Il passe entre 13 h et 17 h.'); await admin.click('[data-sthread] [data-csend]');
    await admin.screenshot({ path: 'tests/screens/47-admin-service-client.png' });
    await client.waitForSelector('.modal >> text=Il passe entre 13 h et 17 h.', { timeout: 15000 });
    await client.screenshot({ path: 'tests/screens/48-client-service-client.png' });
    await client.click('.modal-back [data-x]');
  });
  await step('appel dans la plateforme : le client appelle le service client, l\'admin décroche, la voix passe', async () => {
    await client.click('.sp-tab [data-nav=support]'); await client.click('.modal [data-callsup]');
    await client.waitForSelector('.call-screen >> text=Ça sonne', { timeout: 15000 });
    await admin.waitForSelector('.call-screen [data-accept]', { timeout: 15000 });
    await admin.screenshot({ path: 'tests/screens/56-appel-entrant.png' });
    await admin.click('.call-screen [data-accept]');
    // Connexion établie des deux côtés : le compteur de durée démarre (00:0x).
    await client.waitForFunction(() => /^\d\d:\d\d$/.test(document.querySelector('.call-screen [data-st]')?.textContent || ''), null, { timeout: 20000 });
    await admin.waitForFunction(() => /^\d\d:\d\d$/.test(document.querySelector('.call-screen [data-st]')?.textContent || ''), null, { timeout: 20000 });
    await client.screenshot({ path: 'tests/screens/57-appel-en-cours.png' });
    await client.click('.call-screen [data-hang]');
    await admin.waitForSelector('.call-screen >> text=Appel terminé', { timeout: 10000 });
    await admin.waitForSelector('.call-screen', { state: 'detached', timeout: 10000 });
    await client.click('.modal-back [data-x]');
  });
  await step('client : colis à 450 000 Ar → validé par l\'admin', async () => {
    const r = await api('POST', '/api/shipments', { declared_value: 450000, description: 'Téléphone', size: '20x10x5', sender: { name: 'Soa', address: 'Behoririka', lat: -18.8950, lng: 47.5280 },
      recipient: { name: 'Lova', phone: '0347777777', address: 'Ivandry', lat: -18.8752, lng: 47.5328 } }, auth(await login('0331234567', 'secret12')));
    const big = r.data.shipment;
    if (!big.review) throw new Error('devrait attendre la validation');
    await admin.click('[data-v=ops]'); await admin.click('[data-ostep] [data-k=review]');
    await admin.click(`[data-ops-list] [data-ref="${big.ref}"] .pill`); await admin.waitForSelector('.modal [data-approve]');
    await admin.screenshot({ path: 'tests/screens/49-admin-valider-colis.png' });
    await admin.fill('.modal [data-rfee]', '6000'); await admin.click('.modal [data-approve]'); await admin.waitForSelector('text=Colis validé');
    const after = (await api('GET', `/api/shipments/${big.id}`, null, auth(tok.admin))).data.shipment;
    if (after.review || after.fee !== 6000) throw new Error('validation : ' + JSON.stringify({ review: after.review, fee: after.fee }));
  });
  await step('livreur : récupère puis remet à la coopérative (véhicule, frais PA)', async () => {
    await courier.click(`[data-act=ship][data-ref="${ref}"] [data-act=next]`);
    await courier.setInputFiles('[data-file]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('[data-prev][src^="data:image"]');
    await courier.waitForSelector('[data-tot] >> text=rien à encaisser');
    await courier.click('.modal [data-ok]');
    await courier.waitForSelector('.modal [data-later]'); await courier.click('.modal [data-later]');
    await courier.click(`[data-act=ship][data-ref="${ref}"] [data-act=next]`);
    await courier.setInputFiles('.modal [data-dphoto]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('[data-dprev][src^="data:image"]');
    await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Indiquez le véhicule');
    await courier.fill('.modal [data-plate]', '1234 TBA'); await courier.fill('.modal [data-dphone]', '034 66 666 66'); await courier.fill('.modal [data-cfee]', '15000');
    // code du colis exigé : mauvais code refusé, puis les 4 derniers caractères
    await courier.fill('.modal [data-code]', 'ZZZZ'); await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Ce n\'est pas le bon colis');
    await courier.fill('.modal [data-code]', ref.slice(-4).toLowerCase());
    await courier.screenshot({ path: 'tests/screens/44-livreur-cooperative.png' });
    await courier.click('.modal [data-ok]');
    let s; for (let i = 0; i < 40 && !s; i++) { s = (await api('GET', '/api/admin/shipments?status=delivered', null, auth(tok.admin))).data.shipments?.find((x) => x.ref === ref); if (!s) await courier.waitForTimeout(250); }
    if (!s || s.province.plate !== '1234 TBA' || s.province.fee_status !== 'pa' || s.province.fee !== 15000) throw new Error('remise coopérative : ' + JSON.stringify(s?.province));
  });
  await step('admin : menu Colis — infos complètes, filtre par livreur, payé ou non', async () => {
    while (await admin.locator('.modal-back [data-x]').count()) await admin.click('.modal-back [data-x] >> nth=-1');
    await admin.click('[data-v=parcels]'); await admin.selectOption('[data-pf=status]', '');
    await admin.selectOption('[data-pf=courier]', { label: 'Hery Vélo' }); await admin.waitForTimeout(700); // filtre appliqué tout seul
    await admin.waitForSelector(`tr[data-ref="${ref}"]`);
    const row = admin.locator(`tr[data-ref="${ref}"]`);
    for (const t of ['Soa Boutique', 'Rivo', '034 55 555 55', 'Récup. Hery Vélo', 'non payé']) if (!(await row.textContent()).includes(t)) throw new Error('ligne colis sans « ' + t + ' »');
    await admin.screenshot({ path: 'tests/screens/50-admin-colis-liste.png' });
    await admin.selectOption('[data-pf=courier]', { label: 'Naina Moto' }); await admin.waitForTimeout(700); // filtre appliqué tout seul
    await admin.waitForSelector('text=Aucun colis');
    await admin.selectOption('[data-pf=courier]', ''); await admin.waitForTimeout(700); // filtre appliqué tout seul
    await admin.evaluate(() => { location.hash = 'dash'; }); await admin.waitForSelector('.ad-hello'); await admin.waitForTimeout(400);
    await admin.screenshot({ path: 'tests/screens/51-admin-accueil.png', fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 }); await admin.click('.main-head [data-act=menu]'); await admin.waitForTimeout(300);
    await admin.screenshot({ path: 'tests/screens/52-admin-menu-mobile.png' });
    await admin.mouse.click(360, 420); await admin.waitForTimeout(200); await admin.setViewportSize({ width: 1360, height: 860 });
  });
} catch (e) {
  console.log('ÉCHEC\n', e.message);
  await Promise.all([admin, courier, client].map((p, i) => p.screenshot({ path: `tests/screens/err-tournees-${i}.png` }).catch(() => {})));
  process.exitCode = 1;
} finally {
  await browser.close(); server.kill();
  if (errors.length) { console.log('\nErreurs JS :\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nAucune erreur JavaScript ✔');
}
