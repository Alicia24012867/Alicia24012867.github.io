import { deleteApp, findApp, listApps, saveApp, type App } from './apps.ts';
import { now, transaction } from './db.ts';
import { devicesOf, findDevice, removeDevice } from './devices.ts';
import { formatDate, formatTime, html, type Html, type Page } from './html.ts';
import { HttpError, readForm } from './http.ts';
import { createLink, deleteLink, linksOf, openLinks, type LinkKind } from './links.ts';
import { deletePasskey, passkeysOf } from './passkeys.ts';
import {
  createGroup,
  createPerson,
  deleteGroup,
  deletePerson,
  findPerson,
  groupNamePattern,
  isAdmin,
  listGroups,
  listPeople,
  logEvent,
  recentEvents,
  setDisabled,
  updatePerson,
  type Event,
  type Person,
} from './people.ts';
import { Redirect, get, post, requireAdmin, show, type Ctx, type Route } from './routes.ts';
import { forgetPerson } from './sessions.ts';

/**
 * The admin pages: people and their groups, devices, passkeys and links; the groups; the apps
 * that sign people in here; and what happened lately.
 */

const day = 86400;
const linkDays = [1, 7, 30];

const back = (href: string, label: string) => html`<a class="back" href="${href}">← ${label}</a>`;

function eventLine(event: Event, withPerson: boolean) {
  const what: Record<string, string> = {
    app: `signed in to ${event.detail ?? 'an app'}`,
    invite: 'used an invite link',
    passkey: 'signed in with a passkey',
    setup: 'made a passkey with a setup link',
    'passkey-added': 'added a passkey',
    'passkey-removed': 'removed a passkey',
    'device-removed': `signed out ${event.detail ?? 'a device'}`,
    'sign-out': 'signed out',
    'link-created': `was given ${event.detail ?? 'a link'}`,
    'turned-off': 'was turned off',
    'turned-on': 'was turned on',
    changed: 'was changed',
  };
  const action = what[event.kind] ?? event.kind;
  const line = withPerson
    ? `${event.personName ?? 'Someone removed'} ${action}`
    : action.charAt(0).toUpperCase() + action.slice(1);
  return html`<li>
<div><strong>${line}</strong>
<span>${formatTime(event.at)}${event.device && ` · ${event.device}`}${event.ip && ` · ${event.ip}`}${event.actorName && ` · by ${event.actorName}`}</span></div>
</li>`;
}

function adminPage(title: string, body: Html): Page {
  return { title, wide: true, body: html`<div class="admin">${body}</div>` };
}

function overview(ctx: Ctx): Page {
  const { db } = ctx.auth;
  const people = listPeople(db);
  const links = openLinks(db);
  const groups = listGroups(db);
  const apps = listApps(db);
  const lastSeen = db
    .prepare('SELECT person_id, max(seen_at) AS seen FROM devices GROUP BY person_id')
    .all() as {
    person_id: string;
    seen: number;
  }[];
  const seen = new Map(lastSeen.map((row) => [row.person_id, row.seen]));
  return adminPage(
    'Admin',
    html`<h1>Admin</h1>
<section>
<div class="section-head"><h2>People</h2><a class="button button-primary" href="/admin/people/new">Add a person</a></div>
<table>
<thead><tr><th>Name</th><th>Groups</th><th>Last seen</th></tr></thead>
<tbody>${people.map(
      (person) => html`<tr${person.disabledAt !== null && html` class="off"`}>
<td><a href="/admin/people/${person.id}">${person.name}</a>${person.disabledAt !== null && html` <em>off</em>`}</td>
<td>${person.groups.join(', ') || '—'}</td>
<td>${formatTime(seen.get(person.id) ?? null)}</td>
</tr>`,
    )}</tbody>
</table>
</section>

<section>
<h2>Open links</h2>
${
  links.length
    ? html`<ul class="items">${links.map(
        (link) => html`<li>
<div><strong>${link.kind === 'invite' ? 'Invite' : 'Passkey setup'} for ${link.person_name}</strong><span>Until ${formatTime(link.expires_at)}</span></div>
<form method="post" action="/admin/links/${link.id}/delete"><button class="text-button" type="submit">Revoke</button></form>
</li>`,
      )}</ul>`
    : html`<p class="note">None waiting.</p>`
}
</section>

<section id="groups">
<h2>Groups</h2>
<ul class="items">${groups.map(
      (group) => html`<li>
<div><strong>${group.label}</strong><span>${group.name} · ${group.members} ${group.members === 1 ? 'person' : 'people'}</span></div>
${group.name !== 'admin' && html`<form method="post" action="/admin/groups/${group.name}/delete"><button class="text-button" type="submit">Delete</button></form>`}
</li>`,
    )}</ul>
<form method="post" action="/admin/groups" class="inline-form">
<label>Name <input name="name" required pattern="[a-z][a-z0-9\\-]{0,31}" placeholder="neighbours"></label>
<label>Label <input name="label" required maxlength="40" placeholder="Neighbours"></label>
<button class="button button-ghost" type="submit">Add a group</button>
</form>
<p class="note">Apps see the name, in the groups claim.</p>
</section>

<section>
<div class="section-head"><h2>Apps</h2><a class="button button-ghost" href="/admin/apps/new">Register an app</a></div>
${
  apps.length
    ? html`<ul class="items">${apps.map(
        (app) => html`<li>
<div><strong><a href="/admin/apps/${app.id}">${app.name}</a></strong><span>${app.id} · ${app.redirectUris.join(', ')}</span></div>
</li>`,
      )}</ul>`
    : html`<p class="note">No apps yet.</p>`
}
</section>

<section>
<h2>Lately</h2>
<ul class="items events">${recentEvents(db, { limit: 40 }).map((event) => eventLine(event, true))}</ul>
</section>

<div class="actions"><a class="button button-ghost" href="/account">Your account</a></div>`,
  );
}

function groupBoxes(ctx: Ctx, chosen: string[], locked: string[] = []) {
  return html`<fieldset class="choices"><legend>Groups</legend>${listGroups(ctx.auth.db).map(
    (group) =>
      html`<label><input type="checkbox" name="groups" value="${group.name}"${chosen.includes(group.name) && html` checked`}${locked.includes(group.name) && html` disabled`}> ${group.label}</label>`,
  )}</fieldset>${locked.map((name) => html`<input type="hidden" name="groups" value="${name}">`)}`;
}

const expirySelect = html`<label>The link works for <select name="days">${linkDays.map(
  (days) =>
    html`<option value="${days}"${days === 7 && html` selected`}>${days === 1 ? '1 day' : `${days} days`}</option>`,
)}</select></label>`;

function newPersonPage(ctx: Ctx): Page {
  return adminPage(
    'Add a person',
    html`${back('/admin', 'Admin')}
<h1>Add a person</h1>
<form method="post" action="/admin/people" class="stack">
<label>Name <input name="name" required maxlength="60" autocomplete="off"></label>
${groupBoxes(ctx, ['friends'])}
${expirySelect}
<p class="note">You get a link to send them: an invite that signs one browser in for a year, or, for an administrator, a link to make a passkey.</p>
<button class="button button-primary" type="submit">Add and make a link</button>
</form>`,
  );
}

function personPage(ctx: Ctx, person: Person, self: Person): Page {
  const { auth } = ctx;
  const devices = devicesOf(auth, person.id);
  const passkeys = passkeysOf(auth, person.id);
  const links = linksOf(auth.db, person.id).filter(
    (link) => link.usedAt === null && link.expiresAt > now(),
  );
  const isSelf = person.id === self.id;
  return adminPage(
    person.name,
    html`${back('/admin', 'Admin')}
<h1>${person.name}${person.disabledAt !== null && html` <em>off since ${formatDate(person.disabledAt)}</em>`}</h1>
<form method="post" action="/admin/people/${person.id}" class="stack">
<label>Name <input name="name" required maxlength="60" value="${person.name}"></label>
<label>Email <input name="email" type="email" maxlength="120" value="${person.email ?? ''}" placeholder="For mail from apps, later"></label>
${groupBoxes(ctx, person.groups, isSelf ? ['admin'] : [])}
<button class="button button-primary" type="submit">Save</button>
</form>

<section>
<h2>Links</h2>
${
  links.length > 0 &&
  html`<ul class="items">${links.map(
    (link) => html`<li>
<div><strong>${link.kind === 'invite' ? 'Invite' : 'Passkey setup'}</strong><span>Open until ${formatTime(link.expiresAt)}</span></div>
<form method="post" action="/admin/links/${link.id}/delete"><button class="text-button" type="submit">Revoke</button></form>
</li>`,
  )}</ul>`
}
<form method="post" action="/admin/people/${person.id}/link" class="inline-form">
${expirySelect}
${
  isAdmin(person)
    ? html`<input type="hidden" name="kind" value="setup"><button class="button button-ghost" type="submit">New passkey setup link</button>`
    : html`<select name="kind"><option value="invite">Invite: signs one browser in</option><option value="setup">Passkey setup</option></select><button class="button button-ghost" type="submit">New link</button>`
}
</form>
</section>

<section>
<h2>Devices</h2>
${
  devices.length
    ? html`<ul class="items">${devices.map(
        (device) => html`<li>
<div><strong>${device.label}</strong><span>${device.method === 'invite' ? 'Invite' : 'Passkey'} on ${formatDate(device.createdAt)} · last seen ${formatTime(device.seenAt)} · until ${formatDate(device.expiresAt)}</span></div>
<form method="post" action="/admin/devices/${device.id}/delete"><button class="text-button" type="submit">Sign out</button></form>
</li>`,
      )}</ul>`
    : html`<p class="note">Not signed in anywhere.</p>`
}
</section>

<section>
<h2>Passkeys</h2>
${
  passkeys.length
    ? html`<ul class="items">${passkeys.map(
        (passkey) => html`<li>
<div><strong>${passkey.label}</strong><span>Made ${formatDate(passkey.createdAt)}${passkey.usedAt !== null && html` · last used ${formatTime(passkey.usedAt)}`}${passkey.backedUp && ' · synced'}</span></div>
<form method="post" action="/admin/passkeys/${passkey.id}/delete"><button class="text-button" type="submit">Remove</button></form>
</li>`,
      )}</ul>`
    : html`<p class="note">None.</p>`
}
</section>

${
  !isSelf &&
  html`<section>
<h2>Access</h2>
<div class="actions">
${
  person.disabledAt === null
    ? html`<form method="post" action="/admin/people/${person.id}/off"><button class="button button-ghost" type="submit">Turn off</button></form>`
    : html`<form method="post" action="/admin/people/${person.id}/on"><button class="button button-ghost" type="submit">Turn on</button></form>`
}
<form method="post" action="/admin/people/${person.id}/delete"><label class="confirm"><input type="checkbox" name="sure" required> Sure</label><button class="button button-danger" type="submit">Delete</button></form>
</div>
<p class="note">Turning someone off signs them out everywhere at once, and apps hear of it. Turning them on again lets them sign in with a passkey or a new invite.</p>
</section>`
}

<section>
<h2>Lately</h2>
<ul class="items events">${recentEvents(auth.db, { personId: person.id, limit: 30 }).map((event) => eventLine(event, false))}</ul>
</section>`,
  );
}

function linkPage(ctx: Ctx, person: Person, kind: LinkKind, path: string, expiresAt: number): Page {
  const url = new URL(path, ctx.auth.config.issuer).href;
  return {
    ...adminPage(
      kind === 'invite' ? 'Invite link' : 'Passkey setup link',
      html`${back(`/admin/people/${person.id}`, person.name)}
<h1>${kind === 'invite' ? 'Invite' : 'Passkey setup'} link for ${person.name}</h1>
<div class="copy-field"><input readonly value="${url}" aria-label="Link"><button class="button button-ghost" type="button" data-copy>Copy</button></div>
<p>It works once, until ${formatTime(expiresAt)}. ${kind === 'invite' ? 'Opened in a browser, it signs that browser in for a year.' : 'Opened in a browser, it makes a passkey and signs that browser in.'}</p>
<p class="note">This page is the only time the link is shown. Send it directly, such as by WeChat.</p>`,
    ),
    copy: true,
  };
}

function appForm(ctx: Ctx, app: App | undefined): Page {
  const value = (list: string[] | undefined) => (list ?? []).join('\n');
  const action = app ? `/admin/apps/${app.id}` : '/admin/apps';
  return adminPage(
    app ? app.name : 'Register an app',
    html`${back('/admin', 'Admin')}
<h1>${app ? app.name : 'Register an app'}</h1>
<form method="post" action="${action}" class="stack">
${app ? html`<p class="meta">Client id <code>${app.id}</code></p>` : html`<label>Client id <input name="id" required pattern="[a-z][a-z0-9\\-]{1,31}" placeholder="blog"></label>`}
<label>Name <input name="name" required maxlength="60" value="${app?.name ?? ''}" placeholder="nymphilia.com"></label>
<label>Redirect URIs, one a line <textarea name="redirect_uris" rows="3" required>${value(app?.redirectUris)}</textarea></label>
<label>Where to go after signing out, one a line <textarea name="post_logout_redirect_uris" rows="2">${value(app?.postLogoutRedirectUris)}</textarea></label>
<label>Back-channel logout URI <input name="backchannel_logout_uri" type="url" value="${app?.backchannelLogoutUri ?? ''}"></label>
<fieldset class="choices"><legend>Kind</legend>
<label><input type="checkbox" name="confidential"${(app?.confidential ?? true) && html` checked`}> Keeps a client secret (a server)</label>
<label><input type="checkbox" name="refresh"${(app?.refreshTokens ?? true) && html` checked`}> Gets refresh tokens</label>
<label><input type="checkbox" name="native"${app?.native && html` checked`}> Runs on someone's computer, with localhost addresses</label>
</fieldset>
<button class="button button-primary" type="submit">${app ? 'Save' : 'Register'}</button>
</form>
${
  app &&
  html`<section>
<h2>Secret and removal</h2>
<div class="actions">
${app.confidential && html`<form method="post" action="/admin/apps/${app.id}/secret"><button class="button button-ghost" type="submit">New client secret</button></form>`}
<form method="post" action="/admin/apps/${app.id}/delete"><label class="confirm"><input type="checkbox" name="sure" required> Sure</label><button class="button button-danger" type="submit">Delete</button></form>
</div>
<p class="note">A new secret replaces the old one at once.</p>
</section>`
}
<section>
<h2>For the app's settings</h2>
<p class="meta">Issuer <code>${ctx.auth.config.issuer}</code></p>
<p class="note">The app finds everything else at ${ctx.auth.config.issuer}/.well-known/openid-configuration. Ask for the scopes <code>openid profile groups</code>, with PKCE.</p>
</section>`,
  );
}

function secretPage(ctx: Ctx, app: App, secret: string): Page {
  return {
    ...adminPage(
      'Client secret',
      html`${back(`/admin/apps/${app.id}`, app.name)}
<h1>Client secret for ${app.name}</h1>
<p class="meta">Client id <code>${app.id}</code> · issuer <code>${ctx.auth.config.issuer}</code></p>
<div class="copy-field"><input readonly value="${secret}" aria-label="Client secret"><button class="button button-ghost" type="button" data-copy>Copy</button></div>
<p class="note">This page is the only time the secret is shown. Put it in the app's settings, such as /srv/site/api/.env; if it's lost, make a new one.</p>`,
    ),
    copy: true,
  };
}

function lines(value: string | null) {
  return (value ?? '')
    .split(/\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function appFromForm(id: string, form: URLSearchParams) {
  return {
    id,
    name: (form.get('name') ?? '').trim(),
    redirectUris: lines(form.get('redirect_uris')),
    postLogoutRedirectUris: lines(form.get('post_logout_redirect_uris')),
    backchannelLogoutUri: (form.get('backchannel_logout_uri') ?? '').trim() || null,
    refreshTokens: form.has('refresh'),
    native: form.has('native'),
    confidential: form.has('confidential'),
  };
}

function personFor(ctx: Ctx) {
  const person = findPerson(ctx.auth.db, ctx.params[0]!);
  if (!person) throw new HttpError(404, 'There is no such person.');
  return person;
}

function makeLink(ctx: Ctx, person: Person, kind: LinkKind, days: number, actor: Person) {
  if (kind === 'invite' && isAdmin(person)) {
    throw new HttpError(400, 'Administrators sign in with a passkey, so they get a setup link.');
  }
  const seconds = (linkDays.includes(days) ? days : 7) * day;
  const link = createLink(ctx.auth.db, person.id, kind, seconds);
  logEvent(ctx.auth.db, 'link-created', {
    personId: person.id,
    actorId: actor.id,
    detail: kind === 'invite' ? 'an invite link' : 'a passkey setup link',
    req: ctx.req,
  });
  show(ctx, linkPage(ctx, person, kind, link.path, link.expiresAt));
}

function chosenGroups(ctx: Ctx, form: URLSearchParams) {
  const known = new Set(listGroups(ctx.auth.db).map((group) => group.name));
  return form.getAll('groups').filter((group) => known.has(group));
}

export const adminRoutes: Route[] = [
  get(/^\/admin$/, (ctx) => {
    requireAdmin(ctx);
    show(ctx, overview(ctx));
  }),

  get(/^\/admin\/people\/new$/, (ctx) => {
    requireAdmin(ctx);
    show(ctx, newPersonPage(ctx));
  }),
  post(/^\/admin\/people$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const form = await readForm(ctx.req);
    const name = (form.get('name') ?? '').trim();
    if (!name || name.length > 60) throw new HttpError(400, 'A name is 1 to 60 characters.');
    const person = createPerson(ctx.auth.db, name, chosenGroups(ctx, form));
    makeLink(ctx, person, isAdmin(person) ? 'setup' : 'invite', Number(form.get('days')), actor);
  }),
  get(/^\/admin\/people\/([\w-]+)$/, (ctx) => {
    const { person: self } = requireAdmin(ctx);
    show(ctx, personPage(ctx, personFor(ctx), self));
  }),
  post(/^\/admin\/people\/([\w-]+)$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const person = personFor(ctx);
    const form = await readForm(ctx.req);
    const name = (form.get('name') ?? '').trim();
    if (!name || name.length > 60) throw new HttpError(400, 'A name is 1 to 60 characters.');
    const email = (form.get('email') ?? '').trim() || null;
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "That doesn't look like an email address.");
    }
    const groups = chosenGroups(ctx, form);
    // You can't take yourself out of the admin group, and so lock everyone out.
    if (person.id === actor.id && !groups.includes('admin')) groups.push('admin');
    updatePerson(ctx.auth.db, person.id, { name, email, groups });
    logEvent(ctx.auth.db, 'changed', { personId: person.id, actorId: actor.id, req: ctx.req });
    throw new Redirect(`/admin/people/${person.id}`);
  }),
  post(/^\/admin\/people\/([\w-]+)\/link$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const person = personFor(ctx);
    const form = await readForm(ctx.req);
    const kind = form.get('kind') === 'invite' ? 'invite' : 'setup';
    makeLink(ctx, person, kind, Number(form.get('days')), actor);
  }),
  post(/^\/admin\/people\/([\w-]+)\/(off|on)$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const person = personFor(ctx);
    if (person.id === actor.id) throw new HttpError(400, "You can't turn yourself off.");
    const off = ctx.params[1] === 'off';
    setDisabled(ctx.auth.db, person.id, off);
    if (off) {
      // Signed out everywhere: apps hear of it, and every token the person had stops working.
      await forgetPerson(ctx.auth, person.id);
      ctx.auth.db.prepare('DELETE FROM devices WHERE person_id = ?').run(person.id);
    }
    logEvent(ctx.auth.db, off ? 'turned-off' : 'turned-on', {
      personId: person.id,
      actorId: actor.id,
      req: ctx.req,
    });
    throw new Redirect(`/admin/people/${person.id}`);
  }),
  post(/^\/admin\/people\/([\w-]+)\/delete$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const person = personFor(ctx);
    if (person.id === actor.id) throw new HttpError(400, "You can't delete yourself.");
    await forgetPerson(ctx.auth, person.id);
    deletePerson(ctx.auth.db, person.id);
    throw new Redirect('/admin');
  }),

  post(/^\/admin\/devices\/([\w-]+)\/delete$/, async (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const device = findDevice(ctx.auth, ctx.params[0]!);
    if (!device) throw new Redirect('/admin');
    await removeDevice(ctx.auth, device.id);
    logEvent(ctx.auth.db, 'device-removed', {
      personId: device.personId,
      actorId: actor.id,
      detail: device.label,
      req: ctx.req,
    });
    throw new Redirect(`/admin/people/${device.personId}`);
  }),
  post(/^\/admin\/passkeys\/([\w-]+)\/delete$/, (ctx) => {
    const { person: actor } = requireAdmin(ctx);
    const row = ctx.auth.db
      .prepare('SELECT person_id FROM passkeys WHERE id = ?')
      .get(ctx.params[0]!) as { person_id: string } | undefined;
    if (!row) throw new Redirect('/admin');
    deletePasskey(ctx.auth, ctx.params[0]!, row.person_id);
    logEvent(ctx.auth.db, 'passkey-removed', {
      personId: row.person_id,
      actorId: actor.id,
      req: ctx.req,
    });
    throw new Redirect(`/admin/people/${row.person_id}`);
  }),
  post(/^\/admin\/links\/([\w-]+)\/delete$/, (ctx) => {
    requireAdmin(ctx);
    const row = ctx.auth.db
      .prepare('SELECT person_id FROM links WHERE id = ?')
      .get(ctx.params[0]!) as { person_id: string } | undefined;
    deleteLink(ctx.auth.db, ctx.params[0]!);
    throw new Redirect(row ? `/admin/people/${row.person_id}` : '/admin');
  }),

  post(/^\/admin\/groups$/, async (ctx) => {
    requireAdmin(ctx);
    const form = await readForm(ctx.req);
    const name = (form.get('name') ?? '').trim();
    const label = (form.get('label') ?? '').trim();
    if (!groupNamePattern.test(name) || !label) {
      throw new HttpError(400, 'A group needs a name of a-z, 0-9 and -, and a label.');
    }
    try {
      createGroup(ctx.auth.db, name, label);
    } catch {
      throw new HttpError(400, 'There is already a group with that name.');
    }
    throw new Redirect('/admin#groups');
  }),
  post(/^\/admin\/groups\/([\w-]+)\/delete$/, (ctx) => {
    requireAdmin(ctx);
    if (ctx.params[0] === 'admin') throw new HttpError(400, 'The admin group stays.');
    deleteGroup(ctx.auth.db, ctx.params[0]!);
    throw new Redirect('/admin#groups');
  }),

  get(/^\/admin\/apps\/new$/, (ctx) => {
    requireAdmin(ctx);
    show(ctx, appForm(ctx, undefined));
  }),
  post(/^\/admin\/apps$/, async (ctx) => {
    requireAdmin(ctx);
    const form = await readForm(ctx.req);
    const id = (form.get('id') ?? '').trim();
    if (findApp(ctx.auth.db, id)) throw new HttpError(400, 'There is already an app with that id.');
    const app = appFromForm(id, form);
    if (!app.name) throw new HttpError(400, 'An app needs a name.');
    const { secret } = await saveApp(ctx.auth, app);
    if (secret) return show(ctx, secretPage(ctx, findApp(ctx.auth.db, id)!, secret));
    throw new Redirect(`/admin/apps/${id}`);
  }),
  get(/^\/admin\/apps\/([\w-]+)$/, (ctx) => {
    requireAdmin(ctx);
    const app = findApp(ctx.auth.db, ctx.params[0]!);
    if (!app) throw new HttpError(404, 'There is no such app.');
    show(ctx, appForm(ctx, app));
  }),
  post(/^\/admin\/apps\/([\w-]+)$/, async (ctx) => {
    requireAdmin(ctx);
    const existing = findApp(ctx.auth.db, ctx.params[0]!);
    if (!existing) throw new HttpError(404, 'There is no such app.');
    const app = appFromForm(existing.id, await readForm(ctx.req));
    if (!app.name) throw new HttpError(400, 'An app needs a name.');
    const { secret } = await saveApp(ctx.auth, app);
    if (secret) return show(ctx, secretPage(ctx, findApp(ctx.auth.db, app.id)!, secret));
    throw new Redirect(`/admin/apps/${app.id}`);
  }),
  post(/^\/admin\/apps\/([\w-]+)\/secret$/, async (ctx) => {
    requireAdmin(ctx);
    const app = findApp(ctx.auth.db, ctx.params[0]!);
    if (!app?.confidential) throw new HttpError(404, 'There is no such app with a secret.');
    const { secret } = await saveApp(ctx.auth, app, { newSecret: true });
    show(ctx, secretPage(ctx, app, secret!));
  }),
  post(/^\/admin\/apps\/([\w-]+)\/delete$/, (ctx) => {
    requireAdmin(ctx);
    transaction(ctx.auth.db, () => deleteApp(ctx.auth.db, ctx.params[0]!));
    throw new Redirect('/admin');
  }),
];
