import './locked.css';
import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react';
import Icon from '../../components/Icon';
import ArticleLoading from '../ArticleLoading';
import { textLanguage } from '../language.mjs';
import type { Article, ArticleSummary } from '../types';
import type { Collection } from '../urls';
import {
  fetchSealed,
  keepLockKeys,
  keptLockKeys,
  keyFromPassword,
  openSealed,
  openWithAny,
  ringKeys,
  type LockKey,
  type Sealed,
} from './crypto';
import { isLockedFile, lockedFileUrl, openLockedFiles } from './files';

type Reader = ComponentType<{ article: Article }>;
type Opened = { article: Article; Reader: Reader; key: LockKey };
/**
 * `wrong` is a password that opens nothing; `lower` one of a level below this document's;
 * `unchecked` one that could not be checked, without a connection.
 */
type Status = 'loading' | 'locked' | 'opening' | 'wrong' | 'lower' | 'unchecked' | 'failed';
const refused = new Set<Status>(['wrong', 'lower', 'unchecked']);

const siteBase = import.meta.env.BASE_URL;
// The keys in the rings of `keys`, as far as they can be fetched.
const ringsOf = async (keys: LockKey[]) =>
  (await Promise.all(keys.map((key) => ringKeys(key, siteBase).catch(() => undefined))))
    .flat()
    .filter((key): key is LockKey => !!key);

// Browsers show these files themselves; any other attachment is saved under its own name.
const shownTypes: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
};
const typeOf = (url: string) =>
  shownTypes[/\.([a-z0-9]+)$/.exec(new URL(url, location.href).pathname)?.[1] ?? ''];

function save(address: string, name: string) {
  const link = document.createElement('a');
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * A locked document: its sealed file opens with a key kept on this device, or else with the
 * password the form asks for, its level's or a higher one's. Once open, it reads like any other
 * document, and its sealed photos and attachments open as the page needs them.
 */
export default function LockedArticle({
  summary,
  url,
  section,
  loadReader,
  titleSuffix,
}: {
  summary: ArticleSummary;
  /** The address of the document's sealed file. */
  url: string;
  section: Collection;
  loadReader: () => Promise<{ default: Reader }>;
  titleSuffix: string;
}) {
  const kind = section === 'blog' ? 'post' : 'note';
  const [sealed, setSealed] = useState<Sealed>();
  const [status, setStatus] = useState<Status>('loading');
  const [page, setPage] = useState<Opened>();
  const field = useRef<HTMLInputElement>(null);

  // The reader and formula styles load before the page is shown, as other documents' do. `key`
  // opened it, and `kept` are the keys to keep with it.
  const show = async (key: LockKey, opened: Article, kept: LockKey[] | Promise<LockKey[]>) => {
    const [{ default: Reader }, , keys] = await Promise.all([
      loadReader(),
      opened.hasMath ? import('katex/dist/katex.min.css') : undefined,
      kept,
    ]);
    keepLockKeys([key, ...keys]);
    setPage({ article: { ...summary, ...opened, locked: url }, Reader, key });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await fetchSealed(url);
      if (cancelled) return;
      setSealed(file);
      // A key kept from an older password no longer opens it, and the form asks again; a kept
      // key's ring may hold the key that does, after a lower level's password changed.
      const kept = await keptLockKeys(file);
      let found = await openWithAny<Article>(kept, file);
      let learned: LockKey[] = [];
      if (!found && kept.length) {
        learned = await ringsOf(kept);
        found = await openWithAny<Article>(learned, file);
      }
      if (cancelled) return;
      if (found) await show(found.key, found.document, learned);
      else setStatus('locked');
    })().catch(() => {
      if (!cancelled) setStatus('failed');
    });
    return () => {
      cancelled = true;
    };
    // Another document remounts this page, so `show` keeps the summary it was opened with.
  }, [url]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (!sealed || status === 'opening' || !password.trim()) return;
    setStatus('opening');
    try {
      const key = await keyFromPassword(password, sealed);
      // Its ring holds the keys of the levels below it: kept with it, they open their documents
      // without asking, and one of them may open this one.
      const ring = ringKeys(key, siteBase);
      const lower = ring.then(
        (keys) => keys ?? [],
        () => [],
      );
      const direct = await openWithAny<Article>([key], sealed);
      if (direct) return await show(key, direct.document, lower);
      let keys: LockKey[] | undefined;
      try {
        keys = await ring;
      } catch {
        return setStatus('unchecked');
      }
      if (!keys) return setStatus('wrong');
      const found = await openWithAny<Article>(keys, sealed);
      if (found) return await show(found.key, found.document, [key, ...keys]);
      // A right password, of a lower level: it opens other documents without asking.
      keepLockKeys([key, ...keys]);
      setStatus('lower');
    } catch {
      setStatus('failed');
    }
  };

  // A refused password stays in the field, selected, so the next try replaces it.
  useEffect(() => {
    if (!refused.has(status)) return;
    field.current?.focus();
    field.current?.select();
  }, [status]);

  useEffect(() => {
    if (page) document.title = page.article.title + titleSuffix;
  }, [page, titleSuffix]);

  // Photos open as they come near the screen; a link to an attachment opens it in a new tab
  // or saves it.
  useEffect(() => {
    if (!page) return;
    const { key, article } = page;
    const close = openLockedFiles(async (address) => {
      const contents = await openSealed(key, await fetchSealed(address));
      return new Blob([contents], { type: typeOf(address) || 'application/octet-stream' });
    });
    const reveal = (image: HTMLImageElement) => {
      lockedFileUrl(image.dataset.lockedSrc!).then(
        (shown) => {
          image.src = shown;
        },
        () => {},
      );
    };
    const nearby =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                nearby?.unobserve(entry.target);
                reveal(entry.target as HTMLImageElement);
              }
            },
            { rootMargin: '600px 0px' },
          );
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-locked-src]')) {
      if (nearby) nearby.observe(image);
      else reveal(image);
    }
    const onOpen = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button > 1) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || !isLockedFile(link.href)) return;
      event.preventDefault();
      const name = article.files?.[new URL(link.href).pathname] ?? 'attachment';
      // The tab opens while the click still counts, and the file arrives in it once opened.
      const tab = typeOf(link.href) ? window.open('', '_blank') : null;
      lockedFileUrl(link.href).then(
        (address) => {
          if (tab) tab.location.href = address;
          else save(address, name);
        },
        () => tab?.close(),
      );
    };
    document.addEventListener('click', onOpen);
    document.addEventListener('auxclick', onOpen);
    return () => {
      nearby?.disconnect();
      document.removeEventListener('click', onOpen);
      document.removeEventListener('auxclick', onOpen);
      close();
    };
  }, [page]);

  if (page) return <page.Reader article={page.article} />;
  if (status === 'loading' || status === 'failed')
    return <ArticleLoading summary={summary} section={section} failed={status === 'failed'} />;
  const opening = status === 'opening';
  return (
    <div className="journal-width reading-page">
      <form className="journal-empty locked-form" onSubmit={submit}>
        <Icon name="lock" />
        <p className="eyebrow">LOCKED {kind.toUpperCase()}</p>
        <h1 className="article-title" lang={textLanguage(summary.title)}>
          {summary.title}
        </h1>
        <p>Enter the password to read it.</p>
        <div className="locked-field">
          <label className="article-search">
            <span className="visually-hidden">Password</span>
            <Icon name="key" />
            <input
              ref={field}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              readOnly={opening}
              aria-invalid={status === 'wrong' || status === 'lower'}
              aria-describedby="locked-status"
            />
          </label>
          <button className="button button-primary" type="submit" disabled={opening}>
            {opening ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
        <p
          id="locked-status"
          className={`locked-status${refused.has(status) ? ' is-wrong' : ''}`}
          role="status"
        >
          {status === 'wrong'
            ? 'That password didn’t open it. Please try again.'
            : status === 'lower'
              ? `That password opens other locked ${kind}s, but not this one.`
              : status === 'unchecked'
                ? 'That password couldn’t be checked. Please check your connection and try again.'
                : 'The password is remembered on this device.'}
        </p>
      </form>
    </div>
  );
}
