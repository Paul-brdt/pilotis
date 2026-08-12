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

| Rôle | Usage principal |
| --- | --- |
| Administrateur | Paramétrage, utilisateurs et accès complet |
| Bureau / chargé d’affaires | Pilotage, validations et gestion des référentiels |
| Conducteur de travaux | Suivi opérationnel, personnel et validations |
| Chef de chantier | Présences et saisies terrain |
| Magasinier | Articles, stocks, emplacements et équipements |
| Consultation | Accès en lecture selon les droits accordés |

Les autorisations sont contrôlées côté interface, côté API et dans Supabase grâce aux politiques RLS.

## Architecture technique

| Composant | Technologie |
| --- | --- |
| Interface et API | Next.js 16 — App Router |
| Interface utilisateur | React 19, TypeScript et CSS |
| Base de données | PostgreSQL via Supabase |
| Authentification | Supabase Auth |
| Contrôle d’accès | Supabase Row Level Security |
| Génération PDF | `pdf-lib` |
| Hébergement | Vercel |

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
├── extra-works.tsx         Travaux supplémentaires
├── magasin.tsx             Engins, outillage et moyens d’accès
├── personnel.tsx           Présence du matin et horaires
├── stock.tsx               Stock, mouvements et référentiels
└── page.tsx                Application et navigation principales

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

Les fichiers du dossier `supabase/migrations` ajoutent notamment :

- la présence journalière et les horaires paramétrables ;
- les permissions du catalogue de stock ;
- les emplacements, transferts et inventaires ;
- les engins, l’outillage et les moyens d’accès ;
- les travaux supplémentaires ;
- les familles de stock configurables.

### Important

Les migrations actuellement présentes sont des **migrations complémentaires**. Elles supposent que le schéma métier initial existe déjà, notamment les tables `projects`, `project_memberships`, `profiles`, `people`, `tasks`, `zones`, `stock_items` et `stock_movements`.

Avant d’utiliser une nouvelle base Supabase, il faut donc restaurer le schéma initial du projet puis appliquer les migrations dans leur ordre chronologique.

Toutes les tables exposées doivent conserver la Row Level Security activée. N’utilisez jamais une clé `service_role` dans une variable `NEXT_PUBLIC_*` ou dans du code exécuté par le navigateur.

## Scripts disponibles

| Commande | Description |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement |
| `npm run build` | Crée une version de production et vérifie TypeScript |
| `npm run start` | Démarre la version compilée |
| `npm run lint` | Exécute ESLint |
| `npm test` | Exécute actuellement la compilation de contrôle |

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
