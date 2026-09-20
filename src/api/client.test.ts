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

test('sends the owner ID token as Bearer and never sends a shared key', async () => {
  vi.stubEnv('VITE_API_KEY', 'obsolete-key');
  let headers: Headers | undefined;
  server.use(http.get('http://localhost:8080/categories', ({ request }) => {
    headers = request.headers;
    return HttpResponse.json([]);
  }));
  await request('GET', '/categories');
  expect(headers?.get('Authorization')).toBe('Bearer test-owner-id-token');
  expect(headers?.has('X-Api-Key')).toBe(false);
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
  const err = (await request('GET', '/category', { params: { id: 'nope' } }).catch((e) => e)) as ApiError;
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
  const err = (await request('GET', '/categories').catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(502);
  expect(err.message).toBe('Request failed with status 502');
});

test('does not send any request without a valid session', async () => {
  const { testSession } = await import('../test/auth');
  testSession.getIdToken.mockRejectedValueOnce(new Error('Sign in to continue.'));
  await expect(request('GET', '/categories')).rejects.toThrow('Sign in');
});

test.each([401, 403])('locks for reauthentication on 401 and clears permission denial on 403: %s', async (status) => {
  const { testSession } = await import('../test/auth');
  server.use(http.get('http://localhost:8080/categories', () => HttpResponse.json({ message: 'Unauthorized' }, { status })));
  await expect(request('GET', '/categories')).rejects.toThrow('Unauthorized');
  expect(testSession.generation).toBe(1);
  expect(testSession.status).toBe(status === 401 ? 'locked' : 'anonymous');
});

test('rejects an in-flight response arriving after logout', async () => {
  const { testSession } = await import('../test/auth');
  server.use(http.get('http://localhost:8080/categories', async () => {
    await testSession.clear();
    return HttpResponse.json([{ id: 'private' }]);
  }));
  await expect(request('GET', '/categories')).rejects.toThrow('Session ended');
});

test('does not start an upload if logout occurs while file bytes are being read', async () => {
  const { testSession } = await import('../test/auth');
  let uploads = 0;
  server.use(http.post('http://localhost:8080/card-question-image', () => {
    uploads++;
    return HttpResponse.json({ id: 'image' });
  }));
  const file = new File(['x'], 'x.png', { type: 'image/png' });
  vi.spyOn(file, 'arrayBuffer').mockImplementationOnce(async () => { await testSession.clear(); return new ArrayBuffer(1); });
  await expect(request('POST', '/card-question-image', { file })).rejects.toThrow('Session ended');
  expect(uploads).toBe(0);
});


test('an unauthorized mutation is never replayed and further requests are blocked while locked', async () => {
  let mutations = 0;
  server.use(http.post('http://localhost:8080/card', () => {
    mutations++; return HttpResponse.json({ message: 'Sign in' }, { status: 401 });
  }));
  await expect(request('POST', '/card', { body: { question: 'Draft' } })).rejects.toThrow('Sign in');
  await expect(request('POST', '/card', { body: { question: 'Draft' } })).rejects.toThrow('Sign in');
  expect(mutations).toBe(1);
});

test('a response started before locking cannot populate the resumed session', async () => {
  const { testSession } = await import('../test/auth');
  server.use(http.get('http://localhost:8080/categories', async () => {
    await testSession.lock();
    testSession.status = 'authenticated';
    return HttpResponse.json([{ id: 'old-response' }]);
  }));
  await expect(request('GET', '/categories')).rejects.toThrow('Session ended');
});

test('locking while token acquisition resolves prevents a request with the old token', async () => {
  const { testSession } = await import('../test/auth');
  let requests = 0;
  server.use(http.get('http://localhost:8080/categories', () => {
    requests++; return HttpResponse.json([]);
  }));
  testSession.getIdToken.mockImplementationOnce(async () => {
    await testSession.lock(); return 'previous-token';
  });
  await expect(request('GET', '/categories')).rejects.toThrow('Session ended');
  expect(requests).toBe(0);
});

test.each(['rejected', 'not-sent', 'late-response', 'network', 'invalid-response', 'server-error'] as const)(
  'distinguishes known rejected writes from an uncertain upload result: %s', async (scenario) => {
    const { testSession } = await import('../test/auth');
    let uploads = 0;
    server.use(http.post('http://localhost:8080/card-question-image', async () => {
      uploads++;
      if (scenario === 'rejected') return HttpResponse.json({ message: 'Sign in' }, { status: 401 });
      if (scenario === 'network') return HttpResponse.error();
      if (scenario === 'invalid-response') return new HttpResponse('broken JSON', { status: 201 });
      if (scenario === 'server-error') return new HttpResponse(null, { status: 502 });
      await testSession.lock();
      return HttpResponse.json({ id: 'saved-image' }, { status: 201 });
    }));
    if (scenario === 'not-sent') await testSession.lock();
    const error = await request('POST', '/card-question-image', {
      file: new File(['x'], 'x.png', { type: 'image/png' }),
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).outcomeUnknown).toBe(!['rejected', 'not-sent'].includes(scenario));
    expect(uploads).toBe(scenario === 'not-sent' ? 0 : 1);
  },
);
