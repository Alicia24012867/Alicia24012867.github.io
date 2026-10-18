import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const site = 'https://nymphilia.com';

/** The worker in a sandbox, with a network that can be cut and caches kept in memory. */
function worker() {
  const network = { online: true, files: new Map(), fetched: [] };
  const stores = new Map();
  // Like the real caches, addresses are read relative to the worker's site.
  const keyOf = (request) =>
    new URL(typeof request === 'string' ? request : request.url, site).href;
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async put(request, response) {
        entries.delete(keyOf(request));
        entries.set(keyOf(request), await response.text());
      },
      async match(request) {
        const body = entries.get(keyOf(request));
        return body === undefined ? undefined : new Response(body, { headers: { 'x-kept': name } });
      },
      async keys() {
        return [...entries.keys()].map((url) => ({ url }));
      },
      async delete(request) {
        return entries.delete(keyOf(request));
      },
      async add(request) {
        const response = await fetch(request);
        entries.set(keyOf(request), await response.text());
      },
    };
  };
  async function fetch(request) {
    const url = keyOf(request);
    network.fetched.push(url);
    if (!network.online) throw new TypeError('Failed to fetch');
    const file = network.files.get(new URL(url).pathname);
    const response = new Response(file?.body ?? 'Not found', {
      status: file ? 200 : 404,
      headers: { 'content-type': file?.type ?? 'text/html; charset=utf-8' },
    });
    // Same-site answers, as the browser marks them.
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  }
  const listeners = {};
  const self = {
    location: new URL(site + '/sw.js'),
    addEventListener: (type, listener) => (listeners[type] = listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { navigationPreload: { enable: async () => {} } },
  };
  const caches = {
    open: async (name) => cache(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request, { cacheName }) => cache(cacheName).match(request),
  };
  // A worker's relative addresses are on its own site.
  class SiteRequest extends Request {
    constructor(input, init) {
      super(new URL(input, site), init);
    }
  }
  vm.runInNewContext(read('public/sw.js'), {
    self,
    caches,
    fetch,
    Request: SiteRequest,
    Response,
    URL,
    Set,
  });

  async function settle(event, answer) {
    const pending = event.pending;
    const response = await answer;
    for (let done = 0; done < pending.length; ) {
      const count = pending.length;
      await Promise.all(pending.slice(done));
      done = count;
    }
    return response;
  }
  return {
    network,
    stores,
    kept: (name) => [...(stores.get(name)?.keys() ?? [])],
    async lifecycle() {
      for (const type of ['install', 'activate']) {
        const event = { pending: [], waitUntil: (promise) => event.pending.push(promise) };
        listeners[type](event);
        await settle(event);
      }
    },
    /** A page's message, once the worker has finished with it. */
    async message(data) {
      const event = { data, pending: [], waitUntil: (promise) => event.pending.push(promise) };
      listeners.message(event);
      await settle(event);
    },
    /** What the page gets for a request, once the worker has finished with it. */
    async get(path, { mode = 'cors', method = 'GET', headers = {} } = {}) {
      let answer;
      const event = {
        request: { url: new URL(path, site).href, mode, method, headers: new Headers(headers) },
        preloadResponse: Promise.resolve(undefined),
        pending: [],
        respondWith: (promise) => (answer = promise),
        waitUntil: (promise) => event.pending.push(promise),
      };
      listeners.fetch(event);
      if (!answer) return 'browser';
      const response = await settle(event, answer);
      return {
        status: response.status,
        body: await response.text(),
        kept: response.headers.get('x-kept'),
      };
    },
  };
}

const page = (body) => ({ body: `<title>${body}</title>`, type: 'text/html; charset=utf-8' });

test('pages come from the network, and are kept by their path', async () => {
  const sw = worker();
  sw.network.files.set('/offline.html', page('Offline'));
  sw.network.files.set('/blog/moments/', page('Moments'));
  await sw.lifecycle();
  assert.deepEqual(sw.kept('alicia-files-v1'), [site + '/offline.html']);
  const online = await sw.get('/blog/moments/?q=sky', { mode: 'navigate' });
  assert.deepEqual(online, { status: 200, body: '<title>Moments</title>', kept: null });
  assert.deepEqual(sw.kept('alicia-pages-v1'), [site + '/blog/moments/']);
  // A missing page is shown as the server has it, and not kept; nor are feeds opened as pages.
  assert.equal((await sw.get('/blog/missing/', { mode: 'navigate' })).status, 404);
  sw.network.files.set('/sitemap.xml', { body: '<urlset/>', type: 'application/xml' });
  assert.equal((await sw.get('/sitemap.xml', { mode: 'navigate' })).body, '<urlset/>');
  assert.deepEqual(sw.kept('alicia-pages-v1'), [site + '/blog/moments/']);
});

test('without a connection, a kept page opens, and any other shows the offline note', async () => {
  const sw = worker();
  sw.network.files.set('/offline.html', page('Offline'));
  sw.network.files.set('/blog/moments/', page('Moments'));
  await sw.lifecycle();
  await sw.get('/blog/moments/', { mode: 'navigate' });
  sw.network.online = false;
  assert.equal(
    (await sw.get('/blog/moments/?q=sky', { mode: 'navigate' })).body,
    '<title>Moments</title>',
  );
  assert.equal((await sw.get('/notes/', { mode: 'navigate' })).body, '<title>Offline</title>');
});

test('built files are kept once and then never fetched again', async () => {
  const sw = worker();
  sw.network.files.set('/assets/global-abc.js', { body: 'code', type: 'text/javascript' });
  await sw.get('/assets/global-abc.js');
  sw.network.fetched.length = 0;
  sw.network.online = false;
  assert.deepEqual(await sw.get('/assets/global-abc.js'), {
    status: 200,
    body: 'code',
    kept: 'alicia-assets-v1',
  });
  assert.deepEqual(sw.network.fetched, []);
});

test('fonts and pictures show the kept copy, and fetch a fresh one for next time', async () => {
  const sw = worker();
  sw.network.files.set('/images/summer-sky.webp', { body: 'old sky', type: 'image/webp' });
  await sw.get('/images/summer-sky.webp');
  sw.network.files.set('/images/summer-sky.webp', { body: 'new sky', type: 'image/webp' });
  assert.equal((await sw.get('/images/summer-sky.webp')).body, 'old sky');
  assert.equal((await sw.get('/images/summer-sky.webp')).body, 'new sky');
});

test('a first visit is kept from what the page loaded before the worker took it over', async () => {
  const sw = worker();
  sw.network.files.set('/offline.html', page('Offline'));
  sw.network.files.set('/', page('Home'));
  sw.network.files.set('/assets/home-abc.js', { body: 'code', type: 'text/javascript' });
  sw.network.files.set('/images/summer-sky.webp', { body: 'sky', type: 'image/webp' });
  await sw.lifecycle();
  const loaded = {
    type: 'keep',
    page: site + '/?from=share',
    files: [
      site + '/assets/home-abc.js',
      site + '/images/summer-sky.webp',
      site + '/assets/gone-123.js',
      'https://giscus.app/client.js',
      site + '/feed.xml',
      'http://[',
      42,
    ],
  };
  await sw.message(loaded);
  assert.deepEqual(sw.kept('alicia-pages-v1'), [site + '/']);
  assert.deepEqual(sw.kept('alicia-assets-v1'), [site + '/assets/home-abc.js']);
  assert.deepEqual(sw.kept('alicia-files-v1'), [
    site + '/offline.html',
    site + '/images/summer-sky.webp',
  ]);
  // Only what is not kept yet is fetched again, and other messages are ignored.
  sw.network.fetched.length = 0;
  await sw.message(loaded);
  await sw.message({ type: 'keep' });
  await sw.message('hello');
  assert.deepEqual(sw.network.fetched, [site + '/assets/gone-123.js']);
  sw.network.online = false;
  assert.equal((await sw.get('/', { mode: 'navigate' })).body, '<title>Home</title>');
  assert.equal((await sw.get('/images/summer-sky.webp')).body, 'sky');
});

test('other sites, other methods and partial requests are left to the browser', async () => {
  const sw = worker();
  assert.equal(await sw.get('https://giscus.app/client.js'), 'browser');
  assert.equal(await sw.get('/blog/', { mode: 'navigate', method: 'POST' }), 'browser');
  assert.equal(await sw.get('/assets/video.mp4', { headers: { range: 'bytes=0-' } }), 'browser');
  assert.equal(await sw.get('/feed.xml'), 'browser');
});

test('a full cache lets its oldest copies go', async () => {
  const sw = worker();
  for (let i = 0; i < 53; i++) {
    sw.network.files.set(`/blog/post-${i}/`, page(`Post ${i}`));
    await sw.get(`/blog/post-${i}/`, { mode: 'navigate' });
  }
  const kept = sw.kept('alicia-pages-v1');
  assert.equal(kept.length, 50);
  assert.equal(kept[0], site + '/blog/post-3/');
  assert.equal(kept.at(-1), site + '/blog/post-52/');
});

test('a new version clears the caches of the old one, and the offline note reads the same pages', async () => {
  const sw = worker();
  sw.network.files.set('/offline.html', page('Offline'));
  sw.stores.set('alicia-pages-v0', new Map([[site + '/old/', 'old']]));
  sw.stores.set('other-app', new Map());
  await sw.lifecycle();
  assert.deepEqual([...sw.stores.keys()].sort(), ['alicia-files-v1', 'other-app']);
  const version = read('public/sw.js').match(/const version = '(v\d+)';/)[1];
  assert.match(
    read('public/offline.html'),
    new RegExp(`caches\\.open\\('alicia-pages-${version}'\\)`),
  );
});
