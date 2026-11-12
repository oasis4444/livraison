# Alefa — Livraison à vélo à Antananarivo

Plateforme de livraison inspirée d'inDrive : le **client propose son prix**, les **livreurs à vélo** acceptent ou font une contre-offre, le client choisit, puis **suit son livreur en direct sur la carte**. Un **tableau de bord administrateur** supervise tout.

Une seule application web (PWA installable sur Android / iPhone) qui affiche l'interface selon le rôle du compte : **Client**, **Livreur** ou **Administrateur**. Langues : **Français / Malagasy**.

## Fonctionnalités

| Client | Livreur | Administrateur |
|---|---|---|
| Inscription par téléphone (+261) | Inscription + CIN, validation par l'admin | Tableau de bord du jour (CA, commissions, en cours) |
| Départ / arrivée : GPS, recherche d'adresse, choix sur carte, favoris | Statut disponible / indisponible | **Carte en direct** des livreurs (actualisée toutes les 5 s) |
| Prix conseillé selon la distance + prix libre | Demandes dans un rayon réglable (5 km) | Trajet GPS des 24 dernières heures par livreur |
| Offres et contre-offres des livreurs (note, distance, temps d'arrivée) | Accepter le prix ou contre-proposer (+500 / +1 000 / +2 000 / libre) | Validation, suspension, refus des comptes |
| Augmenter son prix pendant la recherche | Partage GPS toutes les 5 s pendant le service uniquement | Suivi de toutes les livraisons, annulation, itinéraire |
| Suivi GPS du livreur + itinéraire + heure d'arrivée | Itinéraire vélo + ouverture dans Google Maps | Commission **%** ou **abonnement** (modifiable) |
| Appel, messagerie | Récupération puis **livraison validée par code PIN** | Soldes livreurs, versements, paiements Mobile Money à confirmer |
| Espèces, MVola, Orange Money, Airtel Money | Revenus du jour / semaine, solde, opérations | Réclamations, **SOS**, alertes automatiques |
| Livraison programmée, codes promo, compte entreprise | Désistement, SOS, réclamation | Rapports jour/semaine/mois/année, export Excel (CSV) et PDF |
| Historique, reçu imprimable, évaluation | Notifications temps réel (son + vibration) | Zones de service, codes promo, tarifs, journal d'audit |

**Sécurité et anti-abus** : mots de passe PBKDF2-SHA256, verrouillage après 5 échecs, sessions révocables, rôles et permissions côté serveur, PIN de livraison invisible pour le livreur, positions des livreurs arrondies (~100 m) avant attribution, attribution atomique (pas de double livreur), protection CSRF, en-têtes CSP, limites de demandes simultanées, dette maximale livreur. Alertes automatiques : saut GPS > 70 km/h, livraison loin de la destination ou trop rapide, annulations répétées, PIN erroné répété, note ≤ 2.

## Architecture

| Élément | Choix |
|---|---|
| Hébergement | Cloudflare Workers (plan gratuit possible), déployé depuis GitHub |
| Base de données | Cloudflare D1 (SQLite) — `alefa-livraison-prod` |
| Interface | HTML/CSS/JavaScript sans framework (PWA), aucune dépendance npm |
| Carte | Leaflet + OpenStreetMap (fond CARTO Voyager) |
| Itinéraires vélo | OSRM (routing.openstreetmap.de, profil vélo), repli ligne droite |
| Adresses | Nominatim (OpenStreetMap), limité à Madagascar |
| Temps réel | Actualisation toutes les 4–5 s (GPS, offres, messages, notifications) |
| Maintenance | Tâche horaire : purge des trajets (> 30 j, réglable), expiration des demandes |

```
src/worker.js        API (≈ 50 routes) + tâches planifiées
src/lib.js           sécurité, géographie, tarifs, CSV
migrations/          schéma D1
public/              application (index.html, js/, css/, PWA)
tests/api.test.mjs   scénario API complet (Analakely → Ankorondrano)
tests/e2e.mjs        scénario navigateur client + livreur + admin
tools/               serveur local, création d'administrateur
```

## Déploiement (Cloudflare + GitHub)

1. La base D1 `alefa-livraison-prod` est déjà créée et initialisée (schéma + compte administrateur).
2. Cloudflare → **Workers & Pages → Create → Import a repository** → choisir ce dépôt.
   - Build command : *(vide)*
   - Deploy command : `npx wrangler deploy`
3. Chaque `git push` sur `main` redéploie automatiquement.
4. Ouvrir l'adresse `https://livraison.<compte>.workers.dev`, se connecter en administrateur, **changer le mot de passe** (Profil), puis renseigner les numéros MVola / Orange Money / Airtel Money dans **Paramètres**.

Nouvel administrateur ou mot de passe oublié :
```bash
node tools/create-admin.mjs 0341234567 "Nom" "MotDePasseSolide"
npx wrangler d1 execute alefa-livraison-prod --remote --command "<SQL affiché>"
```

## En local

```bash
node tools/dev-server.mjs          # http://localhost:8787 (base SQLite dev.db)
npm test                           # tests API
node tests/e2e.mjs                 # test navigateur (Playwright)
```

## Limites actuelles et suite

- **Paiement Mobile Money** : le client paie au numéro marchand affiché, l'admin confirme la réception. L'encaissement automatique demande un contrat API avec MVola / Orange / Airtel.
- **Connexion par SMS (OTP)** : non incluse (nécessite un fournisseur SMS) ; connexion par téléphone + mot de passe.
- **Notifications** : temps réel quand l'application est ouverte (son, vibration, notification du navigateur). Les notifications push application fermée (Firebase) sont prévues avec les applications natives.
- **GPS en arrière-plan** : un navigateur suspend le GPS quand l'écran est éteint ; l'app garde l'écran allumé pendant le service. Une application native (Flutter, comme prévu au cahier des charges) lèvera cette limite et pourra réutiliser la même API.
- **Livraison multi-destinations** et **photo de preuve** : à ajouter.
