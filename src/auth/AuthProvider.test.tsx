import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ErrorResponse, User } from 'oidc-client-ts';
import { AuthProvider } from './AuthProvider';
import { AuthSession } from './session';

const config = { authority: 'https://cognito-idp.ap-southeast-1.amazonaws.com/pool', clientId: 'client', domain: 'https://test.auth.ap-southeast-1.amazoncognito.com', origin: window.location.origin };
let session: AuthSession;
beforeEach(() => { window.history.replaceState({}, '', '/'); localStorage.clear(); sessionStorage.clear(); session = new AuthSession(config); });
afterEach(async () => { await act(() => session.clear()); vi.restoreAllMocks(); vi.useRealTimers(); window.history.replaceState({}, '', '/'); });
function mount() {
  const qc = new QueryClient();
  qc.setQueryData(['private'], 'secret');
  render(<QueryClientProvider client={qc}><AuthProvider session={session}><p>Private library</p></AuthProvider></QueryClientProvider>);
  return qc;
}

test('anonymous visitors cannot mount private routes', async () => {
  const qc = mount();
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByText('Private library')).toBeNull();
  expect(qc.getQueryData(['private'])).toBeUndefined();
});

test('logout unmounts private routes and clears private query data', async () => {
  const exp = Math.floor(Date.now() / 1000) + 1000;
  await session.manager.storeUser(new User({ id_token: 'id', access_token: 'access', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } }));
  const qc = mount();
  expect(await screen.findByText('Private library')).toBeInTheDocument();
  await act(() => session.clear());
  await waitFor(() => expect(screen.queryByText('Private library')).toBeNull());
  expect(qc.getQueryData(['private'])).toBeUndefined();
});

test('logout removes private content and cache before waiting for token revocation', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const navigate = vi.fn();
  session = new AuthSession(config, navigate);
  const exp = Math.floor(Date.now() / 1000) + 1000;
  await session.manager.storeUser(new User({ id_token: 'id', access_token: 'access', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  server.use(http.post(`${config.domain}/oauth2/revoke`, async () => { await gate; return new HttpResponse(null); }));
  const qc = mount();
  expect(await screen.findByText('Private library')).toBeInTheDocument();
  let logout!: Promise<void>;
  await act(async () => { logout = session.logout(); });
  expect(screen.queryByText('Private library')).toBeNull();
  expect(qc.getQueryData(['private'])).toBeUndefined();
  expect(await session.manager.getUser()).toBeNull();
  expect(navigate).not.toHaveBeenCalled();
  release();
  await logout;
  expect(navigate).toHaveBeenCalledWith(session.logoutUrl());
});


test('terminal renewal failure hides private content without unmounting it or clearing cached data', async () => {
  const exp = Math.floor(Date.now() / 1000) + 1000;
  await session.manager.storeUser(new User({ id_token: 'id', access_token: 'access', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } }));
  const qc = mount();
  const privateContent = await screen.findByText('Private library');
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  expect(privateContent).toBeInTheDocument();
  expect(privateContent).not.toBeVisible();
  expect(privateContent.closest('[inert]')).not.toBeNull();
  expect(qc.getQueryData(['private'])).toBe('secret');
  expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeInTheDocument();
  expect(screen.getByText(/keep this tab open/i)).toBeInTheDocument();
});

// Keep the real popup protocol, PKCE state handling and token exchange. Only the
// browser-created window is replaced because jsdom cannot open a native window.
async function completePopup(profileChange: Partial<User['profile']> = {}) {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  let authorizationUrl = '';
  const popup = { location: { replace: (url: string) => { authorizationUrl = url; } }, focus() {}, close() { this.closed = true; }, closed: false };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  server.use(http.post(`${config.domain}/oauth2/token`, async ({ request }) => {
    const params = new URLSearchParams(await request.text());
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('redirect_uri')).toBe(`${config.origin}/auth/callback`);
    expect(params.get('code_verifier')).toBeTruthy();
    const exp = Math.floor(Date.now() / 1000) + 300;
    const profile = { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: Math.floor(Date.now() / 1000), 'cognito:groups': ['owner'], ...profileChange };
    const idToken = `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(profile))}.signature`;
    return HttpResponse.json({ id_token: idToken, access_token: 'access', refresh_token: 'popup-refresh', token_type: 'Bearer', expires_in: 300 });
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
  await waitFor(() => expect(authorizationUrl).not.toBe(''));
  const url = new URL(authorizationUrl);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('redirect_uri')).toBe(`${config.origin}/auth/callback`);
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { origin: config.origin, source: popup as unknown as Window,
      data: { source: 'oidc-client', url: `${config.origin}/auth/callback?code=valid&state=${encodeURIComponent(url.searchParams.get('state')!)}` } }));
  });
}

async function mountDraft(parentPage = false) {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const { CardsPage } = await import('../features/cards/CardsPage');
  const { CardCreateDialog } = await import('../features/cards/CardCreateDialog');
  const { ToastProvider } = await import('../components/Toast');
  const { BrowserRouter, Route, Routes } = await import('react-router');
  const { default: userEvent } = await import('@testing-library/user-event');
  const authModule = await import('./session');
  vi.spyOn(authModule, 'getAuthSession').mockReturnValue(session);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft-preview');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  server.use(
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/deck', () => HttpResponse.json({ id: 'draft-deck', name: 'Draft deck', categoryID: 'category' })),
    http.get('http://localhost:8080/category', () => HttpResponse.json({ id: 'category', name: 'Category' })),
    http.get('http://localhost:8080/cards', () => HttpResponse.json([])),
  );
  const exp = Math.floor(Date.now() / 1000) + 1000;
  await session.manager.storeUser(new User({ id_token: 'id', access_token: 'access', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } }));
  window.history.replaceState({}, '', '/decks/draft-deck');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider session={session}><ToastProvider><BrowserRouter><Routes><Route path="/decks/:deckId" element={parentPage ? <CardsPage /> : <CardCreateDialog deckId="draft-deck" open onClose={() => {}} onCreated={() => {}} />} /></Routes></BrowserRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  if (parentPage) fireEvent.click(await screen.findByRole('button', { name: 'New card' }));
  const input = await screen.findByRole('textbox', { name: 'Question' });
  const user = userEvent.setup();
  await user.type(input, 'Unsaved card question');
  const file = new File(['selected-image-bytes'], 'draft.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('Card images file'), file);
  await waitFor(() => expect(qc.getQueryData(['tags'])).toEqual([]));
  return { qc, input, file, revoke };
}

test('a real card draft, selected file and route survive same-owner popup sign-in', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const { input, file } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  expect(input).toBeInTheDocument();
  expect(input).not.toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  await completePopup();
  await waitFor(() => expect(input).toBeVisible());
  expect(input).toHaveValue('Unsaved card question');
  expect(screen.getByAltText('Selected image 1')).toBeVisible();
  expect(window.location.pathname).toBe('/decks/draft-deck');
  let uploaded: string | undefined;
  server.use(
    http.post('http://localhost:8080/card', async ({ request }) => {
      expect(await request.json()).toMatchObject({ question: 'Unsaved card question', deckID: 'draft-deck' });
      return HttpResponse.json({ id: 'new-card', deckID: 'draft-deck', question: 'Unsaved card question' });
    }),
    http.post('http://localhost:8080/card-question-image', async ({ request }) => {
      uploaded = await request.text(); return HttpResponse.json({ id: 'image' });
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(uploaded).toBe('selected-image-bytes'));
  expect(file.name).toBe('draft.png');
  expect(localStorage.length).toBe(0);
  expect(Object.values(sessionStorage).join('')).not.toContain('Unsaved card question');
});

test.each([{ sub: 'different-owner' }, { 'cognito:groups': [] }])('a rejected popup identity discards drafts and cached data: %j', async (profile) => {
  const { input, qc } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  await completePopup(profile);
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  expect(input).not.toBeInTheDocument();
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
  expect(await session.manager.getUser()).toBeNull();
});

test('explicit sign-out while locked discards the draft and private cache', async () => {
  const navigate = vi.fn(); session = new AuthSession(config, navigate);
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  server.use(http.post(`${config.domain}/oauth2/revoke`, () => new HttpResponse(null)));
  const { input, qc } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  fireEvent.click(screen.getByRole('button', { name: /Sign out.*discard/i }));
  await waitFor(() => expect(input).not.toBeInTheDocument());
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
  await waitFor(() => expect(navigate).toHaveBeenCalled());
});

test('a blocked popup leaves the draft locked and offers another sign-in attempt', async () => {
  const { input } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  vi.spyOn(window, 'open').mockReturnValue(null);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/popup|try again/i);
  expect(input).toBeInTheDocument();
  expect(input).not.toBeVisible();
  expect(input).toHaveValue('Unsaved card question');
  expect(window.location.pathname).toBe('/decks/draft-deck');
  expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
});

test('Escape on the lock screen cannot trigger a hidden draft dialog discard', async () => {
  const { input } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Sign in to continue' }), { key: 'Escape' });
  expect(confirm).not.toHaveBeenCalled();
  expect(input).toHaveValue('Unsaved card question');
});

test('closing the sign-in popup preserves the locked draft and lets the owner retry', async () => {
  const { input } = await mountDraft();
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  const popup = { location: { replace() {} }, focus() {}, close() {}, closed: true };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/popup|try again/i);
  expect(input).toBeInTheDocument();
  expect(input).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled();
});


test('network reconnection while locked cannot turn parent queries into errors or unmount the real card draft', async () => {
  const { onlineManager } = await import('@tanstack/react-query');
  const { input, qc } = await mountDraft(true);
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(qc.getQueryState(['cards', 'draft-deck'])?.status).toBe('success');
  expect(input).toBeInTheDocument();
  await completePopup();
  await waitFor(() => expect(input).toBeVisible());
  expect(input).toHaveValue('Unsaved card question');
  expect(screen.getByAltText('Selected image 1')).toBeVisible();
});

test('resuming the card editor does not refetch stale content and overwrite unsaved question edits', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const { CardEditorPage } = await import('../features/card-editor/CardEditorPage');
  const { ToastProvider } = await import('../components/Toast');
  const { BrowserRouter, Route, Routes } = await import('react-router');
  const authModule = await import('./session');
  vi.spyOn(authModule, 'getAuthSession').mockReturnValue(session);
  let cardReads = 0;
  let imageReads = 0;
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  server.use(
    http.get('http://localhost:8080/card', () => HttpResponse.json({ id: 'card', deckID: 'deck', question: `Server question ${++cardReads}`, tags: [], memorized: false })),
    http.get('http://localhost:8080/deck', () => HttpResponse.json({ id: 'deck', name: 'Deck', categoryID: 'category' })),
    http.get('http://localhost:8080/category', () => HttpResponse.json({ id: 'category', name: 'Category' })),
    http.get('http://localhost:8080/tags', () => HttpResponse.json([])),
    http.get('http://localhost:8080/card-question-images', () => { imageReads++; return HttpResponse.json([]); }),
    http.get('http://localhost:8080/card-answer-sections', () => HttpResponse.json([])),
  );
  const exp = Math.floor(Date.now() / 1000) + 1000;
  await session.manager.storeUser(new User({ id_token: 'id', access_token: 'access', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } }));
  window.history.replaceState({}, '', '/cards/card');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  render(<QueryClientProvider client={qc}><AuthProvider session={session}><ToastProvider><BrowserRouter><Routes><Route path="/cards/:cardId" element={<CardEditorPage />} /></Routes></BrowserRouter></ToastProvider></AuthProvider></QueryClientProvider>);
  const question = await screen.findByRole('textbox', { name: 'Question' });
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  fireEvent.change(question, { target: { value: 'Unsaved edited question' } });
  await act(() => session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' })));
  await act(async () => { await vi.advanceTimersByTimeAsync(300000); });
  expect(qc.getQueryState(['question-images', 'card'])?.status).toBe('success');
  expect(imageReads).toBe(1);
  const resumedAt = Date.now();
  vi.useRealTimers();
  vi.spyOn(Date, 'now').mockReturnValue(resumedAt);
  await completePopup();
  await waitFor(() => expect(question).toBeVisible());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  expect(question).toHaveValue('Unsaved edited question');
  expect(cardReads).toBe(1);
  await waitFor(() => expect(imageReads).toBe(2));
});

test('same-owner sign-in resumes remaining files after a known 401 without creating or uploading completed work again', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const { default: userEvent } = await import('@testing-library/user-event');
  const { input } = await mountDraft();
  await userEvent.setup().upload(screen.getByLabelText('Card images file'), new File(['second-image-bytes'], 'second.png', { type: 'image/png' }));
  let created = 0;
  let authorized = false;
  const uploaded: { sequence: string | null; bytes: string }[] = [];
  server.use(
    http.post('http://localhost:8080/card', () => {
      created++; return HttpResponse.json({ id: 'saved-card', deckID: 'draft-deck', question: 'Unsaved card question' });
    }),
    http.post('http://localhost:8080/card-question-image', async ({ request }) => {
      const sequence = new URL(request.url).searchParams.get('sequenceNumber');
      uploaded.push({ sequence, bytes: await request.text() });
      if (sequence === '2' && !authorized) return HttpResponse.json({ message: 'Sign in' }, { status: 401 });
      return HttpResponse.json({ id: `image-${sequence}`, cardID: 'saved-card', sequenceNumber: Number(sequence) });
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('button', { name: 'Sign in to continue' })).toBeInTheDocument();
  expect(input).toBeInTheDocument();
  expect(input).not.toBeVisible();
  await completePopup();
  authorized = true;
  fireEvent.click(await screen.findByRole('button', { name: 'Continue uploads' }));
  await waitFor(() => expect(uploaded).toEqual([
    { sequence: '1', bytes: 'selected-image-bytes' },
    { sequence: '2', bytes: 'second-image-bytes' },
    { sequence: '2', bytes: 'second-image-bytes' },
  ]));
  expect(created).toBe(1);
});
