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
new DatabaseSync(DB).exec(sql); // répartition par l'admin (réglage par défaut)

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
    if ((await api('POST', '/api/auth/register', { name: 'Soa Boutique', phone: '0331234567', password: 'secret12' })).status !== 201) throw new Error('client');
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
    await client.goto(BASE);
    await client.fill('[name=phone]', '033 12 345 67'); await client.fill('[name=password]', 'secret12'); await client.click('[type=submit]');
    await client.click('[data-t=colis]'); await client.click('[data-act=sendparcel]');
    await client.click('[data-gps]'); await client.waitForFunction(() => document.querySelector('[data-a=pickup]').value.length > 3);
    await client.fill('[data-rn]', 'Rivo'); await client.fill('[data-rp]', '034 55 555 55');
    await client.fill('[data-a=drop]', 'Analakely gare Kofmad'); await client.click('[data-s=drop] button >> nth=0');
    await client.fill('[data-v]', '40000'); await client.waitForSelector('[data-dep]');
    await client.fill('[data-d]', 'Sac de riz'); await client.click('[data-sz^="45|"]');
    await client.click('[data-pv=mm]'); await client.fill('[data-pref]', 'MVola 556677');
    await client.check('[data-prov]');
    await client.click('.modal [data-ok]'); await client.waitForSelector('text=Ville de destination');
    await client.fill('[data-city]', 'Fianarantsoa'); await client.fill('[data-coop]', 'Kofmad');
    await client.screenshot({ path: 'tests/screens/41-client-province-mobile-money.png' });
    await client.click('.modal [data-ok]'); await client.waitForSelector('.pin-box');
    ref = (await client.textContent('.modal h2, .modal .modal-title, .modal header')).match(/AL[A-Z0-9]+/)[0];
    await client.click('.modal-back [data-x]');
    await client.waitForSelector(`text=${ref}`); await client.waitForSelector('text=🚌 Fianarantsoa');
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
    await admin.goto(BASE);
    await admin.fill('[name=phone]', '0340000000'); await admin.fill('[name=password]', 'admin12345'); await admin.click('[type=submit]');
    await admin.waitForSelector('text=Colis du centre');
    const n = await api('GET', '/api/notifications', null, auth(tok.admin));
    const list = n.data.notifications || n.data.items || [];
    if (!list.some((x) => /Nouveau colis à répartir/.test(x.title) && x.body.includes(ref))) throw new Error('notification admin absente');
    if (!list.some((x) => x.title.includes(`${ref} pris par Hery`))) throw new Error('notification « pris par Hery » absente');
    await admin.click('[data-v=parcels]'); await admin.selectOption('[data-pf=status]', ''); await admin.click('[data-act=pfilter]');
    await admin.click(`text=${ref}`); await admin.waitForSelector('text=Fianarantsoa');
    await admin.waitForSelector('text=Marchandise déjà payée par Mobile Money');
    await admin.screenshot({ path: 'tests/screens/43-admin-colis-province.png' });
  });
  await step('livreur : récupère puis remet à la coopérative (véhicule, frais PA)', async () => {
    await courier.click(`[data-act=ship] >> text=${ref}`);
    await courier.click('text=📦 Récupérer');
    await courier.setInputFiles('[data-file]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('[data-prev][src^="data:image"]');
    await courier.waitForSelector('[data-tot] >> text=rien à encaisser');
    await courier.click('.modal [data-ok]');
    await courier.waitForSelector('.modal [data-later]'); await courier.click('.modal [data-later]');
    await courier.click(`[data-act=ship] >> text=${ref}`);
    await courier.click('text=Remettre à la coopérative');
    await courier.setInputFiles('.modal [data-dphoto]', 'tests/fixture-colis.jpg'); await courier.waitForSelector('[data-dprev][src^="data:image"]');
    await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Indiquez le véhicule');
    await courier.fill('.modal [data-plate]', '1234 TBA'); await courier.fill('.modal [data-dphone]', '034 66 666 66'); await courier.fill('.modal [data-cfee]', '15000');
    await courier.screenshot({ path: 'tests/screens/44-livreur-cooperative.png' });
    await courier.click('.modal [data-ok]'); await courier.waitForSelector('text=Remis à la coopérative ✅');
    const s = (await api('GET', '/api/admin/shipments?status=delivered', null, auth(tok.admin))).data.shipments?.find((x) => x.ref === ref);
    if (!s || s.province.plate !== '1234 TBA' || s.province.fee_status !== 'pa' || s.province.fee !== 15000) throw new Error('remise coopérative : ' + JSON.stringify(s?.province));
  });
} catch (e) {
  console.log('ÉCHEC\n', e.message);
  await Promise.all([admin, courier, client].map((p, i) => p.screenshot({ path: `tests/screens/err-tournees-${i}.png` }).catch(() => {})));
  process.exitCode = 1;
} finally {
  await browser.close(); server.kill();
  if (errors.length) { console.log('\nErreurs JS :\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nAucune erreur JavaScript ✔');
}
