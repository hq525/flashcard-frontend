# npm dependency upgrade — 20 September 2026

Both workspace repositories were checked. `Flashcard-Lambda` has Go modules and no npm manifest or lockfile; no backend dependency change was needed for this npm request.

## Selection policy

Registry publication timestamps were checked against a fixed cutoff of **2026-09-19 05:33:58 UTC** (24 hours before the check began). Direct dependencies use the highest non-prerelease, non-deprecated version published by that cutoff, including major upgrades. All 18 selected versions also match their package's current `latest` tag. Seventeen direct dependencies changed; `oidc-client-ts` was already current.

Exact direct versions are recorded in `package.json`. The lockfile was refreshed with npm's [documented date cutoff](https://docs.npmjs.com/cli/v10/using-npm/config/#before):

```sh
npm update --package-lock-only --ignore-scripts --before=2026-09-19T05:33:58Z
```

After resolution, registry publication timestamps for **all 248 locked package entries**, including transitive and optional platform packages, were independently checked against the same cutoff. None was newer. Transitive dependencies remain within the version constraints required by their parents. Lockfile tarball integrity hashes are retained. Installation used `npm ci --ignore-scripts`.

This is a verified snapshot, not a rolling age policy for future arbitrary `npm install` commands. Keep `npm ci` for reproducible installation; future upgrades must select a new cutoff at least 24 hours in the past and repeat the publication-date check. Release age reduces exposure to newly published packages but does not certify them as safe.

## Direct packages

| Package | Previous requirement | Selected version | Published (UTC) |
|---|---|---|---|
| `@tanstack/react-query` | `^5.101.2` | `5.103.1` | 2026-09-16T15:01:15.056Z |
| `oidc-client-ts` | `^3.5.0` | `3.5.0` | 2026-03-13T10:20:02.969Z |
| `react` | `^19.2.7` | `19.3.0` | 2026-09-09T17:21:30.071Z |
| `react-dom` | `^19.2.7` | `19.3.0` | 2026-09-09T17:17:39.744Z |
| `react-router` | `^7.18.4` | `8.4.0` | 2026-09-15T15:23:42.214Z |
| `@tailwindcss/vite` | `^4.3.2` | `4.3.3` | 2026-07-16T12:04:06.316Z |
| `@testing-library/jest-dom` | `^6.9.1` | `7.0.1` | 2026-08-09T23:44:33.598Z |
| `@testing-library/react` | `^16.3.2` | `16.3.3` | 2026-08-27T17:41:18.735Z |
| `@testing-library/user-event` | `^14.6.1` | `14.6.7` | 2026-09-02T01:56:32.109Z |
| `@types/react` | `^19.2.17` | `19.3.0` | 2026-09-09T18:08:49.750Z |
| `@types/react-dom` | `^19.2.3` | `19.3.0` | 2026-09-09T18:07:51.886Z |
| `@vitejs/plugin-react` | `^6.0.3` | `6.1.1` | 2026-08-28T03:30:56.619Z |
| `jsdom` | `^29.1.1` | `30.1.0` | 2026-09-17T00:57:24.186Z |
| `msw` | `^2.14.6` | `2.15.0` | 2026-07-08T01:43:07.502Z |
| `tailwindcss` | `^4.3.2` | `4.3.3` | 2026-07-16T12:03:35.267Z |
| `typescript` | `^6.0.3` | `7.0.2` | 2026-07-08T15:55:18.431Z |
| `vite` | `^8.1.3` | `8.3.0` | 2026-09-10T11:30:26.283Z |
| `vitest` | `^4.1.11` | `5.0.1` | 2026-09-15T08:49:35.830Z |

## Runtime and compatibility

`.nvmrc` pins Node **22.23.2**, published 28 July 2026 according to the [official release index](https://nodejs.org/dist/index.json). This satisfies the newer React Router/jsdom requirements. Amplify uses `.nvmrc` through `nvm install` / `nvm use`, matching local development. The existing globally selected Node version was not changed.

Relevant migration guidance: [React Router v8](https://reactrouter.com/upgrading/v7), [Vitest v5](https://vitest.dev/guide/migration/).

## Validation

- `npm ci --ignore-scripts`: passed on Node 22.23.2 / npm 10.9.8.
- `npm test`: **183 tests passed across 18 files** with Vitest 5.0.1 / jsdom 30.1.0.
- `npm run build`: TypeScript 7.0.2 and Vite 8.3.0 production build passed.
- `npm audit`: **zero known vulnerabilities reported**.
- All 248 lockfile entries passed the independent registry publication-date check.

No application source changes were required by the upgrades. No commit, push, or deployment is part of this update.
