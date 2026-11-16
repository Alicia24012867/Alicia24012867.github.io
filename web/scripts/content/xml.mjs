// XML 1.0 excludes control characters and unpaired UTF-16 surrogates.
export const xml = (value) =>
  String(value)
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(
      /[&<>"']/g,
      (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character],
    );
export const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
