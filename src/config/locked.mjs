// Locked documents ship sealed: the build (scripts/content/locked.mjs) and the reader
// (src/content/locked) agree here on how sealed files are named and what a page says before
// its password opens it.

/** Built sealed files are named locked-<16 hex digits>.<extension>. */
export const lockedFilePrefix = 'locked-';

const kinds = { blog: 'post', notes: 'note' };

/**
 * An unlisted document's title is sealed too, so its page names only what it is.
 * @param {keyof typeof kinds} collection
 */
export const lockedTitle = (collection) => `A locked ${kinds[collection]}`;

/** @param {keyof typeof kinds} collection */
export const lockedDescription = (collection) =>
  `This ${kinds[collection]} is locked. Enter the password to read it.`;
