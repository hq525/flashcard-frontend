import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { makeCard, makeCategory, makeDeck } from '../test/fixtures';
import { cardsApi, categoriesApi, decksApi, uploadImageFile } from './resources';

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

test('uploadImageFile presigns, PUTs to S3 with the file content type, and returns imageUrl', async () => {
  const s3Url = 'http://localhost:8080/s3-upload';
  let presignParams: URLSearchParams | null = null;
  let s3ContentType: string | null = null;
  let s3Body: ArrayBuffer | null = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({ presignedUrl: s3Url, imageUrl: 'https://cdn/img.png' });
    }),
    http.put(s3Url, async ({ request: req }) => {
      s3ContentType = req.headers.get('Content-Type');
      s3Body = await req.arrayBuffer();
      return new HttpResponse(null, { status: 200 });
    }),
  );

  const file = new File(['fake-bytes'], 'diagram.png', { type: 'image/png' });
  const imageUrl = await uploadImageFile(file, 'answer');

  expect(imageUrl).toBe('https://cdn/img.png');
  expect(presignParams!.get('fileName')).toBe('diagram.png');
  expect(presignParams!.get('contentType')).toBe('image/png');
  expect(presignParams!.get('imageType')).toBe('answer');
  expect(s3ContentType).toBe('image/png');
  expect(new TextDecoder().decode(s3Body!)).toBe('fake-bytes');
});

test('uploadImageFile omits imageType for question images and rejects on S3 failure', async () => {
  let presignParams: URLSearchParams | null = null;
  server.use(
    http.get('http://localhost:8080/presigned-url', ({ request: req }) => {
      presignParams = new URL(req.url).searchParams;
      return HttpResponse.json({ presignedUrl: 'http://localhost:8080/s3-upload', imageUrl: 'https://cdn/q.png' });
    }),
    http.put('http://localhost:8080/s3-upload', () => new HttpResponse(null, { status: 403 })),
  );

  const file = new File(['x'], 'q.png', { type: 'image/png' });
  await expect(uploadImageFile(file, 'question')).rejects.toThrow('Image upload failed');
  expect(presignParams!.has('imageType')).toBe(false);
});
