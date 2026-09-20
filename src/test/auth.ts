// Explicit authenticated transport fixture; real session behavior has its own tests.
export const testSession = {
  generation: 0,
  status: 'authenticated' as 'authenticated' | 'locked' | 'anonymous',
  getIdToken: vi.fn(async () => 'test-owner-id-token'),
  clear: vi.fn(async () => { testSession.generation++; testSession.status = 'anonymous'; }),
  lock: vi.fn(async () => { testSession.generation++; testSession.status = 'locked'; }),
};
