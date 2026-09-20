import { ErrorResponse, ErrorTimeout, SigninResponse, User, UserManager, WebStorageStateStore } from 'oidc-client-ts';

export interface AuthConfig { authority: string; clientId: string; domain: string; origin: string }
export type SessionStatus = 'loading' | 'authenticated' | 'locked' | 'anonymous';

export function getAuthConfig(): AuthConfig {
  const authority = import.meta.env.VITE_AUTH_AUTHORITY?.replace(/\/+$/, '');
  const domain = import.meta.env.VITE_AUTH_DOMAIN?.replace(/\/+$/, '');
  const clientId = import.meta.env.VITE_AUTH_CLIENT_ID;
  try {
    for (const value of [authority, domain]) {
      const url = new URL(value ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    }
    if (!clientId || new URL(domain!).pathname !== '/') throw new Error();
  } catch { throw new Error('Authentication configuration is missing or invalid.'); }
  return { authority: authority!, domain: domain!, clientId, origin: window.location.origin };
}

// The backend independently verifies the signature and all authorization claims.
function validOwner(user: User | null, config: AuthConfig): user is User {
  const groups = user?.profile['cognito:groups'];
  return !!user?.profile.sub && !!user.id_token && !!user.refresh_token && !user.expired && Number.isFinite(user.profile.exp)
    && user.profile.exp > Date.now() / 1000 && user.profile.iss === config.authority
    && user.profile.aud === config.clientId && Array.isArray(groups) && groups.includes('owner');
}

// oidc-client-ts exposes OAuth errors by code; non-OAuth HTTP errors include
// the status in parentheses. Unknown protocol/validation errors fail closed.
function transientRenewalError(error: unknown) {
  if (error instanceof ErrorResponse) return error.error === 'server_error' || error.error === 'temporarily_unavailable';
  return error instanceof TypeError || error instanceof ErrorTimeout
    || (error instanceof Error && /^[^\n]* \(5\d{2}\)(?::|$)/.test(error.message));
}

export class AuthSession {
  readonly manager: UserManager;
  generation = 0;
  private status: SessionStatus = 'loading';
  private user: User | null = null;
  private listeners = new Set<() => void>();
  private initialization?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private loggingOut = false;
  private subject?: string;
  private revocationToken?: string;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private refreshInFlight?: Promise<void>;
  private refreshFailures = 0;
  private popupInFlight?: Promise<void>;
  private popupController?: AbortController;

  constructor(
    private readonly config: AuthConfig,
    private readonly navigate: (url: string) => void = (url) => window.location.assign(url),
  ) {
    this.manager = new UserManager({
      authority: config.authority, client_id: config.clientId,
      redirect_uri: `${config.origin}/auth/callback`, response_type: 'code', scope: 'openid email',
      // Start renewal only after confirming a refresh token; never fall back to an iframe.
      disablePKCE: false, automaticSilentRenew: false, monitorSession: false, loadUserInfo: false,
      maxSilentRenewTimeoutRetries: 0, requestTimeoutInSeconds: 15,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
      metadata: { issuer: config.authority, authorization_endpoint: `${config.domain}/oauth2/authorize`,
        token_endpoint: `${config.domain}/oauth2/token`, jwks_uri: `${config.authority}/.well-known/jwks.json` },
    });
    this.manager.events.addAccessTokenExpired(() => this.lock());
    this.manager.events.addSilentRenewError((error) => this.renewalFailed(error));
    this.manager.events.addUserLoaded(async (user) => {
      if (this.status === 'authenticated' && !this.refreshInFlight) await this.acceptUser(user);
      else if (this.status === 'locked') {
        // A late refresh must not unlock the editor. Popup results are accepted
        // explicitly below, after identity and generation checks.
        this.revocationToken = user.refresh_token;
        await this.manager.removeUser();
      }
      else if (this.status === 'anonymous') {
        // A refresh already in flight can finish after logout started. Erase
        // its stored result and also revoke the rotated token when available.
        const refreshToken = this.loggingOut ? user.refresh_token : undefined;
        await this.clear();
        await this.revokeRefreshToken(refreshToken);
      }
    });
  }

  getSnapshot = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(status: SessionStatus) { this.status = status; this.listeners.forEach((listener) => listener()); }

  initialize = (): Promise<void> => {
    this.initialization ??= this.load();
    return this.initialization;
  };

  private async load() {
    // Hosting can canonicalize the callback with a trailing slash.
    const callback = /^\/auth\/callback\/?$/.test(window.location.pathname);
    try {
      if (callback && new SigninResponse(new URLSearchParams(window.location.search)).url_state === 'reauth') {
        // Popup sessionStorage is copied before the PKCE state is written in
        // the opener. Notify it directly; the opener validates state + PKCE.
        await this.manager.signinPopupCallback(window.location.href);
        window.history.replaceState({}, '', '/');
        return;
      }
      const user = callback ? await this.manager.signinRedirectCallback() : await this.manager.getUser();
      // Never use callback state or query parameters as a navigation target.
      if (callback) window.history.replaceState({}, '', '/');
      await this.acceptUser(user);
    } catch {
      if (callback) window.history.replaceState({}, '', '/');
      await this.clear();
      throw new Error('Sign in failed. Please try again.');
    }
  }

  private async acceptUser(user: User | null) {
    if (!validOwner(user, this.config) || (this.subject && user.profile.sub !== this.subject)) {
      await this.clear(); return;
    }
    clearTimeout(this.timer);
    clearTimeout(this.refreshTimer);
    this.user = user;
    this.subject = user.profile.sub;
    this.revocationToken = user.refresh_token;
    this.refreshFailures = 0;
    const expires = Math.min(user.profile.exp, user.expires_at ?? user.profile.exp) * 1000;
    this.timer = setTimeout(() => { void this.lock(); }, Math.max(0, expires - Date.now()));
    // Own renewal scheduling so only one refresh can run and retries are bounded.
    this.refreshTimer = setTimeout(() => this.refresh(), Math.max(0, expires - Date.now() - 60000));
    this.publish('authenticated');
  }

  private refresh = () => {
    if (this.refreshInFlight || this.status !== 'authenticated') return;
    const generation = this.generation;
    this.refreshInFlight = (async () => {
      if (!validOwner(this.user, this.config)) { await this.lock(); return; }
      try {
        const user = await this.manager.signinSilent();
        if (generation === this.generation && this.status === 'authenticated') await this.acceptUser(user);
      } catch (error) {
        if (generation === this.generation) await this.renewalFailed(error);
      }
    })().finally(() => { this.refreshInFlight = undefined; });
  };

  private async renewalFailed(error: unknown) {
    if (this.status !== 'authenticated') return;
    if (!validOwner(this.user, this.config) || !transientRenewalError(error)) { await this.lock(); return; }
    const delay = [1000, 3000, 10000][this.refreshFailures++];
    if (delay !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(this.refresh, delay);
    }
    // Once retries are exhausted, the still-valid token remains usable until
    // its existing expiry timer locks the session. Never extend its lifetime.
  }

  getIdToken = async (): Promise<string> => {
    await this.initialize();
    if (this.status !== 'authenticated') throw new Error('Sign in to continue.');
    if (!validOwner(this.user, this.config)) { await this.lock(); throw new Error('Sign in to continue.'); }
    return this.user.id_token!;
  };

  lock = async () => {
    if (this.status !== 'authenticated') return;
    clearTimeout(this.timer);
    clearTimeout(this.refreshTimer);
    this.manager.stopSilentRenew();
    this.user = null;
    this.generation++;
    this.publish('locked');
    await this.manager.removeUser();
  };

  clear = async () => {
    clearTimeout(this.timer);
    clearTimeout(this.refreshTimer);
    this.popupController?.abort();
    this.manager.stopSilentRenew();
    this.user = null;
    this.subject = undefined;
    this.revocationToken = undefined;
    this.generation++;
    this.publish('anonymous');
    await this.manager.removeUser();
    await this.manager.clearStaleState();
  };

  reauthenticate = (): Promise<void> => {
    if (this.popupInFlight) return this.popupInFlight;
    if (this.status !== 'locked') return Promise.reject(new Error('Sign in to continue.'));
    const generation = this.generation;
    const controller = new AbortController();
    this.popupController = controller;
    const timeout = setTimeout(() => controller.abort(), 120000);
    this.popupInFlight = (async () => {
      // Call before any await so browsers retain the button's user gesture.
      const user = await this.manager.signinPopup({ url_state: 'reauth', popupSignal: controller.signal, popupAbortOnClose: true });
      // Drain a refresh started before locking so it cannot overwrite the new
      // credentials after this popup has restored the editor.
      await this.refreshInFlight;
      if (generation !== this.generation || this.status !== 'locked') {
        await this.manager.removeUser();
        if (this.loggingOut) await this.revokeRefreshToken(user.refresh_token);
        return;
      }
      if (!validOwner(user, this.config) || user.profile.sub !== this.subject) {
        await this.clear(); throw new Error('Sign in with the same owner account. The previous draft was discarded.');
      }
      await this.manager.storeUser(user);
      await this.acceptUser(user);
    })().finally(() => {
      clearTimeout(timeout);
      this.popupController = undefined;
      this.popupInFlight = undefined;
    });
    return this.popupInFlight;
  };

  login = async () => { await this.manager.clearStaleState(); await this.manager.signinRedirect(); };
  logoutUrl = () => {
    const url = new URL('/logout', this.config.domain);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('logout_uri', `${this.config.origin}/`);
    return url.href;
  };
  private async revokeRefreshToken(token: string | undefined) {
    if (!token) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      // Cognito public clients authenticate revocation with client_id in the
      // form body. No token belongs in a URL, log, or Authorization header.
      await fetch(`${this.config.domain}/oauth2/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, client_id: this.config.clientId }),
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        keepalive: true,
      });
    } catch {
      // Revocation is best effort. Network failure must never retain the
      // private session or prevent the hosted-login cookie from being cleared.
    } finally { clearTimeout(timeout); }
  }

  logout = async () => {
    this.loggingOut = true;
    const refreshToken = this.revocationToken;
    try {
      await this.clear();
      await this.revokeRefreshToken(refreshToken);
    } finally { this.navigate(this.logoutUrl()); }
  };
}

let session: AuthSession | undefined;
export function getAuthSession() { return session ??= new AuthSession(getAuthConfig()); }
