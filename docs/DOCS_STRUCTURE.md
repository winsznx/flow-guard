# FlowGuard Docs Authoring Guide (Internal)

This file is an internal writing standard for contributors. It is not a product spec and should not be used as API truth.

## 1. Source of Truth

When docs and code differ, code wins.

- Backend routes: `backend/src/index.ts` + `backend/src/api/*.ts`
- Contract behavior: `contracts/core/**/*.cash`
- Frontend behavior/UX: `frontend/src/pages/**` and `frontend/src/components/**`
- Data model: `backend/src/database/schema.ts`

## 2. Documentation Layers

Use these sections consistently:

- `concepts/*`: protocol behavior and mental model
- `guides/*`: step-by-step user/dev workflows
- `api/*`: concrete request/response reference
- `app/*`: product UI behavior and navigation
- `reference/*`: technical details and contract/state docs

## 3. Production vs Prototype Labeling

Every page that mentions partially implemented features must explicitly label them:

- `Production`: available in current public API/UI
- `Contract-level only`: function exists in covenant but route/UI may not expose it
- `Prototype`: scaffolding exists, not hardened for production
- `Planned`: roadmap item only

Never present prototype/planned behavior as currently live.

## 4. API Accuracy Rules

Before merging API docs:

1. Verify route path and method in `backend/src/api/*.ts`
2. Verify request body names and required headers
3. Verify response shape (`success`, payload keys, errors)
4. Verify build/confirm flow for on-chain actions
5. Confirm whether `wcTransaction` is returned

If route is absent, do not document it as available.

## 5. Writing Standards

- Use direct, implementation-grounded wording
- Avoid competitor/comparison commentary in product docs
- Avoid claims like "fully trustless" or "automatic" unless implemented end-to-end
- Keep examples copy-pasteable and current
- Prefer concrete status names and exact endpoint paths

## 6. Change Checklist for Contributors

When adding or editing docs:

- Update `docs/mint.json` navigation only if page should be public
- Mark non-public internal notes clearly as internal
- Keep one canonical roadmap page (`docs/roadmap.mdx`)
- Re-run route sweep (`rg '/api/' docs`) and compare against backend routes

## 7. Known Internal Notes

- `docs/ROADMAP.md` is an internal redirect note; canonical roadmap is `docs/roadmap.mdx`.
