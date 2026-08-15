import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { server } from '../test/server';
import { makeCard, makeCategory, makeDeck, makeTag } from '../test/fixtures';
import {
  useCards,
  useCategories,
  useCreateCategory,
  useDecks,
  useDeleteCard,
  useTags,
} from './hooks';

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

test('useCategories sorts categories by name', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      HttpResponse.json([
        makeCategory({ id: 'cat-2', name: 'Physics' }),
        makeCategory({ id: 'cat-3', name: 'Chemistry' }),
        makeCategory({ id: 'cat-1', name: 'Biology' }),
      ]),
    ),
  );
  const { result } = renderHook(() => useCategories(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((c) => c.name)).toEqual(['Biology', 'Chemistry', 'Physics']);
});

test('useDecks sorts decks by name', async () => {
  server.use(
    http.get('http://localhost:8080/decks', () =>
      HttpResponse.json([
        makeDeck({ id: 'deck-2', name: 'Genetics' }),
        makeDeck({ id: 'deck-1', name: 'Cell Biology' }),
      ]),
    ),
  );
  const { result } = renderHook(() => useDecks('cat-1'), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((d) => d.name)).toEqual(['Cell Biology', 'Genetics']);
});

test('useTags sorts tags by name', async () => {
  server.use(
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag({ id: 'tag-2', name: 'hard' }), makeTag({ id: 'tag-1', name: 'exam' })]),
    ),
  );
  const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((t) => t.name)).toEqual(['exam', 'hard']);
});

test('useCards sorts cards oldest-first by creation time', async () => {
  server.use(
    http.get('http://localhost:8080/cards', () =>
      HttpResponse.json([
        makeCard({ id: 'card-3', createdDateTime: '2026-07-08T00:00:00Z' }),
        makeCard({ id: 'card-1', createdDateTime: '2026-07-06T00:00:00Z' }),
        makeCard({ id: 'card-2', createdDateTime: '2026-07-07T00:00:00Z' }),
      ]),
    ),
  );
  const { result } = renderHook(() => useCards('deck-1'), { wrapper: createWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((c) => c.id)).toEqual(['card-1', 'card-2', 'card-3']);
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
