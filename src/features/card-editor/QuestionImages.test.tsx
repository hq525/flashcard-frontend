import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeQuestionImage } from '../../test/fixtures';
import { renderApp, readImageUpload } from '../../test/utils';
import type { CardQuestionImage } from '../../api/types';

function useEditorHandlers(images: CardQuestionImage[]) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-question-images', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('cardId')).toBe('card-1');
      return HttpResponse.json(images);
    }),
  );
  return images;
}

test('uploads a question image through the API with the next sequence number', async () => {
  const user = userEvent.setup();
  const images = useEditorHandlers([makeQuestionImage()]);
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      postBody = await readImageUpload(req);
      const created = makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/new.png' });
      images.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const input = await screen.findByLabelText('Question images file');
  await user.upload(input, new File(['img-bytes'], 'new.png', { type: 'image/png' }));

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, bytes: 'img-bytes' }),
  );
  expect(await screen.findByAltText('Question images 2')).toBeInTheDocument();
});

test('dropping two files uploads both with consecutive sequence numbers', async () => {
  const images = useEditorHandlers([makeQuestionImage()]);
  const postBodies: unknown[] = [];
  server.use(
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      const body = await readImageUpload(req);
      postBodies.push(body);
      const created = makeQuestionImage({
        id: `qimg-${body.sequenceNumber}`,
        sequenceNumber: body.sequenceNumber,
        imageURL: 'https://bucket.s3.amazonaws.com/images/uploaded.png',
      });
      images.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const dropzone = await screen.findByLabelText('Question images: drop images or click to browse');
  fireEvent.drop(dropzone, {
    dataTransfer: {
      files: [
        new File(['a'], 'a.png', { type: 'image/png' }),
        new File(['b'], 'b.png', { type: 'image/png' }),
      ],
    },
  });

  await waitFor(() =>
    expect(postBodies).toEqual([
      { cardID: 'card-1', sequenceNumber: 2, bytes: 'a' },
      { cardID: 'card-1', sequenceNumber: 3, bytes: 'b' },
    ]),
  );
});

test('pasting an image on a focused dropzone uploads it to that strip', async () => {
  const images = useEditorHandlers([makeQuestionImage()]);
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      postBody = await readImageUpload(req);
      const created = makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/pasted.png' });
      images.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const dropzone = await screen.findByLabelText('Question images: drop images or click to browse');
  dropzone.focus();
  fireEvent.paste(dropzone, {
    clipboardData: { files: [new File(['p'], 'pasted.png', { type: 'image/png' })] },
  });

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, bytes: 'p' }),
  );
});

test('reordering swaps the sequence numbers of adjacent images', async () => {
  const user = userEvent.setup();
  useEditorHandlers([
    makeQuestionImage(),
    makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/2.png' }),
  ]);
  const puts: Array<{ id: string | null; body: unknown }> = [];
  server.use(
    http.put('http://localhost:8080/card-question-image', async ({ request: req }) => {
      const id = new URL(req.url).searchParams.get('id');
      const body = await req.json();
      puts.push({ id, body });
      return HttpResponse.json(makeQuestionImage({ id: id ?? '' }));
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Move Question images 1 right'));

  await waitFor(() => expect(puts).toHaveLength(2));
  expect(puts).toContainEqual({
    id: 'qimg-1',
    body: { sequenceNumber: 2 },
  });
  expect(puts).toContainEqual({
    id: 'qimg-2',
    body: { sequenceNumber: 1 },
  });
});

test('deletes an image after confirm', async () => {
  const user = userEvent.setup();
  const images = useEditorHandlers([makeQuestionImage()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card-question-image', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      images.length = 0;
      return HttpResponse.json(makeQuestionImage());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Delete Question images 1'));
  const dialog = screen.getByRole('dialog', { name: 'Delete image' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('qimg-1'));
});
