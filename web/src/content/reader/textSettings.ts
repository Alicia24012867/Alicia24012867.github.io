/** Where the reader's own text size, line spacing and font are kept for every document. */
export const textSettingsKey = 'alicia-reading-text';

/** Text sizes as percentages of the usual one. */
export const textSizes = ['90', '100', '112', '125', '140'] as const;
export const lineSpacings = ['compact', 'normal', 'relaxed'] as const;
export const textFonts = ['sans', 'serif'] as const;

export type TextSettings = {
  size: (typeof textSizes)[number];
  spacing: (typeof lineSpacings)[number];
  font: (typeof textFonts)[number];
};

export const usualText: TextSettings = { size: '100', spacing: 'normal', font: 'sans' };

const choices: { [Key in keyof TextSettings]: readonly TextSettings[Key][] } = {
  size: textSizes,
  spacing: lineSpacings,
  font: textFonts,
};
const keys = Object.keys(usualText) as (keyof TextSettings)[];

/** The kept settings, each one missing or unknown as usual. */
export function readTextSettings(saved: string | null): TextSettings {
  let kept: unknown;
  try {
    kept = JSON.parse(saved ?? 'null');
  } catch {
    kept = null;
  }
  const record = (kept && typeof kept === 'object' ? kept : {}) as Record<string, unknown>;
  const pick = <Key extends keyof TextSettings>(key: Key) =>
    ((choices[key] as readonly unknown[]).includes(record[key])
      ? record[key]
      : usualText[key]) as TextSettings[Key];
  return { size: pick('size'), spacing: pick('spacing'), font: pick('font') };
}

/** What is kept: only the settings changed from the usual ones, or nothing at all. */
export function writtenTextSettings(settings: TextSettings): string | null {
  const changed = Object.fromEntries(
    keys.filter((key) => settings[key] !== usualText[key]).map((key) => [key, settings[key]]),
  );
  return Object.keys(changed).length ? JSON.stringify(changed) : null;
}

/** The next size up or down, or none past the largest or smallest. */
export function steppedTextSize(size: TextSettings['size'], by: 1 | -1) {
  return textSizes[textSizes.indexOf(size) + by];
}

/** Marks the page as the head script does before its first paint; usual settings leave no mark. */
export function markTextSettings(root: Element, settings: TextSettings) {
  for (const key of keys) {
    if (settings[key] === usualText[key]) root.removeAttribute(`data-reading-${key}`);
    else root.setAttribute(`data-reading-${key}`, settings[key]);
  }
}

function kept() {
  try {
    return readTextSettings(localStorage.getItem(textSettingsKey));
  } catch {
    return usualText;
  }
}

let current: TextSettings | undefined;
const listeners = new Set<() => void>();

// The settings may have changed elsewhere since this page read them: in another tab, or while
// the page waited unseen, opened ahead of a click or kept for the back button.
function sync() {
  current = kept();
  markTextSettings(document.documentElement, current);
  for (const listener of listeners) listener();
}
const onStorage = (event: StorageEvent) => {
  if (event.key === textSettingsKey || event.key === null) sync();
};
const onShow = (event: PageTransitionEvent) => {
  if (event.persisted) sync();
};

/** The reader's text settings, shared by every control that shows them. */
export const textSettings = {
  get: () => (current ??= kept()),
  subscribe(listener: () => void) {
    if (!listeners.size) {
      window.addEventListener('storage', onStorage);
      window.addEventListener('pageshow', onShow);
      document.addEventListener('prerenderingchange', sync);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('prerenderingchange', sync);
    };
  },
  set(change: Partial<TextSettings>) {
    current = { ...textSettings.get(), ...change };
    const written = writtenTextSettings(current);
    try {
      if (written) localStorage.setItem(textSettingsKey, written);
      else localStorage.removeItem(textSettingsKey);
    } catch {
      /* Without storage, the settings last as long as the page. */
    }
    markTextSettings(document.documentElement, current);
    for (const listener of listeners) listener();
  },
};
