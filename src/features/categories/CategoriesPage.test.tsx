import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCategory } from '../../test/fixtures';
import { renderApp } from '../../test/utils';

test('lists categories with links to their decks', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      HttpResponse.json([makeCategory(), makeCategory({ id: 'cat-2', name: 'Chemistry' })]),
    ),
  );
  renderApp('/');
  expect(await screen.findByRole('link', { name: 'Biology' })).toHaveAttribute(
    'href',
    '/categories/cat-1',
  );
  expect(screen.getByRole('link', { name: 'Chemistry' })).toBeInTheDocument();
});

test('creates a category and refreshes the list', async () => {
  const user = userEvent.setup();
  const categories = [makeCategory()];
  let postBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json(categories)),
    http.post('http://localhost:8080/category', async ({ request: req }) => {
      postBody = await req.json();
      const created = makeCategory({ id: 'cat-2', name: 'Chemistry', description: 'Elements' });
      categories.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'New category' }));
  await user.type(screen.getByLabelText('Name'), 'Chemistry');
  await user.type(screen.getByLabelText('Description'), 'Elements');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('link', { name: 'Chemistry' })).toBeInTheDocument();
  expect(postBody).toEqual({ name: 'Chemistry', description: 'Elements' });
});

test('edits a category via a prefilled form', async () => {
  const user = userEvent.setup();
  let putId: string | null = null;
  let putBody: unknown = null;
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json([makeCategory()])),
    http.put('http://localhost:8080/category', async ({ request: req }) => {
      putId = new URL(req.url).searchParams.get('id');
      putBody = await req.json();
      return HttpResponse.json(makeCategory({ name: 'Bio 2' }));
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue('Biology');
  await user.clear(nameInput);
  await user.type(nameInput, 'Bio 2');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(putId).toBe('cat-1'));
  expect(putBody).toEqual({ name: 'Bio 2', description: 'Life science' });
});

test('deletes a category after a cascade-warning confirm', async () => {
  const user = userEvent.setup();
  let deleteId: string | null = null;
  const categories = [makeCategory()];
  server.use(
    http.get('http://localhost:8080/categories', () => HttpResponse.json(categories)),
    http.delete('http://localhost:8080/category', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      categories.length = 0;
      return HttpResponse.json(makeCategory());
    }),
  );
  renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete category' });
  expect(
    within(dialog).getByText(/All decks and cards inside it will be deleted too/),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('cat-1'));
  expect(await screen.findByText(/No categories yet/)).toBeInTheDocument();
});

test('shows an error banner when the list fails', async () => {
  server.use(
    http.get('http://localhost:8080/categories', () =>
      HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
    ),
  );
  renderApp('/');
  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
});
