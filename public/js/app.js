// Point d'entrée : authentification puis interface selon le rôle.
import { state, t, setLang, api, esc, $, bind, toast, toastErr, langSwitch } from './core.js';

setLang(state.lang);
const app = $('#app');
// Espace livreur séparé : /livreur (connexion livreur uniquement, application installable à part).
const COURIER_SPACE = location.pathname.replace(/\/+$/, '') === '/livreur';
// Lien « Alefa » depuis un logiciel de vente : /envoyer?ref=…&nom=…&tel=…&adresse=…&valeur=…
if (location.pathname.replace(/\/+$/, '') === '/envoyer') {
  sessionStorage.setItem('alefa_send', location.search.slice(1));
  history.replaceState(null, '', '/');
}
if (COURIER_SPACE) {
  $('#manifest').href = '/manifest-livreur.webmanifest';
  document.title = 'Alefa Livreur';
  document.querySelector('meta[name=theme-color]').content = '#14211c';
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Suivi public d'un colis : /suivi/<jeton> (sans compte, position du livreur visible uniquement pendant la livraison).
const TRACK = location.pathname.match(/^\/suivi\/([A-Za-z0-9_-]{8,40})\/?$/);
async function trackView(token) {
  const core = await import('./core.js');
  const mg = state.lang === 'mg';
  app.className = '';
  app.innerHTML = `<div style="display:flex;flex-direction:column;height:100dvh;width:100%">
    <div style="padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--line);background:var(--card)"><img src="/icon.svg" alt="" style="width:34px"><div class="grow"><b>Alefa</b> <span class="muted small">${mg ? 'Fanarahana entana' : 'Suivi de colis'}</span><div class="small" data-h>…</div></div>${langSwitch()}</div>
    <div data-map style="flex:1;min-height:300px"></div>
    <div style="padding:12px 16px;background:var(--card);border-top:1px solid var(--line)" data-info>…</div></div>`;
  bind(app, { lang: (el) => { setLang(el.dataset.l); trackView(token); } });
  const map = core.makeMap(app.querySelector('[data-map]'), { zoom: 13, zoomControl: true });
  const mk = {}; let fitted = false;
  const tick = async () => {
    let r; try { r = await api('GET', `/api/track/${token}`); } catch (e) { app.querySelector('[data-info]').textContent = e.message; return; }
    app.querySelector('[data-h]').innerHTML = `<b>${esc(r.ref)}</b>${r.external_ref ? ` · ${esc(r.external_ref)}` : ''}`;
    const eta = r.eta ? Math.max(1, Math.round((r.eta - Date.now()) / 60e3)) : null;
    app.querySelector('[data-info]').innerHTML = `<div style="font-size:1.15rem"><b>${esc(r.step_label || r.step)}</b></div>
      <div class="small muted">${r.courier ? `🚲 ${esc(r.courier)}` : ''}${eta ? ` · ${mg ? 'Tonga ao anatin\'ny' : 'Arrivée dans'} ~${eta} min` : ''}${!r.position && r.courier && !r.done_at ? ` · ${mg ? 'Mbola tsy hita ny toerany' : 'Position visible pendant la livraison'}` : ''}</div>`;
    if (!map) return;
    const pts = [];
    if (r.pickup) { core.upsertMarker(map, mk, 'a', r.pickup, core.icons.a()); pts.push(r.pickup); }
    if (r.drop) { core.upsertMarker(map, mk, 'b', r.drop, core.icons.b()); pts.push(r.drop); }
    if (r.position) { core.upsertMarker(map, mk, 'c', r.position, core.icons.bike('', r.courier || '')); pts.push(r.position); }
    else if (mk.c) { mk.c.remove(); delete mk.c; }
    if (!fitted && pts.length) { fitted = true; pts.length === 1 ? map.setView(pts[0], 15) : map.fitBounds(pts, { padding: [40, 40] }); }
  };
  await tick(); setInterval(tick, 8000);
}

async function boot() {
  if (TRACK) return trackView(TRACK[1]);
  state.config = await api('GET', '/api/config').catch(() => ({ zones: [] }));
  if (state.token) {
    try {
      const r = await api('GET', '/api/me');
      state.user = r.user; state.courier = r.courier; state.axe = r.axe;
      if (r.user.lang && !localStorage.getItem('alefa_lang')) setLang(r.user.lang);
    } catch { state.token = null; localStorage.removeItem('alefa_token'); }
  }
  app.className = '';
  if (!state.user) return COURIER_SPACE ? courierLoginView() : authView();
  const role = state.user.role;
  // Un seul lien pour tous : chacun est envoyé vers son espace selon son rôle.
  if (COURIER_SPACE && role !== 'courier') { location.replace('/'); return; }
  if (!COURIER_SPACE && role === 'courier') { location.replace('/livreur'); return; }
  const mod = await import(role === 'admin' ? './admin.js' : role === 'courier' ? './courier.js' : './client.js');
  mod.mount(app);
}

function courierLoginView() {
  app.innerHTML = `<div class="auth courier-auth"><div class="auth-card">
    ${langSwitch()}
    <div class="auth-brand"><img src="/icon.svg" alt=""><div><b>Alefa <span style="color:var(--green)">Livreur</span></b><span class="muted small">${t('courier_space')}</span></div></div>
    <form class="stack" data-form autocomplete="on">
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="034 12 345 67" required autocomplete="tel"></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
      <div class="card small" style="background:var(--sun-soft);border:0">📍 ${t('gps_required_login')}</div>
      <button class="btn primary lg block" type="submit">${t('sign_in')}</button>
      <p class="small muted" style="text-align:center">${t('courier_contact')}</p>
    </form></div></div>`;
  bind(app, { lang: (el) => { setLang(el.dataset.l); courierLoginView(); } });
  const form = app.querySelector('[data-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/login', Object.fromEntries(new FormData(form)));
      localStorage.setItem('alefa_token', r.token); state.token = r.token;
      boot();
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

function authView(mode = 'login', role = 'client') {
  app.innerHTML = `<div class="auth"><div class="auth-card">
    ${langSwitch()}
    <div class="auth-brand"><img src="/icon.svg" alt=""><div><b>Alefa</b><span class="muted small">${t('tagline')}</span></div></div>
    <div class="seg" style="margin-bottom:16px"><button data-act="mode" data-m="login" class="${mode === 'login' ? 'on' : ''}">${t('login')}</button><button data-act="mode" data-m="register" class="${mode === 'register' ? 'on' : ''}">${t('register')}</button></div>
    <form class="stack" data-form autocomplete="on">
      ${mode === 'register' ? `
        <label class="field"><span>${t('name')}</span><input class="input" name="name" required minlength="2" autocomplete="name"></label>` : ''}
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="034 12 345 67" required autocomplete="tel"></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required minlength="${mode === 'register' ? 6 : 1}" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"></label>
      ${mode === 'register' ? `
        <label class="row small"><input type="checkbox" name="is_business"> ${t('business')}</label>
        <label class="field hidden" data-company><span>${t('company')}</span><input class="input" name="company"></label>` : ''}
      <button class="btn primary lg block" type="submit">${mode === 'register' ? t('create_account') : t('sign_in')}</button>
      <p class="small muted" style="text-align:center">🚲 <a href="/livreur">${t('courier_space_link')}</a></p>
    </form>
  </div></div>`;
  bind(app, {
    mode: (el) => authView(el.dataset.m, role),
    role: (el) => authView('register', el.dataset.r),
    lang: (el) => { setLang(el.dataset.l); authView(mode, role); },
  });
  const form = app.querySelector('[data-form]');
  form.is_business?.addEventListener('change', (e) => app.querySelector('[data-company]').classList.toggle('hidden', !e.target.checked));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    data.is_business = !!data.is_business;
    data.lang = state.lang;
    if (mode === 'register') data.role = 'client';
    try {
      const r = await api('POST', mode === 'register' ? '/api/auth/register' : '/api/auth/login', data);
      localStorage.setItem('alefa_token', r.token);
      state.token = r.token;
      toast(`Tonga soa, ${r.user.name} !`, 'ok');
      boot();
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

boot().catch((e) => { app.className = ''; app.innerHTML = `<div class="auth"><div class="auth-card"><h2>${esc(t('error'))}</h2><p>${esc(e.message)}</p><a class="btn primary" href="/">↻</a></div></div>`; });
