import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';
import { testSession } from './auth';

vi.mock('../auth/session', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/session')>(),
  getAuthSession: () => testSession,
}));
beforeEach(() => {
  testSession.generation = 0;
  testSession.status = 'authenticated';
  testSession.getIdToken.mockReset().mockImplementation(async () => {
    if (testSession.status !== 'authenticated') throw new Error('Sign in to continue.');
    return 'test-owner-id-token';
  });
  testSession.lock.mockClear();
  testSession.clear.mockClear();
});

// jsdom has no ResizeObserver (used by the study flip card's height animation).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());
