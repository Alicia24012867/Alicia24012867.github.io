import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { build, createLogger, createServer } from 'vite';
import { buildArticleCatalog } from '../scripts/content/catalog.mjs';
import {
  createLock,
  LOCK_ROUNDS,
  LOCK_SALT,
  lockedFileName,
  sealDocument,
  veilImages,
} from '../scripts/content/locked.mjs';
import { articlesPlugin, PREVIEW_PASSWORD } from '../scripts/content/plugin.mjs';
import { createSharePage, pagePreloads, SITE_TITLE } from '../scripts/content/share.mjs';
import { renderSitemap } from '../scripts/content/sitemap.mjs';
import { blogFeed } from '../src/config/feeds.mjs';
import { lockedDescription } from '../src/config/locked.mjs';
import {
  keepLockKey,
  keptLockKey,
  keyFromPassword,
  openDocument,
  openSealed,
  readSealed,
} from '../src/content/locked/crypto.ts';
import { isLockedFile, lockedFileUrl, openLockedFiles } from '../src/content/locked/files.ts';

const password = 'correct horse battery';
const siteUrl = 'https://example.com/';
const sealedUrl = /^\/assets\/locked-[0-9a-f]{16}\.(?:bin|png|pdf)$/;
const sealedFile = /^locked-[0-9a-f]{16}\.[a-z0-9]+$/;
const bytes = (buffer) => new Uint8Array(buffer);

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'alicia-locked-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(files)) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  return realpathSync(root);
}

// Everything a locked post holds besides its listed title: none of it may ship unsealed.
const secrets = [
  'CANARY-DESC',
  'canary-tag',
  'CanaryAuthor',
  'CANARY-HEADING',
  'CANARY-BODY',
  '271828',
  'canary-plan',
  'CANARY-PDF',
  'CANARY-UNLISTED',
  'CANARY-HIDDEN',
  'x7k2q',
];

/** One public post, a listed locked post with a photo and a file, and an unlisted locked one. */
async function lockedSite(t) {
  const root = fixture(t, {
    'index.html':
      '<html><head><title>Fixture</title></head><body><script type="module" src="./main.js"></script></body></html>',
    'main.js': [
      "import articles, { loadArticle } from 'virtual:articles';",
      "import search from 'virtual:articles/search';",
      "import titles from 'virtual:articles/titles';",
      "import latest from 'virtual:articles/latest';",
      'console.log(articles, search, titles, latest);',
      "loadArticle('open');",
    ].join('\n'),
    'content/blog/open.md': '---\ntitle: Open post\ndate: 2026-01-01\n---\n\nOpen body.',
    'content/locked/blog/trip.md': [
      '---',
      'title: A walk in the rain',
      'date: 2026-02-01',
      'description: CANARY-DESC',
      'tags: [canary-tag]',
      'author: CanaryAuthor',
      '---',
      '',
      '## CANARY-HEADING',
      '',
      'CANARY-BODY with $x^{271828}$.',
      '',
      '![Rain](./assets/rain.png)',
      '',
      '[The plan](./assets/canary-plan.pdf), [a hidden note](./x7k2q.md), [an open post](./open.md)',
    ].join('\n'),
    'content/locked/blog/x7k2q.md':
      '---\ntitle: CANARY-UNLISTED\ndate: 2026-03-01\nunlisted: true\n---\n\nCANARY-HIDDEN body.',
    'content/locked/blog/assets/canary-plan.pdf': '%PDF-1.4 CANARY-PDF',
  });
  await sharp({ create: { width: 8, height: 6, channels: 3, background: '#3a8de0' } })
    .png()
    .toFile(path.join(root, 'content/locked/blog/assets/rain.png'));
  return root;
}

const lockedPlugin = (options) =>
  articlesPlugin({ lockedDirectory: 'content/locked/blog', requirePassword: false, ...options });

const buildSite = (root, plugin, customLogger = createLogger('silent')) =>
  build({
    root,
    configFile: false,
    logLevel: 'silent',
    customLogger,
    cacheDir: path.join(root, 'cache'),
    plugins: [plugin],
    build: { rolldownOptions: { input: path.join(root, 'index.html') } },
  });

const builtFiles = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));

test('the browser opens what the build seals with the same password, and nothing else', async (t) => {
  const lock = createLock('Crème brûlée à deux', { rounds: 1000 });
  const data = Buffer.from([0, 1, 2, 254, 255]);
  const sealed = lock.seal(data);
  // Unchanged bytes seal to the same file; changed ones never share its nonce.
  assert.deepEqual(lock.seal(data), sealed);
  const changed = readSealed(bytes(lock.seal(Buffer.from([0, 1, 2, 254, 0]))));
  const parts = readSealed(bytes(sealed));
  assert.notDeepEqual(changed.nonce, parts.nonce);
  assert.equal(parts.rounds, 1000);
  assert.equal(Buffer.from(parts.salt).toString(), LOCK_SALT);
  // Spaces around it, and decomposed accents, make the same password.
  const key = await keyFromPassword('  Crème brûlée à deux ', parts);
  assert.deepEqual(Buffer.from(await openSealed(key, parts)), data);
  await assert.rejects(openSealed(await keyFromPassword('Crème brûlée à trois', parts), parts));
  const document = { title: 'Title', html: '<p>Body</p>', files: { '/a': 'a.pdf' } };
  assert.deepEqual(
    await openDocument(key, readSealed(bytes(sealDocument(lock, document)))),
    document,
  );
  for (const broken of [
    sealed.subarray(0, 20),
    Buffer.concat([Buffer.from([2]), sealed.subarray(1)]),
  ])
    assert.equal(readSealed(bytes(broken)), undefined);

  // The key is kept on this device for files sealed like these, and only for them.
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (name) => store.get(name) ?? null,
      setItem: (name, value) => store.set(name, value),
    },
  });
  t.after(() => delete globalThis.localStorage);
  assert.equal(await keptLockKey(parts), undefined);
  keepLockKey(key);
  assert.deepEqual(Buffer.from(await openSealed(await keptLockKey(parts), parts)), data);
  const other = readSealed(bytes(createLock('Crème brûlée à deux', { rounds: 2000 }).seal(data)));
  assert.equal(await keptLockKey(other), undefined);
  store.set('alicia-locked-key', '{not json');
  assert.equal(await keptLockKey(parts), undefined);
});

test('sealed files keep a plain extension, and photos wait for the reader to open them', () => {
  const sealed = Buffer.from('sealed bytes');
  const name = lockedFileName('assets', sealed);
  assert.match(name, /^assets\/locked-[0-9a-f]{16}\.bin$/);
  assert.equal(lockedFileName('assets', Buffer.from(sealed)), name);
  assert.notEqual(lockedFileName('assets', Buffer.from('other bytes')), name);
  assert.equal(lockedFileName('assets', sealed, '.JPG'), name.replace('.bin', '.jpg'));
  for (const extension of ['', '.', '.j"pg', '.verylongext', '.ü', '.svg/x'])
    assert.equal(lockedFileName('assets', sealed, extension), name, extension);

  const photo = '/assets/locked-0123456789abcdef.jpg';
  const html =
    `<p><img src="${photo}" alt="Rain" width="2400" height="1600" ` +
    `srcset="/assets/locked-fedcba9876543210.jpg 1724w, ${photo} 2400w" sizes="100vw">` +
    '<img src="/images/sky.webp" alt="Sky"><img src="/assets/locked-1111111111111111.png" alt="Dot"></p>';
  const veiled = veilImages(html, new Set([photo, '/assets/locked-1111111111111111.png']));
  const shape = (width, height) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`,
    );
  assert.equal(
    veiled,
    `<p><img src="${shape(2400, 1600)}" data-locked-src="${photo}" alt="Rain" width="2400" height="1600">` +
      '<img src="/images/sky.webp" alt="Sky">' +
      `<img src="${shape(1, 1)}" data-locked-src="/assets/locked-1111111111111111.png" alt="Dot"></p>`,
  );
});

test('locked documents join their collection under the rules that keep them sealed', (t) => {
  const read = (files) => {
    const root = fixture(t, files);
    return buildArticleCatalog(path.join(root, 'blog'), undefined, {
      basePath: '/blog/',
      lockedRoot: path.join(root, 'locked'),
    });
  };
  const { articles } = read({
    'blog/open.md': '# Open\n\nOpen body.',
    'locked/trip.md': '---\nlocked: true\n---\n# Trip\n\n[Open](open.md) [Hidden](x7k2q.md)',
    'locked/x7k2q.md': '---\nunlisted: true\n---\n# Hidden\n\n[Trip](trip.md)',
  });
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  assert.deepEqual(
    Object.fromEntries(articles.map(({ slug, locked, unlisted }) => [slug, [locked, unlisted]])),
    { open: [undefined, undefined], trip: [true, undefined], x7k2q: [true, true] },
  );
  // A public document never names a locked one that links to it.
  assert.deepEqual(bySlug.get('open').backlinks, []);
  assert.deepEqual(bySlug.get('trip').backlinks, ['x7k2q']);
  assert.deepEqual(bySlug.get('x7k2q').backlinks, ['trip']);
  // Without the private repository, the public documents build alone.
  const root = fixture(t, { 'blog/open.md': '# Open' });
  assert.deepEqual(
    buildArticleCatalog(path.join(root, 'blog'), undefined, {
      lockedRoot: path.join(root, 'locked'),
    }).articles.map((article) => article.slug),
    ['open'],
  );

  for (const [files, message] of [
    [{ 'blog/a.md': '---\nlocked: true\n---\n# A' }, /^a\.md: 公开目录里的文章任何人都能读到/],
    [
      { 'locked/b.md': '---\nlocked: false\n---\n# B' },
      /^加密文章 b\.md: 加密文章目录里的文章总会加密/,
    ],
    [{ 'blog/a.md': '---\nunlisted: true\n---\n# A' }, /^a\.md: unlisted 只能用于加密文章/],
    [{ 'locked/b.md': '---\nunlisted: "true"\n---\n# B' }, /必须是布尔值/],
    [
      { 'blog/same.md': '# Public', 'locked/same.md': '# Locked' },
      /文章地址重复：same，加密文章不能与公开文章同名/,
    ],
    [
      { 'blog/a.md': '# A\n\n[Secret](trip.md)', 'locked/trip.md': '# Trip' },
      /^a\.md: 公开文章不能用文件链接 trip\.md 指向加密文章，请改用它的网址，例如 \/blog\/<地址>\//,
    ],
    [{ 'locked/b.md': '# B\n\n[Gone](gone.md)' }, /^加密文章 b\.md: 链接 gone\.md 指向不存在/],
  ])
    assert.throws(() => read(files), { message }, JSON.stringify(files));
});

test('a locked page says only what its listing does, and an unlisted one not even its title', () => {
  const shell =
    '<!doctype html>\n<html lang="en">\n  <head>\n    ' +
    [
      '<meta name="description" content="Listing" />',
      '<meta property="og:title" content="Blog · Alicia" />',
      '<meta property="og:description" content="Listing" />',
      '<meta property="og:type" content="website" />',
      '<link rel="canonical" href="https://example.com/blog/" />',
      '<meta property="og:url" content="https://example.com/blog/" />',
      '<meta property="og:image" content="https://example.com/images/share/site.aaa.jpg" />',
      '<meta property="og:image:alt" content="Alicia" />',
      '<meta name="twitter:title" content="Blog · Alicia" />',
      '<meta name="twitter:description" content="Listing" />',
      '<meta name="twitter:image" content="https://example.com/images/share/site.aaa.jpg" />',
      '<meta name="twitter:image:alt" content="Alicia" />',
    ].join('\n    ') +
    '\n    <title>Blog · Alicia</title>\n  </head>\n  <body>\n    <div id="root"></div>\n' +
    '    <noscript>Please enable JavaScript to read the blog.</noscript>\n' +
    '    <script type="module" src="/assets/blog.js"></script>\n  </body>\n</html>\n';
  const render = createSharePage(shell, { siteUrl, basePath: '/blog/' });
  const card = { url: '/images/share/site.bbb.jpg' };
  const lockedUrl = '/assets/locked-0123456789abcdef.bin';
  const trip = {
    slug: 'trip',
    title: 'A walk in the rain',
    description: 'CANARY-DESC',
    author: 'CanaryAuthor',
    tags: ['canary-tag'],
    date: '2026-01-02',
    updated: '',
    section: 'life',
    locked: true,
  };
  const listed = render(trip, card, lockedUrl);
  assert.ok(listed.includes('<title>A walk in the rain · Alicia Blog</title>'));
  assert.ok(listed.includes(`content="${lockedDescription('blog')}"`));
  assert.ok(listed.includes('content="https://example.com/images/share/site.bbb.jpg"'));
  assert.ok(listed.includes(`property="og:image:alt" content="${SITE_TITLE}"`));
  assert.match(listed, /<meta name="robots" content="noindex"/);
  assert.ok(listed.includes(`<meta name="locked-article" content="${lockedUrl}"`));
  assert.match(listed, /article:published_time.*\n.*article:modified_time.*\n.*article:section/);
  assert.doesNotMatch(listed, /CANARY|canary|name="author"|article:tag/i);

  const unlisted = render(
    { ...trip, slug: 'x7k2q', title: 'CANARY-UNLISTED', unlisted: true },
    card,
    lockedUrl,
  );
  assert.ok(unlisted.includes('<title>A locked post · Alicia Blog</title>'));
  assert.match(unlisted, /<meta name="robots" content="noindex"/);
  assert.ok(unlisted.includes(`<meta name="locked-article" content="${lockedUrl}"`));
  assert.doesNotMatch(unlisted, /CANARY|canary|article:|name="author"/i);
  assert.throws(() => render(trip, card), /加密文章缺少密文文件：trip/);

  // Locked documents stay out of the sitemap.
  const sitemap = renderSitemap(
    [{ basePath: '/blog/', articles: [{ slug: 'open', date: '2026-01-01', updated: '' }, trip] }],
    siteUrl,
  );
  assert.ok(sitemap.includes('<loc>https://example.com/blog/open/</loc>'));
  assert.doesNotMatch(sitemap, /trip/);
});

test('a locked page fetches the form that opens it and its sealed file, not its body', () => {
  const chunk = (fileName, facadeModuleId, imports = [], css = []) => ({
    type: 'chunk',
    fileName,
    facadeModuleId,
    imports,
    viteMetadata: { importedCss: new Set(css) },
  });
  const outputs = [
    chunk('assets/blog.js', '/site/blog/index.html', ['assets/shared.js']),
    chunk('assets/shared.js', null),
    chunk('assets/Reader.js', '/site/src/blog/ArticleReader.tsx', ['assets/shared.js']),
    chunk(
      'assets/Locked.js',
      '/site/src/content/locked/LockedArticle.tsx',
      ['assets/shared.js', 'assets/files.js'],
      ['assets/Locked.css'],
    ),
    chunk('assets/files.js', null),
    chunk('assets/trip.js', '\0virtual:articles/entry/trip'),
    {
      type: 'asset',
      fileName: 'assets/katex.css',
      originalFileNames: ['node_modules/katex/dist/katex.min.css'],
    },
  ];
  const preloads = pagePreloads(
    Object.fromEntries(outputs.map((output) => [output.fileName, output])),
    { root: '/site', base: '/', lockedReader: 'src/content/locked/LockedArticle.tsx' },
  );
  const entry =
    '<script type="module" crossorigin src="/assets/blog.js"></script>' +
    '<link rel="modulepreload" crossorigin href="/assets/shared.js">';
  const links = (html) =>
    [...html.matchAll(/\n {4}<link ([^>]*) crossorigin href="([^"]+)">/g)].map(
      ([, attributes, href]) => attributes + ' ' + href,
    );
  const blog = { moduleId: 'virtual:articles', reader: 'src/blog/ArticleReader.tsx' };
  const article = { slug: 'trip', locked: true, hasMath: true };
  assert.deepEqual(links(preloads(entry, blog, article, '/assets/locked-0123456789abcdef.bin')), [
    'rel="modulepreload" /assets/Reader.js',
    'rel="modulepreload" /assets/Locked.js',
    'rel="modulepreload" /assets/files.js',
    'rel="preload" as="style" /assets/Locked.css',
    'rel="preload" as="fetch" /assets/locked-0123456789abcdef.bin',
  ]);
});

test('a page opens sealed files of this site only, each once, until the document closes', async (t) => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new URL('https://example.com/blog/trip/'),
  });
  t.after(() => delete globalThis.location);
  const photo = '/assets/locked-0123456789abcdef.jpg';
  assert.equal(isLockedFile(photo), true);
  assert.equal(isLockedFile('https://example.com' + photo), true);
  assert.equal(isLockedFile('https://elsewhere.example' + photo), false);
  // The shared script of the password form is not a sealed file.
  assert.equal(isLockedFile('/assets/locked-BO7p59bj.js'), false);
  assert.equal(isLockedFile('/assets/locked-0123456789abcdef'), false);
  await assert.rejects(lockedFileUrl(photo), /No locked document is open/);
  let opens = 0;
  let fail = true;
  const close = openLockedFiles(async () => {
    opens++;
    if (fail) throw new Error('Offline');
    return new Blob(['photo'], { type: 'image/jpeg' });
  });
  await assert.rejects(lockedFileUrl(photo), /Offline/);
  fail = false;
  const shown = await lockedFileUrl(photo);
  assert.match(shown, /^blob:/);
  assert.equal(await lockedFileUrl('https://example.com' + photo), shown);
  assert.equal(opens, 2);
  close();
  await assert.rejects(lockedFileUrl(photo), /No locked document is open/);
});

test('a build ships locked documents sealed, and nothing they hold in the open', async (t) => {
  const root = await lockedSite(t);
  await buildSite(root, lockedPlugin({ lockedPassword: password, feed: blogFeed }));
  const dist = path.join(root, 'dist');
  const photo = readFileSync(path.join(root, 'content/locked/blog/assets/rain.png'));
  for (const file of builtFiles(dist)) {
    const contents = readFileSync(file);
    const text = contents.toString('utf8');
    const label = path.relative(dist, file);
    for (const secret of secrets) assert.ok(!text.includes(secret), `${label} holds ${secret}`);
    assert.ok(!contents.includes(photo), `${label} holds the photo`);
    assert.ok(!text.includes(photo.toString('base64')), `${label} holds the photo`);
  }
  for (const feed of ['rss.xml', 'atom.xml']) {
    const xml = readFileSync(path.join(dist, feed), 'utf8');
    assert.match(xml, /Open post/);
    assert.doesNotMatch(xml, /A walk in the rain/);
  }

  const sealedNames = readdirSync(path.join(dist, 'assets')).filter((name) =>
    sealedFile.test(name),
  );
  assert.deepEqual(sealedNames.map((name) => path.extname(name)).sort(), [
    '.bin',
    '.bin',
    '.pdf',
    '.png',
  ]);
  const read = (url) => readSealed(bytes(readFileSync(path.join(dist, url))));
  const first = read('assets/' + sealedNames[0]);
  assert.equal(first.rounds, LOCK_ROUNDS);
  const key = await keyFromPassword(password, first);
  await assert.rejects(openSealed(await keyFromPassword('correct horse batterz', first), first));
  const bodies = new Map();
  for (const name of sealedNames.filter((name) => name.endsWith('.bin'))) {
    const body = await openDocument(key, read('assets/' + name));
    bodies.set(body.slug, { name, body });
  }
  const trip = bodies.get('trip').body;
  assert.deepEqual(
    [trip.title, trip.description, trip.tags, trip.author],
    ['A walk in the rain', 'CANARY-DESC', ['canary-tag'], 'CanaryAuthor'],
  );
  for (const field of ['searchText', 'locked', 'unlisted', 'share'])
    assert.ok(!(field in trip), field);
  assert.match(trip.html, /CANARY-BODY/);
  assert.match(trip.html, /class="katex/);
  assert.match(trip.html, /href="\/blog\/x7k2q\/"/);
  assert.match(trip.html, /href="\/blog\/open\/"/);
  const [, shape, photoUrl] =
    /<img src="(data:image\/svg\+xml,[^"]+)" data-locked-src="([^"]+)"/.exec(trip.html);
  assert.ok(shape);
  const planUrl = /href="(\/assets\/locked-[0-9a-f]{16}\.pdf)"/.exec(trip.html)[1];
  for (const url of [photoUrl, planUrl]) assert.match(url, sealedUrl);
  assert.deepEqual(trip.files, { [photoUrl]: 'rain.png', [planUrl]: 'canary-plan.pdf' });
  assert.deepEqual(Buffer.from(await openSealed(key, read(photoUrl))), photo);
  assert.equal(Buffer.from(await openSealed(key, read(planUrl))).toString(), '%PDF-1.4 CANARY-PDF');
  assert.equal(bodies.get('x7k2q').body.title, 'CANARY-UNLISTED');

  // The listing names the listed post and its sealed text; the unlisted one only has a page.
  const scripts = builtFiles(dist)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  assert.ok(scripts.includes('A walk in the rain'));
  assert.ok(scripts.includes('/assets/' + bodies.get('trip').name));
  assert.ok(!scripts.includes(bodies.get('x7k2q').name));
});

test('a local build without the password leaves locked documents out, and CI fails instead', async (t) => {
  const root = await lockedSite(t);
  const warnings = [];
  const logger = createLogger('silent');
  logger.warn = (message) => warnings.push(message);
  await buildSite(root, lockedPlugin({ lockedPassword: '' }), logger);
  assert.ok(warnings.some((message) => message.includes('未设置 LOCKED_PASSWORD')));
  const files = builtFiles(path.join(root, 'dist'));
  assert.ok(!files.some((file) => sealedFile.test(path.basename(file))));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const secret of [...secrets, 'A walk in the rain'])
      assert.ok(!text.includes(secret), `${file} holds ${secret}`);
  }
  await assert.rejects(
    buildSite(root, lockedPlugin({ lockedPassword: '', requirePassword: true }), logger),
    /构建加密文章需要密码：请在仓库的 Actions secrets 里设置 LOCKED_PASSWORD/,
  );
  await assert.rejects(
    buildSite(root, lockedPlugin({ lockedPassword: 'too short' }), logger),
    /LOCKED_PASSWORD 至少需要 12 个字符/,
  );
});

test('the dev server opens locked documents with the preview password', async (t) => {
  const root = await lockedSite(t);
  const notes = [];
  const logger = createLogger('silent');
  logger.info = (message) => notes.push(message);
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    customLogger: logger,
    cacheDir: path.join(root, 'cache'),
    plugins: [lockedPlugin({ lockedPassword: '' })],
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const module = async (id) => (await server.transformRequest(id)).code;
  const exported = async (id) => JSON.parse(/export default (.*);/.exec(await module(id))[1]);

  const listing = await module('virtual:articles');
  for (const secret of secrets) assert.ok(!listing.includes(secret), secret);
  assert.ok(!listing.includes('virtual:articles/entry/trip'));
  const [trip, open] = JSON.parse(/^const articles = (.*);$/m.exec(listing)[1]);
  assert.equal(open.slug, 'open');
  assert.equal(trip.title, 'A walk in the rain');
  assert.match(trip.locked, sealedUrl);
  const shown = ['slug', 'title', 'date', 'updated', 'pin', 'section', 'locked'];
  const placeholders = Object.fromEntries(
    Object.entries(trip).filter(([field]) => !shown.includes(field)),
  );
  assert.deepEqual(placeholders, {
    description: '',
    tags: [],
    format: 'Markdown',
    lang: '',
    readingMinutes: 0,
    wordCount: 0,
    hasMath: false,
  });
  const search = await module('virtual:articles/search');
  assert.match(search, /Open body/);
  for (const secret of [...secrets, '"trip"']) assert.ok(!search.includes(secret), secret);
  assert.deepEqual(await exported('virtual:articles/titles'), [
    ['trip', 'A walk in the rain'],
    ['open', 'Open post'],
  ]);
  assert.deepEqual(await exported('virtual:articles/latest'), {
    title: 'A walk in the rain',
    date: '2026-02-01',
    path: '/blog/trip/',
  });
  for (const slug of ['trip', 'x7k2q'])
    await assert.rejects(
      module(`virtual:articles/entry/${slug}`),
      /Locked articles have no module/,
    );

  const response = await fetch(origin + trip.locked);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  const sealed = readSealed(bytes(await response.arrayBuffer()));
  const key = await keyFromPassword(PREVIEW_PASSWORD, sealed);
  const body = await openDocument(key, sealed);
  assert.match(body.html, /CANARY-BODY/);
  const photo = /data-locked-src="([^"]+)"/.exec(body.html)[1];
  const photoFile = readSealed(bytes(await (await fetch(origin + photo)).arrayBuffer()));
  assert.deepEqual(
    Buffer.from(await openSealed(key, photoFile)),
    readFileSync(path.join(root, 'content/locked/blog/assets/rain.png')),
  );
  const head = await fetch(origin + trip.locked, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const missing = await fetch(origin + '/assets/locked-0123456789abcdef.bin');
  assert.equal(missing.status, 404);
  await missing.text();
  assert.ok(notes.some((message) => message.includes(`本地预览密码：${PREVIEW_PASSWORD}`)));
});
