// Keeps the pages a reader opens, and what they need, to read again without a connection.
// Pages always come from the network first, so a connection always shows the latest site.
// To retire the worker, see "Reading offline" in the README.

const version = 'v1';
const names = {
  pages: `alicia-pages-${version}`,
  assets: `alicia-assets-${version}`,
  files: `alicia-files-${version}`,
};
// The oldest kept copies go first once a cache holds more than this.
const limits = { [names.pages]: 50, [names.assets]: 400, [names.files]: 160 };
const offlinePage = '/offline.html';

/** Where the copy of an address is kept, if it is kept at all. */
function placeOf(url, isPage) {
  // Filters in the query string do not make another page.
  if (isPage) return { name: names.pages, key: url.origin + url.pathname };
  if (url.pathname.startsWith('/assets/')) return { name: names.assets, key: url.href };
  if (/^\/(fonts|images)\//.test(url.pathname) || url.pathname === '/favicon.svg')
    return { name: names.files, key: url.href };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(names.files)
      .then((cache) => cache.add(new Request(offlinePage, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set(Object.values(names));
      for (const name of await caches.keys())
        if (name.startsWith('alicia-') && !current.has(name)) await caches.delete(name);
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

/** Only whole answers from this site; a page must be a page, not a feed or a missing one. */
const keepable = (response, { name }) =>
  response.ok &&
  response.type === 'basic' &&
  (name !== names.pages || !!response.headers.get('content-type')?.includes('text/html'));

const keptCopy = ({ name, key }) => caches.match(key, { cacheName: name });

async function store({ name, key }, response) {
  const cache = await caches.open(name);
  await cache.put(key, response);
  const keys = await cache.keys();
  const over = Math.max(0, keys.length - limits[name]);
  await Promise.all(keys.slice(0, over).map((old) => cache.delete(old)));
}

/** A page from the network, kept for later; without a connection, the kept copy or a note. */
async function page(event, place) {
  try {
    const response = (await event.preloadResponse) ?? (await fetch(event.request));
    if (keepable(response, place)) event.waitUntil(store(place, response.clone()));
    return response;
  } catch {
    return (
      (await keptCopy(place)) ??
      (await caches.match(offlinePage, { cacheName: names.files })) ??
      Response.error()
    );
  }
}

/** Built files never change under the same name: a kept copy is always right. */
async function built(event, place) {
  const kept = await keptCopy(place);
  if (kept) return kept;
  const response = await fetch(event.request);
  if (keepable(response, place)) event.waitUntil(store(place, response.clone()));
  return response;
}

/** Fonts and pictures may change under the same name: the kept copy now, a fresh one next time. */
async function file(event, place) {
  const kept = await keptCopy(place);
  const fresh = fetch(event.request).then((response) => {
    if (keepable(response, place)) event.waitUntil(store(place, response.clone()));
    return response;
  });
  event.waitUntil(fresh.catch(() => {}));
  return kept ?? fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  // Comments, avatars and other sites are left to the browser.
  if (url.origin !== self.location.origin) return;
  const isPage = request.mode === 'navigate';
  const place = placeOf(url, isPage);
  if (!place) return;
  if (isPage) event.respondWith(page(event, place));
  else if (place.name === names.assets) event.respondWith(built(event, place));
  else event.respondWith(file(event, place));
});

/** An address on this site, from a page's message. */
function onSite(address) {
  try {
    const url = new URL(address, self.location.href);
    return url.origin === self.location.origin ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A first visit loads before the worker takes it over, so the page sends what it loaded, to be
 * kept as if the worker had fetched it. Most of it is still in the browser's own cache.
 */
async function keepLoaded(page, files) {
  const places = [page && placeOf(page, true), ...files.map((url) => placeOf(url, false))];
  for (const place of places.filter(Boolean).slice(0, 120)) {
    if (await keptCopy(place)) continue;
    try {
      const response = await fetch(place.key);
      if (keepable(response, place)) await store(place, response);
    } catch {
      // Whatever cannot be fetched now is kept the next time it is used.
    }
  }
}

self.addEventListener('message', (event) => {
  const { type, page, files } = event.data ?? {};
  if (type !== 'keep' || typeof page !== 'string' || !Array.isArray(files)) return;
  const addresses = files.filter((file) => typeof file === 'string');
  event.waitUntil(keepLoaded(onSite(page), addresses.map(onSite).filter(Boolean)));
});
