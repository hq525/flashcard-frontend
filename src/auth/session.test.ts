import { ErrorResponse, OidcClient, User } from 'oidc-client-ts';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { AuthSession, getAuthConfig } from './session';

const config = { authority: 'https://cognito-idp.ap-southeast-1.amazonaws.com/pool', clientId: 'client', domain: 'https://test.auth.ap-southeast-1.amazoncognito.com', origin: 'http://localhost:3000' };
const owner = (exp = Math.floor(Date.now() / 1000) + 3600) => new User({ id_token: 'id-token', access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'Bearer', expires_at: exp, profile: { sub: 'owner', iss: config.authority, aud: config.clientId, exp, iat: 1, 'cognito:groups': ['owner'] } });
let session: AuthSession;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); session = new AuthSession(config); });
afterEach(async () => { await session.clear(); vi.useRealTimers(); });

test('requires configured HTTPS identity endpoints', () => {
  vi.stubEnv('VITE_AUTH_CLIENT_ID', '');
  expect(() => getAuthConfig()).toThrow(/configuration/);
});

test('uses code plus PKCE with session-only stores and fixed callback', async () => {
  const settings = session.manager.settings;
  expect(settings.response_type).toBe('code');
  expect(settings.disablePKCE).toBe(false);
  expect(settings.client_secret).toBeUndefined();
  expect(settings.redirect_uri).toBe('http://localhost:3000/auth/callback');
  await session.manager.storeUser(owner());
  await session.initialize();
  expect(await session.getIdToken()).toBe('id-token');
  expect(sessionStorage.length).toBeGreaterThan(0);
  expect(localStorage.length).toBe(0);
});

test('expired identity tokens never authenticate even if access token lives longer', async () => {
  const user = owner(Math.floor(Date.now() / 1000) - 1);
  user.expires_at = Math.floor(Date.now() / 1000) + 3600;
  await session.manager.storeUser(user);
  await session.initialize();
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
  expect(await session.manager.getUser()).toBeNull();
});

test('non-owner identities fail closed', async () => {
  const user = owner();
  user.profile['cognito:groups'] = [];
  await session.manager.storeUser(user);
  await session.initialize();
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
});

test('expiry locks private state and erases credentials while renewal is still in flight', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const refreshStarted = new Promise<void>((resolve) => { started = resolve; });
  server.use(http.post(`${config.domain}/oauth2/token`, async () => {
    started(); await gate;
    return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }));
  vi.useFakeTimers();
  await session.manager.storeUser(owner(Math.floor(Date.now() / 1000) + 2));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(1000);
  await refreshStarted;
  await vi.advanceTimersByTimeAsync(2000);
  expect(session.getSnapshot()).toBe('locked');
  expect(await session.manager.getUser()).toBeNull();
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
  release();
  await vi.advanceTimersByTimeAsync(100);
  expect(session.getSnapshot()).toBe('locked');
  expect(await session.manager.getUser()).toBeNull();
});

test('logout uses only the configured Cognito domain and current app root', () => {
  const url = new URL(session.logoutUrl());
  expect(url.origin + url.pathname).toBe(config.domain + '/logout');
  expect(url.searchParams.get('client_id')).toBe('client');
  expect(url.searchParams.get('logout_uri')).toBe(config.origin + '/');
  expect(url.searchParams.has('id_token_hint')).toBe(false);
});

test('authorization requests contain a fresh S256 PKCE challenge and state', async () => {
  const { OidcClient } = await import('oidc-client-ts');
  const client = new OidcClient(session.manager.settings);
  const first = new URL((await client.createSigninRequest({})).url);
  const second = new URL((await client.createSigninRequest({})).url);
  expect(first.origin).toBe(config.domain);
  expect(first.searchParams.get('response_type')).toBe('code');
  expect(first.searchParams.get('code_challenge_method')).toBe('S256');
  expect(first.searchParams.get('code_challenge')).toHaveLength(43);
  expect(first.searchParams.get('state')).not.toBe(second.searchParams.get('state'));
});

test.each(['/auth/callback', '/auth/callback/'])('%s rejects unsolicited authorization state and strips the URL', async (path) => {
  window.history.replaceState({}, '', `${path}?code=forged&state=unsolicited&returnTo=https://evil.example`);
  await expect(session.initialize()).rejects.toThrow('Sign in failed');
  expect(session.getSnapshot()).toBe('anonymous');
  expect(await session.manager.getUser()).toBeNull();
  expect(window.location.pathname).toBe('/');
  expect(window.location.search).toBe('');
});

test.each(['/auth/callback', '/auth/callback/'])('%s exchanges the authorization code and opens the owner session', async (path) => {
  const oidc = new OidcClient(session.manager.settings);
  const request = await oidc.createSigninRequest({ request_type: 'si:r' });
  const state = new URL(request.url).searchParams.get('state')!;
  const user = owner();
  const token = jwt(user.profile);
  server.use(http.post(`${config.domain}/oauth2/token`, async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('valid');
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(body.get('code_verifier')).toBeTruthy();
    return HttpResponse.json({ id_token: token, access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'Bearer', expires_in: 3600 });
  }));
  window.history.replaceState({}, '', `${path}?code=valid&state=${encodeURIComponent(state)}`);
  await session.initialize();
  expect(session.getSnapshot()).toBe('authenticated');
  expect(await session.getIdToken()).toBe(token);
  expect(window.location.pathname).toBe('/');
  expect(window.location.search).toBe('');
});

test('repeated initialization only consumes the callback once', async () => {
  const user = owner();
  window.history.replaceState({}, '', '/auth/callback?code=valid&state=generated');
  const callback = vi.spyOn(session.manager, 'signinRedirectCallback').mockResolvedValue(user);
  await Promise.all([session.initialize(), session.initialize()]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot()).toBe('authenticated');
  expect(window.location.pathname).toBe('/');
});


test('a renewed owner ID token replaces the API token', async () => {
  await session.manager.storeUser(owner());
  await session.initialize();
  const renewed = owner();
  renewed.id_token = 'renewed-id-token';
  await session.manager.storeUser(renewed);
  await session.manager.events.load(renewed);
  expect(await session.getIdToken()).toBe('renewed-id-token');
});

test('terminal refresh failure locks the session and erases refresh credentials', async () => {
  await session.manager.storeUser(owner());
  await session.initialize();
  await session.manager.events._raiseSilentRenewError(new ErrorResponse({ error: 'invalid_grant' }));
  expect(session.getSnapshot()).toBe('locked');
  expect(await session.manager.getUser()).toBeNull();
});

test('a session without a refresh token cannot fall back to iframe renewal', async () => {
  const user = owner();
  user.refresh_token = undefined;
  await session.manager.storeUser(user);
  await session.initialize();
  expect(session.getSnapshot()).toBe('anonymous');
});

test('renewal after logout cannot restore the private session', async () => {
  await session.manager.storeUser(owner());
  await session.initialize();
  await session.clear();
  await session.manager.storeUser(owner());
  await session.manager.events.load(owner());
  expect(session.getSnapshot()).toBe('anonymous');
  expect(await session.manager.getUser()).toBeNull();
});

test('refreshes through the Cognito token endpoint and uses the renewed ID token', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const user = owner();
  const jwt = (profile: User['profile']) => `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(profile))}.signature`;
  user.id_token = jwt(user.profile);
  await session.manager.storeUser(user);
  await session.initialize();
  const renewedToken = jwt({ ...user.profile, exp: user.profile.exp + 300 });
  let grant: string | null = null;
  let refresh: string | null = null;
  server.use(http.post(`${config.domain}/oauth2/token`, async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    grant = body.get('grant_type');
    refresh = body.get('refresh_token');
    return HttpResponse.json({ id_token: renewedToken, access_token: 'new-access', token_type: 'Bearer', expires_in: 300 });
  }));
  await session.manager.signinSilent();
  expect(grant).toBe('refresh_token');
  expect(refresh).toBe('refresh-token');
  expect(await session.getIdToken()).toBe(renewedToken);
});

test('logout immediately erases the session and revokes the current refresh token with its public client ID', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const navigate = vi.fn();
  session = new AuthSession(config, navigate);
  const rotated = owner();
  rotated.refresh_token = 'current-rotated-refresh-token';
  await session.manager.storeUser(rotated);
  await session.initialize();
  let received: unknown;
  server.use(http.post(`${config.domain}/oauth2/revoke`, async ({ request }) => {
    received = {
      body: Object.fromEntries(new URLSearchParams(await request.text())),
      contentType: request.headers.get('Content-Type'),
      authorization: request.headers.get('Authorization'),
    };
    expect(session.getSnapshot()).toBe('anonymous');
    expect(await session.manager.getUser()).toBeNull();
    return new HttpResponse(null, { status: 200 });
  }));
  const logout = session.logout();
  expect(session.getSnapshot()).toBe('anonymous');
  await logout;
  expect(received).toEqual({
    body: { token: 'current-rotated-refresh-token', client_id: 'client' },
    contentType: 'application/x-www-form-urlencoded', authorization: null,
  });
  expect(navigate).toHaveBeenCalledWith(session.logoutUrl());
});

test.each(['network', 'server'])('logout still redirects after a %s revocation failure', async (failure) => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const navigate = vi.fn();
  session = new AuthSession(config, navigate);
  await session.manager.storeUser(owner());
  await session.initialize();
  server.use(http.post(`${config.domain}/oauth2/revoke`, () => failure === 'network' ? HttpResponse.error() : new HttpResponse(null, { status: 503 })));
  await session.logout();
  expect(session.getSnapshot()).toBe('anonymous');
  expect(await session.manager.getUser()).toBeNull();
  expect(navigate).toHaveBeenCalledWith(session.logoutUrl());
});

test('a stalled revocation is aborted after three seconds without delaying local logout', async () => {
  const { http } = await import('msw');
  const { server } = await import('../test/server');
  const navigate = vi.fn();
  session = new AuthSession(config, navigate);
  await session.manager.storeUser(owner());
  await session.initialize();
  let requestSignal: AbortSignal | undefined;
  server.use(http.post(`${config.domain}/oauth2/revoke`, async ({ request }) => {
    requestSignal = request.signal;
    return new Promise<Response>(() => {});
  }));
  vi.useFakeTimers();
  const logout = session.logout();
  expect(session.getSnapshot()).toBe('anonymous');
  await vi.advanceTimersByTimeAsync(100);
  expect(await session.manager.getUser()).toBeNull();
  expect(requestSignal).toBeDefined();
  expect(navigate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  await logout;
  expect(requestSignal?.aborted).toBe(true);
  expect(navigate).toHaveBeenCalledWith(session.logoutUrl());
});

test('a late rotated refresh token is also revoked and cannot restore a logged-out session', async () => {
  const { http, HttpResponse } = await import('msw');
  const { server } = await import('../test/server');
  const navigate = vi.fn();
  session = new AuthSession(config, navigate);
  await session.manager.storeUser(owner());
  await session.initialize();
  let startRevocation!: () => void;
  const started = new Promise<void>((resolve) => { startRevocation = resolve; });
  let finishRevocation!: () => void;
  const gate = new Promise<void>((resolve) => { finishRevocation = resolve; });
  const tokens: string[] = [];
  server.use(http.post(`${config.domain}/oauth2/revoke`, async ({ request }) => {
    const token = new URLSearchParams(await request.text()).get('token')!;
    tokens.push(token);
    if (token === 'refresh-token') { startRevocation(); await gate; }
    return new HttpResponse(null, { status: 200 });
  }));
  const logout = session.logout();
  await started;
  const rotated = owner();
  rotated.refresh_token = 'late-rotated-token';
  await session.manager.storeUser(rotated);
  await session.manager.events.load(rotated);
  expect(session.getSnapshot()).toBe('anonymous');
  expect(await session.manager.getUser()).toBeNull();
  expect(tokens).toEqual(['refresh-token', 'late-rotated-token']);
  finishRevocation();
  await logout;
  expect(navigate).toHaveBeenCalledWith(session.logoutUrl());
});

const jwt = (profile: User['profile']) => `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(profile))}.signature`;

test.each(['network', 'server', 'oauth'])('a transient %s refresh failure keeps the valid token usable and recovers', async (failure) => {
  vi.useFakeTimers();
  const user = owner(Math.floor(Date.now() / 1000) + 70);
  user.id_token = jwt(user.profile);
  await session.manager.storeUser(user);
  let attempts = 0;
  const renewedToken = jwt({ ...user.profile, exp: user.profile.exp + 300 });
  server.use(http.post(`${config.domain}/oauth2/token`, () => {
    attempts++;
    if (attempts === 1) {
      if (failure === 'network') return HttpResponse.error();
      return HttpResponse.json(failure === 'oauth' ? { error: 'server_error' } : {}, { status: 503 });
    }
    return HttpResponse.json({ id_token: renewedToken, access_token: 'new-access', token_type: 'Bearer', expires_in: 300 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(10000);
  expect(attempts).toBe(1);
  expect(session.getSnapshot()).toBe('authenticated');
  expect(await session.getIdToken()).toBe(user.id_token);
  await vi.advanceTimersByTimeAsync(1000);
  expect(attempts).toBe(2);
  expect(await session.getIdToken()).toBe(renewedToken);
  expect(session.generation).toBe(0);
});

test('transient retries are bounded and eventually lock at expiry without an early logout', async () => {
  vi.useFakeTimers();
  await session.manager.storeUser(owner(Math.floor(Date.now() / 1000) + 70));
  let attempts = 0;
  server.use(http.post(`${config.domain}/oauth2/token`, () => {
    attempts++; return HttpResponse.json({}, { status: 503 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(30000);
  expect(attempts).toBe(4);
  expect(session.getSnapshot()).toBe('authenticated');
  await vi.advanceTimersByTimeAsync(41000);
  expect(attempts).toBe(4);
  expect(session.getSnapshot()).toBe('locked');
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
});

test('refresh requests remain serialized while a token endpoint response is pending', async () => {
  vi.useFakeTimers();
  const user = owner(Math.floor(Date.now() / 1000) + 70);
  user.id_token = jwt(user.profile);
  await session.manager.storeUser(user);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  server.use(http.post(`${config.domain}/oauth2/token`, async () => {
    requests++; await gate;
    return HttpResponse.json({ id_token: jwt({ ...user.profile, exp: user.profile.exp + 300 }), access_token: 'renewed', token_type: 'Bearer', expires_in: 300 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(10000);
  await Promise.all([session.getIdToken(), session.getIdToken(), session.getIdToken()]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(requests).toBe(1);
  release();
  await vi.advanceTimersByTimeAsync(100);
  expect(session.getSnapshot()).toBe('authenticated');
});

test.each(['/auth/callback', '/auth/callback/'])('a popup at %s notifies the original tab without consuming copied session state or mounting private routes', async (path) => {
  const oidc = new OidcClient(session.manager.settings);
  const request = await oidc.createSigninRequest({ request_type: 'si:p', url_state: 'reauth' });
  const state = new URL(request.url).searchParams.get('state')!;
  sessionStorage.clear(); // Popup sessionStorage does not receive the opener's later PKCE state.
  window.history.replaceState({}, '', `${path}?code=valid&state=${encodeURIComponent(state)}`);
  const callback = vi.spyOn(session.manager, 'signinPopupCallback').mockResolvedValue();
  await session.initialize();
  expect(callback).toHaveBeenCalledWith(expect.stringContaining('code=valid'));
  expect(session.getSnapshot()).not.toBe('authenticated');
  expect(window.location.search).toBe('');
});

test('a different subject from background renewal discards the original session', async () => {
  await session.manager.storeUser(owner());
  await session.initialize();
  const other = owner(); other.profile.sub = 'another-owner';
  await session.manager.storeUser(other);
  await session.manager.events.load(other);
  expect(session.getSnapshot()).toBe('anonymous');
  expect(await session.manager.getUser()).toBeNull();
});

test('an actual invalid_grant locks immediately without retrying a still-valid token', async () => {
  vi.useFakeTimers();
  await session.manager.storeUser(owner(Math.floor(Date.now() / 1000) + 70));
  let attempts = 0;
  server.use(http.post(`${config.domain}/oauth2/token`, () => {
    attempts++; return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(11000);
  expect(session.getSnapshot()).toBe('locked');
  expect(await session.manager.getUser()).toBeNull();
  await vi.advanceTimersByTimeAsync(30000);
  expect(attempts).toBe(1);
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
});

test('a late successful refresh cannot overwrite credentials returned by same-owner popup sign-in', async () => {
  vi.useFakeTimers();
  const user = owner(Math.floor(Date.now() / 1000) + 70);
  user.id_token = jwt(user.profile);
  await session.manager.storeUser(user);
  let started!: () => void;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  server.use(http.post(`${config.domain}/oauth2/token`, async () => {
    started(); await gate;
    return HttpResponse.json({ id_token: jwt({ ...user.profile, exp: user.profile.exp + 300 }), access_token: 'late-access', refresh_token: 'late-refresh', token_type: 'Bearer', expires_in: 300 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(10000);
  await begun;
  await session.lock();
  const popupUser = owner(); popupUser.id_token = 'popup-id'; popupUser.refresh_token = 'popup-refresh';
  vi.spyOn(session.manager, 'signinPopup').mockImplementationOnce(async () => {
    await session.manager.storeUser(popupUser);
    await session.manager.events.load(popupUser);
    return popupUser;
  });
  const popup = session.reauthenticate();
  await vi.advanceTimersByTimeAsync(100);
  expect(session.getSnapshot()).toBe('locked');
  release();
  await popup;
  expect(await session.getIdToken()).toBe('popup-id');
  expect((await session.manager.getUser())?.refresh_token).toBe('popup-refresh');
});

test('a successful refresh arriving after token expiry cannot silently unlock retained drafts', async () => {
  vi.useFakeTimers();
  const user = owner(Math.floor(Date.now() / 1000) + 2); user.id_token = jwt(user.profile);
  await session.manager.storeUser(user);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  server.use(http.post(`${config.domain}/oauth2/token`, async () => {
    await gate;
    return HttpResponse.json({ id_token: jwt({ ...user.profile, exp: user.profile.exp + 300 }), access_token: 'late', refresh_token: 'rotated', token_type: 'Bearer', expires_in: 300 });
  }));
  await session.initialize();
  await vi.advanceTimersByTimeAsync(3000);
  expect(session.getSnapshot()).toBe('locked');
  release();
  await vi.advanceTimersByTimeAsync(100);
  expect(session.getSnapshot()).toBe('locked');
  expect(await session.manager.getUser()).toBeNull();
  await expect(session.getIdToken()).rejects.toThrow(/Sign in/);
});
