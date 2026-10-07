import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeQuestionImage, makeSchedule, makeSection, makeSectionImage } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

beforeEach(() => {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/cards', () => HttpResponse.json([makeCard()])),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([makeSection()])),
    http.get('http://localhost:8080/card-answer-section-images', () => HttpResponse.json([])),
  );
});

test('opens the selected card from the list and flips without studying or changing it', async () => {
  const user = userEvent.setup();
  const card = makeCard({ schedule: makeSchedule({ dueAt: '2099-01-01T00:00:00Z' }) });
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(card)),
    http.get('http://localhost:8080/cards', () => HttpResponse.json([card])),
  );
  const requests: Request[] = [];
  const recordRequest = ({ request }: { request: Request }) => requests.push(request);
  server.events.on('request:start', recordRequest);
  try {
    const view = renderApp('/decks/deck-1');
    await user.click(await screen.findByRole('link', { name: card.question }));
    const flip = await screen.findByRole('button', { name: 'Flip card' });
    expect(flip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const answer = await screen.findByText('The powerhouse of the cell.');
    expect(answer.closest('[aria-hidden="true"]')).not.toBeNull();

    await user.click(flip);
    expect(flip).toHaveAttribute('aria-pressed', 'true');
    expect(answer.closest('[aria-hidden="true"]')).toBeNull();
    flip.focus();
    await user.keyboard('{Enter}');
    expect(flip).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard(' ');
    expect(flip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Again|Hard|Good|Easy/ })).not.toBeInTheDocument();
    await waitFor(() => expect(view.queryClient.isFetching()).toBe(0));
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(requests.some(request => new URL(request.url).pathname.startsWith('/card-review'))).toBe(false);
  } finally {
    server.events.removeListener('request:start', recordRequest);
  }
});

test('opens the editor only through Edit and returns to the preview with saved content', async () => {
  const user = userEvent.setup();
  let card = makeCard();
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(card)),
    http.put('http://localhost:8080/card', async ({ request }) => {
      card = { ...card, ...await request.json() as { question: string } };
      return HttpResponse.json(card);
    }),
  );
  renderApp('/cards/card-1');
  const edit = await screen.findByRole('link', { name: 'Edit' });
  expect(edit).toHaveAttribute('href', '/cards/card-1/edit');
  await user.click(edit);
  expect(await screen.findByRole('heading', { name: 'Edit card', level: 1 })).toBeInTheDocument();
  const question = await screen.findByLabelText('Question');
  await user.clear(question);
  await user.type(question, 'Updated question');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Card saved');
  await user.click(screen.getByRole('link', { name: 'View card' }));
  expect(await screen.findByRole('button', { name: 'Flip card' })).toHaveTextContent('Updated question');
  expect(await screen.findByRole('link', { name: 'Cell Biology' })).toHaveAttribute('href', '/decks/deck-1');
});

test('shows ordered content on both faces and enlarges images without flipping', async () => {
  const user = userEvent.setup();
  server.use(
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([makeQuestionImage()])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([
      makeSection({ id: 'sec-2', sequenceNumber: 2, title: 'Details', answer: 'More detail.' }),
      makeSection(),
    ])),
    http.get('http://localhost:8080/card-answer-section-images', ({ request }) => HttpResponse.json(
      new URL(request.url).searchParams.get('cardAnswerSectionId') === 'sec-1' ? [makeSectionImage()] : [],
    )),
  );
  renderApp('/cards/card-1');
  const flip = await screen.findByRole('button', { name: 'Flip card' });
  await user.click(await screen.findByRole('button', { name: 'Enlarge Question image 1' }));
  expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument();
  expect(flip).toHaveAttribute('aria-pressed', 'false');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(flip);
  expect(within(flip).getAllByRole('heading').map(heading => heading.textContent)).toEqual(['Definition', 'Details']);
  expect(screen.getByRole('button', { name: 'Enlarge Question image 1', hidden: true }).closest('[inert]')).not.toBeNull();
  await user.click(await screen.findByRole('button', { name: 'Enlarge Definition image 1' }));
  expect(within(screen.getByRole('dialog')).getByAltText('Enlarged view')).toHaveAttribute('src', 'https://bucket.s3.amazonaws.com/answer-images/simg-1.png');
  expect(flip).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('dialog'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('reports a card fetch failure and can retry', async () => {
  const user = userEvent.setup();
  server.use(http.get('http://localhost:8080/card', () => HttpResponse.json({ message: 'Card unavailable' }, { status: 404 })));
  renderApp('/cards/card-1');
  expect(await screen.findByRole('alert')).toHaveTextContent('Card unavailable');
  expect(screen.queryByRole('button', { name: 'Flip card' })).not.toBeInTheDocument();
  server.use(http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())));
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Flip card' })).toBeInTheDocument();
});

test('reports missing answer data as an error and retries without flipping back', async () => {
  const user = userEvent.setup();
  server.use(http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json({ message: 'Answers unavailable' }, { status: 500 })));
  renderApp('/cards/card-1');
  const flip = await screen.findByRole('button', { name: 'Flip card' });
  await user.click(flip);
  expect(await screen.findByRole('alert')).toHaveTextContent('Answers unavailable');
  expect(screen.queryByText('This card has no answer sections.')).not.toBeInTheDocument();
  server.use(http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([makeSection()])));
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('The powerhouse of the cell.')).toBeInTheDocument();
  expect(flip).toHaveAttribute('aria-pressed', 'true');
});

test('explains when the selected card has no answer sections', async () => {
  const user = userEvent.setup();
  server.use(http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])));
  renderApp('/cards/card-1');
  await user.click(await screen.findByRole('button', { name: 'Flip card' }));
  expect(await screen.findByText('This card has no answer sections.')).toBeInTheDocument();
});
