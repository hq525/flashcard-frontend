import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeTag } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

test('lists tags', async () => {
  server.use(
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
  );
  renderApp('/tags');
  expect(await screen.findByText('exam')).toBeInTheDocument();
  expect(screen.getByText('hard')).toBeInTheDocument();
});

test('creates a tag', async () => {
  const user = userEvent.setup();
  const tags = [makeTag()];
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/tags', () => HttpResponse.json(tags)),
    http.post('http://localhost:8080/tag', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeTag({ id: 'tag-2', name: 'hard' });
      tags.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/tags');
  await user.click(await screen.findByRole('button', { name: 'New tag' }));
  await user.type(screen.getByLabelText('Name'), 'hard');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('hard')).toBeInTheDocument();
  expect(postBody).toEqual({ name: 'hard', description: '' });
});

test('deletes a tag after confirm', async () => {
  const user = userEvent.setup();
  const tags = [makeTag()];
  let deleteId: string | null = null;
  server.use(
    http.get('http://localhost:8080/tags', () => HttpResponse.json(tags)),
    http.delete('http://localhost:8080/tag', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      tags.length = 0;
      return HttpResponse.json(makeTag());
    }),
  );
  renderApp('/tags');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete tag' });
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('tag-1'));
  expect(await screen.findByText(/No tags yet/)).toBeInTheDocument();
});
