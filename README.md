# Souche

Une visionneuse d’arbre généalogique moderne pour les fichiers **GEDCOM** (`.ged`).
Le fichier est lu dans le navigateur : rien n’est envoyé sur un serveur.

![Arbre centré sur une personne, avec sa fiche ouverte](docs/arbre.jpg)

![Éventail des ancêtres, survol d’une lignée](docs/eventail.jpg)

*Captures réalisées avec la famille fictive fournie en exemple.*

## Ce que ça affiche

- **Arbre** : ascendants au-dessus, descendants en dessous, conjoints et fratrie (demi-frères et demi-sœurs compris) autour de la personne centrale. Double-clic pour recentrer, avec une transition animée. Les parents manquants apparaissent en pointillés, pour qu’on voie où chercher.
- **Éventail** : les ancêtres en anneaux, numérotés Sosa. Le survol d’une case suit la lignée jusqu’au centre. Les cases vides marquent les ancêtres encore inconnus.
- **Chronologie** : chaque vie sur une frise, avec les mariages et les grandes périodes historiques. Les dates approximatives (« vers », « avant ») s’estompent au lieu d’être affichées comme certaines.
- **Répertoire** : toutes les personnes, triables et filtrables par nom, lieu, métier ou lien de parenté.
- **À compléter** : les ancêtres directs sans parents connus (les « pistes de recherche »), les incohérences de dates (enfant né après le décès du père, parent trop jeune…), les notes marquées « à confirmer » et le taux de complétude.
- **Fiche personne** : événements avec lieux et sources, parents, unions, enfants, fratrie, notes (avec liens cliquables).

Les couleurs suivent la lignée : bleu pour le côté paternel, framboise pour le côté maternel, ocre pour la descendance, gris pour les alliances. Le lien de parenté est calculé en français (« cousine issue de germain », « oncle à la mode de Bretagne », « belle-mère »…) depuis une personne de référence, modifiable dans la fiche.

## Utilisation

```sh
npm install
npm run dev
```

Ouvrez ensuite l’adresse affichée et chargez un fichier `.ged`, ou cliquez sur « Voir un exemple ».

### Suivre le fichier pendant qu’on l’écrit

Pour voir l’arbre se mettre à jour à chaque enregistrement du `.ged`, deux options :

1. **Mode développement** (tous navigateurs) : créez un fichier `.env.local` à côté de `package.json`.

   ```sh
   SOUCHE_FILE=C:/chemin/vers/arbre.ged
   ```

   `npm run dev` charge alors ce fichier directement et le relit dès qu’il change, y compris sur un lecteur réseau.

2. **Dans le navigateur** : avec Chrome ou Edge, « Ouvrir un fichier .ged » garde un accès au fichier et le relit à chaque modification. Sous Brave, activez d’abord `brave://flags/#file-system-access-api`. Ailleurs, le fichier est lu une seule fois.

### Version statique

```sh
npm run build
```

Le dossier `dist/` peut être hébergé n’importe où (GitHub Pages, un NAS…) : tout se passe dans le navigateur.

## Confidentialité

L’arbre n’est jamais envoyé ni stocké en ligne. Le navigateur ne mémorise que des préférences (thème, profondeur de l’arbre, personne de référence) et, sous Chrome ou Edge, le lien vers le dernier fichier ouvert.

Le `.gitignore` exclut tous les fichiers `.ged`, sauf `public/exemple.ged`, qui est une famille inventée.

## Développement

```sh
npm test           # analyseur GEDCOM, dates, parentés, mise en page
npx tsc -b         # typage
```

Pour vérifier la mise en page sur votre propre arbre sans le versionner :

```sh
SOUCHE_FILE=/chemin/vers/arbre.ged npx vitest run own-file
```

Formats pris en charge : GEDCOM 5.5 / 5.5.1 en UTF-8 ou ANSI, dates GEDCOM (`ABT`, `BEF`, `AFT`, `BET … AND …`, `FROM … TO …`, `EST`, `CAL`), notes en ligne ou en enregistrement (`@N1@`), sources et citations.

## Licence

MIT
