/**
 * HTML from the blog API, made safe to show once more on the page's side: the API already
 * cleans what readers write, and this keeps a slip there from running anything here. Only
 * plain text formatting and links stay; any other element gives way to its text.
 */
const kept = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'DEL',
  'S',
  'CODE',
  'PRE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'A',
  'HR',
]);
// Headings in a comment would outrank the page's own: they read as bold paragraphs.
const asStrong = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
// Gone with everything inside them.
const dropped = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
]);

function safeHref(href: string) {
  try {
    const url = new URL(href, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function copy(from: Node, into: Node, document: Document) {
  for (const node of from.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(node.textContent ?? ''));
      continue;
    }
    if (!(node instanceof Element) || dropped.has(node.tagName)) continue;
    const name = asStrong.has(node.tagName) ? 'P' : node.tagName;
    if (!kept.has(name)) {
      copy(node, into, document);
      continue;
    }
    const element = document.createElement(name);
    if (name === 'A') {
      const url = safeHref(node.getAttribute('href') ?? '');
      if (!url) {
        copy(node, into, document);
        continue;
      }
      element.setAttribute('href', url.href);
      if (url.origin !== window.location.origin) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'nofollow noopener noreferrer');
      }
    }
    if (asStrong.has(node.tagName)) {
      const strong = document.createElement('strong');
      copy(node, strong, document);
      element.appendChild(strong);
    } else copy(node, element, document);
    into.appendChild(element);
  }
}

export function cleanHtml(html: string) {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  copy(parsed.body, out, document);
  return out.innerHTML;
}
