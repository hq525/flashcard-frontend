# Frontend security audit — 20 September 2026

> Historical baseline report. The deployed remediation replaced browser API keys with Cognito owner login, private media, bounded uploads, security headers and patched dependencies. See the backend [remediation record](https://github.com/hq525/Flashcard-Lambda/blob/main/docs/security-remediation-2026-09-20.md) and [rollout record](https://github.com/hq525/Flashcard-Lambda/blob/main/docs/security-rollout-2026-09-20.md). Findings and verification counts below describe the pre-remediation commits, not the current deployment.

Reviewed commit `df024f5b3c33f4f02220b22e42e85a71b28f068f` alongside backend commit `725eb35a3832fdc36987bd853686709ee932bc03`. The [combined report](https://github.com/hq525/Flashcard-Lambda/blob/main/docs/security-audit-2026-09-20.md) contains the complete findings, backend evidence, fixes, dependency triage, and safe reproduction probes.

**Critical authentication design issue, if deployed with the documented public hosting:** [config.ts](https://github.com/hq525/flashcard-frontend/blob/df024f5b3c33f4f02220b22e42e85a71b28f068f/src/api/config.ts#L9) reads `VITE_API_KEY`, and [client.ts](https://github.com/hq525/flashcard-frontend/blob/df024f5b3c33f4f02220b22e42e85a71b28f068f/src/api/client.ts#L30) sends it on every request. A production build made with a dummy key proved that the key is present in downloadable JavaScript. The backend's SAM configuration uses this key as its only access gate, granting holders full CRUD, review, and upload access. The [Amplify environment variable setup](https://github.com/hq525/flashcard-frontend/blob/df024f5b3c33f4f02220b22e42e85a71b28f068f/amplify.yml#L12) keeps the key out of Git but does not keep it out of the browser. This is [documented Vite behavior](https://vite.dev/guide/env-and-mode).

Replace the shared browser key with a verified identity and owner authorization at the API, or an authenticated backend proxy. Then rotate the old key and invalidate old bundles. A frontend route guard or key rotation alone does not secure the API. This needs coordinated authentication design rather than an automatic frontend-only patch. No live site or actual credential was accessed during validation.

**High upload risk shared with the backend:** the 10 MiB restriction in [CardCreateDialog.tsx](https://github.com/hq525/flashcard-frontend/blob/df024f5b3c33f4f02220b22e42e85a71b28f068f/src/features/cards/CardCreateDialog.tsx#L24) and `ImageStrip.tsx` is client-side only. [resources.ts](https://github.com/hq525/flashcard-frontend/blob/df024f5b3c33f4f02220b22e42e85a71b28f068f/src/api/resources.ts#L110) sends bytes straight to S3. Backend probes showed that the presigned URL binds neither Content-Type nor length, permitting arbitrary content and uploads above the UI limit. Coordinate an authenticated upload contract with S3-enforced size limits and server-side image validation. The combined report also covers client-selected S3 deletion targets.

**Dependency results:** `npm audit` reported 6 affected package entries (4 high, 2 moderate). These are scanner counts, not six proven production exploits.

| Package | Locked | Patch floor for reported issues | Scope |
|---|---|---|---|
| react-router | 7.18.1 | 7.18.2 | Browser dependency; the advisory requires unstable RSC mode, absent here |
| postcss | 8.5.16 | 8.5.23 | Vite build dependency; no card-content-to-CSS compilation path |
| nanoid | 3.3.15 | 3.3.18 | PostCSS dependency; no attacker-controlled generator size found |
| undici | 7.28.0 | 7.29.0 | jsdom test dependency |
| vitest / @vitest/mocker | 4.1.9 | 4.1.11 | jsdom tests; standalone mocker plugins are not configured |

The [React Router maintainer advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-qwww-vcr4-c8h2) limits impact to unstable RSC APIs. The other primary advisories and dependency chains are linked in the combined report. Update compatible dependency/lockfile versions and rerun tests, build, and audit; no major-version force upgrade is necessary for these reported patch floors. Bounded automated dependency remediation is appropriate.

**Verification:** all 102 tests in 15 files passed; tests emitted existing React-key/MSW warnings. TypeScript and a production Vite build passed using dummy configuration. Gitleaks found no committed secrets across 27 locally available commits. React renders card text as text; no dangerous HTML insertion or dynamic code execution was found. The repository does not declare CSP/frame headers, and its ignore rules omit plain `.env` and some environment variants; deployed headers were not inspected. Stored arbitrary image URLs may cause tracking requests to external hosts and should be restricted with the backend media policy.

At the time of this baseline audit, only audit documentation/evidence was added; application code, dependencies, and hosting settings were unchanged. Actual Amplify access restrictions, response headers, deployed bundles, AWS policies, and production data were outside that local audit. Subsequent deployment verification is recorded in the linked rollout record.
