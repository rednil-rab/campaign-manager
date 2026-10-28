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
- Share a character with its player: the **Share** button creates a private link that opens a sign-up-free page where the player sees only their own sheet and edits their inventory and player notes. The DM's private notes and the rest of the campaign are never exposed. Links can be regenerated or revoked.

Your campaigns are stored on the server in MongoDB and belong to your account, so they follow you across browsers and devices.

## Getting started

You will need Node.js 22 and npm, plus a MongoDB instance (a local install or a free MongoDB Atlas cluster).

```sh
npm install
cp apps/server/.env.example apps/server/.env   # set JWT_SECRET (32+ characters) and MONGODB_URI
npm run dev -w @questkeeper/server              # API on http://localhost:3000
npm run dev -w @questkeeper/web                 # Vite dev server; proxies /api to :3000
```

Open the URL Vite prints, create an account, and add the sample campaign or start a new one.

To run it the way production does (one process serving both the API and the built app):

```sh
npm run build
npm start      # http://localhost:3000, reads apps/server/.env
```

## API

Everything is under `/api`. Accounts use an httpOnly session cookie.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET|POST /campaigns`, `PATCH|DELETE /campaigns/:id`
- `PUT|DELETE /campaigns/:id/<kind>/:entityId`, where `<kind>` is `characters`, `npcs`, `quests`, `sessions`, `stats`, `races` or `classes`. Each returns the updated campaign.
- `GET /campaigns/:id/shares`, `POST|DELETE /campaigns/:id/characters/:characterId/share`: list, create/regenerate and revoke player links.
- `GET|PUT /play/:token` (no login): the player's view of one character, and an update of its inventory and player notes. The token is 256 random bits, only that character is reachable, responses are `no-store`/`noindex`, and requests are rate limited per IP. Anyone holding the link can edit, so treat it like a password.

Each campaign is one MongoDB document with a version number. The server loads it, applies a domain function from `@questkeeper/domain`, and saves it only if nobody changed it in between (it retries, then answers 409). Input is validated and copied field by field, and every query is scoped to the signed-in owner.

## Development commands

```sh
npm run lint        # ESLint (TypeScript, React hooks, accessibility)
npm run typecheck   # Type-check every workspace
npm test            # Run the test suite (no database needed)
npm run build       # Type-check and build the web app
```

## Tech stack

- React 18, TypeScript, Vite, React Router, Zustand
- Express 5 and MongoDB
- Shared domain package (`@questkeeper/domain`) used by both the web app and the server

## Project structure

```text
packages/
  domain/       Pure TypeScript shared by web and server: types, actions, selectors,
                integrity checks, sample campaign (The Ashen Crown), tests
apps/
  server/src/
    auth/         Registration, login, cookie sessions
    campaigns/    Repositories (Mongo and in-memory), input parsing, routes, optimistic-lock service
    users/        User repositories
  web/src/
    api/          Fetch client
    store/        Zustand stores: campaigns (API-backed) and auth
    features/     One folder per screen: auth, campaigns, dashboard, sessions, quests, npcs, characters, system
    components/   Shared UI: Panel, Tag, Dialog, ConfirmDialog
    app/          Router and layout (sidebar, auth guard, campaign route)
    styles/       Design tokens and global CSS
```

This is an npm workspaces monorepo.

## Architecture notes

- **Domain logic is separate from React and from Express.** Everything in `packages/domain` is plain functions that take a campaign and return a new one, so it is tested without rendering or a database. The server and the web app share it.
- **The server is the source of truth.** The web store sends one change and replaces its copy of the campaign with the server's response, so the screen never drifts from what was saved.
- **Entities reference each other by ID.** Sessions point to quests, NPCs and attending characters, and quests point to a giver NPC and prerequisite quests. Stat values are keyed by the ID of a per-campaign stat definition, so renaming a stat keeps its values. Deleting a race or class in use turns it into custom text on the affected characters. Related data is looked up with selectors instead of being copied.
- **Consistency is enforced in one place.** Deleting an NPC, quest, character or stat also removes every reference to it. Editing a quest rejects unknown references, self-requirements and prerequisite cycles with a `DomainError`, which the forms show inline.
- **The campaign is part of the URL.** Pages live under `/c/:campaignId/...`, so links and refreshes stay correct.
- **Components subscribe to narrow slices of the store** to avoid unnecessary re-renders.

## Deployment

The app is deployed to [Render](https://render.com) as a single web service that serves the API and the built web app from the same origin, so no CORS is needed. It is described in [`render.yaml`](render.yaml). Pull requests and pushes to `main` run [`ci.yml`](.github/workflows/ci.yml) (lint, type-check, tests, build).

One-time setup:

1. Create a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster and a database user. Under **Network Access**, allow connections from Render (for a free portfolio project, `0.0.0.0/0`).
2. In Render choose **New → Blueprint** and select this repository. It reads `render.yaml`.
3. When prompted, set `MONGODB_URI` to the Atlas connection string. `JWT_SECRET` is generated for you.
4. Render deploys on every push to `main`.

Notes:
- On the free plan the service sleeps when idle, so the first request after a pause is slow.
- The server runs the TypeScript sources with `tsx`; there is no separate server build.
- Changing `JWT_SECRET` signs everyone out.

## Roadmap

- Premade NPC templates that can be copied into any campaign.
- Rate limiting on the sign-in endpoints.
- Rename campaigns from the UI (the API already supports it).
