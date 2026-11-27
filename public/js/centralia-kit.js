/*! Central IA — kit universel pour brancher N'IMPORTE QUEL logiciel web (chat intelligent, historique, projets,
 *  avis 👍/👎, envoi des données, traçage).
 *
 *  1. Ajouter dans la page du logiciel :
 *       <script src="https://VOTRE-ADRESSE-CENTRAL-IA/static/kit.js"></script>
 *       <script>
 *         CentralIA.init({
 *           nom: "Mon logiciel",
 *           utilisateur: () => utilisateurConnecte?.nom,          // qui pose les questions (historique séparé)
 *           visible: () => !!utilisateurConnecte,                  // quand afficher le bouton 🤖
 *           admin: () => utilisateurConnecte?.role === "admin",    // qui peut coller le code de connexion (⚙)
 *           donnees: () => ({ ventes: [...], clients: [...] }),    // (facultatif) tables envoyées au Central IA (ou une promesse)
 *         });
 *       </script>
 *  2. Dans le logiciel : bouton 🤖 → ⚙ → coller le « code de connexion » (Central IA → Intégration).
 *  3. Traçage (facultatif) : CentralIA.journal("Vente annulée", "Facture F012", 25000) à chaque action importante.
 *  4. Suivi d'activité : automatique pour la personne connectée (presence: false pour le désactiver).
 *     Prévenez le personnel que le temps de travail dans le logiciel est enregistré.
 */
(function () {
  "use strict";
  if (window.CentralIA && window.CentralIA.__kit) return;

  const PUSH_EVERY = 10 * 60 * 1000;
  let O = {}, KEY = "", CFG = {}, CONV = null, PROJECT = null, PROJECTS = [], pushing = null, root = null, shadow = null;

  const call = (f, d) => { try { return typeof f === "function" ? f() : (f === undefined ? d : f); } catch (e) { return d; } };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel) => shadow.querySelector(sel);
  const load = () => { try { CFG = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { CFG = {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) { /* stockage indisponible */ } };
  const connected = () => !!(CFG.url && CFG.key && CFG.app);
  const user = () => String(call(O.utilisateur, "") || "");
  const qs = (extra) => new URLSearchParams(Object.assign({ application_id: CFG.app, utilisateur: user() }, extra || {})).toString();

  function decode(code) {
    code = String(code || "").trim();
    if (!code.startsWith("CIA1-")) throw new Error("Ce code ne vient pas du Central IA (il commence par CIA1-).");
    let raw = code.slice(5).replace(/-/g, "+").replace(/_/g, "/");
    while (raw.length % 4) raw += "=";
    const txt = decodeURIComponent(Array.from(atob(raw)).map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    const i = JSON.parse(txt);
    if (!i.url || !i.key || !i.app) throw new Error("Code incomplet.");
    return { url: String(i.url).replace(/\/+$/, ""), key: i.key, app: i.app, nom: i.nom || i.app };
  }

  async function api(path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(CFG.url + path, { method: opts.method || "GET",
        headers: { "Content-Type": "application/json", "X-API-Key": CFG.key },
        body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new Error("Impossible de joindre le Central IA (est-il démarré ? Internet ?)."); }
    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse vide */ }
    if (!res.ok) throw new Error((data && typeof data.detail === "string") ? data.detail : "Erreur " + res.status);
    return data;
  }

  // ------------------------------------------------------------------ données et journal
  function journalBuffer() { try { return JSON.parse(localStorage.getItem(KEY + ":journal") || "[]"); } catch (e) { return []; } }
  function setJournalBuffer(l) { try { localStorage.setItem(KEY + ":journal", JSON.stringify(l.slice(-5000))); } catch (e) { /* plein */ } }
  function journal(action, details, montant) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const l = journalBuffer();
    l.push({ date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, heure: `${p(d.getHours())}:${p(d.getMinutes())}`,
      utilisateur: user() || "?", action: String(action || "").slice(0, 120), details: String(details || "").slice(0, 300),
      montant: Number(montant) || 0 });
    setJournalBuffer(l);
  }

  // ------------------------------------------------------------------ suivi d'activité (présence)
  // Chaque minute, pour la personne connectée : « actif » (logiciel utilisé), « inactif » (ouvert sans s'en servir)
  // ou « ailleurs » (autre onglet / application). Le logiciel ne voit pas ce que la personne fait ailleurs.
  let lastInput = Date.now();
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"].forEach((ev) =>
    document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  function device() {
    try { let id = localStorage.getItem("centralia_device"); if (!id) { id = "poste-" + Math.random().toString(36).slice(2, 7); localStorage.setItem("centralia_device", id); } return id; }
    catch (e) { return "poste"; }
  }
  function presenceTick() {
    if (O.presence === false || !connected() || !user() || !call(O.visible, true)) return;
    const vis = document.visibilityState === "visible" && document.hasFocus();
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const l = (() => { try { return JSON.parse(localStorage.getItem(KEY + ":presence") || "[]"); } catch (e) { return []; } })();
    l.push({ date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, heure: `${p(d.getHours())}:${p(d.getMinutes())}`,
      utilisateur: user(), nom: user(), etat: !vis ? "ailleurs" : (Date.now() - lastInput < 120000 ? "actif" : "inactif"), appareil: device() });
    try { localStorage.setItem(KEY + ":presence", JSON.stringify(l.slice(-20000))); } catch (e) { /* plein */ }
  }

  async function push(force) {
    if (!connected()) throw new Error("Assistant IA non connecté.");
    if (pushing) return pushing;
    pushing = (async () => {
      let total = 0;
      let pres = []; try { pres = JSON.parse(localStorage.getItem(KEY + ":presence") || "[]"); } catch (e) { /* vide */ }
      if (pres.length) {
        await api("/api/v1/data/presence", { method: "POST", body: { application_id: CFG.app, mode: "ajouter", rows: pres } });
        try { localStorage.setItem(KEY + ":presence", JSON.stringify(JSON.parse(localStorage.getItem(KEY + ":presence") || "[]").slice(pres.length))); } catch (e) { /* */ }
        total += pres.length;
      }
      // Journal : toujours envoyé (ajouté, jamais remplacé) — chaque appareil envoie ses propres actions
      const j = journalBuffer();
      if (j.length) {
        await api("/api/v1/data/journal", { method: "POST", body: { application_id: CFG.app, mode: "ajouter", rows: j } });
        setJournalBuffer(journalBuffer().slice(j.length));
        total += j.length;
      }
      const stale = !CFG.lastPush || Date.now() - CFG.lastPush > PUSH_EVERY;
      if (!CFG.noPush && O.donnees && (force || stale)) {
        const ds = (await call(O.donnees, {})) || {};   // peut être une promesse (données lues sur un serveur)
        for (const name of Object.keys(ds)) {
          const rows = Array.isArray(ds[name]) ? ds[name] : [];
          if (!rows.length) continue;
          for (let i = 0; i < rows.length; i += 5000) {
            await api("/api/v1/data/" + encodeURIComponent(name), { method: "POST",
              body: { application_id: CFG.app, mode: i === 0 ? "remplacer" : "ajouter", rows: rows.slice(i, i + 5000) } });
          }
          total += rows.length;
        }
        CFG.lastPush = Date.now(); save();
      }
      return total;
    })();
    try { return await pushing; } finally { pushing = null; }
  }

  // ------------------------------------------------------------------ rendu
  function md(text) {
    let out = "", inList = false;
    const close = () => { if (inList) { out += "</ul>"; inList = false; } };
    esc(text).split("\n").forEach((l) => {
      l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>");
      if (/^\s*-{3,}\s*$/.test(l)) { close(); out += "<hr>"; return; }
      const h = l.match(/^\s*#{1,6}\s+(.*)/);
      if (h) { close(); out += `<div class="h">${h[1]}</div>`; return; }
      const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
      if (m) { if (!inList) { out += "<ul>"; inList = true; } out += `<li>${m[1]}</li>`; return; }
      close(); out += l.trim() ? `<div>${l}</div>` : `<div style="height:6px"></div>`;
    });
    return out + (inList ? "</ul>" : "");
  }
  const fmt = (v) => typeof v === "number" ? v.toLocaleString("fr-FR") : esc(v);
  function render(data) {
    let html = md(data.answer || "");
    const a = data.analysis || {};
    const skip = ["decisions", "bilan"].includes(a.analysis_type);
    (skip ? [] : (a.tables || [])).slice(0, 2).forEach((t) => {
      const cols = t.columns || [], rows = (t.rows || []).slice(0, 12);
      if (!cols.length || !rows.length) return;
      html += `<div class="tbl"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
        rows.map((r) => `<tr>${r.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
    });
    (data.errors || []).forEach((e) => { html += `<div class="muted">⚠️ ${esc(e)}</div>`; });
    if (data.moteur) html += `<div class="muted">${esc(data.moteur)}</div>`;
    return html;
  }
  function toast(msg) {
    const t = $(".toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3500);
  }
  function add(kind, html) {
    const m = $(".msgs"), d = document.createElement("div");
    d.className = "m " + kind; d.innerHTML = html; m.appendChild(d); m.scrollTop = m.scrollHeight; return d;
  }
  function answer(box, data, avis) {
    box.className = "m a"; box.innerHTML = render(data);
    if (!data.message_id) return;
    const bar = document.createElement("div"); bar.className = "fb";
    bar.innerHTML = `<button class="${avis === "bon" ? "on" : ""}" title="Bonne réponse : l'IA la retient">👍</button>` +
                    `<button class="${avis === "mauvais" ? "on" : ""}" title="Mauvaise réponse : donner la bonne">👎</button>`;
    const [up, down] = bar.querySelectorAll("button");
    const send = async (kind, correction) => {
      try {
        const r = await api("/api/v1/chat/avis", { method: "POST", body: { message_id: data.message_id, avis: kind, correction: correction || "", utilisateur: user() } });
        up.classList.toggle("on", kind === "bon"); down.classList.toggle("on", kind === "mauvais");
        toast(r.appris ? "Merci ! L'IA a appris 🎓" : "Merci pour votre avis.");
      } catch (e) { toast(e.message); }
    };
    up.onclick = () => send("bon");
    down.onclick = () => { const c = prompt("Quelle est la bonne réponse ? (facultatif)\nInona no valiny marina ? (tsy voatery)", ""); if (c !== null) send("mauvais", c); };
    box.appendChild(bar);
  }

  // ------------------------------------------------------------------ actions
  function newConv() {
    CONV = null; $(".msgs").innerHTML = "";
    add("a", "Bonjour ! Posez-moi une question sur " + esc(O.nom || "votre activité") + ".<br><span class=\"muted\">Manao ahoana ! Afaka manontany amin'ny teny malagasy koa ianao.</span>");
    const sugg = O.suggestions || ["Inona no tokony hataoko androany ?", "Misy hosoka ve ?", "Ahoana ny raharaha ?"];
    $(".sugg").innerHTML = sugg.map((q) => `<button>${esc(q)}</button>`).join("");
    $(".sugg").querySelectorAll("button").forEach((b) => { b.onclick = () => { $(".in").value = b.textContent; ask(); }; });
    showProject();
  }
  function showProject() { const p = PROJECTS.find((x) => x.id === PROJECT); $(".proj").textContent = p ? "· 📁 " + p.nom : ""; }
  async function ask(ev) {
    if (ev) ev.preventDefault();
    if (!connected()) { settings(true); return; }
    const input = $(".in"), btn = $(".send"), text = input.value.trim();
    if (!text) return;
    add("u", esc(text)); input.value = ""; btn.disabled = true; $(".sugg").innerHTML = "";
    const wait = add("a muted", "Je réfléchis… / Mieritreritra…");
    try {
      try { await push(false); } catch (e) { /* on répond avec les dernières données */ }
      const isNew = !CONV;
      const data = await api("/api/v1/chat", { method: "POST", body: { application_id: CFG.app, message: text,
        conversation_id: CONV, project_id: CONV ? null : PROJECT, utilisateur: user() } });
      CONV = data.conversation_id || CONV; answer(wait, data);
      if (isNew && root.classList.contains("side")) history();
    } catch (e) { wait.className = "m a"; wait.textContent = "⚠️ " + e.message; }
    finally { btn.disabled = false; $(".msgs").scrollTop = $(".msgs").scrollHeight; }
  }
  async function history() {
    if (!connected()) return;
    try {
      PROJECTS = await api("/api/v1/projects?" + qs());
      const extra = {}; if (PROJECT) extra.project_id = PROJECT;
      const q = $(".search").value.trim(); if (q) extra.q = q;
      const convs = await api("/api/v1/conversations?" + qs(extra));
      $(".projects").innerHTML = `<div class="si ${PROJECT ? "" : "on"}" data-p=""><span class="t">Toutes les conversations</span></div>` +
        PROJECTS.map((p) => `<div class="si ${PROJECT === p.id ? "on" : ""}" data-p="${p.id}" title="${esc(p.instructions)}"><span class="t">📁 ${esc(p.nom)}</span><span class="muted">${p.conversations || ""}</span></div>`).join("");
      $(".projects").querySelectorAll(".si").forEach((n) => { n.onclick = () => { PROJECT = n.dataset.p ? Number(n.dataset.p) : null; newConv(); history(); }; });
      $(".convs").innerHTML = convs.length ? convs.map((c) => `<div class="si ${CONV === c.id ? "on" : ""}" data-c="${c.id}"><span class="t">${esc(c.titre || "(sans titre)")}</span><button class="x" data-del="${c.id}" title="Supprimer">🗑</button></div>`).join("")
        : `<div class="muted" style="padding:6px">Aucune conversation.</div>`;
      $(".convs").querySelectorAll(".si").forEach((n) => { n.onclick = () => openConv(n.dataset.c); });
      $(".convs").querySelectorAll("[data-del]").forEach((b) => { b.onclick = async (e) => {
        e.stopPropagation(); if (!confirm("Supprimer cette conversation ?")) return;
        await api("/api/v1/conversations/" + b.dataset.del + "?" + qs(), { method: "DELETE" }); if (CONV === b.dataset.del) newConv(); history(); }; });
      showProject();
    } catch (e) { $(".convs").innerHTML = `<div class="muted" style="padding:6px">⚠️ ${esc(e.message)}</div>`; }
  }
  async function openConv(id) {
    try {
      const c = await api("/api/v1/conversations/" + id + "?" + qs());
      CONV = id; $(".msgs").innerHTML = ""; $(".sugg").innerHTML = "";
      (c.messages || []).forEach((x) => x.role === "user" ? add("u", esc(x.content))
        : answer(add("a", ""), { answer: x.content, message_id: x.id, moteur: (x.meta || {}).moteur }, (x.meta || {}).avis));
      if (!root.classList.contains("big")) toggleSide(false);
      history();
    } catch (e) { toast(e.message); }
  }
  async function newProject() {
    const nom = prompt("Nom du projet / Anaran'ny tetikasa :"); if (!nom) return;
    const ins = prompt("Consignes permanentes pour l'IA dans ce projet (facultatif) :", "");
    try { const r = await api("/api/v1/projects", { method: "POST", body: { application_id: CFG.app, nom, instructions: ins || "", utilisateur: user() } });
      PROJECT = r.id; newConv(); history(); } catch (e) { toast(e.message); }
  }
  function toggleSide(force) {
    const open = force === undefined ? !root.classList.contains("side") : force;
    root.classList.toggle("side", open); if (open) history();
  }
  function settings(open) {
    const isAdmin = !!call(O.admin, true);
    const box = $(".settings");
    box.classList.toggle("show", open !== undefined ? open : !box.classList.contains("show"));
    if (!box.classList.contains("show")) return;
    box.innerHTML = !isAdmin ? `<p>Seul un responsable peut connecter l'Assistant IA.</p>` : (connected()
      ? `<p>✅ Connecté au Central IA — <b>${esc(CFG.nom)}</b><br><span class="muted">${esc(CFG.url)}</span></p>
         <label class="chk"><input type="checkbox" class="push" ${CFG.noPush ? "" : "checked"}> Cet appareil envoie les données du logiciel</label>
         <p class="muted">Décochez sur les appareils secondaires qui n'ont pas les mêmes données que l'ordinateur principal.</p>
         <div class="row"><button class="b now">📤 Envoyer maintenant</button><button class="b danger off">Déconnecter</button><button class="b close">Fermer</button></div>`
      : `<p><b>Connecter l'Assistant IA</b><br>Central IA → Intégration → choisir ce logiciel → « Générer un code de connexion » → Copier, puis coller ici :</p>
         <textarea class="code" rows="3" placeholder="CIA1-..."></textarea>
         <div class="row"><button class="b primary go">🔗 Connecter</button><button class="b close">Fermer</button></div>`);
    box.querySelectorAll(".close").forEach((b) => { b.onclick = () => settings(false); });
    const go = box.querySelector(".go");
    if (go) go.onclick = async () => {
      let info; try { info = decode(box.querySelector(".code").value); } catch (e) { toast(e.message); return; }
      const old = CFG; CFG = Object.assign({}, info);
      CFG.noPush = !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(CFG.url) && !O.envoiParDefaut;
      try { await api("/api/v1/projects?" + qs()); save(); if (!CFG.noPush) await push(true); toast("Assistant IA connecté ✅"); settings(false); newConv(); }
      catch (e) { CFG = old; save(); toast(e.message); }
    };
    const chk = box.querySelector(".push"); if (chk) chk.onchange = () => { CFG.noPush = !chk.checked; save(); };
    const now = box.querySelector(".now"); if (now) now.onclick = async () => { try { toast((await push(true)) + " ligne(s) envoyée(s)."); } catch (e) { toast(e.message); } };
    const off = box.querySelector(".off"); if (off) off.onclick = () => { if (confirm("Déconnecter l'Assistant IA ?")) { CFG = {}; save(); settings(false); newConv(); } };
  }

  // ------------------------------------------------------------------ interface (Shadow DOM : aucun conflit de style)
  const CSS = (c) => `
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .bub{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;font-size:28px;
      background:${c};color:#fff;box-shadow:0 10px 24px -6px rgba(0,0,0,.4);z-index:2147483000}
    .panel{position:fixed;right:20px;bottom:90px;width:min(420px,calc(100vw - 32px));height:min(600px,calc(100vh - 120px));display:none;
      flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 20px 50px -10px rgba(0,0,0,.45);z-index:2147483001;overflow:hidden;border:1px solid #e5e7eb;color:#111}
    .wrap.open .panel{display:flex} .wrap.big .panel{width:min(980px,calc(100vw - 32px));height:min(760px,calc(100vh - 110px))}
    .head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:${c};color:#fff;font-weight:700;font-size:14px}
    .head button{background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:8px;padding:3px 8px;margin-left:4px;cursor:pointer;font-size:13px}
    .proj{font-weight:400;font-size:12px;opacity:.9}
    .body{flex:1;display:flex;min-height:0} .main{flex:1;display:flex;flex-direction:column;min-width:0}
    .sbar{display:none;width:240px;flex:0 0 240px;border-right:1px solid #e5e7eb;overflow-y:auto;padding:8px}
    .wrap.side .sbar{display:block} .wrap.side:not(.big) .sbar{width:100%;flex:1;border:none} .wrap.side:not(.big) .main{display:none}
    .search{width:100%;padding:7px 9px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px}
    .st{display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}
    .st button{border:none;background:#f3f4f6;border-radius:8px;padding:2px 8px;font-size:12px;cursor:pointer}
    .si{display:flex;align-items:center;gap:4px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px}
    .si:hover{background:#f3f4f6} .si.on{background:#e0f2e9;font-weight:700}
    .si .t{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .si .x{visibility:hidden;border:none;background:none;cursor:pointer} .si:hover .x{visibility:visible}
    .msgs{flex:1;overflow-y:auto;padding:12px;background:#f8faf9;display:flex;flex-direction:column;gap:8px}
    .m{padding:9px 12px;border-radius:12px;max-width:92%;line-height:1.45;font-size:14px;word-wrap:break-word}
    .u{align-self:flex-end;background:${c};color:#fff} .a{align-self:flex-start;background:#fff;border:1px solid #e5e7eb}
    .muted{color:#6b7280;font-size:12px} .h{font-weight:700;margin:6px 0 2px} ul{margin:4px 0 4px 18px;padding:0} hr{border:none;border-top:1px solid #e5e7eb}
    .tbl{margin-top:8px;overflow-x:auto} table{border-collapse:collapse;font-size:12px;width:100%}
    th,td{border-bottom:1px solid #e5e7eb;padding:4px 6px;text-align:left;white-space:nowrap} th{background:#f3f4f6}
    .fb{display:flex;gap:6px;margin-top:6px} .fb button{border:1px solid #e5e7eb;background:#fff;border-radius:6px;cursor:pointer;padding:1px 7px}
    .fb button.on{background:#dcfce7;border-color:#86efac}
    .sugg{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;background:#f8faf9}
    .sugg button{border:1px solid #e5e7eb;background:#fff;border-radius:14px;padding:4px 10px;font-size:12px;cursor:pointer}
    form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb}
    .in{flex:1;padding:9px 10px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px}
    .send,.b{border:none;border-radius:10px;padding:8px 12px;cursor:pointer;font-size:13px;background:#f3f4f6}
    .send,.b.primary{background:${c};color:#fff} .b.danger{background:#fee2e2;color:#b91c1c}
    .settings{display:none;position:absolute;inset:44px 0 0 0;background:#fff;padding:16px;overflow:auto;font-size:14px;z-index:3}
    .settings.show{display:block} .settings textarea{width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid #e5e7eb;border-radius:8px}
    .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px} .chk{display:flex;gap:8px;align-items:center}
    .toast{position:fixed;right:24px;bottom:160px;background:#111;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;z-index:2147483002;pointer-events:none}
    .toast.show{opacity:.92}
    @media print{.bub,.panel{display:none!important}}`;

  function build() {
    const host = document.createElement("div");
    host.id = "centralia-kit";
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${CSS(O.couleur || "#1c8a52")}</style>
      <div class="wrap">
        <button class="bub" title="Assistant IA">🤖</button>
        <div class="panel" style="position:fixed">
          <div class="head"><span>🤖 Assistant IA <span class="proj"></span></span>
            <span><button class="hist">🕘 Historique</button><button class="new" title="Nouvelle conversation">＋</button>
            <button class="cfg" title="Réglages">⚙</button><button class="bigb" title="Agrandir">⤢</button><button class="close">✕</button></span></div>
          <div class="settings"></div>
          <div class="body">
            <div class="sbar"><input class="search" type="search" placeholder="🔎 Rechercher / Hitady…">
              <div class="st"><span>📁 Projets</span><button class="np">＋ Nouveau</button></div><div class="projects"></div>
              <div class="st"><span>🕘 Historique</span></div><div class="convs"></div></div>
            <div class="main"><div class="msgs"></div><div class="sugg"></div>
              <form><input class="in" autocomplete="off" placeholder="Posez votre question… / Apetraho ny fanontanianao…"><button class="send" type="submit">➤</button></form></div>
          </div>
        </div>
        <div class="toast"></div>
      </div>`;
    root = shadow.querySelector(".wrap");
    $(".bub").onclick = () => { root.classList.toggle("open"); if (root.classList.contains("open")) {
      if (!connected()) settings(true); else { push(false).catch(() => {}); if (root.classList.contains("side")) history(); }
      setTimeout(() => $(".in").focus(), 50); } };
    $(".close").onclick = () => root.classList.remove("open");
    $(".hist").onclick = () => toggleSide();
    $(".new").onclick = () => newConv();
    $(".cfg").onclick = () => settings();
    $(".np").onclick = () => newProject();
    $(".bigb").onclick = () => { root.classList.toggle("big"); if (root.classList.contains("big")) toggleSide(true); };
    $("form").onsubmit = ask;
    let t; $(".search").oninput = () => { clearTimeout(t); t = setTimeout(history, 300); };
    newConv();
  }

  function refresh() {
    if (!root) return;
    const show = !!call(O.visible, true);
    $(".bub").style.display = show ? "" : "none";
    if (!show) root.classList.remove("open");
  }

  window.CentralIA = {
    __kit: true,
    init(opts) {
      O = opts || {};
      KEY = "centralia_kit:" + (O.cle || O.nom || location.pathname);
      load();
      const start = () => { build(); refresh(); };
      if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
      setInterval(() => { refresh(); presenceTick(); }, 60 * 1000);
      setInterval(() => { if (connected() && call(O.visible, true)) push(false).catch(() => {}); }, 5 * 60 * 1000);
      document.addEventListener("click", refresh, true);
    },
    journal,
    envoyer: (force) => push(force !== false),
    ouvrir: () => { if (root) { root.classList.add("open"); refresh(); } },
    connecte: () => connected(),
  };
})();
