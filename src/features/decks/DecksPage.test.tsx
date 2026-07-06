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
