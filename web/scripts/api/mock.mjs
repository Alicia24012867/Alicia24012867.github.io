import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';
import { fixtureBundle, readPrivate } from '../content/private.mjs';

/**
 * A stand-in for the blog API (server/) that answers as docs/api/openapi.yaml says, so the
 * site's pages can be made and tried before the real backend exists. Everything lives in
 * memory and starts over with the server. Signing in picks one of a few made-up readers at
 * /api/mock/login instead of going to auth.nymphilia.com, and emails are written to the log.
 *
 * The dev server answers /api with it, unless BLOG_API names a backend to pass /api to:
 *
 *   BLOG_API=http://localhost:8080 npm run dev
 *
 * `npm run api:mock` runs it on its own, with only the made-up documents of
 * docs/api/fixtures/private, for the checker (scripts/api/check.mjs).
 */

/** The made-up readers, each with the groups the sign-in service would give them. */
export const mockReaders = {
  admin: { id: 'mock-admin', name: 'Alicia', groups: ['admin'], label: 'The admin' },
  family: { id: 'mock-family', name: 'Mum', groups: ['family'], label: 'Family' },
  friend: { id: 'mock-friend', name: 'Mei', groups: ['friends'], label: 'A friend' },
  guest: { id: 'mock-guest', name: 'Visitor', groups: [], label: 'Someone in no group' },
};

const sessionCookie = 'mock-session';
const visitorCookie = 'mock-visitor';
const pagePattern = /^\/(blog|notes)\/[^?#\s]+\/$/;
const groupPattern = /^[a-z][a-z0-9-]{0,31}$/;
const errorCodes = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
  429: 'too_many_requests',
  500: 'server_error',
};
const day = 86400_000;

class ApiError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}
const fail = (status, message, headers) => {
  throw new ApiError(status, message, headers);
};

const newId = () => crypto.randomBytes(9).toString('base64url');
const iso = (time) => new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Markdown as HTML that can't run anything: what the real backend does with ammonia. */
function markdown(text) {
  return sanitizeHtml(marked.parse(text, { async: false, gfm: true, breaks: true }), {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
    ],
    allowedAttributes: { a: ['href', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow ugc noopener' }) },
  }).trim();
}

function readCookies(req) {
  const cookies = new Map();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return cookies;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, 'The request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  if (!/^application\/json\b/.test(req.headers['content-type'] ?? ''))
    fail(400, 'Send JSON, with Content-Type: application/json.');
  try {
    const value = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
  fail(400, 'The body is not a JSON object.');
}

const text = (value, name, { min = 0, max }) => {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail(400, `${name} must be text.`);
  const length = [...value].length;
  if (length < min) fail(400, min === 1 ? `${name} is empty.` : `${name} is too short.`);
  if (length > max) fail(400, `${name} is longer than ${max} characters.`);
  return value;
};

/** The redirect target a sign-in may come back to: a path on this site, or the home page. */
const safeNext = (next) =>
  typeof next === 'string' && /^\/(?![/\\])/.test(next) && next.length <= 2000 ? next : '/';

/** Two soft skies for the made-up moments, drawn rather than shipped. */
const sky = (top, bottom) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="1600" height="1067" fill="url(#g)"/></svg>`,
  );

/**
 * The stand-in API as Connect middleware: it answers /api and passes everything else on.
 * `readBundle` gives the site's own private bundle (scripts/content/private.mjs); the made-up
 * documents join it. `log` shows the emails it would send.
 */
export function createMockApi({ readBundle, log = (message) => console.log(message) } = {}) {
  let fixtures;
  const readFixtures = () => (fixtures ??= readPrivate(fixtureBundle));
  /** The site's documents and the made-up ones, which share the site's levels when they can. */
  async function bundle() {
    const made = readFixtures();
    if (!readBundle) return made;
    const own = await readBundle();
    if (!made.manifest.levels.every((level) => own.manifest.levels.includes(level))) return own;
    const known = new Set(own.manifest.pages.map((page) => page.path));
    return {
      manifest: {
        ...own.manifest,
        pages: [...own.manifest.pages, ...made.manifest.pages.filter((p) => !known.has(p.path))],
        files: { ...made.manifest.files, ...own.manifest.files },
      },
      documents: new Map([...made.documents, ...own.documents]),
      files: new Map([...made.files, ...own.files]),
    };
  }

  // What the backend's database would hold.
  const comments = [];
  const views = new Map();
  const viewed = new Set();
  const likes = new Map();
  const moments = [];
  const photos = new Map();
  const subscribers = [];
  const newsletters = [];
  const recent = new Map();
  let seeded;

  // Each page starts with a few views and likes, the same ones every time.
  const seedOf = (path) => crypto.createHash('sha256').update(path).digest().readUInt16BE(0);
  const viewsOf = (path) => (seedOf(path) % 240) + 12 + (views.get(path) ?? 0);
  const likesOf = (path) => (seedOf(path) % 17) + (likes.get(path)?.size ?? 0);

  async function keepPhoto(input, alt, { width = 2048, thumbnail = 480 } = {}) {
    // Upright, without metadata (above all the location), at most `width` on its long side.
    const upright = sharp(input, { failOn: 'error' }).rotate();
    const big = await upright
      .clone()
      .resize(width, width, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const small = await upright
      .clone()
      .resize(thumbnail, thumbnail, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer({ resolveWithObject: true });
    const name = newId();
    photos.set(`${name}.webp`, big.data);
    photos.set(`${name}-small.webp`, small.data);
    return {
      url: `/api/moments/photos/${name}.webp`,
      width: big.info.width,
      height: big.info.height,
      alt,
      thumbnail: {
        url: `/api/moments/photos/${name}-small.webp`,
        width: small.info.width,
        height: small.info.height,
      },
    };
  }

  function addMoment(textValue, audience, photoList, createdAt) {
    const moment = {
      id: newId(),
      text: textValue,
      html: markdown(textValue),
      audience,
      photos: photoList,
      createdAt: iso(createdAt),
    };
    moments.unshift(moment);
    moments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return moment;
  }

  function addComment(fields) {
    const comment = {
      id: newId(),
      parentId: null,
      email: null,
      ...fields,
      html: markdown(fields.body),
      createdAt: iso(fields.createdAt ?? Date.now()),
    };
    comments.push(comment);
    return comment;
  }

  /** A few things to look at from the start, as if people had been here. */
  function seed() {
    return (seeded ??= (async () => {
      const now = Date.now();
      const { admin, friend } = mockReaders;
      addComment({
        thread: 'guestbook',
        author: { name: friend.name, signedIn: true },
        userId: friend.id,
        body: 'Found this place through a friend. The night sky on the home page is lovely ✨',
        status: 'published',
        createdAt: now - 6 * day,
      });
      const kind = addComment({
        thread: 'guestbook',
        author: { name: 'A passing reader', signedIn: false },
        body: 'Thank you for writing so *openly*. Saving the post about the sea for later.',
        status: 'published',
        email: 'reader@example.com',
        createdAt: now - 3 * day,
      });
      addComment({
        thread: 'guestbook',
        parentId: kind.id,
        author: { name: admin.name, signedIn: true },
        userId: admin.id,
        body: 'Thank you for stopping by!',
        status: 'published',
        createdAt: now - 2 * day,
      });
      addComment({
        thread: 'guestbook',
        author: { name: 'Lin', signedIn: false },
        body: 'Hello from Shanghai! Is there a way to follow new posts?',
        status: 'pending',
        createdAt: now - 3600_000,
      });
      const evening = await Promise.all([
        keepPhoto(
          await sharp(sky('#f6c9a8', '#7d8fc4')).png().toBuffer(),
          'An evening sky, peach above and blue below',
        ),
        keepPhoto(
          await sharp(sky('#2b3a67', '#e8a0bf')).png().toBuffer(),
          'Dusk over the rooftops',
        ),
      ]);
      addMoment(
        'The clouds this evening looked like someone had pulled cotton candy apart.',
        'public',
        evening,
        now - 2 * day,
      );
      addMoment('Friends: anyone up for the sea next weekend? 🌊', 'friends', [], now - 5 * day);
      addMoment(
        'Wrote something new on the blog, about learning to rest.',
        'public',
        [],
        now - 9 * day,
      );
      subscribers.push(
        {
          id: newId(),
          email: 'reader@example.com',
          status: 'confirmed',
          createdAt: iso(now - 20 * day),
          confirmedAt: iso(now - 20 * day),
          token: newId(),
          leave: newId(),
          sentAt: 0,
        },
        {
          id: newId(),
          email: 'new@example.com',
          status: 'pending',
          createdAt: iso(now - 3600_000),
          confirmedAt: null,
          token: newId(),
          leave: newId(),
          sentAt: now - 3600_000,
        },
      );
      newsletters.push({
        id: newId(),
        subject: 'New post: learning to rest',
        path: null,
        status: 'sent',
        recipients: 1,
        sent: 1,
        failed: 0,
        createdAt: iso(now - 9 * day),
      });
    })());
  }

  /** At most `count` in `seconds` for each `key`, as the real backend limits spam. */
  function limit(key, count, seconds) {
    const now = Date.now();
    const times = (recent.get(key) ?? []).filter((time) => now - time < seconds * 1000);
    if (times.length >= count)
      fail(429, 'Too many in a short time. Try again in a minute.', {
        'Retry-After': String(seconds),
      });
    times.push(now);
    recent.set(key, times);
  }

  // Levels: a reader may open their own level and those below it; admin opens all of them.
  const readerLevel = (user, levels) =>
    !user
      ? -1
      : user.admin
        ? Infinity
        : Math.max(-1, ...user.groups.map((group) => levels.indexOf(group)));
  const canSee = (user, audience, levels) =>
    audience === 'public' ||
    !!user?.admin ||
    !!user?.groups.includes(audience) ||
    (levels.includes(audience) && readerLevel(user, levels) >= levels.indexOf(audience));
  // A locked page is read, and commented on, by readers who reach its level.
  function mayOpen(ctx, page, levels) {
    if (page.level === null) return;
    if (!ctx.user) fail(401, 'Sign in to read this.');
    if (readerLevel(ctx.user, levels) < levels.indexOf(page.level))
      fail(403, 'This is for other readers.');
  }

  function pagePath(value, name = 'path') {
    if (typeof value !== 'string' || value.length > 300 || !pagePattern.test(value))
      fail(400, `${name} is not the path of a document, such as /blog/<slug>/.`);
    return value;
  }
  async function knownPage(path) {
    const { manifest } = await bundle();
    const page = manifest.pages.find((page) => page.path === path);
    if (!page) fail(404, 'No such page.');
    return { page, levels: manifest.levels };
  }
  /** A comment thread: a known page, or the guestbook. */
  async function thread(ctx, value) {
    if (value === 'guestbook') return 'guestbook';
    const { page, levels } = await knownPage(pagePath(value, 'thread'));
    mayOpen(ctx, page, levels);
    return page.path;
  }
  const publicComment = ({ id, thread, parentId, author, html, createdAt }) => ({
    id,
    thread,
    parentId,
    author,
    html,
    createdAt,
  });
  const adminComment = (comment) => ({
    ...publicComment(comment),
    status: comment.status,
    email: comment.email,
  });
  const requireAdmin = (ctx) => {
    if (!ctx.user) fail(401, 'Sign in first.');
    if (!ctx.user.admin) fail(403, 'Only the admin may do this.');
  };
  // Someone not signed in is known again by a cookie of their own.
  const readerKey = (ctx) => {
    if (ctx.user) return `user:${ctx.user.id}`;
    let visitor = ctx.cookies.get(visitorCookie);
    if (!/^[\w-]{12,64}$/.test(visitor ?? '')) {
      visitor = newId() + newId();
      ctx.setCookie(visitorCookie, visitor, 365 * 86400);
    }
    return `visitor:${visitor}`;
  };

  const routes = [
    [
      'GET',
      '/api/health',
      () => ({
        json: {
          ok: true,
          version: 'mock',
          features: ['auth', 'private', 'comments', 'stats', 'moments', 'subscriptions'],
        },
      }),
    ],

    // Signing in: a page of made-up readers stands in for auth.nymphilia.com.
    [
      'GET',
      '/api/auth/login',
      (ctx) => ({
        status: 302,
        headers: {
          Location: `/api/mock/login?next=${encodeURIComponent(safeNext(ctx.url.searchParams.get('next')))}`,
        },
      }),
    ],
    [
      'GET',
      '/api/auth/callback',
      () => fail(400, 'The stand-in API signs in at /api/mock/login, not through an issuer.'),
    ],
    [
      'POST',
      '/api/auth/logout',
      (ctx) => {
        ctx.setCookie(sessionCookie, '', 0);
        return { json: { redirect: `${ctx.origin}/` } };
      },
    ],
    [
      'POST',
      '/api/auth/backchannel-logout',
      () => fail(400, 'The stand-in API trusts no issuer, so no logout token is valid.'),
    ],
    ['GET', '/api/me', (ctx) => ({ json: { user: ctx.user } })],
    [
      'GET',
      '/api/mock/login',
      (ctx) => ({
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: pickerPage(safeNext(ctx.url.searchParams.get('next'))),
      }),
    ],
    [
      'GET',
      /^\/api\/mock\/login\/([a-z]+)$/,
      (ctx) => {
        if (!Object.hasOwn(mockReaders, ctx.params[0])) fail(404, 'No such made-up reader.');
        ctx.setCookie(sessionCookie, ctx.params[0], 30 * 86400);
        return { status: 303, headers: { Location: safeNext(ctx.url.searchParams.get('next')) } };
      },
    ],

    // Locked documents, straight from the private bundle.
    [
      'GET',
      '/api/private/document',
      async (ctx) => {
        const path = pagePath(ctx.url.searchParams.get('path'));
        if (!ctx.user) fail(401, 'Sign in to read this.');
        const { manifest, documents } = await bundle();
        const page = manifest.pages.find((page) => page.path === path);
        if (!page?.document) fail(404, 'No locked document has this path.');
        mayOpen(ctx, page, manifest.levels);
        return {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: documents.get(page.document),
        };
      },
    ],
    [
      'GET',
      /^\/api\/private\/files\/([^/]+)$/,
      async (ctx) => {
        if (!ctx.user) fail(401, 'Sign in to see this.');
        const { manifest, files } = await bundle();
        const name = ctx.params[0];
        const file = Object.hasOwn(manifest.files, name) && manifest.files[name];
        if (!file || !files.has(name)) fail(404, 'No such file.');
        if (readerLevel(ctx.user, manifest.levels) < manifest.levels.indexOf(file.level))
          fail(403, 'This is for other readers.');
        return {
          headers: {
            'Content-Type': file.type,
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
          },
          body: fs.readFileSync(files.get(name)),
        };
      },
    ],

    // Comments and the guestbook.
    [
      'GET',
      '/api/comments',
      async (ctx) => {
        const name = await thread(ctx, ctx.url.searchParams.get('thread'));
        const shown = comments.filter((c) => c.thread === name && c.status === 'published');
        return { json: { comments: shown.map(publicComment) } };
      },
    ],
    [
      'POST',
      '/api/comments',
      async (ctx) => {
        const body = await readJson(ctx.req);
        const name = await thread(ctx, body.thread);
        const commentText = text(body.body, 'body', { min: 1, max: 4000 });
        if (!commentText.trim()) fail(400, 'body is empty.');
        const email = text(body.email, 'email', { max: 200 }).trim() || null;
        const author = ctx.user
          ? { name: ctx.user.name, signedIn: true }
          : { name: text(body.name, 'name', { max: 40 }).trim(), signedIn: false };
        if (!author.name) fail(400, 'name is needed when not signed in.');
        let parentId = null;
        if (body.parentId !== undefined && body.parentId !== null) {
          const parent = comments.find((c) => c.id === body.parentId && c.thread === name);
          if (!parent) fail(400, 'parentId names no comment of this thread.');
          parentId = parent.parentId ?? parent.id;
        }
        limit(`comment:${ctx.user?.id ?? ctx.ip}`, 10, 60);
        const status = ctx.user ? 'published' : 'pending';
        const fields = { thread: name, parentId, author, body: commentText, status, email };
        // A bot filled in the field people never see: it hears of success, and nothing is kept.
        if (body.website) {
          const comment = {
            id: newId(),
            ...fields,
            html: markdown(commentText),
            createdAt: iso(Date.now()),
          };
          return { status: 201, json: { comment: publicComment(comment), status: 'pending' } };
        }
        const comment = addComment({ ...fields, userId: ctx.user?.id });
        return { status: 201, json: { comment: publicComment(comment), status } };
      },
    ],
    [
      'GET',
      '/api/admin/comments',
      (ctx) => {
        requireAdmin(ctx);
        const status = ctx.url.searchParams.get('status');
        if (status && !['published', 'pending', 'hidden'].includes(status))
          fail(400, 'status is published, pending or hidden.');
        const all = comments
          .filter((comment) => !status || comment.status === status)
          .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
        const start = Number(ctx.url.searchParams.get('cursor') ?? 0) || 0;
        const page = all.slice(start, start + 50);
        const next = start + 50 < all.length ? String(start + 50) : null;
        return { json: { comments: page.map(adminComment), next } };
      },
    ],
    [
      'PATCH',
      /^\/api\/admin\/comments\/([^/]+)$/,
      async (ctx) => {
        requireAdmin(ctx);
        const body = await readJson(ctx.req);
        const comment = comments.find((comment) => comment.id === ctx.params[0]);
        if (!comment) fail(404, 'No such comment.');
        if (!['published', 'hidden'].includes(body.status))
          fail(400, 'status is published or hidden.');
        comment.status = body.status;
        return { json: adminComment(comment) };
      },
    ],
    [
      'DELETE',
      /^\/api\/admin\/comments\/([^/]+)$/,
      (ctx) => {
        requireAdmin(ctx);
        const comment = comments.find((comment) => comment.id === ctx.params[0]);
        if (!comment) fail(404, 'No such comment.');
        for (let index = comments.length - 1; index >= 0; index--)
          if (comments[index].id === comment.id || comments[index].parentId === comment.id)
            comments.splice(index, 1);
        return { status: 204 };
      },
    ],

    // Views and likes.
    [
      'GET',
      '/api/pages/stats',
      async (ctx) => {
        const asked = (ctx.url.searchParams.get('paths') ?? '').split(',').filter(Boolean);
        if (!asked.length || asked.length > 50) fail(400, 'Ask for 1 to 50 paths.');
        asked.forEach((path) => pagePath(path, 'paths'));
        const { manifest } = await bundle();
        const known = new Set(manifest.pages.map((page) => page.path));
        const reader = ctx.user
          ? `user:${ctx.user.id}`
          : `visitor:${ctx.cookies.get(visitorCookie)}`;
        return {
          json: Object.fromEntries(
            asked
              .filter((path) => known.has(path))
              .map((path) => [
                path,
                {
                  views: viewsOf(path),
                  likes: likesOf(path),
                  liked: !!likes.get(path)?.has(reader),
                },
              ]),
          ),
        };
      },
    ],
    [
      'POST',
      '/api/pages/view',
      async (ctx) => {
        const body = await readJson(ctx.req);
        const { page } = await knownPage(pagePath(body.path));
        const key = `${new Date().toISOString().slice(0, 10)}|${readerKey(ctx)}|${page.path}`;
        if (!viewed.has(key)) {
          viewed.add(key);
          views.set(page.path, (views.get(page.path) ?? 0) + 1);
        }
        return { status: 204 };
      },
    ],
    [
      'POST',
      '/api/pages/like',
      async (ctx) => {
        const body = await readJson(ctx.req);
        const { page } = await knownPage(pagePath(body.path));
        if (typeof body.liked !== 'boolean') fail(400, 'liked is true or false.');
        const reader = readerKey(ctx);
        const set = likes.get(page.path) ?? new Set();
        likes.set(page.path, set);
        if (body.liked) set.add(reader);
        else set.delete(reader);
        return { json: { likes: likesOf(page.path), liked: body.liked } };
      },
    ],
    [
      'GET',
      '/api/admin/stats',
      async (ctx) => {
        requireAdmin(ctx);
        const days = Number(ctx.url.searchParams.get('days') ?? 30);
        if (!Number.isInteger(days) || days < 1 || days > 366) fail(400, 'days is 1 to 366.');
        const { manifest } = await bundle();
        const today = Date.now();
        const counted = new Map();
        for (const key of viewed) {
          const date = key.slice(0, 10);
          counted.set(date, (counted.get(date) ?? 0) + 1);
        }
        return {
          json: {
            days: Array.from({ length: days }, (_, index) => {
              const date = new Date(today - (days - 1 - index) * day).toISOString().slice(0, 10);
              return { date, views: (seedOf(date) % 60) + 8 + (counted.get(date) ?? 0) };
            }),
            pages: manifest.pages
              .map(({ path }) => ({
                path,
                views: viewsOf(path),
                likes: likesOf(path),
                comments: comments.filter((c) => c.thread === path && c.status === 'published')
                  .length,
              }))
              .sort((a, b) => b.views - a.views),
          },
        };
      },
    ],

    // Moments.
    [
      'GET',
      '/api/moments',
      async (ctx) => {
        const { manifest } = await bundle();
        const size = Number(ctx.url.searchParams.get('limit') ?? 20);
        if (!Number.isInteger(size) || size < 1 || size > 50) fail(400, 'limit is 1 to 50.');
        const before = ctx.url.searchParams.get('before');
        const shown = moments.filter(
          (moment) =>
            canSee(ctx.user, moment.audience, manifest.levels) &&
            (!before || moment.createdAt < before),
        );
        const page = shown.slice(0, size);
        const next = shown.length > size ? page.at(-1).createdAt : null;
        return { json: { moments: page, next } };
      },
    ],
    [
      'GET',
      /^\/api\/moments\/photos\/([^/]+)$/,
      async (ctx) => {
        const { manifest } = await bundle();
        const name = ctx.params[0];
        const owner = moments.find((moment) =>
          moment.photos.some((photo) =>
            [photo.url, photo.thumbnail.url].includes(`/api/moments/photos/${name}`),
          ),
        );
        if (!owner || !photos.has(name) || !canSee(ctx.user, owner.audience, manifest.levels))
          fail(404, 'No such photo.');
        return {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control':
              owner.audience === 'public' ? 'public, max-age=31536000' : 'private, max-age=86400',
          },
          body: photos.get(name),
        };
      },
    ],
    [
      'POST',
      '/api/admin/moments',
      async (ctx) => {
        requireAdmin(ctx);
        const type = ctx.req.headers['content-type'] ?? '';
        if (!type.startsWith('multipart/form-data')) fail(400, 'Send multipart/form-data.');
        const raw = await readBody(ctx.req, 9 * 20 * 1024 * 1024 + 1024 * 1024);
        let form;
        try {
          form = await new Response(raw, { headers: { 'content-type': type } }).formData();
        } catch {
          fail(400, 'The form could not be read.');
        }
        const momentText = text(form.get('text'), 'text', { max: 2000 });
        const audience = text(form.get('audience') || 'public', 'audience', { max: 32 });
        if (!groupPattern.test(audience)) fail(400, 'audience is public or a group.');
        const files = form.getAll('photos').filter((file) => typeof file !== 'string');
        const alts = form.getAll('alts').map((alt) => text(alt, 'alt', { max: 300 }));
        if (files.length > 9) fail(400, 'At most 9 photos.');
        if (!momentText.trim() && !files.length) fail(400, 'Write something or add a photo.');
        const kept = [];
        for (const [index, file] of files.entries()) {
          if (file.size > 20 * 1024 * 1024) fail(413, 'A photo is over 20 MiB.');
          const input = Buffer.from(await file.arrayBuffer());
          const format = await sharp(input)
            .metadata()
            .then((meta) => meta.format)
            .catch(() => undefined);
          if (!['jpeg', 'png', 'webp'].includes(format)) fail(400, 'Photos are JPEG, PNG or WebP.');
          kept.push(await keepPhoto(input, alts[index] ?? ''));
        }
        return { status: 201, json: addMoment(momentText, audience, kept, Date.now()) };
      },
    ],
    [
      'PATCH',
      /^\/api\/admin\/moments\/([^/]+)$/,
      async (ctx) => {
        requireAdmin(ctx);
        const body = await readJson(ctx.req);
        const moment = moments.find((moment) => moment.id === ctx.params[0]);
        if (!moment) fail(404, 'No such moment.');
        const keys = Object.keys(body);
        if (!keys.length || keys.some((key) => !['text', 'audience'].includes(key)))
          fail(400, 'Change text, audience or both.');
        if ('audience' in body) {
          if (typeof body.audience !== 'string' || !groupPattern.test(body.audience))
            fail(400, 'audience is public or a group.');
          moment.audience = body.audience;
        }
        if ('text' in body) {
          moment.text = text(body.text, 'text', { max: 2000 });
          moment.html = markdown(moment.text);
        }
        return { json: moment };
      },
    ],
    [
      'DELETE',
      /^\/api\/admin\/moments\/([^/]+)$/,
      (ctx) => {
        requireAdmin(ctx);
        const index = moments.findIndex((moment) => moment.id === ctx.params[0]);
        if (index < 0) fail(404, 'No such moment.');
        for (const photo of moments[index].photos)
          for (const url of [photo.url, photo.thumbnail.url]) photos.delete(url.split('/').pop());
        moments.splice(index, 1);
        return { status: 204 };
      },
    ],

    // Email about new posts.
    [
      'POST',
      '/api/subscriptions',
      async (ctx) => {
        const body = await readJson(ctx.req);
        const email = text(body.email, 'email', { max: 200 }).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'That is not an email address.');
        limit(`subscribe:${ctx.ip}`, 5, 60);
        const accepted = { status: 202, json: { status: 'confirmation_sent' } };
        if (body.website) return accepted;
        let subscriber = subscribers.find((each) => each.email === email);
        if (!subscriber) {
          subscriber = {
            id: newId(),
            email,
            status: 'pending',
            createdAt: iso(Date.now()),
            confirmedAt: null,
            token: newId(),
            leave: newId(),
            sentAt: 0,
          };
          subscribers.unshift(subscriber);
        }
        // One confirmation an hour at most, and none for an address already confirmed.
        if (subscriber.status === 'pending' && Date.now() - subscriber.sentAt > 3600_000) {
          subscriber.sentAt = Date.now();
          log(
            `模拟邮件 → ${email}：确认订阅 ${ctx.origin}/api/subscriptions/confirm?token=${subscriber.token}`,
          );
        }
        return accepted;
      },
    ],
    [
      'GET',
      '/api/subscriptions/confirm',
      (ctx) => {
        const subscriber = subscribers.find(
          (each) => each.token === ctx.url.searchParams.get('token'),
        );
        if (subscriber && subscriber.status === 'pending') {
          subscriber.status = 'confirmed';
          subscriber.confirmedAt = iso(Date.now());
        }
        return {
          status: 303,
          headers: { Location: `/?subscription=${subscriber ? 'confirmed' : 'invalid'}` },
        };
      },
    ],
    [
      'GET',
      '/api/subscriptions/unsubscribe',
      (ctx) => ({
        status: 303,
        headers: {
          Location: `/?unsubscribe=${encodeURIComponent(ctx.url.searchParams.get('token') ?? '')}`,
        },
      }),
    ],
    [
      'POST',
      '/api/subscriptions/unsubscribe',
      async (ctx) => {
        const body = await readJson(ctx.req);
        const token = text(body.token, 'token', { min: 1, max: 200 });
        const index = subscribers.findIndex((each) => each.leave === token);
        if (index >= 0) subscribers.splice(index, 1);
        return { json: { status: 'unsubscribed' } };
      },
    ],
    [
      'GET',
      '/api/admin/subscribers',
      (ctx) => {
        requireAdmin(ctx);
        const count = (status) => subscribers.filter((each) => each.status === status).length;
        return {
          json: {
            subscribers: subscribers.map(({ id, email, status, createdAt, confirmedAt }) => ({
              id,
              email,
              status,
              createdAt,
              confirmedAt,
            })),
            counts: { pending: count('pending'), confirmed: count('confirmed') },
          },
        };
      },
    ],
    [
      'DELETE',
      /^\/api\/admin\/subscribers\/([^/]+)$/,
      (ctx) => {
        requireAdmin(ctx);
        const index = subscribers.findIndex((each) => each.id === ctx.params[0]);
        if (index < 0) fail(404, 'No such subscriber.');
        subscribers.splice(index, 1);
        return { status: 204 };
      },
    ],
    [
      'GET',
      '/api/admin/newsletters',
      (ctx) => {
        requireAdmin(ctx);
        return { json: { newsletters } };
      },
    ],
    [
      'POST',
      '/api/admin/newsletters',
      async (ctx) => {
        requireAdmin(ctx);
        const body = await readJson(ctx.req);
        const extra = Object.keys(body).filter((key) => !['subject', 'text', 'path'].includes(key));
        if (extra.length) fail(400, `Unknown fields: ${extra.join(', ')}.`);
        const subject = text(body.subject, 'subject', { min: 1, max: 200 });
        text(body.text, 'text', { min: 1, max: 20000 });
        let path = null;
        if (body.path !== undefined && body.path !== null) {
          const { manifest } = await bundle();
          path = pagePath(body.path);
          if (!manifest.pages.some((page) => page.path === path))
            fail(400, 'path names no page of the site.');
        }
        const to = subscribers.filter((each) => each.status === 'confirmed');
        const newsletter = {
          id: newId(),
          subject,
          path,
          status: 'sending',
          recipients: to.length,
          sent: 0,
          failed: 0,
          createdAt: iso(Date.now()),
        };
        newsletters.unshift(newsletter);
        setTimeout(() => {
          newsletter.sent = to.length;
          newsletter.status = 'sent';
          log(`模拟邮件 → ${to.length} 位订阅者：${subject}`);
        }, 300).unref?.();
        return { status: 202, json: newsletter };
      },
    ],
  ];

  return async function mockApi(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();
    const outgoing = [];
    const host = req.headers.host ?? 'localhost';
    const ctx = {
      req,
      url,
      params: [],
      origin: `http://${host}`,
      ip: req.socket.remoteAddress ?? '',
      cookies: readCookies(req),
      setCookie(name, value, maxAge) {
        outgoing.push(`${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
      },
    };
    const role = ctx.cookies.get(sessionCookie);
    const reader = role && Object.hasOwn(mockReaders, role) ? mockReaders[role] : null;
    ctx.user = reader
      ? {
          id: reader.id,
          name: reader.name,
          groups: reader.groups,
          admin: reader.groups.includes('admin'),
        }
      : null;
    let answer;
    try {
      await seed();
      const route = routes.find(([method, path]) => {
        if (method !== req.method) return false;
        if (typeof path === 'string') return path === url.pathname;
        const match = path.exec(url.pathname);
        if (match) ctx.params = match.slice(1).map(decodeURIComponent);
        return !!match;
      });
      if (!route) fail(404, 'No such address in the API.');
      // Changes come from the site's own pages; the issuer's logout notice comes from its server.
      const changes = !['GET', 'HEAD'].includes(req.method);
      if (changes && url.pathname !== '/api/auth/backchannel-logout') {
        let origin;
        try {
          origin = new URL(req.headers.origin ?? '').host;
        } catch {
          origin = undefined;
        }
        if (origin !== host) fail(403, 'Changes need the Origin header of the site itself.');
      }
      answer = (await route[2](ctx)) ?? { status: 204 };
    } catch (error) {
      if (!(error instanceof ApiError)) {
        log(`模拟后端出错：${error.stack ?? error}`);
        error = new ApiError(500, 'Something went wrong in the stand-in API.');
      }
      answer = {
        status: error.status,
        headers: error.headers,
        json: { error: errorCodes[error.status], message: error.message },
      };
    }
    res.statusCode = answer.status ?? 200;
    if (outgoing.length) res.setHeader('Set-Cookie', outgoing);
    res.setHeader('Cache-Control', 'no-store');
    for (const [name, value] of Object.entries(answer.headers ?? {})) res.setHeader(name, value);
    if (answer.json !== undefined) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(answer.json));
    } else res.end(answer.body);
  };
}

/** The page that stands in for auth.nymphilia.com: pick who to be. */
function pickerPage(next) {
  const escape = (value) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const choices = Object.entries(mockReaders)
    .map(
      ([role, reader]) =>
        `<li><a href="/api/mock/login/${role}?next=${escape(encodeURIComponent(next))}"><strong>${escape(reader.name)}</strong><span>${escape(reader.label)}${reader.groups.length ? ` · ${escape(reader.groups.join(', '))}` : ''}</span></a></li>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · stand-in API</title>
<style>
  :root { color-scheme: light dark; --ink: #24283b; --soft: #6b7089; --card: #fff; --line: #d9dcea; --page: #f3f4fa; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e6e8f3; --soft: #a2a6c0; --card: #1f2233; --line: #34384f; --page: #141625; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--page); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(26rem, calc(100% - 2rem)); background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 1.5rem; }
  h1 { font-size: 1.2rem; margin: 0 0 .25rem; }
  p { color: var(--soft); margin: 0 0 1rem; font-size: .9rem; }
  ul { list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: .5rem; }
  a { display: flex; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; border: 1px solid var(--line); border-radius: 10px; color: inherit; text-decoration: none; }
  a:hover, a:focus-visible { border-color: var(--soft); }
  span { color: var(--soft); font-size: .85rem; text-align: right; }
  .back { display: inline; border: 0; padding: 0; color: var(--soft); font-size: .9rem; text-decoration: underline; }
</style>
</head>
<body>
<main>
  <h1>Sign in as…</h1>
  <p>The stand-in API takes the place of auth.nymphilia.com on this dev server.</p>
  <ul>${choices}</ul>
  <a class="back" href="${escape(next)}">Go back without signing in</a>
</main>
</body>
</html>`;
}

/**
 * The dev server's /api: the stand-in API with the site's own private bundle, or, when BLOG_API
 * names a backend such as http://localhost:8080, that backend. Requests keep the dev server's
 * Host, so the backend's BLOG_SITE_ORIGIN is the dev server's address.
 */
export function mockApiPlugin(privateApi) {
  const backend = process.env.BLOG_API;
  return {
    name: 'site-api',
    apply: 'serve',
    config() {
      if (backend) return { server: { proxy: { '/api': { target: backend, xfwd: true } } } };
    },
    configureServer(server) {
      const logger = server.config.logger;
      if (backend) {
        logger.info(`  /api 交给 ${backend}`);
        return;
      }
      server.middlewares.use(
        createMockApi({
          readBundle: () => privateApi.readBundle(),
          log: (message) => logger.info(message, { timestamp: true }),
        }),
      );
    },
  };
}

/** The stand-in API on its own, with the made-up documents alone, at `port` (0 picks one). */
export async function startMockApi({ port = 8787, host = '127.0.0.1', log } = {}) {
  const api = createMockApi({ log });
  const server = http.createServer((req, res) =>
    api(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    }),
  );
  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

if (import.meta.main) {
  const port = Number(process.argv[2] ?? 8787);
  const { url } = await startMockApi({ port });
  console.log(`模拟后端：${url}（只有 docs/api/fixtures/private 里的示例文章）`);
  console.log(`检查它：npm run api:check -- ${url}`);
}
