// Appels audio dans la plateforme (comme WhatsApp) et discussion par colis.
// La voix passe directement entre les deux téléphones (WebRTC) ; le serveur relaie seulement la mise en relation.
import { state, api, esc, toast, toastErr, initials, ring, ringback, every, modal, chatPanel, symbol } from './core.js';

const L2 = (fr, mg) => (state.lang === 'mg' ? mg : fr);
let cur = null; // appel en cours : { id, side, pc, stream, ui, poll, timer }
let watching = false;

// ---------------------------------------------------------------- écran d'appel
function screen({ name, status, incoming = false }) {
  document.querySelector('.call-screen')?.remove();
  const el = document.createElement('div');
  el.className = 'call-screen';
  el.innerHTML = `<div class="call-card">
    <div class="call-brand"><img src="/icon.svg" alt="" width="22" height="22"> ${L2('Appel Alefa', 'Antso Alefa')}</div>
    <div class="call-av ${incoming ? 'pulse' : ''}">${esc(initials(name || '?'))}</div>
    <div class="call-name">${esc(name || '')}</div>
    <div class="call-st" data-st>${esc(status)}</div>
    <div class="call-btns">${incoming
      ? `<button class="call-b no" data-decline>${symbol('phone')}<span>${L2('Refuser', 'Lavina')}</span></button><button class="call-b yes" data-accept>${symbol('phone')}<span>${L2('Décrocher', 'Raisina')}</span></button>`
      : `<button class="call-b mute" data-mute>${MIC}<span>${L2('Micro', 'Mikra')}</span></button><button class="call-b no" data-hang>${symbol('phone')}<span>${L2('Raccrocher', 'Ahantona')}</span></button>`}</div>
    <audio data-audio autoplay playsinline></audio></div>`;
  document.body.append(el);
  return el;
}
const MIC = '<svg class="sym" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const setStatus = (t) => { const s = cur?.ui?.querySelector('[data-st]'); if (s) s.textContent = t; };
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

async function media() {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error(L2('Ce navigateur ne permet pas les appels. Utilisez Chrome ou appelez par téléphone.', 'Tsy afaka miantso amin\'ity navigateur ity. Ampiasao Chrome na antsoy amin\'ny telefaona.'));
  try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { throw new Error(L2('Autorisez le micro pour appeler.', 'Avelao hampiasa ny mikra.')); }
}
async function peer(stream) {
  const cfg = await api('GET', '/api/calls/config').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
  const pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.ontrack = (e) => { const a = cur?.ui?.querySelector('[data-audio]'); if (a) { a.srcObject = e.streams[0]; a.play?.().catch(() => {}); } };
  const pending = []; let flushT = null;
  const flush = async () => { if (!cur?.id || !pending.length) return; const cands = pending.splice(0); await api('POST', `/api/calls/${cur.id}/ice`, { cands }).catch(() => {}); };
  pc.onicecandidate = (e) => { if (e.candidate) { pending.push(e.candidate.toJSON()); clearTimeout(flushT); flushT = setTimeout(flush, 250); } };
  pc.onconnectionstatechange = () => {
    if (!cur) return;
    if (pc.connectionState === 'connected' && !cur.since) { cur.since = Date.now(); ringback(false); cur.timer = setInterval(() => setStatus(mmss(Date.now() - cur.since)), 1000); }
    if (pc.connectionState === 'failed') finish(L2('Connexion impossible avec ce réseau. Appelez par téléphone.', 'Tsy tafiditra ny antso amin\'ity tambajotra ity. Antsoy amin\'ny telefaona.'), true);
  };
  return { pc, flush };
}
function wireButtons() {
  const ui = cur.ui;
  ui.querySelector('[data-hang]')?.addEventListener('click', () => hangUp());
  ui.querySelector('[data-mute]')?.addEventListener('click', (e) => {
    const b = e.currentTarget, on = !b.classList.contains('on');
    b.classList.toggle('on', on); cur.stream?.getAudioTracks().forEach((t) => (t.enabled = !on));
  });
}
// Échange régulier avec le serveur : réponse de l'appelé, candidats réseau, fin d'appel.
function startPolling() {
  let after = 0; const remote = [];
  cur.poll = every(1000, async () => {
    if (!cur) return;
    const r = await api('GET', `/api/calls/${cur.id}?after=${after}`).catch(() => null); if (!r || !cur) return;
    if (cur.side === 'caller' && r.answer && !cur.pc.remoteDescription) { await cur.pc.setRemoteDescription(JSON.parse(r.answer)); setStatus(L2('Connexion…', 'Mifandray…')); }
    for (const x of r.ice) { after = Math.max(after, x.id); remote.push(x.cand); }
    if (cur.pc.remoteDescription) while (remote.length) await cur.pc.addIceCandidate(remote.shift()).catch(() => {});
    if (['ended', 'declined', 'missed'].includes(r.status)) finish(r.status === 'declined' ? L2('Appel refusé', 'Nolavina ny antso') : r.status === 'missed' ? L2('Pas de réponse', 'Tsy namaly') : L2('Appel terminé', 'Vita ny antso'));
  }, false);
}
function cleanup() {
  if (!cur) return;
  ring(false); ringback(false); clearInterval(cur.timer); cur.poll?.stop();
  cur.stream?.getTracks().forEach((t) => t.stop()); try { cur.pc?.close(); } catch {}
}
function finish(msg, err = false) {
  if (!cur) return;
  const ui = cur.ui; cleanup(); cur = null;
  const st = ui?.querySelector('[data-st]'); if (st) st.textContent = msg;
  ui?.querySelector('.call-btns')?.remove();
  setTimeout(() => ui?.remove(), err ? 3500 : 1600);
}
export async function hangUp() {
  if (!cur) return;
  const id = cur.id; finish(L2('Appel terminé', 'Vita ny antso'));
  if (id) await api('POST', `/api/calls/${id}/end`, {}).catch(() => {});
}

// ---------------------------------------------------------------- appeler
// to : 'courier' | 'sender' | 'recipient' (avec shipment_id), 'support', ou user_id (centre).
export async function callUser({ to, shipment_id, user_id, name }) {
  if (cur) return toast(L2('Un appel est déjà en cours', 'Misy antso efa mandeha'), 'err');
  let stream;
  try { stream = await media(); } catch (e) { return toastErr(e); }
  cur = { side: 'caller', stream, ui: screen({ name, status: L2('Appel…', 'Miantso…') }) };
  wireButtons(); ringback(true);
  try {
    const { pc, flush } = await peer(stream); cur.pc = pc;
    await pc.setLocalDescription(await pc.createOffer());
    const r = await api('POST', '/api/calls', { to, shipment_id, user_id, offer: JSON.stringify(pc.localDescription) });
    if (!cur) return api('POST', `/api/calls/${r.id}/end`, {}).catch(() => {});
    cur.id = r.id; cur.ui.querySelector('.call-name').textContent = r.peer || name || '';
    setStatus(L2('Ça sonne…', 'Maneno…')); flush(); startPolling();
  } catch (e) { finish(e.message || L2('Appel impossible', 'Tsy afaka miantso'), true); }
}

// ---------------------------------------------------------------- appels entrants
export function watchCalls() {
  if (watching || !state.token) return; watching = true;
  let shown = null;
  every(3000, async () => {
    if (cur) return;
    const r = await api('GET', '/api/calls/incoming').catch(() => null);
    const c = r?.call;
    if (!c) { if (shown && !cur) { document.querySelector('.call-screen')?.remove(); ring(false); shown = null; } return; }
    if (shown === c.id) return;
    shown = c.id;
    const who = c.support ? `${c.from} · ${L2('service client', 'sampana mpanjifa')}` : c.ref ? `${c.from} · ${c.ref}` : c.from;
    const ui = screen({ name: c.from, status: `${L2('Appel entrant', 'Misy miantso')}${c.ref ? ` · ${L2('colis', 'colis')} ${c.ref}` : c.support ? ` · ${L2('service client', 'sampana mpanjifa')}` : ''}`, incoming: true });
    ui.title = who;
    ring(true);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.getRegistration().then((reg) => reg?.showNotification(L2('Appel entrant', 'Misy miantso'), { body: who, icon: '/icon-192.png', tag: 'alefa-call', renotify: true, requireInteraction: true, vibrate: [400, 200, 400] })).catch(() => {});
    }
    ui.querySelector('[data-decline]').onclick = async () => { ring(false); ui.remove(); shown = null; await api('POST', `/api/calls/${c.id}/end`, {}).catch(() => {}); };
    ui.querySelector('[data-accept]').onclick = () => accept(c, ui);
  });
}
async function accept(c, ui) {
  ring(false);
  let stream;
  try { stream = await media(); } catch (e) { toastErr(e); ui.remove(); await api('POST', `/api/calls/${c.id}/end`, {}).catch(() => {}); return; }
  ui.remove();
  cur = { id: c.id, side: 'callee', stream, ui: screen({ name: c.from, status: L2('Connexion…', 'Mifandray…') }) };
  wireButtons();
  try {
    const { pc, flush } = await peer(stream); cur.pc = pc;
    const g = await api('GET', `/api/calls/${c.id}`);
    await pc.setRemoteDescription(JSON.parse(g.offer));
    await pc.setLocalDescription(await pc.createAnswer());
    await api('POST', `/api/calls/${c.id}/answer`, { answer: JSON.stringify(pc.localDescription) });
    flush(); startPolling();
  } catch (e) { finish(e.message || L2('Appel impossible', 'Tsy afaka miantso'), true); }
}

// ---------------------------------------------------------------- discussion d'un colis
const WHO = { courier: ['le livreur', 'ny livreur'], sender: ['l\'expéditeur', 'ny mpandefa'], recipient: ['le destinataire', 'ny mpandray'] };
export async function openShipChat(id, { ref = '' } = {}) {
  let info;
  try { info = await api('GET', `/api/shipments/${id}/messages`); } catch (e) { return toastErr(e); }
  const m = modal(`${L2('Discussion', 'Resaka')}${ref ? ` · ${ref}` : ''}`, `<div class="stack">
    ${info.can_call.length ? `<div class="chat-calls">${info.can_call.map((k) => `<button class="btn sm" data-call="${k}">${symbol('phone')} ${L2('Appeler', 'Antsoy')} ${L2(...WHO[k])}</button>`).join('')}</div>` : ''}
    <p class="tiny muted">${L2('Messages visibles par l\'expéditeur, le destinataire, le livreur et le centre Alefa.', 'Hitan\'ny mpandefa, ny mpandray, ny livreur ary ny centre Alefa ireo hafatra ireo.')}</p>
    <div data-chat></div></div>`);
  m.el.querySelectorAll('[data-call]').forEach((b) => (b.onclick = () => callUser({ to: b.dataset.call, shipment_id: id, name: L2(...WHO[b.dataset.call]) })));
  const p = chatPanel(m.el.querySelector('[data-chat]'), {
    load: async () => (await api('GET', `/api/shipments/${id}/messages`)).messages.map((x) => ({ ...x, from_centre: x.mine, label: x.mine ? '' : x.author })),
    send: (body) => api('POST', `/api/shipments/${id}/messages`, { body }),
    centre: true,
  });
  const close = m.close; m.close = () => { p.stop(); close(); };
  m.el.closest('.modal-back')?.addEventListener('click', (e) => { if (e.target.matches('[data-x], .modal-back')) p.stop(); });
  return m;
}
