import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/server';
import { makeCard, makeCategory, makeDeck, makeQuestionImage, makeTag } from '../../test/fixtures';
import { renderApp, readImageUpload } from '../../test/utils';

function useDeckPageHandlers(cards = [makeCard()]) {
  server.use(
    http.get('http://localhost:8080/deck', () => HttpResponse.json(makeDeck())),
    http.get('http://localhost:8080/category', () => HttpResponse.json(makeCategory())),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([makeTag()])),
    http.get('http://localhost:8080/cards', ({ request: req }) => {
      expect(new URL(req.url).searchParams.get('deckId')).toBe('deck-1');
      return HttpResponse.json(cards);
    }),
    // The create test navigates to /cards/card-2; the editor page fetches
    // these on arrival.
    http.get('http://localhost:8080/card', () =>
      HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' })),
    ),
    http.get('http://localhost:8080/card-question-images', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
  );
  return cards;
}

// Closing the create dialog starts a new route and its queries. Keep this
// test's handlers alive until that editor has rendered and all requests settle.
async function waitForCreatedCardEditor(view: ReturnType<typeof renderApp>) {
  expect(await screen.findByRole('heading', { name: 'Edit card', level: 1 })).toBeInTheDocument();
  await waitFor(() => {
    expect(view.queryClient.isFetching()).toBe(0);
    expect(view.queryClient.isMutating()).toBe(0);
    expect(view.queryClient.getQueryCache().getAll().filter((query) => query.state.status === 'error')).toEqual([]);
  });
  expect(screen.getByLabelText('Question')).toHaveValue('What is DNA?');
}

test('lists cards with memorized badge, tag chips, and editor links', async () => {
  useDeckPageHandlers([
    makeCard({ tags: ['tag-1'], memorized: true }),
    makeCard({ id: 'card-2', question: 'What is DNA?' }),
  ]);
  renderApp('/decks/deck-1');
  const cardLink = await screen.findByRole('link', { name: 'What is a mitochondrion?' });
  expect(cardLink).toHaveAttribute('href', '/cards/card-1');
  expect(screen.getByText('Memorized')).toBeInTheDocument();
  // Scoped to the card row: the tag also appears in the filter bar.
  expect(within(cardLink.closest('li')!).getByText('exam')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Study' })).toHaveAttribute('href', '/decks/deck-1/study');
});

test('filters cards to those carrying every selected tag', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers([
    makeCard({ id: 'card-1', question: 'Exam only', tags: ['tag-1'] }),
    makeCard({ id: 'card-2', question: 'Exam and hard', tags: ['tag-1', 'tag-2'] }),
    makeCard({ id: 'card-3', question: 'Untagged' }),
  ]);
  server.use(
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
  );
  renderApp('/decks/deck-1');
  expect(await screen.findByText('Untagged')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Filter by exam' }));
  expect(screen.getByText('Exam only')).toBeInTheDocument();
  expect(screen.getByText('Exam and hard')).toBeInTheDocument();
  expect(screen.queryByText('Untagged')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Filter by hard' }));
  expect(screen.queryByText('Exam only')).not.toBeInTheDocument();
  expect(screen.getByText('Exam and hard')).toBeInTheDocument();

  // Deselecting restores.
  await user.click(screen.getByRole('button', { name: 'Filter by hard' }));
  await user.click(screen.getByRole('button', { name: 'Filter by exam' }));
  expect(screen.getByText('Untagged')).toBeInTheDocument();
});

test('shows a no-match message when the tag filter excludes every card', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers([
    makeCard({ id: 'card-1', question: 'Exam only', tags: ['tag-1'] }),
    makeCard({ id: 'card-2', question: 'Hard only', tags: ['tag-2'] }),
  ]);
  server.use(
    http.get('http://localhost:8080/tags', () =>
      HttpResponse.json([makeTag(), makeTag({ id: 'tag-2', name: 'hard' })]),
    ),
  );
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'Filter by exam' }));
  await user.click(screen.getByRole('button', { name: 'Filter by hard' }));

  expect(screen.getByText(/No cards match/)).toBeInTheDocument();
});

test('creates a card with tags and navigates toward its editor', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers();
  let postBody: unknown = null;
  server.use(
    http.post('http://localhost:8080/card', async ({ request: req }) => {
      postBody = await req.json();
      return HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 });
    }),
  );
  const view = renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.click(screen.getByRole('button', { name: 'Select tags' }));
  await user.click(await screen.findByRole('checkbox', { name: 'exam' }));
  await user.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() =>
    expect(postBody).toEqual({ deckID: 'deck-1', question: 'What is DNA?', tags: ['tag-1'] }),
  );
  // Navigation to the editor closes the dialog.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitForCreatedCardEditor(view);
});

test('tag multiselect shows "No tags available" in its dropdown when there are no tags', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers();
  server.use(http.get('http://localhost:8080/tags', () => HttpResponse.json([])));
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  // The dropdown content only appears once the multiselect is opened.
  expect(screen.queryByText('No tags available')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select tags' }));
  expect(await screen.findByText('No tags available')).toBeInTheDocument();
});

test('creates a card with images: uploads each through the API in order', async () => {
  // jsdom has no object URLs; the dialog uses them for thumbnails.
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  const user = userEvent.setup();
  useDeckPageHandlers();
  const imagePosts: unknown[] = [];
  server.use(
    http.post('http://localhost:8080/card', async () =>
      HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 }),
    ),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      imagePosts.push(await readImageUpload(req));
      return HttpResponse.json(makeQuestionImage({ id: `qimg-${imagePosts.length}` }), { status: 201 });
    }),
  );
  const view = renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.upload(screen.getByLabelText('Card images file'), [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ]);
  expect(screen.getByAltText('Selected image 1')).toBeInTheDocument();
  expect(screen.getByAltText('Selected image 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() =>
    expect(imagePosts).toEqual([
      { cardID: 'card-2', sequenceNumber: 1, bytes: 'a' },
      { cardID: 'card-2', sequenceNumber: 2, bytes: 'b' },
    ]),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitForCreatedCardEditor(view);
});

test('removing a selected image before submit skips its upload', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  const user = userEvent.setup();
  useDeckPageHandlers();
  const imagePosts: unknown[] = [];
  server.use(
    http.post('http://localhost:8080/card', async () =>
      HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 }),
    ),
    http.post('http://localhost:8080/card-question-image', async ({ request: req }) => {
      imagePosts.push(await readImageUpload(req));
      return HttpResponse.json(makeQuestionImage(), { status: 201 });
    }),
  );
  const view = renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.upload(screen.getByLabelText('Card images file'), [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ]);
  await user.click(screen.getByRole('button', { name: 'Remove image 1' }));
  await user.click(screen.getByRole('button', { name: 'Create' }));

  await waitFor(() =>
    expect(imagePosts).toEqual([{ cardID: 'card-2', sequenceNumber: 1, bytes: 'b' }]),
  );
  await waitForCreatedCardEditor(view);
});

test.each(['unauthorized', 'unknown-result'] as const)('retains a partially uploaded card after %s without replaying completed writes', async (failure) => {
  const { testSession } = await import('../../test/auth');
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  let cardPosts = 0;
  const uploads: unknown[] = [];
  server.use(
    http.post('http://localhost:8080/card', () => {
      cardPosts++;
      return HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 });
    }),
    http.post('http://localhost:8080/card-question-image', async ({ request }) => {
      uploads.push(await readImageUpload(request));
      if (uploads.length === 2) {
        if (failure === 'unauthorized') return HttpResponse.json({ message: 'Sign in' }, { status: 401 });
        await testSession.lock();
      }
      return HttpResponse.json(makeQuestionImage({ id: `qimg-${uploads.length}`, cardID: 'card-2' }), { status: 201 });
    }),
  );
  const view = renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.upload(screen.getByLabelText('Card images file'), [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ]);
  await user.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(view.queryClient.isMutating()).toBe(0));
  expect(testSession.status).toBe('locked');
  expect(cardPosts).toBe(1);
  expect(uploads).toHaveLength(2);
  expect(screen.getByLabelText('Question')).toHaveValue('What is DNA?');
  expect(screen.getByLabelText('Question')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Remove image 1' })).toBeDisabled();
  expect(screen.getByAltText('Selected image 2')).toBeInTheDocument();
  testSession.status = 'authenticated';

  if (failure === 'unauthorized') {
    await user.click(screen.getByRole('button', { name: 'Continue uploads' }));
    await waitForCreatedCardEditor(view);
    expect(cardPosts).toBe(1);
    expect(uploads).toEqual([
      { cardID: 'card-2', sequenceNumber: 1, bytes: 'a' },
      { cardID: 'card-2', sequenceNumber: 2, bytes: 'b' },
      { cardID: 'card-2', sequenceNumber: 2, bytes: 'b' },
    ]);
  } else {
    expect(screen.queryByRole('button', { name: 'Continue uploads' })).not.toBeInTheDocument();
    expect(screen.getByText(/may have completed/i)).toBeInTheDocument();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Open saved card' }));
    confirm.mockRestore();
    await waitForCreatedCardEditor(view);
    expect(cardPosts).toBe(1);
    expect(uploads).toHaveLength(2);
  }
});

test('dropping files onto the dropzone adds them as pending images', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  const dropzone = screen.getByLabelText('Drop images here or click to browse');
  const files = [new File(['a'], 'a.png', { type: 'image/png' })];
  fireEvent.drop(dropzone, { dataTransfer: { files } });

  expect(await screen.findByAltText('Selected image 1')).toBeInTheDocument();
});

test.each(['unmount', 'discard'] as const)('releases draft image previews on %s', async (action) => {
  URL.createObjectURL = vi.fn(() => 'blob:private-draft');
  const revoke = vi.fn();
  URL.revokeObjectURL = revoke;
  useDeckPageHandlers();
  const view = renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.upload(screen.getByLabelText('Card images file'), new File(['a'], 'a.png', { type: 'image/png' }));
  expect(screen.getByAltText('Selected image 1')).toHaveAttribute('src', 'blob:private-draft');
  expect(revoke).not.toHaveBeenCalled();

  if (action === 'unmount') view.unmount();
  else {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    confirm.mockRestore();
  }
  expect(revoke).toHaveBeenCalledWith('blob:private-draft');
});

test('non-image files dropped on the dropzone are ignored with a toast', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  const dropzone = screen.getByLabelText('Drop images here or click to browse');
  fireEvent.drop(dropzone, {
    dataTransfer: {
      files: [
        new File(['pdf'], 'doc.pdf', { type: 'application/pdf' }),
        new File(['a'], 'a.png', { type: 'image/png' }),
      ],
    },
  });

  expect(await screen.findByText('Choose JPEG, PNG, GIF or WebP images.')).toBeInTheDocument();
  expect(screen.getByAltText('Selected image 1')).toBeInTheDocument();
  expect(screen.queryByAltText('Selected image 2')).not.toBeInTheDocument();
});

test('files over 10MB are rejected with a toast', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  const big = new File(['x'], 'big.png', { type: 'image/png' });
  Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
  fireEvent.drop(screen.getByLabelText('Drop images here or click to browse'), {
    dataTransfer: { files: [big] },
  });

  expect(await screen.findByText('Images must contain data and be 4 MiB or smaller.')).toBeInTheDocument();
  expect(screen.queryByAltText('Selected image 1')).not.toBeInTheDocument();
});

test('adding the same file twice keeps one copy and shows a toast', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  const file = new File(['a'], 'a.png', { type: 'image/png' });
  const input = screen.getByLabelText('Card images file');
  await user.upload(input, file);
  await user.upload(input, file);

  expect(await screen.findByText('Image already added')).toBeInTheDocument();
  expect(screen.getByAltText('Selected image 1')).toBeInTheDocument();
  expect(screen.queryByAltText('Selected image 2')).not.toBeInTheDocument();
});

test('submit shows per-image upload progress on the Create button', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  const user = userEvent.setup();
  useDeckPageHandlers();
  let releaseFirstUpload!: () => void;
  const firstUploadGate = new Promise<void>((resolve) => {
    releaseFirstUpload = resolve;
  });
  let puts = 0;
  server.use(
    http.post('http://localhost:8080/card', async () =>
      HttpResponse.json(makeCard({ id: 'card-2', question: 'What is DNA?' }), { status: 201 }),
    ),
    http.post('http://localhost:8080/card-question-image', async () => {
      puts += 1;
      if (puts === 1) await firstUploadGate;
      return HttpResponse.json(makeQuestionImage(), { status: 201 });
    }),
  );
  const view = renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'What is DNA?');
  await user.upload(screen.getByLabelText('Card images file'), [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: 'image/png' }),
  ]);
  await user.click(screen.getByRole('button', { name: 'Create' }));

  // First upload is gated open, so the button reports image 1 of 2.
  expect(await screen.findByRole('button', { name: /Uploading 1\/2/ })).toBeInTheDocument();
  releaseFirstUpload();
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitForCreatedCardEditor(view);
});

test('dismissing a dirty new-card dialog asks for confirmation', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.type(screen.getByLabelText('Question'), 'Half-typed');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  // Declined the confirm: dialog stays open with the draft intact.
  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument();

  confirmSpy.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  confirmSpy.mockRestore();
});

test('dismissing a pristine new-card dialog closes without confirmation', async () => {
  const user = userEvent.setup();
  useDeckPageHandlers();
  const confirmSpy = vi.spyOn(window, 'confirm');
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'New card' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(confirmSpy).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  confirmSpy.mockRestore();
});

test('pasting an image into the dialog adds it as a pending image', async () => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  useDeckPageHandlers();
  renderApp('/decks/deck-1');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'New card' }));

  fireEvent.paste(screen.getByLabelText('Question'), {
    clipboardData: { files: [new File(['a'], 'image.png', { type: 'image/png' })] },
  });

  expect(await screen.findByAltText('Selected image 1')).toBeInTheDocument();
});

test('deletes a card after a cascade-warning confirm', async () => {
  const user = userEvent.setup();
  const cards = useDeckPageHandlers([makeCard()]);
  let deleteId: string | null = null;
  server.use(
    http.delete('http://localhost:8080/card', ({ request: req }) => {
      deleteId = new URL(req.url).searchParams.get('id');
      cards.length = 0;
      return HttpResponse.json(makeCard());
    }),
  );
  renderApp('/decks/deck-1');
  await user.click(await screen.findByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete card' });
  expect(within(dialog).getByText(/answer sections and images/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

  await waitFor(() => expect(deleteId).toBe('card-1'));
  expect(await screen.findByText(/No cards yet/)).toBeInTheDocument();
});
