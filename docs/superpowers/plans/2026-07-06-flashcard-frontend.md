# Flashcard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React SPA for the Flashcard-Lambda backend: browse categories → decks → cards, edit cards (multi-section answers, images via presigned S3 uploads, tags), and study decks (flip, reveal, mark memorized).

**Architecture:** Client-side SPA. An isolated `src/api/` layer (typed fetch client → per-resource functions → TanStack Query hooks) mirrors the backend contract exactly; feature pages under `src/features/` consume hooks and shared `src/components/`. MSW fakes the backend in tests at the network layer.

**Tech Stack:** Vite 7, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), react-router v7, @tanstack/react-query v5, Vitest + React Testing Library + user-event + MSW v2 (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-06-flashcard-frontend-design.md`

## Global Constraints

- Working directory for every command: `/Users/zhaohanqing/Documents/GitHub/flashcard-frontend` (repo root; Node v22.13.0 installed).
- Env vars: `VITE_API_BASE_URL` (backend base URL), `VITE_API_KEY` (optional; when non-empty every API request carries `X-Api-Key`). Read ONLY in `src/api/config.ts`.
- Backend JSON field names are used verbatim and are case-sensitive: `categoryID`, `deckID`, `cardID`, `cardAnswerSectionID`, `tags` (array of tag ids, may be `null`), `memorized`, `sequenceNumber`, `imageURL`, `entityType`, `presignedUrl`, `imageUrl`.
- List query params are exactly: `categoryId` (decks), `deckId` (cards), `cardId` (sections + question images), `cardAnswerSectionId` (section images). Item ops use `?id=`.
- Backend responses: POST → 201 + created entity; PUT/DELETE → 200 + (updated/deleted) entity; errors are JSON `{"message": "..."}`; lists are `[]`, never `null`.
- `sequenceNumber` starts at 1 (backend rejects 0). New items get `max(existing sequenceNumber) + 1`, or `1` when empty.
- PUT bodies are full payloads (backend validates PUT like POST — required fields must be present).
- Tests live next to the code as `*.test.ts` / `*.test.tsx`. `npm test` must pass at the end of every task.
- Commit messages: conventional commits, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
flashcard-frontend/
  .env.example  .env.local(gitignored)  .gitignore  index.html  package.json  tsconfig.json  vite.config.ts
  src/
    main.tsx  App.tsx  index.css
    api/        config.ts  client.ts  types.ts  resources.ts  hooks.ts
    components/ Button.tsx  Spinner.tsx  ErrorBanner.tsx  EmptyState.tsx  TagChip.tsx
                Breadcrumbs.tsx  Dialog.tsx  ConfirmDialog.tsx  Toast.tsx  EntityFormDialog.tsx
    layout/     Layout.tsx
    features/   NotFoundPage.tsx
      categories/CategoriesPage.tsx   tags/TagsPage.tsx   decks/DecksPage.tsx
      cards/CardsPage.tsx  cards/CardCreateDialog.tsx
      card-editor/CardEditorPage.tsx  card-editor/ImageStrip.tsx  card-editor/AnswerSectionEditor.tsx
      study/session.ts  study/StudyPage.tsx
    test/       setup.ts  server.ts  fixtures.ts  utils.tsx
```

Dependency direction: `features → (api, components, layout)`; `components` import nothing from `features`; `api` imports no UI (except React itself in `hooks.ts`).

---

### Task 1: Project scaffold with test pipeline

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env.local`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/test/setup.ts`, `src/test/server.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `src/test/server.ts` exports `server` (MSW `setupServer()` instance) used by every later test task. Vitest runs with `VITE_API_BASE_URL=http://localhost:8080`, `VITE_API_KEY=''` (set in `vite.config.ts` `test.env`). `App.tsx` default export is rewritten in Task 7.

- [ ] **Step 1: Create package.json and install dependencies**

```json
{
  "name": "flashcard-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Run:
```bash
npm install react react-dom react-router @tanstack/react-query
npm install -D typescript @types/react @types/react-dom @vitejs/plugin-react vite tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw
```
Expected: both commands succeed; `package.json` gains `dependencies` and `devDependencies`.

- [ ] **Step 2: Create config files**

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    env: {
      VITE_API_BASE_URL: 'http://localhost:8080',
      VITE_API_KEY: '',
    },
  },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flashcards</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
.env.local
*.log
```

`.env.example`:
```
# Backend base URL (local Go server or deployed API Gateway stage)
VITE_API_BASE_URL=http://localhost:8080
# API key sent as X-Api-Key on every request; leave empty for local dev
VITE_API_KEY=
```

`.env.local` (same content as `.env.example` — developer's local values, gitignored).

- [ ] **Step 3: Create app entry and test infrastructure**

`src/index.css`:
```css
@import "tailwindcss";
```

`src/App.tsx`:
```tsx
export default function App() {
  return <h1 className="p-8 text-2xl font-bold">Flashcards</h1>;
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/test/server.ts`:
```ts
import { setupServer } from 'msw/node';

export const server = setupServer();
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());
```

- [ ] **Step 4: Write the smoke test**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Flashcards' })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run test and build to verify the pipeline**

Run: `npm test`
Expected: 1 test file, 1 passed.

Run: `npm run build`
Expected: `tsc` clean, Vite writes `dist/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind with Vitest/MSW pipeline

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API config and fetch client

**Files:**
- Create: `src/api/config.ts`, `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: `server` from `src/test/server.ts`.
- Produces:
  - `getApiConfig(): { baseUrl: string; apiKey: string }` (trailing slashes stripped from baseUrl)
  - `class ApiError extends Error { readonly status: number }`
  - `request<T>(method: string, path: string, opts?: { params?: Record<string, string>; body?: unknown }): Promise<T>`

- [ ] **Step 1: Write the failing tests**

`src/api/client.test.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { ApiError, request } from './client';

test('joins base URL, path, and query params', async () => {
  let seen: URL | null = null;
  server.use(
    http.get('http://localhost:8080/decks', ({ request: req }) => {
      seen = new URL(req.url);
      return HttpResponse.json([]);
    }),
  );
  const result = await request<unknown[]>('GET', '/decks', { params: { categoryId: 'c1' } });
  expect(result).toEqual([]);
  expect(seen!.searchParams.get('categoryId')).toBe('c1');
});

test('omits X-Api-Key header when no key is configured', async () => {
  let apiKey: string | null = 'sentinel';
  server.use(
    http.get('http://localhost:8080/categories', ({ request: req }) => {
      apiKey = req.headers.get('X-Api-Key');
      return HttpResponse.json([]);
    }),
  );
  await request('GET', '/categories');
  expect(apiKey).toBeNull();
});

test('sends X-Api-Key header when a key is configured', async () => {
  vi.stubEnv('VITE_API_KEY', 'secret-key');
  let apiKey: string | null = null;
  server.use(
    http.get('http://localhost:8080/categories', ({ request: req }) => {
      apiKey = req.headers.get('X-Api-Key');
      return HttpResponse.json([]);
    }),
  );
  await request('GET', '/categories');
  expect(apiKey).toBe('secret-key');
});

test('serializes JSON bodies with content-type', async () => {
  let contentType: string | null = null;
  let body: unknown = null;
  server.use(
    http.post('http://localhost:8080/category', async ({ request: req }) => {
      contentType = req.headers.get('Content-Type');
      body = await req.json();
      return HttpResponse.json({ id: '1' }, { status: 201 });
    }),
  );
  await request('POST', '/category', { body: { name: 'Biology', description: '' } });
  expect(contentType).toBe('application/json');
  expect(body).toEqual({ name: 'Biology', description: '' });
});

test('throws ApiError with the backend message on non-2xx', async () => {
  server.use(
    http.get('http://localhost:8080/category', () =>
      HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
    ),
  );
  const err = await request('GET', '/category', { params: { id: 'nope' } }).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(404);
  expect(err.message).toBe('Not Found');
});

test('falls back to a status message when the error body is not JSON', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      new HttpResponse('<html>gateway error</html>', { status: 502 }),
    ),
  );
  const err = await request('GET', '/categories').catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(502);
  expect(err.message).toBe('Request failed with status 502');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement config and client**

`src/api/config.ts`:
```ts
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
}

export function getApiConfig(): ApiConfig {
  return {
    baseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
    apiKey: import.meta.env.VITE_API_KEY ?? '',
  };
}
```

`src/api/client.ts`:
```ts
import { getApiConfig } from './config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
}

export async function request<T = unknown>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = getApiConfig();
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(opts.params ?? {})) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Api-Key'] = apiKey;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = (await res.json()) as { message?: unknown };
      if (typeof data.message === 'string') message = data.message;
    } catch {
      // non-JSON error body — keep the fallback message
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/api/client.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/config.ts src/api/client.ts src/api/client.test.ts
git commit -m "feat: typed API client with X-Api-Key and JSON error mapping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: API types, resource functions, and image upload helper

**Files:**
- Create: `src/api/types.ts`, `src/api/resources.ts`, `src/test/fixtures.ts`
- Test: `src/api/resources.test.ts`

**Interfaces:**
- Consumes: `request`, `ApiError` from `src/api/client.ts`.
- Produces (exact names later tasks rely on):
  - Entity types: `Category`, `Deck`, `Tag`, `Card` (`tags: string[] | null` — Go nil slice marshals to `null`), `CardAnswerSection`, `CardQuestionImage`, `CardAnswerSectionImage`.
  - Request types: `CreateCategoryRequest`, `UpdateCategoryRequest`, `CreateDeckRequest`, `UpdateDeckRequest`, `CreateTagRequest`, `UpdateTagRequest`, `CreateCardRequest`, `UpdateCardRequest`, `CreateCardAnswerSectionRequest`, `UpdateCardAnswerSectionRequest`, `CreateCardQuestionImageRequest`, `UpdateCardQuestionImageRequest`, `CreateCardAnswerSectionImageRequest`, `UpdateCardAnswerSectionImageRequest`, `PresignResponse`.
  - Resource objects: `categoriesApi`, `decksApi`, `tagsApi`, `cardsApi`, `sectionsApi`, `questionImagesApi`, `sectionImagesApi` — each with `list`, `get` (categories/decks/cards only), `create`, `update(id, body)`, `remove(id)`; `remove` resolves to the deleted entity.
  - `uploadImageFile(file: File, imageType: 'question' | 'answer'): Promise<string>` — presign → S3 PUT → resolves to the public `imageUrl`.
  - Fixture factories: `makeCategory`, `makeDeck`, `makeTag`, `makeCard`, `makeSection`, `makeQuestionImage`, `makeSectionImage` — each `(overrides?: Partial<T>) => T`.

- [ ] **Step 1: Write types and fixtures (no test cycle — pure declarations)**

`src/api/types.ts`:
```ts
export interface Category {
  id: string;
  entityType: string;
  name: string;
  description: string;
}

export interface Deck {
  id: string;
  entityType: string;
  categoryID: string;
  name: string;
  description: string;
}

export interface Tag {
  id: string;
  entityType: string;
  name: string;
  description: string;
}

export interface Card {
  id: string;
  entityType: string;
  deckID: string;
  tags: string[] | null;
  question: string;
  createdDateTime: string;
  updatedDateTime: string;
  lastAccessedDateTime: string;
  memorized: boolean;
}

export interface CardAnswerSection {
  id: string;
  entityType: string;
  cardID: string;
  sequenceNumber: number;
  title: string;
  answer: string;
  createdDateTime: string;
  updatedDateTime: string;
}

export interface CardQuestionImage {
  id: string;
  entityType: string;
  cardID: string;
  sequenceNumber: number;
  createdDateTime: string;
  imageURL: string;
}

export interface CardAnswerSectionImage {
  id: string;
  entityType: string;
  cardAnswerSectionID: string;
  sequenceNumber: number;
  createdDateTime: string;
  imageURL: string;
}

export interface CreateCategoryRequest {
  name: string;
  description: string;
}
export type UpdateCategoryRequest = CreateCategoryRequest;

export interface CreateDeckRequest {
  categoryID: string;
  name: string;
  description: string;
}
export interface UpdateDeckRequest {
  name: string;
  description: string;
}

export interface CreateTagRequest {
  name: string;
  description: string;
}
export type UpdateTagRequest = CreateTagRequest;

export interface CreateCardRequest {
  deckID: string;
  question: string;
  tags: string[];
}
export interface UpdateCardRequest {
  question: string;
  tags: string[];
  memorized: boolean;
  lastAccessedDateTime?: string;
}

export interface CreateCardAnswerSectionRequest {
  cardID: string;
  sequenceNumber: number;
  title: string;
  answer: string;
}
export interface UpdateCardAnswerSectionRequest {
  sequenceNumber: number;
  title: string;
  answer: string;
}

export interface CreateCardQuestionImageRequest {
  cardID: string;
  sequenceNumber: number;
  imageURL: string;
}
export interface UpdateCardQuestionImageRequest {
  sequenceNumber: number;
  imageURL: string;
}

export interface CreateCardAnswerSectionImageRequest {
  cardAnswerSectionID: string;
  sequenceNumber: number;
  imageURL: string;
}
export interface UpdateCardAnswerSectionImageRequest {
  sequenceNumber: number;
  imageURL: string;
}

export interface PresignResponse {
  presignedUrl: string;
  imageUrl: string;
}
```

`src/test/fixtures.ts`:
```ts
import type {
  Card,
  CardAnswerSection,
  CardAnswerSectionImage,
  CardQuestionImage,
  Category,
  Deck,
  Tag,
} from '../api/types';

const TS = '2026-07-06T00:00:00Z';

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'cat-1', entityType: 'category', name: 'Biology', description: 'Life science', ...overrides };
}

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return { id: 'deck-1', entityType: 'deck', categoryID: 'cat-1', name: 'Cell Biology', description: '', ...overrides };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', entityType: 'tag', name: 'exam', description: '', ...overrides };
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    entityType: 'card',
    deckID: 'deck-1',
    tags: [],
    question: 'What is a mitochondrion?',
    createdDateTime: TS,
    updatedDateTime: TS,
    lastAccessedDateTime: '',
    memorized: false,
    ...overrides,
  };
}

export function makeSection(overrides: Partial<CardAnswerSection> = {}): CardAnswerSection {
  return {
    id: 'sec-1',
    entityType: 'card_answer_section',
    cardID: 'card-1',
    sequenceNumber: 1,
    title: 'Definition',
    answer: 'The powerhouse of the cell.',
    createdDateTime: TS,
    updatedDateTime: TS,
    ...overrides,
  };
}

export function makeQuestionImage(overrides: Partial<CardQuestionImage> = {}): CardQuestionImage {
  return {
    id: 'qimg-1',
    entityType: 'card_question_image',
    cardID: 'card-1',
    sequenceNumber: 1,
    createdDateTime: TS,
    imageURL: 'https://bucket.s3.amazonaws.com/question-images/qimg-1.png',
    ...overrides,
  };
}

export function makeSectionImage(overrides: Partial<CardAnswerSectionImage> = {}): CardAnswerSectionImage {
  return {
    id: 'simg-1',
    entityType: 'card_answer_section_image',
    cardAnswerSectionID: 'sec-1',
    sequenceNumber: 1,
    createdDateTime: TS,
    imageURL: 'https://bucket.s3.amazonaws.com/answer-images/simg-1.png',
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests for resources**

`src/api/resources.test.ts`:
```ts
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { makeCard, makeCategory, makeDeck } from '../test/fixtures';
import { cardsApi, categoriesApi, decksApi, uploadImageFile } from './resources';

test('categoriesApi covers list/get/create/update/remove with correct routes', async () => {
  const cat = makeCategory();
  const calls: string[] = [];
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json([cat])),
    http.get('http://localhost:8080/category', ({ request: req }) => {
      calls.push('get:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
    http.post('http://localhost:8080/category', () => HttpResponse.json(cat, { status: 201 })),
    http.put('http://localhost:8080/category', ({ request: req }) => {
      calls.push('put:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
    http.delete('http://localhost:8080/category', ({ request: req }) => {
      calls.push('delete:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
  );

  expect(await categoriesApi.list()).toEqual([cat]);
  expect(await categoriesApi.get('cat-1')).toEqual(cat);
  expect(await categoriesApi.create({ name: 'Biology', description: '' })).toEqual(cat);
  expect(await categoriesApi.update('cat-1', { name: 'Bio', description: '' })).toEqual(cat);
  expect(await categoriesApi.remove('cat-1')).toEqual(cat);
  expect(calls).toEqual(['get:cat-1', 'put:cat-1', 'delete:cat-1']);
});

test('list functions pass the parent-id query param', async () => {
  let deckParam: string | null = null;
  let cardParam: string | null = null;
  server.use(
    http.get('http://localhost:8080/decks', ({ request: req }) => {
      deckParam = new URL(req.url).searchParams.get('categoryId');
      return HttpResponse.json([makeDeck()]);
    }),
    http.get('http://localhost:8080/cards', ({ request: req }) => {
      cardParam = new URL(req.url).searchParams.get('deckId');
      return HttpResponse.json([makeCard()]);
    }),
  );
  await decksApi.list('cat-1');
  await cardsApi.list('deck-1');
  expect(deckParam).toBe('cat-1');
  expect(cardParam).toBe('deck-1');
});

test('uploadImageFile presigns, PUTs to S3 with the file content type, and returns imageUrl', async () => {
  const s3Url = 'http://localhost:8080/s3-upload';
  let presignParams: URLSearchParams | null = null;
  let s3ContentType: string | null = null;
  let s3Body: ArrayBuffer | null = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({ presignedUrl: s3Url, imageUrl: 'https://cdn/img.png' });
    }),
    http.put(s3Url, async ({ request: req }) => {
      s3ContentType = req.headers.get('Content-Type');
      s3Body = await req.arrayBuffer();
      return new HttpResponse(null, { status: 200 });
    }),
  );

  const file = new File(['fake-bytes'], 'diagram.png', { type: 'image/png' });
  const imageUrl = await uploadImageFile(file, 'answer');

  expect(imageUrl).toBe('https://cdn/img.png');
  expect(presignParams!.get('fileName')).toBe('diagram.png');
  expect(presignParams!.get('contentType')).toBe('image/png');
  expect(presignParams!.get('imageType')).toBe('answer');
  expect(s3ContentType).toBe('image/png');
  expect(new TextDecoder().decode(s3Body!)).toBe('fake-bytes');
});

test('uploadImageFile omits imageType for question images and rejects on S3 failure', async () => {
  let presignParams: URLSearchParams | null = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({ presignedUrl: 'http://localhost:8080/s3-upload', imageUrl: 'https://cdn/q.png' });
    }),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 403 })),
  );

  const file = new File(['x'], 'q.png', { type: 'image/png' });
  await expect(uploadImageFile(file, 'question')).rejects.toThrow('Image upload failed');
  expect(presignParams!.has('imageType')).toBe(false);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/api/resources.test.ts`
Expected: FAIL — cannot resolve `./resources`.

- [ ] **Step 4: Implement resources**

`src/api/resources.ts`:
```ts
import { request } from './client';
import type {
  Card,
  CardAnswerSection,
  CardAnswerSectionImage,
  CardQuestionImage,
  Category,
  CreateCardAnswerSectionImageRequest,
  CreateCardAnswerSectionRequest,
  CreateCardQuestionImageRequest,
  CreateCardRequest,
  CreateCategoryRequest,
  CreateDeckRequest,
  CreateTagRequest,
  Deck,
  PresignResponse,
  Tag,
  UpdateCardAnswerSectionImageRequest,
  UpdateCardAnswerSectionRequest,
  UpdateCardQuestionImageRequest,
  UpdateCardRequest,
  UpdateCategoryRequest,
  UpdateDeckRequest,
  UpdateTagRequest,
} from './types';

export const categoriesApi = {
  list: () => request<Category[]>('GET', '/categories'),
  get: (id: string) => request<Category>('GET', '/category', { params: { id } }),
  create: (body: CreateCategoryRequest) => request<Category>('POST', '/category', { body }),
  update: (id: string, body: UpdateCategoryRequest) =>
    request<Category>('PUT', '/category', { params: { id }, body }),
  remove: (id: string) => request<Category>('DELETE', '/category', { params: { id } }),
};

export const decksApi = {
  list: (categoryId: string) => request<Deck[]>('GET', '/decks', { params: { categoryId } }),
  get: (id: string) => request<Deck>('GET', '/deck', { params: { id } }),
  create: (body: CreateDeckRequest) => request<Deck>('POST', '/deck', { body }),
  update: (id: string, body: UpdateDeckRequest) =>
    request<Deck>('PUT', '/deck', { params: { id }, body }),
  remove: (id: string) => request<Deck>('DELETE', '/deck', { params: { id } }),
};

export const tagsApi = {
  list: () => request<Tag[]>('GET', '/tags'),
  create: (body: CreateTagRequest) => request<Tag>('POST', '/tag', { body }),
  update: (id: string, body: UpdateTagRequest) =>
    request<Tag>('PUT', '/tag', { params: { id }, body }),
  remove: (id: string) => request<Tag>('DELETE', '/tag', { params: { id } }),
};

export const cardsApi = {
  list: (deckId: string) => request<Card[]>('GET', '/cards', { params: { deckId } }),
  get: (id: string) => request<Card>('GET', '/card', { params: { id } }),
  create: (body: CreateCardRequest) => request<Card>('POST', '/card', { body }),
  update: (id: string, body: UpdateCardRequest) =>
    request<Card>('PUT', '/card', { params: { id }, body }),
  remove: (id: string) => request<Card>('DELETE', '/card', { params: { id } }),
};

export const sectionsApi = {
  list: (cardId: string) =>
    request<CardAnswerSection[]>('GET', '/card-answer-sections', { params: { cardId } }),
  create: (body: CreateCardAnswerSectionRequest) =>
    request<CardAnswerSection>('POST', '/card-answer-section', { body }),
  update: (id: string, body: UpdateCardAnswerSectionRequest) =>
    request<CardAnswerSection>('PUT', '/card-answer-section', { params: { id }, body }),
  remove: (id: string) =>
    request<CardAnswerSection>('DELETE', '/card-answer-section', { params: { id } }),
};

export const questionImagesApi = {
  list: (cardId: string) =>
    request<CardQuestionImage[]>('GET', '/card-question-images', { params: { cardId } }),
  create: (body: CreateCardQuestionImageRequest) =>
    request<CardQuestionImage>('POST', '/card-question-image', { body }),
  update: (id: string, body: UpdateCardQuestionImageRequest) =>
    request<CardQuestionImage>('PUT', '/card-question-image', { params: { id }, body }),
  remove: (id: string) =>
    request<CardQuestionImage>('DELETE', '/card-question-image', { params: { id } }),
};

export const sectionImagesApi = {
  list: (cardAnswerSectionId: string) =>
    request<CardAnswerSectionImage[]>('GET', '/card-answer-section-images', {
      params: { cardAnswerSectionId },
    }),
  create: (body: CreateCardAnswerSectionImageRequest) =>
    request<CardAnswerSectionImage>('POST', '/card-answer-section-image', { body }),
  update: (id: string, body: UpdateCardAnswerSectionImageRequest) =>
    request<CardAnswerSectionImage>('PUT', '/card-answer-section-image', { params: { id }, body }),
  remove: (id: string) =>
    request<CardAnswerSectionImage>('DELETE', '/card-answer-section-image', { params: { id } }),
};

// Presign → PUT the bytes to S3 (no API key — it's S3, not the API) → return
// the public URL to store on the image record.
export async function uploadImageFile(
  file: File,
  imageType: 'question' | 'answer',
): Promise<string> {
  const params: Record<string, string> = { fileName: file.name, contentType: file.type };
  if (imageType === 'answer') params.imageType = 'answer';
  const { presignedUrl, imageUrl } = await request<PresignResponse>('GET', '/presigned-url', {
    params,
  });

  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error('Image upload failed');
  return imageUrl;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/api/resources.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/resources.ts src/api/resources.test.ts src/test/fixtures.ts
git commit -m "feat: typed resource functions and presigned image upload helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: TanStack Query hooks

**Files:**
- Create: `src/api/hooks.ts`
- Test: `src/api/hooks.test.tsx`

**Interfaces:**
- Consumes: all resource objects from `src/api/resources.ts`; types from `src/api/types.ts`.
- Produces (exact hook names used by all page tasks):
  - `queryKeys` — key factory (shape below).
  - Queries: `useCategories()`, `useCategory(id: string | undefined)`, `useDecks(categoryId: string)`, `useDeck(id: string | undefined)`, `useTags()`, `useCards(deckId: string)`, `useCard(id: string | undefined)`, `useAnswerSections(cardId: string)`, `useQuestionImages(cardId: string)`, `useSectionImages(sectionId: string)`. The `| undefined` queries pass `enabled: !!id` (used for breadcrumb chains).
  - Mutations (all return TanStack `useMutation` results):
    - create/update/delete per resource: `useCreateCategory()`, `useUpdateCategory()`, `useDeleteCategory()`, `useCreateDeck()`, `useUpdateDeck()`, `useDeleteDeck()`, `useCreateTag()`, `useUpdateTag()`, `useDeleteTag()`, `useCreateCard()`, `useUpdateCard()`, `useDeleteCard()`, `useCreateAnswerSection()`, `useUpdateAnswerSection()`, `useDeleteAnswerSection()`, `useCreateQuestionImage()`, `useUpdateQuestionImage()`, `useDeleteQuestionImage()`, `useCreateSectionImage()`, `useUpdateSectionImage()`, `useDeleteSectionImage()`.
    - Create mutations take the Create request body. Update mutations take `{ id, body }`. Delete mutations take the entity id (string).
    - Invalidation derives parent ids from the **response** entity (backend returns the entity on POST/PUT/DELETE), so callers never pass extra invalidation context.

- [ ] **Step 1: Write the failing tests**

`src/api/hooks.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { server } from '../test/server';
import { makeCard, makeCategory } from '../test/fixtures';
import { useCards, useCategories, useCreateCategory, useDeleteCard } from './hooks';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

test('useCategories fetches the category list', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json([makeCategory()])),
  );
  const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([makeCategory()]);
});

test('useCreateCategory invalidates the category list', async () => {
  let listCalls = 0;
  server.use(
    http.get('http://localhost:8080/categories', () => {
      listCalls += 1;
      return HttpResponse.json([makeCategory()]);
    }),
    http.post('http://localhost:8080/category', () =>
      HttpResponse.json(makeCategory({ id: 'cat-2', name: 'Chemistry' }), { status: 201 }),
    ),
  );
  const wrapper = createWrapper();
  const list = renderHook(() => useCategories(), { wrapper });
  await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

  const create = renderHook(() => useCreateCategory(), { wrapper });
  await create.result.current.mutateAsync({ name: 'Chemistry', description: '' });

  await waitFor(() => expect(listCalls).toBe(2));
});

test('useDeleteCard invalidates the card list using the deleted entity deckID', async () => {
  let listCalls = 0;
  server.use(
    http.get('http://localhost:8080/cards', () => {
      listCalls += 1;
      return HttpResponse.json([makeCard()]);
    }),
    http.delete('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
  );
  const wrapper = createWrapper();
  const list = renderHook(() => useCards('deck-1'), { wrapper });
  await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

  const del = renderHook(() => useDeleteCard(), { wrapper });
  await del.result.current.mutateAsync('card-1');

  await waitFor(() => expect(listCalls).toBe(2));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/api/hooks.test.tsx`
Expected: FAIL — cannot resolve `./hooks`.

- [ ] **Step 3: Implement the hooks**

`src/api/hooks.ts`:
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cardsApi,
  categoriesApi,
  decksApi,
  questionImagesApi,
  sectionImagesApi,
  sectionsApi,
  tagsApi,
} from './resources';
import type {
  UpdateCardAnswerSectionImageRequest,
  UpdateCardAnswerSectionRequest,
  UpdateCardQuestionImageRequest,
  UpdateCardRequest,
  UpdateCategoryRequest,
  UpdateDeckRequest,
  UpdateTagRequest,
} from './types';

export const queryKeys = {
  categories: ['categories'] as const,
  category: (id: string) => ['category', id] as const,
  decks: (categoryId: string) => ['decks', categoryId] as const,
  deck: (id: string) => ['deck', id] as const,
  tags: ['tags'] as const,
  cards: (deckId: string) => ['cards', deckId] as const,
  card: (id: string) => ['card', id] as const,
  answerSections: (cardId: string) => ['answer-sections', cardId] as const,
  questionImages: (cardId: string) => ['question-images', cardId] as const,
  sectionImages: (sectionId: string) => ['section-images', sectionId] as const,
};

// --- Categories ---

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.list });
}

export function useCategory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.category(id ?? ''),
    queryFn: () => categoriesApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryRequest }) =>
      categoriesApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.category(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.category(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

// --- Decks ---

export function useDecks(categoryId: string) {
  return useQuery({
    queryKey: queryKeys.decks(categoryId),
    queryFn: () => decksApi.list(categoryId),
  });
}

export function useDeck(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.deck(id ?? ''),
    queryFn: () => decksApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decksApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.decks(created.categoryID) }),
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeckRequest }) =>
      decksApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.deck(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.decks(updated.categoryID) });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decksApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.deck(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.decks(deleted.categoryID) });
    },
  });
}

// --- Tags ---

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: tagsApi.list });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tagsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTagRequest }) => tagsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tagsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
}

// --- Cards ---

export function useCards(deckId: string) {
  return useQuery({ queryKey: queryKeys.cards(deckId), queryFn: () => cardsApi.list(deckId) });
}

export function useCard(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.card(id ?? ''),
    queryFn: () => cardsApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.create,
    onSuccess: (created) => qc.invalidateQueries({ queryKey: queryKeys.cards(created.deckID) }),
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardRequest }) =>
      cardsApi.update(id, body),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.card(updated.id), updated);
      return qc.invalidateQueries({ queryKey: queryKeys.cards(updated.deckID) });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cardsApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.card(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.cards(deleted.deckID) });
    },
  });
}

// --- Answer sections ---

export function useAnswerSections(cardId: string) {
  return useQuery({
    queryKey: queryKeys.answerSections(cardId),
    queryFn: () => sectionsApi.list(cardId),
  });
}

export function useCreateAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionsApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.answerSections(created.cardID) }),
  });
}

export function useUpdateAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardAnswerSectionRequest }) =>
      sectionsApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.answerSections(updated.cardID) }),
  });
}

export function useDeleteAnswerSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionsApi.remove,
    onSuccess: (deleted) => {
      qc.removeQueries({ queryKey: queryKeys.sectionImages(deleted.id) });
      return qc.invalidateQueries({ queryKey: queryKeys.answerSections(deleted.cardID) });
    },
  });
}

// --- Question images ---

export function useQuestionImages(cardId: string) {
  return useQuery({
    queryKey: queryKeys.questionImages(cardId),
    queryFn: () => questionImagesApi.list(cardId),
  });
}

export function useCreateQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: questionImagesApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(created.cardID) }),
  });
}

export function useUpdateQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardQuestionImageRequest }) =>
      questionImagesApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(updated.cardID) }),
  });
}

export function useDeleteQuestionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: questionImagesApi.remove,
    onSuccess: (deleted) =>
      qc.invalidateQueries({ queryKey: queryKeys.questionImages(deleted.cardID) }),
  });
}

// --- Section images ---

export function useSectionImages(sectionId: string) {
  return useQuery({
    queryKey: queryKeys.sectionImages(sectionId),
    queryFn: () => sectionImagesApi.list(sectionId),
  });
}

export function useCreateSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionImagesApi.create,
    onSuccess: (created) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(created.cardAnswerSectionID) }),
  });
}

export function useUpdateSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCardAnswerSectionImageRequest }) =>
      sectionImagesApi.update(id, body),
    onSuccess: (updated) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(updated.cardAnswerSectionID) }),
  });
}

export function useDeleteSectionImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sectionImagesApi.remove,
    onSuccess: (deleted) =>
      qc.invalidateQueries({ queryKey: queryKeys.sectionImages(deleted.cardAnswerSectionID) }),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/api/hooks.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/hooks.ts src/api/hooks.test.tsx
git commit -m "feat: TanStack Query hooks with response-driven cache invalidation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Presentational components

**Files:**
- Create: `src/components/Button.tsx`, `src/components/Spinner.tsx`, `src/components/ErrorBanner.tsx`, `src/components/EmptyState.tsx`, `src/components/TagChip.tsx`, `src/components/Breadcrumbs.tsx`
- Test: `src/components/components.test.tsx`

**Interfaces:**
- Consumes: `ApiError` from `src/api/client.ts`.
- Produces:
  - `Button({ variant?: 'primary' | 'secondary' | 'danger' | 'ghost', ...ButtonHTMLAttributes })` — `type` defaults to `"button"`.
  - `Spinner()` and `PageLoading()` (centered page-level spinner).
  - `errorMessage(error: unknown): string` and `ErrorBanner({ error: unknown; onRetry?: () => void })`.
  - `EmptyState({ message: string; children?: ReactNode })`.
  - `TagChip({ name: string })`.
  - `Breadcrumbs({ items: Crumb[] })` with `interface Crumb { label: string; to?: string }` — items with `to` render as router `Link`s; the last item usually has no `to`.

- [ ] **Step 1: Write the failing tests**

`src/components/components.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../api/client';
import { Breadcrumbs } from './Breadcrumbs';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorBanner } from './ErrorBanner';
import { TagChip } from './TagChip';

test('Button defaults to type=button and honors disabled', () => {
  render(<Button disabled>Save</Button>);
  const button = screen.getByRole('button', { name: 'Save' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toBeDisabled();
});

test('ErrorBanner shows the ApiError message and calls onRetry', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<ErrorBanner error={new ApiError(500, 'Internal Server Error')} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Internal Server Error');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('ErrorBanner falls back for unknown errors and hides Retry without onRetry', () => {
  render(<ErrorBanner error="weird" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

test('Breadcrumbs links items with `to` and renders the last as text', () => {
  render(
    <MemoryRouter>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Biology', to: '/categories/cat-1' },
          { label: 'Cell Biology' },
        ]}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Biology' })).toHaveAttribute('href', '/categories/cat-1');
  expect(screen.queryByRole('link', { name: 'Cell Biology' })).not.toBeInTheDocument();
  expect(screen.getByText('Cell Biology')).toBeInTheDocument();
});

test('EmptyState and TagChip render their text', () => {
  render(
    <>
      <EmptyState message="No decks yet" />
      <TagChip name="exam" />
    </>,
  );
  expect(screen.getByText('No decks yet')).toBeInTheDocument();
  expect(screen.getByText('exam')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/components.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`src/components/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:text-gray-300',
} as const;

export type ButtonVariant = keyof typeof variants;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
```

`src/components/Spinner.tsx`:
```tsx
export function Spinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600"
    />
  );
}

export function PageLoading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}
```

`src/components/ErrorBanner.tsx`:
```tsx
import { ApiError } from '../api/client';
import { Button } from './Button';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
```

`src/components/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react';

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-12 text-sm text-gray-500">
      <p>{message}</p>
      {children}
    </div>
  );
}
```

`src/components/TagChip.tsx`:
```tsx
export function TagChip({ name }: { name: string }) {
  return (
    <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      {name}
    </span>
  );
}
```

`src/components/Breadcrumbs.tsx`:
```tsx
import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            {item.to ? (
              <Link to={item.to} className="hover:text-gray-900 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-gray-900">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/components.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: presentational components (Button, Spinner, ErrorBanner, EmptyState, TagChip, Breadcrumbs)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dialog, ConfirmDialog, Toast, EntityFormDialog

**Files:**
- Create: `src/components/Dialog.tsx`, `src/components/ConfirmDialog.tsx`, `src/components/Toast.tsx`, `src/components/EntityFormDialog.tsx`
- Test: `src/components/dialogs.test.tsx`

**Interfaces:**
- Consumes: `Button` from Task 5.
- Produces:
  - `Dialog({ open, onClose, title, children })` — renders nothing when `!open`; overlay click calls `onClose`.
  - `ConfirmDialog({ open, title, message, confirmLabel = 'Delete', busy?, onConfirm, onCancel })`.
  - `ToastProvider({ children })` and `useToast(): { showToast(text: string, kind?: 'error' | 'success'): void }` — toasts auto-dismiss after 5s; `useToast` throws outside the provider.
  - `EntityFormDialog({ open, title, initial?: EntityFormValues, busy?, onSubmit, onClose })` with `interface EntityFormValues { name: string; description: string }` — Save disabled until `name` is non-blank; submits trimmed values; used by categories, decks, and tags.

- [ ] **Step 1: Write the failing tests**

`src/components/dialogs.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';
import { EntityFormDialog } from './EntityFormDialog';
import { ToastProvider, useToast } from './Toast';

test('ConfirmDialog renders nothing when closed', () => {
  render(
    <ConfirmDialog open={false} title="Delete?" message="Sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('ConfirmDialog fires onConfirm and onCancel', async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete category"
      message="This also deletes its decks."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  expect(screen.getByRole('dialog', { name: 'Delete category' })).toBeInTheDocument();
  expect(screen.getByText('This also deletes its decks.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onConfirm).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledOnce();
});

function ToastTrigger() {
  const { showToast } = useToast();
  return <button onClick={() => showToast('Save failed')}>Trigger</button>;
}

test('showToast displays a toast', async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Trigger' }));
  expect(screen.getByRole('status')).toHaveTextContent('Save failed');
});

test('EntityFormDialog disables Save until name is filled and submits trimmed values', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <EntityFormDialog open title="New category" onSubmit={onSubmit} onClose={vi.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await user.type(screen.getByLabelText('Name'), '  Biology  ');
  await user.type(screen.getByLabelText('Description'), 'Life science');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSubmit).toHaveBeenCalledWith({ name: 'Biology', description: 'Life science' });
});

test('EntityFormDialog prefills initial values for editing', () => {
  render(
    <EntityFormDialog
      open
      title="Edit category"
      initial={{ name: 'Chemistry', description: 'Elements' }}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Name')).toHaveValue('Chemistry');
  expect(screen.getByLabelText('Description')).toHaveValue('Elements');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/dialogs.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`src/components/Dialog.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

`src/components/ConfirmDialog.tsx`:
```tsx
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="mb-6 text-sm text-gray-600">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

`src/components/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastKind = 'error' | 'success';

interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((text: string, kind: ToastKind = 'error') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
              toast.kind === 'error' ? 'bg-red-600' : 'bg-green-600'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

`src/components/EntityFormDialog.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface EntityFormValues {
  name: string;
  description: string;
}

interface EntityFormDialogProps {
  open: boolean;
  title: string;
  initial?: EntityFormValues;
  busy?: boolean;
  onSubmit: (values: EntityFormValues) => void;
  onClose: () => void;
}

export function EntityFormDialog({
  open,
  title,
  initial,
  busy = false,
  onSubmit,
  onClose,
}: EntityFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Depend on primitives: callers rebuild `initial` each render, and an
  // identity dep would reset in-progress edits on any parent re-render
  // (e.g. a toast expiring).
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
    }
  }, [open, initial?.name, initial?.description]);

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), description: description.trim() });
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/dialogs.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: Dialog, ConfirmDialog, Toast, and shared EntityFormDialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: App shell — router, layout, not-found, test harness

**Files:**
- Create: `src/layout/Layout.tsx`, `src/features/NotFoundPage.tsx`, `src/test/utils.tsx`
- Modify: `src/App.tsx` (replace), `src/App.test.tsx` (replace)

**Interfaces:**
- Consumes: `ToastProvider` (Task 6).
- Produces:
  - `AppRoutes()` (named export from `src/App.tsx`) — the `<Routes>` tree WITHOUT router/providers. Later tasks add one `<Route>` line each inside the `<Route element={<Layout />}>` block.
  - Default export `App()` — wraps `AppRoutes` in `QueryClientProvider` + `ToastProvider` + `BrowserRouter`.
  - `renderApp(initialPath: string)` from `src/test/utils.tsx` — renders `AppRoutes` with a fresh retry-disabled `QueryClient`, `ToastProvider`, and `MemoryRouter`. Every page test uses this.
  - `Layout` — header (brand link `/`, nav link `/tags`) + `<Outlet />`.

- [ ] **Step 1: Write the failing tests (replace `src/App.test.tsx`)**

```tsx
import { screen } from '@testing-library/react';
import { renderApp } from './test/utils';

test('renders the header brand and Tags nav link', () => {
  renderApp('/some-unknown-path');
  expect(screen.getByRole('link', { name: 'Flashcards' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags');
});

test('unknown routes render the not-found page', () => {
  renderApp('/some-unknown-path');
  expect(screen.getByText('Page not found')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to categories' })).toHaveAttribute('href', '/');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — `./test/utils` not found.

- [ ] **Step 3: Implement layout, not-found, App, and the test harness**

`src/layout/Layout.tsx`:
```tsx
import { Link, Outlet } from 'react-router';

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold">
            Flashcards
          </Link>
          <nav>
            <Link to="/tags" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Tags
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

`src/features/NotFoundPage.tsx`:
```tsx
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <p className="mb-6 text-sm text-gray-500">Nothing lives at this address.</p>
      <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">
        Back to categories
      </Link>
    </div>
  );
}
```

`src/App.tsx` (replace):
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ToastProvider } from './components/Toast';
import { NotFoundPage } from './features/NotFoundPage';
import { Layout } from './layout/Layout';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

// No focus refetch: forms that initialize from query data (card editor,
// section editors) must not be reset by a background refetch on tab focus.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

`src/test/utils.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';

export function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all test files pass (the Task 1 smoke test was replaced in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/layout src/features/NotFoundPage.tsx src/test/utils.tsx
git commit -m "feat: app shell with router, layout, not-found page, and test harness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Categories page (route `/`)

**Files:**
- Create: `src/features/categories/CategoriesPage.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/categories/CategoriesPage.test.tsx`

**Interfaces:**
- Consumes: `useCategories`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`; `EntityFormDialog`, `ConfirmDialog`, `Button`, `EmptyState`, `ErrorBanner`/`errorMessage`, `PageLoading`, `useToast`; `renderApp`.
- Produces: `CategoriesPage` — the pattern (pending → `PageLoading`, error → `ErrorBanner` with refetch, dialogs driven by `useState`, mutation errors → toast) that Tasks 9–10 copy.

- [ ] **Step 1: Write the failing tests**

`src/features/categories/CategoriesPage.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCategory } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

test('lists categories with links to their decks', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      HttpResponse.json([makeCategory(), makeCategory({ id: 'cat-2', name: 'Chemistry' })]),
    ),
  );
  renderApp('/');
  expect(await screen.findByRole('link', { name: 'Biology' })).toHaveAttribute(
    'href',
    '/categories/cat-1',
  );
  expect(screen.getByRole('link', { name: 'Chemistry' })).toBeInTheDocument();
});

test('creates a category and refreshes the list', async () => {
  const user = userEvent.setup();
  const categories = [makeCategory()];
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json(categories)),
    http.post('http://localhost:8080/category', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeCategory({ id: 'cat-2', name: 'Chemistry', description: 'Elements' });
      categories.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'New category' }));
  await user.type(screen.getByLabelText('Name'), 'Chemistry');
  await user.type(screen.getByLabelText('Description'), 'Elements');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('link', { name: 'Chemistry' })).toBeInTheDocument();
  expect(postBody).toEqual({ name: 'Chemistry', description: 'Elements' });
});

test('edits a category via a prefilled form', async () => {
  const user = userEvent.setup();
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json([makeCategory()])),
    http.put('http://localhost:8080/category', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeCategory({ name: 'Bio 2' }));
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue('Biology');
  await user.clear(nameInput);
  await user.type(nameInput, 'Bio 2');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(putId).toBe('cat-1'));
  expect(putBody).toEqual({ name: 'Bio 2', description: 'Life science' });
});

test('deletes a category after a cascade-warning confirm', async () => {
  const user = userEvent.setup();
  let deleteId: string | null = null;
  const categories = [makeCategory()];
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json(categories)),
    http.delete('http://localhost:8080/category', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      categories.length = 0;
      return HttpResponse.json(makeCategory());
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete category' });
  expect(
    within(dialog).getByText(/All decks and cards inside it will be deleted too/),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('cat-1'));
  expect(await screen.findByText(/No categories yet/)).toBeInTheDocument();
});

test('shows an error banner when the list fails', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
    ),
  );
  renderApp('/');
  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/categories/CategoriesPage.test.tsx`
Expected: FAIL — module not found / not-found page rendered instead of the list.

- [ ] **Step 3: Implement the page and register the route**

`src/features/categories/CategoriesPage.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../api/hooks';
import type { Category } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function CategoriesPage() {
  const categories = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  if (categories.isPending) return <PageLoading />;
  if (categories.isError) {
    return <ErrorBanner error={categories.error} onRetry={() => categories.refetch()} />;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Categories</h1>
        <Button onClick={() => setCreating(true)}>New category</Button>
      </div>

      {categories.data.length === 0 ? (
        <EmptyState message="No categories yet. Create one to get started." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.data.map((category) => (
            <li
              key={category.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <Link
                to={`/categories/${category.id}`}
                className="font-semibold text-indigo-700 hover:underline"
              >
                {category.name}
              </Link>
              {category.description && (
                <p className="mt-1 text-sm text-gray-500">{category.description}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(category)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(category)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New category"
        busy={createCategory.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createCategory.mutate(values, {
            onSuccess: () => setCreating(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit category"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateCategory.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateCategory.mutate(
            { id: editing!.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete category"
        message={
          deleting
            ? `Delete "${deleting.name}"? All decks and cards inside it will be deleted too.`
            : ''
        }
        busy={deleteCategory.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteCategory.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
```

In `src/App.tsx`, add the import and the index route inside the `Layout` route (keep `*` last):
```tsx
import { CategoriesPage } from './features/categories/CategoriesPage';
// inside <Route element={<Layout />}>:
        <Route index element={<CategoriesPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (5 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/categories src/App.tsx
git commit -m "feat: categories page with create/edit/delete and cascade warning

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Tags page (route `/tags`)

**Files:**
- Create: `src/features/tags/TagsPage.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/tags/TagsPage.test.tsx`

**Interfaces:**
- Consumes: `useTags`, `useCreateTag`, `useUpdateTag`, `useDeleteTag`; same components as Task 8.
- Produces: `TagsPage`. Follows the Task 8 pattern exactly (dialog state, toast on mutation error).

- [ ] **Step 1: Write the failing tests**

`src/features/tags/TagsPage.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeTag } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

test('lists tags', async () => {
  server.use(
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
  );
  renderApp('/tags');
  expect(await screen.findByText('exam')).toBeInTheDocument();
  expect(screen.getByText('hard')).toBeInTheDocument();
});

test('creates a tag', async () => {
  const user = userEvent.setup();
  const tags = [makeTag()];
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/tags', () => HttpResponse.json(tags)),
    http.post('http://localhost:8080/tag', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeTag({ id: 'tag-2', name: 'hard' });
      tags.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/tags');
  await user.click(await screen.findByRole('button', { name: 'New tag' }));
  await user.type(screen.getByLabelText('Name'), 'hard');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('hard')).toBeInTheDocument();
  expect(postBody).toEqual({ name: 'hard', description: '' });
});

test('deletes a tag after confirm', async () => {
  const user = userEvent.setup();
  const tags = [makeTag()];
  let deleteId: string | null = null;
  server.use(
    http.get('http://localhost:8080/tags', () => HttpResponse.json(tags)),
    http.delete('http://localhost:8080/tag', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      tags.length = 0;
      return HttpResponse.json(makeTag());
    }),
  );
  renderApp('/tags');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete tag' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('tag-1'));
  expect(await screen.findByText(/No tags yet/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/tags/TagsPage.test.tsx`
Expected: FAIL — module not found / not-found page rendered.

- [ ] **Step 3: Implement the page and register the route**

`src/features/tags/TagsPage.tsx`:
```tsx
import { useState } from 'react';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '../../api/hooks';
import type { Tag } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { TagChip } from '../../components/TagChip';
import { useToast } from '../../components/Toast';

export function TagsPage() {
  const tags = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  if (tags.isPending) return <PageLoading />;
  if (tags.isError) return <ErrorBanner error={tags.error} onRetry={() => tags.refetch()} />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">Tags</h1>
        <Button onClick={() => setCreating(true)}>New tag</Button>
      </div>

      {tags.data.length === 0 ? (
        <EmptyState message="No tags yet. Tags help you group cards across decks." />
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.data.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <TagChip name={tag.name} />
                {tag.description && <span className="text-sm text-gray-500">{tag.description}</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(tag)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(tag)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New tag"
        busy={createTag.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createTag.mutate(values, {
            onSuccess: () => setCreating(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit tag"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateTag.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateTag.mutate(
            { id: editing!.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete tag"
        message={deleting ? `Delete tag "${deleting.name}"? Cards keep working; they just lose this tag label.` : ''}
        busy={deleteTag.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteTag.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
```

In `src/App.tsx`, add:
```tsx
import { TagsPage } from './features/tags/TagsPage';
// inside <Route element={<Layout />}>, before the `*` route:
        <Route path="/tags" element={<TagsPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (3 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/tags src/App.tsx
git commit -m "feat: tags page with create/edit/delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Decks page (route `/categories/:categoryId`)

**Files:**
- Create: `src/features/decks/DecksPage.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/decks/DecksPage.test.tsx`

**Interfaces:**
- Consumes: `useCategory`, `useDecks`, `useCreateDeck`, `useUpdateDeck`, `useDeleteDeck`; `Breadcrumbs`; same components as Task 8.
- Produces: `DecksPage`. Deck names link to `/decks/:id`; each deck row also links to `/decks/:id/study` (route registered in Task 15 — until then it renders the not-found page, which is expected mid-build).

- [ ] **Step 1: Write the failing tests**

`src/features/decks/DecksPage.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCategory, makeDeck } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

function useCategoryAndDecksHandlers(decks = [makeDeck()]) {
  server.use(
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/decks', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('categoryId')).toBe('cat-1');
      return HttpResponse.json(decks);
    }),
  );
  return decks;
}

test('shows breadcrumbs and decks with card and study links', async () => {
  useCategoryAndDecksHandlers();
  renderApp('/categories/cat-1');
  expect(await screen.findByRole('link', { name: 'Cell Biology' })).toHaveAttribute(
    'href',
    '/decks/deck-1',
  );
  expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/decks/deck-1/study');
  const breadcrumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(breadcrumbs).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  expect(within(breadcrumbs).getByText('Biology')).toBeInTheDocument();
});

test('creates a deck in the current category', async () => {
  const user = userEvent.setup();
  const decks = useCategoryAndDecksHandlers([makeDeck()]);
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/deck', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeDeck({ id: 'deck-2', name: 'Genetics' });
      decks.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/categories/cat-1');
  await user.click(await screen.findByRole('button', { name: 'New deck' }));
  await user.type(screen.getByLabelText('Name'), 'Genetics');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('link', { name: 'Genetics' })).toBeInTheDocument();
  expect(postBody).toEqual({ categoryID: 'cat-1', name: 'Genetics', description: '' });
});

test('deletes a deck after a cascade-warning confirm', async () => {
  const user = userEvent.setup();
  const decks = useCategoryAndDecksHandlers([makeDeck()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/deck', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      decks.length = 0;
      return HttpResponse.json(makeDeck());
    }),
  );
  renderApp('/categories/cat-1');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete deck' });
  expect(within(dialog).getByText(/All cards in it will be deleted too/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('deck-1'));
  expect(await screen.findByText(/No decks yet/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/decks/DecksPage.test.tsx`
Expected: FAIL — module not found / not-found page rendered.

- [ ] **Step 3: Implement the page and register the route**

`src/features/decks/DecksPage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useCategory,
  useCreateDeck,
  useDecks,
  useDeleteDeck,
  useUpdateDeck,
} from '../../api/hooks';
import type { Deck } from '../../api/types';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { EntityFormDialog } from '../../components/EntityFormDialog';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function DecksPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = useCategory(categoryId);
  const decks = useDecks(categoryId ?? '');
  const createDeck = useCreateDeck();
  const updateDeck = useUpdateDeck();
  const deleteDeck = useDeleteDeck();
  const { showToast } = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState<Deck | null>(null);

  if (category.isPending || decks.isPending) return <PageLoading />;
  if (category.isError) {
    return <ErrorBanner error={category.error} onRetry={() => category.refetch()} />;
  }
  if (decks.isError) return <ErrorBanner error={decks.error} onRetry={() => decks.refetch()} />;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: category.data.name }]} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{category.data.name}</h1>
        <Button onClick={() => setCreating(true)}>New deck</Button>
      </div>

      {decks.data.length === 0 ? (
        <EmptyState message="No decks yet. Create one to start adding cards." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.data.map((deck) => (
            <li key={deck.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <Link to={`/decks/${deck.id}`} className="font-semibold text-indigo-700 hover:underline">
                {deck.name}
              </Link>
              {deck.description && <p className="mt-1 text-sm text-gray-500">{deck.description}</p>}
              <div className="mt-3 flex items-center gap-2">
                <Link
                  to={`/decks/${deck.id}/study`}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Study
                </Link>
                <Button variant="ghost" onClick={() => setEditing(deck)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setDeleting(deck)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntityFormDialog
        open={creating}
        title="New deck"
        busy={createDeck.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) =>
          createDeck.mutate(
            { categoryID: categoryId!, ...values },
            {
              onSuccess: () => setCreating(false),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <EntityFormDialog
        open={editing !== null}
        title="Edit deck"
        initial={editing ? { name: editing.name, description: editing.description } : undefined}
        busy={updateDeck.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) =>
          updateDeck.mutate(
            { id: editing!.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (err) => showToast(errorMessage(err)),
            },
          )
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete deck"
        message={
          deleting ? `Delete "${deleting.name}"? All cards in it will be deleted too.` : ''
        }
        busy={deleteDeck.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteDeck.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
```

In `src/App.tsx`, add:
```tsx
import { DecksPage } from './features/decks/DecksPage';
// inside <Route element={<Layout />}>, before the `*` route:
        <Route path="/categories/:categoryId" element={<DecksPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (3 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/decks src/App.tsx
git commit -m "feat: decks page with breadcrumbs, CRUD, and study links

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Cards page (route `/decks/:deckId`)

**Files:**
- Create: `src/features/cards/CardsPage.tsx`, `src/features/cards/CardCreateDialog.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/cards/CardsPage.test.tsx`

**Interfaces:**
- Consumes: `useDeck`, `useCategory`, `useCards`, `useTags`, `useCreateCard`, `useDeleteCard`; `Dialog`, `TagChip`, `Breadcrumbs`, plus the Task 8 pattern components.
- Produces:
  - `CardsPage` — lists cards (question text links to `/cards/:id`, "Memorized" badge, tag chips), header "Study" link, "New card" button, delete with cascade confirm.
  - `CardCreateDialog({ deckId, open, onClose, onCreated }: { deckId: string; open: boolean; onClose: () => void; onCreated: (card: Card) => void })` — question textarea + tag checkboxes; POSTs `{deckID, question, tags}`; calls `onCreated(created)` so the page can navigate to the editor.

- [ ] **Step 1: Write the failing tests**

`src/features/cards/CardsPage.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeTag } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

function useDeckPageHandlers(cards = [makeCard()]) {
  server.use(
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([makeTag()])),
    http.get('http://localhost:8080/cards', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('deckId')).toBe('deck-1');
      return HttpResponse.json(cards);
    }),
    // The create test navigates to /cards/card-2. Once Task 12 registers the
    // editor route, that page fetches these; register them so the suite has
    // no unhandled requests after Task 12 lands.
    http.get('http://localhost:8080/card', () =>
      HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' })),
    ),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
  );
  return cards;
}

test('lists cards with memorized badge, tag chips, and editor links', async () => {
  useDeckPageHandlers([
    makeCard({ tags: ['tag-1'], memorized: true }),
    makeCard({ id: 'card-2', question: 'What is DNA?' }),
  ]);
  renderApp('/decks/deck-1');
  expect(
    await screen.findByRole('link', { name: 'What is a mitochondrion?' }),
  ).toHaveAttribute('href', '/cards/card-1');
  expect(screen.getByText('Memorized')).toBeInTheDocument();
  expect(screen.getByText('exam')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/decks/deck-1/study');
});

test('creates a card with tags and navigates toward its editor', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers();
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card', async ({ request: req }) => {
      postBody = await req.json();
      return HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 });
    }),
  );
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.click(screen.getByRole('checkbox', { name: 'exam' }));
  await user.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() =>
    expect(postBody).toEqual({ deckID: 'deck-1', question: 'What is DNA?', tags: ['tag-1'] }),
  );
  // Editor route is registered in Task 12; until then navigation lands on not-found.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('deletes a card after a cascade-warning confirm', async () => {
  const user = userEvent.setup();
  const cards = useDeckPageHandlers([makeCard()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      cards.length = 0;
      return HttpResponse.json(makeCard());
    }),
  );
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete card' });
  expect(within(dialog).getByText(/answer sections and images/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('card-1'));
  expect(await screen.findByText(/No cards yet/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/cards/CardsPage.test.tsx`
Expected: FAIL — modules not found / not-found page rendered.

- [ ] **Step 3: Implement the dialog, the page, and register the route**

`src/features/cards/CardCreateDialog.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useCreateCard, useTags } from '../../api/hooks';
import type { Card } from '../../api/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';

interface CardCreateDialogProps {
  deckId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (card: Card) => void;
}

export function CardCreateDialog({ deckId, open, onClose, onCreated }: CardCreateDialogProps) {
  const tags = useTags();
  const createCard = useCreateCard();
  const { showToast } = useToast();
  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setSelectedTagIds([]);
    }
  }, [open]);

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onClose={onClose} title="New card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createCard.mutate(
            { deckID: deckId, question: question.trim(), tags: selectedTagIds },
            {
              onSuccess: onCreated,
              onError: (err) => showToast(errorMessage(err)),
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        {tags.data && tags.data.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">Tags</legend>
            <div className="flex flex-wrap gap-3">
              {tags.data.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={createCard.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!question.trim() || createCard.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

`src/features/cards/CardsPage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCards, useCategory, useDeck, useDeleteCard, useTags } from '../../api/hooks';
import type { Card } from '../../api/types';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Crumb } from '../../components/Breadcrumbs';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { TagChip } from '../../components/TagChip';
import { useToast } from '../../components/Toast';
import { CardCreateDialog } from './CardCreateDialog';

export function CardsPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const category = useCategory(deck.data?.categoryID);
  const cards = useCards(deckId ?? '');
  const tags = useTags();
  const deleteCard = useDeleteCard();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Card | null>(null);

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const tagName = (id: string) => tags.data?.find((tag) => tag.id === id)?.name;

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  crumbs.push({ label: deck.data.name });

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">{deck.data.name}</h1>
        <div className="flex gap-2">
          <Link
            to={`/decks/${deckId}/study`}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Study
          </Link>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            New card
          </Button>
        </div>
      </div>

      {cards.data.length === 0 ? (
        <EmptyState message="No cards yet. Create one to start building this deck." />
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.data.map((card) => (
            <li
              key={card.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  to={`/cards/${card.id}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {card.question}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {card.memorized && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Memorized
                    </span>
                  )}
                  {(card.tags ?? []).map((tagId) => {
                    const name = tagName(tagId);
                    return name ? <TagChip key={tagId} name={name} /> : null;
                  })}
                </div>
              </div>
              <Button variant="ghost" onClick={() => setDeleting(card)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CardCreateDialog
        deckId={deckId!}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(card) => {
          setCreating(false);
          navigate(`/cards/${card.id}`);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete card"
        message="Delete this card? Its answer sections and images will be deleted too."
        busy={deleteCard.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleteCard.mutate(deleting!.id, {
            onSuccess: () => setDeleting(null),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
```

In `src/App.tsx`, add:
```tsx
import { CardsPage } from './features/cards/CardsPage';
// inside <Route element={<Layout />}>, before the `*` route:
        <Route path="/decks/:deckId" element={<CardsPage />} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (3 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/cards src/App.tsx
git commit -m "feat: cards page with tag chips, memorized badge, create dialog, delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Card editor — question and tags (route `/cards/:cardId`)

**Files:**
- Create: `src/features/card-editor/CardEditorPage.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/card-editor/CardEditorPage.test.tsx`

**Interfaces:**
- Consumes: `useCard`, `useDeck`, `useCategory`, `useTags`, `useUpdateCard`; Task 8 pattern components.
- Produces: `CardEditorPage` with a "Question" section (textarea + tag checkboxes + Save). Saving PUTs the FULL card payload: edited `question`/`tags` plus preserved `memorized`, and includes `lastAccessedDateTime` only when the card has a non-empty one (the backend ignores empty strings, so omitting is equivalent and keeps the payload clean). Tasks 13–14 append image/section blocks to this page's JSX — keep the page's bottom structured as `{/* Question images: Task 13 */}` and `{/* Answer sections: Task 14 */}` comment anchors.

- [ ] **Step 1: Write the failing tests**

`src/features/card-editor/CardEditorPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeTag } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

function useEditorHandlers(card = makeCard()) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(card)),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
  );
}

test('prefills the question and tag selections', async () => {
  useEditorHandlers(makeCard({ tags: ['tag-1'] }));
  renderApp('/cards/card-1');
  expect(await screen.findByLabelText('Question')).toHaveValue('What is a mitochondrion?');
  expect(screen.getByRole('checkbox', { name: 'exam' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'hard' })).not.toBeChecked();
});

test('saves the full payload, preserving memorized and omitting empty lastAccessedDateTime', async () => {
  const user = userEvent.setup();
  useEditorHandlers(makeCard({ tags: ['tag-1'], memorized: true }));
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeCard({ question: 'Updated?', tags: ['tag-1', 'tag-2'], memorized: true }));
    }),
  );
  renderApp('/cards/card-1');
  const question = await screen.findByLabelText('Question');
  await user.clear(question);
  await user.type(question, 'Updated?');
  await user.click(screen.getByRole('checkbox', { name: 'hard' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(putId).toBe('card-1'));
  expect(putBody).toEqual({
    question: 'Updated?',
    tags: ['tag-1', 'tag-2'],
    memorized: true,
  });
});

test('includes lastAccessedDateTime in the payload when the card has one', async () => {
  const user = userEvent.setup();
  useEditorHandlers(makeCard({ lastAccessedDateTime: '2026-07-01T10:00:00Z' }));
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card', async ({ request: req }) => {
      putBody = await req.json();
      return HttpResponse.json(makeCard());
    }),
  );
  renderApp('/cards/card-1');
  await screen.findByLabelText('Question');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(putBody).toEqual({
      question: 'What is a mitochondrion?',
      tags: [],
      memorized: false,
      lastAccessedDateTime: '2026-07-01T10:00:00Z',
    }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/card-editor/CardEditorPage.test.tsx`
Expected: FAIL — module not found / not-found page rendered.

- [ ] **Step 3: Implement the page and register the route**

`src/features/card-editor/CardEditorPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useCard, useCategory, useDeck, useTags, useUpdateCard } from '../../api/hooks';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Crumb } from '../../components/Breadcrumbs';
import { Button } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';

export function CardEditorPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const card = useCard(cardId);
  const deck = useDeck(card.data?.deckID);
  const category = useCategory(deck.data?.categoryID);
  const tags = useTags();
  const updateCard = useUpdateCard();
  const { showToast } = useToast();

  const [question, setQuestion] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (card.data) {
      setQuestion(card.data.question);
      setSelectedTagIds(card.data.tags ?? []);
    }
  }, [card.data]);

  if (card.isPending) return <PageLoading />;
  if (card.isError) return <ErrorBanner error={card.error} onRetry={() => card.refetch()} />;

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const save = () =>
    updateCard.mutate(
      {
        id: card.data.id,
        body: {
          question: question.trim(),
          tags: selectedTagIds,
          memorized: card.data.memorized,
          ...(card.data.lastAccessedDateTime
            ? { lastAccessedDateTime: card.data.lastAccessedDateTime }
            : {}),
        },
      },
      {
        onSuccess: () => showToast('Card saved', 'success'),
        onError: (err) => showToast(errorMessage(err)),
      },
    );

  const crumbs: Crumb[] = [{ label: 'Home', to: '/' }];
  if (category.data) {
    crumbs.push({ label: category.data.name, to: `/categories/${category.data.id}` });
  }
  if (deck.data) {
    crumbs.push({ label: deck.data.name, to: `/decks/${deck.data.id}` });
  }
  crumbs.push({ label: 'Edit card' });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Breadcrumbs items={crumbs} />
        <h1 className="text-xl font-bold">Edit card</h1>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Question</h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        {tags.data && tags.data.length > 0 && (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium text-gray-700">Tags</legend>
            <div className="flex flex-wrap gap-3">
              {tags.data.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => toggleTag(tag.id)}
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={!question.trim() || updateCard.isPending}>
            Save
          </Button>
        </div>
      </section>

      {/* Question images: Task 13 */}
      {/* Answer sections: Task 14 */}
    </div>
  );
}
```

In `src/App.tsx`, add:
```tsx
import { CardEditorPage } from './features/card-editor/CardEditorPage';
// inside <Route element={<Layout />}>, before the `*` route:
        <Route path="/cards/:cardId" element={<CardEditorPage />} />
```

Note: the two MSW handlers for `/card-question-images` and `/card-answer-sections` in the test helper are unused until Tasks 13–14 wire those hooks into this page; MSW only errors on *unhandled* requests, so pre-registering them keeps this helper stable across tasks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (3 new).

- [ ] **Step 5: Commit**

```bash
git add src/features/card-editor src/App.tsx
git commit -m "feat: card editor with question editing and tag selection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: ImageStrip and question images in the card editor

**Files:**
- Create: `src/features/card-editor/ImageStrip.tsx`
- Modify: `src/features/card-editor/CardEditorPage.tsx` (replace the `{/* Question images: Task 13 */}` anchor)
- Test: `src/features/card-editor/QuestionImages.test.tsx`

**Interfaces:**
- Consumes: `uploadImageFile`, `useQuestionImages`, `useCreateQuestionImage`, `useUpdateQuestionImage`, `useDeleteQuestionImage`; `ConfirmDialog`, `Button`.
- Produces (reused verbatim by Task 14 for section images):
  - `interface StripImage { id: string; sequenceNumber: number; imageURL: string }` (both `CardQuestionImage` and `CardAnswerSectionImage` satisfy it structurally).
  - `nextSequenceNumber(items: { sequenceNumber: number }[]): number` — `max + 1`, `1` when empty.
  - `ImageStrip({ title, images, onUpload, onDelete, onSwap })` — sorts by `sequenceNumber`; hidden file input (`accept="image/*"`, aria-label `` `${title} file` ``); per-image buttons aria-labeled `` `Move ${title} ${i + 1} left|right` `` and `` `Delete ${title} ${i + 1}` ``; delete goes through an internal ConfirmDialog; `onSwap(a, b)` receives the two adjacent images whose sequence numbers the parent swaps.

- [ ] **Step 1: Write the failing tests**

`src/features/card-editor/QuestionImages.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeQuestionImage } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
import type { CardQuestionImage } from '../../api/types';

function useEditorHandlers(images: CardQuestionImage[]) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-question-images', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('cardId')).toBe('card-1');
      return HttpResponse.json(images);
    }),
  );
  return images;
}

test('uploads a question image: presign, S3 PUT, record POST with next sequence number', async () => {
  const user = userEvent.setup();
  const images = useEditorHandlers([makeQuestionImage()]);
  let presignParams: URLSearchParams | null = null;
  let s3ContentType: string | null = null;
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/new.png',
      });
    }),
    http.put('http://localhost:8080/s3-upload', ({ request: req }) => {
      s3ContentType = req.headers.get('Content-Type');
      return new HttpResponse(null, { status: 200 });
    }),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://cdn/new.png' });
      images.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const input = await screen.findByLabelText('Question images file');
  await user.upload(input, new File(['img-bytes'], 'new.png', { type: 'image/png' }));

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, imageURL: 'https://cdn/new.png' }),
  );
  expect(presignParams!.get('fileName')).toBe('new.png');
  expect(presignParams!.get('contentType')).toBe('image/png');
  expect(presignParams!.has('imageType')).toBe(false);
  expect(s3ContentType).toBe('image/png');
  expect(await screen.findByAltText('Question images 2')).toBeInTheDocument();
});

test('reordering swaps the sequence numbers of adjacent images', async () => {
  const user = userEvent.setup();
  useEditorHandlers([
    makeQuestionImage(),
    makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://cdn/2.png' }),
  ]);
  const puts: Array<{ id: string | null; body: unknown }> = [];
  server.use(
    http.put('http://localhost:8080/card-question-image', async ({ request: req }) => {
      const id = new URL(req.url).searchParams.get('id');
      const body = await req.json();
      puts.push({ id, body });
      return HttpResponse.json(makeQuestionImage({ id: id ?? '' }));
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Move Question images 1 right'));

  await waitFor(() => expect(puts).toHaveLength(2));
  expect(puts).toContainEqual({
    id: 'qimg-1',
    body: { sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/question-images/qimg-1.png' },
  });
  expect(puts).toContainEqual({
    id: 'qimg-2',
    body: { sequenceNumber: 1, imageURL: 'https://cdn/2.png' },
  });
});

test('deletes an image after confirm', async () => {
  const user = userEvent.setup();
  const images = useEditorHandlers([makeQuestionImage()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card-question-image', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      images.length = 0;
      return HttpResponse.json(makeQuestionImage());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Delete Question images 1'));
  const dialog = screen.getByRole('dialog', { name: 'Delete image' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('qimg-1'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/card-editor/QuestionImages.test.tsx`
Expected: FAIL — `ImageStrip` not found / no file input rendered.

- [ ] **Step 3: Implement ImageStrip and wire it into the editor**

`src/features/card-editor/ImageStrip.tsx`:
```tsx
import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export interface StripImage {
  id: string;
  sequenceNumber: number;
  imageURL: string;
}

export function nextSequenceNumber(items: { sequenceNumber: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sequenceNumber), 0) + 1;
}

interface ImageStripProps {
  title: string;
  images: StripImage[];
  onUpload: (file: File) => void;
  onDelete: (image: StripImage) => void;
  onSwap: (a: StripImage, b: StripImage) => void;
}

export function ImageStrip({ title, images, onUpload, onDelete, onSwap }: ImageStripProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<StripImage | null>(null);
  const sorted = [...images].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Add image
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label={`${title} file`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">No images.</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {sorted.map((image, i) => (
            <li key={image.id} className="flex flex-col gap-1">
              <img
                src={image.imageURL}
                alt={`${title} ${i + 1}`}
                className="h-32 w-32 rounded-md border border-gray-200 object-cover"
              />
              <div className="flex justify-center gap-1">
                <Button
                  variant="ghost"
                  aria-label={`Move ${title} ${i + 1} left`}
                  disabled={i === 0}
                  onClick={() => onSwap(sorted[i - 1], image)}
                >
                  ←
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Delete ${title} ${i + 1}`}
                  onClick={() => setDeleting(image)}
                >
                  ✕
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move ${title} ${i + 1} right`}
                  disabled={i === sorted.length - 1}
                  onClick={() => onSwap(image, sorted[i + 1])}
                >
                  →
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete image"
        message="Delete this image? It will also be removed from storage."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}
```

In `src/features/card-editor/CardEditorPage.tsx`:

Add imports:
```tsx
import {
  useCard,
  useCategory,
  useCreateQuestionImage,
  useDeck,
  useDeleteQuestionImage,
  useQuestionImages,
  useTags,
  useUpdateCard,
  useUpdateQuestionImage,
} from '../../api/hooks';
import { uploadImageFile } from '../../api/resources';
import { ImageStrip, nextSequenceNumber } from './ImageStrip';
import type { StripImage } from './ImageStrip';
```

Add below the existing hook calls (before the early returns):
```tsx
  const questionImages = useQuestionImages(cardId ?? '');
  const createQuestionImage = useCreateQuestionImage();
  const updateQuestionImage = useUpdateQuestionImage();
  const deleteQuestionImage = useDeleteQuestionImage();
```

Add below `save` (after the early returns, where `card.data` is narrowed):
```tsx
  const uploadQuestionImage = async (file: File) => {
    try {
      const imageUrl = await uploadImageFile(file, 'question');
      await createQuestionImage.mutateAsync({
        cardID: card.data.id,
        sequenceNumber: nextSequenceNumber(questionImages.data ?? []),
        imageURL: imageUrl,
      });
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const swapQuestionImages = async (a: StripImage, b: StripImage) => {
    try {
      await Promise.all([
        updateQuestionImage.mutateAsync({
          id: a.id,
          body: { sequenceNumber: b.sequenceNumber, imageURL: a.imageURL },
        }),
        updateQuestionImage.mutateAsync({
          id: b.id,
          body: { sequenceNumber: a.sequenceNumber, imageURL: b.imageURL },
        }),
      ]);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const removeQuestionImage = (image: StripImage) =>
    deleteQuestionImage.mutate(image.id, { onError: (err) => showToast(errorMessage(err)) });
```

Replace `{/* Question images: Task 13 */}` with:
```tsx
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <ImageStrip
          title="Question images"
          images={questionImages.data ?? []}
          onUpload={uploadQuestionImage}
          onDelete={removeQuestionImage}
          onSwap={swapQuestionImages}
        />
      </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (3 new). The Task 12 editor tests keep passing (their handler set already answers `/card-question-images`).

- [ ] **Step 5: Commit**

```bash
git add src/features/card-editor
git commit -m "feat: question image upload, reorder, and delete in card editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Answer sections with images in the card editor

**Files:**
- Create: `src/features/card-editor/AnswerSectionEditor.tsx`
- Modify: `src/features/card-editor/CardEditorPage.tsx` (replace the `{/* Answer sections: Task 14 */}` anchor)
- Test: `src/features/card-editor/AnswerSections.test.tsx`

**Interfaces:**
- Consumes: `useAnswerSections`, `useCreateAnswerSection`, `useUpdateAnswerSection`, `useDeleteAnswerSection`, `useSectionImages`, `useCreateSectionImage`, `useUpdateSectionImage`, `useDeleteSectionImage`, `uploadImageFile`; `ImageStrip`/`nextSequenceNumber`/`StripImage`; `ConfirmDialog`, `Button`.
- Produces: `AnswerSectionEditor({ section, index, isFirst, isLast, onMoveUp, onMoveDown }: { section: CardAnswerSection; index: number; isFirst: boolean; isLast: boolean; onMoveUp: () => void; onMoveDown: () => void })` — one collapsible-free card per section: title input (label `Title`), answer textarea (label `Answer`), "Save section" button, move buttons aria-labeled `` `Move section ${index + 1} up|down` ``, "Delete section" button with confirm, and an `ImageStrip` titled `` `Section ${index + 1} images` `` backed by section-image hooks with `imageType: 'answer'` uploads.
- Note: swapping two sections sends each section's **server-side** title/answer in the swap PUTs (full payload required); unsaved local edits in a section being moved are not carried along.

- [ ] **Step 1: Write the failing tests**

`src/features/card-editor/AnswerSections.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeSection, makeSectionImage } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
import type { CardAnswerSection, CardAnswerSectionImage } from '../../api/types';

function useEditorHandlers(
  sections: CardAnswerSection[],
  sectionImages: CardAnswerSectionImage[] = [],
) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('cardId')).toBe('card-1');
      return HttpResponse.json(sections);
    }),
    http.get('http://localhost:8080/card-answer-section-images', () =>
      HttpResponse.json(sectionImages),
    ),
  );
  return sections;
}

test('adds a section with the next sequence number', async () => {
  const user = userEvent.setup();
  const sections = useEditorHandlers([makeSection()]);
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeSection({ id: 'sec-2', sequenceNumber: 2, title: '', answer: '' });
      sections.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByRole('button', { name: 'Add section' }));

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, title: '', answer: '' }),
  );
});

test('saves edited title and answer with the full payload', async () => {
  const user = userEvent.setup();
  useEditorHandlers([makeSection()]);
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeSection({ title: 'Function' }));
    }),
  );
  renderApp('/cards/card-1');
  const title = await screen.findByLabelText('Title');
  await user.clear(title);
  await user.type(title, 'Function');
  await user.click(screen.getByRole('button', { name: 'Save section' }));

  await waitFor(() => expect(putId).toBe('sec-1'));
  expect(putBody).toEqual({
    sequenceNumber: 1,
    title: 'Function',
    answer: 'The powerhouse of the cell.',
  });
});

test('reordering swaps section sequence numbers with full payloads', async () => {
  const user = userEvent.setup();
  useEditorHandlers([
    makeSection(),
    makeSection({ id: 'sec-2', sequenceNumber: 2, title: 'Detail', answer: 'ATP synthesis.' }),
  ]);
  const puts: Array<{ id: string | null; body: unknown }> = [];
  server.use(
    http.put('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      puts.push({
        id: new URL(req.url).searchParams.get('id'),
        body: await req.json(),
      });
      return HttpResponse.json(makeSection());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Move section 1 down'));

  await waitFor(() => expect(puts).toHaveLength(2));
  expect(puts).toContainEqual({
    id: 'sec-1',
    body: { sequenceNumber: 2, title: 'Definition', answer: 'The powerhouse of the cell.' },
  });
  expect(puts).toContainEqual({
    id: 'sec-2',
    body: { sequenceNumber: 1, title: 'Detail', answer: 'ATP synthesis.' },
  });
});

test('deletes a section after an image-cascade confirm', async () => {
  const user = userEvent.setup();
  const sections = useEditorHandlers([makeSection()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card-answer-section', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      sections.length = 0;
      return HttpResponse.json(makeSection());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByRole('button', { name: 'Delete section' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete section' });
  expect(within(dialog).getByText(/Its images will be deleted too/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('sec-1'));
});

test('uploads a section image with imageType=answer', async () => {
  const user = userEvent.setup();
  useEditorHandlers([makeSection()], []);
  let presignParams: URLSearchParams | null = null;
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/ans.png',
      });
    }),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 200 })),
    http.post('http://localhost:8080/card-answer-section-image', async ({ request: req }) => {
      postBody = await req.json();
      return HttpResponse.json(makeSectionImage({ imageURL: 'https://cdn/ans.png' }), { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const input = await screen.findByLabelText('Section 1 images file');
  await user.upload(input, new File(['b'], 'ans.png', { type: 'image/png' }));

  await waitFor(() =>
    expect(postBody).toEqual({
      cardAnswerSectionID: 'sec-1',
      sequenceNumber: 1,
      imageURL: 'https://cdn/ans.png',
    }),
  );
  expect(presignParams!.get('imageType')).toBe('answer');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/card-editor/AnswerSections.test.tsx`
Expected: FAIL — no "Add section" button rendered.

- [ ] **Step 3: Implement AnswerSectionEditor and wire sections into the editor**

`src/features/card-editor/AnswerSectionEditor.tsx`:
```tsx
import { useEffect, useState } from 'react';
import {
  useCreateSectionImage,
  useDeleteAnswerSection,
  useDeleteSectionImage,
  useSectionImages,
  useUpdateAnswerSection,
  useUpdateSectionImage,
} from '../../api/hooks';
import { uploadImageFile } from '../../api/resources';
import type { CardAnswerSection } from '../../api/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { errorMessage } from '../../components/ErrorBanner';
import { useToast } from '../../components/Toast';
import { ImageStrip, nextSequenceNumber } from './ImageStrip';
import type { StripImage } from './ImageStrip';

interface AnswerSectionEditorProps {
  section: CardAnswerSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function AnswerSectionEditor({
  section,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: AnswerSectionEditorProps) {
  const updateSection = useUpdateAnswerSection();
  const deleteSection = useDeleteAnswerSection();
  const images = useSectionImages(section.id);
  const createImage = useCreateSectionImage();
  const updateImage = useUpdateSectionImage();
  const deleteImage = useDeleteSectionImage();
  const { showToast } = useToast();

  const [title, setTitle] = useState(section.title);
  const [answer, setAnswer] = useState(section.answer);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Depend on primitives: list refetches recreate `section` objects, and an
  // identity dep would wipe in-progress edits on every cache invalidation.
  useEffect(() => {
    setTitle(section.title);
    setAnswer(section.answer);
  }, [section.id, section.title, section.answer]);

  const save = () =>
    updateSection.mutate(
      {
        id: section.id,
        body: { sequenceNumber: section.sequenceNumber, title: title.trim(), answer },
      },
      {
        onSuccess: () => showToast('Section saved', 'success'),
        onError: (err) => showToast(errorMessage(err)),
      },
    );

  const uploadSectionImage = async (file: File) => {
    try {
      const imageUrl = await uploadImageFile(file, 'answer');
      await createImage.mutateAsync({
        cardAnswerSectionID: section.id,
        sequenceNumber: nextSequenceNumber(images.data ?? []),
        imageURL: imageUrl,
      });
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const swapImages = async (a: StripImage, b: StripImage) => {
    try {
      await Promise.all([
        updateImage.mutateAsync({
          id: a.id,
          body: { sequenceNumber: b.sequenceNumber, imageURL: a.imageURL },
        }),
        updateImage.mutateAsync({
          id: b.id,
          body: { sequenceNumber: a.sequenceNumber, imageURL: b.imageURL },
        }),
      ]);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Section {index + 1}</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            aria-label={`Move section ${index + 1} up`}
            disabled={isFirst}
            onClick={onMoveUp}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label={`Move section ${index + 1} down`}
            disabled={isLast}
            onClick={onMoveDown}
          >
            ↓
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
            Delete section
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Answer
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={4}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <div className="flex justify-end">
          <Button onClick={save} disabled={updateSection.isPending}>
            Save section
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <ImageStrip
          title={`Section ${index + 1} images`}
          images={images.data ?? []}
          onUpload={uploadSectionImage}
          onDelete={(image) =>
            deleteImage.mutate(image.id, { onError: (err) => showToast(errorMessage(err)) })
          }
          onSwap={swapImages}
        />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete section"
        message="Delete this answer section? Its images will be deleted too."
        busy={deleteSection.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() =>
          deleteSection.mutate(section.id, {
            onSuccess: () => setConfirmingDelete(false),
            onError: (err) => showToast(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
```

In `src/features/card-editor/CardEditorPage.tsx`:

Extend the hooks import with `useAnswerSections, useCreateAnswerSection, useUpdateAnswerSection`, import the section type and editor:
```tsx
import type { CardAnswerSection } from '../../api/types';
import { AnswerSectionEditor } from './AnswerSectionEditor';
```

Add below the question-image hook calls (before the early returns):
```tsx
  const sections = useAnswerSections(cardId ?? '');
  const createSection = useCreateAnswerSection();
  const updateSectionForSwap = useUpdateAnswerSection();
```

Add below the question-image helpers (after the early returns):
```tsx
  const sortedSections = [...(sections.data ?? [])].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );

  const addSection = () =>
    createSection.mutate(
      {
        cardID: card.data.id,
        sequenceNumber: nextSequenceNumber(sections.data ?? []),
        title: '',
        answer: '',
      },
      { onError: (err) => showToast(errorMessage(err)) },
    );

  const swapSections = async (a: CardAnswerSection, b: CardAnswerSection) => {
    try {
      await Promise.all([
        updateSectionForSwap.mutateAsync({
          id: a.id,
          body: { sequenceNumber: b.sequenceNumber, title: a.title, answer: a.answer },
        }),
        updateSectionForSwap.mutateAsync({
          id: b.id,
          body: { sequenceNumber: a.sequenceNumber, title: b.title, answer: b.answer },
        }),
      ]);
    } catch (err) {
      showToast(errorMessage(err));
    }
  };
```

Replace `{/* Answer sections: Task 14 */}` with:
```tsx
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Answer sections</h2>
          <Button variant="secondary" onClick={addSection} disabled={createSection.isPending}>
            Add section
          </Button>
        </div>
        {sortedSections.map((s, i) => (
          <AnswerSectionEditor
            key={s.id}
            section={s}
            index={i}
            isFirst={i === 0}
            isLast={i === sortedSections.length - 1}
            onMoveUp={() => swapSections(sortedSections[i - 1], s)}
            onMoveDown={() => swapSections(s, sortedSections[i + 1])}
          />
        ))}
      </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (5 new). Earlier editor tests keep passing (their handler sets already answer `/card-answer-sections`; Task 13's helper must now also answer `/card-answer-section-images` only if a test renders sections — it renders none, so no change needed).

- [ ] **Step 5: Commit**

```bash
git add src/features/card-editor
git commit -m "feat: answer sections with per-section images in card editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Study mode (route `/decks/:deckId/study`)

**Files:**
- Create: `src/features/study/session.ts`, `src/features/study/StudyPage.tsx`
- Modify: `src/App.tsx` (add one route line)
- Test: `src/features/study/session.test.ts`, `src/features/study/StudyPage.test.tsx`

**Interfaces:**
- Consumes: `useDeck`, `useCards`, `useUpdateCard`, `useQuestionImages`, `useAnswerSections`, `useSectionImages`; `Button`, `ErrorBanner`/`errorMessage`, `PageLoading`, `useToast`.
- Produces:
  - `interface StudyOptions { shuffle: boolean; unmemorizedOnly: boolean }` and `buildSession(cards: Card[], opts: StudyOptions, random?: () => number): Card[]` — pure; filters `memorized` cards out when `unmemorizedOnly`, Fisher–Yates shuffles with injectable `random`, never mutates the input.
  - `StudyPage` — three phases: setup (toggles + Start), active (question + images → Reveal answer → sections with images → "Got it"/"Not yet"), summary (counts + "Study again" + back link). Answering PUTs the full card payload with `memorized` set and a fresh ISO `lastAccessedDateTime`; on failure it toasts and stays on the card.

- [ ] **Step 1: Write the failing unit tests for session logic**

`src/features/study/session.test.ts`:
```ts
import { makeCard } from '../../test/fixtures';
import { buildSession } from './session';

const cards = [
  makeCard({ id: 'a', memorized: true }),
  makeCard({ id: 'b' }),
  makeCard({ id: 'c' }),
];

test('keeps order and all cards by default', () => {
  const session = buildSession(cards, { shuffle: false, unmemorizedOnly: false });
  expect(session.map((c) => c.id)).toEqual(['a', 'b', 'c']);
});

test('unmemorizedOnly filters out memorized cards', () => {
  const session = buildSession(cards, { shuffle: false, unmemorizedOnly: true });
  expect(session.map((c) => c.id)).toEqual(['b', 'c']);
});

test('shuffle permutes deterministically with an injected random and does not mutate input', () => {
  const before = cards.map((c) => c.id);
  const session = buildSession(cards, { shuffle: true, unmemorizedOnly: false }, () => 0);
  // random()=0 swaps each i with index 0: [a,b,c] -> [c,a,b]
  expect(session.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  expect(cards.map((c) => c.id)).toEqual(before);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/study/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Implement session logic**

`src/features/study/session.ts`:
```ts
import type { Card } from '../../api/types';

export interface StudyOptions {
  shuffle: boolean;
  unmemorizedOnly: boolean;
}

export function buildSession(
  cards: Card[],
  opts: StudyOptions,
  random: () => number = Math.random,
): Card[] {
  const session = opts.unmemorizedOnly ? cards.filter((c) => !c.memorized) : [...cards];
  if (opts.shuffle) {
    for (let i = session.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [session[i], session[j]] = [session[j], session[i]];
    }
  }
  return session;
}
```

Run: `npm test -- src/features/study/session.test.ts`
Expected: 3 passed.

- [ ] **Step 4: Write the failing page tests**

`src/features/study/StudyPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeDeck, makeSection } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
import type { Card } from '../../api/types';

function useStudyHandlers(cards: Card[]) {
  server.use(
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/cards', () => HttpResponse.json(cards)),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([makeSection()])),
    http.get('http://localhost:8080/card-answer-section-images', () => HttpResponse.json([])),
  );
}

test('runs a full session: reveal, answer both cards, see summary', async () => {
  const user = userEvent.setup();
  useStudyHandlers([
    makeCard({ tags: ['tag-1'] }),
    makeCard({ id: 'card-2', question: 'What is DNA?' }),
  ]);
  const puts: Array<{ id: string | null; body: Record<string, unknown> }> = [];
  server.use(
    http.put('http://localhost:8080/card', async ({ request: req }) => {
      const body = (await req.json()) as Record<string, unknown>;
      puts.push({ id: new URL(req.url).searchParams.get('id'), body });
      return HttpResponse.json(makeCard());
    }),
  );
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('What is a mitochondrion?')).toBeInTheDocument();
  expect(screen.queryByText('The powerhouse of the cell.')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  expect(screen.getByText('Definition')).toBeInTheDocument();
  expect(screen.getByText('The powerhouse of the cell.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Got it' }));
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
  expect(puts).toHaveLength(1);
  expect(puts[0].id).toBe('card-1');
  expect(puts[0].body.question).toBe('What is a mitochondrion?');
  expect(puts[0].body.tags).toEqual(['tag-1']);
  expect(puts[0].body.memorized).toBe(true);
  const stamp = new Date(puts[0].body.lastAccessedDateTime as string).getTime();
  expect(stamp).toBeGreaterThan(Date.now() - 60_000);

  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await user.click(screen.getByRole('button', { name: 'Not yet' }));

  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(puts[1].body.memorized).toBe(false);
  expect(screen.getByText(/Got it: 1/)).toBeInTheDocument();
  expect(screen.getByText(/Not yet: 1/)).toBeInTheDocument();
});

test('unmemorized-only with no unmemorized cards disables start and explains', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard({ memorized: true })]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('checkbox', { name: 'Unmemorized only' }));

  expect(screen.getByText(/All cards in this deck are memorized/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
});

test('a failed update toasts and stays on the same card', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  server.use(
    http.put('http://localhost:8080/card', () =>
      HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
    ),
  );
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await user.click(screen.getByRole('button', { name: 'Got it' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Internal Server Error');
  expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npm test -- src/features/study/StudyPage.test.tsx`
Expected: FAIL — not-found page rendered.

- [ ] **Step 6: Implement the page and register the route**

`src/features/study/StudyPage.tsx`:
```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAnswerSections,
  useCards,
  useDeck,
  useQuestionImages,
  useSectionImages,
  useUpdateCard,
} from '../../api/hooks';
import type { Card, CardAnswerSection } from '../../api/types';
import { Button } from '../../components/Button';
import { ErrorBanner, errorMessage } from '../../components/ErrorBanner';
import { PageLoading } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { buildSession } from './session';

type Phase =
  | { name: 'setup' }
  | { name: 'active'; queue: Card[]; index: number; revealed: boolean; gotIt: number; notYet: number }
  | { name: 'summary'; gotIt: number; notYet: number; total: number };

export function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const deck = useDeck(deckId);
  const cards = useCards(deckId ?? '');
  const updateCard = useUpdateCard();
  const { showToast } = useToast();

  const [shuffle, setShuffle] = useState(false);
  const [unmemorizedOnly, setUnmemorizedOnly] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });

  if (deck.isPending || cards.isPending) return <PageLoading />;
  if (deck.isError) return <ErrorBanner error={deck.error} onRetry={() => deck.refetch()} />;
  if (cards.isError) return <ErrorBanner error={cards.error} onRetry={() => cards.refetch()} />;

  const eligibleCount = unmemorizedOnly
    ? cards.data.filter((c) => !c.memorized).length
    : cards.data.length;

  const start = () => {
    const queue = buildSession(cards.data, { shuffle, unmemorizedOnly });
    if (queue.length === 0) return;
    setPhase({ name: 'active', queue, index: 0, revealed: false, gotIt: 0, notYet: 0 });
  };

  const answer = async (got: boolean) => {
    if (phase.name !== 'active') return;
    const card = phase.queue[phase.index];
    try {
      await updateCard.mutateAsync({
        id: card.id,
        body: {
          question: card.question,
          tags: card.tags ?? [],
          memorized: got,
          lastAccessedDateTime: new Date().toISOString(),
        },
      });
    } catch (err) {
      showToast(errorMessage(err));
      return;
    }
    const gotIt = phase.gotIt + (got ? 1 : 0);
    const notYet = phase.notYet + (got ? 0 : 1);
    if (phase.index + 1 >= phase.queue.length) {
      setPhase({ name: 'summary', gotIt, notYet, total: phase.queue.length });
    } else {
      setPhase({ ...phase, index: phase.index + 1, revealed: false, gotIt, notYet });
    }
  };

  if (phase.name === 'setup') {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-xl font-bold">Study: {deck.data.name}</h1>
        <p className="mb-6 text-sm text-gray-500">{cards.data.length} cards in this deck.</p>
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            Shuffle
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unmemorizedOnly}
              onChange={(e) => setUnmemorizedOnly(e.target.checked)}
            />
            Unmemorized only
          </label>
          {unmemorizedOnly && eligibleCount === 0 && (
            <p className="text-sm text-amber-700">
              All cards in this deck are memorized. Uncheck the filter to study them anyway.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Link to={`/decks/${deckId}`} className="text-sm text-gray-500 hover:underline">
              Back to deck
            </Link>
            <Button onClick={start} disabled={eligibleCount === 0}>
              Start studying
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === 'summary') {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="mb-4 text-xl font-bold">Session complete</h1>
        <p className="mb-1 text-sm text-gray-700">Got it: {phase.gotIt}</p>
        <p className="mb-6 text-sm text-gray-700">Not yet: {phase.notYet}</p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => setPhase({ name: 'setup' })}>Study again</Button>
          <Link
            to={`/decks/${deckId}`}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to deck
          </Link>
        </div>
      </div>
    );
  }

  const card = phase.queue[phase.index];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <p className="text-sm text-gray-500">
        Card {phase.index + 1} of {phase.queue.length}
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="whitespace-pre-wrap text-lg font-medium">{card.question}</p>
        <StudyQuestionImages cardId={card.id} />
      </div>
      {phase.revealed ? (
        <>
          <StudyAnswerSections cardId={card.id} />
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => answer(false)} disabled={updateCard.isPending}>
              Not yet
            </Button>
            <Button onClick={() => answer(true)} disabled={updateCard.isPending}>
              Got it
            </Button>
          </div>
        </>
      ) : (
        <div className="flex justify-center">
          <Button onClick={() => setPhase({ ...phase, revealed: true })}>Reveal answer</Button>
        </div>
      )}
    </div>
  );
}

function StudyQuestionImages({ cardId }: { cardId: string }) {
  const images = useQuestionImages(cardId);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {sorted.map((img, i) => (
        <img
          key={img.id}
          src={img.imageURL}
          alt={`Question image ${i + 1}`}
          className="max-h-64 rounded-md border border-gray-200"
        />
      ))}
    </div>
  );
}

function StudyAnswerSections({ cardId }: { cardId: string }) {
  const sections = useAnswerSections(cardId);
  const sorted = [...(sections.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  if (sorted.length === 0) {
    return <p className="text-center text-sm text-gray-500">This card has no answer sections.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sorted.map((section) => (
        <StudySectionView key={section.id} section={section} />
      ))}
    </div>
  );
}

function StudySectionView({ section }: { section: CardAnswerSection }) {
  const images = useSectionImages(section.id);
  const sorted = [...(images.data ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {section.title && <h3 className="mb-1 font-semibold">{section.title}</h3>}
      {section.answer && (
        <p className="whitespace-pre-wrap text-sm text-gray-700">{section.answer}</p>
      )}
      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {sorted.map((img, i) => (
            <img
              key={img.id}
              src={img.imageURL}
              alt={`${section.title || 'Answer'} image ${i + 1}`}
              className="max-h-64 rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

In `src/App.tsx`, add:
```tsx
import { StudyPage } from './features/study/StudyPage';
// inside <Route element={<Layout />}>, before the `*` route:
        <Route path="/decks/:deckId/study" element={<StudyPage />} />
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: all pass (6 new across both files).

- [ ] **Step 8: Commit**

```bash
git add src/features/study src/App.tsx
git commit -m "feat: study mode with shuffle, unmemorized filter, and memorized tracking

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: README and final verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything; this task gates completion on the full suite and a production build.

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
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

## Structure

- `src/api/` — backend contract: config, fetch client, types, resource functions, TanStack Query hooks
- `src/components/` — shared UI (buttons, dialogs, toasts, breadcrumbs, form dialog)
- `src/features/` — one folder per screen (categories, decks, cards, card-editor, study, tags)
- `src/test/` — MSW server, fixtures, render helper

Design spec: `docs/superpowers/specs/2026-07-06-flashcard-frontend-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-06-flashcard-frontend.md`
```

- [ ] **Step 2: Run the full verification**

Run: `npm test`
Expected: all test files pass, 0 failures.

Run: `npm run build`
Expected: `tsc` clean; Vite build succeeds.

Run: `npx vite preview --port 4173 &` then `curl -s http://localhost:4173 | grep -o '<title>[^<]*</title>'` then kill the preview.
Expected: `<title>Flashcards</title>`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, scripts, and structure

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
