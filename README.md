# Questkeeper

Questkeeper is a browser-based campaign manager for tabletop role-playing games. Keep campaign notes, quests, and NPCs together in one place.

## Features

- Create and manage multiple campaigns.
- Track quests, their status, prerequisites, and quest givers.
- Keep an NPC codex with roles, locations, and dispositions.
- Track player characters and record which ones attended each session. Each character has an inventory (item, quantity, notes).
- Define your game system per campaign on the Game System page: your own stats (Level, HP, an ability, anything), races and classes. Characters pick a race or class from the list or enter a custom one.
- Review session summaries and the quests and NPCs associated with each session.
- See a campaign dashboard with active quests and the latest session.
- Start with the sample **The Ashen Crown** campaign or create a campaign from scratch.

Campaign data is saved in the browser's local storage. There is no account or server-side storage, so data is local to the browser and profile where it was created.

## Getting started

You will need Node.js and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite to use the app.

## Development commands

```sh
npm run lint   # ESLint (TypeScript, React hooks, accessibility)
npm test       # Run the test suite
npm run build  # Type-check and build for production
npm run preview
```

## Tech stack

- React 18 and TypeScript
- Vite
- React Router
- Zustand with browser local-storage persistence

## Project structure

```text
packages/
  domain/       Pure TypeScript shared by web and server: types, actions, selectors,
                integrity checks, sample campaign (The Ashen Crown), tests
apps/
  web/src/
    store/        Zustand store: thin wrapper around the domain actions, with persistence
    features/     One folder per screen: campaigns, dashboard, sessions, quests, npcs, characters, system
    components/   Shared UI: Panel, Tag, Dialog, ConfirmDialog
    app/          Router and layout (sidebar, campaign route)
    styles/       Design tokens and global CSS
```

This is an npm workspaces monorepo. A backend (`apps/server`) is being added; see the roadmap.

## Architecture notes

- **Domain logic is separate from React.** Everything in `packages/domain` is plain functions that take a campaign and return a new one, so it can be tested without rendering anything. The Zustand store only calls these functions.
- **Entities reference each other by ID.** Sessions point to quests, NPCs and attending characters, and quests point to a giver NPC and prerequisite quests. Stat values on characters and NPCs are keyed by the ID of a per-campaign stat definition, so renaming a stat keeps its values. Races and classes work the same way; deleting one in use turns it into custom text on the affected characters. Related data is looked up with selectors instead of being copied.
- **Consistency is enforced in one place.** Deleting an NPC, quest, character or stat also removes every reference to it. Editing a quest rejects unknown references, self-requirements and prerequisite cycles with a `DomainError` that the forms show inline.
- **The campaign is part of the URL.** Pages live under `/c/:campaignId/...`, so links and refreshes stay correct and the campaign switcher is just navigation.
- **Persistence is defensive.** Data is saved to local storage under a versioned schema. On load it is migrated, dangling references are dropped, and corrupt data falls back to the sample campaign.
- **Components subscribe to narrow slices of the store** to avoid unnecessary re-renders.

## Deployment

Every push to `main` runs tests and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Pull requests run
[`ci.yml`](.github/workflows/ci.yml) (tests + build).

Live demo: https://rednil-rab.github.io/campaign-manager/

One-time setup: in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

Notes:
- The build passes `--base=/<repo-name>/`, and the router reads its `basename` from Vite's `BASE_URL`.
- GitHub Pages has no SPA fallback, so the workflow copies `index.html` to `404.html` to make deep links work.

## Roadmap

- Premade NPC templates that can be copied into any campaign.
