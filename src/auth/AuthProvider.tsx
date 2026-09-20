import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiConfig } from '../api/config';
import { getMediaOrigin } from '../api/media';
import { Button } from '../components/Button';
import { AuthSession, getAuthSession, type SessionStatus } from './session';

export const AuthContext = createContext<{ logout: () => Promise<void>; getStatus?: () => SessionStatus } | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Authentication provider required.');
  return auth;
}

export function AuthProvider({ children, session: supplied }: { children: ReactNode; session?: AuthSession }) {
  try {
    getApiConfig();
    getMediaOrigin();
    return <SessionGate session={supplied ?? getAuthSession()}>{children}</SessionGate>;
  } catch {
    return <main className="p-8" role="alert">Application configuration is missing or invalid. Contact the owner.</main>;
  }
}

function SessionGate({ session, children }: { session: AuthSession; children: ReactNode }) {
  const qc = useQueryClient();
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    const clearPrivateData = () => {
      const next = session.getSnapshot();
      if (next === 'locked') void qc.cancelQueries();
      else if (next === 'anonymous') qc.clear();
    };
    const unsubscribe = session.subscribe(clearPrivateData);
    clearPrivateData();
    void session.initialize().catch(() => setError('Sign in failed. Please try again.'));
    return unsubscribe;
  }, [session, qc]);
  useEffect(() => {
    if (status !== 'locked') return;
    // Mounted dialogs have document-level Escape listeners. Inert alone does
    // not disable those, so don't let the lock screen dismiss hidden drafts.
    const stopEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') event.stopImmediatePropagation(); };
    document.addEventListener('keydown', stopEscape, true);
    return () => document.removeEventListener('keydown', stopEscape, true);
  }, [status]);
  if (status === 'loading') return <main className="p-8">Loading…</main>;
  if (status === 'anonymous') return (
    <main className="mx-auto mt-24 max-w-sm rounded-lg border border-gray-200 bg-white p-8">
      <h1 className="mb-3 text-2xl font-bold">Flashcards</h1>
      <p className="mb-6 text-gray-600">Sign in with the owner account to open your private library.</p>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      <Button onClick={() => { setError(''); void session.login().catch(() => setError('Sign in failed. Please try again.')); }}>Sign in</Button>
    </main>
  );
  const locked = status === 'locked';
  return <AuthContext.Provider value={{ logout: session.logout, getStatus: session.getSnapshot }}>
    {locked && <main className="mx-auto mt-24 max-w-md rounded-lg border border-gray-200 bg-white p-8">
      <h1 className="mb-3 text-2xl font-bold">Sign in to continue</h1>
      <p className="mb-4 text-gray-600">Your session needs to be renewed. Keep this tab open: your unsaved draft is kept here until you sign in with the same owner account.</p>
      <p className="mb-6 text-gray-600">Reloading, closing this tab, or signing out discards these edits.</p>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      <div className="flex flex-col gap-3">
        <Button autoFocus disabled={signingIn} onClick={() => {
          setError(''); setSigningIn(true);
          void session.reauthenticate().catch(() => setError('Sign in did not complete. Allow the sign-in popup and try again with the same owner account.')).finally(() => setSigningIn(false));
        }}>{signingIn ? 'Signing in…' : 'Sign in to continue'}</Button>
        <Button variant="secondary" onClick={() => { void session.logout(); }}>Sign out and discard edits</Button>
      </div>
    </main>}
    <div hidden={locked} inert={locked}>{children}</div>
  </AuthContext.Provider>;
}
