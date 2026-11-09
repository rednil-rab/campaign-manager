# Contributing

## Development setup

Use Node.js 22 and npm. Install dependencies from the repository root:

```sh
npm ci
```

For local development, follow the environment setup in the README. The test suite does not require a database.

## Before opening a pull request

Run the repository checks from the root:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Keep changes focused, include tests for behavior changes, and update relevant documentation when behavior or setup changes. Do not commit credentials or local `.env` files.

## Pull requests

Open a pull request against `main` and describe the problem, the change, and how it was verified. CI runs linting, type-checking, tests, and a production build for pull requests. Resolve any failing checks before merging.

Changes merged or pushed to `main` are deployed to Render; avoid merging changes that are not ready to deploy.
