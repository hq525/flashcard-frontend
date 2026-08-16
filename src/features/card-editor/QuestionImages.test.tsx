import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeQuestionImage } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
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

test('uploads a question image: presign, S3 PUT, record POST with next sequence number', async () => {
  const user = userEvent.setup();
  const images = useEditorHandlers([makeQuestionImage()]);
  let presignParams: URLSearchParams | null = null;
  let s3ContentType: string | null = null;
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/new.png',
      });
    }),
    http.put('http://localhost:8080/s3-upload', ({ request: req }) => {
      s3ContentType = req.headers.get('Content-Type');
      return new HttpResponse(null, { status: 200 });
    }),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://cdn/new.png' });
      images.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const input = await screen.findByLabelText('Question images file');
  await user.upload(input, new File(['img-bytes'], 'new.png', { type: 'image/png' }));

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, imageURL: 'https://cdn/new.png' }),
  );
  expect(presignParams!.get('fileName')).toBe('new.png');
  expect(presignParams!.get('contentType')).toBe('image/png');
  expect(presignParams!.has('imageType')).toBe(false);
  expect(s3ContentType).toBe('image/png');
  expect(await screen.findByAltText('Question images 2')).toBeInTheDocument();
});

test('dropping two files uploads both with consecutive sequence numbers', async () => {
  const images = useEditorHandlers([makeQuestionImage()]);
  const postBodies: unknown[] = [];
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      const fileName = new URL(req.url).searchParams.get('fileName');
      return HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: `https://cdn/${fileName}`,
      });
    }),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 200 })),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      const body = (await req.json()) as { sequenceNumber: number; imageURL: string };
      postBodies.push(body);
      const created = makeQuestionImage({
        id: `qimg-${body.sequenceNumber}`,
        sequenceNumber: body.sequenceNumber,
        imageURL: body.imageURL,
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
      { cardID: 'card-1', sequenceNumber: 2, imageURL: 'https://cdn/a.png' },
      { cardID: 'card-1', sequenceNumber: 3, imageURL: 'https://cdn/b.png' },
    ]),
  );
});

test('pasting an image on a focused dropzone uploads it to that strip', async () => {
  const images = useEditorHandlers([makeQuestionImage()]);
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', () =>
      HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/pasted.png',
      }),
    ),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 200 })),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://cdn/pasted.png' });
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
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, imageURL: 'https://cdn/pasted.png' }),
  );
});

test('reordering swaps the sequence numbers of adjacent images', async () => {
  const user = userEvent.setup();
  useEditorHandlers([
    makeQuestionImage(),
    makeQuestionImage({ id: 'qimg-2', sequenceNumber: 2, imageURL: 'https://cdn/2.png' }),
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
    body: { sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/question-images/qimg-1.png' },
  });
  expect(puts).toContainEqual({
    id: 'qimg-2',
    body: { sequenceNumber: 1, imageURL: 'https://cdn/2.png' },
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
