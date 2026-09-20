# Flashcard Frontend

React SPA for the [Flashcard-Lambda](https://github.com/hq525/Flashcard-Lambda) Go backend: browse categories, decks and cards, edit answers, images and tags, and study with spaced repetition. This deployment is a private library for one owner.

## Reviewing the project

The source, tests and architecture documentation are available for portfolio review. The deployed library requires its owner's login. `npm test` runs against synthetic fixtures without AWS credentials; use an isolated deployment and sample study content for demos or screenshots.

## Setup

Use the reviewed Node 22.23.2 runtime pinned in `.nvmrc`:

```bash
nvm install
nvm use
npm ci
cp .env.example .env.local
# Fill in the public configuration below.
npm run dev
```

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | Backend stage URL; `http://localhost:8080` is allowed only in development on loopback |
| `VITE_AUTH_AUTHORITY` | Cognito pool issuer, `https://cognito-idp.ap-southeast-1.amazonaws.com/<pool-id>` |
| `VITE_AUTH_CLIENT_ID` | Public Cognito app client ID, with **no client secret** |
| `VITE_AUTH_DOMAIN` | Cognito hosted login origin, including `https://` |
| `VITE_MEDIA_ORIGIN` | Exact HTTPS origin serving signed images, with no trailing slash or path |

These values are public and appear in the compiled application. Never configure browser API keys or client secrets. All settings are required; missing or invalid settings keep the library closed. Environment files are ignored except `.env.example`.

Login uses [`oidc-client-ts`](https://authts.github.io/oidc-client-ts/) authorization code plus PKCE. Tokens and login state use `sessionStorage`, never `localStorage`. API calls send the ID token as `Authorization: Bearer ...`; the backend independently verifies the owner group. Five-minute ID tokens renew automatically using the session-scoped refresh token, whose maximum lifetime is one day. Transient network/server renewal failures get bounded retries while the current token is valid. Expired tokens never authorize API calls.

If renewal cannot recover, the app locks: private screens are hidden and inert, requests are blocked, and existing text drafts, files selected in the new-card dialog and query data stay **in this tab's memory**. Background queries and hidden-dialog Escape handlers are suspended. Signing back in through a popup as the same owner unlocks the existing screens without navigation or a blanket data refetch; only stale image metadata refreshes on return. Allow that popup; cancellation or blocking keeps the draft locked for another attempt. The popup reuses `/auth/callback`; the initial sign-in redirect still returns to `/`. Explicit logout, rejected owner authorization or a different authenticated account unmounts private screens, releases local image previews and clears private query data. Drafts are not saved to browser storage and cannot survive page reload, tab closure or browser termination. Cognito logout uses its [documented `client_id` and `logout_uri` parameters](https://docs.aws.amazon.com/cognito/latest/developerguide/logout-endpoint.html).

If a card was saved before its image batch was interrupted by an authorization rejection, the new-card dialog retains the saved card ID, selected files and confirmed upload progress. After sign-in, **Continue uploads** resumes the remaining images only when it is known that the failed request did not complete. The saved question, tags and file order are fixed during this step. A lost response can mean an upload already succeeded: that case offers **Open saved card** for inspection instead of replaying the request. Opening it explicitly discards the remaining selected files after confirmation. Sign-in never automatically replays a mutation. Uploads selected in the existing card/answer editor begin immediately; after an interrupted upload, inspect the saved images before selecting files again.

Logout clears private screens and cached data immediately, then makes a best-effort [Cognito refresh-token revocation request](https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html) using the public client ID, with a three-second timeout. It still redirects to hosted logout if revocation fails. A refresh completing during logout is discarded and its rotated token is also submitted for revocation. Closing the tab or a network outage can prevent revocation; any copied refresh token may remain usable until its one-day expiry. Existing JWTs validated offline by the API and previously issued signed image URLs can remain usable for their remaining five-minute lifetime, even after successful logout. Logout cannot erase data already downloaded or copied.

Images upload as authenticated raw bytes directly to the API, up to **4 MiB**, in JPEG, PNG, GIF or WebP format. The server validates and re-encodes them; animations become static. Image mutations never submit storage keys or URLs. Reads use five-minute signed URLs; active image queries refresh every four minutes and after returning to a stale tab. A successfully displayed immutable image retains its current `src` when only the signature changes, avoiding another image download every four minutes. A different image changes immediately; failed loads can use a refreshed URL. Downloads allow 60 seconds of private browser caching, never shared caching. This can retain already downloaded bytes briefly after logout or URL expiry; logout removes the rendered images but cannot erase copies already downloaded. Stored images render only from `VITE_MEDIA_ORIGIN`; local file previews use separately created object URLs.

## Scripts

```bash
npm run dev       # loopback Vite server
npm test          # Vitest + React Testing Library + MSW
npm run build     # TypeScript and production build into dist/
npm run preview
npm audit
```

## Coordinated production cutover

Deploy this frontend together with a compatible authenticated backend. Existing public clients and legacy media need the backend maintenance/migration procedure first; see the [backend deployment documentation](https://github.com/hq525/Flashcard-Lambda/blob/main/docs/security-deployment-2026-09-20.md). Preserve existing IDs, content and history during that migration.

Choose the Amplify app and connected branch for your deployment. **Pushing to the connected branch can automatically deploy.** Prepare changes on an isolated branch and review a pull request before merging. The `https://flashcards.example.com` URLs below are documentation examples; replace them with your own frontend origin.

1. Freeze legacy writes, back up data/media, and follow the backend dry-run-first image migration and authenticated API rollout.
2. Provision the admin-created Cognito owner account, assign its `owner` group, disable public signup and use a public app client with authorization code flow and `openid email` scopes. Register `https://flashcards.example.com/auth/callback` as the callback and `https://flashcards.example.com/` as the logout URL, using your actual frontend origin in both. For local development, separately register the chosen loopback origin and `/auth/callback`.
3. Set all five environment variables in Amplify from the backend stack outputs: `ApiUrl`, `AuthIssuer`, `AuthClientId`, `AuthDomain` and `MediaOrigin`. Copy `.env.example` only for isolated local development and replace every placeholder. Remove obsolete browser-key environment variables.
4. Keep `customHttp.yml` synchronized with these origins. Its checked-in exact origins are public configuration for the existing deployment; a fork must replace them with its own origins before deploying. Amplify applies its CSP, frame denial, MIME-sniffing protection, referrer policy, HTTPS and cache headers. Inline styles support the study card's measured height/rotation; scripts are restricted to this origin. No wildcard media source is allowed. Hashed `/assets/**` files use a one-year public immutable cache policy; the entry document and known application routes revalidate. Cache rules are disjoint so they do not depend on undocumented overlapping-header precedence. Add a matching revalidation rule when introducing another SPA route prefix.
5. Configure Amplify's SPA rewrite to `/index.html` (HTTP 200) for application routes including `/auth/callback`, excluding real static assets. `amplify.yml` installs the Node version pinned in `.nvmrc` and runs `npm ci` and `npm run build`.
6. Release during the coordinated maintenance window. Verify anonymous API access fails, the owner can log in/read/edit/study/upload, an expired session locks without losing an unsaved draft, same-owner popup login restores that draft, logout discards it, direct unsigned media reads fail, signed image metadata refreshes without re-downloading already displayed images, and the deployed headers are present. Revoke legacy shared keys and invalidate old frontend bundles as part of the backend cutover.

No production deployment or data migration is performed by this repository's local build/tests.

## Structure

- `src/auth/`: Cognito session, route gate and security regression tests
- `src/api/`: authenticated fetch, media policy, types, resources and query hooks
- `src/features/`: categories, decks, cards, editor, study and tags
- `src/test/`: MSW fixtures and explicit authenticated test helpers

Vite 8, React 19, TypeScript 7, Tailwind CSS v4, React Router v8 and TanStack Query v5. See the [dependency upgrade record](docs/dependency-upgrade-2026-09-20.md) for versions, publication dates and the 24-hour release cutoff.
