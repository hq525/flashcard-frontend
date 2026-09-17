import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeDeck, makeQuestionImage, makeSection, makeSchedule } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
import type { Card, ReviewCardRequest, ReviewRating } from '../../api/types';

function useStudyHandlers(cards: Card[]) {
  server.use(
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/cards', () => HttpResponse.json(cards)),
    http.get('http://localhost:8080/card', ({ request }) => HttpResponse.json(cards.find(c => c.id === new URL(request.url).searchParams.get('id')))),
    http.get('http://localhost:8080/card-review-options', ({ request }) => {
      const cardId = new URL(request.url).searchParams.get('cardId');
      return HttpResponse.json({ cardId, revision: 0, generatedAt: new Date().toISOString(), options: [
        { rating: 'again', intervalSeconds: 600, state: 'relearning' },
        { rating: 'hard', intervalSeconds: 86400, state: 'review' },
        { rating: 'good', intervalSeconds: 345600, state: 'review' },
        { rating: 'easy', intervalSeconds: 2592000, state: 'review' },
      ].map(option => ({ ...option, dueAt: new Date(Date.now() + option.intervalSeconds * 1000).toISOString() })) });
    }),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([makeSection()])),
    http.get('http://localhost:8080/card-answer-section-images', () => HttpResponse.json([])),
  );
}

function reviewResponse(card: Card, body: ReviewCardRequest, seconds = 86400) {
  const reviewedAt = new Date().toISOString();
  const schedule = makeSchedule({ dueAt: new Date(Date.now() + seconds * 1000).toISOString(), state: seconds < 86400 ? 'relearning' : 'review', lastReviewAt: reviewedAt });
  return { card: { ...card, schedule, reviewRevision: body.expectedRevision + 1 }, review: {
    id: body.reviewId, entityType: 'card_review', cardId: card.id, requestId: body.reviewId,
    rating: body.rating, reviewedAt, previousSchedule: makeSchedule(), schedule, revision: body.expectedRevision + 1,
  } };
}

test('four recall choices show server intervals and post only the review contract', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard({ tags: ['tag-1'] }), makeCard({ id: 'card-2', question: 'What is DNA?' })]);
  const posts: Array<{ id: string | null; body: ReviewCardRequest }> = [];
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => {
    const body = await request.json() as ReviewCardRequest;
    const id = new URL(request.url).searchParams.get('cardId');
    posts.push({ id, body });
    return HttpResponse.json(reviewResponse(makeCard({ id: id! }), body));
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('The powerhouse of the cell.').closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /Good Recalled/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  expect(await screen.findByRole('button', { name: 'Again Forgot 10 min' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Hard Recalled with effort 1 day' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Easy Recalled easily 30 days' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Good Recalled 4 days' }));
  expect(await screen.findByText('Card 2 of 2')).toBeInTheDocument();
  expect(posts).toHaveLength(1);
  expect(posts[0].id).toBe('card-1');
  expect(posts[0].body).toEqual({ rating: 'good', expectedRevision: 0, reviewId: expect.any(String) });
  expect(posts[0].body.reviewId).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: /Hard Recalled with effort/ }));
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(screen.getByText('Reviews saved: 2')).toBeInTheDocument();
  expect(screen.getByText('Recalled: 2')).toBeInTheDocument();
});

test('active study shows a Quit link back to the deck', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  expect(screen.getByRole('link', { name: 'Quit' })).toHaveAttribute('href', '/decks/deck-1');
});

test('tapping an image enlarges it in a lightbox without flipping the card', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  server.use(
    http.get('http://localhost:8080/card-question-images', () =>
      HttpResponse.json([makeQuestionImage()]),
    ),
  );
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  await user.click(await screen.findByRole('button', { name: 'Enlarge Question image 1' }));
  const lightbox = screen.getByRole('dialog', { name: 'Image preview' });
  expect(lightbox).toBeInTheDocument();
  // The card did not flip: answer buttons only appear on the flipped side.
  expect(screen.queryByRole('button', { name: /Good Recalled/ })).not.toBeInTheDocument();

  await user.click(lightbox);
  expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
});

test('clicking a flipped card flips it back to the question', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  const flip = screen.getByRole('button', { name: 'Flip card' });
  await user.click(flip);
  expect(await screen.findByRole('button', { name: /Good Recalled/ })).toBeInTheDocument();

  await user.click(flip);
  expect(screen.queryByRole('button', { name: /Good Recalled/ })).not.toBeInTheDocument();
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

test('due mode queues the oldest due cards first', async () => {
  const user = userEvent.setup();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  useStudyHandlers([
    makeCard({ id: 'strong', question: 'Strong card', leitnerBox: 3, lastAccessedDateTime: daysAgo(6) }),
    makeCard({ id: 'weak', question: 'Weak card', leitnerBox: 1, lastAccessedDateTime: daysAgo(2) }),
  ]);
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));

  expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
  expect(screen.getByText('Strong card')).toBeInTheDocument();
});

test('a failed review toasts and stays on the same card', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  server.use(
    http.post('http://localhost:8080/card-review', () =>
      HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
    ),
  );
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: /Good Recalled/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
  expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
});

test('a failed save retries the identical request and prevents choosing another rating', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  const requests: ReviewCardRequest[] = [];
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => {
    const body = await request.json() as ReviewCardRequest;
    requests.push(body);
    if (requests.length === 1) return HttpResponse.error();
    return HttpResponse.json(reviewResponse(makeCard(), body));
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: /Good Recalled/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Easy Recalled easily/ })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: /Retry saving/ }));
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(screen.getByText('Reviews saved: 1')).toBeInTheDocument();
});

test('a conflict refreshes the card and previews before accepting a new rating', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  const requests: ReviewCardRequest[] = [];
  let revision = 0;
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard({ question: 'Updated question', reviewRevision: revision }))),
    http.get('http://localhost:8080/card-review-options', () => HttpResponse.json({ cardId: 'card-1', revision, generatedAt: new Date().toISOString(), options: [
      { rating: 'good', intervalSeconds: revision === 0 ? 86400 : 172800, dueAt: new Date(Date.now() + 172800000).toISOString(), state: 'review' },
    ] })),
    http.post('http://localhost:8080/card-review', async ({ request }) => {
      const body = await request.json() as ReviewCardRequest;
      requests.push(body);
      if (requests.length === 1) { revision = 7; return HttpResponse.json({ message: 'Review conflict' }, { status: 409 }); }
      return HttpResponse.json(reviewResponse(makeCard(), body));
    }),
  );
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: 'Good Recalled 1 day' }));
  expect(await screen.findByText('Updated question')).toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Good Recalled 2 days' }));
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(requests[1].expectedRevision).toBe(7);
  expect(requests[1].reviewId).not.toBe(requests[0].reviewId);
  expect(screen.getByText('Reviews saved: 1')).toBeInTheDocument();
});

test('Again waits ten minutes then returns the saved card once, with a new review identity', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  const requests: ReviewCardRequest[] = [];
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => {
    const body = await request.json() as ReviewCardRequest;
    requests.push(body);
    return HttpResponse.json(reviewResponse(makeCard(), body, body.rating === 'again' ? 600 : 86400));
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  const again = await screen.findByRole('button', { name: /Again Forgot/ });
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    fireEvent.click(again);
    expect(await screen.findByText('Next review in 10:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Flip card' })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(599000));
    expect(screen.getByText('Next review in 0:01')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(await screen.findByRole('button', { name: 'Flip card' }));
    fireEvent.click(await screen.findByRole('button', { name: /Good Recalled/ }));
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(screen.getByText('Reviews saved: 2')).toBeInTheDocument();
    expect(screen.getByText('Cards studied: 1')).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[1].reviewId).not.toBe(requests[0].reviewId);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test('finishing a waiting session retains the saved schedule and due count', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => HttpResponse.json(reviewResponse(makeCard(), await request.json() as ReviewCardRequest, 600))));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: /Again Forgot/ }));
  await user.click(await screen.findByRole('button', { name: 'Finish now' }));
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(screen.getByText(/1 card scheduled for later/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Study again' }));
  expect(screen.getByRole('radio', { name: 'Due for review (0)' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
});

test('all-card practice includes future FSRS cards and still uses the review endpoint', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard({ schedule: makeSchedule({ dueAt: new Date(Date.now() + 86400000).toISOString() }) })]);
  let saved: ReviewRating | undefined;
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => {
    const body = await request.json() as ReviewCardRequest;
    saved = body.rating;
    return HttpResponse.json(reviewResponse(makeCard(), body));
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('radio', { name: 'All cards' }));
  await user.click(screen.getByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  await user.click(await screen.findByRole('button', { name: /Easy Recalled easily/ }));
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(saved).toBe('easy');
});


test('a missing preview can be retried without sending a review', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  let fail = true;
  server.use(http.get('http://localhost:8080/card-review-options', () => {
    if (fail) return HttpResponse.json({ message: 'Preview unavailable' }, { status: 500 });
    return HttpResponse.json({ cardId: 'card-1', revision: 3, generatedAt: new Date().toISOString(), options: [
      { rating: 'good', intervalSeconds: 86400, dueAt: new Date(Date.now() + 86400000).toISOString(), state: 'review' },
    ] });
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Preview unavailable');
  expect(screen.queryByRole('button', { name: /Good Recalled/ })).not.toBeInTheDocument();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Good Recalled 1 day' })).toBeEnabled();
});

test('resuming due mode includes a persisted relearning card and excludes future cards', async () => {
  const user = userEvent.setup();
  useStudyHandlers([
    makeCard({ question: 'Saved relearning card', schedule: makeSchedule({ state: 'relearning', dueAt: new Date(Date.now() - 1000).toISOString() }) }),
    makeCard({ id: 'future-card', question: 'Not due yet', schedule: makeSchedule({ dueAt: new Date(Date.now() + 600000).toISOString() }) }),
  ]);
  renderApp('/decks/deck-1/study');
  expect(await screen.findByRole('radio', { name: 'Due for review (1)' })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Start studying' }));
  expect(screen.getByText('Saved relearning card')).toBeInTheDocument();
  expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
  expect(screen.queryByText('Not due yet')).not.toBeInTheDocument();
});

test('repeated clicks during a save submit one review', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard()]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let count = 0;
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => {
    const body = await request.json() as ReviewCardRequest;
    count += 1;
    await held;
    return HttpResponse.json(reviewResponse(makeCard(), body));
  }));
  renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  const good = await screen.findByRole('button', { name: /Good Recalled/ });
  fireEvent.click(good);
  fireEvent.click(good);
  await waitFor(() => expect(count).toBe(1));
  expect(good).toBeDisabled();
  release();
  expect(await screen.findByText('Session complete')).toBeInTheDocument();
  expect(screen.getByText('Reviews saved: 1')).toBeInTheDocument();
});

test('other cards continue while a failed card waits and unmount clears its timer', async () => {
  const user = userEvent.setup();
  useStudyHandlers([makeCard(), makeCard({ id: 'card-2', question: 'Second card' })]);
  server.use(http.post('http://localhost:8080/card-review', async ({ request }) => HttpResponse.json(reviewResponse(makeCard(), await request.json() as ReviewCardRequest, 600))));
  const view = renderApp('/decks/deck-1/study');
  await user.click(await screen.findByRole('button', { name: 'Start studying' }));
  await user.click(screen.getByRole('button', { name: 'Flip card' }));
  const again = await screen.findByRole('button', { name: /Again Forgot/ });
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    fireEvent.click(again);
    expect(await screen.findByText('Second card')).toBeInTheDocument();
    expect(screen.getByText('Reviews saved: 1 · 1 pending')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test('a persisted learning card becomes selectable when due while setup is open', async () => {
  useStudyHandlers([makeCard({ schedule: makeSchedule({ state: 'learning', dueAt: new Date(Date.now() + 10000).toISOString() }) })]);
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  try {
    const view = renderApp('/decks/deck-1/study');
    expect(await screen.findByRole('radio', { name: 'Due for review (0)' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole('radio', { name: 'Due for review (1)' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start studying' })).toBeEnabled();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
