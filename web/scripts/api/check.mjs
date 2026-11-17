import { isDeepStrictEqual, parseArgs } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';
import { fixtureBundle, readPrivate } from '../content/private.mjs';
import { Browser } from './browser.mjs';
import { readContract } from './contract.mjs';

/**
 * Checks a blog API against docs/api/openapi.yaml, feature by feature: those its /api/health
 * names, or those `--only` picks. Each check makes real requests and compares every answer with
 * the contract.
 *
 *   npm run api:check -- http://localhost:8080                 # a backend
 *   npm run api:check -- http://localhost:8080 --only comments  # one feature
 *
 * A real backend signs readers in through the contract tests' sign-in service
 * (auth/scripts/contract-issuer.ts, at --issuer), runs with docs/api/fixtures/private as its
 * private bundle, and starts with an empty database: the checks leave comments and the like
 * behind. The stand-in API (scripts/api/mock.mjs) signs in its own way and needs none of this.
 */

export const features = ['auth', 'private', 'comments', 'stats', 'moments', 'subscriptions'];
const titles = {
  health: '健康检查',
  auth: '登录和会话（R3）',
  private: '私密文章（R4）',
  comments: '评论和留言簿（R5）',
  stats: '阅读量和点赞（R6）',
  moments: 'Moments（R7）',
  subscriptions: '邮件订阅（R8）',
};

class Failure extends Error {}
class Skip extends Error {}
const expect = (condition, message) => {
  if (!condition) throw new Failure(message);
};

/**
 * Runs the checks against `base` and reports each as it ends through `log`. Answers
 * `{ passed, failed, skipped }`, the counts of checks.
 */
export async function checkApi(
  base,
  { only, issuer = 'http://localhost:3999', log = console.log } = {},
) {
  const site = new URL(base);
  const at = (path) => new URL(path, site);
  const contract = readContract();
  const fixtures = readPrivate(fixtureBundle);
  const run = crypto.randomBytes(4).toString('hex');
  const counts = { passed: 0, failed: 0, skipped: 0 };

  /** Checks an answer's status, type and body against what the contract says for them. */
  function answers(answer, operationId, status) {
    expect(
      answer.status === status,
      `应回答 ${status}，实际是 ${answer.status}\n${answer.summary}`,
    );
    const promised = contract.answer(operationId, status);
    if (!promised) throw new Error(`约定里 ${operationId} 没有 ${status}，检查程序写错了`);
    if (promised.types.includes('application/json')) {
      expect(
        /^application\/json\b/i.test(answer.type),
        `Content-Type 应为 application/json，实际是 ${answer.type || '空'}\n${answer.summary}`,
      );
      const problems = promised.validate(answer.json);
      expect(
        !problems.length,
        `回答不符合约定（${operationId} ${status}）：\n${problems.slice(0, 8).join('\n')}\n${answer.summary}`,
      );
    }
    return answer.json;
  }
  const noStore = (answer) =>
    expect(
      /\bno-store\b/i.test(answer.headers.get('cache-control') ?? ''),
      `${answer.url.pathname} 因人而异，应带 Cache-Control: no-store`,
    );
  /** The same address on this site, whether written in full or from the root. */
  const sameAddress = (location, path) =>
    location?.origin === site.origin && `${location.pathname}${location.search}` === path;

  let section;
  async function check(name, body) {
    try {
      await body();
      counts.passed++;
      log(`  ✓ ${name}`);
    } catch (error) {
      if (error instanceof Skip) {
        counts.skipped++;
        log(`  - ${name}：跳过，${error.message}`);
        return;
      }
      counts.failed++;
      const detail = error instanceof Failure ? error.message : (error.stack ?? String(error));
      log(`  ✗ ${name}\n${detail.replace(/^/gm, '      ')}`);
    }
  }
  const begin = (feature) => {
    section = feature;
    log(`\n${feature} · ${titles[feature]}`);
  };

  // Health first: it says what else there is to check.
  begin('health');
  let health;
  try {
    health = answers(await new Browser('health').request(at('/api/health')), 'health', 200);
    counts.passed++;
    log(`  ✓ /api/health 的回答符合约定（版本 ${health.version}）`);
  } catch (error) {
    counts.failed++;
    log(`  ✗ /api/health\n${String(error.message ?? error).replace(/^/gm, '      ')}`);
    if (error instanceof TypeError) log(`      连不上 ${site.origin}：后端在运行吗？`);
    return counts;
  }
  const mock = health.version === 'mock';
  const wanted = only?.length ? only : features;
  const unknown = wanted.filter((feature) => !features.includes(feature));
  if (unknown.length) throw new Error(`没有这些功能：${unknown.join('、')}`);
  const declared = new Set(health.features);
  const chosen = features.filter((feature) => wanted.includes(feature) && declared.has(feature));
  const left = features.filter((feature) => wanted.includes(feature) && !declared.has(feature));
  if (left.length) log(`  （/api/health 没有列出 ${left.join('、')}，这些功能不检查）`);
  if (!chosen.length) return counts;
  if (chosen.some((feature) => feature !== 'auth') && !declared.has('auth')) {
    counts.failed++;
    log(`  ✗ 其他功能都需要登录：先完成 auth`);
    return counts;
  }

  // Readers, and how each one signs in.
  const roles = mock
    ? ['admin', 'family', 'friend', 'guest']
    : ['admin', 'family', 'friend', 'guest', 'leaver'];
  const expectedGroups = { admin: 'admin', family: 'family', friend: 'friends', leaver: 'friends' };
  let provider;
  let people = {};
  let clientId;
  if (!mock) {
    let listing;
    try {
      const response = await fetch(new URL('/contract/readers', issuer));
      if (!response.ok) throw new Error(`${response.status}`);
      listing = await response.json();
      const discovery = await fetch(new URL('/.well-known/openid-configuration', issuer));
      provider = await discovery.json();
    } catch {
      counts.failed++;
      log(
        `  ✗ 找不到测试用登录服务 ${issuer}\n` +
          `      先在另一个终端运行：npm run api:issuer -- --site ${site.origin}\n` +
          `      再用 BLOG_OIDC_ISSUER=${issuer} 启动后端`,
      );
      return counts;
    }
    // The service only sends readers back to the address it was started for.
    if (listing.site !== site.origin) {
      counts.failed++;
      log(
        `  ✗ 测试用登录服务是为 ${listing.site} 启动的，不是 ${site.origin}\n` +
          `      重新启动它：npm run api:issuer -- --site ${site.origin}`,
      );
      return counts;
    }
    people = listing.readers;
    clientId = listing.clientId;
  }
  const browsers = {};
  const browser = (role) => (browsers[role] ??= new Browser(`${role} ${run}`));
  const fresh = (name) => new Browser(`${name} ${run} ${crypto.randomBytes(3).toString('hex')}`);

  /**
   * Signs `reader` in, as a browser does: to the backend's login, through the sign-in service,
   * back to the callback. Answers where it ended up.
   */
  async function signIn(reader, role, next = '/blog/') {
    const start = await reader.request(at(`/api/auth/login?next=${encodeURIComponent(next)}`));
    expect(start.status === 302 && start.location, `登录应跳转（302）\n${start.summary}`);
    let url = start.location;
    if (mock) {
      // The stand-in's own page of readers takes the place of the sign-in service.
      const chosen = new URL(`/api/mock/login/${role}`, site);
      chosen.search = url.search;
      url = chosen;
    } else {
      // The reader's device is already known to the sign-in service, so no page stops them.
      reader.setCookie(issuer, people[role].cookie);
      const issuerOrigin = new URL(issuer).origin;
      expect(url.origin === issuerOrigin, `登录应跳到 ${issuerOrigin}，实际是 ${url.origin}`);
      for (let hops = 0; url.origin === issuerOrigin; hops++) {
        expect(hops < 20, '登录服务里的跳转太多了');
        const step = await reader.request(url);
        expect(
          step.status >= 300 && step.status < 400 && step.location,
          `登录服务没有跳回后端：${step.summary}`,
        );
        url = step.location;
      }
      expect(
        url.origin === site.origin && url.pathname === '/api/auth/callback',
        `登录服务应跳回 ${site.origin}/api/auth/callback，实际是 ${url.origin}${url.pathname}`,
      );
    }
    const back = await reader.request(url, { crossSite: true });
    if (!mock) answers(back, 'callback', 303);
    else expect(back.status === 303, `应回答 303\n${back.summary}`);
    return back.location;
  }
  async function me(reader) {
    const answer = await reader.request(at('/api/me'));
    return answers(answer, 'me', 200).user;
  }
  const signedIn = new Map();
  /** A reader signed in as `role`, once; later checks that need them fail with the reason. */
  function reader(role) {
    if (!signedIn.has(role))
      signedIn.set(
        role,
        (async () => {
          const browserOf = browser(role);
          await signIn(browserOf, role);
          const user = await me(browserOf);
          expect(user, `以 ${role} 登录后，/api/me 仍是 user: null`);
          return { browser: browserOf, user };
        })(),
      );
    return signedIn.get(role).catch((error) => {
      throw new Failure(`需要以 ${role} 登录，但没有成功：${error.message}`);
    });
  }
  const as = async (role) => (await reader(role)).browser;

  // auth
  if (chosen.includes('auth')) {
    begin('auth');
    await check('未登录时 /api/me 回答 user: null，并且不缓存', async () => {
      const answer = await fresh('anonymous').request(at('/api/me'));
      expect(answers(answer, 'me', 200).user === null, '应是 user: null');
      noStore(answer);
    });
    await check('/api/auth/login 带着 PKCE、state 和 nonce 跳到登录服务', async () => {
      const first = await fresh('login').request(at('/api/auth/login?next=%2Fblog%2F'));
      answers(first, 'login', 302);
      expect(first.location, '302 没有 Location');
      if (mock) return;
      const url = first.location;
      expect(
        `${url.origin}${url.pathname}` === provider.authorization_endpoint,
        `应跳到 ${provider.authorization_endpoint}，实际是 ${url.origin}${url.pathname}`,
      );
      const query = url.searchParams;
      const scope = (query.get('scope') ?? '').split(' ');
      const problems = [
        query.get('response_type') !== 'code' && 'response_type 应为 code',
        query.get('client_id') !== clientId && `client_id 应为 ${clientId}`,
        query.get('redirect_uri') !== `${site.origin}/api/auth/callback` &&
          `redirect_uri 应为 ${site.origin}/api/auth/callback`,
        !['openid', 'profile', 'groups'].every((each) => scope.includes(each)) &&
          'scope 应包含 openid profile groups',
        (query.get('state') ?? '').length < 16 && 'state 应是至少 16 个字符的随机值',
        (query.get('nonce') ?? '').length < 16 && 'nonce 应是至少 16 个字符的随机值',
        !/^[\w-]{43}$/.test(query.get('code_challenge') ?? '') &&
          'code_challenge 应是 SHA-256 的 base64url（43 个字符）',
        query.get('code_challenge_method') !== 'S256' && 'code_challenge_method 应为 S256',
      ].filter(Boolean);
      expect(!problems.length, problems.join('\n'));
      const second = await fresh('login').request(at('/api/auth/login?next=%2F'));
      const again = second.location?.searchParams;
      for (const name of ['state', 'nonce', 'code_challenge'])
        expect(again?.get(name) !== query.get(name), `每次登录的 ${name} 都应不同`);
    });
    await check('callback 拒绝不认识的 state', async () => {
      const answer = await fresh('callback').request(
        at('/api/auth/callback?code=made-up&state=made-up-state-0123456789'),
      );
      answers(answer, 'callback', 400);
    });
    for (const role of roles.filter((role) => role !== 'leaver'))
      await check(`以 ${role} 登录后，/api/me 认得出此人和分组`, async () => {
        const { user } = await reader(role);
        if (expectedGroups[role])
          expect(
            user.groups.includes(expectedGroups[role]),
            `groups 应包含 ${expectedGroups[role]}`,
          );
        else expect(!user.groups.length, 'groups 应是空的');
        expect(user.admin === (role === 'admin'), `admin 应为 ${role === 'admin'}`);
        if (!mock) {
          expect(user.id === people[role].id, 'id 应是登录服务给的 sub');
          expect(user.name === people[role].name, `name 应是 ${people[role].name}`);
        }
      });
    await check('登录后跳回原来的页面，别的网站的地址一律换成首页', async () => {
      const back = await signIn(fresh('next'), 'guest', '/notes/');
      expect(sameAddress(back, '/notes/'), `应跳回 /notes/，实际是 ${back?.href}`);
      const elsewhere = await signIn(fresh('next'), 'guest', 'https://evil.example/');
      expect(
        elsewhere?.origin === site.origin,
        `next 是别的网站时应跳回本站，实际去了 ${elsewhere?.href}`,
      );
      const sneaky = await signIn(fresh('next'), 'guest', '//evil.example/');
      expect(
        sneaky?.origin === site.origin,
        `next 是 //evil.example/ 时应跳回本站，实际去了 ${sneaky?.href}`,
      );
    });
    await check('不带本站 Origin 的修改一律回答 403', async () => {
      const guest = await as('guest');
      answers(
        await guest.request(at('/api/auth/logout'), { method: 'POST', origin: null }),
        'logout',
        403,
      );
      answers(
        await guest.request(at('/api/auth/logout'), {
          method: 'POST',
          origin: 'https://evil.example',
        }),
        'logout',
        403,
      );
      expect(await me(guest), '被拒绝的登出不应结束会话');
    });
    await check('登出后 /api/me 回答 user: null', async () => {
      const leaving = fresh('logout');
      await signIn(leaving, 'guest');
      expect(await me(leaving), '登录没有成功');
      const answer = await leaving.request(at('/api/auth/logout'), { method: 'POST' });
      const { redirect } = answers(answer, 'logout', 200);
      if (!mock)
        expect(
          redirect.startsWith(provider.end_session_endpoint),
          `redirect 应指向 ${provider.end_session_endpoint}`,
        );
      expect((await me(leaving)) === null, '登出后应是 user: null');
    });
    await check('backchannel-logout 拒绝无效的 logout_token', async () => {
      const answer = await fresh('backchannel').request(at('/api/auth/backchannel-logout'), {
        form: { logout_token: 'not.a.token' },
        origin: null,
      });
      answers(answer, 'backchannelLogout', 400);
    });
    if (!mock)
      await check('在登录服务停用某人后，后端几秒内结束此人的会话', async () => {
        const leaver = fresh('leaver');
        await signIn(leaver, 'leaver');
        expect(await me(leaver), '登录没有成功');
        const off = await fetch(new URL('/contract/readers/leaver/off', issuer), {
          method: 'POST',
        });
        expect(off.ok, '测试用登录服务没能停用此人');
        for (let tries = 0; tries < 20; tries++) {
          if ((await me(leaver)) === null) return;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Failure('停用 5 秒后，/api/me 仍认得此人：后端要处理 back-channel logout');
      });
  }

  // The made-up documents, as the backend should have them.
  const fixturePage = (level) => fixtures.manifest.pages.find((page) => page.level === level);
  const openPage = fixturePage(null);
  const friendsPage = fixturePage('friends');
  const familyPage = fixturePage('family');
  const fileOf = (level, type) =>
    Object.entries(fixtures.manifest.files).find(
      ([, file]) => file.level === level && file.type.startsWith(type),
    )[0];
  const missingPage = '/blog/contract-missing/';
  const documentOf = (page) => at(`/api/private/document?path=${encodeURIComponent(page.path)}`);

  if (chosen.includes('private')) {
    begin('private');
    const readAs = async (role, page) =>
      (role ? await as(role) : fresh('anonymous')).request(documentOf(page));
    await check('未登录时读私密文章回答 401', async () => {
      answers(await readAs(null, friendsPage), 'privateDocument', 401);
    });
    await check('没有分组的读者读私密文章回答 403', async () => {
      answers(await readAs('guest', friendsPage), 'privateDocument', 403);
    });
    await check('friends 能读 friends 级文章，读不了 family 级的', async () => {
      const answer = await readAs('friend', friendsPage);
      const document = answers(answer, 'privateDocument', 200);
      if (!isDeepStrictEqual(document, JSON.parse(fixtures.documents.get(friendsPage.document))))
        throw new Failure(
          `回答应与私有目录里的 ${friendsPage.document} 完全相同：后端用的是 docs/api/fixtures/private 吗？`,
        );
      noStore(answer);
      answers(await readAs('friend', familyPage), 'privateDocument', 403);
    });
    await check('family 能读两级文章，管理员能读全部', async () => {
      for (const role of ['family', 'admin'])
        for (const page of [friendsPage, familyPage])
          answers(await readAs(role, page), 'privateDocument', 200);
    });
    await check('不存在的文章、公开文章和格式不对的路径', async () => {
      const friend = await as('friend');
      answers(
        await friend.request(at(`/api/private/document?path=${encodeURIComponent(missingPage)}`)),
        'privateDocument',
        404,
      );
      answers(await friend.request(documentOf(openPage)), 'privateDocument', 404);
      answers(
        await friend.request(at('/api/private/document?path=..%2F..%2Fmanifest.json')),
        'privateDocument',
        400,
      );
    });
    await check('文件：未登录 401，级别不够 403，够了原样返回', async () => {
      const friendsPhoto = fileOf('friends', 'image/');
      const familyNote = fileOf('family', 'text/');
      const file = (name) => at(`/api/private/files/${name}`);
      answers(await fresh('anonymous').request(file(friendsPhoto)), 'privateFile', 401);
      answers(await (await as('guest')).request(file(friendsPhoto)), 'privateFile', 403);
      const photo = await (await as('friend')).request(file(friendsPhoto));
      answers(photo, 'privateFile', 200);
      expect(
        photo.type.startsWith('image/png'),
        `Content-Type 应为 image/png，实际是 ${photo.type}`,
      );
      expect(
        photo.bytes.equals(fs.readFileSync(fixtures.files.get(friendsPhoto))),
        '文件内容应与私有目录里的完全相同',
      );
      expect(
        /nosniff/i.test(photo.headers.get('x-content-type-options') ?? ''),
        '文件应带 X-Content-Type-Options: nosniff',
      );
      answers(await (await as('friend')).request(file(familyNote)), 'privateFile', 403);
      const note = await (await as('family')).request(file(familyNote));
      answers(note, 'privateFile', 200);
      expect(
        note.type.startsWith('text/plain'),
        `Content-Type 应为 text/plain，实际是 ${note.type}`,
      );
    });
    await check('不存在的文件回答 404，路径穿越不会成功', async () => {
      const friend = await as('friend');
      answers(
        await friend.request(at('/api/private/files/0000000000000000.png')),
        'privateFile',
        404,
      );
      for (const sneaky of [
        '..%2Fmanifest.json',
        '..%2F..%2Fmanifest.json',
        '%2E%2E%2Fmanifest.json',
      ]) {
        const answer = await friend.request(at(`/api/private/files/${sneaky}`));
        expect(answer.status >= 400 && answer.status < 500, `${answer.summary}：应是 4xx`);
      }
    });
  }

  if (chosen.includes('comments')) {
    begin('comments');
    const list = async (reader, thread) =>
      reader.request(at(`/api/comments?thread=${encodeURIComponent(thread)}`));
    const shown = async (reader, thread) =>
      answers(await list(reader, thread), 'listComments', 200).comments;
    const post = async (reader, body, options) =>
      reader.request(at('/api/comments'), { json: body, ...options });
    let pending;
    let top;
    await check('读取评论：公开文章和留言簿', async () => {
      const anonymous = fresh('anonymous');
      await shown(anonymous, openPage.path);
      await shown(anonymous, 'guestbook');
    });
    await check('未知页面回答 404，没有 thread 回答 400', async () => {
      const anonymous = fresh('anonymous');
      answers(await list(anonymous, missingPage), 'listComments', 404);
      answers(await anonymous.request(at('/api/comments')), 'listComments', 400);
    });
    await check('私密文章的评论只给能读它的人看', async () => {
      answers(await list(fresh('anonymous'), friendsPage.path), 'listComments', 401);
      answers(await list(await as('guest'), friendsPage.path), 'listComments', 403);
      await shown(await as('friend'), friendsPage.path);
    });
    await check('匿名评论等审核，Markdown 变成安全的 HTML', async () => {
      const body = `**Hello** from the contract tests ${run} <script>alert(1)</script> [a link](javascript:alert(1))`;
      const answer = await post(fresh('anonymous'), {
        thread: openPage.path,
        body,
        name: 'Contract visitor',
        email: `visitor-${run}@example.com`,
      });
      const created = answers(answer, 'createComment', 201);
      expect(created.status === 'pending', 'status 应为 pending');
      expect(created.comment.author.signedIn === false, 'author.signedIn 应为 false');
      expect(created.comment.author.name === 'Contract visitor', 'author.name 应是填写的名字');
      expect(
        /<strong>Hello<\/strong>/.test(created.comment.html),
        'html 应把 **Hello** 变成 <strong>',
      );
      expect(
        !/<script|javascript:/i.test(created.comment.html),
        'html 里不能有 <script> 或 javascript: 链接',
      );
      pending = created.comment;
      const listed = await shown(fresh('anonymous'), openPage.path);
      expect(!listed.some((comment) => comment.id === pending.id), '等审核的评论不应显示');
    });
    await check('匿名评论要有名字，正文不能为空或太长', async () => {
      const anonymous = fresh('anonymous');
      answers(
        await post(anonymous, { thread: openPage.path, body: 'No name' }),
        'createComment',
        400,
      );
      answers(
        await post(anonymous, { thread: openPage.path, body: '', name: 'A' }),
        'createComment',
        400,
      );
      answers(
        await post(anonymous, { thread: openPage.path, body: 'x'.repeat(4001), name: 'A' }),
        'createComment',
        400,
      );
    });
    await check('不带本站 Origin 的评论回答 403', async () => {
      const answer = await post(
        fresh('anonymous'),
        { thread: openPage.path, body: 'From elsewhere', name: 'A' },
        { origin: 'https://evil.example' },
      );
      answers(answer, 'createComment', 403);
    });
    await check('机器人填了 website 也得到 201，但什么也没留下', async () => {
      const answer = await post(fresh('bot'), {
        thread: openPage.path,
        body: `Buy now ${run}-bot`,
        name: 'Bot',
        website: 'https://spam.example',
      });
      answers(answer, 'createComment', 201);
    });
    await check('登录读者的评论立刻显示，名字以登录身份为准', async () => {
      const { browser: friend, user } = await reader('friend');
      const answer = await post(friend, {
        thread: openPage.path,
        body: `A friend says hello ${run}`,
        name: 'Impostor',
      });
      const created = answers(answer, 'createComment', 201);
      expect(created.status === 'published', 'status 应为 published');
      expect(created.comment.author.signedIn === true, 'author.signedIn 应为 true');
      expect(
        created.comment.author.name === user.name,
        `author.name 应是 ${user.name}，而不是填写的名字`,
      );
      top = created.comment;
      const listed = await shown(fresh('anonymous'), openPage.path);
      expect(
        listed.some((comment) => comment.id === top.id),
        '评论应立刻显示',
      );
      for (let index = 1; index < listed.length; index++)
        expect(listed[index - 1].createdAt <= listed[index].createdAt, '评论应按时间从早到晚排列');
    });
    await check('回复挂在顶层评论下，回复的回复也是', async () => {
      expect(top, '需要上一项的评论');
      const reply = answers(
        await post(await as('family'), {
          thread: openPage.path,
          body: 'A reply',
          parentId: top.id,
        }),
        'createComment',
        201,
      );
      expect(reply.comment.parentId === top.id, 'parentId 应是被回复的评论');
      const deeper = answers(
        await post(await as('friend'), {
          thread: openPage.path,
          body: 'A reply to the reply',
          parentId: reply.comment.id,
        }),
        'createComment',
        201,
      );
      expect(deeper.comment.parentId === top.id, '回复的回复，parentId 应是顶层评论');
      answers(
        await post(await as('friend'), {
          thread: openPage.path,
          body: 'Lost',
          parentId: 'no-such-comment',
        }),
        'createComment',
        400,
      );
    });
    await check('留言簿', async () => {
      const created = answers(
        await post(await as('family'), { thread: 'guestbook', body: `Hello, guestbook ${run}` }),
        'createComment',
        201,
      );
      const listed = await shown(fresh('anonymous'), 'guestbook');
      expect(
        listed.some((comment) => comment.id === created.comment.id),
        '留言应显示在留言簿里',
      );
    });
    await check('私密文章只收能读它的人的评论', async () => {
      answers(
        await post(await as('guest'), { thread: friendsPage.path, body: 'Hi' }),
        'createComment',
        403,
      );
      answers(
        await post(fresh('anonymous'), { thread: friendsPage.path, body: 'Hi', name: 'A' }),
        'createComment',
        401,
      );
      answers(
        await post(await as('friend'), { thread: friendsPage.path, body: 'For friends' }),
        'createComment',
        201,
      );
    });
    await check('评论审核只给管理员', async () => {
      answers(
        await fresh('anonymous').request(at('/api/admin/comments')),
        'adminListComments',
        401,
      );
      answers(
        await (await as('friend')).request(at('/api/admin/comments')),
        'adminListComments',
        403,
      );
      const all = answers(
        await (await as('admin')).request(at('/api/admin/comments?status=pending')),
        'adminListComments',
        200,
      ).comments;
      expect(
        all.every((comment) => comment.status === 'pending'),
        '?status=pending 应只列出等审核的',
      );
      const mine = all.find((comment) => comment.id === pending?.id);
      expect(mine, '等审核的匿名评论应在列表里');
      expect(mine.email === `visitor-${run}@example.com`, '管理员应看到填写的邮箱');
      const everything = answers(
        await (await as('admin')).request(at('/api/admin/comments')),
        'adminListComments',
        200,
      ).comments;
      expect(
        !everything.some((comment) => comment.html.includes(`${run}-bot`)),
        '机器人的评论不应保存',
      );
    });
    await check('管理员可以发布、隐藏和删除评论', async () => {
      expect(pending && top, '需要前几项的评论');
      const admin = await as('admin');
      const patch = (id, json, who = admin) =>
        who.request(at(`/api/admin/comments/${id}`), { method: 'PATCH', json });
      answers(
        await patch(pending.id, { status: 'published' }, await as('friend')),
        'adminUpdateComment',
        403,
      );
      const published = answers(
        await patch(pending.id, { status: 'published' }),
        'adminUpdateComment',
        200,
      );
      expect(published.status === 'published', 'status 应变为 published');
      let listed = await shown(fresh('anonymous'), openPage.path);
      expect(
        listed.some((comment) => comment.id === pending.id),
        '发布后应显示',
      );
      answers(await patch(pending.id, { status: 'hidden' }), 'adminUpdateComment', 200);
      listed = await shown(fresh('anonymous'), openPage.path);
      expect(!listed.some((comment) => comment.id === pending.id), '隐藏后不应显示');
      answers(await patch(pending.id, { status: 'pending' }), 'adminUpdateComment', 400);
      answers(await patch('no-such-comment', { status: 'hidden' }), 'adminUpdateComment', 404);
      const remove = (id) => admin.request(at(`/api/admin/comments/${id}`), { method: 'DELETE' });
      answers(await remove(top.id), 'adminDeleteComment', 204);
      listed = await shown(fresh('anonymous'), openPage.path);
      expect(
        !listed.some((comment) => comment.id === top.id || comment.parentId === top.id),
        '删除评论时，它的回复也应删除',
      );
      answers(await remove(top.id), 'adminDeleteComment', 404);
    });
  }

  if (chosen.includes('stats')) {
    begin('stats');
    const statsOf = async (reader, paths) =>
      answers(
        await reader.request(
          at(`/api/pages/stats?paths=${paths.map(encodeURIComponent).join(',')}`),
        ),
        'pageStats',
        200,
      );
    await check('读取阅读量和点赞，不认识的页面不回答', async () => {
      const stats = await statsOf(fresh('anonymous'), [openPage.path, missingPage]);
      expect(stats[openPage.path], `应有 ${openPage.path}`);
      expect(!(missingPage in stats), `不应有 ${missingPage}`);
    });
    await check('路径太多或格式不对回答 400', async () => {
      const anonymous = fresh('anonymous');
      const many = Array.from({ length: 51 }, (_, index) => `/blog/page-${index}/`).join(',');
      answers(await anonymous.request(at(`/api/pages/stats?paths=${many}`)), 'pageStats', 400);
      answers(await anonymous.request(at('/api/pages/stats?paths=nonsense')), 'pageStats', 400);
    });
    await check('同一位读者一天只算一次阅读', async () => {
      const visitor = fresh('visitor');
      const view = () => visitor.request(at('/api/pages/view'), { json: { path: openPage.path } });
      const before = (await statsOf(visitor, [openPage.path]))[openPage.path].views;
      answers(await view(), 'countView', 204);
      const once = (await statsOf(visitor, [openPage.path]))[openPage.path].views;
      expect(once === before + 1, `第一次阅读后应是 ${before + 1}，实际是 ${once}`);
      answers(await view(), 'countView', 204);
      const twice = (await statsOf(visitor, [openPage.path]))[openPage.path].views;
      expect(twice === once, `同一天再读一次应仍是 ${once}，实际是 ${twice}`);
    });
    await check('阅读：未知页面 404，不带本站 Origin 403', async () => {
      const visitor = fresh('visitor');
      answers(
        await visitor.request(at('/api/pages/view'), { json: { path: missingPage } }),
        'countView',
        404,
      );
      answers(
        await visitor.request(at('/api/pages/view'), {
          json: { path: openPage.path },
          origin: null,
        }),
        'countView',
        403,
      );
    });
    await check('点赞：每位读者一次，可以取消', async () => {
      const visitor = fresh('visitor');
      const other = fresh('visitor');
      const like = (liked, who = visitor) =>
        who.request(at('/api/pages/like'), { json: { path: openPage.path, liked } });
      const before = (await statsOf(visitor, [openPage.path]))[openPage.path].likes;
      const first = answers(await like(true), 'setLike', 200);
      expect(
        first.liked && first.likes === before + 1,
        `点赞后应是 ${before + 1}，实际是 ${first.likes}`,
      );
      const second = answers(await like(true), 'setLike', 200);
      expect(second.likes === before + 1, '同一位读者再点一次，数量不变');
      expect(
        (await statsOf(visitor, [openPage.path]))[openPage.path].liked,
        '点赞的读者 liked 应为 true',
      );
      expect(
        !(await statsOf(other, [openPage.path]))[openPage.path].liked,
        '别的读者 liked 应为 false',
      );
      const undone = answers(await like(false), 'setLike', 200);
      expect(!undone.liked && undone.likes === before, `取消后应回到 ${before}`);
      answers(
        await visitor.request(at('/api/pages/like'), {
          json: { path: openPage.path, liked: 'yes' },
        }),
        'setLike',
        400,
      );
    });
    await check('登录读者也能点赞', async () => {
      const friend = await as('friend');
      answers(
        await friend.request(at('/api/pages/like'), { json: { path: openPage.path, liked: true } }),
        'setLike',
        200,
      );
      expect((await statsOf(friend, [openPage.path]))[openPage.path].liked, 'liked 应为 true');
      answers(
        await friend.request(at('/api/pages/like'), {
          json: { path: openPage.path, liked: false },
        }),
        'setLike',
        200,
      );
    });
    await check('统计只给管理员', async () => {
      answers(await fresh('anonymous').request(at('/api/admin/stats')), 'adminStats', 401);
      answers(await (await as('friend')).request(at('/api/admin/stats')), 'adminStats', 403);
      const admin = await as('admin');
      const month = answers(await admin.request(at('/api/admin/stats')), 'adminStats', 200);
      expect(month.days.length === 30, `默认应是 30 天，实际是 ${month.days.length}`);
      const week = answers(await admin.request(at('/api/admin/stats?days=7')), 'adminStats', 200);
      expect(week.days.length === 7, `?days=7 应是 7 天，实际是 ${week.days.length}`);
      const page = month.pages.find((each) => each.path === openPage.path);
      expect(page && page.views >= 1, `${openPage.path} 的阅读量应至少是 1`);
      answers(await admin.request(at('/api/admin/stats?days=0')), 'adminStats', 400);
    });
  }

  if (chosen.includes('moments')) {
    begin('moments');
    // A photo as phones take them: on its side, with the place it was taken.
    const sideways = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#9db7d5' },
    })
      .jpeg({ quality: 70 })
      .withExif({
        IFD0: { Make: 'ContractCam' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '31/1 14/1 0/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '121/1 28/1 0/1',
        },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const small = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#d59db7' },
    })
      .png()
      .toBuffer();
    const form = (fields, photos = []) => {
      const data = new FormData();
      for (const [name, value] of Object.entries(fields)) data.append(name, value);
      for (const [bytes, type, name] of photos)
        data.append('photos', new Blob([bytes], { type }), name);
      return data;
    };
    const create = async (reader, fields, photos, options) =>
      reader.request(at('/api/admin/moments'), { multipart: form(fields, photos), ...options });
    const listOf = async (reader, query = '') =>
      answers(await reader.request(at(`/api/moments${query}`)), 'listMoments', 200);
    let open;
    let family;
    await check('发 Moments 只有管理员可以', async () => {
      answers(await create(fresh('anonymous'), { text: 'Hi' }), 'createMoment', 401);
      answers(await create(await as('friend'), { text: 'Hi' }), 'createMoment', 403);
      answers(
        await create(await as('admin'), { text: 'Hi' }, [], { origin: null }),
        'createMoment',
        403,
      );
    });
    await check('照片被摆正、缩小，并去掉位置等信息', async () => {
      const created = answers(
        await create(
          await as('admin'),
          { text: `A moment *for everyone* ${run}`, audience: 'public', alts: 'A sideways sky' },
          [[sideways, 'image/jpeg', 'sky.jpg']],
        ),
        'createMoment',
        201,
      );
      open = created;
      expect(created.audience === 'public', 'audience 应为 public');
      expect(/<em>for everyone<\/em>/.test(created.html), 'html 应来自 Markdown');
      expect(created.photos.length === 1, '应有 1 张照片');
      const [photo] = created.photos;
      expect(photo.alt === 'A sideways sky', 'alt 应是填写的描述');
      expect(photo.height > photo.width, '照片应按 EXIF 方向摆正（竖着的）');
      expect(Math.max(photo.width, photo.height) <= 2048, '长边应不超过 2048');
      expect(
        Math.max(photo.thumbnail.width, photo.thumbnail.height) <= 480,
        '缩略图长边应不超过 480',
      );
      for (const picture of [photo, photo.thumbnail]) {
        const answer = await fresh('anonymous').request(at(picture.url));
        answers(answer, 'momentPhoto', 200);
        const meta = await sharp(answer.bytes).metadata();
        expect(
          meta.width === picture.width && meta.height === picture.height,
          `${picture.url} 的尺寸与回答不符`,
        );
        expect(
          !meta.exif && !meta.xmp && !meta.iptc,
          `${picture.url} 仍带 EXIF 等信息（可能有拍摄地点）`,
        );
        expect(!meta.orientation || meta.orientation === 1, `${picture.url} 仍带方向标记`);
      }
    });
    await check('Moments 按读者可见', async () => {
      family = answers(
        await create(await as('admin'), { text: `For family ${run}`, audience: 'family' }, [
          [small, 'image/png', 'small.png'],
        ]),
        'createMoment',
        201,
      );
      const sees = async (reader) => {
        const { moments } = await listOf(reader);
        return [open, family].map((moment) => moments.some((each) => each.id === moment?.id));
      };
      expect(
        isDeepStrictEqual(await sees(fresh('anonymous')), [true, false]),
        '未登录的读者应只看到公开的',
      );
      expect(
        isDeepStrictEqual(await sees(await as('friend')), [true, false]),
        'friends 不应看到 family 的',
      );
      expect(isDeepStrictEqual(await sees(await as('family')), [true, true]), 'family 应看到两条');
      expect(isDeepStrictEqual(await sees(await as('admin')), [true, true]), '管理员应看到两条');
      const photo = family.photos[0].url;
      answers(await fresh('anonymous').request(at(photo)), 'momentPhoto', 404);
      answers(await (await as('family')).request(at(photo)), 'momentPhoto', 200);
    });
    await check('内容不对时回答 400', async () => {
      const admin = await as('admin');
      answers(await create(admin, { text: '' }), 'createMoment', 400);
      answers(
        await create(
          admin,
          { text: 'Ten' },
          Array.from({ length: 10 }, () => [small, 'image/png', 'p.png']),
        ),
        'createMoment',
        400,
      );
      answers(
        await create(admin, { text: 'Not a photo' }, [
          [Buffer.from('hello'), 'text/plain', 'a.txt'],
        ]),
        'createMoment',
        400,
      );
      answers(
        await create(admin, { text: 'Bad group', audience: 'Not A Group' }),
        'createMoment',
        400,
      );
    });
    await check('修改和删除', async () => {
      expect(family, '需要上一项的 Moment');
      const admin = await as('admin');
      const patch = (json, who = admin) =>
        who.request(at(`/api/admin/moments/${family.id}`), { method: 'PATCH', json });
      answers(await patch({ text: 'Changed' }, await as('family')), 'updateMoment', 403);
      const changed = answers(await patch({ text: 'Changed **now**' }), 'updateMoment', 200);
      expect(
        changed.text === 'Changed **now**' && /<strong>now<\/strong>/.test(changed.html),
        '应改为新文字',
      );
      answers(await patch({}), 'updateMoment', 400);
      const photo = family.photos[0].url;
      const remove = () =>
        admin.request(at(`/api/admin/moments/${family.id}`), { method: 'DELETE' });
      answers(await remove(), 'deleteMoment', 204);
      const { moments } = await listOf(admin);
      expect(!moments.some((moment) => moment.id === family.id), '删除后不应再列出');
      answers(await admin.request(at(photo)), 'momentPhoto', 404);
      answers(await remove(), 'deleteMoment', 404);
    });
    await check('分页：limit 和 next', async () => {
      const admin = await as('admin');
      answers(await admin.request(at('/api/moments?text=x')), 'listMoments', 200);
      await create(admin, { text: `Another moment ${run}` });
      const first = await listOf(admin, '?limit=1');
      expect(first.moments.length === 1 && first.next, 'limit=1 应回答 1 条和 next');
      const second = await listOf(admin, `?limit=1&before=${encodeURIComponent(first.next)}`);
      expect(
        second.moments.length === 1 && second.moments[0].id !== first.moments[0].id,
        '下一页应是另一条',
      );
      expect(second.moments[0].createdAt <= first.moments[0].createdAt, 'Moments 应从新到旧排列');
      answers(await admin.request(at('/api/moments?limit=0')), 'listMoments', 400);
    });
  }

  if (chosen.includes('subscriptions')) {
    begin('subscriptions');
    const email = `contract-${run}@example.com`;
    const subscribe = (body, options) =>
      fresh('subscriber').request(at('/api/subscriptions'), { json: body, ...options });
    await check('订阅要本站 Origin 和像样的邮箱', async () => {
      answers(await subscribe({ email }, { origin: null }), 'subscribe', 403);
      answers(await subscribe({ email: 'not-an-email' }), 'subscribe', 400);
    });
    await check('订阅总是同样的回答', async () => {
      answers(await subscribe({ email }), 'subscribe', 202);
      answers(await subscribe({ email }), 'subscribe', 202);
      answers(
        await subscribe({ email: `bot-${run}@example.com`, website: 'https://spam.example' }),
        'subscribe',
        202,
      );
    });
    await check('确认和退订的链接', async () => {
      const visitor = fresh('subscriber');
      const confirm = await visitor.request(at('/api/subscriptions/confirm?token=made-up'));
      answers(confirm, 'confirmSubscription', 303);
      expect(
        sameAddress(confirm.location, '/?subscription=invalid'),
        `应跳到 /?subscription=invalid，实际是 ${confirm.location?.href}`,
      );
      const leave = await visitor.request(at('/api/subscriptions/unsubscribe?token=made-up'));
      answers(leave, 'unsubscribeLink', 303);
      expect(
        sameAddress(leave.location, '/?unsubscribe=made-up'),
        `应跳到 /?unsubscribe=made-up，实际是 ${leave.location?.href}`,
      );
      const unsubscribe = (json, options) =>
        visitor.request(at('/api/subscriptions/unsubscribe'), { json, ...options });
      const done = answers(await unsubscribe({ token: 'made-up' }), 'unsubscribe', 200);
      expect(done.status === 'unsubscribed', 'status 应为 unsubscribed');
      answers(await unsubscribe({ token: 'made-up' }, { origin: null }), 'unsubscribe', 403);
      answers(await unsubscribe({}), 'unsubscribe', 400);
    });
    let subscriber;
    await check('订阅者名单只给管理员', async () => {
      answers(
        await fresh('anonymous').request(at('/api/admin/subscribers')),
        'listSubscribers',
        401,
      );
      answers(
        await (await as('friend')).request(at('/api/admin/subscribers')),
        'listSubscribers',
        403,
      );
      const list = answers(
        await (await as('admin')).request(at('/api/admin/subscribers')),
        'listSubscribers',
        200,
      );
      subscriber = list.subscribers.find((each) => each.email === email);
      expect(subscriber?.status === 'pending', `${email} 应在名单里，等待确认`);
      expect(
        !list.subscribers.some((each) => each.email === `bot-${run}@example.com`),
        '机器人的地址不应保存',
      );
      expect(
        list.subscribers.filter((each) => each.email === email).length === 1,
        '同一个地址只应有一条',
      );
    });
    await check('管理员可以删除订阅者', async () => {
      expect(subscriber, '需要上一项的订阅者');
      const admin = await as('admin');
      const remove = () =>
        admin.request(at(`/api/admin/subscribers/${subscriber.id}`), { method: 'DELETE' });
      answers(await remove(), 'deleteSubscriber', 204);
      const list = answers(
        await admin.request(at('/api/admin/subscribers')),
        'listSubscribers',
        200,
      );
      expect(!list.subscribers.some((each) => each.id === subscriber.id), '删除后不应再列出');
      answers(await remove(), 'deleteSubscriber', 404);
    });
    await check('群发邮件只有管理员可以，未知页面回答 400', async () => {
      const send = (json, who) => who.request(at('/api/admin/newsletters'), { json });
      const letter = { subject: `News ${run}`, text: 'Something **new**.', path: openPage.path };
      answers(await send(letter, await as('friend')), 'sendNewsletter', 403);
      const admin = await as('admin');
      const sent = answers(await send(letter, admin), 'sendNewsletter', 202);
      const list = answers(
        await admin.request(at('/api/admin/newsletters')),
        'listNewsletters',
        200,
      );
      expect(
        list.newsletters.some((each) => each.id === sent.id),
        '群发的邮件应在列表里',
      );
      answers(await send({ ...letter, path: missingPage }, admin), 'sendNewsletter', 400);
      answers(await send({ ...letter, subject: '' }, admin), 'sendNewsletter', 400);
    });
  }
  return counts;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      only: { type: 'string' },
      issuer: { type: 'string', default: 'http://localhost:3999' },
    },
  });
  const base = positionals[0];
  if (!base) {
    console.error(
      '用法：npm run api:check -- <后端地址> [--only auth,comments] [--issuer <测试用登录服务>]',
    );
    process.exit(2);
  }
  console.log(`检查 ${base}，对照 docs/api/openapi.yaml`);
  const only = values.only
    ?.split(',')
    .map((feature) => feature.trim())
    .filter(Boolean);
  const counts = await checkApi(base, { only, issuer: values.issuer });
  console.log(
    `\n${counts.passed} 项通过，${counts.failed} 项失败${counts.skipped ? `，${counts.skipped} 项跳过` : ''}`,
  );
  process.exit(counts.failed ? 1 : 0);
}
