import { useSyncExternalStore } from 'react';
import { api } from './client';
import type { User } from './types';

/** Who is signed in, asked once per page and shared by everything on it. */
type State = { loading: boolean; user: User | null };

let state: State = { loading: true, user: null };
let asked: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function loadMe(force = false) {
  if (!asked || force)
    asked = api<{ user: User | null }>('/api/me').then(
      ({ user }) => set({ loading: false, user }),
      // Without an answer, the page treats the reader as signed out and offers to sign in.
      () => set({ loading: false, user: null }),
    );
  return asked;
}

export function useMe() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void loadMe();
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Signs out here, then at the sign-in service, which comes back to the homepage. */
export async function signOut() {
  const { redirect } = await api<{ redirect: string }>('/api/auth/logout', { method: 'POST' });
  set({ loading: false, user: null });
  window.location.assign(redirect);
}
