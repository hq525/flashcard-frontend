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
  expect(screen.queryByText('The powerhouse of the cell.')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  expect(screen.getByText('Definition')).toBeInTheDocument();
  expect(screen.getByText('The powerhouse of the cell.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Got it' }));
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
  expect(puts).toHaveLength(1);
  expect(puts[0].id).toBe('card-1');
  expect(puts[0].body.question).toBe('What is a mitochondrion?');
  expect(puts[0].body.tags).toEqual(['tag-1']);
  expect(puts[0].body.memorized).toBe(true);
  const stamp = new Date(puts[0].body.lastAccessedDateTime as string).getTime();
  expect(stamp).toBeGreaterThan(Date.now() - 60_000);

  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await user.click(screen.getByRole('button', { name: 'Not yet' }));

  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(puts[1].body.memorized).toBe(false);
  expect(screen.getByText(/Got it: 1/)).toBeInTheDocument();
  expect(screen.getByText(/Not yet: 1/)).toBeInTheDocument();
});

test('unmemorized-only with no unmemorized cards disables start and explains', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard({ memorized: true })]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('checkbox', { name: 'Unmemorized only' }));

  expect(screen.getByText(/All cards in this deck are memorized/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
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
  await user.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await user.click(screen.getByRole('button', { name: 'Got it' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Internal Server Error');
  expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
});
