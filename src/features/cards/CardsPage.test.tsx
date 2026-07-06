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
