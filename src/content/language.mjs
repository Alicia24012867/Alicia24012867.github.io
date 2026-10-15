// Shared by the build and the pages: text is Chinese when Chinese characters outnumber
// the other words in it, so screen readers pick a Chinese voice and browsers typeset it.

/**
 * @param {string} text
 * @returns {'zh-CN' | 'en'}
 */
export function textLanguage(text) {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const words = text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  return han > words ? 'zh-CN' : 'en';
}
