# Tsena Ampandrana : afficher les livreurs Alefa (axes, heures, départs)

Alefa publie déjà automatiquement, dans la base Firestore de Tsena, le document **`settings/alefa`** :

```json
{
  "id": "alefa",
  "updatedAt": "2026-11-17T12:43:36.000Z",
  "url": "https://livraison.oasismdg3434.workers.dev",
  "couriers": [
    {
      "name": "Santatra (Alefa)",
      "fullName": "Santatra",
      "online": false,
      "axes": "AMPANDRANA- ITAOSY",
      "hours": "AMPANDRANA- ITAOSY 08:00–10:00 (tous les jours)",
      "next": "18/11 08:00 AMPANDRANA- ITAOSY",
      "label": "Santatra (Alefa) · AMPANDRANA- ITAOSY · départ 18/11 08:00"
    }
  ]
}
```

Il est mis à jour seul dès qu'un livreur, un axe ou une heure change. Il reste à le **montrer** dans Tsena : 2 petites modifications du fichier `index.html`, puis publication (`firebase deploy --only hosting`).

## 1. Ajouter cette fonction (n'importe où dans le `<script>`, par ex. juste avant `function deliveryForm`)

```js
/* ---- Livreurs Alefa (publiés automatiquement par Alefa dans settings/alefa) ---- */
const alefaInfo = () => (ST.settings || []).find((s) => s.id === 'alefa') || { couriers: [] };
function alefaPanel() {
  const a = alefaInfo();
  if (!a.couriers || !a.couriers.length) return '';
  return `<div class="card" style="margin-bottom:12px"><div class="row"><b class="grow">🚲 Livreurs Alefa</b>
      <span class="small muted">Laisser « Livreur » vide : Alefa choisit lui-même</span></div>
    ${a.couriers.map((c) => `<div class="small" style="padding:4px 0;border-top:1px solid var(--line,#eee)">
      <b>${esc(c.name)}</b> ${c.online ? '🟢' : ''} · ${esc(c.axes || '—')}<br>
      <span class="muted">${esc(c.hours || '')}${c.next ? ' · prochain départ ' + esc(c.next) : ''}</span></div>`).join('')}</div>`;
}
```

## 2. Champ « Livreur » de la fiche livraison (`function deliveryForm`)

Remplacer :

```html
<label class="f">Livreur<input class="input" name="driver" value="${esc(d.driver||'')}"></label>
```

par :

```html
<label class="f">Livreur<input class="input" name="driver" list="alefaList" value="${esc(d.driver||'')}" placeholder="Vide = Alefa choisit"><datalist id="alefaList">${(alefaInfo().couriers||[]).map(c=>`<option value="${esc(c.name)}">${esc(c.label)}</option>`).join('')}</datalist></label>
```

## 3. Page Livraisons

Dans `VIEWS['livraisons']`, ajouter `${alefaPanel()}` en haut du contenu de la page (juste après le titre).

## Ce que fait Alefa ensuite (déjà en place)

- Champ « Livreur » **vide** : Alefa choisit le livreur dont l'axe ou le trajet passe par l'adresse, et l'écrit dans Tsena.
- **« Santatra (Alefa) »** choisi dans la liste : Alefa confie le colis à Santatra (à la saisie ou plus tard).
- Autre nom (livreur de la boutique, ex. « Fidy ») : la livraison est quand même envoyée à Alefa ; Alefa y met son livreur.
