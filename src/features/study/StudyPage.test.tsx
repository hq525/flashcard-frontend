import { screen } from '@testing-library/react';
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
  // The answer face is pre-rendered on the back of the card but hidden.
  expect(
    screen.getByText('The powerhouse of the cell.').closest('[aria-hidden="true"]'),
  ).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  expect(screen.getByText('Definition')).toBeInTheDocument();
  expect(
    screen.getByText('The powerhouse of the cell.').closest('[aria-hidden="true"]'),
  ).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Got it' }));
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
  expect(puts).toHaveLength(1);
  expect(puts[0].id).toBe('card-1');
  expect(puts[0].body.question).toBe('What is a mitochondrion?');
  expect(puts[0].body.tags).toEqual(['tag-1']);
  expect(puts[0].body.memorized).toBe(true);
  // Got it promotes the card out of Leitner box 1.
  expect(puts[0].body.leitnerBox).toBe(2);
  const stamp = new Date(puts[0].body.lastAccessedDateTime as string).getTime();
  expect(stamp).toBeGreaterThan(Date.now() - 60_000);

  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(screen.getByRole('button', { name: 'Not yet' }));

  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(puts[1].body.memorized).toBe(false);
  // Not yet demotes back to box 1.
  expect(puts[1].body.leitnerBox).toBe(1);
  expect(screen.getByText(/Got it: 1/)).toBeInTheDocument();
  expect(screen.getByText(/Not yet: 1/)).toBeInTheDocument();
});

test('active study shows a Quit link back to the deck', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  expect(screen.getByRole('link', { name: 'Quit' })).toHaveAttribute('href', '/decks/deck-1');
});

test('clicking a flipped card flips it back to the question', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  const flip = screen.getByRole('button', { name: 'Flip card' });
  await user.click(flip);
  expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();

  await user.click(flip);
  expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeInTheDocument();
  expect(
    screen.getByText('The powerhouse of the cell.').closest('[aria-hidden="true"]'),
  ).not.toBeNull();
});

test('unmemorized-only with no unmemorized cards disables start and explains', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard({ memorized: true })]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('radio', { name: 'Unmemorized only' }));

  expect(screen.getByText(/All cards in this deck are memorized/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
});

test('due mode counts only due cards and disables start when nothing is due', async () => {
  useStudyHandlers([
    // Box 5 card reviewed moments ago: not due for 16 days.
    makeCard({ leitnerBox: 5, lastAccessedDateTime: new Date().toISOString() }),
  ]);
  renderApp('/decks/deck-1/study');

  expect(await screen.findByRole('radio', { name: 'Due for review (0)' })).toBeChecked();
  expect(screen.getByText(/Nothing is due right now/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
});

test('due mode queues the weakest cards first', async () => {
  const user = userEvent.setup();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  useStudyHandlers([
    makeCard({ id: 'strong', question: 'Strong card', leitnerBox: 3, lastAccessedDateTime: daysAgo(5) }),
    makeCard({ id: 'weak', question: 'Weak card', leitnerBox: 1, lastAccessedDateTime: daysAgo(2) }),
  ]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('Weak card')).toBeInTheDocument();
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
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(screen.getByRole('button', { name: 'Got it' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
  expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
});
