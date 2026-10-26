# Questkeeper

Questkeeper is a browser-based campaign manager for tabletop role-playing games. Keep campaign notes, quests, and NPCs together in one place.

## Features

- Create and manage multiple campaigns.
- Track quests, their status, prerequisites, and quest givers.
- Keep an NPC codex with roles, locations, and dispositions.
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
src/
  domain/       Pure TypeScript: types, actions, selectors, integrity checks, tests
  store/        Zustand store: thin wrapper around the domain actions, with persistence
  data/         Sample campaign (The Ashen Crown)
  features/     One folder per screen: campaigns, dashboard, sessions, quests, npcs
  components/   Shared UI: Panel, Tag, Dialog, ConfirmDialog
  app/          Router and layout (sidebar, campaign route)
  styles/       Design tokens and global CSS
```

## Architecture notes

- **Domain logic is separate from React.** Everything under `src/domain` is plain functions that take a campaign and return a new one, so it can be tested without rendering anything. The Zustand store only calls these functions.
- **Entities reference each other by ID.** Sessions point to quests and NPCs, and quests point to a giver NPC and prerequisite quests. Related data is looked up with selectors instead of being copied.
- **Consistency is enforced in one place.** Deleting an NPC or quest also removes every reference to it. Editing a quest rejects unknown references, self-requirements and prerequisite cycles with a `DomainError` that the forms show inline.
- **The campaign is part of the URL.** Pages live under `/c/:campaignId/...`, so links and refreshes stay correct and the campaign switcher is just navigation.
- **Persistence is defensive.** Data is saved to local storage under a versioned schema. On load it is migrated, dangling references are dropped, and corrupt data falls back to the sample campaign.
- **Components subscribe to narrow slices of the store** to avoid unnecessary re-renders.

## Roadmap

- Premade NPC templates that can be copied into any campaign.
