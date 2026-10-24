# Pilotis

Application web de pilotage de chantier dédiée aux travaux d’électricité industrielle.

Pilotis centralise le suivi du personnel, les présences, les affectations journalières, les feuilles d’heures intérimaires, les budgets, le magasin et les équipements de chantier dans une interface unique, utilisable sur ordinateur et mobile.

> Version actuelle : **0.1.0**  
> Application de production : [pilotis-0-1.vercel.app](https://pilotis-0-1.vercel.app)

## Fonctionnalités

### Vue d’ensemble

- indicateurs par jour, semaine, mois ou période personnalisée ;
- synthèse des heures et de l’avancement ;
- points d’attention opérationnels ;
- alertes liées aux présences, aux stocks et aux vérifications des équipements.

### Personnel

- gestion des équipes internes et intérimaires ;
- qualifications configurables ;
- rattachement des intérimaires à leur agence ;
- présence du matin enregistrée en masse ;
- statuts d’absence sans commentaire obligatoire ;
- horaires théoriques configurables du lundi au dimanche ;
- calcul automatique des heures normales et supplémentaires ;
- correction manuelle des heures supplémentaires ;
- affectation journalière des heures aux tâches et aux zones ;
- génération et historique des feuilles de pointage intérimaires ;
- export des feuilles au format PDF.

Les feuilles d’heures intérimaires sont alimentées par la présence du matin. Les semaines ouvertes utilisent les données à jour ; les semaines terminées conservent leur instantané historique.

### Chantier

- tâches et budgets d’heures ;
- zones de travail et répartition des budgets ;
- suivi de l’avancement ;
- carnet de câbles ;
- travaux supplémentaires avec objet obligatoire et heures, matériel et commentaires facultatifs.

### Magasin

- catalogue d’articles et familles configurables ;
- emplacements de stockage configurables ;
- entrées, sorties, transferts et inventaires ;
- stock distinct par emplacement ;
- seuils d’alerte et stock négatif justifié ;
- historique complet des mouvements ;
- export du stock ;
- gestion de l’électroportatif et de l’outillage ;
- affectation d’un outil à une personne, sans zone obligatoire ;
- gestion des engins de location ;
- références internes, agences et périodes de location ;
- suivi des dates de VIC et alertes d’échéance ;
- gestion des moyens d’accès, notamment PIRL et échafaudages ;
- documents associés aux équipements.

### Administration

- profils et rôles utilisateurs ;
- changement de mot de passe et déconnexion ;
- paramètres du chantier et de l’application ;
- horaires de travail ;
- gestion des qualifications ;
- personnalisation de l’identité du chantier ;
- contrôle des accès par chantier avec Row Level Security.

## Rôles

| Rôle                       | Usage principal                                   |
| -------------------------- | ------------------------------------------------- |
| Administrateur             | Paramétrage, utilisateurs et accès complet        |
| Bureau / chargé d’affaires | Pilotage, validations et gestion des référentiels |
| Conducteur de travaux      | Suivi opérationnel, personnel et validations      |
| Chef de chantier           | Présences et saisies terrain                      |
| Magasinier                 | Articles, stocks, emplacements et équipements     |
| Consultation               | Accès en lecture selon les droits accordés        |

Les autorisations sont contrôlées côté interface, côté API et dans Supabase grâce aux politiques RLS.

## Architecture technique

| Composant             | Technologie                 |
| --------------------- | --------------------------- |
| Interface et API      | Next.js 16 — App Router     |
| Interface utilisateur | React 19, TypeScript et CSS |
| Base de données       | PostgreSQL via Supabase     |
| Authentification      | Supabase Auth               |
| Contrôle d’accès      | Supabase Row Level Security |
| Génération PDF        | `pdf-lib`                   |
| Hébergement           | Vercel                      |

```text
Navigateur
   ├── Interface Next.js
   ├── Routes API Next.js
   └── Client Supabase authentifié
             ├── PostgreSQL + RLS
             ├── Auth
             └── Storage pour les documents
```

## Structure du dépôt

```text
app/
├── api/                    Routes serveur
├── views/                  Un fichier par écran
│   ├── dashboard.tsx       Vue d’ensemble
│   ├── personnel.tsx       Présence du matin et horaires
│   ├── pointage.tsx        Affectation journalière
│   ├── teams.tsx           Équipes
│   ├── interim.tsx         Intérim et feuilles d’heures
│   ├── tasks.tsx           Tâches et budgets
│   ├── zones.tsx           Zones de travail
│   ├── cables.tsx          Carnet de câbles
│   ├── extra-works.tsx     Travaux supplémentaires
│   ├── stock.tsx           Stock, mouvements et référentiels
│   ├── magasin.tsx         Engins, outillage et moyens d’accès
│   └── settings.tsx        Paramètres
├── ui/                     Composants d’interface réutilisables
├── shared.ts               Types et rôles partagés
└── page.tsx                Authentification et navigation principales

lib/
├── supabase.ts             Client Supabase
└── timesheet.ts            Modèle des feuilles intérimaires

supabase/migrations/        Évolutions SQL versionnées
public/                     Ressources statiques
vercel.json                 Configuration Vercel
```

## Prérequis

- Node.js **22.13.0 ou version ultérieure** ;
- npm ;
- un projet Supabase ;
- un projet Vercel pour le déploiement cloud.

## Installation locale

```bash
git clone https://github.com/Paul-brdt/pilotis.git
cd pilotis
npm install
```

Créer ensuite un fichier `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=votre_cle_publique
```

Puis démarrer l’application :

```bash
npm run dev
```

L’application est accessible par défaut sur [http://localhost:3000](http://localhost:3000).

## Configuration Supabase

Le dossier `supabase/` contient tout ce qu’il faut pour reconstruire la base :

- `migrations/` : l’historique complet du schéma, du schéma initial aux règles d’accès par chantier, avec les numéros de version enregistrés dans la base de production ;
- `functions/admin-users/` : la fonction de création et de gestion des comptes utilisateurs, réservée à l’administrateur.

Pour une nouvelle base, appliquer les migrations dans l’ordre chronologique, puis déployer la fonction `admin-users`.

### À savoir

- Les données de départ (`seed_reference_data`) sont des données de démonstration ; les noms des personnes y sont anonymisés dans la version publique.
- `stock_families_management` et un index de `stock_locations_inventory` ont été appliqués directement en base, hors historique des migrations ; chaque fichier le signale en tête.

Toutes les tables exposées doivent conserver la Row Level Security activée : la lecture est réservée aux membres du chantier et l’écriture aux rôles concernés. N’utilisez jamais une clé `service_role` dans une variable `NEXT_PUBLIC_*` ou dans du code exécuté par le navigateur.

## Scripts disponibles

| Commande         | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Démarre le serveur de développement                  |
| `npm run build`  | Crée une version de production et vérifie TypeScript |
| `npm run start`  | Démarre la version compilée                          |
| `npm run lint`   | Exécute ESLint                                       |
| `npm run format` | Formate le code avec Prettier                        |
| `npm test`       | Exécute actuellement la compilation de contrôle      |

## Déploiement Vercel

1. Importer le dépôt GitHub dans Vercel.
2. Sélectionner le framework Next.js.
3. Ajouter les variables d’environnement Supabase.
4. Appliquer les migrations nécessaires dans Supabase.
5. Déployer la branche `main`.

Chaque mise à jour de `main` déclenche automatiquement un nouveau déploiement de production lorsque l’intégration GitHub de Vercel est active.

## Sécurité

- ne jamais commiter de mot de passe ni de clé secrète ;
- utiliser uniquement la clé publique Supabase dans le navigateur ;
- conserver les politiques RLS lors de chaque évolution du schéma ;
- vérifier les droits dans les routes API pour toute opération sensible ;
- utiliser des comptes nominatifs et changer les mots de passe temporaires ;
- tester les migrations sur un environnement distinct avant la production.

Pour signaler une vulnérabilité, évitez une issue publique contenant des données sensibles et contactez directement le propriétaire du dépôt.

## État du projet

Pilotis est en développement actif. Certaines parties historiques de l’interface peuvent encore contenir des données de démonstration ou nécessiter une consolidation avant une utilisation multi-chantiers complète.

## Licence

Aucune licence open source n’est actuellement fournie avec ce dépôt. Tous droits réservés au propriétaire du projet.
