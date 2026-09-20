import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { makeCard, makeCategory, makeDeck } from '../test/fixtures';
import { cardsApi, categoriesApi, decksApi, uploadQuestionImage, uploadSectionImage } from './resources';

test('categoriesApi covers list/get/create/update/remove with correct routes', async () => {
  const cat = makeCategory();
  const calls: string[] = [];
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json([cat])),
    http.get('http://localhost:8080/category', ({ request: req }) => {
      calls.push('get:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
    http.post('http://localhost:8080/category', () => HttpResponse.json(cat, { status: 201 })),
    http.put('http://localhost:8080/category', ({ request: req }) => {
      calls.push('put:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
    http.delete('http://localhost:8080/category', ({ request: req }) => {
      calls.push('delete:' + new URL(req.url).searchParams.get('id'));
      return HttpResponse.json(cat);
    }),
  );

  expect(await categoriesApi.list()).toEqual([cat]);
  expect(await categoriesApi.get('cat-1')).toEqual(cat);
  expect(await categoriesApi.create({ name: 'Biology', description: '' })).toEqual(cat);
  expect(await categoriesApi.update('cat-1', { name: 'Bio', description: '' })).toEqual(cat);
  expect(await categoriesApi.remove('cat-1')).toEqual(cat);
  expect(calls).toEqual(['get:cat-1', 'put:cat-1', 'delete:cat-1']);
});

test('list functions pass the parent-id query param', async () => {
  let deckParam: string | null = null;
  let cardParam: string | null = null;
  server.use(
    http.get('http://localhost:8080/decks', ({ request: req }) => {
      deckParam = new URL(req.url).searchParams.get('categoryId');
      return HttpResponse.json([makeDeck()]);
    }),
    http.get('http://localhost:8080/cards', ({ request: req }) => {
      cardParam = new URL(req.url).searchParams.get('deckId');
      return HttpResponse.json([makeCard()]);
    }),
  );
  await decksApi.list('cat-1');
  await cardsApi.list('deck-1');
  expect(deckParam).toBe('cat-1');
  expect(cardParam).toBe('deck-1');
});

test.each([
  ['question', '/card-question-image', 'cardId'],
  ['answer', '/card-answer-section-image', 'cardAnswerSectionId'],
])('uploads %s bytes through the authenticated API and returns its DTO', async (kind, path, parent) => {
  let received: unknown;
  const created = { id: 'new-image', sequenceNumber: 2, imageURL: 'https://bucket.s3.amazonaws.com/images/id.png?signature=abc' };
  server.use(http.post(`http://localhost:8080${path}`, async ({ request }) => {
    received = {
      parent: new URL(request.url).searchParams.get(parent),
      sequence: new URL(request.url).searchParams.get('sequenceNumber'),
      type: request.headers.get('Content-Type'),
      authorization: request.headers.get('Authorization'),
      body: await request.text(),
    };
    return HttpResponse.json(created, { status: 201 });
  }));
  const upload = kind === 'question' ? uploadQuestionImage : uploadSectionImage;
  expect(await upload(new File(['image bytes'], 'photo.png', { type: 'image/png' }), 'parent-1', 2)).toEqual(created);
  expect(received).toEqual({ parent: 'parent-1', sequence: '2', type: 'image/png', authorization: 'Bearer test-owner-id-token', body: 'image bytes' });
});

test('rejects unsupported and oversized images before a network request', async () => {
  await expect(uploadQuestionImage(new File(['svg'], 'x.svg', { type: 'image/svg+xml' }), 'card-1', 1)).rejects.toThrow(/JPEG, PNG, GIF or WebP/);
  await expect(uploadQuestionImage(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }), 'card-1', 1)).rejects.toThrow(/4 MiB/);
});
