import test from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteUrl,
  articlePath,
  articleUrl,
  listingUrl,
  queryFromSearch,
  slugFromLocation,
} from '../src/content/urls.ts';
import { contentPageMeta } from '../src/content/meta.ts';

test('articles use their own static address while list filters stay in the query string', () => {
  assert.equal(articlePath('blog', 'test'), '/blog/test/');
  assert.equal(
    articlePath('notes', 'nested/中文 note'),
    '/notes/nested/%E4%B8%AD%E6%96%87%20note/',
  );
  for (const collection of ['blog', 'notes']) {
    for (const query of ['stream', '站点记录', ' C++ & GPU? #1 / 100% ', '']) {
      const reader = new URL(
        articleUrl(collection, 'nested/中文 note', query),
        'https://example.com/' + collection + '/',
      );
      assert.equal(reader.pathname, '/' + collection + '/nested/%E4%B8%AD%E6%96%87%20note/');
      assert.equal(queryFromSearch(reader.search), query);
      assert.equal(reader.searchParams.has('post'), false);
      reader.hash = '#section-heading';
      const back = new URL(listingUrl(collection, queryFromSearch(reader.search)), reader);
      assert.equal(back.pathname, '/' + collection + '/');
      assert.equal(queryFromSearch(back.search), query);
      assert.equal(back.hash, '');
      const next = new URL(
        articleUrl(collection, 'another', queryFromSearch(reader.search)),
        reader,
      );
      assert.equal(next.pathname, '/' + collection + '/another/');
      assert.equal(queryFromSearch(next.search), query);
    }
  }
});

test('filters and sorting stay in the address without trusting external return URLs', () => {
  assert.equal(articleUrl('blog', 'test', '', 'oldest'), '/blog/test/?sort=oldest');
  assert.equal(listingUrl('blog', 'gpu'), '/blog/?q=gpu');
  assert.equal(
    listingUrl('notes', queryFromSearch('?post=test&returnTo=https://external.invalid/')),
    '/notes/',
  );
  const query = 'https://external.invalid/?post=other#fragment';
  const kept = new URL(listingUrl('notes', query), 'https://example.com/notes/test/');
  assert.equal(kept.origin, 'https://example.com');
  assert.equal(kept.pathname, '/notes/');
  assert.equal(queryFromSearch(kept.search), query);
  assert.equal(kept.hash, '');
});

test('the static path decides the document while ?post= links keep working', () => {
  assert.equal(slugFromLocation('blog', { pathname: '/blog/moments/', search: '' }), 'moments');
  assert.equal(
    slugFromLocation('notes', { pathname: '/notes/source/ta_timestep_control/', search: '' }),
    'source/ta_timestep_control',
  );
  assert.equal(
    slugFromLocation('notes', { pathname: '/notes/source/%E4%B8%AD%E6%96%87/', search: '' }),
    'source/中文',
  );
  assert.equal(slugFromLocation('blog', { pathname: '/blog/', search: '' }), undefined);
  assert.equal(
    slugFromLocation('blog', { pathname: '/blog/', search: '?post=legacy&q=gpu' }),
    'legacy',
  );
  assert.equal(
    slugFromLocation('blog', { pathname: '/blog/moments/', search: '?post=other' }),
    'moments',
  );
  assert.equal(slugFromLocation('notes', { pathname: '/blog/moments/', search: '' }), undefined);
  assert.equal(slugFromLocation('blog', { pathname: '/blog/%E0%A4%A/', search: '' }), undefined);
  assert.equal(absoluteUrl('/blog/moments/'), 'https://nymphilia.com/blog/moments/');
});
test('both addresses of one document share its canonical and card', () => {
  const summary = {
    slug: 'nested/中文 note',
    title: 'A < B',
    description: 'Summary',
    date: '2026-01-02',
    updated: '',
    pin: false,
    author: 'Alicia',
    tags: [],
    section: 'life',
    format: 'Markdown',
    readingMinutes: 2,
    hasMath: false,
    share: {
      path: '/blog/nested/中文 note/',
      image: '/images/share/blog/nested/中文 note.abc.jpg',
    },
  };
  const titles = {
    listing: 'Blog · Alicia',
    missing: 'Post not found · Alicia Blog',
    suffix: ' · Alicia Blog',
  };
  const options = {
    section: 'blog',
    slug: 'nested/中文 note',
    summary,
    titles,
    description: 'List description',
    origin: 'https://example.com',
  };
  const meta = contentPageMeta(options);
  assert.deepEqual(meta, {
    type: 'article',
    title: 'A < B · Alicia Blog',
    description: 'Summary',
    canonical: 'https://example.com/blog/nested/%E4%B8%AD%E6%96%87%20note/',
    image: 'https://example.com/images/share/blog/nested/%E4%B8%AD%E6%96%87%20note.abc.jpg',
    imageAlt: 'Share card for A < B',
  });
  assert.deepEqual(
    contentPageMeta({ ...options, slug: 'nested/中文 note' }),
    meta,
    'a ?post= address keeps the same head',
  );
  assert.deepEqual(
    contentPageMeta({
      section: 'notes',
      titles,
      description: 'List description',
      origin: 'https://example.com',
    }),
    {
      type: 'website',
      title: 'Blog · Alicia',
      description: 'List description',
      canonical: 'https://example.com/notes/',
    },
  );
  assert.deepEqual(
    contentPageMeta({
      section: 'blog',
      slug: 'gone',
      titles,
      description: 'List description',
      origin: 'https://example.com',
    }),
    {
      type: 'website',
      title: 'Post not found · Alicia Blog',
      description: 'List description',
      canonical: 'https://example.com/blog/',
    },
  );
  assert.equal(
    contentPageMeta({ ...options, origin: undefined }).canonical,
    'https://nymphilia.com/blog/nested/%E4%B8%AD%E6%96%87%20note/',
  );
  assert.equal(
    contentPageMeta({ ...options, summary: { ...summary, share: undefined } }).image,
    undefined,
  );
});

test('explicit index documents resolve like their directory addresses', () => {
  for (const collection of ['blog', 'notes']) {
    assert.equal(
      slugFromLocation(collection, { pathname: `/${collection}/index.html`, search: '' }),
      undefined,
    );
    assert.equal(
      slugFromLocation(collection, {
        pathname: `/${collection}/nested/post/index.html`,
        search: '',
      }),
      'nested/post',
    );
    assert.equal(
      slugFromLocation(collection, {
        pathname: `/${collection}/index.html`,
        search: '?post=legacy',
      }),
      'legacy',
    );
    assert.equal(
      slugFromLocation(collection, { pathname: `/${collection}/literal%2520name/`, search: '' }),
      'literal%20name',
    );
  }
});
