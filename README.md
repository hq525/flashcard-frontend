# Flashcard Frontend

React SPA for the [Flashcard-Lambda](../Flashcard-Lambda) Go backend: browse
categories → decks → cards, edit cards (multi-section answers, images, tags),
and study decks (reveal answers, mark cards memorized).

## Stack

Vite + React 19 + TypeScript, Tailwind CSS v4, react-router v7,
TanStack Query v5. Tests: Vitest + React Testing Library + MSW.

## Setup

```bash
npm install
cp .env.example .env.local   # then edit values
```

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (`http://localhost:8080` for `go run ./cmd/server`) |
| `VITE_API_KEY` | Sent as `X-Api-Key` on every request; leave empty for local dev, required for the deployed API Gateway stage |

## Scripts

```bash
npm run dev        # dev server
npm test           # run the test suite (no backend needed; MSW fakes it)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Deployment (AWS Amplify Hosting)

**Prerequisites:** an AWS account, this repo pushed to GitHub, and the backend already deployed (see the [Flashcard-Lambda README](../Flashcard-Lambda/README.md#deployment-sam) for how to get its API URL and key).

**First-time setup**, in the AWS Console under Amplify → Hosting:

1. **New app → Host web app**, connect this GitHub repo and branch. Amplify auto-detects the `amplify.yml` already in the repo (installs Node 22, runs `npm ci && npm run build`, deploys `dist/`).
2. **App settings → Environment variables**, add:

   | Variable | Value |
   |---|---|
   | `VITE_API_BASE_URL` | The deployed API Gateway stage URL, e.g. `aws cloudformation describe-stacks --stack-name <stack> --query 'Stacks[0].Outputs'` |
   | `VITE_API_KEY` | `aws apigateway get-api-keys --include-values --query 'items[].{name:name,value:value}'` |

3. **App settings → Rewrites and redirects** — this is a client-side-routed SPA (react-router), so every path needs to fall back to `index.html`:

   | Source address | Target address | Type |
   |---|---|---|
   | `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json)$)([^.]+$)/>` | `/index.html` | `200 (Rewrite)` |

4. **Save and deploy.**

**Subsequent deploys:** push to the connected branch — Amplify rebuilds and redeploys automatically.

## Structure

- `src/api/` — backend contract: config, fetch client, types, resource functions, TanStack Query hooks
- `src/components/` — shared UI (buttons, dialogs, toasts, breadcrumbs, form dialog)
- `src/features/` — one folder per screen (categories, decks, cards, card-editor, study, tags)
- `src/test/` — MSW server, fixtures, render helper

Design spec: `docs/superpowers/specs/2026-07-06-flashcard-frontend-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-06-flashcard-frontend.md`
