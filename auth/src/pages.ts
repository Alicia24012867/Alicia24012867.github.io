import type { Config } from './config.ts';
import type { Device, SignedIn } from './devices.ts';
import { formatDate, formatTime, html, trusted, type Html, type Page } from './html.ts';
import type { Link } from './links.ts';
import type { Passkey } from './passkeys.ts';
import { isAdmin, type Person } from './people.ts';

/** The pages people see when they sign in, accept an invite or look after their account. */

const eyebrow = (text: string) => html`<p class="eyebrow"><span></span>${text}</p>`;

const passkeyStatus = html`<p class="status" data-passkey-status role="status" aria-live="polite"></p>
<p class="note" data-passkey-missing hidden>This browser can't use passkeys. Open this page in Safari, Chrome, Edge or Firefox.</p>`;

function passkeyButton(
  label: string,
  ceremony: 'register' | 'authenticate',
  endpoint: string,
  options: { next?: string; ghost?: boolean } = {},
) {
  return html`<button class="button ${options.ghost ? 'button-ghost' : 'button-primary'}" type="button" data-passkey="${ceremony}" data-endpoint="${endpoint}"${options.next && html` data-next="${options.next}"`}>${label}</button>`;
}

export function messagePage(
  config: Config,
  title: string,
  message: Html | string,
  action: { href: string; label: string } = {
    href: config.home,
    label: `Back to ${config.rpName}`,
  },
): Page {
  return {
    title,
    body: html`<section class="card">
<h1>${title}</h1>
<p>${message}</p>
<div class="actions"><a class="button button-ghost" href="${action.href}">${action.label}</a></div>
</section>`,
  };
}

/** Sign-in for an application, when this browser isn't signed in yet. */
export function signInPage(app: string, uid: string): Page {
  return {
    title: 'Sign in',
    passkeys: true,
    body: html`<section class="card">
${eyebrow('Sign in')}
<h1>Sign in to ${app}</h1>
<p>Use the passkey you made for nymphilia.com.</p>
<div class="actions">${passkeyButton('Sign in with a passkey', 'authenticate', `/interaction/${uid}/passkey`)}</div>
${passkeyStatus}
<p class="note">Friends and family sign in with the invite link they were sent: open it in this browser. Lost it, or on a new device? Ask for a new one.</p>
<form method="post" action="/interaction/${uid}/abort"><button class="text-button" type="submit">Cancel and go back</button></form>
</section>`,
  };
}

/** Sign-in for the account and admin pages themselves. */
export function loginPage(next: string): Page {
  return {
    title: 'Sign in',
    passkeys: true,
    body: html`<section class="card">
${eyebrow('Sign in')}
<h1>Sign in with your passkey</h1>
<p>${next.startsWith('/admin') ? 'The admin pages ask for your passkey every 12 hours.' : 'Use the passkey you made for nymphilia.com.'}</p>
<div class="actions">${passkeyButton('Sign in with a passkey', 'authenticate', '/login', { next })}</div>
${passkeyStatus}
</section>`,
  };
}

export function invitePage(person: Person, token: string, alreadyHere: boolean): Page {
  if (alreadyHere) {
    return {
      title: 'Invite',
      body: html`<section class="card">
${eyebrow('Invite')}
<h1>Hello, ${person.name}</h1>
<p>You're already signed in on this device, so this link stays unused.</p>
<div class="actions"><a class="button button-primary" href="/account">Your account</a></div>
</section>`,
    };
  }
  return {
    title: 'Invite',
    body: html`<section class="card">
${eyebrow('Invite')}
<h1>Hello, ${person.name}</h1>
<p>This link signs you in to nymphilia.com on this device, for a year.</p>
<form method="post" action="/invite/${token}" class="actions"><button class="button button-primary" type="submit">Sign in on this device</button></form>
<p class="note">The link works once. Open it in the browser you read nymphilia.com in.</p>
</section>`,
  };
}

export function welcomePage(
  config: Config,
  person: Person,
  device: Device,
  hasPasskey: boolean,
): Page {
  return {
    title: 'Signed in',
    passkeys: !hasPasskey,
    body: html`<section class="card">
${eyebrow('Signed in')}
<h1>You're in, ${person.name}</h1>
<p>This device stays signed in until ${formatDate(device.expiresAt)}.</p>
${
  !hasPasskey &&
  html`<div class="offer">
<h2>Add a passkey?</h2>
<p>With a passkey you can sign yourself in again, here or on the other devices your passkeys sync to, without waiting for a new link.</p>
<div class="actions">${passkeyButton('Add a passkey', 'register', '/account/passkeys', { next: '/welcome', ghost: true })}</div>
${passkeyStatus}
</div>`
}
<div class="actions"><a class="button button-primary" href="${config.home}">Continue to ${config.rpName}</a></div>
</section>`,
  };
}

export function setupPage(person: Person, token: string, link: Link): Page {
  return {
    title: 'Create a passkey',
    passkeys: true,
    body: html`<section class="card">
${eyebrow('Passkey')}
<h1>Create your passkey, ${person.name}</h1>
<p>Your passkey signs you in to nymphilia.com${isAdmin(person) && ' and to these admin pages'}. This link works once, until ${formatTime(link.expiresAt)}.</p>
<div class="actions">${passkeyButton('Create a passkey', 'register', `/setup/${token}`)}</div>
${passkeyStatus}
</section>`,
  };
}

export function accountPage(signedIn: SignedIn, passkeys: Passkey[], devices: Device[]): Page {
  const { person, device: here } = signedIn;
  return {
    title: person.name,
    passkeys: true,
    body: html`<section class="card">
${eyebrow('Account')}
<h1>${person.name}</h1>
<p class="meta">${person.groups.length ? `In ${person.groups.join(', ')}` : 'In no groups yet'}</p>

<h2>Passkeys</h2>
${
  passkeys.length
    ? html`<ul class="items">${passkeys.map(
        (passkey) => html`<li>
<div><strong>${passkey.label}</strong><span>Made ${formatDate(passkey.createdAt)}${passkey.usedAt !== null && html`, last used ${formatTime(passkey.usedAt)}`}</span></div>
<form method="post" action="/account/passkeys/${passkey.id}/delete"><button class="text-button" type="submit">Remove</button></form>
</li>`,
      )}</ul>`
    : html`<p class="note">No passkeys yet. With one, you can sign yourself in again without a new link.</p>`
}
<div class="actions">${passkeyButton('Add a passkey', 'register', '/account/passkeys', { next: '/account', ghost: true })}</div>
${passkeyStatus}

<h2>Signed-in devices</h2>
<ul class="items">${devices.map(
      (device) => html`<li>
<div><strong>${device.label}${device.id === here.id && html` <em>this device</em>`}</strong><span>Since ${formatDate(device.createdAt)}, last seen ${formatTime(device.seenAt)}</span></div>
${device.id !== here.id && html`<form method="post" action="/account/devices/${device.id}/delete"><button class="text-button" type="submit">Sign out</button></form>`}
</li>`,
    )}</ul>

<div class="actions">
<form method="post" action="/logout"><button class="button button-ghost" type="submit">Sign out of this device</button></form>
${isAdmin(person) && html`<a class="button button-primary" href="/admin">Admin</a>`}
</div>
</section>`,
  };
}

/** The provider asks before signing someone out; `form` is its own, with a token against forgery. */
export function logoutPage(config: Config, form: string, app: string | undefined): Page {
  return {
    title: 'Sign out',
    body: html`<section class="card">
${eyebrow('Sign out')}
<h1>Sign out of ${config.rpName}?</h1>
<p>${app && `${app} asked to sign you out. `}Signing out also makes this device forget you: to sign in again, you'll need your passkey or a new invite link.</p>
${trusted(form)}
<div class="actions">
<button class="button button-primary" type="submit" form="op.logoutForm" name="logout" value="yes">Sign out</button>
<button class="button button-ghost" type="submit" form="op.logoutForm">Keep this device signed in</button>
</div>
</section>`,
  };
}

/** After signing out: of everything, or of one app while this device stays signed in. */
export function signedOutPage(config: Config, stillSignedIn = false): Page {
  return stillSignedIn
    ? messagePage(
        config,
        'Signed out of the app',
        `This device is still signed in to ${config.rpName}, so apps can sign you in again without asking.`,
        { href: '/account', label: 'Your account' },
      )
    : messagePage(config, "You're signed out", 'This device no longer remembers you.');
}
