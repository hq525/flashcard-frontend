# Flashcard Frontend — Design

Date: 2026-07-06
Status: Approved

## Purpose

A web frontend for the Flashcard-Lambda Go backend, built from scratch in this
repository. Two jobs:

1. **Study**: flip through a deck's cards, reveal answers, and mark each card
   memorized or not.
2. **Manage content**: full CRUD for categories, decks, cards (with
   multi-section answers and images), and tags, including browser image
   uploads via presigned S3 URLs.

## Stack

- **Vite + React 19 + TypeScript** — client-side SPA; the backend is a plain
  REST API, so no server rendering.
- **Tailwind CSS v4** — utility-first styling, no component library.
- **React Router v7** (library mode) — URL-based navigation.
- **TanStack Query v5** — server state: caching, loading/error states, cache
  invalidation after mutations.
- **Vitest + React Testing Library + MSW** — tests; MSW fakes the API at the
  network layer.

Build output is a static `dist/`; deployment (e.g., S3/CloudFront) is out of
scope for this project.

## Configuration

Build-time env vars, read in one module (`src/api/config.ts`):

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (e.g., `http://localhost:8080` for local dev) |
| `VITE_API_KEY` | Optional. When set, sent as `X-Api-Key` on every request; omitted when empty (local dev needs no key) |

`.env.local` (gitignored) holds local values; `.env.example` documents them.

## Backend contract (what the frontend codes against)

Base conventions (from the backend README):

- `GET /<plural>` lists (some take a parent-id query param); `GET/POST/PUT/DELETE
  /<singular>` operate on one entity (`?id=` for GET/PUT/DELETE, JSON body for
  POST/PUT).
- Errors are JSON `{"message": "..."}`; `201` on create, `404` unknown id,
  `400` missing params/validation, `422` malformed JSON. Lists return `[]`,
  never `null`.
- PUT bodies are validated like POST bodies — required fields must always be
  sent, so updates resend the full entity payload.

Resources and their JSON field quirks (mirrored exactly in `src/api/types.ts`):

| Resource | List param | Notable JSON fields |
|---|---|---|
| category | — | `name`, `description` |
| deck | `categoryId` | `categoryID`, `name`, `description` |
| tag | — | `name`, `description` |
| card | `deckId` | `deckID`, `question`, `tags` (array of tag IDs), `memorized` (bool, = previously correct), `createdDateTime`, `updatedDateTime`, `lastAccessedDateTime` |
| card-answer-section | `cardId` | `cardID`, `sequenceNumber`, `title`, `answer` |
| card-question-image | `cardId` | `cardID`, `sequenceNumber`, `imageURL` |
| card-answer-section-image | `cardAnswerSectionId` | `cardAnswerSectionID`, `sequenceNumber`, `imageURL` |

**Sequence numbers start at 1.** The backend validates `sequenceNumber` as
`required` on a `uint16`, so `0` is rejected. New items get `max(existing) + 1`
(or `1` for the first).

**Presigned uploads:** `GET /presigned-url?fileName=<name>&contentType=image/<type>[&imageType=answer]`
returns `{presignedUrl, imageUrl}`. The browser `PUT`s the file bytes to
`presignedUrl` with the *identical* `Content-Type` header, then `POST`s the
image record with `imageURL: imageUrl`. `imageType=answer` routes the object to
the `answer-images/` prefix; otherwise `question-images/`.

**Cascade deletes are server-side:** deleting a category removes its decks and
below; deck → cards and below; card → sections/images; section → its images.
Image-record deletes also remove the S3 object. The frontend only issues the
one delete and invalidates caches.

## Architecture

```
src/
  api/
    config.ts       # env var access
    client.ts       # fetch wrapper: base URL join, X-Api-Key, JSON, ApiError
    types.ts        # entity + request types (exact backend JSON names)
    resources.ts    # per-resource functions (listDecks(categoryId), createCard(...), …)
    hooks.ts        # TanStack Query hooks + query keys + mutation invalidation
  components/       # shared UI: Button, Dialog (confirm), Toast, Breadcrumbs,
                    # Spinner/skeletons, ErrorBanner, TagChip, EmptyState
  features/
    categories/     # CategoriesPage + category form dialog
    decks/          # DecksPage + deck form dialog
    cards/          # CardsPage (list) + card create dialog
    card-editor/    # CardEditorPage: question, images, tags, answer sections
    study/          # StudyPage: session setup, card flow, summary
    tags/           # TagsPage + tag form dialog
  App.tsx           # router + layout (header, breadcrumbs, toast outlet)
  main.tsx          # QueryClientProvider, RouterProvider
```

Unit boundaries: `api/` has no React-DOM/UI imports beyond hooks; features
consume `api/hooks.ts` and `components/`; `components/` imports nothing from
`features/`.

### API layer details

- `client.ts` exposes `request<T>(method, path, {params, body})`. It attaches
  `X-Api-Key` when configured, serializes JSON, and on non-2xx throws
  `ApiError { status, message }` parsed from the backend's `{"message"}` shape
  (with a fallback message when the body isn't JSON).
- Query keys: `['categories']`, `['category', id]`, `['decks', categoryId]`,
  `['cards', deckId]`, `['card', id]`, `['tags']`,
  `['answer-sections', cardId]`, `['question-images', cardId]`,
  `['section-images', sectionId]`.
- Mutations invalidate the affected list key and (for updates/deletes) the
  entity key. Deck/category deletes just invalidate their list — children are
  refetched on navigation, so no client-side cascade bookkeeping.

## Routes & screens

| Route | Screen |
|---|---|
| `/` | Categories grid; create/edit/delete (delete confirm warns the cascade removes all decks/cards inside) |
| `/categories/:categoryId` | Decks in the category; deck CRUD; each deck links to its cards and directly to Study |
| `/decks/:deckId` | Cards in the deck: question preview, memorized badge, tag chips; "New card" (question + tags, then navigates to the editor); delete card; "Study" button |
| `/cards/:cardId` | Card editor (below) |
| `/decks/:deckId/study` | Study mode (below) |
| `/tags` | Tag list with create/edit/delete (header nav link) |
| `*` | Not-found page |

Layout: app header (title + Tags link) and breadcrumbs (Home › Category ›
Deck › Card), built from the current entity's parent-id chain via the
single-entity GET endpoints (each returns its parent's id).

### Card editor (`/cards/:cardId`)

- **Question**: textarea; Save issues `PUT /card` with the full update payload
  (`question`, `tags`, `memorized`, `lastAccessedDateTime` preserved from the
  current card).
- **Tags**: multi-select from all tags; saving updates the card as above.
- **Question images**: thumbnail strip ordered by `sequenceNumber`; add
  (upload flow), delete (confirm), reorder via up/down arrows that swap
  adjacent items' sequence numbers (two PUTs).
- **Answer sections**: list ordered by `sequenceNumber`; add (gets next
  sequence number), edit title/answer inline, delete (confirm; warns its
  images go too), reorder via up/down swap. Each section has its own image
  strip using `imageType=answer` uploads, managed identically to question
  images.

### Study mode (`/decks/:deckId/study`)

1. **Setup**: shows deck name and card count; toggles for *shuffle* and
   *unmemorized only* (client-side filter on `memorized === false`); Start.
   If the filter leaves zero cards, say so and offer to include all.
2. **Session**: one card at a time — question + question images; "Reveal
   answer" shows answer sections in order (title, answer text, images);
   then **"Got it"** / **"Not yet"** issues `PUT /card` with
   `memorized: true/false` and `lastAccessedDateTime` = current ISO-8601
   timestamp (resending `question` and `tags` unchanged), and advances.
   Progress indicator (n / total). A failed update shows a toast and does not
   advance, so the answer can be retried.
3. **Summary**: counts of got-it / not-yet; buttons to restart (same options)
   or return to the deck.

### Upload flow (shared by question and section images)

1. File picker restricted to `image/*`; read the file's MIME type.
2. `GET /presigned-url` with the file name, its content type, and
   `imageType=answer` when uploading for an answer section.
3. `PUT` the file to `presignedUrl` with the same `Content-Type` header
   (plain `fetch`, no API key — it's S3, not the API).
4. `POST` the image record with the returned `imageUrl` and the next sequence
   number; invalidate that image list.

A failure at any step surfaces a toast and leaves no partial UI state (an
orphaned S3 object from a failed step 4 is acceptable — invisible to the app).

## Error handling

- Query loading → skeletons; query error → inline `ErrorBanner` with the
  `ApiError` message and a Retry button.
- Mutation errors → toast with the message; forms stay open with input intact.
- All deletes go through a confirm `Dialog`; category/deck/card/section
  confirms state what cascades.
- Unknown routes and 404s from entity GETs render the not-found page.

## Testing

Vitest + React Testing Library, with MSW faking the backend using its exact
conventions (JSON errors, `[]` lists, 201/404/400 statuses).

- **`client.ts` unit tests**: base-URL joining, `X-Api-Key` present/absent per
  config, `{"message"}` error → `ApiError`, non-JSON error fallback.
- **Category CRUD flow**: list renders, create adds (and refetches), edit
  saves, delete confirms then removes.
- **Study flow**: reveal → "Got it" sends `PUT /card` whose body is asserted
  to carry `memorized: true`, a fresh `lastAccessedDateTime`, and the original
  `question`/`tags`; unmemorized-only filter excludes memorized cards.
- **Upload flow**: presign request carries `fileName`/`contentType` (and
  `imageType=answer` for sections); S3 PUT uses the same content type; record
  POST carries the returned `imageUrl` and sequence number 1 for a first image.

## Out of scope

- Deployment/hosting of the frontend.
- Auth beyond the static API key.
- Spaced-repetition scheduling (the data model only stores a memorized flag
  and last-accessed time).
- Markdown/rich text in questions/answers (plain text, whitespace preserved).
- Drag-and-drop reordering (up/down buttons only).
