/**
 * Shared by the Listen button in a document's header and the player below its text: whether
 * the browser can read the document aloud, whether it is, and the player's controls.
 */
export type ListenStatus = 'off' | 'playing' | 'paused';

interface Listening {
  status: ListenStatus;
  available: boolean;
}
interface Controls {
  toggle(): void;
  stop(): void;
  /** Reads the current line again, as after a change of speed. */
  retell(): void;
}

export const canSpeak = () =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof SpeechSynthesisUtterance === 'function';

let state: Listening = { status: 'off', available: canSpeak() };
let controls: Controls | undefined;
const listeners = new Set<() => void>();

export const listening = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => state,
  update(next: Partial<Listening>) {
    if (Object.entries(next).every(([key, value]) => state[key as keyof Listening] === value))
      return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  },
  connect(next: Controls | undefined) {
    controls = next;
  },
  toggle: () => controls?.toggle(),
  stop: () => controls?.stop(),
  retell: () => controls?.retell(),
};
