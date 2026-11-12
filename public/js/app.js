// Point d'entrée : authentification puis interface selon le rôle.
import { state, t, setLang, api, esc, $, bind, toast, toastErr, langSwitch } from './core.js';

setLang(state.lang);
const app = $('#app');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function boot() {
  state.config = await api('GET', '/api/config').catch(() => ({ zones: [] }));
  if (state.token) {
    try {
      const r = await api('GET', '/api/me');
      state.user = r.user; state.courier = r.courier;
      if (r.user.lang && !localStorage.getItem('alefa_lang')) setLang(r.user.lang);
    } catch { state.token = null; localStorage.removeItem('alefa_token'); }
  }
  app.className = '';
  if (!state.user) return authView();
  const role = state.user.role;
  const mod = await import(role === 'admin' ? './admin.js' : role === 'courier' ? './courier.js' : './client.js');
  mod.mount(app);
}

function authView(mode = 'login', role = 'client') {
  app.innerHTML = `<div class="auth"><div class="auth-card">
    ${langSwitch()}
    <div class="auth-brand"><img src="/icon.svg" alt=""><div><b>Alefa</b><span class="muted small">${t('tagline')}</span></div></div>
    <div class="seg" style="margin-bottom:16px"><button data-act="mode" data-m="login" class="${mode === 'login' ? 'on' : ''}">${t('login')}</button><button data-act="mode" data-m="register" class="${mode === 'register' ? 'on' : ''}">${t('register')}</button></div>
    <form class="stack" data-form autocomplete="on">
      ${mode === 'register' ? `
        <div><span class="small muted" style="font-weight:600">${t('iam')}</span>
          <div class="seg" style="margin-top:6px"><button type="button" data-act="role" data-r="client" class="${role === 'client' ? 'on' : ''}">📦 ${t('client')}</button><button type="button" data-act="role" data-r="courier" class="${role === 'courier' ? 'on' : ''}">🚲 ${t('courier')}</button></div></div>
        <label class="field"><span>${t('name')}</span><input class="input" name="name" required minlength="2" autocomplete="name"></label>` : ''}
      <label class="field"><span>${t('phone')}</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="034 12 345 67" required autocomplete="tel"></label>
      <label class="field"><span>${t('password')}</span><input class="input" name="password" type="password" required minlength="${mode === 'register' ? 6 : 1}" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"></label>
      ${mode === 'register' && role === 'courier' ? `
        <label class="field"><span>${t('cin')}</span><input class="input" name="cin" required placeholder="101 211 123 456"></label>
        <label class="field"><span>${t('address')}</span><input class="input" name="address"></label>
        <label class="field"><span>${t('emergency')}</span><input class="input" name="emergency_contact" placeholder="Nom + téléphone"></label>
        <label class="field"><span>Vélo / documents</span><textarea class="input" name="doc_note" rows="2" placeholder="Type de vélo, couleur, documents fournis…"></textarea></label>` : ''}
      ${mode === 'register' && role === 'client' ? `
        <label class="row small"><input type="checkbox" name="is_business"> ${t('business')}</label>
        <label class="field hidden" data-company><span>${t('company')}</span><input class="input" name="company"></label>` : ''}
      <button class="btn primary lg block" type="submit">${mode === 'register' ? t('create_account') : t('sign_in')}</button>
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
    if (mode === 'register') data.role = role;
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
