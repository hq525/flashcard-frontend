import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeTag } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

function useEditorHandlers(card = makeCard()) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(card)),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
  );
}

test('prefills the question and tag selections', async () => {
  useEditorHandlers(makeCard({ tags: ['tag-1'] }));
  renderApp('/cards/card-1');
  expect(await screen.findByLabelText('Question')).toHaveValue('What is a mitochondrion?');
  expect(await screen.findByRole('checkbox', { name: 'exam' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'hard' })).not.toBeChecked();
});

test('saves the full payload, preserving memorized and omitting empty lastAccessedDateTime', async () => {
  const user = userEvent.setup();
  useEditorHandlers(makeCard({ tags: ['tag-1'], memorized: true }));
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeCard({ question: 'Updated?', tags: ['tag-1', 'tag-2'], memorized: true }));
    }),
  );
  renderApp('/cards/card-1');
  const question = await screen.findByLabelText('Question');
  await user.clear(question);
  await user.type(question, 'Updated?');
  await user.click(await screen.findByRole('checkbox', { name: 'hard' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(putId).toBe('card-1'));
  expect(putBody).toEqual({
    question: 'Updated?',
    tags: ['tag-1', 'tag-2'],
    memorized: true,
  });
});

test('includes lastAccessedDateTime in the payload when the card has one', async () => {
  const user = userEvent.setup();
  useEditorHandlers(makeCard({ lastAccessedDateTime: '2026-07-01T10:00:00Z' }));
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card', async ({ request: req }) => {
      putBody = await req.json();
      return HttpResponse.json(makeCard());
    }),
  );
  renderApp('/cards/card-1');
  await screen.findByLabelText('Question');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(putBody).toEqual({
      question: 'What is a mitochondrion?',
      tags: [],
      memorized: false,
      lastAccessedDateTime: '2026-07-01T10:00:00Z',
    }),
  );
});
