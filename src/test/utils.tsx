import { AuthContext } from '../auth/AuthProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../App';
import { ToastProvider } from '../components/Toast';

export function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ logout: async () => {} }}>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <AppRoutes />
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

export async function readImageUpload(request: Request, parent = 'cardId') {
  const params = new URL(request.url).searchParams;
  expect(request.headers.get('Content-Type')).toBe('image/png');
  expect(request.headers.get('Authorization')).toBe('Bearer test-owner-id-token');
  return { [parent === 'cardId' ? 'cardID' : 'cardAnswerSectionID']: params.get(parent), sequenceNumber: Number(params.get('sequenceNumber')), bytes: await request.text() };
}
