# API Alefa — intégration d'un logiciel de vente

L'API permet à un logiciel de vente (caisse, boutique en ligne, ERP) d'envoyer ses commandes au centre Alefa comme **colis à livrer**, de suivre leur statut et de recevoir les mises à jour par **webhook**.

- **Base** : `https://livraison.oasismdg3434.workers.dev/api/v1`
- **Authentification** : en-tête `X-API-Key: ak_…` (ou `Authorization: Bearer ak_…`). La clé est créée par le centre dans *Administration → API marchands*.
- **Format** : JSON (UTF-8). Montants en **Ariary entiers**. Dates en **millisecondes Unix** (UTC).
- Appelez l'API **depuis votre serveur** : ne mettez jamais la clé dans une page web publique.

## Principe

1. Votre logiciel crée un colis : expéditeur (lieu de récupération), destinataire, valeur de la marchandise.
2. Alefa le programme automatiquement sur le **prochain départ** d'un livreur dont l'axe couvre l'adresse de livraison (sinon il reste `pending` et le centre le programme).
3. Le livreur récupère le colis (photo + valeur vérifiée), puis le livre en un seul trajet.
4. Le destinataire paie **valeur + frais de livraison** (3 000 Ar par défaut, variable selon l'axe, modifiable par le centre ou le livreur).
5. Refus du destinataire : il paie les frais, le colis revient à l'expéditeur. Annulation après récupération : le colis revient à l'expéditeur, qui paie les frais de retour.
6. Au retour du livreur, le centre encaisse l'argent puis paie l'expéditeur (valeur des colis livrés − frais de retour).

## Statuts

| `status` | Signification |
| --- | --- |
| `pending` | Créé, en attente de programmation par le centre |
| `assigned` | Programmé : livreur + heure de départ + axe |
| `picked_up` | Récupéré chez l'expéditeur (photo et valeur enregistrées), en route |
| `delivered` | Livré et payé par le destinataire |
| `refused` | Refusé par le destinataire (frais payés) ; `returned: true` quand rendu à l'expéditeur |
| `cancelled` | Annulé. Si `picked_at` est renseigné : retour à l'expéditeur avec `return_fee` |

## Étapes détaillées (`step`)

En plus de `status`, chaque colis expose `step` (et `step_label` en français), mis à jour automatiquement par le GPS du livreur :

| `step` | Signification |
| --- | --- |
| `pending` | À programmer |
| `scheduled` | Programmé sur un départ |
| `departed` | Le livreur est parti du centre |
| `at_pickup` | Le livreur est arrivé chez l'expéditeur (< 150 m) |
| `picked_up` | Colis récupéré |
| `en_route` | En route vers le destinataire |
| `nearby` | Livreur à moins de 300 m du destinataire |
| `awaiting_recipient` | Le livreur a déclaré la remise ; en attente de la confirmation du destinataire |
| `awaiting_courier` | Le destinataire a confirmé ; en attente de la déclaration du livreur |
| `delivered` | Livré |
| `refused` / `cancelled` | Refusé / annulé avant récupération |
| `returning` / `returned` | Retour vers l'expéditeur / rendu |

Chaque changement d'étape déclenche aussi le webhook.

## Double confirmation de livraison (preuve)

Un colis ne passe à `delivered` que lorsque **le livreur ET le destinataire** ont confirmé :

- soit le destinataire donne au livreur le **code à 4 chiffres** `delivery_pin` (renvoyé à la création et dans `GET /shipments/{ref}`) — envoyez-le-lui par SMS depuis votre logiciel ; le livreur ne le voit jamais ;
- soit le destinataire (compte Alefa avec le même numéro) appuie sur « J'ai reçu le colis » dans l'application ;
- à défaut, le centre peut confirmer après vérification (`confirmed_by: "admin"`).

Champs : `courier_confirmed_at`, `recipient_confirmed_at`, `confirmed_by` (`pin`, `app` ou `admin`).

## Endpoints

### `GET /schedule` — heures de départ et axes
```json
{ "default_fee": 3000,
  "centre": { "name": "Centre Alefa", "address": "Antananarivo" },
  "axes": [{ "id": 1, "name": "Centre-ville", "center_lat": -18.9055, "center_lng": 47.5255, "radius_km": 3, "fee": null }],
  "departures": [{ "slot_id": 4, "courier": "Hery", "axe": "Centre-ville", "departure_at": 1794470700000, "return_at": 1794477900000, "load": 3, "started": false }] }
```

### `POST /quote` — frais et départs pour une adresse
Corps : `{ "drop_lat": -18.902, "drop_lng": 47.517 }` → `{ "fee": 3000, "departures": [...] }`

### `POST /shipments` — créer un colis
```json
{
  "external_ref": "CMD-1042",
  "declared_value": 25000,
  "description": "Robe taille M",
  "sender":    { "name": "Boutique Soa", "phone": "0321234567", "address": "Analakely, pavillon 12", "lat": -18.9055, "lng": 47.5255 },
  "recipient": { "name": "Rasoa", "phone": "0341234567", "address": "Ankorondrano, immeuble X", "lat": -18.884, "lng": 47.524 },
  "slot_id": 4, "departure_at": 1794470700000
}
```
- `sender.name` / `sender.phone` : facultatifs (par défaut, le compte vendeur lié à la clé).
- `lat` / `lng` : fortement recommandés ; sans coordonnées de livraison, le colis reste `pending` et le centre le programme.
- `slot_id` + `departure_at` : facultatifs (départ choisi dans `/schedule`) ; sinon attribution automatique. `"auto_assign": false` pour laisser le centre décider.
- **Idempotence** : un second appel avec le même `external_ref` ne crée pas de doublon et renvoie `{"duplicate": true, "shipment": …}` (HTTP 200).

Réponse `201` :
```json
{ "duplicate": false,
  "shipment": { "id": 12, "ref": "ALE7FM5UH", "external_ref": "CMD-1042", "status": "assigned",
    "sender": { … }, "recipient": { … }, "declared_value": 25000, "value": null, "fee": 3000, "amount_to_collect": 28000,
    "collected": 0, "return_fee": 0, "has_photo": false, "courier": { "id": 3, "name": "Hery Vélo" }, "axe": "Centre-ville",
    "departure_at": 1794470700000, "returned": false, "created_at": 1794468000000, … } }
```

### `GET /shipments` — liste
Paramètres : `status`, `since` (ms), `limit` (≤ 200).

### `GET /shipments/{ref}` — détail
`{ref}` = référence Alefa (`ALE7FM5UH`) **ou** votre `external_ref`. Inclut `events` (historique) et la position du livreur (`courier.lat`, `courier.lng`, `courier.last_seen`) pendant la course.

### `POST /shipments/{ref}/cancel` — annuler
Corps : `{ "reason": "Client a annulé" }`. Possible uniquement avant récupération (`pending`, `assigned`) ; ensuite, contactez le centre.

### `GET /shipments/{ref}/photo` — photo prise à la récupération (JPEG)

## Webhook

Si une URL de webhook (https) est configurée, Alefa envoie un `POST` à chaque changement (programmation, récupération, livraison, refus, annulation, retour, frais modifiés) :

```
POST https://votre-logiciel.mg/webhooks/alefa
Content-Type: application/json
X-Alefa-Event: shipment.updated
X-Alefa-Signature: <HMAC-SHA256 hex du corps brut, clé = secret whsec_…>

{ "event": "shipment.updated", "at": 1794470800000, "shipment": { … même format que ci-dessus … } }
```

Vérification (Node.js) :
```js
import crypto from 'node:crypto';
const ok = crypto.createHmac('sha256', process.env.ALEFA_WEBHOOK_SECRET).update(rawBody).digest('hex') === req.headers['x-alefa-signature'];
```
Répondez `2xx` en moins de 5 secondes. En cas d'échec il n'y a pas de nouvel essai : utilisez `GET /shipments/{ref}` pour resynchroniser.

## Erreurs

`{ "error": "code", "message": "texte lisible" }` avec un code HTTP : `400` données invalides, `401` clé invalide, `404` introuvable, `409` action impossible à ce stade, `413` trop volumineux.

## Exemple complet (curl)
```bash
curl -X POST https://livraison.oasismdg3434.workers.dev/api/v1/shipments \
  -H "X-API-Key: ak_VOTRE_CLE" -H "Content-Type: application/json" \
  -d '{"external_ref":"CMD-1042","declared_value":25000,"description":"Robe taille M",
       "sender":{"address":"Boutique Soa, Analakely","lat":-18.9055,"lng":47.5255},
       "recipient":{"name":"Rasoa","phone":"0341234567","address":"Ankorondrano","lat":-18.884,"lng":47.524}}'

curl https://livraison.oasismdg3434.workers.dev/api/v1/shipments/CMD-1042 -H "X-API-Key: ak_VOTRE_CLE"
```
