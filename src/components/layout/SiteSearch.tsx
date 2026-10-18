import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import { textLanguage } from '../../content/language.mjs';
import { openPage } from '../../pages';
import './site-search.css';

/** One result the keyboard can choose, and where it leads. */
export type SearchOption = { id: string; href: string };

// The catalogs and their full text load only once a search opens, or is about to. A load that
// fails stays failed until the page reloads, so none is tried without a connection.
const loadResults = () =>
  navigator.onLine
    ? import('../../content/SearchResults')
    : Promise.reject(new Error('Search needs a connection'));
const preloadResults = () => void loadResults().catch(() => {});
let SearchResults = lazy(loadResults);

type Failure = { failed: false } | { failed: true; offline: boolean };

/** Keeps the box open, with a word, when the results cannot load. */
class ResultsBoundary extends Component<{ children: ReactNode }, Failure> {
  state: Failure = { failed: false };
  static getDerivedStateFromError(): Failure {
    return { failed: true, offline: !navigator.onLine };
  }
  componentDidCatch() {
    // Nothing was asked for offline, so the next search asks again.
    SearchResults = lazy(loadResults);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="site-search-hint" role="alert">
        {this.state.offline
          ? 'Search needs a connection the first time. Try again once you’re back online.'
          : 'Search couldn’t load. Reload the page to try again.'}
      </p>
    );
  }
}

const shortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';

/** Whether a key press types into something, where `/` is a character. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * The search box over the page: drawn at once, so phones show their keyboard with it, while
 * the results follow from their own chunk.
 */
function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const options = useRef<SearchOption[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [count, setCount] = useState(0);
  const id = useId();
  const current = count ? Math.min(active, count - 1) : -1;

  // Opened and focused while the press that asked for it is still going on.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    input.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  const onOptions = useCallback((list: SearchOption[]) => {
    options.current = list;
    setCount(list.length);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keys that pick a word in an input method are not for the results.
    if (event.nativeEvent.isComposing || event.altKey) return;
    const list = options.current;
    if (event.key === 'Escape') {
      // A search field would only empty itself first.
      event.preventDefault();
      onClose();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && list.length) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + list.length) % list.length);
    } else if (event.key === 'Enter' && current >= 0) {
      event.preventDefault();
      const { href } = list[current];
      if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener');
      else openPage(href);
    }
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="site-search"
      aria-label="Search posts and notes"
      onClose={(event) => {
        // Mounting twice in development closes and reopens it; that close is not the reader's.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={(event) => {
        // The panel fills the dialog: a press on the dialog itself is beside it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="site-search-field">
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Search posts and notes"
          aria-expanded={count > 0}
          aria-controls={count ? `${id}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? `${id}-option-${current}` : undefined}
          placeholder="Search posts and notes"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          // Typed quotes take the width of the language typed (global.css).
          lang={textLanguage(query)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="icon-button site-search-close"
          aria-label="Close search"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="site-search-body">
        <ResultsBoundary>
          <Suspense fallback={<p className="site-search-hint">Loading…</p>}>
            <SearchResults
              query={query}
              id={id}
              active={current}
              onActive={setActive}
              onOptions={onOptions}
            />
          </Suspense>
        </ResultsBoundary>
      </div>
      <p className="site-search-keys" aria-hidden="true">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> to choose
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
        <span>
          <kbd>esc</kbd> to close
        </span>
      </p>
    </dialog>,
    document.body,
  );
}

/** Searches every post and note from the header, or with ⌘K, Ctrl+K or `/` on any page. */
export default function SiteSearch() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const command =
        (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !typing(event.target);
      if (!command && !slash) return;
      event.preventDefault();
      preloadResults();
      setOpen((value) => (command ? !value : true));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const label = `Search posts and notes (${shortcut})`;
  return (
    <>
      <button
        className="icon-button search-button"
        type="button"
        aria-label="Search posts and notes"
        aria-haspopup="dialog"
        aria-keyshortcuts={shortcut === '⌘K' ? 'Meta+K' : 'Control+K'}
        title={label}
        onPointerEnter={preloadResults}
        onPointerDown={preloadResults}
        onFocus={preloadResults}
        onClick={() => setOpen(true)}
      >
        <Icon name="search" />
      </button>
      {open && <SearchDialog onClose={close} />}
    </>
  );
}
