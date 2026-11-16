import type { Config } from './config.ts';

/** Markup that is already safe to send, unlike a plain string, which html`` escapes. */
export class Html {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => entities[c]!);

function render(value: unknown): string {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

/** Markup made elsewhere and known to be safe, such as the provider's own logout form. */
export const trusted = (markup: string) => new Html(markup);

/** A template whose values are escaped, unless they are Html themselves. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0]!;
  values.forEach((value, i) => (out += render(value) + strings[i + 1]!));
  return new Html(out);
}

const cloud = html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18a5 5 0 0 1-.8-9.94 7 7 0 0 1 13.12-.68A5.5 5.5 0 0 1 18.5 18Z"/></svg>`;

export type Page = {
  title: string;
  body: Html;
  /** The admin pages are wider than the sign-in cards. */
  wide?: boolean;
  /** Pages with passkey buttons load the WebAuthn helper. */
  passkeys?: boolean;
  /** Pages with copy buttons. */
  copy?: boolean;
};

/** A whole page, in the site's own look. */
export function layout(config: Config, page: Page): string {
  return `<!doctype html>${html`<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5faff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111e33" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<title>${page.title} · ${config.rpName}</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/fonts.css">
<link rel="stylesheet" href="/static/style.css">
${page.passkeys && html`<script src="/static/webauthn.js" defer></script>`}
${(page.passkeys || page.copy) && html`<script src="/static/auth.js" defer></script>`}
</head>
<body>
<header class="site-header">
<div class="header-inner">
<a class="brand" href="${config.home}"><span class="brand-symbol">${cloud}</span><span>Alicia<span class="brand-dot">.</span></span></a>
<span class="brand-note">Accounts</span>
</div>
</header>
<main class="${page.wide ? 'page page-wide' : 'page'}">
${page.body}
</main>
</body>
</html>
`}`;
}

/** Dates as people read them, in the site's time zone. */
export function formatTime(seconds: number | null) {
  if (seconds === null) return '—';
  return new Date(seconds * 1000).toLocaleString('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Shanghai',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
