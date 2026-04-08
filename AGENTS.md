# SayNote Working Rules

These rules apply to the whole repository unless a deeper `AGENTS.md` overrides them.

## Core Philosophy

Code is for humans first. Optimize for readability, modularity, and maintainability over cleverness.
Preserve idiomatic framework patterns, and improve legacy code incrementally instead of forcing
broad rewrites.

## Docker Environment

All development, testing, linting, type-checking, builds, and database commands must run inside
Docker. Do not run project commands directly on the host.

- Start the stack: `docker compose up -d`
- Run the app stack: `docker compose up`
- Open a shell: `docker compose exec saynote bash`
- Run all tests: `docker compose exec saynote npm test`
- Run frontend tests: `docker compose exec saynote npm run -w frontend test`
- Run backend tests: `docker compose exec saynote npm run -w backend test`
- Run lint: `docker compose exec saynote npm run lint`
- Run type-checks: `docker compose exec saynote npm run typecheck`
- Run DB bootstrap: `docker compose exec saynote npm run db:bootstrap`
- Run DB migrations: `docker compose exec saynote npm run db:migrate`

For targeted tests, enter the container shell first and run the narrowest command from the
relevant workspace directory.

## Code Size Limits

- Max 100 lines per file, excluding blank lines and comments.
- Max 10 lines per function or method. Extract named helpers when logic grows.
- Max 120 characters per line.
- One class per file when using classes. Match filenames to class names in snake case.

When legacy files exceed these limits, improve them incrementally while touching nearby code.

## Architecture And OOP

- Prefer classes and small objects for domain logic unless the framework strongly favors a
  different shape.
- React and Next route modules may stay idiomatic and functional when that is the clearer choice.
- Give each class a single responsibility that can be described in one sentence.
- Prefer composition over inheritance.
- Depend on abstractions such as interfaces, protocols, or narrow typed contracts.
- Inject dependencies through constructors or explicit factories.
- Do not instantiate meaningful dependencies deep inside classes when they can be passed in.
- Avoid runtime-mutable module globals.
- Keep module dependencies acyclic.

## Modularity And Readability

- Keep code modular and DRY. Extract repeated logic into shared helpers or collaborators.
- Name things explicitly. Prefer `transcribed_text` over `txt`.
- Avoid clever tricks and opaque abbreviations.
- Comments should explain why, not restate what.
- Keep control flow flat. Prefer early returns over deep nesting.
- Keep public interfaces explicit. Avoid `*args` or `**kwargs` style catch-alls in public APIs.

## Testing Discipline

TDD is required for production code changes.

1. Write or update a failing test first.
2. Make the smallest change that turns the test green.
3. Refactor with tests still green.

Every production change must have automated test coverage in the same PR. Every bug fix needs a
regression test.

## Enforcement Defaults

When reviewing or writing code, check these by default:

- File scope stays small and focused.
- Function and method scope stays small and focused.
- Line width remains readable.
- Domain logic follows OOP-first design unless there is a clear idiomatic exception.
- Repeated logic is extracted instead of copied.
- New behavior ships with tests.

## Knowledge Retention

After non-trivial feature exploration, prefer documenting discoveries in
`docs/features/<feature-name>.md`.

Trigger documentation when work spans roughly three or more files, requires multi-step reasoning,
or exposes conventions future sessions would otherwise have to rediscover.

Feature notes should include:

- overview and purpose
- key files and architecture flow
- core concepts and important scenarios
- conventions, pitfalls, and integration points
- testing strategy
- likely future improvements when relevant
- last-updated date

## Extraction And Reuse

When a workflow or rule repeats, extract it instead of restating it manually:

- repeated workflow: create or update a skill in `~/.codex/skills/`
- path-specific rule: add or refine a scoped `AGENTS.md`
- repeated manual check: automate it in repo scripts or CI
- stable personal preference: keep it in `~/.codex/AGENTS.md`
