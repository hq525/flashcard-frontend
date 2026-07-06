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
