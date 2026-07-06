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
