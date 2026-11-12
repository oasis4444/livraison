// Test de bout en bout dans un vrai navigateur (Playwright) : client + livreur + admin.
// Leaflet, les tuiles et le géocodage sont remplacés par des bouchons (environnement sans Internet).
// Usage : node tests/e2e.mjs   (nécessite playwright et un serveur lancé par ce script)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = 8799, BASE = `http://localhost:${PORT}`, DB = '/tmp/alefa-e2e.db';
rmSync(DB, { force: true }); mkdirSync('tests/screens', { recursive: true });
const server = spawn('node', ['--no-warnings', 'tools/dev-server.mjs'], { env: { ...process.env, PORT, DB_FILE: DB }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1200));
const sql = execFileSync('node', ['tools/create-admin.mjs', '0340000000', 'Admin Alefa', 'admin12345']).toString();
const { DatabaseSync } = await import('node:sqlite');
new DatabaseSync(DB).exec(sql);

const LEAFLET_STUB = `
(() => {
  const mkLayer = (extra = {}) => { const o = { addTo(m) { m?._layers?.add(o); return o; }, remove() { return o; }, on() { return o; }, off() { return o; }, bindTooltip() { return o; }, ...extra }; return o; };
  const b = (pts) => ({ pad() { return this; }, pts });
  window.L = {
    map(el, o) { const m = { _c: o.center, _layers: new Set(), setView(c) { m._c = Array.isArray(c) ? c : [c.lat, c.lng]; return m; }, getCenter() { return { lat: m._c[0], lng: m._c[1] }; },
      fitBounds() { return m; }, invalidateSize() {}, remove() {}, on() { return m; }, off() { return m; }, attributionControl: { setPrefix() {} } }; el.dataset.stubmap = '1'; window.__maps = (window.__maps || []).concat(m); return m; },
    tileLayer() { return mkLayer(); }, divIcon(o) { return o; },
    marker(ll, o) { let p = ll; const mk = mkLayer({ setLatLng(x) { p = x; return mk; }, getLatLng() { return { lat: p[0] ?? p.lat, lng: p[1] ?? p.lng }; }, setIcon() { return mk; }, icon: o.icon }); return mk; },
    polyline(c) { return mkLayer({ getBounds: () => b(c) }); }, layerGroup(a) { return mkLayer(); }, latLngBounds: b,
    circle() { return mkLayer({ setLatLng() {}, setRadius() {}, setStyle() {} }); }, featureGroup() { return { getBounds: () => b([]) }; },
  };
})();`;

const browser = await chromium.launch();
const ANALAKELY = { latitude: -18.9055, longitude: 47.5255 };
async function ctx(geo) {
  const c = await browser.newContext({ viewport: { width: 400, height: 860 }, geolocation: geo, permissions: ['geolocation'], locale: 'fr-FR' });
  await c.route('https://unpkg.com/**', (r) => r.request().url().endsWith('.js') ? r.fulfill({ contentType: 'text/javascript', body: LEAFLET_STUB }) : r.fulfill({ contentType: 'text/css', body: '' }));
  await c.route('https://nominatim.openstreetmap.org/**', (r) => r.request().url().includes('/reverse')
    ? r.fulfill({ json: { address: { road: 'Avenue de l\'Indépendance', suburb: 'Analakely' } } })
    : r.fulfill({ json: [{ display_name: 'Ankorondrano, Antananarivo, Analamanga, Madagascar', lat: '-18.8840', lon: '47.5240' }] }));
  await c.route('https://routing.openstreetmap.de/**', (r) => r.abort());
  await c.route('https://*.basemaps.cartocdn.com/**', (r) => r.abort());
  return c;
}
const errors = [];
const watch = (p, name) => { p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errors.push(`${name} console: ${m.text()}`)); };
const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };

const cc = await ctx(ANALAKELY), client = await cc.newPage(); watch(client, 'client');
const kc = await ctx({ latitude: -18.9030, longitude: 47.5270 }), courier = await kc.newPage(); watch(courier, 'courier');
const ac = await browser.newContext({ viewport: { width: 1360, height: 860 } });
await ac.route('https://unpkg.com/**', (r) => r.request().url().endsWith('.js') ? r.fulfill({ contentType: 'text/javascript', body: LEAFLET_STUB }) : r.fulfill({ contentType: 'text/css', body: '' }));
const admin = await ac.newPage(); watch(admin, 'admin');

try {
  await step('inscription client', async () => {
    await client.goto(BASE);
    await client.screenshot({ path: 'tests/screens/01-connexion.png' });
    await client.click('[data-m=register]');
    await client.fill('[name=name]', 'Rasoa Rakoto'); await client.fill('[name=phone]', '033 12 345 67'); await client.fill('[name=password]', 'secret12');
    await client.click('[type=submit]');
    await client.waitForSelector('[data-t=home]'); await client.click('[data-t=home]');
    await client.waitForSelector('[data-q=b]');
  });
  await step('admin crée le livreur, un axe et son planning horaire', async () => {
    await admin.goto(BASE);
    await admin.fill('[name=phone]', '0340000000'); await admin.fill('[name=password]', 'admin12345'); await admin.click('[type=submit]');
    await admin.waitForSelector('text=Livraisons aujourd');
    await admin.click('[data-v=axes]'); await admin.click('[data-act=axe]');
    await admin.fill('[data-n]', 'Analakely – Tsaralalana'); await admin.fill('[data-r]', '2');
    await admin.evaluate(() => window.__maps.at(-1).setView([-18.9055, 47.5255]));
    await admin.click('[data-ok]'); await admin.waitForSelector('text=Rayon 2 km');
    await admin.click('[data-v=couriers]'); await admin.click('[data-act=newcourier]');
    await admin.fill('[data-v=name]', 'Hery Vélo'); await admin.fill('[data-v=phone]', '034 11 111 11'); await admin.fill('[data-v=cin]', '101 211 123 456'); await admin.fill('[data-v=password]', 'velo1234');
    await admin.click('[data-ok]'); await admin.waitForSelector('text=Livreur créé');
    await admin.click('[data-pl]'); await admin.waitForSelector('[data-gax]');
    await admin.check('[data-gax] input'); await admin.fill('[data-gfrom]', '00:00'); await admin.fill('[data-gto]', '23:59'); await admin.click('[data-gen]');
    await admin.screenshot({ path: 'tests/screens/12-admin-planning.png' });
    await admin.click('[data-save]'); await admin.waitForSelector('text=Planning enregistré');
  });
  await step('espace livreur séparé /livreur + GPS obligatoire', async () => {
    // sans autorisation GPS → écran bloquant
    const nc = await browser.newContext({ viewport: { width: 400, height: 860 }, locale: 'fr-FR' });
    await nc.route('https://unpkg.com/**', (r) => r.request().url().endsWith('.js') ? r.fulfill({ contentType: 'text/javascript', body: LEAFLET_STUB }) : r.fulfill({ contentType: 'text/css', body: '' }));
    const p = await nc.newPage(); watch(p, 'courier-nogps');
    await p.goto(BASE + '/livreur');
    await p.waitForSelector('text=Alefa Livreur');
    await p.fill('[name=phone]', '0340000000'); await p.fill('[name=password]', 'admin12345'); await p.click('[type=submit]');
    await p.waitForSelector('text=pas un compte livreur');
    await p.fill('[name=phone]', '034 11 111 11'); await p.fill('[name=password]', 'velo1234'); await p.click('[type=submit]');
    await p.waitForSelector('#gps-gate', { timeout: 15000 });
    await p.waitForSelector('text=Accès à la position refusé', { timeout: 15000 });
    await p.waitForTimeout(600); await p.screenshot({ path: 'tests/screens/13-livreur-sans-gps.png' });
    await nc.close();
    // avec GPS → l'écran disparaît
    await courier.goto(BASE + '/livreur');
    await courier.fill('[name=phone]', '034 11 111 11'); await courier.fill('[name=password]', 'velo1234'); await courier.click('[type=submit]');
    await courier.waitForSelector('text=Analakely – Tsaralalana');
    await courier.waitForSelector('#gps-gate', { state: 'detached', timeout: 15000 });
    await courier.screenshot({ path: 'tests/screens/14-livreur-gps-ok.png' });
  });
  await step('livreur passe disponible', async () => {
    await courier.waitForSelector('[data-act=toggle]');
    await courier.click('[data-act=toggle]');
    await courier.waitForSelector('.switch.on');
    await courier.click('[data-t=req]');
    await courier.waitForTimeout(800);
  });
  await step('client : demande Analakely → Ankorondrano à 8 000 Ar', async () => {
    await client.waitForFunction(() => document.querySelector('[data-q=a]')?.value.length > 3);
    await client.fill('[data-q=b]', 'Ankorondrano');
    await client.click('[data-sug=b] button');
    await client.waitForSelector('[data-f=price]');
    await client.waitForFunction(() => document.querySelector('[data-f=price]').value !== '');
    await client.fill('[data-f=price]', '8000');
    await client.click('[data-act=type][data-v=documents]');
    await client.screenshot({ path: 'tests/screens/02-client-demande.png' });
    await client.click('[data-act=submit]');
    await client.waitForSelector('text=Recherche de livreurs');
  });
  await step('client voit le livreur en temps réel (position exacte)', async () => {
    const n = await client.evaluate(() => fetch('/api/couriers/nearby?lat=-18.9055&lng=47.5255', { headers: { authorization: 'Bearer ' + localStorage.getItem('alefa_token') } }).then((r) => r.json()));
    if (n.couriers[0]?.lat !== -18.903) throw new Error('position ' + JSON.stringify(n));
  });
  await step('livreur voit la demande et propose 10 000 Ar', async () => {
    await courier.waitForSelector('[data-act=open]', { timeout: 12000 });
    await courier.screenshot({ path: 'tests/screens/03-livreur-demandes.png' });
    await courier.click('[data-act=open]');
    await courier.click('[data-p="10000"]');
    await courier.waitForSelector('text=En attente du client', { timeout: 8000 });
  });
  await step('client reçoit l\'offre et l\'accepte', async () => {
    await client.waitForSelector('[data-act=accept]', { timeout: 12000 });
    await client.screenshot({ path: 'tests/screens/04-client-offres.png' });
    await client.click('[data-act=accept]');
    await client.waitForSelector('.pin-box', { timeout: 8000 });
  });
  const pin = await client.$$eval('.pin-box span', (s) => s.map((x) => x.textContent).join(''));
  await step('livreur : course active, message, récupération', async () => {
    await courier.waitForSelector('[data-act=pickup]', { timeout: 12000 });
    await courier.fill('[data-chat-input]', 'Bonjour, j\'arrive dans 5 minutes');
    await courier.click('[data-act=send]');
    await courier.screenshot({ path: 'tests/screens/05-livreur-course.png' });
    await courier.click('[data-act=pickup]'); await courier.click('[data-yes]');
    await courier.waitForSelector('[data-pin]', { timeout: 8000 });
  });
  await step('client voit le message et le statut', async () => {
    await client.waitForSelector('text=j\'arrive dans 5 minutes', { timeout: 10000 });
    await client.waitForSelector('.st-picked_up', { timeout: 10000 });
    await client.screenshot({ path: 'tests/screens/06-client-suivi.png' });
  });
  await step('livraison confirmée par PIN', async () => {
    await courier.fill('[data-pin]', pin);
    await courier.click('[data-act=deliver]');
    await courier.waitForSelector('text=Livrée !');
  });
  await step('client évalue le livreur', async () => {
    await client.waitForSelector('.stars-input', { timeout: 10000 });
    await client.click('[data-act=star][data-v="5"]');
    await client.click('[data-act=rate]');
    await client.waitForSelector('[data-t=home]'); await client.click('[data-t=home]');
    await client.waitForSelector('[data-q=b]');
  });
  await step('livreur : revenus', async () => {
    await courier.keyboard.press('Escape'); await courier.click('.modal-back', { position: { x: 5, y: 5 } }).catch(() => {});
    await courier.click('[data-act=tab][data-t=wallet]');
    await courier.waitForSelector('text=Opérations');
    await courier.screenshot({ path: 'tests/screens/07-livreur-revenus.png' });
  });
  await step('admin : tableau de bord, carte, rapports, paramètres', async () => {
    await admin.click('[data-v=live]'); await admin.waitForSelector('text=🧭');
    await admin.click('[data-v=dash]'); await admin.waitForSelector('.kpis');
    await admin.screenshot({ path: 'tests/screens/08-admin-dashboard.png' });
    await admin.click('[data-v=live]'); await admin.waitForSelector('text=Livreurs (');
    await admin.click('[data-v=deliveries]'); await admin.selectOption('[data-f=status]', ''); await admin.click('[data-act=dfilter]');
    await admin.waitForSelector('tr.click'); await admin.click('tr.click'); await admin.waitForSelector('text=Livraison #1');
    await admin.screenshot({ path: 'tests/screens/09-admin-livraison.png' });
    await admin.click('[data-x]');
    await admin.click('[data-v=reports]'); await admin.waitForSelector('text=Taux de réussite');
    await admin.screenshot({ path: 'tests/screens/10-admin-rapports.png' });
    await admin.click('[data-v=settings]'); await admin.fill('[data-s=commission_percent]', '12'); await admin.click('[data-act=savesettings]');
    await admin.waitForSelector('text=Paramètres enregistrés');
    await admin.click('[data-v=payments]'); await admin.waitForSelector('text=Soldes des livreurs');
    await admin.click('[data-v=audit]'); await admin.waitForSelector('text=delivery_done');
  });
  await step('langue malagasy', async () => {
    await client.click('[data-act=profile]'); await client.click('[data-l=mg]');
    await client.waitForSelector('[data-t=home]'); await client.click('[data-t=home]');
    await client.waitForSelector('[placeholder="Toerana hanaterana"]');
    await client.screenshot({ path: 'tests/screens/11-client-malagasy.png' });
  });
  if (errors.length) { console.log('\nErreurs JS :\n' + errors.join('\n')); process.exitCode = 1; } else console.log('\nAucune erreur JavaScript ✔');
} catch (e) {
  console.log('ÉCHEC\n', e.message, '\n', errors.join('\n'));
  await Promise.all([client.screenshot({ path: 'tests/screens/fail-client.png' }), courier.screenshot({ path: 'tests/screens/fail-courier.png' }), admin.screenshot({ path: 'tests/screens/fail-admin.png' })]).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close(); server.kill();
}
