# Backend Worker Build

## Overview
The worker is compiled with TypeScript before startup in Docker. Runtime code and test code need different compiler
rules, because the tests use Node's strip-types runner with ESM-style `.ts` imports and `import.meta`.

## Key Files
- `backend/tsconfig.json`: build config for emitted worker runtime code.
- `backend/tsconfig.test.json`: no-emit config for worker test typechecking.
- `backend/package.json`: worker scripts and backend typecheck command.
- `docker-compose.yml`: worker startup command used in local development.

## Important Details
- Build compilation excludes `**/*.test.ts` so the worker runtime does not fail on test-only TypeScript syntax.
- Test typechecking uses a separate config with `allowImportingTsExtensions` and ESM module settings.
- The emitted worker entrypoint lives at `backend/dist/backend/worker/index.js`, not `backend/dist/worker/index.js`.
- This happens because TypeScript includes imported files from `shared/`, so the emitted tree keeps the repo-relative
  `backend/...` structure inside `backend/dist`.

## Common Pitfalls
- Pointing Docker at `backend/dist/worker/index.js` will fail even if compilation succeeds.
- Reusing the runtime tsconfig for tests will surface `.ts` import and `import.meta` errors.
- Old emitted test files can remain in `backend/dist` from earlier compiles; they are stale artifacts, not active build
  inputs.

## Validation
- `docker compose up -d worker` should leave the `worker` service running.
- `docker logs --tail 80 saynote-worker-1` should be empty or show runtime activity, not TypeScript compiler errors.

---
Last updated: 2026-04-08
