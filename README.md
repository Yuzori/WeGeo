# WeGeo

Outil de prospection locale : WeGeo parcourt Google Maps pour trouver **les entreprises qui n'ont pas de site web**, dans la ville et les métiers de votre choix, puis vous aide à les appeler une par une jusqu'à la signature.

Aucune clé d'API, aucun quota, aucun abonnement : un vrai navigateur lit les pages comme le ferait un humain, et tout reste sur votre ordinateur.

---

## Installation

Il faut [Node.js](https://nodejs.org) version 22 ou plus.

```bash
npm install       # dépendances
npm run setup     # télécharge le navigateur utilisé pour le scraping (~150 Mo, une seule fois)
```

## Lancement

```bash
npm run dev
```

Puis ouvrez **http://localhost:5173**.

Pour un usage quotidien, vous pouvez compiler l'interface une fois et ne lancer qu'un seul serveur :

```bash
npm run build
npm start         # tout est servi sur http://localhost:4319
```

---

## Comment ça marche

### 1. Rechercher

Choisissez une **ville** et un ou plusieurs **métiers** (coiffeur, plombier, restaurant…). WeGeo ouvre Google Maps, déroule toute la liste des résultats, et ne garde que les entreprises sans site web. Les fiches apparaissent en direct, avec :

- le **téléphone**, cliquable pour appeler et copiable en un clic ;
- l'**adresse** complète, cliquable pour ouvrir le plan ;
- un lien direct vers la **fiche Google Maps** ;
- la note et le nombre d'avis, utiles pour juger de l'activité du commerce.

La détection se fait en deux temps : WeGeo écarte d'abord les entreprises qui affichent un bouton « Site Web » dans la liste, puis ouvre la fiche de chaque entreprise retenue pour confirmer l'absence de site et récupérer l'adresse et le téléphone exacts.

### 2. Trier

| Onglet | Rôle |
| --- | --- |
| **À trier** | Tout ce qui a été trouvé et pas encore classé. |
| **Favoris** | Votre liste d'appels du jour. |
| **Signés** | Les affaires conclues. |
| **Non conclus** | Les entreprises appelées sans succès. |
| **Historique** | Chaque recherche passée, avec ses résultats et un bouton pour la relancer. |

Le déroulé prévu est simple : pendant la recherche, vous mettez en **favori** tout ce qui vous intéresse. Ensuite, dans l'onglet Favoris, vous appelez les entreprises une par une. Celles que vous signez passent en **Signé**, celles qui refusent passent en **Non conclu** — et dans les deux cas **elles ne réapparaîtront plus dans vos prochaines recherches**. Vous pouvez aussi supprimer définitivement une fiche (deux clics sur la corbeille, par sécurité).

Chaque fiche accepte une **note** libre (objection, date de rappel, nom de l'interlocuteur). Sélectionnez plusieurs fiches avec les cases à cocher pour les classer d'un coup.

### 3. Exporter

Le bouton **Voir le tableur** affiche exactement ce qui sera exporté, puis propose :

- **Excel (.xlsx)** — mise en forme, filtres et liens cliquables ;
- **CSV** — séparateur point-virgule et encodage UTF-8, s'ouvre directement dans Excel français ;
- **Copier pour Google Sheets** — collez ensuite avec `Ctrl+V` dans une feuille, les colonnes se placent toutes seules.

---

## Options de recherche

| Option | Effet |
| --- | --- |
| **Uniquement sans site web** | Le cœur de l'outil. Désactivez-la pour récupérer toutes les entreprises d'un métier. |
| **Compter les pages Facebook comme « sans site »** | Une entreprise dont la seule vitrine est Facebook, Planity ou Doctolib reste une cible : elle est conservée et signalée. |
| **Vérification approfondie** | Ouvre chaque fiche retenue pour obtenir le téléphone et l'adresse exacts. Plus lent, mais nettement plus fiable. À laisser activé. |
| **Masquer les fiches déjà traitées** | Les entreprises signées ou non conclues sont ignorées. |
| **Seulement avec un numéro** | Écarte les fiches impossibles à appeler. |
| **Quadrillage de la ville** | Google ne renvoie qu'environ 120 résultats par recherche. Cette option découpe la ville en secteurs interrogés séparément pour couvrir toute la zone. Indispensable sur une grande ville, inutile sur un village. |
| **Limite par métier** | Plafonne le nombre de fiches inspectées, pour un test rapide. |

Le quadrillage s'appuie sur OpenStreetMap pour délimiter la commune. Comme plusieurs communes françaises sont homonymes, la zone retenue est affichée sous l'option : si ce n'est pas la bonne, précisez le département ou le code postal (« Rumilly 74150 »).

---

## Bon à savoir

- **Une recherche à la fois.** Le navigateur est partagé. En revanche, à l'intérieur d'une recherche, WeGeo explore jusqu'à trois métiers (ou secteurs) simultanément.
- **Durée.** Comptez une dizaine de secondes pour trois métiers dans une petite ville, quelques minutes avec le quadrillage sur une grande ville.
- **Blocages passagers.** Si Google refuse de servir une liste, WeGeo réessaie deux fois après une pause. Si un métier reste illisible, la recherche le signale dans l'historique au lieu de rendre zéro résultat sans explication.
- **Thème sombre.** Le sélecteur en bas de la barre latérale suit par défaut le réglage de votre système.
- **Doublons.** Chaque entreprise est identifiée par son identifiant Google : elle ne sera jamais enregistrée deux fois, même si elle remonte sur plusieurs métiers ou secteurs.
- **Vos données.** Tout est stocké dans `data/wegeo.db` (SQLite), sur votre machine. Sauvegardez ce fichier pour conserver votre prospection.
- **Rechargement de page.** Si vous rechargez pendant un scan, l'interface se rebranche automatiquement sur la recherche en cours.

## Si les résultats deviennent incomplets

Google modifie régulièrement la structure de ses pages. Deux outils de diagnostic affichent ce que WeGeo lit réellement :

```bash
npm run probe -- "coiffeur" "Annecy" 15        # ce qui est lu dans la liste de résultats
npm run probe:place -- "<url d'une fiche>"     # ce qui est lu sur une fiche détaillée
npm run probe:parallel                         # fiabilité de trois explorations simultanées
npm run shots                                  # captures d'écran de l'interface (thèmes clair et sombre)
```

Ajoutez `RAW=1` devant la première commande pour voir le texte brut de chaque carte. Pour observer le navigateur en action, lancez le serveur avec `WEGEO_HEADFUL=1`.

## Réglages techniques

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `PORT` | Port du serveur | `4319` |
| `WEGEO_DB` | Emplacement de la base | `data/wegeo.db` |
| `WEGEO_BROWSER_DIR` | Profil du navigateur | `data/browser` |
| `WEGEO_PASSWORD` | Mot de passe d'accès. **À définir dès que le site est exposé à Internet** | aucun (accès libre) |
| `WEGEO_HEADFUL` | `1` pour afficher le navigateur | désactivé |
| `WEGEO_DEBUG` | `1` pour détailler les erreurs de scraping | désactivé |
| `WEGEO_NO_SANDBOX` | `1` si Chromium tourne en root (conteneur) | désactivé |
| `WEGEO_TASK_CONCURRENCY` | Métiers explorés en parallèle | `3` |
| `WEGEO_DETAIL_CONCURRENCY` | Fiches vérifiées en parallèle | `3` (ou `6` sur un seul métier) |

## Accéder au site à distance

WeGeo n'est pas un site statique : il lui faut un serveur, car il pilote un vrai
Chromium et conserve vos fiches dans une base SQLite. Deux façons d'y accéder
en déplacement.

**Depuis un hébergeur.** Le fichier `render.yaml` décrit le service prêt à
l'emploi sur Render (Docker, disque persistant pour la base). Deux contraintes :
Chromium ne tient pas dans 512 Mo, il faut donc une instance de 2 Go ; et les
recherches partent d'une IP de centre de données, que Google bloque bien plus
volontiers qu'une connexion résidentielle. Définissez `WEGEO_PASSWORD`, sinon
votre prospection est publique.

**Depuis votre machine.** Laissez WeGeo tourner chez vous et ouvrez-y un accès
par un tunnel (`cloudflared tunnel --url http://localhost:4319`). C'est gratuit,
le scraping reste fiable puisqu'il part de votre connexion, et les données ne
quittent pas votre disque. En revanche l'ordinateur doit rester allumé. Là aussi,
définissez `WEGEO_PASSWORD` avant d'ouvrir le tunnel.

## Architecture

```
shared/types.ts        Contrat commun serveur / interface
server/
  index.ts             API Express + flux d'évènements (SSE)
  db.ts                Base SQLite (module natif de Node)
  search-runner.ts     Orchestration : métiers × secteurs, déduplication, filtres
  export.ts            Génération CSV / XLSX
  scraper/
    maps.ts            Pilotage du navigateur et lecture de Google Maps
    parse.ts           Téléphones, adresses, classement des liens
    geo.ts             Géocodage et découpage en secteurs
src/                   Interface React (Vite + Tailwind)
```

## Usage

WeGeo lit des informations publiques affichées par Google Maps, à un rythme modéré, pour un usage professionnel de prospection. Restez raisonnable sur le volume : enchaîner des dizaines de milliers de fiches d'affilée finirait par déclencher un blocage temporaire de Google.
