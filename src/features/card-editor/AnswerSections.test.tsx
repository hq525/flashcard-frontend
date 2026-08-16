import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeSection, makeSectionImage } from '../../test/fixtures';
import { renderApp } from '../../test/utils';
import type { CardAnswerSection, CardAnswerSectionImage } from '../../api/types';

function useEditorHandlers(
  sections: CardAnswerSection[],
  sectionImages: CardAnswerSectionImage[] = [],
) {
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json(makeCard())),
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('cardId')).toBe('card-1');
      return HttpResponse.json(sections);
    }),
    http.get('http://localhost:8080/card-answer-section-images', () =>
      HttpResponse.json(sectionImages),
    ),
  );
  return sections;
}

test('adds a section with the next sequence number', async () => {
  const user = userEvent.setup();
  const sections = useEditorHandlers([makeSection()]);
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeSection({ id: 'sec-2', sequenceNumber: 2, title: '', answer: '' });
      sections.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByRole('button', { name: 'Add section' }));

  await waitFor(() =>
    expect(postBody).toEqual({ cardID: 'card-1', sequenceNumber: 2, title: '', answer: '' }),
  );
});

test('saves edited title and answer with the full payload', async () => {
  const user = userEvent.setup();
  useEditorHandlers([makeSection()]);
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.put('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeSection({ title: 'Function' }));
    }),
  );
  renderApp('/cards/card-1');
  const title = await screen.findByLabelText('Title');
  await user.clear(title);
  await user.type(title, 'Function');
  await user.click(screen.getByRole('button', { name: 'Save section' }));

  await waitFor(() => expect(putId).toBe('sec-1'));
  expect(putBody).toEqual({
    sequenceNumber: 1,
    title: 'Function',
    answer: 'The powerhouse of the cell.',
  });
});

test('reordering swaps section sequence numbers with full payloads', async () => {
  const user = userEvent.setup();
  useEditorHandlers([
    makeSection(),
    makeSection({ id: 'sec-2', sequenceNumber: 2, title: 'Detail', answer: 'ATP synthesis.' }),
  ]);
  const puts: Array<{ id: string | null; body: unknown }> = [];
  server.use(
    http.put('http://localhost:8080/card-answer-section', async ({ request: req }) => {
      puts.push({
        id: new URL(req.url).searchParams.get('id'),
        body: await req.json(),
      });
      return HttpResponse.json(makeSection());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByLabelText('Move section 1 down'));

  await waitFor(() => expect(puts).toHaveLength(2));
  expect(puts).toContainEqual({
    id: 'sec-1',
    body: { sequenceNumber: 2, title: 'Definition', answer: 'The powerhouse of the cell.' },
  });
  expect(puts).toContainEqual({
    id: 'sec-2',
    body: { sequenceNumber: 1, title: 'Detail', answer: 'ATP synthesis.' },
  });
});

test('deletes a section after an image-cascade confirm', async () => {
  const user = userEvent.setup();
  const sections = useEditorHandlers([makeSection()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card-answer-section', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      sections.length = 0;
      return HttpResponse.json(makeSection());
    }),
  );
  renderApp('/cards/card-1');
  await user.click(await screen.findByRole('button', { name: 'Delete section' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete section' });
  expect(within(dialog).getByText(/Its images will be deleted too/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('sec-1'));
});

test('uploads a section image with imageType=answer', async () => {
  const user = userEvent.setup();
  useEditorHandlers([makeSection()], []);
  let presignParams: URLSearchParams | null = null;
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/ans.png',
      });
    }),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 200 })),
    http.post('http://localhost:8080/card-answer-section-image', async ({ request: req }) => {
      postBody = await req.json();
      return HttpResponse.json(makeSectionImage({ imageURL: 'https://cdn/ans.png' }), { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const input = await screen.findByLabelText('Section 1 images file');
  await user.upload(input, new File(['b'], 'ans.png', { type: 'image/png' }));

  await waitFor(() =>
    expect(postBody).toEqual({
      cardAnswerSectionID: 'sec-1',
      sequenceNumber: 1,
      imageURL: 'https://cdn/ans.png',
    }),
  );
  expect(presignParams!.get('imageType')).toBe('answer');
});

test('dropping a file on a section dropzone uploads it', async () => {
  useEditorHandlers([makeSection()], []);
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', () =>
      HttpResponse.json({
        presignedUrl: 'http://localhost:8080/s3-upload',
        imageUrl: 'https://cdn/ans.png',
      }),
    ),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 200 })),
    http.post('http://localhost:8080/card-answer-section-image', async ({ request: req }) => {
      postBody = await req.json();
      return HttpResponse.json(makeSectionImage({ imageURL: 'https://cdn/ans.png' }), { status: 201 });
    }),
  );
  renderApp('/cards/card-1');
  const dropzone = await screen.findByLabelText('Section 1 images: drop images or click to browse');
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [new File(['b'], 'ans.png', { type: 'image/png' })] },
  });

  await waitFor(() =>
    expect(postBody).toEqual({
      cardAnswerSectionID: 'sec-1',
      sequenceNumber: 1,
      imageURL: 'https://cdn/ans.png',
    }),
  );
});
